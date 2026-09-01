/**
 * The tier list, as rows of cards, without a DOM.
 *
 * The result screen shows the order as a numbered list; this is the same order
 * looked at from the side — one row per category, the games of a row standing
 * in the order the ranking gave them — and the second place that order can be
 * changed from. Two things live here: the grouping of a result into rows, and
 * what a card dragged from one place to another means. Neither of them ranks
 * anything. The grouping takes what `getResult()` has already worked out; the
 * moves are the two calls `ranking.js` already offers, `setCategory()` and
 * `moveItem()`, decided here and carried out on the session there.
 *
 * The rows are built from the result and never from the list on the screen.
 * The search and the kind filter of that list hide rows rather than rebuild
 * them, so reading the screen would have pulled a filter into a view that has
 * nothing to do with one.
 *
 * There is no state of its own to keep: the rows are built again out of the
 * result after every move, so the panel and the list behind it are one set of
 * data and never two copies of it.
 */

import { CATEGORIES, isSortableCategory } from './model.js';

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
 * Every row a card can end up in, top to bottom.
 *
 * The scale, then the two rows that are not degrees of interest. This is the
 * ladder the keyboard walks when a card is moved between rows, and it holds
 * the rows that hold nothing as well: an empty row is somewhere to move to
 * even when there is nothing in it to read.
 *
 * @type {ReadonlyArray<string>}
 */
export const TIER_ROW_IDS = Object.freeze([...TIER_SCALE, TIER_NONE, TIER_REMOVE]);

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

/**
 * The rows a panel that can be edited has to draw: all seven, always.
 *
 * `buildTierList()` leaves out a row off the scale that holds nothing, because
 * a row about nothing is nothing to read. A row is also somewhere to drop a
 * card into, though, and a row that is not on the screen is a move that cannot
 * be made: with every game classified there would be no «not categorized» row
 * left, and taking a category off by dragging would quietly stop being
 * possible exactly when the list is in its most finished state.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {TierRow[]}
 */
export function buildTierBoard(result) {
  const built = new Map(buildTierList(result).map((row) => [row.id, row]));
  return TIER_ROW_IDS.map(
    (id) =>
      built.get(id) ?? {
        id,
        category: id === TIER_NONE ? null : id,
        onScale: TIER_SCALE.includes(id),
        items: [],
      },
  );
}

/**
 * The category a row stands for.
 *
 * The five of the scale and the removal row are named after their category, so
 * the id is the answer; the row of unclassified items stands for the absence
 * of one, which the model writes as `null`.
 *
 * @param {string} rowId
 * @returns {string|null|undefined} `undefined` for a row that does not exist.
 */
export function tierRowCategory(rowId) {
  if (!TIER_ROW_IDS.includes(rowId)) return undefined;
  return rowId === TIER_NONE ? null : rowId;
}

/**
 * A card put down somewhere: which card, which row, and next to what.
 *
 * `anchor` is the card it was put next to, or `null` when the row itself was
 * the target rather than any card in it — dropping onto the empty part of a
 * row, or onto an empty row.
 *
 * @typedef {object} TierDrop
 * @property {number} appId
 * @property {string} row
 * @property {number|null} [anchor]
 * @property {'before'|'after'} [side]
 */

/**
 * What a drop turns into: the category the card ends up in and the card it
 * ends up next to. Either half may be nothing to do — a card moved inside its
 * row does not change category, and a card dropped into an empty row has
 * nothing to stand next to.
 *
 * @typedef {object} TierMove
 * @property {number} appId
 * @property {string} row Id of the row it ends up in.
 * @property {string|null} category The category of that row.
 * @property {boolean} categoryChanged
 * @property {number|null} anchor
 * @property {'before'|'after'} side
 */

/**
 * Finds where a card is standing now.
 *
 * @param {TierRow[]} rows
 * @param {number} appId
 * @returns {{ row: TierRow, index: number }|null}
 */
function locate(rows, appId) {
  for (const row of rows) {
    const index = row.items.findIndex((card) => card.appId === appId);
    if (index !== -1) return { row, index };
  }
  return null;
}

/**
 * The card a drop lands next to, once the drop has been checked against the
 * row it names.
 *
 * A card named by the drop is taken when it really is in that row; anything
 * else — the row itself as the target, a stale id — means the end of the row,
 * which is where a card dropped into open space belongs. A row with nothing
 * else in it has no anchor at all, and the move is then a change of category
 * and nothing more.
 *
 * @param {TierRow} target
 * @param {TierDrop} drop
 * @returns {{ appId: number, side: 'before'|'after' }|null}
 */
function resolveAnchor(target, drop) {
  const named = drop.anchor ?? null;
  if (named !== null && target.items.some((card) => card.appId === named)) {
    return { appId: named, side: drop.side === 'before' ? 'before' : 'after' };
  }
  const last = [...target.items].reverse().find((card) => card.appId !== drop.appId);
  return last ? { appId: last.appId, side: 'after' } : null;
}

/**
 * Works out what a drop means, without touching the session.
 *
 * Everything that makes a drop no move at all is answered with `null`: a card
 * that is not on the board, a row that does not exist, a card dropped where it
 * already stands, and a card dropped inside the removal row, which has no
 * order to take a place in. A caller can hand any drop in and act on what
 * comes back.
 *
 * @param {TierRow[]} rows As `buildTierBoard()` returns them.
 * @param {TierDrop} drop
 * @returns {TierMove|null} `null` when the drop changes nothing.
 */
export function planTierMove(rows, drop) {
  const board = rows ?? [];
  // A card dropped on itself is a card put back down where it was picked up.
  // It is not the row being aimed at either, so it must not be read as one and
  // carried off to the end of it.
  if (drop && drop.anchor === drop.appId) return null;

  const target = board.find((row) => row.id === drop?.row);
  const category = target ? tierRowCategory(target.id) : undefined;
  if (!target || category === undefined) return null;

  const from = locate(board, drop.appId);
  if (from === null) return null;

  const categoryChanged = from.row.id !== target.id;
  const move = { appId: drop.appId, row: target.id, category, categoryChanged };

  // The removal row is a decision about the wishlist and not a degree of
  // interest: `remove` takes no part in the sorting, so there is no place in
  // that row to be put at — only the mark itself, and only when it is new.
  if (!isSortableCategory(category)) {
    return categoryChanged ? { ...move, anchor: null, side: 'after' } : null;
  }

  const anchor = resolveAnchor(target, drop);
  if (anchor === null) return categoryChanged ? { ...move, anchor: null, side: 'after' } : null;

  // A card dropped on the side of a neighbour it is already standing on has
  // been put back where it was. Recording that would mark the line «moved by
  // hand» on the result screen for a move nobody made.
  if (!categoryChanged) {
    const neighbour = target.items.findIndex((card) => card.appId === anchor.appId);
    const already = anchor.side === 'before' ? neighbour === from.index + 1 : neighbour === from.index - 1;
    if (already) return null;
  }

  return { ...move, anchor: anchor.appId, side: anchor.side };
}

/**
 * The same for a card moved with the keyboard: one step in one direction.
 *
 * Sideways is a step inside the row. Up and down is a step along the ladder of
 * rows, and the card keeps its place along the row as far as the new row
 * reaches — so a card walked down the scale and back up again comes home,
 * and the rows it passes through do not shuffle it to their far end.
 *
 * @param {TierRow[]} rows As `buildTierBoard()` returns them.
 * @param {number} appId
 * @param {'left'|'right'|'up'|'down'} direction
 * @returns {TierMove|null} `null` at the edge, and for a step that changes
 *          nothing — the caller says so in words either way.
 */
export function planTierStep(rows, appId, direction) {
  const board = rows ?? [];
  const from = locate(board, appId);
  if (from === null) return null;

  if (direction === 'left' || direction === 'right') {
    const neighbour = from.row.items[from.index + (direction === 'left' ? -1 : 1)];
    if (neighbour === undefined) return null;
    return planTierMove(board, {
      appId,
      row: from.row.id,
      anchor: neighbour.appId,
      side: direction === 'left' ? 'before' : 'after',
    });
  }

  const ladder = TIER_ROW_IDS.indexOf(from.row.id) + (direction === 'up' ? -1 : 1);
  const targetId = TIER_ROW_IDS[ladder];
  if (targetId === undefined) return null;

  const target = board.find((row) => row.id === targetId);
  const landing = target?.items[Math.min(from.index, target.items.length)];
  return planTierMove(board, {
    appId,
    row: targetId,
    // Past the end of a shorter row there is nothing to stand before, so the
    // card goes after the last card there is.
    anchor: landing?.appId ?? target?.items.at(-1)?.appId ?? null,
    side: landing === undefined ? 'after' : 'before',
  });
}

/**
 * Carries a planned move out on a session.
 *
 * The order of the two calls is the whole reason this is a function and not
 * two lines at the call site: `moveItem()` refuses an anchor from another
 * category with a `cross-category` error, so the item has to be in the
 * category of its new neighbour *before* it is put next to them. Written the
 * other way round, every move between rows throws.
 *
 * @param {import('./ranking.js').RankingSession} session
 * @param {TierMove|null} move As `planTierMove()` or `planTierStep()` gives it.
 * @returns {boolean} Whether anything was done.
 * @throws {import('./ranking.js').RankingError} What the session throws: an
 *         item it does not know, a category it does not know.
 */
export function applyTierMove(session, move) {
  if (!move) return false;
  if (move.categoryChanged) session.setCategory(move.appId, move.category);
  if (move.anchor !== null) session.moveItem(move.appId, move.anchor, move.side);
  return true;
}
