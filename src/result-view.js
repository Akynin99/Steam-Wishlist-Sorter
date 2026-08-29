/**
 * The decisions of the result screen that need no DOM.
 *
 * The screen itself is a large module full of rows, drag handlers and focus
 * bookkeeping, and none of that can be tested without a browser. What can be
 * tested is what it decides: which of the four states a row is in, how much of
 * the list the comparisons already carry, whether the link the user took a
 * minute ago still writes the order that is on the screen, and which keyboard
 * shortcut shows the bookmarks bar. All four are here, as plain functions over
 * plain data, the same way `export.js` and `bookmarklet.js` keep their rules
 * out of the interface.
 *
 * Nothing here recomputes the ranking: the result of `getResult()` is handed
 * in, because the screen has already asked for it once and building it a
 * second time means walking the whole list again.
 */

import { bookmarkletAppIds } from './bookmarklet.js';

/**
 * State of one line of the list, in the order it is decided.
 *
 * All three come from flags `getResult()` has already worked out. A hand made
 * placement wins over everything else, because it is the only one of the three
 * the user made themselves; after it comes the order the comparisons imply,
 * and what is left keeps the place it had in the wishlist.
 *
 * `tiedWithPrevious` is not one of these: a tie is something the row has *as
 * well*, and it is shown next to the state rather than instead of it.
 *
 * @param {import('./ranking.js').ResultEntry} entry
 * @returns {'manual'|'confirmed'|'fallback'}
 */
export function rowStatus(entry) {
  if (entry.manual) return 'manual';
  // `resolved` is `linkedToPrevious` and the same about the neighbour below:
  // a line is confirmed when the comparisons settle both of its sides.
  return entry.resolved ? 'confirmed' : 'fallback';
}

/**
 * How much of the list the comparisons already carry, as a percentage.
 *
 * An empty list is 0 and not a division by zero, and the number is rounded to
 * a whole percent because it is drawn as a ring and read as a rough share.
 *
 * @param {{ total: number, resolved: number }} summary
 * @returns {number} 0 to 100.
 */
export function confirmedPercent(summary) {
  if (!summary || summary.total <= 0) return 0;
  return Math.round((summary.resolved / summary.total) * 100);
}

/**
 * What the link would write, as one short string.
 *
 * It is exactly the sequence of app ids that goes into the link, so two
 * signatures differ when and only when the two links would write a different
 * order. Everything else about the result — titles, categories, the answers
 * behind the order — is not in the link and must not be in the signature.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {string}
 */
export function orderSignature(result) {
  return bookmarkletAppIds(result).join(',');
}

/**
 * Whether the link the user already took is still the current one.
 *
 * The browser never says that a link was dragged into the bookmarks bar, and
 * it never says that a bookmark exists. What can be observed is the moment the
 * user reaches for the link — the copy button and the start of a drag — and
 * from then on the page can honestly compare what they took with what the list
 * says now. Before that moment there is nothing to compare and nothing to
 * warn about: the link on the screen is rebuilt on every render, so it is
 * always current.
 *
 * @param {string} current The signature of the order shown now.
 * @param {string|null} taken The signature at the moment the link was taken.
 * @returns {'untaken'|'fresh'|'stale'}
 */
export function linkFreshness(current, taken) {
  if (taken === null || taken === undefined) return 'untaken';
  return taken === current ? 'fresh' : 'stale';
}

/**
 * Whether this is an Apple platform, and therefore whether the bookmarks bar
 * is shown with the command key.
 *
 * Only the platform is decided here, never the browser: Chrome, Edge and
 * Firefox share the shortcut, and guessing a browser from its user agent is
 * how a page ends up telling somebody a shortcut their browser does not have.
 * Safari is named separately in the interface, as a menu path, because it is
 * the one that has no place in the sentence about the other three.
 *
 * @param {{ userAgentData?: { platform?: string }, platform?: string,
 *           userAgent?: string }} [nav] Usually `navigator`.
 * @returns {boolean}
 */
export function isApplePlatform(nav = {}) {
  const hints = [nav.userAgentData?.platform, nav.platform, nav.userAgent];
  return hints.some((hint) => typeof hint === 'string' && /mac|iphone|ipad|ipod/i.test(hint));
}
