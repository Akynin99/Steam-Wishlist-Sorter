/**
 * Tests for the link that carries the order into Steam.
 *
 * The bookmarklet is a string the user drags into their own browser and then
 * runs on Steam's page. Two things about such a string are worth a test and
 * cannot be checked by looking at it: that the order inside it is the order
 * the application produced, and that nothing else got in — no titles, no urls,
 * no address of the local server, nothing but the code and public app ids.
 *
 * The generated source is also executed here, against a fake page and a fake
 * `fetch`, so that the address, the header and the body it sends are asserted
 * the same way `tests/reorder-userscript.test.js` asserts them for the
 * userscript. Not one test touches the network.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { setLanguage } from '../src/i18n.js';
import { createSession } from '../src/ranking.js';
import {
  BOOKMARKLET_TEXT_KEYS,
  PANEL_ID,
  REORDER_URL,
  bookmarkletAppIds,
  bookmarkletCode,
  bookmarkletTexts,
  bookmarkletUrl,
} from '../src/bookmarklet.js';
import { makeItems } from './helpers/fixtures.js';

// The language is global, so every test that changes it puts it back.
test.afterEach(() => setLanguage('en'));

/**
 * A session of six items: five sorted, one marked for removal, and one answer
 * given so that the order is not simply the wishlist order.
 *
 * @returns {{ session: import('../src/ranking.js').RankingSession,
 *             items: import('../src/model.js').WishlistItem[] }}
 */
function makeSession() {
  // App ids of a realistic size, so that no number of the code — a status, a
  // pixel, a colour — can pass for one by accident.
  const items = makeItems(6, { startAppId: 620000 });
  const session = createSession({ items });
  for (const item of items.slice(0, 5)) session.setCategory(item.appId, 'must');
  session.setCategory(items[5].appId, 'remove');
  session.submitAnswer('a', { a: items[1].appId, b: items[0].appId });
  return { session, items };
}

/* ------------------------------------------------------- the order */

test('the link carries the app ids in the order of the result', () => {
  const { session } = makeSession();
  const result = session.getResult();

  assert.deepEqual(
    bookmarkletAppIds(result),
    [...result.entries.map((entry) => entry.appId), ...result.removed.map((item) => item.appId)],
  );
});

test('the items marked for removal go last, and none of them is lost', () => {
  const { session, items } = makeSession();
  const appIds = bookmarkletAppIds(session.getResult());

  assert.equal(appIds.length, items.length);
  assert.equal(appIds.at(-1), items[5].appId);
  assert.deepEqual([...appIds].sort(), items.map((item) => item.appId).sort());
});

test('the answer given is visible in the order the link carries', () => {
  const { session, items } = makeSession();
  const appIds = bookmarkletAppIds(session.getResult());

  // `items[1]` was preferred over `items[0]`, so it stands before it.
  assert.ok(appIds.indexOf(items[1].appId) < appIds.indexOf(items[0].appId));
});

/* -------------------------------------------------------- the body */

test('the body is the request Steam answers: Reorder, double brackets, priorities 1…N', async () => {
  const { session } = makeSession();
  const appIds = bookmarkletAppIds(session.getResult());
  const { sent } = await runBookmarklet(session);

  assert.equal(sent.url, REORDER_URL);
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.credentials, 'include');

  const body = JSON.parse(sent.options.body);
  assert.equal(body.m, 'Reorder');
  assert.equal(body.mp.length, 1, 'mp holds exactly one element, and that element is the list');
  assert.deepEqual(
    body.mp[0],
    appIds.map((appId, index) => ({ appid: appId, priority: index + 1 })),
  );
});

test('the header Steam demands of a write is sent', async () => {
  const { session } = makeSession();
  const { sent } = await runBookmarklet(session);

  // Without this header the very same request comes back 400 with an empty
  // body, and nothing in that answer says why. This test is the guard.
  assert.equal(sent.options.headers['X-Valve-Request-Type'], 'mutationAction');
  assert.equal(sent.options.headers['Content-Type'], 'application/json; charset=utf-8');
});

/* -------------------------------------------------- what is in the link */

test('the link is a javascript: url and nothing else, in either language', () => {
  const { session } = makeSession();

  for (const language of ['en', 'ru']) {
    setLanguage(language);
    const url = bookmarkletUrl(session.getResult());

    assert.ok(url.startsWith('javascript:'));
    // Percent encoding is what makes the rest safe in an href and in a
    // bookmark — and `'` is the one character it leaves alone, so a stray
    // apostrophe in a message would end up in the address itself.
    assert.doesNotMatch(url, /[\s"'<>]/, `the ${language} link holds a character that has to be encoded`);
  }
});

test('the link carries no title, no store url and no address of our own server', () => {
  const { session, items } = makeSession();
  const decoded = decodeURIComponent(bookmarkletUrl(session.getResult()).slice('javascript:'.length));

  for (const item of items) {
    assert.ok(!decoded.includes(item.title), `the title ${item.title} leaked into the link`);
    assert.ok(!decoded.includes(item.url), 'a store url leaked into the link');
  }
  assert.ok(!decoded.includes('localhost'));
  assert.ok(!decoded.includes('/api/'));
});

test('the order lives in one array and is repeated nowhere else in the link', () => {
  const { session } = makeSession();
  const result = session.getResult();
  const decoded = decodeURIComponent(bookmarkletUrl(result).slice('javascript:'.length));

  const array = /A=(\[[\d,]*\])/.exec(decoded);
  assert.ok(array, 'the app ids are not where they are supposed to be');
  assert.deepEqual(JSON.parse(array[1]), bookmarkletAppIds(result));

  // Everything outside that array is code and interface text. An app id found
  // there would mean the order is stated twice, and two statements of one
  // order are one statement too many.
  const rest = decoded.replace(array[0], '');
  for (const appId of bookmarkletAppIds(result)) {
    assert.ok(!rest.includes(String(appId)), `${appId} appears outside the order`);
  }
});

test('a title full of quotes and brackets cannot break the code', () => {
  const items = makeItems(2);
  items[0] = { ...items[0], title: `');alert("x");//<\/script>` };
  const session = createSession({ items });
  for (const item of items) session.setCategory(item.appId, 'must');

  const decoded = decodeURIComponent(
    bookmarkletUrl(session.getResult()).slice('javascript:'.length),
  );
  assert.ok(!decoded.includes('alert'));
  // The source still parses: an escaping bug would show up as a syntax error.
  assert.doesNotThrow(() => new Function(decoded));
});

test('every message the bookmarklet can show is embedded, in the chosen language', () => {
  const { session } = makeSession();

  for (const language of ['en', 'ru']) {
    setLanguage(language);
    const decoded = decodeURIComponent(
      bookmarkletUrl(session.getResult()).slice('javascript:'.length),
    );
    for (const key of BOOKMARKLET_TEXT_KEYS) {
      const text = bookmarkletTexts(6)[key.slice('bookmarklet.'.length)];
      assert.ok(text.length > 0, `${key} is empty in ${language}`);
      assert.ok(decoded.includes(JSON.stringify(text).slice(1, -1)), `${key} is missing from the link`);
    }
  }
});

test('the count in the confirmation is the number of items the link carries', () => {
  assert.match(bookmarkletTexts(6).confirm, /6 items/);
  assert.match(bookmarkletTexts(1).confirm, /1 item\b/);

  setLanguage('ru');
  assert.match(bookmarkletTexts(2).confirm, /2 позиции/);
  assert.match(bookmarkletTexts(5).confirm, /5 позиций/);
});

/* ------------------------------------------------------ empty list */

test('an empty list gets no link at all', () => {
  const session = createSession({ items: [] });
  assert.throws(() => bookmarkletUrl(session.getResult()), /empty/);
});

test('a list where everything is marked for removal still has an order to write', () => {
  const items = makeItems(3);
  const session = createSession({ items });
  for (const item of items) session.setCategory(item.appId, 'remove');

  // Nothing is deleted by this write: the three keep their places at the end.
  assert.deepEqual(bookmarkletAppIds(session.getResult()), items.map((item) => item.appId));
  assert.ok(bookmarkletUrl(session.getResult()).startsWith('javascript:'));
});

/* ----------------------------------------------- running the source */

test('a page that is not the Steam wishlist gets a message and no request', async () => {
  const { session } = makeSession();
  const { sent, panel } = await runBookmarklet(session, {
    hostname: 'example.com',
    pathname: '/wishlist/id/somebody',
    confirm: false,
  });

  assert.equal(sent, null, 'nothing may be sent from a page that is not the wishlist');
  assert.ok(panel.text.includes('store.steampowered.com/wishlist'));
});

test('the wishlist path is required as well as the host', async () => {
  const { session } = makeSession();
  const { sent } = await runBookmarklet(session, {
    hostname: 'store.steampowered.com',
    pathname: '/app/1509510/',
    confirm: false,
  });

  assert.equal(sent, null);
});

test('nothing is sent until the confirmation is pressed', async () => {
  const { session } = makeSession();
  const { sent, panel } = await runBookmarklet(session, { confirm: false });

  assert.equal(sent, null);
  // The irreversible half has to be in the text of that confirmation.
  assert.match(panel.text, /cannot be undone/i);
  assert.match(panel.text, /priority/i);
});

test('a second click while the panel is open does not send a second request', async () => {
  const { session } = makeSession();
  const page = makePage();
  const source = decodeURIComponent(bookmarkletUrl(session.getResult()).slice('javascript:'.length));

  await runSource(source, page, { confirm: true });
  const first = page.sent.length;
  await runSource(source, page, { confirm: true });

  assert.equal(first, 1);
  assert.equal(page.sent.length, 1, 'the open panel is the guard against a double write');
});

test('every answer Steam can give is turned into a message of its own', async () => {
  const { session } = makeSession();
  const cases = [
    [{ status: 200, body: '{"data":{"result":1}}' }, /accepted/i],
    [{ status: 200, body: '{"data":{"result":2}}' }, /refused/i],
    [{ status: 200, body: '{"ok":true}' }, /neither confirms nor denies/i],
    [{ status: 400, body: '' }, /400/],
    [{ status: 401, body: '' }, /session/i],
    [{ status: 403, body: '' }, /session/i],
    [{ status: 200, body: '<html><a href="/login">Sign in</a></html>' }, /session/i],
    [{ status: 413, body: '' }, /too big/i],
    [{ status: 429, body: '' }, /too many requests/i],
    [{ status: 503, body: '' }, /Steam’s side/],
    [{ status: 418, body: 'teapot' }, /refused/i],
    ['throw', /never reached Steam/i],
  ];

  for (const [answer, expected] of cases) {
    const { panel } = await runBookmarklet(session, { answer });
    assert.match(panel.text, expected, `answer ${JSON.stringify(answer)} said: ${panel.text}`);
  }
});

test('a successful write asks the user to reload and look, because nothing is read back', async () => {
  const { session } = makeSession();
  const { panel } = await runBookmarklet(session);

  assert.match(panel.text, /reload/i);
});

test('closing the panel takes it off the page, and a new click works again', async () => {
  const { session } = makeSession();
  const page = makePage();
  const source = decodeURIComponent(bookmarkletUrl(session.getResult()).slice('javascript:'.length));

  await runSource(source, page, { confirm: true });
  assert.ok(page.document.getElementById(PANEL_ID));

  page.press(/^(Close|Закрыть)$/);
  assert.equal(page.document.getElementById(PANEL_ID), null);

  await runSource(source, page, { confirm: true });
  assert.equal(page.sent.length, 2);
});

/* ------------------------------------------------------- the fake page */

/**
 * The smallest page the generated code can run on: enough of `document` to
 * build the panel, and a record of every button so that a test can press one.
 *
 * A real DOM is not needed and would hide what the code touches — this stub
 * fails loudly the moment the bookmarklet reaches for something new.
 *
 * @param {{ hostname?: string, pathname?: string }} [where]
 * @returns {object}
 */
function makePage(where = {}) {
  const nodes = new Map();

  /** @returns {object} A node just complete enough for the code above. */
  function makeNode(tag) {
    const node = {
      tag,
      id: '',
      type: '',
      textContent: '',
      style: { cssText: '' },
      onclick: null,
      children: [],
      appendChild(child) {
        // Setting `textContent` on a container is how the code clears it.
        node.children.push(child);
        child.parent = node;
        return child;
      },
      remove() {
        if (node.id) nodes.delete(node.id);
        if (node.parent) node.parent.children = node.parent.children.filter((one) => one !== node);
      },
      set text(value) {
        node.textContent = value;
      },
    };
    return new Proxy(node, {
      set(target, name, value) {
        if (name === 'textContent') target.children = [];
        if (name === 'id' && value) nodes.set(value, target);
        target[name] = value;
        return true;
      },
    });
  }

  const body = makeNode('body');
  const page = {
    sent: [],
    document: {
      body,
      createElement: makeNode,
      getElementById: (id) => nodes.get(id) ?? null,
    },
    location: {
      hostname: where.hostname ?? 'store.steampowered.com',
      pathname: where.pathname ?? '/wishlist/id/somebody/',
    },
    /** Every button currently on the panel, in the order they were added. */
    buttons() {
      const found = [];
      const walk = (node) => {
        if (node.tag === 'button') found.push(node);
        for (const child of node.children) walk(child);
      };
      walk(body);
      return found;
    },
    /** The text the panel shows right now. */
    text() {
      const parts = [];
      const walk = (node) => {
        if (node.textContent) parts.push(node.textContent);
        for (const child of node.children) walk(child);
      };
      walk(body);
      return parts.join('\n');
    },
    /**
     * Presses the first button whose label matches.
     *
     * @param {RegExp} label
     */
    press(label) {
      const button = page.buttons().find((one) => label.test(one.textContent));
      assert.ok(button, `no button matching ${label} — the panel showed: ${page.text()}`);
      button.onclick();
    },
  };
  return page;
}

/**
 * Runs the generated source against a fake page and a fake `fetch`.
 *
 * @param {string} source
 * @param {object} page
 * @param {{ confirm?: boolean, answer?: object|'throw' }} [options]
 * @returns {Promise<void>}
 */
async function runSource(source, page, options = {}) {
  const answer = options.answer ?? { status: 200, body: '{"data":{"result":1}}' };

  const fetchStub = (url, init) => {
    page.sent.push({ url, options: init });
    if (answer === 'throw') return Promise.reject(new Error('failed to fetch'));
    return Promise.resolve({
      status: answer.status,
      text: () => Promise.resolve(answer.body),
    });
  };

  // The source is a plain script: it reads `document`, `location` and `fetch`
  // off the scope it runs in, and here that scope is this function's arguments.
  const run = new Function('document', 'location', 'fetch', source);
  run(page.document, page.location, fetchStub);

  if (options.confirm === false) return;
  const write = page.buttons().find((one) => /^(Write the order|Записать порядок)$/.test(one.textContent));
  if (!write) return;
  write.onclick();
  // Two turns of the microtask queue: `text()` and then the answer.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Builds the link of a session and runs it, in one call.
 *
 * @param {import('../src/ranking.js').RankingSession} session
 * @param {{ hostname?: string, pathname?: string, confirm?: boolean,
 *           answer?: object|'throw' }} [options]
 * @returns {Promise<{ sent: object|null, panel: { text: string } }>}
 */
async function runBookmarklet(session, options = {}) {
  const page = makePage(options);
  const source = decodeURIComponent(bookmarkletUrl(session.getResult()).slice('javascript:'.length));
  await runSource(source, page, options);
  return { sent: page.sent[0] ?? null, panel: { text: page.text() } };
}

/* ---------------------------------------------------------- the code */

test('the generated source parses and holds no address but Steam’s', () => {
  const code = bookmarkletCode([1, 2, 3], bookmarkletTexts(3));

  assert.doesNotThrow(() => new Function(code));
  const addresses = [...code.matchAll(/https?:\/\/[^"']+/g)].map((match) => match[0]);
  assert.deepEqual(addresses, [REORDER_URL]);
});

test('the generated source carries no carriage return of the file it lives in', () => {
  // A CRLF checkout would otherwise pad the address with a `%0D` per line.
  assert.doesNotMatch(bookmarkletCode([1], bookmarkletTexts(1)), /\r/);
});
