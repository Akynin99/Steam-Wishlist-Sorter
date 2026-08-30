/**
 * The grouping behind the tier list panel.
 *
 * The panel draws rows of covers and nothing else; what it has to get right
 * before drawing them is here — that every item of the result lands in one row
 * and only one, that a row keeps the order the ranking gave it, that the scale
 * stays five rows wide even when nothing was put on some of them, and that the
 * two rows which are not part of the scale appear only when they hold
 * something.
 *
 * The sessions below are built through `ranking.js` rather than hand-written
 * as literals: the shape of a result is that module's business, and a fixture
 * copied out of it would go on passing after the shape changed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession } from '../src/ranking.js';
import { TIER_NONE, TIER_REMOVE, TIER_SCALE, buildTierList } from '../src/tier-list.js';

/**
 * @param {number} appId
 * @param {string} title
 * @param {number} [position]
 * @returns {object}
 */
function item(appId, title, position = appId) {
  return {
    appId,
    title,
    url: `https://store.steampowered.com/app/${appId}/`,
    kind: 'game',
    wishlistPosition: position,
  };
}

/**
 * A session with one item in each of the six categories and one left without.
 *
 * @returns {import('../src/ranking.js').RankingSession}
 */
function everyCategory() {
  const ranking = createSession();
  ranking.addItems([
    item(10, 'Must'),
    item(20, 'Want'),
    item(30, 'Maybe'),
    item(40, 'Unlikely'),
    item(50, 'Meh'),
    item(60, 'Remove'),
    item(70, 'Nowhere'),
  ]);
  ranking.setCategory(10, 'must');
  ranking.setCategory(20, 'want');
  ranking.setCategory(30, 'maybe');
  ranking.setCategory(40, 'unlikely');
  ranking.setCategory(50, 'meh');
  ranking.setCategory(60, 'remove');
  return ranking;
}

/**
 * @param {import('../src/tier-list.js').TierRow[]} rows
 * @returns {string[]}
 */
function ids(rows) {
  return rows.map((row) => row.id);
}

/**
 * @param {import('../src/tier-list.js').TierRow[]} rows
 * @param {string} id
 * @returns {import('../src/tier-list.js').TierRow}
 */
function row(rows, id) {
  const found = rows.find((candidate) => candidate.id === id);
  assert.ok(found, `there is no “${id}” row`);
  return found;
}

test('the scale is the five sortable categories, in the order of interest', () => {
  assert.deepEqual([...TIER_SCALE], ['must', 'want', 'maybe', 'unlikely', 'meh']);
});

test('the five rows of the scale are there even when nothing was put on them', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha')]);
  ranking.setCategory(10, 'must');

  const rows = buildTierList(ranking.getResult());

  assert.deepEqual(ids(rows), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(row(rows, 'want').items, [], 'an untouched level is an empty row, not a missing one');
});

test('an empty session still gives the scale and nothing else', () => {
  const rows = buildTierList(createSession().getResult());

  assert.deepEqual(ids(rows), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(rows.flatMap((entry) => entry.items), []);
});

test('every item of the result lands in exactly one row', () => {
  const result = everyCategory().getResult();
  const rows = buildTierList(result);

  const placed = rows.flatMap((entry) => entry.items.map((card) => card.appId));
  assert.deepEqual([...placed].sort((a, b) => a - b), [10, 20, 30, 40, 50, 60, 70]);
  assert.equal(new Set(placed).size, placed.length, 'an app id shows up in two rows');
  assert.equal(placed.length, result.entries.length + result.removed.length);
});

test('the order inside a row is the order of the entries and nothing else', () => {
  const ranking = createSession();
  // The fallback order is the wishlist order, so the three arrive 30, 20, 10
  // and stay that way until an answer says otherwise.
  ranking.addItems([item(10, 'Alpha', 3), item(20, 'Beta', 2), item(30, 'Gamma', 1)]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'want');

  const before = buildTierList(ranking.getResult());
  assert.deepEqual(row(before, 'want').items.map((card) => card.appId), [30, 20, 10]);

  ranking.submitAnswer('a', { a: 10, b: 30 });
  const result = ranking.getResult();
  const after = buildTierList(result);

  assert.deepEqual(
    row(after, 'want').items.map((card) => card.appId),
    result.entries.filter((entry) => entry.category === 'want').map((entry) => entry.appId),
    'the row follows the entries; it does not sort them again',
  );
  assert.deepEqual(row(after, 'want').items.map((card) => card.appId), [20, 10, 30]);
});

test('a card carries the place the result gave it', () => {
  const rows = buildTierList(everyCategory().getResult());

  assert.deepEqual(row(rows, 'must').items[0], {
    appId: 10,
    item: everyCategory().getItem(10),
    position: 1,
  });
});

test('the row without a category appears only when something is in it', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha'), item(70, 'Nowhere')]);
  ranking.setCategory(10, 'must');

  assert.ok(ids(buildTierList(ranking.getResult())).includes(TIER_NONE));
  assert.deepEqual(
    row(buildTierList(ranking.getResult()), TIER_NONE).items.map((card) => card.appId),
    [70],
  );

  ranking.setCategory(70, 'meh');
  assert.equal(ids(buildTierList(ranking.getResult())).includes(TIER_NONE), false);
});

test('the row without a category has no category to take a caption from', () => {
  const rows = buildTierList(everyCategory().getResult());
  const none = row(rows, TIER_NONE);

  assert.equal(none.category, null);
  assert.equal(none.onScale, false);
});

test('the removal row appears only when something is in it, and always last', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha'), item(60, 'Remove')]);
  ranking.setCategory(10, 'must');

  assert.equal(ids(buildTierList(ranking.getResult())).includes(TIER_REMOVE), false);

  ranking.setCategory(60, 'remove');
  const rows = buildTierList(ranking.getResult());
  assert.equal(rows.at(-1).id, TIER_REMOVE);
});

test('the removal row is built from `removed`, which carries no places', () => {
  const result = everyCategory().getResult();
  const removal = row(buildTierList(result), TIER_REMOVE);

  assert.deepEqual(removal.items.map((card) => card.appId), result.removed.map((entry) => entry.appId));
  assert.deepEqual(removal.items.map((card) => card.position), [null]);
  assert.deepEqual(removal.items.map((card) => card.item), result.removed);
});

test('the rows come in the order of interest, with the two apart from it at the end', () => {
  assert.deepEqual(ids(buildTierList(everyCategory().getResult())), [
    'must',
    'want',
    'maybe',
    'unlikely',
    'meh',
    TIER_NONE,
    TIER_REMOVE,
  ]);
});

test('a sorting stopped halfway groups exactly as a finished one does', () => {
  const ranking = createSession();
  ranking.addItems([
    item(10, 'Alpha', 1),
    item(20, 'Beta', 2),
    item(30, 'Gamma', 3),
    item(40, 'Delta', 4),
  ]);
  for (const appId of [10, 20]) ranking.setCategory(appId, 'must');
  for (const appId of [30, 40]) ranking.setCategory(appId, 'maybe');
  ranking.submitAnswer('b', { a: 10, b: 20 });

  const result = ranking.getResult();
  assert.equal(result.summary.complete, false, 'this sorting is meant to be unfinished');
  assert.ok(result.summary.fallback > 0, 'part of it is meant to stand in the fallback order');

  const rows = buildTierList(result);
  assert.deepEqual(row(rows, 'must').items.map((card) => card.appId), [20, 10]);
  assert.deepEqual(row(rows, 'maybe').items.map((card) => card.appId), [30, 40]);
  assert.deepEqual(
    rows.flatMap((entry) => entry.items.map((card) => card.position)),
    [1, 2, 3, 4],
    'the places are the ones the result gave, in the order the rows hold them',
  );
});

test('a hand placement moves the card, because it moved the entry', () => {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha', 1), item(20, 'Beta', 2), item(30, 'Gamma', 3)]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'want');

  assert.deepEqual(
    row(buildTierList(ranking.getResult()), 'want').items.map((card) => card.appId),
    [10, 20, 30],
  );

  ranking.moveItem(30, 10, 'before');
  assert.deepEqual(
    row(buildTierList(ranking.getResult()), 'want').items.map((card) => card.appId),
    [30, 10, 20],
  );
});

test('nothing at all is still five rows rather than a crash', () => {
  assert.deepEqual(ids(buildTierList(undefined)), ['must', 'want', 'maybe', 'unlikely', 'meh']);
  assert.deepEqual(ids(buildTierList({})), ['must', 'want', 'maybe', 'unlikely', 'meh']);
});

test('an entry with a category the model does not know joins the row without one', () => {
  // Not reachable through `setCategory()`, which validates the id — this is
  // what a state file edited by hand would look like by the time it reaches
  // the panel, and the item has to stay visible rather than vanish.
  const rows = buildTierList({
    entries: [{ appId: 99, item: item(99, 'Stray'), category: 'unheard-of', position: 1 }],
    removed: [],
  });

  assert.deepEqual(row(rows, TIER_NONE).items.map((card) => card.appId), [99]);
});
