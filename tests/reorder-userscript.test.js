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
  REORDER_URL,
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
  readOpenWishlist,
  readReorderAnswer,
  readRowIndex,
  readTitle,
  sendReorder,
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

/**
 * The pairs of a request body, read back out of the JSON the script builds.
 *
 * @param {string} body
 * @returns {Array<{ appid: number, priority: number }>}
 */
function pairsOf(body) {
  const parsed = JSON.parse(body);
  assert.equal(parsed.m, 'Reorder');
  // `mp` is an array of one element, and that element is the list. The double
  // brackets are what a live drag sends, so they are asserted and not assumed.
  assert.equal(Array.isArray(parsed.mp), true);
  assert.equal(parsed.mp.length, 1);
  assert.equal(Array.isArray(parsed.mp[0]), true);
  return parsed.mp[0];
}

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
// Whose wishlist is this
// ============================================================================
//
// The endpoint names no account: the browser attaches the cookie and Steam
// writes into the list of whoever is signed in. So none of this addresses
// anything any more — it answers the question the user should still be asked,
// *is the list on this screen yours?*, and an account it could not work out is
// a sentence in the report rather than a lock on the button.
//
// Every test here builds a page carrying exactly one of the sources — that is
// the only way to know which one answered — and then the cases that matter more
// than any single source: a page that names nobody, a page that names two, and
// the one page still refused outright.

/** The page as Steam serves it, opened under a custom url. */
function pageOf(owner) {
  return currentLayout({ indexes: [0, 1, 2], owner }).document;
}

/**
 * @param {object|null} owner What the page states about the account.
 * @param {{ pathname?: string, globals?: object[] }} [options]
 */
function resolveOn(owner, { pathname = '/wishlist/id/someone/', globals = [] } = {}) {
  const collected = collectOwnerCandidates({ pathname, document: owner === null ? null : pageOf(owner), globals });
  return { collected, resolved: readOpenWishlist({ pathname, candidates: collected.candidates }) };
}

test('a custom url page is read for the account: the numeric link to this same wishlist', () => {
  const { collected, resolved } = resolveOn({ profileLinks: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'profile-link', steamId: STEAM_ID }]);
  assert.equal(collected.fromPath, null);
  assert.equal(collected.vanity, 'someone');
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'profile-link');
});

test('a custom url page is read for the account: the address inside an inline script', () => {
  const { collected, resolved } = resolveOn({ scriptAddresses: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'inline-script', steamId: STEAM_ID }]);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'inline-script');
});

test('a custom url page is read for the account: g_steamID of the old layout', () => {
  const { collected, resolved } = resolveOn({ gSteamID: STEAM_ID });

  assert.deepEqual(collected.candidates, [{ source: 'g_steamID', steamId: STEAM_ID }]);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'g_steamID');
});

test('a custom url page is read for the account: g_steamID of the window, and of unsafeWindow', () => {
  for (const globals of [[{ g_steamID: STEAM_ID }], [null, { g_steamID: STEAM_ID }]]) {
    const { resolved } = resolveOn({}, { globals });
    assert.equal(resolved.steamId, STEAM_ID);
    assert.equal(resolved.source, 'g_steamID');
  }
});

test('a custom url page is read for the account: a data-steamid attribute', () => {
  const { collected, resolved } = resolveOn({ dataSteamIds: [STEAM_ID] });

  assert.deepEqual(collected.candidates, [{ source: 'data-steamid', steamId: STEAM_ID }]);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'data-steamid');
});

test('the page Steam serves — a custom url, a numeric link and one script — resolves to one account', () => {
  const { collected, resolved } = resolveOn({ profileLinks: [STEAM_ID], scriptAddresses: [STEAM_ID] });

  assert.equal(collected.candidates.length, 2);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.deepEqual(resolved.accounts, [STEAM_ID]);
  // One account and no doubt about it: the report line names it, and there is
  // nothing left for a warning to be about.
  assert.equal(resolved.note, '');
});

test('a page that states nothing about the account says so, and stops nothing', () => {
  const { collected, resolved } = resolveOn({});

  assert.deepEqual(collected.candidates, []);
  assert.equal(resolved.error, undefined);
  assert.equal(resolved.steamId, null);
  assert.deepEqual(resolved.accounts, []);
  assert.match(resolved.note, /not written anywhere/i);
  assert.match(resolved.note, /signed in as/i);
});

test('two different accounts on one page are a warning now, not a refusal', () => {
  // The endpoint takes no account, so a page naming two of them cannot send the
  // order anywhere but the signed-in list. It is said, and the write goes on.
  const { resolved } = resolveOn({ gSteamID: STEAM_ID, profileLinks: [OTHER_STEAM_ID] });

  assert.equal(resolved.error, undefined);
  assert.equal(resolved.steamId, null);
  assert.deepEqual(resolved.accounts, [STEAM_ID, OTHER_STEAM_ID]);
  assert.match(resolved.note, /more than one account/i);
  assert.match(resolved.note, new RegExp(STEAM_ID));
  assert.match(resolved.note, new RegExp(OTHER_STEAM_ID));
  assert.match(resolved.note, /signed in as/i);
});

test('the same account stated by every source at once is one account, not four', () => {
  const { collected, resolved } = resolveOn(
    { gSteamID: STEAM_ID, profileLinks: [STEAM_ID], scriptAddresses: [STEAM_ID], dataSteamIds: [STEAM_ID] },
    { globals: [{ g_steamID: STEAM_ID }] },
  );

  assert.equal(collected.candidates.length, 5);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.deepEqual(resolved.accounts, [STEAM_ID]);
});

test('nothing of the wrong shape is taken for an account id', () => {
  const { collected, resolved } = resolveOn({ junk: true }, { globals: [{ g_steamID: '../../evil' }] });

  assert.deepEqual(collected.candidates, []);
  assert.equal(resolved.steamId, null);
  assert.deepEqual(resolved.accounts, []);
});

test('junk on the page does not turn one good source into a disagreement', () => {
  const { resolved } = resolveOn({ junk: true, profileLinks: [STEAM_ID] });

  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.note, '');
});

test('a numeric address wins over everything the page says', () => {
  const pathname = `/wishlist/profiles/${STEAM_ID}/`;
  const { collected, resolved } = resolveOn(
    { profileLinks: [OTHER_STEAM_ID], scriptAddresses: [OTHER_STEAM_ID], dataSteamIds: [OTHER_STEAM_ID] },
    { pathname },
  );

  assert.equal(collected.fromPath, STEAM_ID);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.source, 'path');
  assert.equal(resolved.note, '');
});

test('the one page still refused outright: a numeric address that is not the signed-in account', () => {
  // The certain case. The write goes to the list of whoever is signed in, so
  // going ahead here would rearrange your own wishlist with somebody else's
  // entries — read off the page in front of you.
  const resolved = readOpenWishlist({
    pathname: `/wishlist/profiles/${OTHER_STEAM_ID}/`,
    loggedInSteamId: STEAM_ID,
  });

  assert.equal(resolved.error, 'not-yours');
  assert.match(resolved.message, /not yours/i);
  assert.match(resolved.message, /signed in as/i);
});

test('the same refusal when the page itself is what names the signed-in account', () => {
  const { resolved } = resolveOn({ gSteamID: OTHER_STEAM_ID }, { pathname: `/wishlist/profiles/${STEAM_ID}/` });
  assert.equal(resolved.error, 'not-yours');
});

test('a numeric address that agrees with the signed-in account is no refusal at all', () => {
  const resolved = readOpenWishlist({ pathname: `/wishlist/profiles/${STEAM_ID}/`, loggedInSteamId: STEAM_ID });

  assert.equal(resolved.error, undefined);
  assert.equal(resolved.steamId, STEAM_ID);
  assert.equal(resolved.vanity, null);
});

test('nothing of the wrong shape is read as the signed-in account either', () => {
  for (const junk of ['76561198000000001/../evil', 'abc', '765611980000000011111', '', null]) {
    const resolved = readOpenWishlist({ pathname: '/wishlist/id/someone/', loggedInSteamId: junk });
    assert.equal(resolved.error, undefined, `refused on ${JSON.stringify(junk)}`);
    assert.equal(resolved.steamId, null, `accepted ${JSON.stringify(junk)}`);
  }
});

test('the account the list on the page belongs to is named: the id, the nick and where it came from', () => {
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

// ============================================================================
// The body of the request
// ============================================================================

test('the body is the Reorder call the page makes, with the pairs inside a single-element array', () => {
  const body = buildReorderBody([30, 10, 20]);
  const parsed = JSON.parse(body);

  assert.equal(parsed.m, 'Reorder');
  assert.deepEqual(parsed.mp, [
    [
      { appid: 30, priority: 1 },
      { appid: 10, priority: 2 },
      { appid: 20, priority: 3 },
    ],
  ]);
});

test('the priorities run 1…N without a gap, in the order the list was given', () => {
  const appIds = Array.from({ length: 166 }, (_, index) => 1000 + index);
  const pairs = pairsOf(buildReorderBody(appIds));

  assert.equal(pairs.length, 166);
  assert.deepEqual(
    pairs.map((pair) => pair.priority),
    Array.from({ length: 166 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    pairs.map((pair) => pair.appid),
    appIds,
  );
});

test('not one entry is left with the zero priority Steam gives to the never-arranged', () => {
  // The whole list is sent, so the whole list comes out numbered. That is the
  // step the panel calls irreversible, and this is where it is visible.
  const pairs = pairsOf(buildReorderBody([7, 8, 9]));
  assert.equal(
    pairs.some((pair) => pair.priority === 0),
    false,
  );
});

test('the body carries no session id and no token: the cookie is what authorizes it', () => {
  const body = buildReorderBody([30, 10, 20]);

  assert.doesNotMatch(body, /sessionid/i);
  assert.doesNotMatch(body, /access_token/i);
  assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['m', 'mp']);
});

test('the order the file and the page produced is the order of the pairs, removals last', () => {
  const target = buildTargetOrder({
    items: [{ appId: 30 }, { appId: 10 }],
    remove: [{ appId: 20 }],
    pageAppIds: [10, 20, 30, 40],
  });
  const pairs = pairsOf(buildReorderBody(target.appIds));

  assert.deepEqual(
    pairs.map((pair) => pair.appid),
    [30, 10, 40, 20],
  );
  assert.deepEqual(
    pairs.map((pair) => pair.priority),
    [1, 2, 3, 4],
  );
  // The entry marked for removal is last and still there: nothing is deleted.
  assert.deepEqual(pairs.at(-1), { appid: 20, priority: 4 });
});

test('an empty list is still a well-formed body rather than a broken one', () => {
  assert.deepEqual(pairsOf(buildReorderBody([])), []);
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

test('data.result = 1 is the only answer read as a plain yes', () => {
  const yes = readReorderAnswer({ status: 200, contentType: 'application/json', body: '{"data":{"result":1}}' });
  assert.equal(yes.ok, true);
  assert.equal(yes.kind, 'ok');
});

test('any other result is a refusal, and the number is quoted back', () => {
  for (const result of ['42', '0', '2', 'null', '"1"', 'true']) {
    const answer = readReorderAnswer({
      status: 200,
      contentType: 'application/json',
      body: `{"data":{"result":${result}}}`,
    });

    assert.equal(answer.ok, false, `read ${result} as a success`);
    assert.equal(answer.kind, 'refused');
    assert.match(answer.message, /data\.result/);
  }
});

test('the field of the old endpoint is not read as an answer of this one', () => {
  // `{"success":1}` was the yes of the address this script used to send to.
  // Taking it for one here would report a write that never happened.
  const answer = readReorderAnswer({ status: 200, contentType: 'application/json', body: '{"success":1}' });
  assert.equal(answer.kind, 'ok-unknown');
});

test('an answer that says nothing is not read as a failure, and does not claim success either', () => {
  const empty = readReorderAnswer({ status: 200, body: '   ' });
  assert.equal(empty.kind, 'ok-empty');
  assert.match(empty.message, /check/i);

  for (const body of ['{}', '{"data":{}}', '{"data":null}']) {
    const silent = readReorderAnswer({ status: 200, contentType: 'application/json', body });
    assert.equal(silent.kind, 'ok-unknown', `read ${body} as something it is not`);
    assert.equal(silent.ok, true);
    assert.match(silent.message, /check/i);
  }
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

test('the request goes to /wishlist/action, as JSON, with the whole list', async () => {
  const { impl, calls } = stubFetch({ status: 200, contentType: 'application/json', body: '{"data":{"result":1}}' });
  const answer = await sendReorder({ appIds: [30, 10, 20], fetchImpl: impl });

  assert.equal(answer.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://store.steampowered.com/wishlist/action');
  assert.equal(calls[0].url, REORDER_URL);
  assert.equal(new URL(calls[0].url).origin, 'https://store.steampowered.com');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers['Content-Type'], /^application\/json; ?charset=utf-8$/i);
  // Same origin as the page, so the browser attaches the cookie itself.
  assert.equal(calls[0].options.credentials, 'include');
  assert.deepEqual(pairsOf(calls[0].options.body), [
    { appid: 30, priority: 1 },
    { appid: 10, priority: 2 },
    { appid: 20, priority: 3 },
  ]);
});

test('the address is a constant: nothing read off the page can end up inside it', async () => {
  const { impl, calls } = stubFetch({ status: 200, contentType: 'application/json', body: '{"data":{"result":1}}' });
  await sendReorder({ appIds: [1], fetchImpl: impl });

  assert.equal(calls[0].url, REORDER_URL);
  assert.equal(new URL(REORDER_URL).pathname, '/wishlist/action');
  assert.equal(new URL(REORDER_URL).search, '');
});

test('the whole list goes in one request — a partial one would be scattered by Steam', async () => {
  const appIds = Array.from({ length: 250 }, (_, index) => 1000 + index);
  const { impl, calls } = stubFetch({ status: 200, contentType: 'application/json', body: '{"data":{"result":1}}' });
  await sendReorder({ appIds, fetchImpl: impl });

  assert.equal(calls.length, 1);
  const pairs = pairsOf(calls[0].options.body);
  assert.deepEqual(
    pairs.map((pair) => pair.appid),
    appIds,
  );
  assert.deepEqual(
    pairs.map((pair) => pair.priority),
    appIds.map((_, index) => index + 1),
  );
});

test('a 413 answer comes back as the case it is, from the sending path too', async () => {
  const { impl } = stubFetch({ status: 413, body: '' });
  const answer = await sendReorder({ appIds: [1], fetchImpl: impl });

  assert.equal(answer.kind, 'too-large');
});

test('403, a sign-in page and a failure of the Steam side all come back through the sending path', async () => {
  const cases = [
    [{ status: 403, body: '' }, 'signed-out'],
    [{ status: 200, contentType: 'text/html', body: '<html><body>Sign In</body></html>' }, 'signed-out'],
    [{ status: 503, body: '' }, 'server-error'],
    [{ status: 200, contentType: 'text/plain', body: 'moved along' }, 'not-json'],
    [{ status: 200, contentType: 'application/json', body: '{"data":{"result":8}}' }, 'refused'],
  ];

  for (const [reply, kind] of cases) {
    const { impl } = stubFetch(reply);
    const answer = await sendReorder({ appIds: [1], fetchImpl: impl });
    assert.equal(answer.kind, kind, `status ${reply.status} came back as ${answer.kind}`);
  }
});

test('a fetch that throws is reported, not swallowed', async () => {
  const { impl } = stubFetch({ throws: new TypeError('NetworkError when attempting to fetch resource.') });
  const answer = await sendReorder({ appIds: [1], fetchImpl: impl });

  assert.equal(answer.kind, 'offline');
  assert.match(answer.message, /NetworkError/);
});

test('a failed request sends nothing twice: one call went out, and that is all', async () => {
  const { impl, calls } = stubFetch({ status: 500, body: '' });
  await sendReorder({ appIds: [1, 2, 3], fetchImpl: impl });

  assert.equal(calls.length, 1);
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
