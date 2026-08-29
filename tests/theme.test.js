/**
 * The theme is decided twice, and the two decisions must agree.
 *
 * `src/ui-app.js` sets it from `settings.theme` when the modules run, and a
 * script in the head of `index.html` sets it before the first paint, from a
 * mirror of one word. Only the second one is visible on a cold cache, and it
 * is the one nothing else covers: it is not a module, so it is imported by
 * nothing, and a mistake in it shows up as a page in the wrong colours for
 * half a second — which nobody reports and no test would notice.
 *
 * So it is run here, as it ships. The lines are taken out of `index.html` and
 * executed against a stub store and a stub root element, which is the whole of
 * what they touch. What that buys: the key cannot be renamed on one side only,
 * the reading rule cannot drift from `normalizeTheme()`, and the two failures
 * that must stay harmless — no mirror at all, and rubbish in the mirror — are
 * pinned as behaviour rather than as intent.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  DEFAULT_THEME,
  THEMES,
  THEME_MIRROR_KEY,
  normalizeTheme,
  writeThemeMirror,
} from '../src/theme.js';

const HTML = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const UI_APP = readFileSync(fileURLToPath(new URL('../src/ui-app.js', import.meta.url)), 'utf8');

const HEAD = HTML.slice(HTML.indexOf('<head>'), HTML.indexOf('</head>'));

/**
 * The scripts written out in the head, in order. One carrying a `src` would be
 * a request rather than a line, and a request is the very thing that must not
 * stand between the visitor and the first paint.
 *
 * @returns {string[]} The bodies of the inline scripts.
 */
function headScripts() {
  return [...HEAD.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter((match) => !/\ssrc\s*=/.test(match[1] ?? ''))
    .map((match) => match[2]);
}

/**
 * Runs the head script over a store that holds `mirror`.
 *
 * The stub root element answers to both ways of writing the attribute, so the
 * test says what the page ends up in and not how the script phrased it.
 *
 * @param {unknown} mirror The stored value; a function is called instead,
 *        which is how a browser that denies storage behaves.
 * @returns {string|null} The theme the root element carries afterwards.
 */
function runHeadScript(mirror) {
  const dataset = {};
  const read = typeof mirror === 'function' ? mirror : () => mirror;
  const context = vm.createContext({
    localStorage: {
      getItem: (key) => (key === THEME_MIRROR_KEY ? read() : null),
    },
    document: {
      documentElement: {
        dataset,
        setAttribute(name, value) {
          if (name === 'data-theme') dataset.theme = value;
        },
      },
    },
  });

  for (const script of headScripts()) vm.runInContext(script, context);
  return dataset.theme ?? null;
}

test('the theme is set by a blocking inline script in the head', () => {
  const scripts = headScripts();
  assert.equal(scripts.length, 1, 'the head holds one inline script, and it is the theme');
  assert.match(scripts[0], /data-theme|dataset\.theme/, 'the head script does not set the theme');
});

test('the head script runs above the stylesheet, so no pending CSS holds it up', () => {
  assert.ok(
    HEAD.indexOf('<script') < HEAD.indexOf('rel="stylesheet"'),
    'a script below the stylesheet waits for it to load, which is the delay being fixed',
  );
});

test('the head script reads the key the module writes, and knows nothing else', () => {
  const script = headScripts()[0];
  assert.ok(script.includes(THEME_MIRROR_KEY), `the head script does not read ${THEME_MIRROR_KEY}`);
  assert.doesNotMatch(
    script,
    /JSON\.parse|settings|steam-wishlist-sorter\/state/,
    'the head script must not read the state: it would break silently when the state changes',
  );
});

test('a mirrored store theme is on the page before a module has run', () => {
  assert.equal(runHeadScript('steam'), 'steam');
});

test('a mirrored Modern leaves the attribute off, which is Modern', () => {
  // Modern is what `:root` hands out already, so the theme with nothing to say
  // says nothing: one branch fewer to be wrong in.
  assert.equal(runHeadScript('modern'), null);
});

test('no mirror at all does not break the load', () => {
  assert.equal(runHeadScript(null), null);
});

test('rubbish in the mirror reads as Modern', () => {
  for (const value of ['', ' steam ', 'STEAM', 'Steam', 'dark', '"steam"', '{"theme":"steam"}', '0']) {
    assert.equal(runHeadScript(value), null, `a mirror holding ${JSON.stringify(value)} must not reach the page`);
  }
});

test('storage the browser refuses to open does not break the load', () => {
  const denied = () => {
    throw new Error('The user agent denied access to storage');
  };
  assert.equal(runHeadScript(denied), null);
});

test('the head script reads the mirror the way the module reads a theme', () => {
  // The script cannot import `normalizeTheme()`, so the rule is written twice
  // and the two could drift. They are compared here over every answer the
  // mirror can give: the head script leaves the attribute off for Modern,
  // which is the same decision spelt differently.
  for (const value of [...THEMES, '', 'dark', 'STEAM', ' steam ', null]) {
    assert.equal(runHeadScript(value) ?? DEFAULT_THEME, normalizeTheme(value));
  }
});

test('the mirror is written under the small key, next to the screen and the flags', () => {
  const written = [];
  const backend = { setItem: (key, value) => void written.push([key, value]) };

  assert.equal(writeThemeMirror(backend, 'steam'), 'steam');
  assert.deepEqual(written, [[THEME_MIRROR_KEY, 'steam']]);
  assert.notEqual(THEME_MIRROR_KEY, 'steam-wishlist-sorter/state', 'the mirror is not the state');
});

test('only a known theme name is ever mirrored', () => {
  // The head script has no room to be careful, so the care is taken here: it
  // never has to read anything the switch could not have produced.
  for (const value of ['dark', '', null, undefined, 42, { theme: 'steam' }]) {
    const written = [];
    writeThemeMirror({ setItem: (key, stored) => void written.push(stored) }, value);
    assert.deepEqual(written, [DEFAULT_THEME], `${JSON.stringify(value)} was mirrored as it stood`);
  }
});

test('every theme survives the trip from the switch to the next cold start', () => {
  for (const theme of THEMES) {
    const store = new Map();
    writeThemeMirror({ setItem: (key, value) => void store.set(key, value) }, theme);
    assert.equal(runHeadScript(store.get(THEME_MIRROR_KEY)) ?? DEFAULT_THEME, theme);
  }
});

test('switching the theme writes the mirror', () => {
  // `applyTheme()` is the one road every theme takes — the switch, the start of
  // a session, an imported file, starting over — so the write belongs in it and
  // nowhere else. The interface needs a DOM to run and the project has none, so
  // the call is read rather than executed; what it does once called is pinned
  // by the tests above.
  const body = UI_APP.slice(UI_APP.indexOf('function applyTheme('));
  assert.match(
    body.slice(0, body.indexOf('\n}')),
    /rememberTheme\(/,
    'applyTheme() no longer mirrors the theme, so a cold start shows the wrong one',
  );
  assert.match(
    UI_APP,
    /function rememberTheme\([\s\S]*?writeThemeMirror\(\s*window\.localStorage/,
    'the mirror is not written to the storage the head script reads',
  );
});
