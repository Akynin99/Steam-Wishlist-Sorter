/**
 * Helpers shared by the tests: synthetic wishlists, a deterministic random
 * generator and a preference oracle to play the part of the user.
 *
 * The file lives in `tests/helpers/` on purpose: the test runner only picks up
 * `*.test.js`, so nothing here is executed as a test suite of its own.
 */

import { createItem } from '../../src/model.js';

/**
 * Builds `count` synthetic items in wishlist order.
 *
 * @param {number} count
 * @param {{ startAppId?: number, withoutCovers?: number[] }} [options]
 * @returns {import('../../src/model.js').WishlistItem[]}
 */
export function makeItems(count, options = {}) {
  const start = options.startAppId ?? 1000;
  const withoutCovers = new Set(options.withoutCovers ?? []);
  return Array.from({ length: count }, (_, index) =>
    createItem({
      appId: start + index,
      title: `Game ${String(index + 1).padStart(3, '0')}`,
      wishlistPosition: index + 1,
      kind: index % 7 === 6 ? 'dlc' : 'game',
      ...(withoutCovers.has(index) ? { imageUrl: '' } : {}),
    }),
  );
}

/**
 * Small deterministic PRNG, so that a failing run can always be reproduced.
 *
 * @param {number} seed
 * @returns {() => number} Values in [0, 1).
 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle driven by the given generator.
 *
 * @template T
 * @param {T[]} array
 * @param {() => number} random
 * @returns {T[]} A new array.
 */
export function shuffle(array, random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * A consistent preference oracle: a random but fixed total order over the
 * items. It answers every comparison the same way a real, self-consistent user
 * would, which is what lets a test assert the algorithm converged to the truth.
 *
 * @param {import('../../src/model.js').WishlistItem[]} items
 * @param {() => number} random
 * @returns {{ order: number[], rankOf: Map<number, number>, answer: (a: object, b: object) => 'a'|'b' }}
 */
export function createOracle(items, random) {
  const order = shuffle(items.map((item) => item.appId), random);
  const rankOf = new Map(order.map((appId, index) => [appId, index]));
  return {
    order,
    rankOf,
    answer: (a, b) => (rankOf.get(a.appId) < rankOf.get(b.appId) ? 'a' : 'b'),
  };
}

/**
 * Assigns every item the same category.
 *
 * @param {import('../../src/ranking.js').RankingSession} session
 * @param {import('../../src/model.js').WishlistItem[]} items
 * @param {string} category
 */
export function categorizeAll(session, items, category) {
  for (const item of items) session.setCategory(item.appId, category);
}

/**
 * Runs the whole sorting with the given answer function.
 *
 * @param {import('../../src/ranking.js').RankingSession} session
 * @param {(pair: object) => string} answer
 * @param {{ limit?: number }} [options] Safety net against a scheduler that loops.
 * @returns {number} How many answers were given.
 */
export function runSorting(session, answer, options = {}) {
  const limit = options.limit ?? 100000;
  let given = 0;
  let pair = session.getNextPair();
  while (pair) {
    if (given >= limit) throw new Error(`runSorting: more than ${limit} comparisons, the scheduler is looping`);
    session.submitAnswer(answer(pair), pair);
    given += 1;
    pair = session.getNextPair();
  }
  return given;
}
