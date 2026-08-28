/**
 * Persistence of the application state.
 *
 * The module knows nothing about the DOM: it talks to a backend object with
 * the three methods `localStorage` happens to provide (`getItem`, `setItem`,
 * `removeItem`). The tests pass a stub, the browser passes `localStorage`, and
 * a future move to IndexedDB only has to replace that object.
 *
 * Nothing here ever sends anything anywhere: the state stays in the browser of
 * the user, and export is a file they save themselves.
 */

import { DEFAULT_LANGUAGE, normalizeLanguage } from './i18n.js';
import { createSession } from './ranking.js';

/** Key the state is stored under. */
export const STORAGE_KEY = 'steam-wishlist-sorter/state';

/** Signature written into every state file, to reject foreign JSON. */
export const APP_SIGNATURE = 'steam-wishlist-sorter';

/** Version of the state envelope. */
export const STATE_FORMAT_VERSION = 1;

/** Error thrown by the storage wrapper. */
export class StorageError extends Error {
  /**
   * @param {string} code Machine readable reason.
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

/**
 * @typedef {Object} AppState
 * @property {string} app       Application signature.
 * @property {number} version   Envelope version.
 * @property {string} savedAt   ISO timestamp of the last save.
 * @property {{ loadCovers: boolean, language: string }} settings
 * @property {object} session   Output of `RankingSession.serialize()`.
 */

/**
 * In-memory backend with the `localStorage` interface. Used by the tests and
 * as a fallback when the browser denies access to `localStorage` (private mode
 * with storage blocked), so the application keeps working for one session.
 *
 * @param {Record<string, string>} [initial]
 * @returns {{ getItem(key: string): string|null,
 *             setItem(key: string, value: string): void,
 *             removeItem(key: string): void }}
 */
export function createMemoryBackend(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
  };
}

/**
 * Returns `localStorage` when it is usable, an in-memory backend otherwise.
 *
 * @returns {{ getItem: Function, setItem: Function, removeItem: Function }}
 */
export function detectBackend() {
  try {
    const candidate = globalThis.localStorage;
    if (!candidate) return createMemoryBackend();
    const probe = `${STORAGE_KEY}/probe`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return createMemoryBackend();
  }
}

/**
 * A blank state: no items, no answers, covers enabled, interface in English.
 *
 * @returns {AppState}
 */
export function createEmptyState() {
  return {
    app: APP_SIGNATURE,
    version: STATE_FORMAT_VERSION,
    savedAt: new Date(0).toISOString(),
    settings: { loadCovers: true, language: DEFAULT_LANGUAGE },
    session: createSession().serialize(),
  };
}

/**
 * Checks the envelope and fills in what an older or hand-edited file may miss.
 *
 * @param {unknown} data
 * @returns {AppState}
 * @throws {StorageError} When the data is not a state of this application.
 */
export function validateState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new StorageError('invalid-state', 'Storage: the state is not an object');
  }
  if (data.app !== APP_SIGNATURE) {
    throw new StorageError('foreign-state', 'Storage: this JSON is not a state of this application');
  }
  if (data.version !== STATE_FORMAT_VERSION) {
    throw new StorageError(
      'unsupported-version',
      `Storage: state version ${data.version} is not supported (expected ${STATE_FORMAT_VERSION})`,
    );
  }
  if (!data.session || typeof data.session !== 'object') {
    throw new StorageError('invalid-state', 'Storage: the state has no session');
  }

  return {
    app: APP_SIGNATURE,
    version: STATE_FORMAT_VERSION,
    savedAt: typeof data.savedAt === 'string' ? data.savedAt : new Date(0).toISOString(),
    settings: {
      loadCovers: data.settings?.loadCovers !== false,
      // A file saved before the interface became bilingual has no language at
      // all, and a hand-edited one may hold anything: both read as English
      // rather than as a broken file.
      language: normalizeLanguage(data.settings?.language),
    },
    session: data.session,
  };
}

/**
 * Reads and writes the application state through a swappable backend.
 */
export class StateStorage {
  #backend;
  #key;

  /**
   * @param {{ backend?: object, key?: string }} [options]
   *        `backend` defaults to `localStorage` when it is available.
   */
  constructor(options = {}) {
    this.#backend = options.backend ?? detectBackend();
    this.#key = options.key ?? STORAGE_KEY;
  }

  /** @returns {string} The key this instance writes to. */
  get key() {
    return this.#key;
  }

  /** @returns {boolean} Whether a state is stored. */
  has() {
    return this.#backend.getItem(this.#key) !== null;
  }

  /**
   * Reads the stored state.
   *
   * @returns {AppState|null} `null` when nothing has been saved yet.
   * @throws {StorageError} When what is stored cannot be read; the interface
   *         catches this and offers to start over.
   */
  load() {
    const text = this.#backend.getItem(this.#key);
    if (text === null || text === '') return null;
    return validateState(parseJson(text));
  }

  /**
   * Writes the state, stamping the save time. Called after every user action,
   * so an interrupted session is never lost.
   *
   * @param {AppState} state
   * @returns {AppState} The state as it was written.
   * @throws {StorageError} When the backend refuses the write.
   */
  save(state) {
    const validated = validateState(state);
    validated.savedAt = new Date().toISOString();
    try {
      this.#backend.setItem(this.#key, JSON.stringify(validated));
    } catch (error) {
      throw new StorageError('write-failed', `Storage: could not save the state (${error.message})`);
    }
    return validated;
  }

  /** Removes the stored state. */
  clear() {
    this.#backend.removeItem(this.#key);
  }

  /**
   * Starts a new empty session and stores it, replacing whatever was there.
   *
   * @param {{ settings?: { loadCovers?: boolean, language?: string } }} [options]
   * @returns {AppState}
   */
  newSession(options = {}) {
    const state = createEmptyState();
    if (options.settings) state.settings = { ...state.settings, ...options.settings };
    return this.save(state);
  }

  /**
   * The state as JSON text for the user to save as a backup file.
   *
   * @param {AppState} [state] Defaults to the stored state.
   * @returns {string}
   */
  exportToJson(state) {
    const source = state ?? this.load() ?? createEmptyState();
    return JSON.stringify(validateState(source), null, 2);
  }

  /**
   * Reads a backup file and stores it as the current state.
   *
   * @param {string|object} input JSON text or already parsed data.
   * @returns {AppState}
   * @throws {StorageError} When the file is not a state of this application.
   */
  importFromJson(input) {
    const data = typeof input === 'string' ? parseJson(input) : input;
    return this.save(validateState(data));
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 * @throws {StorageError}
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new StorageError('invalid-json', `Storage: the state is not valid JSON (${error.message})`);
  }
}
