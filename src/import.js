/**
 * Import and normalization of a wishlist.
 *
 * The user pastes whatever JSON they managed to get out of Steam, so the
 * importer accepts several shapes and never throws on a single bad record:
 * everything it could not use is collected into a report the interface shows.
 *
 * Supported input shapes:
 *  - an array of objects, one per wishlist entry;
 *  - an array of bare app ids (numbers or numeric strings);
 *  - `{ "440": { ... }, "730": { ... } }`, the map keyed by app id that the old
 *    `wishlistdata` endpoint returned;
 *  - `{ items: [ ... ] }`, the export format of this application, and a full
 *    state dump `{ session: { items: [ ... ] } }`;
 *  - `{ response: { items: [ { appid, priority } ] } }`, the current endpoint,
 *    which returns app ids and priorities and nothing else.
 */

import {
  STEAM_CDN_URL,
  compareByWishlistPosition,
  createItem,
  mergeItemFields,
  normalizeAppId,
  normalizeKind,
} from './model.js';

/**
 * Reason codes used in the import report. The interface maps them to Russian
 * messages; the core stays language neutral.
 *
 * @enum {string}
 */
export const SKIP_REASONS = Object.freeze({
  NOT_AN_OBJECT: 'not-an-object',
  MISSING_APP_ID: 'missing-app-id',
  INVALID_APP_ID: 'invalid-app-id',
  DUPLICATE_IN_INPUT: 'duplicate-in-input',
});

/** Error thrown when the input as a whole cannot be used. */
export class ImportError extends Error {
  /**
   * @param {string} code Machine readable reason, e.g. `invalid-json`.
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}

/**
 * @typedef {Object} ImportReport
 * @property {number} total      Records found in the input.
 * @property {number} added      Items that did not exist before.
 * @property {number} updated    Items that existed and were refreshed.
 * @property {number} duplicates Records that repeated an app id of the same input.
 * @property {number} skipped    Records that could not be used at all.
 * @property {Array<{ key: string|number, reason: string, appId?: number }>} issues
 */

/**
 * @typedef {Object} ImportResult
 * @property {import('./model.js').WishlistItem[]} items The merged list.
 * @property {ImportReport} report
 */

const TITLE_KEYS = ['title', 'name', 'game_name'];
const URL_KEYS = ['url', 'storeUrl', 'store_url', 'link'];
const IMAGE_KEYS = [
  'imageUrl',
  'image',
  'capsule',
  'capsule_image',
  'small_capsule_image',
  'header_image',
  'logo',
];
const POSITION_KEYS = ['wishlistPosition', 'priority', 'position', 'order', 'rank'];
const KIND_KEYS = ['kind', 'type', 'appType', 'app_type'];
const APP_ID_KEYS = ['appId', 'appid', 'app_id', 'appID', 'id'];

/**
 * Parses the input if it is a string and brings it to a list of raw records.
 *
 * `appIdFromKey` is filled in only for the map shape, where the key of the
 * object is the app id; in an array the key is just an index and must never be
 * mistaken for an identity.
 *
 * @param {unknown} input JSON text or an already parsed value.
 * @returns {Array<{ key: string|number, raw: unknown, appIdFromKey: number|null }>}
 * @throws {ImportError} When the input is not JSON or its shape is unknown.
 */
export function extractRecords(input) {
  let data = input;

  if (typeof data === 'string') {
    const text = data.trim();
    if (!text) throw new ImportError('empty-input', 'Import: the input is empty');
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new ImportError('invalid-json', `Import: the input is not valid JSON (${error.message})`);
    }
  }

  if (data === null || data === undefined) {
    throw new ImportError('empty-input', 'Import: there is nothing to import');
  }

  if (Array.isArray(data)) {
    return data.map((raw, index) => ({ key: index, raw, appIdFromKey: null }));
  }

  if (typeof data !== 'object') {
    throw new ImportError('unrecognized-format', `Import: cannot read a ${typeof data} as a wishlist`);
  }

  // Our own export, and a full state dump that wraps the same list.
  if (Array.isArray(data.items)) return extractRecords(data.items);
  if (data.session && Array.isArray(data.session.items)) return extractRecords(data.session.items);
  // The current IWishlistService/GetWishlist endpoint.
  if (data.response && Array.isArray(data.response.items)) return extractRecords(data.response.items);
  // The variable the wishlist page used to embed.
  if (Array.isArray(data.rgWishlist)) return extractRecords(data.rgWishlist);

  const entries = Object.entries(data);
  if (entries.length === 0) return [];
  if (entries.every(([key]) => normalizeAppId(key) !== null)) {
    return entries.map(([key, raw]) => ({ key, raw, appIdFromKey: normalizeAppId(key) }));
  }

  throw new ImportError('unrecognized-format', 'Import: the JSON does not look like a wishlist');
}

/**
 * Reads the first key of `keys` that the record actually defines.
 *
 * @param {Record<string, unknown>} source
 * @param {string[]} keys
 * @returns {unknown} `undefined` when none of the keys is present.
 */
function pick(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Turns a relative capsule path into an absolute URL on the Steam CDN. The old
 * wishlist format stores `capsule_231x87.jpg` relative to the app directory.
 *
 * @param {string} value
 * @param {number} appId
 * @returns {string}
 */
function resolveImageUrl(value, appId) {
  const text = String(value).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('//')) return `https:${text}`;
  return `${STEAM_CDN_URL}${appId}/${text.replace(/^\/+/, '')}`;
}

/**
 * Extracts the model fields a single raw record actually provides. Fields the
 * record does not mention are left out so that merging never overwrites known
 * data with a stub.
 *
 * @param {unknown} raw
 * @param {number|null} keyAppId App id taken from the key of the map shape.
 * @returns {{ appId: number, fields: Object }|{ reason: string, appId?: number }}
 */
function readRecord(raw, keyAppId) {
  if (typeof raw === 'number' || typeof raw === 'string') {
    const appId = normalizeAppId(raw) ?? keyAppId;
    return appId === null ? { reason: SKIP_REASONS.INVALID_APP_ID } : { appId, fields: {} };
  }

  if (raw === true) {
    // `{ "440": true }` — a wishlist reduced to a set of app ids.
    return keyAppId === null ? { reason: SKIP_REASONS.MISSING_APP_ID } : { appId: keyAppId, fields: {} };
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { reason: SKIP_REASONS.NOT_AN_OBJECT };
  }

  const rawAppId = pick(raw, APP_ID_KEYS);
  const appId = rawAppId === undefined ? keyAppId : (normalizeAppId(rawAppId) ?? keyAppId);
  if (appId === null) {
    return { reason: rawAppId === undefined ? SKIP_REASONS.MISSING_APP_ID : SKIP_REASONS.INVALID_APP_ID };
  }

  const fields = {};

  const title = pick(raw, TITLE_KEYS);
  if (typeof title === 'string' && title.trim()) fields.title = title.trim();

  const url = pick(raw, URL_KEYS);
  if (typeof url === 'string' && url.trim()) fields.url = url.trim();

  // Our own field name is read even when it is empty: `imageUrl: ''` is how the
  // model spells "this item has no cover", and an export of ours must survive a
  // round trip instead of having the cover guessed back from the app id.
  const image = typeof raw.imageUrl === 'string' ? raw.imageUrl : pick(raw, IMAGE_KEYS);
  if (typeof image === 'string') fields.imageUrl = resolveImageUrl(image, appId);

  const position = normalizePosition(pick(raw, POSITION_KEYS));
  if (position !== null) fields.wishlistPosition = position;

  const kind = raw.is_dlc !== undefined ? normalizeKind(Boolean(raw.is_dlc)) : normalizeKind(pick(raw, KIND_KEYS));
  if (kind !== 'unknown') fields.kind = kind;

  return { appId, fields };
}

/**
 * Steam uses `priority: 0` for "no priority set", so only positive integers are
 * treated as a real position.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizePosition(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const position = Math.trunc(parsed);
  return position > 0 ? position : null;
}

/**
 * Imports a wishlist of any supported shape and merges it into the items that
 * are already known.
 *
 * Merging is by `appId`: a repeated import never duplicates an entry, it
 * refreshes the one that exists. Categories and comparison results live outside
 * the item and are keyed by the same `appId`, so they survive a re-import
 * untouched.
 *
 * @param {unknown} input JSON text or an already parsed value.
 * @param {{ existing?: import('./model.js').WishlistItem[] }} [options]
 * @returns {ImportResult}
 * @throws {ImportError} Only when the input as a whole is unusable.
 */
export function importItems(input, options = {}) {
  const records = extractRecords(input);
  const report = { total: records.length, added: 0, updated: 0, duplicates: 0, skipped: 0, issues: [] };

  /** @type {Map<number, import('./model.js').WishlistItem>} */
  const items = new Map();
  for (const item of options.existing ?? []) {
    items.set(item.appId, createItem(item));
  }

  const seen = new Set();
  /** App ids the input gave no priority for, in the order they were read. */
  const unpositioned = [];

  records.forEach((record) => {
    const parsed = readRecord(record.raw, record.appIdFromKey ?? null);

    if (parsed.reason) {
      report.skipped += 1;
      report.issues.push({ key: record.key, reason: parsed.reason });
      return;
    }

    const { appId, fields } = parsed;
    const known = items.get(appId);

    if (seen.has(appId)) {
      report.duplicates += 1;
      report.issues.push({ key: record.key, reason: SKIP_REASONS.DUPLICATE_IN_INPUT, appId });
    } else {
      seen.add(appId);
      if (known) report.updated += 1;
      else report.added += 1;
    }

    const merged = known
      ? mergeItemFields(known, fields)
      : createItem({ appId, ...fields });

    if (merged.wishlistPosition === 0) unpositioned.push(appId);
    items.set(appId, merged);
  });

  // Steam only sends a priority for the part of the wishlist the user ordered
  // by hand. Everything else keeps the order it arrived in, placed after the
  // items that do have a priority, so the fallback order stays stable and
  // never interleaves with the explicit one.
  let nextPosition = Math.max(0, ...[...items.values()].map((item) => item.wishlistPosition));
  for (const appId of unpositioned) {
    const item = items.get(appId);
    if (item && item.wishlistPosition === 0) {
      nextPosition += 1;
      item.wishlistPosition = nextPosition;
    }
  }

  return { items: [...items.values()], report };
}

/**
 * Convenience wrapper that returns the imported items already in wishlist
 * order. Useful for fixtures and for the userscripts.
 *
 * @param {unknown} input
 * @param {{ existing?: import('./model.js').WishlistItem[] }} [options]
 * @returns {ImportResult}
 */
export function importItemsSorted(input, options = {}) {
  const result = importItems(input, options);
  result.items.sort(compareByWishlistPosition);
  return result;
}
