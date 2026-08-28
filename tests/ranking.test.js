import assert from 'node:assert/strict';
import test from 'node:test';

import { createItem } from '../src/model.js';
import { RankingError, RankingSession, createSession, deserializeSession } from '../src/ranking.js';
import { categorizeAll, createOracle, makeItems, mulberry32, runSorting } from './helpers/fixtures.js';

/**
 * Builds a session where every item sits in the same category.
 *
 * @param {number} count
 * @param {string} category
 * @returns {{ session: import('../src/ranking.js').RankingSession, items: object[] }}
 */
function sessionOf(count, category = 'must') {
  const items = makeItems(count);
  const session = createSession({ items });
  categorizeAll(session, items, category);
  return { session, items };
}

const idsOf = (result) => result.entries.map((entry) => entry.appId);

/* --------------------------------------------------------------- sizes */

test('an empty session has nothing to ask and an empty result', () => {
  const session = createSession();

  assert.equal(session.getNextPair(), null);
  assert.deepEqual(session.getResult().entries, []);
  assert.equal(session.getResult().summary.complete, true);

  const progress = session.getProgress();
  assert.equal(progress.comparisons, 0);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.percent, 100);
  assert.equal(progress.done, true);
});

test('a single item needs no comparison and is already the result', () => {
  const { session, items } = sessionOf(1);

  assert.equal(session.getNextPair(), null);
  assert.equal(session.getProgress().done, true);

  const result = session.getResult();
  assert.deepEqual(idsOf(result), [items[0].appId]);
  assert.equal(result.entries[0].position, 1);
  assert.equal(result.entries[0].resolved, true);
});

test('two items need exactly one comparison', () => {
  const { session, items } = sessionOf(2);
  const [first, second] = items;

  const pair = session.getNextPair();
  assert.ok(pair);
  assert.deepEqual([pair.a.appId, pair.b.appId].sort(), [first.appId, second.appId].sort());
  assert.equal(pair.forced, false);

  session.submitAnswer(pair.a.appId === second.appId ? 'a' : 'b');

  assert.equal(session.getNextPair(), null);
  assert.equal(session.getProgress().comparisons, 1);
  assert.deepEqual(idsOf(session.getResult()), [second.appId, first.appId]);
});

test('three items are sorted by two comparisons: the third is implied', () => {
  const { session, items } = sessionOf(3);
  const rank = new Map(items.map((item, index) => [item.appId, index]));
  const given = runSorting(session, (pair) => (rank.get(pair.a.appId) < rank.get(pair.b.appId) ? 'a' : 'b'));

  assert.equal(given, 2, 'transitivity answers the third pair for free');
  assert.deepEqual(idsOf(session.getResult()), items.map((item) => item.appId));
});

test('two hundred items converge to the order of a consistent oracle', () => {
  const items = makeItems(200);
  const session = createSession({ items });
  categorizeAll(session, items, 'want');

  const oracle = createOracle(items, mulberry32(20260828));
  const given = runSorting(session, (pair) => oracle.answer(pair.a, pair.b), { limit: 5000 });

  const result = session.getResult();
  assert.deepEqual(idsOf(result), oracle.order, 'the ranking matches the oracle exactly');
  assert.equal(result.summary.resolved, 200, 'every position is backed by comparisons');
  assert.equal(session.getProgress().done, true);
  assert.equal(session.getProgress().percent, 100);

  const naive = (200 * 199) / 2;
  assert.ok(given < 2000, `expected far fewer than n^2 comparisons, got ${given}`);
  assert.ok(given < naive / 8, `${given} comparisons is not enough of a saving against ${naive}`);
  assert.ok(given > 1000, `${given} comparisons looks too good to be true for 200 items`);
});

test('the estimate of what is left is in the order of n log n and shrinks as answers come in', () => {
  const { session } = sessionOf(100);
  const start = session.getProgress();

  assert.ok(start.remaining > 100 * Math.log2(100) * 0.5, `too optimistic: ${start.remaining}`);
  assert.ok(start.remaining < 100 * Math.log2(100) * 1.5, `too pessimistic: ${start.remaining}`);
  assert.equal(start.percent, 0);

  let previous = start.total;
  for (let i = 0; i < 30; i += 1) {
    session.submitAnswer('a');
    const progress = session.getProgress();
    assert.ok(progress.comparisons + progress.remaining === progress.total);
    assert.ok(progress.total <= previous + 1, 'the estimate does not run away from the user');
    previous = progress.total;
  }
  assert.ok(session.getProgress().percent > 0);
});

/* ---------------------------------------------------------------- ties */

test('a tie puts both items into one group, ordered by the wishlist', () => {
  const { session, items } = sessionOf(2);

  session.submitAnswer('tie');

  const result = session.getResult();
  assert.deepEqual(idsOf(result), [items[0].appId, items[1].appId]);
  assert.equal(result.entries[1].tiedWithPrevious, true);
  assert.equal(result.entries[0].group, result.entries[1].group);
  assert.equal(session.getNextPair(), null);
});

test('a run of ties collapses a whole category into one group', () => {
  const { session, items } = sessionOf(5);
  const given = runSorting(session, () => 'tie');

  assert.equal(given, 4, 'each new item is tied to the single existing group');

  const result = session.getResult();
  assert.deepEqual(idsOf(result), items.map((item) => item.appId), 'stable order inside the group');
  assert.equal(new Set(result.entries.map((entry) => entry.group)).size, 1);
  assert.equal(result.summary.resolved, 5);
});

test('undoing a tie splits the group again', () => {
  const { session, items } = sessionOf(3);

  session.submitAnswer('tie');
  assert.equal(session.getResult().entries[1].tiedWithPrevious, true);

  session.undo();

  const result = session.getResult();
  assert.equal(result.entries[1].tiedWithPrevious, false);
  assert.equal(new Set(result.entries.map((entry) => entry.group)).size, 3);
  assert.equal(session.getProgress().comparisons, 0);
  assert.deepEqual(idsOf(result), items.map((item) => item.appId));
});

test('ties survive a reload', () => {
  const { session, items } = sessionOf(4);
  runSorting(session, () => 'tie');

  const restored = deserializeSession(JSON.parse(JSON.stringify(session.serialize())));
  const result = restored.getResult();

  assert.deepEqual(idsOf(result), items.map((item) => item.appId));
  assert.equal(new Set(result.entries.map((entry) => entry.group)).size, 1);
});

/* ------------------------------------------------------------ deferral */

test('a postponed pair steps aside and the scheduler keeps working', () => {
  const { session } = sessionOf(6);
  const first = session.getNextPair();

  session.defer();

  const second = session.getNextPair();
  assert.ok(second);
  assert.notEqual(
    [second.a.appId, second.b.appId].sort().join(':'),
    [first.a.appId, first.b.appId].sort().join(':'),
  );
  assert.equal(second.forced, false);
  assert.equal(session.getProgress().deferred, 1);
  assert.equal(session.getProgress().comparisons, 0);
});

test('when every available pair is postponed the first one comes back, flagged', () => {
  const { session, items } = sessionOf(3);

  const first = session.getNextPair();
  assert.equal(first.a.appId, items[1].appId);
  assert.equal(first.b.appId, items[0].appId);
  session.defer();

  const second = session.getNextPair();
  assert.equal(second.forced, false, 'another pair is still available');
  session.defer();

  const deadlock = session.getNextPair();
  assert.equal(deadlock.forced, true, 'nothing can move without an answer');
  assert.equal(deadlock.reason, 'all-deferred');
  assert.equal(deadlock.a.appId, first.a.appId);
  assert.equal(deadlock.b.appId, first.b.appId);

  // Postponing a forced pair must not loop: the queue rotates to the next one.
  session.defer();
  const rotated = session.getNextPair();
  assert.equal(rotated.forced, true);
  assert.equal(rotated.a.appId, second.a.appId);
  assert.equal(rotated.b.appId, second.b.appId);

  // And answering one of them unblocks the sorting.
  session.submitAnswer('a');
  const next = session.getNextPair();
  assert.ok(next);
  assert.equal(session.getProgress().comparisons, 1);
});

test('a single postponed pair in a two item category comes back forced', () => {
  const { session } = sessionOf(2);

  session.defer();
  const forced = session.getNextPair();

  assert.equal(forced.forced, true);
  assert.equal(forced.reason, 'all-deferred');

  session.defer();
  assert.equal(session.getNextPair().forced, true, 'the only pair keeps coming back');

  session.submitAnswer('b');
  assert.equal(session.getNextPair(), null);
  assert.equal(session.getProgress().deferred, 0);
});

test('a postponed pair that transitivity later answers leaves the queue', () => {
  const { session, items } = sessionOf(4);

  // Postpone the very first pair, then order the rest.
  const postponed = session.getNextPair();
  session.defer();
  assert.equal(session.getProgress().deferred, 1);

  const rank = new Map(items.map((item, index) => [item.appId, index]));
  runSorting(session, (pair) => (rank.get(pair.a.appId) < rank.get(pair.b.appId) ? 'a' : 'b'));

  assert.equal(session.getProgress().deferred, 0, 'the pair is no longer a question');
  assert.notEqual(session.getResult().summary.total, 0);
  assert.ok(postponed);
});

/* ---------------------------------------------------------------- undo */

test('undo takes back the last answer together with the scheduler state', () => {
  const { session } = sessionOf(4);
  const before = session.getNextPair();

  session.submitAnswer('a');
  assert.equal(session.getProgress().comparisons, 1);

  assert.equal(session.undo(), true);
  assert.equal(session.getProgress().comparisons, 0);

  const after = session.getNextPair();
  assert.equal(after.a.appId, before.a.appId);
  assert.equal(after.b.appId, before.b.appId);
});

test('several undos in a row walk the session back to the start', () => {
  const { session } = sessionOf(6);
  const first = session.getNextPair();

  const answers = [];
  for (let i = 0; i < 3; i += 1) {
    const pair = session.getNextPair();
    answers.push([pair.a.appId, pair.b.appId]);
    session.submitAnswer('a');
  }
  assert.equal(session.getProgress().comparisons, 3);

  while (session.canUndo()) session.undo();

  assert.equal(session.getProgress().comparisons, 0);
  assert.equal(session.canUndo(), false);
  assert.equal(session.undo(), false);

  const restarted = session.getNextPair();
  assert.equal(restarted.a.appId, first.a.appId);
  assert.equal(restarted.b.appId, first.b.appId);
});

test('undo also takes back a postponement', () => {
  const { session } = sessionOf(4);
  const first = session.getNextPair();

  session.defer();
  assert.equal(session.getProgress().deferred, 1);

  session.undo();
  assert.equal(session.getProgress().deferred, 0);

  const again = session.getNextPair();
  assert.equal(again.a.appId, first.a.appId);
  assert.equal(again.b.appId, first.b.appId);
});

/* ------------------------------------------------------- serialization */

test('a session saved mid-sorting resumes on exactly the same pair', () => {
  const items = makeItems(30);
  const session = createSession({ items });
  categorizeAll(session, items, 'must');
  const oracle = createOracle(items, mulberry32(7));

  for (let i = 0; i < 12; i += 1) {
    const pair = session.getNextPair();
    session.submitAnswer(oracle.answer(pair.a, pair.b));
  }
  session.defer();

  const saved = JSON.parse(JSON.stringify(session.serialize()));
  const restored = deserializeSession(saved);

  const expected = session.getNextPair();
  const actual = restored.getNextPair();
  assert.equal(actual.a.appId, expected.a.appId);
  assert.equal(actual.b.appId, expected.b.appId);
  assert.deepEqual(restored.getProgress(), session.getProgress());
  assert.deepEqual(idsOf(restored.getResult()), idsOf(session.getResult()));

  // Finishing both sessions leads to the same ranking.
  runSorting(session, (pair) => oracle.answer(pair.a, pair.b));
  runSorting(restored, (pair) => oracle.answer(pair.a, pair.b));
  assert.deepEqual(idsOf(restored.getResult()), oracle.order);
  assert.deepEqual(idsOf(session.getResult()), oracle.order);
  assert.deepEqual(restored.serialize(), session.serialize());
});

test('the static shorthand deserializes the same way', () => {
  const { session } = sessionOf(3);
  session.submitAnswer('a');

  const restored = RankingSession.deserialize(session.serialize());
  assert.deepEqual(restored.serialize(), session.serialize());
});

test('deserialize refuses data that is not a session of a known version', () => {
  assert.throws(() => deserializeSession(null), (error) => error.code === 'invalid-state');
  assert.throws(() => deserializeSession({ version: 99 }), (error) => error.code === 'unsupported-version');
});

/* ------------------------------------------------------------ removal */

test('an item removed in the middle of the sorting does not break the state', () => {
  const { session, items } = sessionOf(6);
  const rank = new Map(items.map((item, index) => [item.appId, index]));

  for (let i = 0; i < 4; i += 1) {
    const pair = session.getNextPair();
    session.submitAnswer(rank.get(pair.a.appId) < rank.get(pair.b.appId) ? 'a' : 'b');
  }

  const victim = items[2];
  assert.equal(session.removeItem(victim.appId), true);
  assert.equal(session.removeItem(victim.appId), false);
  assert.equal(session.itemCount, 5);

  const pair = session.getNextPair();
  assert.ok(pair, 'the sorting continues');
  assert.ok(pair.a.appId !== victim.appId && pair.b.appId !== victim.appId);

  runSorting(session, (nextPair) => (rank.get(nextPair.a.appId) < rank.get(nextPair.b.appId) ? 'a' : 'b'));

  const result = session.getResult();
  assert.equal(result.entries.length, 5);
  assert.equal(result.entries.some((entry) => entry.appId === victim.appId), false);
  assert.deepEqual(
    idsOf(result),
    items.filter((item) => item.appId !== victim.appId).map((item) => item.appId),
  );
});

/* --------------------------------------------------------- categories */

test('categories dominate the final order and the remove bucket stays out of it', () => {
  const items = makeItems(6);
  const session = createSession({ items });

  session.setCategory(items[0].appId, 'meh');
  session.setCategory(items[1].appId, 'must');
  session.setCategory(items[2].appId, 'remove');
  session.setCategory(items[3].appId, 'want');
  session.setCategory(items[4].appId, 'must');
  // items[5] stays unclassified

  runSorting(session, () => 'a');

  const result = session.getResult();
  assert.deepEqual(
    result.entries.map((entry) => entry.category),
    ['must', 'must', 'want', 'meh', null],
  );
  assert.deepEqual(result.removed.map((item) => item.appId), [items[2].appId]);
  assert.equal(result.summary.removed, 1);
  assert.equal(result.entries.length, 5);
  assert.deepEqual(result.entries.map((entry) => entry.position), [1, 2, 3, 4, 5]);
});

test('items of different categories are never compared', () => {
  const items = makeItems(2);
  const session = createSession({ items });
  session.setCategory(items[0].appId, 'must');
  session.setCategory(items[1].appId, 'want');

  assert.equal(session.getNextPair(), null);
  assert.throws(
    () => session.submitAnswer('a', { a: items[0].appId, b: items[1].appId }),
    (error) => error instanceof RankingError && error.code === 'cross-category',
  );
});

test('the remove bucket is never offered for comparison', () => {
  const items = makeItems(3);
  const session = createSession({ items });
  categorizeAll(session, items, 'remove');

  assert.equal(session.getNextPair(), null);
  assert.equal(session.getResult().entries.length, 0);
  assert.equal(session.getResult().removed.length, 3);
});

test('only the chosen categories are sorted', () => {
  const items = makeItems(8);
  const session = createSession({ items });
  items.forEach((item, index) => session.setCategory(item.appId, index < 4 ? 'must' : 'maybe'));

  session.setSortedCategories(['must']);
  assert.deepEqual(session.getSortedCategories(), ['must']);

  const asked = [];
  runSorting(session, (pair) => {
    asked.push(pair.category);
    return 'b';
  });

  assert.ok(asked.length > 0);
  assert.equal(asked.every((category) => category === 'must'), true);
  assert.equal(session.getProgress().done, true);

  const result = session.getResult();
  assert.deepEqual(
    result.entries.slice(4).map((entry) => entry.appId),
    items.slice(4).map((item) => item.appId),
    'the categories left out keep the wishlist order',
  );
  assert.equal(result.entries.slice(4).every((entry) => entry.resolved === false), true);

  // Widening the selection resumes the sorting where it stopped.
  session.setSortedCategories(null);
  assert.ok(session.getNextPair());
  assert.equal(session.getNextPair().category, 'maybe');
});

test('moving an item to another category parks its answers and moving it back restores them', () => {
  const { session, items } = sessionOf(3);
  const rank = new Map(items.map((item, index) => [item.appId, index]));
  runSorting(session, (pair) => (rank.get(pair.a.appId) < rank.get(pair.b.appId) ? 'a' : 'b'));
  assert.equal(session.getProgress().comparisons, 2);

  session.setCategory(items[1].appId, 'want');
  assert.equal(session.getProgress().comparisons, 0, 'answers across categories stop counting');

  session.setCategory(items[1].appId, 'must');
  assert.equal(session.getProgress().comparisons, 2, 'and come back with the item');
  assert.deepEqual(idsOf(session.getResult()), items.map((item) => item.appId));
});

/* ------------------------------------------------------ partial result */

test('a half finished sorting still gives a usable list', () => {
  const { session, items } = sessionOf(4);
  const [one, two, three, four] = items;

  // A single answer: the second item is above the first.
  session.submitAnswer('a', { a: two.appId, b: one.appId });

  const result = session.getResult();
  assert.deepEqual(idsOf(result), [two.appId, one.appId, three.appId, four.appId]);
  assert.equal(result.entries[0].resolved, true, 'the answered part is trusted');
  assert.equal(result.entries[1].resolved, false, 'below it the fallback order begins');
  assert.equal(result.summary.resolved, 1);
  assert.equal(result.summary.fallback, 3);
  assert.equal(result.summary.complete, false);

  const progress = session.getProgress();
  assert.equal(progress.comparisons, 1);
  assert.ok(progress.remaining > 0);
  assert.ok(progress.percent > 0 && progress.percent < 100);
});

test('the fallback order follows the wishlist, not the insertion order', () => {
  const items = [
    createItem({ appId: 30, title: 'Third', wishlistPosition: 3 }),
    createItem({ appId: 10, title: 'First', wishlistPosition: 1 }),
    createItem({ appId: 20, title: 'Second', wishlistPosition: 2 }),
  ];
  const session = createSession({ items });
  categorizeAll(session, items, 'must');

  assert.deepEqual(idsOf(session.getResult()), [10, 20, 30]);
});

/* ----------------------------------------------------------- integrity */

test('an answer that contradicts the graph is refused', () => {
  const { session, items } = sessionOf(3);
  const [a, b, c] = items;

  session.submitAnswer('a', { a: a.appId, b: b.appId });
  session.submitAnswer('a', { a: b.appId, b: c.appId });

  assert.throws(
    () => session.submitAnswer('a', { a: c.appId, b: a.appId }),
    (error) => error instanceof RankingError && error.code === 'contradiction',
  );
  assert.throws(
    () => session.submitAnswer('tie', { a: a.appId, b: c.appId }),
    (error) => error instanceof RankingError && error.code === 'contradiction',
  );
  assert.throws(
    () => session.submitAnswer('a', { a: a.appId, b: a.appId }),
    (error) => error.code === 'same-item',
  );
  assert.throws(() => session.submitAnswer('maybe-later'), (error) => error.code === 'unknown-verdict');
});

test('the scheduler never asks a pair the graph already implies', () => {
  const items = makeItems(40);
  const session = createSession({ items });
  categorizeAll(session, items, 'must');
  const oracle = createOracle(items, mulberry32(99));

  const asked = new Set();
  runSorting(session, (pair) => {
    const key = [pair.a.appId, pair.b.appId].sort().join(':');
    assert.equal(asked.has(key), false, `pair ${key} was asked twice`);
    asked.add(key);
    return oracle.answer(pair.a, pair.b);
  });

  assert.deepEqual(idsOf(session.getResult()), oracle.order);
});
