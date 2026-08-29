/**
 * The two themes of the interface.
 *
 * A theme is nothing but a value of `data-theme` on the root element: the
 * markup is one and the same, and `styles.css` restates the tokens the second
 * theme disagrees with. This module holds the names, the rule for reading one
 * back, and the key the chosen theme is mirrored under for the script in the
 * document head. It touches no DOM and holds no storage of its own — the one
 * function that writes is handed the backend to write to — so the tests get at
 * all of it directly, the same way they get at the dictionaries.
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

/**
 * Where the chosen theme is mirrored for the script in the document head.
 *
 * The theme itself lives in `settings.theme` inside the state and that stays
 * the source of truth; this key is a copy of one word, written next to
 * `steam-wishlist-sorter/screen` and the onboarding flags. It exists because
 * the state is read by the modules, and the modules run late: on a cold cache
 * the page stands in the wrong theme until they do. The script in the head
 * runs before the first paint, and it must not know how the state is shaped —
 * one line it can read wrongly is one line, whereas an envelope it parses is a
 * format that changes and takes the script down with it, silently.
 */
export const THEME_MIRROR_KEY = 'steam-wishlist-sorter/theme';

/**
 * Copies the theme to the key the head script reads.
 *
 * The value is normalized first, so nothing but a known theme name is ever
 * stored: the head script has no room to be careful, and the one thing that
 * keeps it honest is that whoever writes the key was.
 *
 * The write is not wrapped: a backend that refuses is the caller's business,
 * the same way it is for the screen and the onboarding flags.
 *
 * @param {{ setItem(key: string, value: string): void }} backend
 *        `localStorage` in the browser, a stub in the tests.
 * @param {unknown} name
 * @returns {string} The theme that was written.
 */
export function writeThemeMirror(backend, name) {
  const theme = normalizeTheme(name);
  backend.setItem(THEME_MIRROR_KEY, theme);
  return theme;
}
