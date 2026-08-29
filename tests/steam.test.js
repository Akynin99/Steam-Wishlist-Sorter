/**
 * Tests for the import that goes straight to a Steam account.
 *
 * Not one of them touches the network: every function of `steam.js` takes the
 * `fetch` it should use, and the stub here answers a fixed table of addresses
 * and records what was asked for. That is what makes the important assertions
 * possible at all — the ones about requests that must never be made.
 *
 * The waiting is stubbed the same way, so the retries after a 429 are checked
 * by the delays they asked for rather than by a test that really sleeps half a
 * minute.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { importItemsSorted } from '../src/import.js';
import {
  ALLOWED_HOSTS,
  MAX_APP_IDS,
  SteamError,
  appDetailsUrl,
  assertAllowedUrl,
  buildWishlistItems,
  collectTitles,
  collectWishlist,
  createSteamFetch,
  fetchWishlistEntries,
  parseAccountInput,
  parseAppDetails,
  parseVanityXml,
  parseWishlistPayload,
  readEventStream,
  resolveSteamId,
  streamAppSummaries,
} from '../src/steam.js';

const STEAM_ID = '76561198000000001';
const VANITY_URL = 'https://steamcommunity.com/id/testuser/?xml=1';
const WISHLIST_URL = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${STEAM_ID}`;

/**
 * A `fetch` that answers from a table and remembers every address it was
 * given. An address the table does not know is a failed assertion rather than
 * a silent 404: a request the test did not expect is exactly what it is here
 * to catch.
 *
 * @param {Record<string, object>|Function} routes
 * @returns {Function & { calls: string[] }}
 */
function stubFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    const address = String(url);
    calls.push(address);
    const route = typeof routes === 'function' ? routes(address, calls.length) : routes[address];
    if (route === undefined) throw new Error(`unexpected request: ${address}`);
    if (route instanceof Error) throw route;
    const body = route.json !== undefined ? JSON.stringify(route.json) : (route.body ?? '');
    return new Response(body, { status: route.status ?? 200, headers: route.headers ?? {} });
  };
  impl.calls = calls;
  return impl;
}

/**
 * A clock that never really waits and writes down what it was asked to wait.
 *
 * @returns {Function & { waits: number[] }}
 */
function stubSleep() {
  const waits = [];
  const impl = async (ms) => {
    waits.push(ms);
  };
  impl.waits = waits;
  return impl;
}

/**
 * The answer of `appdetails` for one application.
 *
 * @param {number} appId
 * @param {string} name
 * @param {string} [type]
 * @returns {object}
 */
function detailsFor(appId, name, type = 'game') {
  return { json: { [appId]: { success: true, data: { type, name, steam_appid: appId } } } };
}

/**
 * Drains an async iterable into an array.
 *
 * @param {AsyncIterable<object>} stream
 * @returns {Promise<object[]>}
 */
async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

/* ------------------------------------------------------ what was typed */

test('a bare SteamID64 and a profile name are both accepted', () => {
  assert.deepEqual(parseAccountInput(STEAM_ID), { kind: 'id', steamId: STEAM_ID });
  assert.deepEqual(parseAccountInput(`  ${STEAM_ID}  `), { kind: 'id', steamId: STEAM_ID });
  assert.deepEqual(parseAccountInput('RogerBulletDodger'), { kind: 'vanity', vanity: 'RogerBulletDodger' });
  assert.deepEqual(parseAccountInput('some_nick-42'), { kind: 'vanity', vanity: 'some_nick-42' });
});

test('a profile link is accepted in both of its shapes', () => {
  const cases = [
    [`https://steamcommunity.com/profiles/${STEAM_ID}`, { kind: 'id', steamId: STEAM_ID }],
    [`https://steamcommunity.com/profiles/${STEAM_ID}/`, { kind: 'id', steamId: STEAM_ID }],
    [`https://steamcommunity.com/profiles/${STEAM_ID}/wishlist/`, { kind: 'id', steamId: STEAM_ID }],
    [`http://www.steamcommunity.com/profiles/${STEAM_ID}`, { kind: 'id', steamId: STEAM_ID }],
    [`  steamcommunity.com/profiles/${STEAM_ID}  `, { kind: 'id', steamId: STEAM_ID }],
    ['https://steamcommunity.com/id/testuser', { kind: 'vanity', vanity: 'testuser' }],
    ['https://steamcommunity.com/id/testuser/wishlist/?sort=order', { kind: 'vanity', vanity: 'testuser' }],
    ['https://STEAMCOMMUNITY.com/id/testuser/', { kind: 'vanity', vanity: 'testuser' }],
    ['steamcommunity.com/id/testuser', { kind: 'vanity', vanity: 'testuser' }],
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(parseAccountInput(input), expected, `${input} was read wrong`);
  }
});

test('an empty field is told apart from a malformed account', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.throws(() => parseAccountInput(empty), (error) => error.code === 'empty-input');
  }
  for (const junk of ['12345', '7656119800000000', '765611980000000012', 'ник кириллицей', 'a', '<script>', '{}']) {
    assert.throws(
      () => parseAccountInput(junk),
      (error) => error instanceof SteamError && error.code === 'invalid-account',
      `${junk} was accepted as an account`,
    );
  }
});

test('a link to any host but steamcommunity.com is refused', () => {
  const attempts = [
    'https://evil.example.com/id/testuser',
    'evil.example.com/id/testuser',
    `https://steamcommunity.com.evil.example.com/profiles/${STEAM_ID}`,
    'https://steamcommunity.com@evil.example.com/id/testuser',
    'http://127.0.0.1:8080/id/testuser',
    'http://localhost:8080/api/health',
    'http://192.168.1.1/id/testuser',
    'http://[::1]/id/testuser',
    'file:///c:/windows/win.ini',
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    '//evil.example.com/id/testuser',
    'https://store.steampowered.com/id/testuser',
    'https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=1',
  ];
  for (const attempt of attempts) {
    assert.throws(
      () => parseAccountInput(attempt),
      (error) => error instanceof SteamError && error.code === 'invalid-account',
      `${attempt} was accepted`,
    );
  }
});

/* ----------------------------------------------------- the allow list */

test('only https on a Steam host passes the allow list', () => {
  for (const host of ALLOWED_HOSTS) {
    assert.equal(assertAllowedUrl(`https://${host}/x?y=1`), `https://${host}/x?y=1`);
  }

  const refused = [
    'http://api.steampowered.com/x',
    'https://evil.example.com/x',
    'https://api.steampowered.com.evil.example.com/x',
    'https://127.0.0.1/x',
    'https://localhost:8080/x',
    'https://steamcommunity.com.example.com/x',
    'https://www.steamcommunity.com/x',
    'file:///etc/passwd',
    'not an address at all',
    '',
  ];
  for (const url of refused) {
    assert.throws(
      () => assertAllowedUrl(url),
      (error) => error instanceof SteamError && error.code === 'blocked-host',
      `${url} passed the allow list`,
    );
  }
});

test('the fetch of this module refuses a foreign host without opening a connection', async () => {
  const fetchImpl = stubFetch({});
  const steamFetch = createSteamFetch(fetchImpl);

  await assert.rejects(
    () => steamFetch('http://127.0.0.1:9/secret'),
    (error) => error instanceof SteamError && error.code === 'blocked-host',
  );
  assert.deepEqual(fetchImpl.calls, [], 'a refused address must never reach fetch');
});

test('a redirect is followed only while it stays on a Steam host', async () => {
  const onSteam = stubFetch({
    'https://steamcommunity.com/id/testuser/?xml=1': {
      status: 302,
      headers: { location: 'https://steamcommunity.com/id/testuser/?xml=1&r=1' },
    },
    'https://steamcommunity.com/id/testuser/?xml=1&r=1': { body: `<steamID64>${STEAM_ID}</steamID64>` },
  });
  const steamId = await resolveSteamId('testuser', { fetch: onSteam });
  assert.equal(steamId, STEAM_ID);
  assert.equal(onSteam.calls.length, 2);

  const offSteam = stubFetch({
    'https://steamcommunity.com/id/testuser/?xml=1': {
      status: 302,
      headers: { location: 'https://evil.example.com/steal' },
    },
  });
  await assert.rejects(
    () => resolveSteamId('testuser', { fetch: offSteam }),
    (error) => error instanceof SteamError && error.code === 'blocked-host',
  );
  assert.deepEqual(offSteam.calls, ['https://steamcommunity.com/id/testuser/?xml=1']);
});

test('an address is built from a checked value, never from raw input', () => {
  assert.equal(appDetailsUrl(620), 'https://store.steampowered.com/api/appdetails?appids=620&filters=basic');
  assert.equal(appDetailsUrl('620'), 'https://store.steampowered.com/api/appdetails?appids=620&filters=basic');
  for (const junk of ['620&x=1', '../../evil', 'https://evil.example.com', -1, 0]) {
    assert.throws(() => appDetailsUrl(junk), (error) => error instanceof SteamError);
  }
});

/* ------------------------------------------------------- the answers */

test('the SteamID64 is read out of the XML view of a profile', () => {
  assert.equal(parseVanityXml(`<profile><steamID64>${STEAM_ID}</steamID64></profile>`), STEAM_ID);
  assert.throws(
    () => parseVanityXml('<response><error>The specified profile could not be found.</error></response>'),
    (error) => error.code === 'account-not-found',
  );
  assert.throws(() => parseVanityXml(''), (error) => error.code === 'account-not-found');
});

test('a wishlist answer is read, and its two empty shapes are told apart', () => {
  const entries = parseWishlistPayload({
    response: {
      items: [
        { appid: 620, priority: 2, date_added: 1500000000 },
        { appid: 440, priority: 0, date_added: 1400000000 },
        { appid: 'nonsense', priority: 0 },
        { appid: 620, priority: 9 },
      ],
    },
  });
  assert.deepEqual(entries, [
    { appId: 620, priority: 2, dateAdded: 1500000000 },
    { appId: 440, priority: 0, dateAdded: 1400000000 },
  ]);

  // The list is there and holds nothing.
  assert.throws(
    () => parseWishlistPayload({ response: { items: [] } }),
    (error) => error.code === 'wishlist-empty',
  );
  // Steam handed nothing over at all: in practice, the privacy setting.
  for (const payload of [{ response: {} }, { response: null }, {}, null, 'nope']) {
    assert.throws(
      () => parseWishlistPayload(payload),
      (error) => error.code === 'wishlist-private',
      `${JSON.stringify(payload)} was not read as a closed wishlist`,
    );
  }
});

test('entries the user ordered come first, the rest by when they were added', () => {
  const items = buildWishlistItems([
    { appId: 10, priority: 0, dateAdded: 300 },
    { appId: 20, priority: 2, dateAdded: 100 },
    { appId: 30, priority: 0, dateAdded: 100 },
    { appId: 40, priority: 1, dateAdded: 900 },
    { appId: 50, priority: 0, dateAdded: 200 },
  ]);

  assert.deepEqual(items.map((item) => item.appId), [40, 20, 30, 50, 10]);
  assert.deepEqual(items.map((item) => item.wishlistPosition), [1, 2, 3, 4, 5]);
  assert.equal(items[0].url, 'https://store.steampowered.com/app/40/');
});

test('entries without a priority and without a date keep a stable order', () => {
  const entries = [
    { appId: 30, priority: 0, dateAdded: 0 },
    { appId: 10, priority: 0, dateAdded: 0 },
    { appId: 20, priority: 0, dateAdded: 0 },
  ];
  assert.deepEqual(
    buildWishlistItems(entries).map((item) => item.appId),
    buildWishlistItems([...entries].reverse()).map((item) => item.appId),
  );
});

test('the title and the type are read, and a refused entry is not a failure', () => {
  assert.deepEqual(parseAppDetails({ 620: { success: true, data: { name: 'Portal 2', type: 'game' } } }, 620), {
    title: 'Portal 2',
    kind: 'game',
  });
  assert.deepEqual(parseAppDetails({ 12: { success: true, data: { name: 'Some DLC', type: 'dlc' } } }, 12), {
    title: 'Some DLC',
    kind: 'dlc',
  });
  // Delisted or not sold in this region: Steam answers with success: false.
  assert.equal(parseAppDetails({ 620: { success: false } }, 620), null);
  assert.equal(parseAppDetails({ 620: { success: true, data: { type: 'game' } } }, 620), null);
  assert.equal(parseAppDetails({}, 620), null);
  assert.equal(parseAppDetails(null, 620), null);
});

/* -------------------------------------------------------- the requests */

test('a profile name is resolved, and a missing one is named as such', async () => {
  const found = stubFetch({ [VANITY_URL]: { body: `<steamID64>${STEAM_ID}</steamID64>` } });
  assert.equal(await resolveSteamId('testuser', { fetch: found }), STEAM_ID);
  assert.deepEqual(found.calls, [VANITY_URL]);

  const missing = stubFetch({ [VANITY_URL]: { body: '<response><error>not found</error></response>' } });
  await assert.rejects(
    () => resolveSteamId('testuser', { fetch: missing }),
    (error) => error.code === 'account-not-found',
  );

  const throttled = stubFetch({ [VANITY_URL]: { status: 429, body: '' } });
  await assert.rejects(
    () => resolveSteamId('testuser', { fetch: throttled }),
    (error) => error.code === 'rate-limited',
  );

  // An id needs no request at all.
  const untouched = stubFetch({});
  assert.equal(await resolveSteamId(STEAM_ID, { fetch: untouched }), STEAM_ID);
  assert.deepEqual(untouched.calls, []);
});

test('every way Steam refuses a wishlist gets its own reason', async () => {
  const cases = [
    [{ status: 403, body: '' }, 'wishlist-private'],
    [{ status: 401, body: '' }, 'wishlist-private'],
    [{ status: 500, body: '' }, 'wishlist-unavailable'],
    [{ status: 503, body: '' }, 'wishlist-unavailable'],
    [{ status: 429, body: '' }, 'rate-limited'],
    [{ status: 404, body: '' }, 'steam-error'],
    [{ body: '<html>not json</html>' }, 'steam-error'],
    [{ json: { response: {} } }, 'wishlist-private'],
    [{ json: { response: { items: [] } } }, 'wishlist-empty'],
  ];

  for (const [route, code] of cases) {
    await assert.rejects(
      () => fetchWishlistEntries(STEAM_ID, { fetch: stubFetch({ [WISHLIST_URL]: route }) }),
      (error) => error instanceof SteamError && error.code === code,
      `${JSON.stringify(route)} should be ${code}`,
    );
  }
});

test('a connection that fails is a network failure, not a crash', async () => {
  const broken = stubFetch({ [WISHLIST_URL]: new TypeError('fetch failed') });
  await assert.rejects(
    () => fetchWishlistEntries(STEAM_ID, { fetch: broken }),
    (error) => error instanceof SteamError && error.code === 'network',
  );
});

/* ---------------------------------------------------------- the walk */

test('the whole import gives out the account, the list and then the titles', async () => {
  const fetchImpl = stubFetch({
    [VANITY_URL]: { body: `<steamID64>${STEAM_ID}</steamID64>` },
    [WISHLIST_URL]: {
      json: {
        response: {
          items: [
            { appid: 440, priority: 0, date_added: 200 },
            { appid: 620, priority: 1, date_added: 100 },
          ],
        },
      },
    },
    [appDetailsUrl(620)]: detailsFor(620, 'Portal 2'),
    [appDetailsUrl(440)]: detailsFor(440, 'Team Fortress 2'),
  });
  const sleep = stubSleep();

  const events = await collect(collectWishlist('testuser', { fetch: fetchImpl, sleep }));

  assert.deepEqual(events[0], { type: 'account', steamId: STEAM_ID });
  assert.equal(events[1].type, 'wishlist');
  assert.equal(events[1].total, 2);
  assert.deepEqual(events[1].items.map((item) => item.appId), [620, 440]);
  assert.deepEqual(
    events.slice(2),
    [
      { type: 'title', appId: 620, title: 'Portal 2', kind: 'game', done: 1, total: 2 },
      { type: 'title', appId: 440, title: 'Team Fortress 2', kind: 'game', done: 2, total: 2 },
    ],
  );
  // One pause between the two calls, and none after the last one.
  assert.deepEqual(sleep.waits, [350]);
});

test('a title that did not arrive leaves the item in place, by its app id', async () => {
  const fetchImpl = stubFetch({
    [WISHLIST_URL]: {
      json: {
        response: {
          items: [
            { appid: 620, priority: 1 },
            { appid: 999, priority: 2 },
            { appid: 440, priority: 3 },
          ],
        },
      },
    },
    [appDetailsUrl(620)]: detailsFor(620, 'Portal 2'),
    [appDetailsUrl(999)]: { json: { 999: { success: false } } },
    [appDetailsUrl(440)]: { status: 502, body: 'bad gateway' },
  });

  const events = await collect(collectWishlist(STEAM_ID, { fetch: fetchImpl, sleep: stubSleep() }));
  const wishlist = events.find((event) => event.type === 'wishlist');
  const titles = events.filter((event) => event.type === 'title');
  const missing = events.filter((event) => event.type === 'title-missing');

  assert.equal(titles.length, 1);
  assert.deepEqual(missing.map((event) => event.appId), [999, 440]);

  // What the page then hands to the importer: the list, with the titles that
  // did arrive merged in. The rest stay readable items with a cover.
  const merged = wishlist.items.map((item) => {
    const title = titles.find((event) => event.appId === item.appId);
    return title ? { ...item, title: title.title, kind: title.kind } : item;
  });
  const { items } = importItemsSorted({ items: merged });

  assert.deepEqual(items.map((item) => item.title), ['Portal 2', 'App 999', 'App 440']);
  assert.equal(items[1].imageUrl, 'https://cdn.cloudflare.steamstatic.com/steam/apps/999/header.jpg');
  assert.equal(items[2].url, 'https://store.steampowered.com/app/440/');
  assert.deepEqual(items.map((item) => item.wishlistPosition), [1, 2, 3]);
});

test('a 429 is waited out and the request repeated', async () => {
  let asked = 0;
  const fetchImpl = stubFetch((url) => {
    if (url !== appDetailsUrl(620)) throw new Error(`unexpected ${url}`);
    asked += 1;
    return asked <= 2 ? { status: 429, body: '' } : detailsFor(620, 'Portal 2');
  });
  const sleep = stubSleep();

  const events = await collect(streamAppSummaries([620], { fetch: fetchImpl, sleep }));

  assert.deepEqual(events.map((event) => event.type), ['waiting', 'waiting', 'title']);
  assert.deepEqual(sleep.waits, [3000, 8000], 'the wait grows after every refusal');
  assert.equal(asked, 3);
});

test('a Steam that keeps refusing stops the walk and keeps what was collected', async () => {
  const fetchImpl = stubFetch((url) => (url === appDetailsUrl(620)
    ? detailsFor(620, 'Portal 2')
    : { status: 429, body: '' }));
  const sleep = stubSleep();

  const events = await collect(streamAppSummaries([620, 440, 730], { fetch: fetchImpl, sleep }));

  assert.deepEqual(events[0], { type: 'title', appId: 620, title: 'Portal 2', kind: 'game', done: 1, total: 3 });
  assert.equal(events.at(-1).type, 'rate-limited');
  assert.deepEqual(events.at(-1), { type: 'rate-limited', done: 1, total: 3 });
  // Every retry was waited out before giving up, and 730 was never asked for.
  assert.deepEqual(sleep.waits, [350, 3000, 8000, 20000]);
  assert.ok(!fetchImpl.calls.includes(appDetailsUrl(730)), 'the walk stopped instead of hammering on');
});

test('a server error is not passed off as a privacy setting', async () => {
  // 401 and 403 say what they mean: Steam knows the account and refuses to
  // show its wishlist. A 5xx says nothing of the kind — it is the answer both
  // to a closed list and to a Steam that is having a bad minute — so it gets
  // its own code, and the interface names both possibilities instead of
  // sending the user off to change a setting that may already be right.
  const failing = stubFetch({ [WISHLIST_URL]: { status: 500, body: '' } });
  await assert.rejects(
    () => fetchWishlistEntries(STEAM_ID, { fetch: failing }),
    (error) => error instanceof SteamError && error.code === 'wishlist-unavailable',
  );

  // And it is not turned into a missing account either: the profile is not
  // even asked about, which the stub proves by not knowing that address.
  const whole = stubFetch({ [WISHLIST_URL]: { status: 500, body: '' } });
  await assert.rejects(
    () => collect(collectWishlist(STEAM_ID, { fetch: whole, sleep: stubSleep() })),
    (error) => error instanceof SteamError && error.code === 'wishlist-unavailable',
  );
  assert.deepEqual(whole.calls, [WISHLIST_URL]);
});

test('a wishlist that is closed for a real account is not called a missing account', async () => {
  const fetchImpl = stubFetch({
    [WISHLIST_URL]: { json: { response: {} } },
    [`https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`]: {
      body: `<profile><steamID64>${STEAM_ID}</steamID64><privacyMessage>private</privacyMessage></profile>`,
    },
  });

  await assert.rejects(
    () => collect(collectWishlist(STEAM_ID, { fetch: fetchImpl, sleep: stubSleep() })),
    (error) => error instanceof SteamError && error.code === 'wishlist-private',
  );
});

test('an id that belongs to nobody is reported as a missing account', async () => {
  const fetchImpl = stubFetch({
    [WISHLIST_URL]: { json: { response: {} } },
    [`https://steamcommunity.com/profiles/${STEAM_ID}/?xml=1`]: {
      body: '<response><error>The specified profile could not be found.</error></response>',
    },
  });

  await assert.rejects(
    () => collect(collectWishlist(STEAM_ID, { fetch: fetchImpl, sleep: stubSleep() })),
    (error) => error instanceof SteamError && error.code === 'account-not-found',
  );
});

test('cancelling stops the walk where it is', async () => {
  const controller = new AbortController();
  const fetchImpl = stubFetch((url) => {
    if (url === appDetailsUrl(440)) controller.abort();
    return detailsFor(Number(new URL(url).searchParams.get('appids')), 'Something');
  });

  await assert.rejects(
    () => collect(streamAppSummaries([620, 440, 730], {
      fetch: fetchImpl,
      sleep: stubSleep(),
      signal: controller.signal,
    })),
    (error) => error instanceof SteamError && error.code === 'cancelled',
  );
  assert.ok(!fetchImpl.calls.includes(appDetailsUrl(730)));
});

test('the titles alone are asked for only the ids that are given', async () => {
  const fetchImpl = stubFetch({
    [appDetailsUrl(620)]: detailsFor(620, 'Portal 2'),
    [appDetailsUrl(440)]: detailsFor(440, 'Team Fortress 2', 'dlc'),
  });

  const events = await collect(collectTitles(['620', 440, '620', 'nonsense'], { fetch: fetchImpl, sleep: stubSleep() }));

  assert.deepEqual(events[0], { type: 'titles', total: 2 });
  assert.deepEqual(events.slice(1).map((event) => event.appId), [620, 440]);
  assert.equal(events[2].kind, 'dlc');
  assert.equal(fetchImpl.calls.length, 2, 'a repeated id is asked for once');

  await assert.rejects(
    () => collect(collectTitles([], { fetch: stubFetch({}) })),
    (error) => error instanceof SteamError,
  );
  await assert.rejects(
    () => collect(collectTitles(Array.from({ length: MAX_APP_IDS + 1 }, (_, i) => i + 1), { fetch: stubFetch({}) })),
    (error) => error instanceof SteamError,
  );
});

/* ------------------------------------------------------- the wire format */

test('the event stream survives being cut into arbitrary chunks', async () => {
  const events = [
    { type: 'account', steamId: STEAM_ID },
    { type: 'title', appId: 620, title: 'Portal 2, "the" one', done: 1, total: 2 },
    { type: 'finished' },
  ];
  const text = events.map((event) => `${JSON.stringify(event)}\n`).join('');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (let at = 0; at < text.length; at += 7) {
        controller.enqueue(encoder.encode(text.slice(at, at + 7)));
      }
      controller.close();
    },
  });

  assert.deepEqual(await collect(readEventStream(stream)), events);
});
