/**
 * The two themes of the interface.
 *
 * A theme is nothing but a value of `data-theme` on the root element: the
 * markup is one and the same, and `styles.css` restates the tokens the second
 * theme disagrees with. This module holds the names and the rule for reading
 * one back — it touches neither the DOM nor the storage, so the tests get at
 * it directly, the same way they get at the dictionaries.
 */

/** Themes the application ships, in the order the switch offers them. */
export const THEMES = Object.freeze(['modern', 'steam']);

/**
 * The theme a state without one gets. `Modern` is the look the application
 * has always had, so an old save opens exactly as it was left.
 */
export const DEFAULT_THEME = 'modern';

/**
 * Reads a theme name the way a state file may carry it: a saved file from
 * before the second theme existed has none, and a hand-edited one may hold
 * anything. Both read as `Modern` rather than as a broken file.
 *
 * @param {unknown} name
 * @returns {string} One of `THEMES`.
 */
export function normalizeTheme(name) {
  return THEMES.includes(name) ? name : DEFAULT_THEME;
}
