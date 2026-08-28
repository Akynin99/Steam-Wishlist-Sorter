/**
 * Tests for the userscript that reads the wishlist off the Steam page.
 *
 * A userscript is a standalone file Tampermonkey loads, so it exports nothing
 * the way a module does. What it can do is notice that there is no `document`
 * around — which is the case under `node --test` — and hand over the half that
 * decides *what is read* instead of building a panel. Every function of that
 * half takes the document it should read as an argument, so the tests give it a
 * mock of the markup: `tests/helpers/wishlist-page.js` holds both the page
 * Steam serves now and the one it served before.
 *
 * Nothing here goes near the network or a live Steam page. What is being
 * checked is the failure that has no symptoms: a wishlist of a hundred and
 * sixty six entries read as fourteen and handed over as if it were the whole
 * thing.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocument, el } from './helpers/dom.js';
import { appIdAt, currentLayout, oldLayout } from './helpers/wishlist-page.js';

await import('../userscripts/steam-wishlist-export.user.js');

const {
  buildPageOrder,
  findRows,
  findScroller,
  judgePageRead,
  parseDraggableId,
  readAppId,
  readImageUrl,
  readKind,
  readOffset,
  readRowIndex,
  readTitle,
} = globalThis.__swsExportTestApi;

/**
 * Everything the script would read out of the page as it stands right now —
 * the same pass `collect()` makes on every scroll step.
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
    const index = readRowIndex(row);
    const offset = readOffset(row, scroller);
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

// ============================================================================
// The anchor of the current layout
// ============================================================================

test('the drag and drop anchor gives up the app id and the place in the list', () => {
  assert.deepEqual(parseDraggableId('WishlistItem-294100-0'), { appId: 294100, index: 0 });
  assert.deepEqual(parseDraggableId('WishlistItem-440-165'), { appId: 440, index: 165 });
});

test('the anchor is read whatever case it is written in, and with spaces around it', () => {
  assert.deepEqual(parseDraggableId('wishlistitem-294100-7'), { appId: 294100, index: 7 });
  assert.deepEqual(parseDraggableId('  WishlistItem-294100-7  '), { appId: 294100, index: 7 });
});

test('a renamed anchor still gives the app id: the name of it is not what is being matched', () => {
  assert.deepEqual(parseDraggableId('WishlistEntry-294100-3'), { appId: 294100, index: 3 });
});

test('an anchor without a number gives the app id and no place', () => {
  assert.deepEqual(parseDraggableId('WishlistItem-294100'), { appId: 294100, index: null });
});

test('rubbish in the attribute is read as nothing at all, never as an app id', () => {
  for (const value of [
    '',
    '   ',
    null,
    undefined,
    'WishlistItem',
    'WishlistItem-',
    'WishlistItem-abc-0',
    'WishlistItem-294100-0-1',
    'WishlistItem--0',
    '294100-0', // no name in front: some other draggable thing, not a wishlist row
    'WishlistItem-0-4', // app id zero is not an app id
    'droppable-column-1',
  ]) {
    assert.equal(parseDraggableId(value), null, `expected ${JSON.stringify(value)} to be read as nothing`);
  }
});

// ============================================================================
// Reading the rows off the current page
// ============================================================================

test('rows of the current layout are found by the anchor, before any class name is tried', () => {
  const page = currentLayout({ indexes: [0, 1, 2] });
  const found = findRows(page.document);

  assert.equal(found.route, '[data-rfd-draggable-id]');
  assert.deepEqual(
    found.rows.map((row) => readAppId(row)),
    [appIdAt(0), appIdAt(1), appIdAt(2)],
  );
  assert.deepEqual(
    found.rows.map((row) => readRowIndex(row)),
    [0, 1, 2],
  );
});

test('a row whose anchor is rubbish is dropped rather than read as some other game', () => {
  const page = currentLayout({ indexes: [0, 1, 2], draggableIds: { 1: 'droppable-list-0' } });
  const found = findRows(page.document);

  // The rubbish row still holds a link to the store, so it is found through
  // that — but by its own app id, and with no place in the list.
  const rubbish = found.rows.find((row) => readRowIndex(row) === null);
  assert.equal(readAppId(rubbish), appIdAt(1));
});

test('the title, the capsule and the type are read out of a row that names no class', () => {
  const page = currentLayout({ indexes: [0, 1], dlcIndexes: [1] });
  const [game, dlc] = findRows(page.document).rows;

  assert.equal(readTitle(game, appIdAt(0)), 'Sample game 1');
  assert.match(readImageUrl(game, appIdAt(0)), new RegExp(`/apps/${appIdAt(0)}/`));
  assert.equal(readKind(game), 'unknown', 'no mark on the page means unknown, never a guessed "game"');
  assert.equal(readKind(dlc), 'dlc');
});

// ============================================================================
// The scrolling element
// ============================================================================

test('the scrolling element is taken from the hints when one of them fits', () => {
  const page = currentLayout();
  const found = findScroller(page.document);

  assert.equal(found.scroller, page.scroller);
  assert.equal(found.route, '#StoreTemplate');
});

test('a hint that scrolls but holds no rows is passed over for the one that holds them', () => {
  const page = currentLayout({ decoy: true });
  const found = findScroller(page.document);

  assert.equal(found.scroller, page.scroller, 'scrolling a sidebar loads no wishlist rows');
  assert.equal(found.route, '#StoreTemplate');
});

test('when no hint fits, the scrolling element is found by measuring the ancestors of a row', () => {
  // The next redesign, in one line: the container keeps its generated class
  // name and loses every id and every class the script knows.
  const page = currentLayout({ scrollerId: null });
  const found = findScroller(page.document);

  assert.equal(found.scroller, page.scroller);
  assert.equal(found.route, 'measured the ancestors of a row');
});

test('a page where nothing scrolls is reported as scrolling itself, not as a container', () => {
  const page = currentLayout({ scrollerId: null, scrollHeight: 720, clientHeight: 720 });
  const found = findScroller(page.document);

  assert.equal(found.scroller, null);
  assert.equal(found.route, 'the page itself');
});

test('the old layout still finds its own container by name', () => {
  const page = oldLayout();
  const found = findScroller(page.document);

  assert.equal(found.scroller, page.scroller);
  assert.equal(found.route, '#wishlist_ctn');
});

// ============================================================================
// The order of the list
// ============================================================================

test('the order comes from the number in the anchor, not from the coordinates', () => {
  // Two windows of a virtualized list, rendered one after the other at the very
  // same coordinates — which is what makes a coordinate worthless here.
  const first = currentLayout({ indexes: [0, 1, 2, 3], stackFromTop: true });
  const second = currentLayout({ indexes: [100, 101, 102, 103], stackFromTop: true });

  const entries = harvest(second, harvest(first));
  const order = buildPageOrder(entries);

  assert.deepEqual(
    order.entries.map((entry) => entry.index),
    [0, 1, 2, 3, 100, 101, 102, 103],
  );
});

test('the old layout, which numbers nothing, is ordered by where the rows sit', () => {
  const page = oldLayout();
  const order = buildPageOrder(harvest(page));

  assert.deepEqual(
    order.entries.map((entry) => entry.appId),
    [440, 730, 570],
    'the rows stand in the markup in one order and on the screen in another; the screen wins',
  );
  assert.equal(order.expectedTotal, null);
  assert.equal(order.complete, null, 'a layout that numbers no rows can promise nothing about being whole');
});

test('a row with no number is put after the numbered ones instead of into an invented place', () => {
  const order = buildPageOrder([
    { appId: 3, index: null, offset: 10, seq: 0 },
    { appId: 1, index: 0, offset: 900, seq: 1 },
    { appId: 2, index: 1, offset: 800, seq: 2 },
  ]);

  assert.deepEqual(
    order.entries.map((entry) => entry.appId),
    [1, 2, 3],
  );
});

// ============================================================================
// Completeness: the point of the whole exercise
// ============================================================================

test('a list read whole is called whole', () => {
  const page = currentLayout({ indexes: Array.from({ length: 40 }, (_, index) => index) });
  const order = buildPageOrder(harvest(page));

  assert.equal(order.expectedTotal, 40);
  assert.deepEqual(order.missingIndexes, []);
  assert.equal(order.complete, true);
});

test('a list with a hole in the numbering is called incomplete, and the hole is named', () => {
  // The scroll jumped: the top of the list and its very last row were read, and
  // everything in between was not.
  const top = currentLayout({ indexes: [0, 1, 2, 3] });
  const bottom = currentLayout({ indexes: [165] });

  const order = buildPageOrder(harvest(bottom, harvest(top)));

  assert.equal(order.expectedTotal, 166);
  assert.equal(order.missingIndexes.length, 161);
  assert.equal(order.missingIndexes[0], 4);
  assert.equal(order.complete, false);
});

test('the verdict on a list with a hole refuses it and says the two numbers out loud', () => {
  const verdict = judgePageRead({
    collected: 5,
    expectedTotal: 166,
    missingIndexes: Array.from({ length: 161 }, (_, offset) => offset + 4),
    reachedBottom: true,
    timedOut: false,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'gaps');
  assert.match(verdict.message, /166/);
  assert.match(verdict.message, /5 were read/);
  assert.match(verdict.message, /incomplete/i);
});

test('the verdict on a whole list is the only one that lets a file be handed over', () => {
  const verdict = judgePageRead({
    collected: 166,
    expectedTotal: 166,
    missingIndexes: [],
    reachedBottom: true,
    timedOut: false,
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, null);
});

test('an empty page is a refusal of its own, not an empty result', () => {
  const verdict = judgePageRead({ collected: 0, expectedTotal: null, reachedBottom: true, timedOut: false });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'empty');
});

test('a reading stopped by hand is a refusal even when the numbering has no hole in it', () => {
  const verdict = judgePageRead({
    collected: 14,
    expectedTotal: 14,
    missingIndexes: [],
    reachedBottom: false,
    timedOut: false,
    cancelled: true,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'cancelled');
});

test('a reading that ran out of time is a refusal, whatever the numbering says', () => {
  const verdict = judgePageRead({
    collected: 120,
    expectedTotal: 120,
    missingIndexes: [],
    reachedBottom: false,
    timedOut: true,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'timeout');
});

test('a reading that never reached the bottom is a refusal — this is the fourteen of a hundred and sixty six', () => {
  // The list was never scrolled, so the only rows seen were the ones the page
  // rendered on its own. They number 0…13 without a gap, and their numbering
  // knows nothing of the rest — which is exactly why the bottom has to be
  // reached before a numbering may be believed.
  const verdict = judgePageRead({
    collected: 14,
    expectedTotal: 14,
    missingIndexes: [],
    reachedBottom: false,
    timedOut: false,
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'no-bottom');
});

test('a layout that numbers nothing is allowed through, and told that it vouches for nothing', () => {
  const verdict = judgePageRead({ collected: 3, expectedTotal: null, reachedBottom: true, timedOut: false });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, 'unnumbered');
  assert.match(verdict.message, /numbers no/);
});

// ============================================================================
// The layout Steam served before
// ============================================================================

test('the old selectors still read the old page: rows, app ids, titles and the type', () => {
  const page = oldLayout({
    rows: [
      { appId: 440, title: 'Team Fortress 2', top: 0 },
      { appId: 570, title: 'Dota 2', top: 104, dlc: true },
    ],
  });
  const found = findRows(page.document);

  assert.equal(found.route, '.wishlist_row');
  assert.deepEqual(
    found.rows.map((row) => readAppId(row)),
    [440, 570],
  );
  assert.equal(readTitle(found.rows[0], 440), 'Team Fortress 2');
  assert.match(readImageUrl(found.rows[0], 440), /\/apps\/440\//);
  assert.equal(readKind(found.rows[1]), 'dlc');
  assert.deepEqual(
    found.rows.map((row) => readRowIndex(row)),
    [null, null],
    'the old page numbers no rows, and nothing is invented for it',
  );
});

test('a page that names nothing at all is still read through its links to the store', () => {
  const page = {
    document: createDocument([
      el('main', {}, [
        el('article', {}, [el('a', { href: '/app/620/' }, [el('span', { $text: 'Portal 2' })])]),
        el('article', {}, [el('a', { href: '/app/400/' }, [el('span', { $text: 'Portal' })])]),
      ]),
    ]),
  };
  const found = findRows(page.document);

  assert.equal(found.route, 'fallback parsing by /app/ links');
  assert.deepEqual(
    found.rows.map((row) => readAppId(row)),
    [620, 400],
  );
});
