/**
 * The decisions of the result screen, checked without a browser.
 *
 * The screen draws the rows, the ring and the transfer card; what it decides
 * before drawing them lives in `result-view.js` and is checked here — which
 * state a row is in, how much of the list the comparisons carry, whether a
 * link taken a minute ago still writes the order on the screen, and whether
 * the bookmarks bar is shown with Ctrl or with the command key.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession } from '../src/ranking.js';
import {
  confirmedPercent,
  isApplePlatform,
  linkFreshness,
  orderSignature,
  rowStatus,
} from '../src/result-view.js';

/**
 * @param {number} appId
 * @param {string} title
 * @returns {object}
 */
function item(appId, title) {
  return { appId, title, url: `https://store.steampowered.com/app/${appId}/`, kind: 'game' };
}

/**
 * A session with three games in one category, so that the order inside it is
 * decided by the answers and nothing else.
 *
 * @returns {import('../src/ranking.js').RankingSession}
 */
function session() {
  const ranking = createSession();
  ranking.addItems([item(10, 'Alpha'), item(20, 'Beta'), item(30, 'Gamma')]);
  for (const appId of [10, 20, 30]) ranking.setCategory(appId, 'want');
  return ranking;
}

test('an untouched list stands in the fallback order', () => {
  const { entries } = session().getResult();

  assert.deepEqual(
    entries.map(rowStatus),
    ['fallback', 'fallback', 'fallback'],
    'without a single answer nothing is confirmed',
  );
});

test('an answer confirms the pair it settles, and only it', () => {
  const ranking = session();
  ranking.submitAnswer('a', { a: 10, b: 20 });

  const { entries } = ranking.getResult();
  assert.deepEqual(entries.map((entry) => entry.appId), [10, 20, 30]);
  // The first line is settled against the only neighbour it has; the second
  // knows what is above it and nothing about what is below.
  assert.deepEqual(entries.map(rowStatus), ['confirmed', 'fallback', 'fallback']);
});

test('a hand made placement is its own state and outranks the rest', () => {
  const ranking = session();
  ranking.submitAnswer('a', { a: 10, b: 20 });
  ranking.submitAnswer('a', { a: 20, b: 30 });
  ranking.moveItem(30, 10, 'before');

  const { entries } = ranking.getResult();
  const moved = entries.find((entry) => entry.appId === 30);
  assert.equal(moved.manual, true);
  assert.equal(rowStatus(moved), 'manual', 'the user put it there, and that is what the row says');
});

test('a tie is not a state of its own: the row keeps the state it had', () => {
  const ranking = session();
  ranking.submitAnswer('tie', { a: 10, b: 20 });

  const tied = () => ranking.getResult().entries.find((entry) => entry.tiedWithPrevious);
  assert.ok(tied(), 'an equal answer puts the two lines next to each other');
  // Being tied says something about the line above and nothing about the one
  // below, so the row is still standing in the fallback order.
  assert.equal(rowStatus(tied()), 'fallback');

  ranking.submitAnswer('a', { a: 20, b: 30 });
  assert.equal(rowStatus(tied()), 'confirmed', 'the tie survives the row becoming confirmed');
  assert.equal(tied().tiedWithPrevious, true);
});

test('the confirmed share is a whole percent, and an empty list is zero', () => {
  assert.equal(confirmedPercent({ total: 0, resolved: 0 }), 0);
  assert.equal(confirmedPercent({ total: 4, resolved: 1 }), 25);
  assert.equal(confirmedPercent({ total: 3, resolved: 1 }), 33);
  assert.equal(confirmedPercent({ total: 166, resolved: 48 }), 29);
  assert.equal(confirmedPercent({ total: 12, resolved: 12 }), 100);
  assert.equal(confirmedPercent(undefined), 0, 'a missing summary must not divide by zero');
});

test('the signature is the order the link would write, and nothing else', () => {
  const ranking = session();
  const before = orderSignature(ranking.getResult());
  assert.equal(before, '10,20,30');

  // A category change that leaves the sequence alone leaves the signature
  // alone: the link carries app ids, not categories.
  ranking.submitAnswer('a', { a: 10, b: 20 });
  assert.equal(orderSignature(ranking.getResult()), before);

  ranking.moveItem(30, 10, 'before');
  assert.equal(orderSignature(ranking.getResult()), '30,10,20');
});

test('items marked for removal are in the signature, at the end', () => {
  const ranking = session();
  ranking.setCategory(20, 'remove');

  assert.equal(
    orderSignature(ranking.getResult()),
    '10,30,20',
    'the link writes them too, at the end of the list',
  );
});

test('a link is only stale once it has been taken and the order has moved', () => {
  assert.equal(linkFreshness('10,20,30', null), 'untaken');
  assert.equal(linkFreshness('10,20,30', undefined), 'untaken');
  assert.equal(linkFreshness('10,20,30', '10,20,30'), 'fresh');
  assert.equal(linkFreshness('30,10,20', '10,20,30'), 'stale');
});

test('the platform decides the shortcut, and the browser is never guessed', () => {
  assert.equal(isApplePlatform({ platform: 'MacIntel' }), true);
  assert.equal(isApplePlatform({ userAgentData: { platform: 'macOS' } }), true);
  assert.equal(isApplePlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }), true);
  assert.equal(isApplePlatform({ platform: 'Win32' }), false);
  assert.equal(isApplePlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/128.0' }), false);
  assert.equal(isApplePlatform({}), false, 'a browser that says nothing is not a Mac');
  assert.equal(isApplePlatform(), false);
});
