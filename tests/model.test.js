import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CATEGORIES,
  UNCATEGORIZED,
  categoryRank,
  compareByWishlistPosition,
  createItem,
  isCategoryId,
  isPlaceholderTitle,
  isSortableCategory,
  mergeItemFields,
  normalizeAppId,
  normalizeKind,
  steamHeaderImageUrl,
  steamStoreUrl,
} from '../src/model.js';

test('normalizeAppId accepts the shapes Steam actually produces', () => {
  assert.equal(normalizeAppId(440), 440);
  assert.equal(normalizeAppId('440'), 440);
  assert.equal(normalizeAppId(' 440 '), 440);
  assert.equal(normalizeAppId('app/440'), 440);

  assert.equal(normalizeAppId(0), null);
  assert.equal(normalizeAppId(-5), null);
  assert.equal(normalizeAppId(4.5), null);
  assert.equal(normalizeAppId('half-life'), null);
  assert.equal(normalizeAppId(''), null);
  assert.equal(normalizeAppId(null), null);
  assert.equal(normalizeAppId(undefined), null);
  assert.equal(normalizeAppId({}), null);
});

test('createItem derives everything that can be derived from the app id', () => {
  const item = createItem({ appId: 440 });

  assert.equal(item.appId, 440);
  assert.equal(item.title, 'App 440');
  assert.equal(item.url, steamStoreUrl(440));
  assert.equal(item.imageUrl, steamHeaderImageUrl(440));
  assert.equal(item.wishlistPosition, 0);
  assert.equal(item.kind, 'unknown');
});

test('createItem keeps an explicitly empty cover empty', () => {
  assert.equal(createItem({ appId: 440, imageUrl: '' }).imageUrl, '');
  assert.equal(createItem({ appId: 440, imageUrl: null }).imageUrl, '');
  assert.equal(createItem({ appId: 440 }).imageUrl, steamHeaderImageUrl(440));
});

test('createItem rejects an item without a usable identity', () => {
  assert.throws(() => createItem({ title: 'No id' }), TypeError);
  assert.throws(() => createItem({ appId: 'nope' }), TypeError);
  assert.throws(() => createItem(null), TypeError);
});

test('normalizeKind maps the Steam vocabulary to three kinds', () => {
  assert.equal(normalizeKind('Game'), 'game');
  assert.equal(normalizeKind('DLC'), 'dlc');
  assert.equal(normalizeKind('game_dlc'), 'dlc');
  assert.equal(normalizeKind('Music'), 'unknown');
  assert.equal(normalizeKind(true), 'dlc');
  assert.equal(normalizeKind(undefined), 'unknown');
});

test('categories are ordered from the most wanted to the least wanted', () => {
  assert.deepEqual(
    CATEGORIES.map((category) => category.id),
    ['must', 'want', 'maybe', 'unlikely', 'meh', 'remove'],
  );
  assert.ok(categoryRank('must') < categoryRank('want'));
  assert.ok(categoryRank('meh') < categoryRank('remove'));
  assert.ok(categoryRank('meh') < categoryRank(UNCATEGORIZED));

  assert.equal(isSortableCategory('must'), true);
  assert.equal(isSortableCategory(UNCATEGORIZED), true, 'unclassified items are still sorted');
  assert.equal(isSortableCategory('remove'), false, 'the remove bucket never takes part');

  assert.equal(isCategoryId('maybe'), true);
  assert.equal(isCategoryId(UNCATEGORIZED), true);
  assert.equal(isCategoryId('wishlist'), false);
});

test('a placeholder title never overwrites a known one on merge', () => {
  const known = createItem({ appId: 440, title: 'Team Fortress 2', kind: 'game' });
  const merged = mergeItemFields(known, { title: 'App 440', wishlistPosition: 3 });

  assert.equal(merged.title, 'Team Fortress 2');
  assert.equal(merged.wishlistPosition, 3);
  assert.equal(merged.kind, 'game');
  assert.equal(isPlaceholderTitle('App 440'), true);
  assert.equal(isPlaceholderTitle('Team Fortress 2'), false);
});

test('merging keeps a known cover and a known kind', () => {
  const known = createItem({ appId: 620, title: 'Portal 2', imageUrl: 'https://example.test/p2.jpg', kind: 'game' });
  const merged = mergeItemFields(known, { imageUrl: '', kind: 'unknown' });

  assert.equal(merged.imageUrl, 'https://example.test/p2.jpg');
  assert.equal(merged.kind, 'game');
});

test('the fallback comparator is stable and total', () => {
  const items = [
    createItem({ appId: 3, wishlistPosition: 2 }),
    createItem({ appId: 1, wishlistPosition: 1 }),
    createItem({ appId: 2, wishlistPosition: 2 }),
  ];
  const sorted = [...items].sort(compareByWishlistPosition);

  assert.deepEqual(sorted.map((item) => item.appId), [1, 2, 3]);
  assert.equal(compareByWishlistPosition(items[0], items[0]), 0);
});
