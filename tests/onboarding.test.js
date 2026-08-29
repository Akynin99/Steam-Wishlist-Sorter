/**
 * The flags of the one-off explanations.
 *
 * The module is deliberately free of the DOM and of the storage, so the rules
 * that matter can be checked directly: a value that cannot be read means
 * «not shown yet», an unknown name is not remembered, and the list survives a
 * round trip through the text it is stored as.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ONBOARDING_KEY,
  ONBOARDING_STAGES,
  isStageSeen,
  parseSeenStages,
  serializeSeenStages,
  withStageSeen,
} from '../src/onboarding.js';

test('the flags live under a key of their own, next to the screen', () => {
  assert.equal(ONBOARDING_KEY, 'steam-wishlist-sorter/onboarding');
  assert.notEqual(ONBOARDING_KEY, 'steam-wishlist-sorter/screen');
  assert.deepEqual([...ONBOARDING_STAGES], ['categorize', 'compare']);
});

test('nothing readable means nothing has been shown', () => {
  for (const raw of [null, undefined, '', 'not json', '{}', '"compare"', '17']) {
    assert.deepEqual(parseSeenStages(raw), [], `${String(raw)} should read as empty`);
  }
});

test('only known stage names are read back', () => {
  assert.deepEqual(parseSeenStages('["compare"]'), ['compare']);
  assert.deepEqual(parseSeenStages('["compare","result","categorize"]'), ['categorize', 'compare']);
  assert.deepEqual(parseSeenStages('["result"]'), []);
});

test('a stage is marked once and the previous list is left alone', () => {
  const empty = [];
  const one = withStageSeen(empty, 'categorize');

  assert.deepEqual(empty, []);
  assert.deepEqual(one, ['categorize']);
  assert.ok(isStageSeen(one, 'categorize'));
  assert.ok(!isStageSeen(one, 'compare'));

  const both = withStageSeen(one, 'compare');
  assert.deepEqual(both, ['categorize', 'compare']);
  assert.equal(withStageSeen(both, 'compare'), both, 'marking twice changes nothing');
  assert.equal(withStageSeen(both, 'result'), both, 'an unknown stage is not remembered');
});

test('the list survives the trip through the stored text', () => {
  const stages = withStageSeen(withStageSeen([], 'compare'), 'categorize');
  assert.deepEqual(parseSeenStages(serializeSeenStages(stages)), ['categorize', 'compare']);
  assert.deepEqual(parseSeenStages(serializeSeenStages([])), []);
  assert.deepEqual(parseSeenStages(serializeSeenStages(['result'])), []);
});
