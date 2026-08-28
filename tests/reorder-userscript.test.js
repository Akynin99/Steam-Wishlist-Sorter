/**
 * Tests for the userscript that writes the order back into Steam.
 *
 * A userscript is a standalone file loaded by Tampermonkey, so it cannot
 * export anything the way a module does. What it can do is notice that there
 * is no `document` around — which is exactly the case under `node --test` —
 * and hand its pure half over instead of building a panel. That half is
 * everything that decides *what* gets sent and *what an answer means*, and it
 * is the half worth testing: by the time a request has gone out, a wishlist
 * has already been rearranged.
 *
 * Not one test touches the network. `sendReorder` takes the `fetch` it should
 * use, and the stub here records the request and answers with a fixed reply —
 * which is also how the assertions about the address and the body are made at
 * all.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { OTHER_STEAM_ID, appIdAt, currentLayout, oldLayout } from './helpers/wishlist-page.js';

await import('../userscripts/steam-wishlist-import-order.user.js');

const {
  APP_SIGNATURE,
  ORDER_KIND,
  ORDER_VERSION,
  buildBackupOrder,
  buildPageOrder,
  buildReorderBody,
  buildTargetOrder,
  collectOwnerCandidates,
  compareOrders,
  describeAccount,
  describeNetworkFailure,
  findRows,
  findScroller,
  judgePageRead,
  parseDraggableId,
  parseOrderFile,
  readAppId,
  readReorderAnswer,
  readRowIndex,
  readTitle,
  resolveReorderTarget,
  sendReorder,
  sessionIdFromText,
} = globalThis.__swsReorderTestApi;

/**
 * Everything the script would read out of the page as it stands right now.
 *
 * @param {object} page
 * @param {object[]} [into] Rows read on the earlier steps, to be added to.
 * @returns {Array<{ appId: number, index: number|null, offset: number, seq: number }>}
 */
function harvest(page, into = []) {
  const { scroller } = findScroller(page.document);
  const entries = [...into];
  const known = new Map(entries.map((entry) => [entry.appId, entry]));

  for (const row of findRows(page.document).rows) {
    const appId = readAppId(row);
    if (appId === null) continue;
    const rect = row.getBoundingClientRect();
    const offset = scroller ? rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop : rect.top;
    const index = readRowIndex(row);
    const seen = known.get(appId);
    if (seen) {
      seen.offset = offset;
      if (index !== null) seen.index = index;
      continue;
    }
    const entry = { appId, index, offset, seq: entries.length };
    entries.push(entry);
    known.set(appId, entry);
  }

  return entries;
}

const STEAM_ID = '76561198000000001';
const REORDER_URL = `https://store.steampowered.com/wishlist/profiles/${STEAM_ID}/reorder/`;

/**
 * An order file the way `src/export.js` writes it.
 *
 * @param {Array<{ appId: number, title?: string }>} items
 * @param {Array<{ appId: number, title?: string }>} [remove]
 * @returns {string}
 */
function orderFile(items, remove = []) {
  return JSON.stringify({
    app: APP_SIGNATURE,
    kind: ORDER_KIND,
    version: ORDER_VERSION,
    exportedAt: '2026-08-29T10:00:00.000Z',
    summary: { total: items.length, resolved: items.length, fallback: 0, manual: 0, removed: remove.length },
    items: items.map((item, index) => ({
      position: index + 1,
      appId: item.appId,
      title: item.title ?? `Game ${item.appId}`,
      category: 'must',
      categoryLabel: 'Must have',
      positionInCategory: index + 1,
      origin: 'comparisons',
      tiedWithPrevious: false,
    })),
    remove: remove.map((item) => ({ appId: item.appId, title: item.title ?? `Game ${item.appId}` })),
  });
}

/**
 * A `fetch` that never leaves the process: it records what it was asked for
 * and answers with what the test told it to.
 *
 * @param {{ status?: number, body?: string, contentType?: string, throws?: Error }} reply
 */
function stubFetch(reply) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (reply.throws) throw reply.throws;
    return {
      status: reply.status ?? 200,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? (reply.contentType ?? '') : null) },
      text: async () => reply.body ?? '',
    };
  };
  return { impl, calls };
}

// ============================================================================
// The list that will be sent
// ============================================================================

test('the order of the file comes first, in the order of the file', () => {
  const target = buildTargetOrder({
    items: [{ appId: 30 }, { appId: 10 }, { appId: 20 }],
    remove: [],
    pageAppIds: [10, 20, 30],
  });

  assert.deepEqual(target.appIds, [30, 10, 20]);
  assert.deepEqual(target.missing, []);
  assert.deepEqual(target.extra, []);
  assert.deepEqual(target.removals, []);
});

test('entries of the page that the file does not know are appended, keeping their order', () => {
  const target = buildTargetOrder({
    items: [{ appId: 30 }, { appId: 10 }],
    remove: [],
    pageAppIds: [77, 10, 88, 30, 99],
  });

  assert.deepEqual(target.appIds, [30, 10, 77, 88, 99]);
  assert.deepEqual(target.extra, [77, 88, 99]);
});

test('entries marked for removal go last and are handed back as a list', () => {
  const target = buildTargetOrder({
    items: [{ appId: 30 }, { appId: 10 }],
    remove: [{ appId: 55 }, { appId: 66 }],
    pageAppIds: [55, 10, 77, 30, 66],
  });

  assert.deepEqual(target.appIds, [30, 10, 77, 55, 66]);
  assert.deepEqual(target.removals, [55, 66]);
  assert.deepEqual(target.extra, [77]);
});

test('what the request carries is exactly the app ids of the page, no more and no fewer', () => {
  const pageAppIds = [5, 4, 3, 2, 1];
  const target = buildTargetOrder({
    items: [{ appId: 1 }, { appId: 2 }, { appId: 999 }],
    remove: [{ appId: 5 }],
    pageAppIds,
  });

  assert.equal(target.appIds.length, pageAppIds.length);
  assert.deepEqual([...target.appIds].sort((a, b) => a - b), [...pageAppIds].sort((a, b) => a - b));
  assert.equal(new Set(target.appIds).size, target.appIds.length);
});

test('an entry of the file that is not on the page is reported and skipped', () => {
  const target = buildTargetOrder({
    items: [{ appId: 10, title: 'Bought last week' }, { appId: 20 }],
    remove: [],
    pageAppIds: [20],
  });

  assert.deepEqual(target.appIds, [20]);
  assert.equal(target.missing.length, 1);
  assert.equal(target.missing[0].title, 'Bought last week');
});

test('an app id listed twice in the file is sent once, at its first place', () => {
  const target = buildTargetOrder({
    items: [{ appId: 10 }, { appId: 20 }, { appId: 10 }],
    remove: [],
    pageAppIds: [10, 20],
  });

  assert.deepEqual(target.appIds, [10, 20]);
});

test('an entry that is both ordered and marked for removal keeps its ordered place', () => {
  const target = buildTargetOrder({
    items: [{ appId: 10 }, { appId: 20 }],
    remove: [{ appId: 20 }],
    pageAppIds: [10, 20],
  });

  assert.deepEqual(target.appIds, [10, 20]);
  assert.deepEqual(target.removals, []);
});

test('an empty page yields an empty request rather than an invented one', () => {
  const target = buildTargetOrder({ items: [{ appId: 10 }], remove: [], pageAppIds: [] });
  assert.deepEqual(target.appIds, []);
  assert.equal(target.missing.length, 1);
});

// ============================================================================
// The file
// ============================================================================

test('a file of the right kind is read, in the order of the positions', () => {
  const order = parseOrderFile(orderFile([{ appId: 30 }, { appId: 10 }, { appId: 20 }]));

  assert.deepEqual(order.items.map((item) => item.appId), [30, 10, 20]);
  assert.equal(order.versionWarning, null);
  assert.deepEqual(order.duplicates, []);
});

test('a state dump is refused, and the message says which file is needed', () => {
  const state = JSON.stringify({ app: APP_SIGNATURE, version: 1, session: { answers: [] } });
  assert.throws(() => parseOrderFile(state), /not an order file/i);
});

test('a file of another kind is refused by its kind', () => {
  const wrong = JSON.stringify({ app: APP_SIGNATURE, kind: 'wishlist-export', version: 1, items: [{ appId: 10 }] });
  assert.throws(() => parseOrderFile(wrong), /wishlist-order/);
});

test('a file without the signature of the application is refused', () => {
  const unsigned = JSON.stringify({ app: 'something-else', kind: ORDER_KIND, version: 1, items: [{ appId: 10 }] });
  assert.throws(() => parseOrderFile(unsigned), /signature/i);
});

test('text that is not JSON at all is refused', () => {
  assert.throws(() => parseOrderFile('<html>nope</html>'), /not JSON/i);
});

test('a file of an unknown version is read, with a warning', () => {
  const future = JSON.parse(orderFile([{ appId: 10 }]));
  future.version = 99;
  const order = parseOrderFile(JSON.stringify(future));

  assert.equal(order.items.length, 1);
  assert.match(order.versionWarning, /version 99/);
});

test('duplicates inside the file are named, and only the first place is kept', () => {
  const order = parseOrderFile(orderFile([{ appId: 10 }, { appId: 20 }, { appId: 10 }]));

  assert.deepEqual(order.items.map((item) => item.appId), [10, 20]);
  assert.deepEqual(order.duplicates, [10]);
});

// ============================================================================
// The backup
// ============================================================================

test('the backup is a file this very script reads back', () => {
  const rows = [
    { appId: 10, title: 'First' },
    { appId: 20, title: '' },
  ];
  const backup = buildBackupOrder(rows, '2026-08-29T12:00:00.000Z');
  const read = parseOrderFile(JSON.stringify(backup));

  assert.equal(backup.kind, ORDER_KIND);
  assert.deepEqual(read.items.map((item) => item.appId), [10, 20]);
  assert.equal(read.items[1].title, 'App 20');
  assert.deepEqual(read.remove, []);
});

test('the backup restores the order of the page it was taken from', () => {
  const pageAppIds = [7, 3, 9];
  const backup = buildBackupOrder(
    pageAppIds.map((appId) => ({ appId, title: `Game ${appId}` })),
    '2026-08-29T12:00:00.000Z',
  );
  const read = parseOrderFile(JSON.stringify(backup));
  const target = buildTargetOrder({ items: read.items, remove: read.remove, pageAppIds: [9, 7, 3] });

  assert.deepEqual(target.appIds, pageAppIds);
});

// ============================================================================
// The address and the body of the request
// ============================================================================

test('the address is built out of the steam id of the path', () => {
  const resolved = resolveReorderTarget({ pathname: `/wishlist/profiles/${STEAM_ID}/`, loggedInSteamId: STEAM_ID });
  assert.equal(resolved.url, REORDER_URL);
});

test('a wishlist opened by its vanity name uses the steam id of the signed-in user', () => {
  const resolved = resolveReorderTarget({ pathname: '/wishlist/id/someone/', loggedInSteamId: STEAM_ID });
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.vanity, 'someone');
});

test('the vanity address is answered with a note, because it says nothing about whose wishlist it is', () => {
  const resolved = resolveReorderTarget({ pathname: '/wishlist/id/someone/', loggedInSteamId: STEAM_ID });

  assert.match(resolved.note, /custom url/i);
  assert.match(resolved.note, new RegExp(STEAM_ID));
});

test('the numeric address needs no such note: there the two ids are compared', () => {
  const resolved = resolveReorderTarget({ pathname: `/wishlist/profiles/${STEAM_ID}/`, loggedInSteamId: STEAM_ID });

  assert.equal(resolved.note, null);
  assert.equal(resolved.vanity, null);
});

test('the wishlist of another account is refused before anything is sent', () => {
  const resolved = resolveReorderTarget({
    pathname: '/wishlist/profiles/76561198000000002/',
    loggedInSteamId: STEAM_ID,
  });
  assert.equal(resolved.error, 'not-yours');
});

test('an address without a steam id and a page that names nobody give up with a message', () => {
  const resolved = resolveReorderTarget({ pathname: '/wishlist/id/someone/', loggedInSteamId: null });
  assert.equal(resolved.error, 'unknown-owner');
  assert.match(resolved.message, /Steam ID/);
});

test('nothing but 17 digits ever reaches the address', () => {
  for (const junk of ['76561198000000001/../evil', 'abc', '765611980000000011111', '', null]) {
    const resolved = resolveReorderTarget({ pathname: '/wishlist/id/someone/', loggedInSteamId: junk });
    assert.equal(resolved.error, 'unknown-owner', `accepted ${JSON.stringify(junk)}`);
  }
});

// ============================================================================
// Whose wishlist is this
// ============================================================================
//
// Steam brings the address to `/wishlist/id/<custom url>/` and redirects the
// numeric form back to it, so the id has to be found on the page. Every test
// here builds a page carrying exactly one of the sources — that is the only way
// to know which one answered — and then the two cases that matter more than any
// single source: a page that names nobody, and a page that names two.

/** The page as Steam serves it, opened under a custom url. */
function pageOf(owner) {
  return currentLayout({ indexes: [0, 1, 2], owner }).document;
}

/**
 * @param {object|null} owner What the page states about the account.
 * @param {{ pathname?: string, globals?: object[], manualSteamId?: string|null }} [options]
 */
function resolveOn(owner, { pathname = '/wishlist/id/someone/', globals = [], manualSteamId = null } = {}) {
  const collected = collectOwnerCandidates({ pathname, document: owner === null ? null : pageOf(owner), globals });
  return { collected, resolved: resolveReorderTarget({ pathname, candidates: collected.candidates, manualSteamId }) };
}

test('a custom url page is read for the account: the numeric link to this same wishlist', () => {
  const { collected, resolved } = resolveOn({ profileLinks: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'profile-link', steamId: STEAM_ID }]);
  assert.equal(collected.fromPath, null);
  assert.equal(collected.vanity, 'someone');
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'profile-link');
});

test('a custom url page is read for the account: the address inside an inline script', () => {
  const { collected, resolved } = resolveOn({ scriptAddresses: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'inline-script', steamId: STEAM_ID }]);
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'inline-script');
});

test('a custom url page is read for the account: g_steamID of the old layout', () => {
  const { collected, resolved } = resolveOn({ gSteamID: STEAM_ID });

  assert.deepEqual(collected.candidates, [{ source: 'g_steamID', steamId: STEAM_ID }]);
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'g_steamID');
});

test('a custom url page is read for the account: g_steamID of the window, and of unsafeWindow', () => {
  for (const globals of [[{ g_steamID: STEAM_ID }], [null, { g_steamID: STEAM_ID }]]) {
    const { resolved } = resolveOn({}, { globals });
    assert.equal(resolved.url, REORDER_URL);
    assert.equal(resolved.source, 'g_steamID');
  }
});

test('a custom url page is read for the account: a data-steamid attribute', () => {
  const { collected, resolved } = resolveOn({ dataSteamIds: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'data-steamid', steamId: STEAM_ID }]);
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'data-steamid');
});

test('the page Steam serves — a custom url, a numeric link and one script — resolves to one account', () => {
  const { collected, resolved } = resolveOn({ profileLinks: [STEAM_ID], scriptAddresses: [STEAM_ID] });

  assert.equal(collected.candidates.length, 2);
  assert.equal(resolved.url, REORDER_URL);
  assert.match(resolved.note, /custom url/i);
  assert.match(resolved.note, new RegExp(STEAM_ID));
});

test('a page that states nothing about the account gives up and points at the field', () => {
  const { collected, resolved } = resolveOn({});

  assert.deepEqual(collected.candidates, []);
  assert.equal(resolved.error, 'unknown-owner');
  assert.match(resolved.message, /Steam ID/);
  assert.match(resolved.message, /type your own 17 digits/i);
});

test('two different accounts on one page are a refusal, not a choice', () => {
  const { resolved } = resolveOn({ gSteamID: STEAM_ID, profileLinks: [OTHER_STEAM_ID] });

  assert.equal(resolved.error, 'several-accounts');
  assert.deepEqual(resolved.accounts, [STEAM_ID, OTHER_STEAM_ID]);
  assert.equal(resolved.url, undefined);
  assert.match(resolved.message, /more than one account/i);
  assert.match(resolved.message, new RegExp(STEAM_ID));
  assert.match(resolved.message, new RegExp(OTHER_STEAM_ID));
});

test('a refusal survives the account being named first by the source that would have won', () => {
  // The order of the sources is no help here: whichever of them is consulted
  // first, the other one says something else, and the write must not go out.
  const { resolved } = resolveOn({ profileLinks: [OTHER_STEAM_ID, STEAM_ID] });
  assert.equal(resolved.error, 'several-accounts');
});

test('the same account stated by every source at once is one account, not four', () => {
  const { collected, resolved } = resolveOn(
    { gSteamID: STEAM_ID, profileLinks: [STEAM_ID], scriptAddresses: [STEAM_ID], dataSteamIds: [STEAM_ID] },
    { globals: [{ g_steamID: STEAM_ID }] },
  );

  assert.equal(collected.candidates.length, 5);
  assert.equal(resolved.url, REORDER_URL);
});

test('nothing of the wrong shape is taken for an account id', () => {
  const { collected, resolved } = resolveOn({ junk: true }, { globals: [{ g_steamID: '../../evil' }] });

  assert.deepEqual(collected.candidates, []);
  assert.equal(resolved.error, 'unknown-owner');
});

test('junk on the page does not turn one good source into a disagreement', () => {
  const { resolved } = resolveOn({ junk: true, profileLinks: [STEAM_ID] });
  assert.equal(resolved.url, REORDER_URL);
});

test('a numeric address wins over everything the page says', () => {
  const pathname = `/wishlist/profiles/${STEAM_ID}/`;
  const { collected, resolved } = resolveOn(
    { profileLinks: [OTHER_STEAM_ID], scriptAddresses: [OTHER_STEAM_ID], dataSteamIds: [OTHER_STEAM_ID] },
    { pathname },
  );

  assert.equal(collected.fromPath, STEAM_ID);
  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'path');
  assert.equal(resolved.note, null);
});

test('a numeric address of somebody else is still refused against the signed-in account', () => {
  // The one thing the page can say that outranks the address: `g_steamID` names
  // *you*, and a wishlist that is not yours is refused here rather than by Steam.
  const { resolved } = resolveOn({ gSteamID: OTHER_STEAM_ID }, { pathname: `/wishlist/profiles/${STEAM_ID}/` });
  assert.equal(resolved.error, 'not-yours');
});

test('an id typed in by hand is the last way out, and only when the page named none', () => {
  const { resolved } = resolveOn({}, { manualSteamId: STEAM_ID });

  assert.equal(resolved.url, REORDER_URL);
  assert.equal(resolved.source, 'manual');
  assert.match(resolved.note, /you typed in yourself/i);
});

test('a typed id of the wrong shape is refused the same as any other', () => {
  for (const junk of ['7656119800000000', 'abcdefghijklmnopq', '765611980000000012', ' ', null]) {
    const { resolved } = resolveOn({}, { manualSteamId: junk });
    assert.equal(resolved.error, 'unknown-owner', `accepted ${JSON.stringify(junk)}`);
  }
});

test('a typed id does not override an account the page states', () => {
  const { resolved } = resolveOn({ profileLinks: [STEAM_ID] }, { manualSteamId: OTHER_STEAM_ID });

  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'profile-link');
});

test('a typed id does not settle a page that names two accounts', () => {
  const { resolved } = resolveOn({ gSteamID: STEAM_ID, profileLinks: [OTHER_STEAM_ID] }, { manualSteamId: STEAM_ID });
  assert.equal(resolved.error, 'several-accounts');
});

test('the account the write would go to is named: the id, the nick and where it came from', () => {
  const { resolved } = resolveOn({ profileLinks: [STEAM_ID] });
  const said = describeAccount(resolved);

  assert.match(said, new RegExp(STEAM_ID));
  assert.match(said, /someone/);
  assert.match(said, /link on the page/i);
});

test('a page opened by its numeric address is named without a nick it does not have', () => {
  const { resolved } = resolveOn({}, { pathname: `/wishlist/profiles/${STEAM_ID}/` });
  const said = describeAccount(resolved);

  assert.match(said, new RegExp(STEAM_ID));
  assert.doesNotMatch(said, /\(/);
});

test('collecting reads a page with no document at all without throwing', () => {
  const collected = collectOwnerCandidates();
  assert.deepEqual(collected, { fromPath: null, vanity: null, candidates: [] });
});

test('the body carries the session id and the app ids in order', () => {
  const body = new URLSearchParams(buildReorderBody({ sessionId: 'abcdef0123456789', appIds: [30, 10, 20] }));

  assert.equal(body.get('sessionid'), 'abcdef0123456789');
  assert.deepEqual(body.getAll('appids[]'), ['30', '10', '20']);
});

test('the session id is read out of the page script and nothing else is taken for one', () => {
  assert.equal(sessionIdFromText('var g_sessionID = "b6f2c1d4e5a60718";'), 'b6f2c1d4e5a60718');
  assert.equal(sessionIdFromText("g_sessionID='abcdef0123456789';"), 'abcdef0123456789');
  assert.equal(sessionIdFromText('var g_steamID = "76561198000000001";'), null);
  assert.equal(sessionIdFromText(''), null);
});

// ============================================================================
// The answers of Steam
// ============================================================================

test('413 is explained as a wishlist too large for one request', () => {
  const answer = readReorderAnswer({ status: 413, body: '' });

  assert.equal(answer.ok, false);
  assert.equal(answer.kind, 'too-large');
  assert.match(answer.message, /413/);
  assert.match(answer.message, /drag/i);
});

test('403 is explained as a session that has to be renewed', () => {
  const answer = readReorderAnswer({ status: 403, body: '' });

  assert.equal(answer.ok, false);
  assert.equal(answer.kind, 'signed-out');
  assert.match(answer.message, /sign in/i);
});

test('401 is the same case as 403', () => {
  assert.equal(readReorderAnswer({ status: 401, body: '' }).kind, 'signed-out');
});

test('a sign-in page answered with 200 is still a session that expired', () => {
  const answer = readReorderAnswer({
    status: 200,
    contentType: 'text/html',
    body: '<html><body><form action="https://steamcommunity.com/login/">Sign In</form></body></html>',
  });

  assert.equal(answer.ok, false);
  assert.equal(answer.kind, 'signed-out');
});

test('an answer that is not JSON is named as such and nothing is claimed about the order', () => {
  const answer = readReorderAnswer({ status: 200, contentType: 'text/plain', body: 'moved along' });

  assert.equal(answer.ok, false);
  assert.equal(answer.kind, 'not-json');
  assert.match(answer.message, /not JSON/i);
  assert.match(answer.message, /text\/plain/);
});

test('429 and the failures of the Steam side are told apart', () => {
  assert.equal(readReorderAnswer({ status: 429, body: '' }).kind, 'rate-limited');
  assert.equal(readReorderAnswer({ status: 503, body: '' }).kind, 'server-error');
  assert.equal(readReorderAnswer({ status: 418, body: 'teapot' }).kind, 'refused');
});

test('success = 1 is the only answer read as a plain yes', () => {
  const yes = readReorderAnswer({ status: 200, contentType: 'application/json', body: '{"success":1}' });
  assert.equal(yes.ok, true);
  assert.equal(yes.kind, 'ok');

  const no = readReorderAnswer({ status: 200, contentType: 'application/json', body: '{"success":42}' });
  assert.equal(no.ok, false);
  assert.match(no.message, /42/);
});

test('an answer that says nothing is not read as a failure, and does not claim success either', () => {
  const empty = readReorderAnswer({ status: 200, body: '   ' });
  assert.equal(empty.kind, 'ok-empty');
  assert.match(empty.message, /check/i);

  const silent = readReorderAnswer({ status: 200, contentType: 'application/json', body: '{}' });
  assert.equal(silent.kind, 'ok-unknown');
  assert.match(silent.message, /check/i);
});

test('a request that never left the machine says so instead of failing silently', () => {
  const answer = describeNetworkFailure(new TypeError('Failed to fetch'));

  assert.equal(answer.ok, false);
  assert.equal(answer.kind, 'offline');
  assert.match(answer.message, /Failed to fetch/);
  assert.match(answer.message, /Nothing was written/i);
});

// ============================================================================
// Sending, with the network replaced by a stub
// ============================================================================

test('the request goes to the reorder endpoint of Steam, as a form, with the whole list', async () => {
  const { impl, calls } = stubFetch({ status: 200, contentType: 'application/json', body: '{"success":1}' });
  const answer = await sendReorder({
    url: REORDER_URL,
    sessionId: 'abcdef0123456789',
    appIds: [30, 10, 20],
    fetchImpl: impl,
  });

  assert.equal(answer.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, REORDER_URL);
  assert.equal(new URL(calls[0].url).origin, 'https://store.steampowered.com');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
  assert.deepEqual(new URLSearchParams(calls[0].options.body).getAll('appids[]'), ['30', '10', '20']);
});

test('the whole list goes in one request — a partial one would be scattered by Steam', async () => {
  const appIds = Array.from({ length: 250 }, (_, index) => 1000 + index);
  const { impl, calls } = stubFetch({ status: 200, contentType: 'application/json', body: '{"success":1}' });
  await sendReorder({ url: REORDER_URL, sessionId: 'abcdef0123456789', appIds, fetchImpl: impl });

  assert.equal(calls.length, 1);
  assert.deepEqual(
    new URLSearchParams(calls[0].options.body).getAll('appids[]').map(Number),
    appIds,
  );
});

test('a 413 answer comes back as the case it is, from the sending path too', async () => {
  const { impl } = stubFetch({ status: 413, body: '' });
  const answer = await sendReorder({ url: REORDER_URL, sessionId: 'abcdef0123456789', appIds: [1], fetchImpl: impl });

  assert.equal(answer.kind, 'too-large');
});

test('a fetch that throws is reported, not swallowed', async () => {
  const { impl } = stubFetch({ throws: new TypeError('NetworkError when attempting to fetch resource.') });
  const answer = await sendReorder({ url: REORDER_URL, sessionId: 'abcdef0123456789', appIds: [1], fetchImpl: impl });

  assert.equal(answer.kind, 'offline');
  assert.match(answer.message, /NetworkError/);
});

// ============================================================================
// Checking what came of it
// ============================================================================

test('the same order in the same places is a match', () => {
  const verdict = compareOrders([3, 1, 2], [3, 1, 2]);

  assert.equal(verdict.matches, true);
  assert.equal(verdict.inPlace, 3);
  assert.equal(verdict.firstMismatch, -1);
});

test('a difference is shown at the place it starts, not swallowed', () => {
  const verdict = compareOrders([1, 2, 3, 4], [1, 3, 2, 4]);

  assert.equal(verdict.matches, false);
  assert.equal(verdict.firstMismatch, 1);
  assert.equal(verdict.inPlace, 1);
});

test('an entry that left the wishlist between the write and the check is named on its own', () => {
  const verdict = compareOrders([1, 2, 3], [1, 3]);

  assert.equal(verdict.matches, false);
  assert.deepEqual(verdict.missing, [2]);
  assert.deepEqual(verdict.unexpected, []);
  // The entries that are still there are compared among themselves, so one
  // purchase does not turn into a report of everything below it being wrong.
  assert.equal(verdict.inPlace, 2);
  assert.equal(verdict.compared, 2);
});

test('an entry that appeared after the write is named on its own as well', () => {
  const verdict = compareOrders([1, 2], [1, 2, 9]);

  assert.equal(verdict.matches, false);
  assert.deepEqual(verdict.unexpected, [9]);
  assert.deepEqual(verdict.missing, []);
});

test('a wishlist shown in an order of its own is reported from the very first place', () => {
  const verdict = compareOrders([1, 2, 3], [3, 2, 1]);

  assert.equal(verdict.matches, false);
  assert.equal(verdict.firstMismatch, 0);
  assert.equal(verdict.inPlace, 0);
});

test('the check of an order that was built from a file and a page holds together', () => {
  const order = parseOrderFile(orderFile([{ appId: 30 }, { appId: 10 }], [{ appId: 40 }]));
  const target = buildTargetOrder({ items: order.items, remove: order.remove, pageAppIds: [10, 20, 30, 40] });

  assert.deepEqual(target.appIds, [30, 10, 20, 40]);
  assert.equal(compareOrders(target.appIds, [30, 10, 20, 40]).matches, true);
  assert.equal(compareOrders(target.appIds, [10, 30, 20, 40]).matches, false);
});

// ============================================================================
// Reading the page the order will be written into
// ============================================================================
//
// The script that writes has to read the page first, and it duplicates that
// half of the export script, file for file, because a userscript is loaded
// alone and has nowhere to import from. So it is tested here as well: the two
// copies drifting apart is exactly the failure this section exists to catch.

test('the anchor of the current layout is read the same way here as in the export script', () => {
  assert.deepEqual(parseDraggableId('WishlistItem-294100-0'), { appId: 294100, index: 0 });
  assert.deepEqual(parseDraggableId('WishlistItem-294100'), { appId: 294100, index: null });
  assert.equal(parseDraggableId('WishlistItem-abc-0'), null);
  assert.equal(parseDraggableId(''), null);
  assert.equal(parseDraggableId('294100-0'), null);
});

test('rows are found by the anchor, and their titles come along for the backup file', () => {
  const page = currentLayout({ indexes: [0, 1] });
  const found = findRows(page.document);

  assert.equal(found.route, '[data-rfd-draggable-id]');
  assert.deepEqual(
    found.rows.map((row) => readAppId(row)),
    [appIdAt(0), appIdAt(1)],
  );
  assert.equal(readTitle(found.rows[0], appIdAt(0)), 'Sample game 1');
});

test('the scrolling element is found by measuring the ancestors when no known name fits', () => {
  const page = currentLayout({ scrollerId: null });
  const found = findScroller(page.document);

  assert.equal(found.scroller, page.scroller);
  assert.equal(found.route, 'measured the ancestors of a row');
});

test('the old page is still read by its old selectors, and still numbers nothing', () => {
  const page = oldLayout();
  const order = buildPageOrder(harvest(page));

  assert.equal(findRows(page.document).route, '.wishlist_row');
  assert.deepEqual(
    order.entries.map((entry) => entry.appId),
    [440, 730, 570],
  );
  assert.equal(order.complete, null);
});

test('the order sent to Steam follows the numbers of the rows, not their coordinates', () => {
  const first = currentLayout({ indexes: [0, 1], stackFromTop: true });
  const second = currentLayout({ indexes: [80, 81], stackFromTop: true });
  const order = buildPageOrder(harvest(second, harvest(first)));

  assert.deepEqual(
    order.entries.map((entry) => entry.appId),
    [appIdAt(0), appIdAt(1), appIdAt(80), appIdAt(81)],
  );
});

test('a page read in part is refused, and the refusal is what stands between it and the request', () => {
  // The wishlist holds 166 entries. The reading saw the first four and the
  // last one — and an order built out of that would carry five app ids to
  // Steam, which takes the list as a whole and would scatter the other 161
  // through them. So the verdict comes first and the order is never built.
  const page = buildPageOrder(harvest(currentLayout({ indexes: [165] }), harvest(currentLayout({ indexes: [0, 1, 2, 3] }))));

  const verdict = judgePageRead({
    collected: page.entries.length,
    expectedTotal: page.expectedTotal,
    missingIndexes: page.missingIndexes,
    reachedBottom: true,
    timedOut: false,
  });

  assert.equal(page.expectedTotal, 166);
  assert.equal(page.complete, false);
  assert.equal(verdict.ok, false, 'a partial read must never be handed on to the write');
  assert.equal(verdict.reason, 'gaps');
  assert.match(verdict.message, /166/);

  // What would have been sent, had the verdict not stopped it: five entries in
  // place of a hundred and sixty six.
  const order = parseOrderFile(orderFile([{ appId: appIdAt(1) }, { appId: appIdAt(0) }]));
  const target = buildTargetOrder({
    items: order.items,
    remove: order.remove,
    pageAppIds: page.entries.map((entry) => entry.appId),
  });
  assert.equal(target.appIds.length, 5);
});

test('a reading that never reached the bottom is refused even when its numbering has no hole', () => {
  const page = buildPageOrder(harvest(currentLayout({ indexes: [0, 1, 2, 3] })));

  assert.equal(page.complete, true, 'the four rows in the markup are numbered 0…3 without a gap');
  assert.equal(
    judgePageRead({
      collected: page.entries.length,
      expectedTotal: page.expectedTotal,
      missingIndexes: page.missingIndexes,
      reachedBottom: false,
      timedOut: false,
    }).ok,
    false,
    'a numbering read off an unscrolled page describes the window, not the wishlist',
  );
});

test('a page read whole is the one state the write is offered from', () => {
  const page = buildPageOrder(harvest(currentLayout({ indexes: Array.from({ length: 30 }, (_, index) => index) })));

  assert.equal(page.expectedTotal, 30);
  assert.equal(page.complete, true);
  assert.equal(
    judgePageRead({
      collected: page.entries.length,
      expectedTotal: page.expectedTotal,
      missingIndexes: page.missingIndexes,
      reachedBottom: true,
      timedOut: false,
    }).ok,
    true,
  );
});
