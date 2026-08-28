/**
 * End to end checks over the three core modules: import, ranking and storage.
 * They stand in for the scenario the user actually runs — import a wishlist,
 * classify it, compare part of it, close the tab, come back.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { importItemsSorted } from '../src/import.js';
import { createSession, deserializeSession } from '../src/ranking.js';
import { StateStorage, createEmptyState, createMemoryBackend } from '../src/storage.js';
import { createOracle, makeItems, mulberry32 } from './helpers/fixtures.js';

const readFixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('import, classify, compare halfway, reload, finish', () => {
  const items = makeItems(24, { withoutCovers: [3, 11] });
  const session = createSession({ items });
  items.forEach((item, index) => {
    session.setCategory(item.appId, index % 3 === 0 ? 'must' : index % 3 === 1 ? 'want' : 'maybe');
  });

  const oracle = createOracle(items, mulberry32(4242));
  for (let i = 0; i < 20; i += 1) {
    const pair = session.getNextPair();
    assert.ok(pair, 'there is still something to ask');
    session.submitAnswer(oracle.answer(pair.a, pair.b));
  }

  const storage = new StateStorage({ backend: createMemoryBackend() });
  const state = createEmptyState();
  state.session = session.serialize();
  storage.save(state);

  // "Reloading the page": nothing but the stored JSON survives.
  const restored = deserializeSession(storage.load().session);
  const expected = session.getNextPair();
  const actual = restored.getNextPair();
  assert.equal(actual.a.appId, expected.a.appId);
  assert.equal(actual.b.appId, expected.b.appId);

  let pair = restored.getNextPair();
  while (pair) {
    restored.submitAnswer(oracle.answer(pair.a, pair.b));
    pair = restored.getNextPair();
  }

  const result = restored.getResult();
  assert.equal(result.summary.total, 24);
  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.resolved, 24);

  // Categories dominate, and inside each one the oracle order is reproduced.
  const rankOfCategory = { must: 0, want: 1, maybe: 2 };
  const categories = result.entries.map((entry) => entry.category);
  assert.deepEqual(categories, [...categories].sort((a, b) => rankOfCategory[a] - rankOfCategory[b]));

  for (const category of ['must', 'want', 'maybe']) {
    const inCategory = result.entries.filter((entry) => entry.category === category);
    const byOracle = [...inCategory].sort(
      (a, b) => oracle.rankOf.get(a.appId) - oracle.rankOf.get(b.appId),
    );
    assert.deepEqual(inCategory.map((entry) => entry.appId), byOracle.map((entry) => entry.appId));
  }
});

test('a repeated import keeps the categories and the comparisons', () => {
  const first = importItemsSorted(readFixture('steam-wishlist-appids.json'));
  const session = createSession({ items: first.items });
  for (const item of first.items) session.setCategory(item.appId, 'must');

  const pair = session.getNextPair();
  session.submitAnswer('a');
  const comparisons = session.getProgress().comparisons;
  assert.equal(comparisons, 1);

  // The same wishlist is imported again, this time with real titles.
  const second = importItemsSorted(
    [
      { appid: 440, name: 'Team Fortress 2', type: 'Game', priority: 1 },
      { appid: 620, name: 'Portal 2', type: 'Game', priority: 2 },
      { appid: 570, name: 'Dota 2', type: 'Game', priority: 3 },
      { appid: 730, name: 'Counter-Strike 2', type: 'Game', priority: 4 },
      { appid: 1091500, name: 'Cyberpunk 2077', type: 'Game', priority: 5 },
    ],
    { existing: first.items },
  );
  session.setItems(second.items);

  assert.equal(session.itemCount, 5, 'no duplicates appeared');
  assert.equal(session.getItem(440).title, 'Team Fortress 2');
  assert.equal(session.getCategory(440), 'must', 'the category survived');
  assert.equal(session.getProgress().comparisons, comparisons, 'the answer survived');
  assert.equal(session.getCategory(1091500), null, 'a new item is not classified yet');

  const result = session.getResult();
  assert.equal(result.entries.length, 5);
  const answered = result.entries.filter((entry) => [pair.a.appId, pair.b.appId].includes(entry.appId));
  assert.equal(answered.length, 2);
});

test('the result of an abandoned session is still an honest list', () => {
  const items = makeItems(50);
  const session = createSession({ items });
  for (const item of items) session.setCategory(item.appId, 'want');

  const oracle = createOracle(items, mulberry32(1));
  /** @type {Array<[number, number]>} Pairs as `[winner, loser]`. */
  const answered = [];
  for (let i = 0; i < 15; i += 1) {
    const pair = session.getNextPair();
    const verdict = oracle.answer(pair.a, pair.b);
    answered.push(verdict === 'a' ? [pair.a.appId, pair.b.appId] : [pair.b.appId, pair.a.appId]);
    session.submitAnswer(verdict);
  }

  const result = session.getResult();
  assert.equal(result.summary.total, 50);
  assert.equal(result.summary.complete, false);
  assert.ok(result.summary.resolved > 0, 'part of the list is backed by comparisons');
  assert.ok(result.summary.fallback > 0, 'and the rest is honestly marked as not sorted');
  assert.equal(result.summary.resolved + result.summary.fallback, 50);
  assert.deepEqual(result.entries.map((entry) => entry.position), items.map((_, index) => index + 1));

  // Every answer the user did give must hold in the partial list.
  const positionOf = new Map(result.entries.map((entry) => [entry.appId, entry.position]));
  for (const [winner, loser] of answered) {
    assert.ok(
      positionOf.get(winner) < positionOf.get(loser),
      `app ${winner} was placed above ${loser} by the user but not by the result`,
    );
  }

  // The items nobody compared keep the wishlist order among themselves.
  const compared = new Set(answered.flat());
  const untouched = result.entries
    .filter((entry) => !compared.has(entry.appId))
    .map((entry) => entry.item.wishlistPosition);
  assert.ok(untouched.length > 0);
  assert.deepEqual(untouched, [...untouched].sort((a, b) => a - b));
});
