/**
 * The tier list, as rows of cards, without a DOM.
 *
 * The result screen already shows the order as a numbered list; this is the
 * same order looked at from the side — one row per category, the games of a
 * row standing in the order the ranking gave them. Nothing here decides
 * anything: it takes what `getResult()` has already worked out and only says
 * which row each item belongs to, the way `result-view.js` takes the same
 * result and says which state a line is in.
 *
 * The rows are built from the result and never from the list on the screen.
 * The search and the kind filter of that list hide rows rather than rebuild
 * them, so reading the screen would have pulled a filter into a view that has
 * nothing to do with one.
 *
 * There is no state of its own to keep: the rows are built again every time
 * the panel opens, so a category changed or an item moved by hand a minute ago
 * is already in them.
 */

import { CATEGORIES } from './model.js';

/**
 * Ids of the rows that are always drawn, in the order of interest.
 *
 * Derived from `CATEGORIES` and not written out, so that a level added to the
 * scale appears here without anybody remembering this file exists. `remove` is
 * not on the scale — it is a decision about the wishlist rather than a degree
 * of interest — and it gets its own row at the end.
 *
 * @type {ReadonlyArray<string>}
 */
export const TIER_SCALE = Object.freeze(
  CATEGORIES.filter((category) => category.sortable).map((category) => category.id),
);

/** Id of the row of items the user never classified. */
export const TIER_NONE = 'none';

/** Id of the row of items marked for removal. */
export const TIER_REMOVE = 'remove';

/**
 * One card of a row.
 *
 * @typedef {object} TierCard
 * @property {number} appId
 * @property {import('./model.js').WishlistItem} item
 * @property {number|null} position Place in the final list, or `null` when the
 *   item has none — everything in the `remove` row is outside the numbering.
 */

/**
 * One row of the tier list.
 *
 * @typedef {object} TierRow
 * @property {string} id `must` … `meh`, then `none`, then `remove`.
 * @property {string|null} category The category id to take the caption from,
 *   or `null` for the row of unclassified items, which has a caption of its
 *   own rather than a category.
 * @property {boolean} onScale Whether the row is a degree of interest. The two
 *   that are not stand apart from the scale and are only drawn when they hold
 *   something.
 * @property {TierCard[]} items In the order the result gave them.
 */

/**
 * Groups a ranking result into the rows of the tier list.
 *
 * The five levels of the scale are always returned, empty ones included: a
 * scale with a level missing from it is a different scale, and the gap is the
 * point — it says that nothing was put there. The other two rows appear only
 * when they hold something, because neither of them is part of the scale and
 * an empty one would be a row about nothing.
 *
 * Every item of the result lands in exactly one row: the entries go by their
 * category, and `removed` — which is a separate array in the result and holds
 * items rather than entries — becomes the last row. An entry carrying a
 * category id the model does not know joins the unclassified row instead of
 * disappearing: a broken state file should be visible, not quietly shorter.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 *        The one the screen has already asked for. Building it again would
 *        walk the whole ranking a second time for nothing.
 * @returns {TierRow[]}
 */
export function buildTierList(result) {
  const scale = new Map(TIER_SCALE.map((id) => [id, []]));
  /** @type {TierCard[]} */
  const none = [];

  for (const entry of result?.entries ?? []) {
    const card = { appId: entry.appId, item: entry.item, position: entry.position };
    (scale.get(entry.category) ?? none).push(card);
  }

  const rows = TIER_SCALE.map((id) => ({
    id,
    category: id,
    onScale: true,
    items: scale.get(id),
  }));

  if (none.length > 0) {
    rows.push({ id: TIER_NONE, category: null, onScale: false, items: none });
  }

  const removed = result?.removed ?? [];
  if (removed.length > 0) {
    rows.push({
      id: TIER_REMOVE,
      category: TIER_REMOVE,
      onScale: false,
      // Nothing in this row has a place in the final list, so nothing in it
      // has a number to show. The result does not give one, and inventing one
      // here would claim these items are ranked.
      items: removed.map((item) => ({ appId: item.appId, item, position: null })),
    });
  }

  return rows;
}
