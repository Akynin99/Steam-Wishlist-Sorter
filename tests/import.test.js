import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ImportError, SKIP_REASONS, importItems, importItemsSorted } from '../src/import.js';
import { steamHeaderImageUrl, steamStoreUrl } from '../src/model.js';

const readFixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('an empty wishlist imports into an empty list', () => {
  const { items, report } = importItems([]);

  assert.deepEqual(items, []);
  assert.deepEqual(report, { total: 0, added: 0, updated: 0, duplicates: 0, skipped: 0, issues: [] });
});

test('an empty object imports as an empty map, not as an error', () => {
  const { items, report } = importItems('{}');

  assert.equal(items.length, 0);
  assert.equal(report.total, 0);
});

test('one, two and three items keep their order and their count', () => {
  for (const count of [1, 2, 3]) {
    const input = Array.from({ length: count }, (_, index) => ({
      appid: 100 + index,
      name: `Game ${index}`,
    }));
    const { items, report } = importItems(input);

    assert.equal(items.length, count);
    assert.equal(report.added, count);
    assert.deepEqual(items.map((item) => item.appId), input.map((entry) => entry.appid));
    assert.deepEqual(items.map((item) => item.wishlistPosition), input.map((_, index) => index + 1));
  }
});

test('two hundred items import without loss', () => {
  const input = Array.from({ length: 200 }, (_, index) => ({
    appid: 1000 + index,
    name: `Game ${index}`,
    priority: index + 1,
  }));
  const { items, report } = importItems(input);

  assert.equal(items.length, 200);
  assert.equal(report.added, 200);
  assert.equal(report.skipped, 0);
  assert.equal(new Set(items.map((item) => item.appId)).size, 200);
});

test('a JSON string is parsed, and broken JSON is reported as such', () => {
  const { items } = importItems('[{"appid": 440, "name": "Team Fortress 2"}]');
  assert.equal(items[0].title, 'Team Fortress 2');

  assert.throws(() => importItems('{ not json'), (error) => error instanceof ImportError && error.code === 'invalid-json');
  assert.throws(() => importItems(''), (error) => error.code === 'empty-input');
  assert.throws(() => importItems(42), (error) => error.code === 'unrecognized-format');
  assert.throws(() => importItems({ foo: 'bar' }), (error) => error.code === 'unrecognized-format');
});

test('the old Steam map format is understood, covers included', () => {
  const { items, report } = importItemsSorted(readFixture('steam-wishlistdata.json'));

  assert.equal(report.added, 4);
  assert.equal(report.skipped, 0);
  assert.deepEqual(items.map((item) => item.appId), [620, 440, 323180, 570]);

  const tf2 = items.find((item) => item.appId === 440);
  assert.equal(tf2.title, 'Team Fortress 2');
  assert.equal(tf2.kind, 'game');
  assert.equal(
    tf2.imageUrl,
    'https://cdn.cloudflare.steamstatic.com/steam/apps/440/capsule_231x87.jpg',
    'a relative capsule path is resolved against the app directory on the CDN',
  );

  const absolute = items.find((item) => item.appId === 620);
  assert.equal(absolute.imageUrl, 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/capsule_231x87.jpg');

  assert.equal(items.find((item) => item.appId === 323180).kind, 'dlc');
});

test('priority 0 means "no priority" and falls back to the position in the input', () => {
  const { items } = importItems(readFixture('steam-wishlistdata.json'));
  const dota = items.find((item) => item.appId === 570);

  assert.equal(dota.wishlistPosition, 4, 'the fourth record of the input');
});

test('the current endpoint gives app ids only, and that is enough', () => {
  const { items, report } = importItemsSorted(readFixture('steam-wishlist-appids.json'));

  assert.equal(report.added, 4);
  assert.deepEqual(items.map((item) => item.appId), [440, 620, 570, 730]);

  const first = items[0];
  assert.equal(first.title, 'App 440', 'a placeholder title the user replaces by recognizing the cover');
  assert.equal(first.url, steamStoreUrl(440));
  assert.equal(first.imageUrl, steamHeaderImageUrl(440));
  assert.equal(first.kind, 'unknown');
});

test('a bare list of app ids is a valid wishlist', () => {
  const { items, report } = importItems([440, '620', 'app/570']);

  assert.equal(report.added, 3);
  assert.deepEqual(items.map((item) => item.appId), [440, 620, 570]);
  assert.deepEqual(items.map((item) => item.title), ['App 440', 'App 620', 'App 570']);
});

test('records without a cover get the cover URL built from the app id', () => {
  const { items } = importItems([{ appid: 730, name: 'Counter-Strike 2' }]);

  assert.equal(items[0].imageUrl, steamHeaderImageUrl(730));
  assert.equal(items[0].url, steamStoreUrl(730));
});

test('our own export format is imported back', () => {
  const first = importItems([{ appid: 440, name: 'Team Fortress 2', priority: 1 }]);
  const roundTrip = importItems({ items: first.items });

  assert.deepEqual(roundTrip.items, first.items);
  assert.equal(roundTrip.report.added, 1);
});

test('a full state dump is accepted as an item source', () => {
  const { items } = importItems({ app: 'steam-wishlist-sorter', session: { items: [{ appId: 440 }] } });

  assert.deepEqual(items.map((item) => item.appId), [440]);
});

test('invalid records are reported instead of breaking the import', () => {
  const { items, report } = importItems([
    { appid: 440, name: 'Team Fortress 2' },
    null,
    'not an app id',
    { name: 'No identity at all' },
    { appid: -1, name: 'Negative' },
    42,
  ]);

  assert.deepEqual(items.map((item) => item.appId), [440, 42]);
  assert.equal(report.added, 2);
  assert.equal(report.skipped, 4);
  assert.deepEqual(
    report.issues.map((issue) => issue.reason),
    [
      SKIP_REASONS.NOT_AN_OBJECT,
      SKIP_REASONS.INVALID_APP_ID,
      SKIP_REASONS.MISSING_APP_ID,
      SKIP_REASONS.INVALID_APP_ID,
    ],
  );
});

test('a repeated app id inside one file updates instead of duplicating', () => {
  const { items, report } = importItems([
    { appid: 440, name: 'Team Fortress 2' },
    { appid: 440, priority: 7 },
  ]);

  assert.equal(items.length, 1);
  assert.equal(report.added, 1);
  assert.equal(report.duplicates, 1);
  assert.equal(items[0].title, 'Team Fortress 2');
  assert.equal(items[0].wishlistPosition, 7);
});

test('a repeated import updates the known items and adds only the new ones', () => {
  const first = importItems(readFixture('steam-wishlist-appids.json'));
  assert.equal(first.report.added, 4);
  assert.equal(first.items[0].title, 'App 440');

  const second = importItems(
    [
      { appid: 440, name: 'Team Fortress 2', type: 'Game', priority: 1 },
      { appid: 999, name: 'Brand New', priority: 5 },
    ],
    { existing: first.items },
  );

  assert.equal(second.items.length, 5);
  assert.equal(second.report.added, 1);
  assert.equal(second.report.updated, 1);

  const tf2 = second.items.find((item) => item.appId === 440);
  assert.equal(tf2.title, 'Team Fortress 2', 'the real name replaced the placeholder');
  assert.equal(tf2.kind, 'game');
});

test('a re-import of an id-only export does not erase known titles', () => {
  const known = importItems([{ appid: 440, name: 'Team Fortress 2', type: 'Game' }]).items;
  const { items } = importItems({ response: { items: [{ appid: 440, priority: 9 }] } }, { existing: known });

  assert.equal(items[0].title, 'Team Fortress 2');
  assert.equal(items[0].kind, 'game');
  assert.equal(items[0].wishlistPosition, 9);
});

test('an explicit empty imageUrl survives the import as "no cover"', () => {
  const { items } = importItems([
    { appId: 440, title: 'Team Fortress 2', imageUrl: '' },
    { appId: 620, title: 'Portal 2' },
  ]);

  assert.equal(items[0].imageUrl, '', 'the interface shows a placeholder instead of a broken image');
  assert.equal(items[1].imageUrl, steamHeaderImageUrl(620), 'a record that says nothing still gets a cover');
});

test('a source that only omits the cover still gets one derived from the app id', () => {
  const { items } = importItems({ 440: { name: 'Team Fortress 2', capsule: '' } });

  assert.equal(items[0].imageUrl, steamHeaderImageUrl(440));
});

test('the demo wishlist is a usable set for both stages of the interface', () => {
  const { items, report } = importItemsSorted(readFixture('sample-wishlist.json'));

  assert.equal(report.total, 20);
  assert.equal(report.added, 20);
  assert.equal(report.skipped + report.duplicates, 0, 'the set shipped with the application imports cleanly');

  assert.equal(items.filter((item) => item.kind === 'dlc').length, 1, 'the DLC badge has something to show');
  assert.equal(items.filter((item) => item.imageUrl === '').length, 2, 'the cover placeholder has something to show');
  assert.ok(
    items.every((item) => item.title && !/^app \d+$/i.test(item.title)),
    'every entry carries a real game name',
  );
  assert.deepEqual(
    items.map((item) => item.wishlistPosition),
    Array.from({ length: 20 }, (_, index) => index + 1),
    'the positions are the wishlist order, without gaps',
  );
});
