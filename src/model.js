/**
 * Data model of the application: wishlist items, priority categories and the
 * helpers that bring arbitrary input to that model.
 *
 * The module has no dependency on the DOM or on any storage backend, so it is
 * shared as is by the browser code, by the tests and by the userscripts.
 */

/** Base URL of a Steam store page. */
export const STEAM_STORE_URL = 'https://store.steampowered.com/app/';

/** Base URL of the public Steam CDN that serves capsule images. */
export const STEAM_CDN_URL = 'https://cdn.cloudflare.steamstatic.com/steam/apps/';

/**
 * @typedef {'game' | 'dlc' | 'unknown'} ItemKind
 */

/**
 * A single wishlist entry. `appId` is the identity of the item: everything else
 * may be refreshed by a later import, the identity may not.
 *
 * @typedef {Object} WishlistItem
 * @property {number} appId            Steam application id, a positive integer.
 * @property {string} title            Display title, or an `App 12345` placeholder.
 * @property {string} url              Steam store page.
 * @property {string} imageUrl         Capsule image, empty when the item has no cover.
 * @property {number} wishlistPosition Original position in the wishlist, 1-based.
 * @property {ItemKind} kind           Whether the entry is a game, a DLC or unknown.
 */

/**
 * The six priority categories, ordered from the most wanted to the least
 * wanted one. Any item of a higher category always outranks any item of a
 * lower one, so the categories are the coarse part of the final ranking and
 * the pairwise comparisons only refine the order inside a single category.
 *
 * @type {ReadonlyArray<{ id: string, label: string, sortable: boolean }>}
 */
export const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'must', label: 'Очень хочу', sortable: true }),
  Object.freeze({ id: 'want', label: 'Хочу', sortable: true }),
  Object.freeze({ id: 'maybe', label: 'Возможно', sortable: true }),
  Object.freeze({ id: 'unlikely', label: 'Маловероятно', sortable: true }),
  Object.freeze({ id: 'meh', label: 'Почти не интересует', sortable: true }),
  Object.freeze({ id: 'remove', label: 'Удалить из желаемого', sortable: false }),
]);

/** Category ids in priority order. @type {ReadonlyArray<string>} */
export const CATEGORY_IDS = Object.freeze(CATEGORIES.map((category) => category.id));

/**
 * Category of an item the user has not classified yet. It behaves as a real
 * category that sits below every named one: such items are still sorted (the
 * user may skip the classification step entirely and compare everything in a
 * single bucket) and are still numbered in the final list.
 *
 * @type {null}
 */
export const UNCATEGORIZED = null;

/** Human readable label of the implicit "not classified yet" bucket. */
export const UNCATEGORIZED_LABEL = 'Без категории';

const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

/** Item kinds understood by the model. @type {ReadonlyArray<ItemKind>} */
export const KINDS = Object.freeze(['game', 'dlc', 'unknown']);

/**
 * Whether `value` is a category id the model knows, including the implicit
 * `null` bucket of items that have not been classified yet.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCategoryId(value) {
  return value === UNCATEGORIZED || (typeof value === 'string' && CATEGORY_BY_ID.has(value));
}

/**
 * Priority of a category: a lower rank means a higher place in the final list.
 * The implicit `null` bucket ranks below every named category.
 *
 * @param {string|null} categoryId
 * @returns {number}
 */
export function categoryRank(categoryId) {
  if (categoryId === UNCATEGORIZED) return CATEGORIES.length;
  const index = CATEGORY_IDS.indexOf(categoryId);
  return index === -1 ? CATEGORIES.length + 1 : index;
}

/**
 * Whether items of this category take part in pairwise sorting. Everything but
 * `remove` does, the implicit `null` bucket included.
 *
 * @param {string|null} categoryId
 * @returns {boolean}
 */
export function isSortableCategory(categoryId) {
  if (categoryId === UNCATEGORIZED) return true;
  return CATEGORY_BY_ID.get(categoryId)?.sortable === true;
}

/**
 * Label to show in the interface for a category id.
 *
 * @param {string|null} categoryId
 * @returns {string}
 */
export function categoryLabel(categoryId) {
  if (categoryId === UNCATEGORIZED) return UNCATEGORIZED_LABEL;
  return CATEGORY_BY_ID.get(categoryId)?.label ?? String(categoryId);
}

/**
 * Brings an app id of any shape (number, numeric string, `app/440`) to a
 * positive integer.
 *
 * @param {unknown} value
 * @returns {number|null} The app id, or `null` when the value is not one.
 */
export function normalizeAppId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const match = /^\s*(?:app\/)?(\d+)\s*$/i.exec(value);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Brings an arbitrary "type" value to one of the three known item kinds. Steam
 * uses `Game`, `DLC`, `Music`, `Video` and a few more; everything the model
 * does not recognize becomes `unknown`.
 *
 * @param {unknown} value
 * @returns {ItemKind}
 */
export function normalizeKind(value) {
  if (typeof value === 'boolean') return value ? 'dlc' : 'game';
  if (typeof value !== 'string') return 'unknown';
  const text = value.trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('dlc')) return 'dlc';
  if (text === 'game' || text === 'application' || text === 'demo') return 'game';
  return 'unknown';
}

/**
 * Store page of an application.
 *
 * @param {number} appId
 * @returns {string}
 */
export function steamStoreUrl(appId) {
  return `${STEAM_STORE_URL}${appId}/`;
}

/**
 * Default capsule image of an application. The current Steam wishlist endpoint
 * returns app ids without covers, so the image URL is reconstructed from the
 * id by this template and the user recognizes the game by its picture.
 *
 * @param {number} appId
 * @returns {string}
 */
export function steamHeaderImageUrl(appId) {
  return `${STEAM_CDN_URL}${appId}/header.jpg`;
}

/**
 * Title shown for an item whose real name is not known yet.
 *
 * @param {number} appId
 * @returns {string}
 */
export function placeholderTitle(appId) {
  return `App ${appId}`;
}

/**
 * Whether a title is a generated placeholder rather than a real game name.
 * Used on re-import so that a known title is never overwritten by a stub.
 *
 * @param {unknown} title
 * @returns {boolean}
 */
export function isPlaceholderTitle(title) {
  return typeof title === 'string' && /^app\s+\d+$/i.test(title.trim());
}

/**
 * Builds a valid item out of partial fields, deriving from the app id what is
 * missing. A field that is absent is derived; a field that is present but
 * empty stays empty, which is how an item without a cover is expressed.
 *
 * @param {Partial<WishlistItem> & { appId: number|string }} fields
 * @returns {WishlistItem}
 * @throws {TypeError} When the app id is missing or malformed.
 */
export function createItem(fields) {
  const source = fields ?? {};
  const appId = normalizeAppId(source.appId);
  if (appId === null) {
    throw new TypeError(`createItem: invalid appId ${JSON.stringify(source.appId ?? null)}`);
  }

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const url = typeof source.url === 'string' ? source.url.trim() : '';
  const position = Number(source.wishlistPosition);

  return {
    appId,
    title: title || placeholderTitle(appId),
    url: url || steamStoreUrl(appId),
    imageUrl:
      source.imageUrl === undefined
        ? steamHeaderImageUrl(appId)
        : String(source.imageUrl ?? '').trim(),
    wishlistPosition: Number.isFinite(position) && position > 0 ? Math.trunc(position) : 0,
    kind: KINDS.includes(source.kind) ? source.kind : normalizeKind(source.kind),
  };
}

/**
 * Merges freshly imported fields into an item that is already known. Real data
 * always wins over a placeholder, so re-importing an id-only export does not
 * erase the titles and the covers collected by an earlier import.
 *
 * @param {WishlistItem} existing
 * @param {Partial<WishlistItem>} incoming Only the fields present in the source.
 * @returns {WishlistItem}
 */
export function mergeItemFields(existing, incoming) {
  const fields = { ...existing, ...incoming };
  if (isPlaceholderTitle(fields.title) && !isPlaceholderTitle(existing.title)) {
    fields.title = existing.title;
  }
  if (!fields.imageUrl && existing.imageUrl) {
    fields.imageUrl = existing.imageUrl;
  }
  if (fields.kind === 'unknown' && existing.kind !== 'unknown') {
    fields.kind = existing.kind;
  }
  return createItem(fields);
}

/**
 * Stable fallback comparator: the original wishlist position first, the app id
 * as the tie breaker. It defines the order of everything the comparisons have
 * not decided yet, so it must never depend on iteration order or on timing.
 *
 * @param {WishlistItem} a
 * @param {WishlistItem} b
 * @returns {number}
 */
export function compareByWishlistPosition(a, b) {
  return a.wishlistPosition - b.wishlistPosition || a.appId - b.appId;
}
