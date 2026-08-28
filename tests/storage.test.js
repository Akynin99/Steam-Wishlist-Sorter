import assert from 'node:assert/strict';
import test from 'node:test';

import { createSession } from '../src/ranking.js';
import {
  APP_SIGNATURE,
  STORAGE_KEY,
  StateStorage,
  StorageError,
  createEmptyState,
  createMemoryBackend,
  validateState,
} from '../src/storage.js';
import { makeItems } from './helpers/fixtures.js';

/**
 * A `localStorage` stub that also records what was written, so the tests can
 * check the module never touches anything but its own key.
 */
function createStubBackend() {
  const backend = createMemoryBackend();
  const writes = [];
  return {
    writes,
    getItem: backend.getItem,
    setItem(key, value) {
      writes.push(key);
      backend.setItem(key, value);
    },
    removeItem: backend.removeItem,
  };
}

test('nothing is stored until something is saved', () => {
  const storage = new StateStorage({ backend: createStubBackend() });

  assert.equal(storage.has(), false);
  assert.equal(storage.load(), null);
  assert.equal(storage.key, STORAGE_KEY);
});

test('a state survives the round trip through the backend', () => {
  const backend = createStubBackend();
  const storage = new StateStorage({ backend });

  const items = makeItems(3, { withoutCovers: [1] });
  const session = createSession({ items });
  session.setCategory(items[0].appId, 'must');
  session.setCategory(items[1].appId, 'must');
  session.submitAnswer('a', { a: items[1].appId, b: items[0].appId });

  const state = createEmptyState();
  state.session = session.serialize();
  state.settings.loadCovers = false;

  storage.save(state);
  const loaded = storage.load();

  assert.equal(loaded.app, APP_SIGNATURE);
  assert.equal(loaded.settings.loadCovers, false);
  assert.deepEqual(loaded.session, state.session);
  assert.equal(loaded.session.items[1].imageUrl, '', 'an item without a cover stays without one');
  assert.deepEqual(backend.writes, [STORAGE_KEY]);
});

test('saving stamps the time and keeps the data intact', () => {
  const storage = new StateStorage({ backend: createStubBackend() });
  const saved = storage.save(createEmptyState());

  assert.notEqual(saved.savedAt, new Date(0).toISOString());
  assert.ok(Date.parse(saved.savedAt) > 0);
});

test('a new session replaces whatever was stored', () => {
  const storage = new StateStorage({ backend: createStubBackend() });
  const state = createEmptyState();
  state.session = createSession({ items: makeItems(5) }).serialize();
  storage.save(state);

  const fresh = storage.newSession({ settings: { loadCovers: false } });

  assert.deepEqual(fresh.session.items, []);
  assert.equal(fresh.settings.loadCovers, false);
  assert.deepEqual(storage.load().session.items, []);
});

test('clear removes the state', () => {
  const storage = new StateStorage({ backend: createStubBackend() });
  storage.save(createEmptyState());
  assert.equal(storage.has(), true);

  storage.clear();

  assert.equal(storage.has(), false);
  assert.equal(storage.load(), null);
});

test('export produces readable JSON that import accepts back', () => {
  const storage = new StateStorage({ backend: createStubBackend() });
  const state = createEmptyState();
  state.session = createSession({ items: makeItems(4) }).serialize();
  storage.save(state);

  const text = storage.exportToJson();
  assert.ok(text.includes('\n  '), 'the backup file is formatted for a human');

  const empty = new StateStorage({ backend: createStubBackend() });
  const imported = empty.importFromJson(text);

  assert.equal(imported.session.items.length, 4);
  assert.deepEqual(empty.load().session, state.session);
});

test('foreign and broken files are refused with a reason', () => {
  const storage = new StateStorage({ backend: createStubBackend() });

  assert.throws(() => storage.importFromJson('{ not json'), (error) => error.code === 'invalid-json');
  assert.throws(
    () => storage.importFromJson({ app: 'some-other-tool', version: 1, session: {} }),
    (error) => error instanceof StorageError && error.code === 'foreign-state',
  );
  assert.throws(
    () => storage.importFromJson({ app: APP_SIGNATURE, version: 99, session: {} }),
    (error) => error.code === 'unsupported-version',
  );
  assert.throws(
    () => storage.importFromJson({ app: APP_SIGNATURE, version: 1 }),
    (error) => error.code === 'invalid-state',
  );
  assert.throws(() => validateState(null), (error) => error.code === 'invalid-state');
});

test('a corrupted store is reported instead of silently starting over', () => {
  const backend = createStubBackend();
  backend.setItem(STORAGE_KEY, 'total garbage');
  const storage = new StateStorage({ backend });

  assert.throws(() => storage.load(), (error) => error.code === 'invalid-json');
});

test('a backend that refuses to write reports it as a storage error', () => {
  const storage = new StateStorage({
    backend: {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    },
  });

  assert.throws(() => storage.save(createEmptyState()), (error) => error.code === 'write-failed');
});

test('the default settings enable covers, and an old file without settings still loads', () => {
  const storage = new StateStorage({ backend: createStubBackend() });
  const state = validateState({
    app: APP_SIGNATURE,
    version: 1,
    session: createSession().serialize(),
  });

  assert.equal(state.settings.loadCovers, true);
  assert.ok(storage.save(state));
});
