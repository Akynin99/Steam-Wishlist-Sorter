/**
 * The stylesheet holds two themes over one set of markup, and the whole of
 * that arrangement rests on three rules that break silently. A raw colour
 * below the token blocks stays turquoise when the store theme is on; a token
 * the second theme invents is undefined in the first; a misspelt token name is
 * simply an empty value, and CSS says nothing about any of it — the page just
 * looks slightly wrong to whoever happens to switch themes.
 *
 * So the rules are checked here, as text. No CSS engine is needed to read a
 * declaration block, and no dependency is going to be added to get one.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const CSS = readFileSync(fileURLToPath(new URL('../styles.css', import.meta.url)), 'utf8');

/** Where `:root` opens, where the store theme opens, and where it closes. */
const ROOT_AT = CSS.indexOf(':root {');
const STEAM_AT = CSS.indexOf('[data-theme="steam"] {');
const STEAM_END = CSS.indexOf('\n}', STEAM_AT) + 2;

/**
 * Custom properties the stylesheet never declares because the application
 * writes them onto elements: the two coordinates of the settings menu and the
 * colour of one category. Every one of them is used with a fallback, which is
 * the second half of the rule below.
 */
const SET_FROM_CODE = ['--menu-top', '--menu-right', '--cat-color'];

/**
 * @param {string} text
 * @returns {Set<string>} Custom properties declared in it.
 */
function declared(text) {
  return new Set([...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));
}

test('the two token blocks are where the rest of the file expects them', () => {
  assert.ok(ROOT_AT !== -1, 'styles.css has no :root block');
  assert.ok(STEAM_AT > ROOT_AT, 'the store theme does not follow :root');
  assert.ok(STEAM_END > STEAM_AT, 'the store theme block is not closed');
});

test('no raw colour is written below the token blocks', () => {
  const rest = CSS.slice(STEAM_END);
  // `color-mix(in srgb, …)` carries the letters `rgb` and is not a colour of
  // its own: it mixes tokens. Comments are dropped first, so that a hex code
  // named in prose is not read as a declaration.
  const code = rest.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [
    ...code.matchAll(/#[0-9a-fA-F]{3,8}\b/g),
    ...code.matchAll(/(?<!s)rgba?\(/g),
    ...code.matchAll(/hsla?\(/g),
    ...code.matchAll(/:[^;{}]*\b(?:white|black|red|green|blue|orange|yellow|gray|grey|silver|purple)\b/g),
  ].map((match) => match[0]);

  assert.deepEqual(
    found,
    [],
    `a raw colour below the tokens stays the first theme's colour in the second: ${found.join(', ')}`,
  );
});

test('the store theme only restates tokens the first theme already has', () => {
  const root = declared(CSS.slice(ROOT_AT, STEAM_AT));
  const steam = declared(CSS.slice(STEAM_AT, STEAM_END));
  const invented = [...steam].filter((name) => !root.has(name));

  assert.deepEqual(
    invented,
    [],
    `these tokens exist only in the store theme, so they are undefined in Modern: ${invented.join(', ')}`,
  );
});

test('the tokens are declared in the two blocks and nowhere else', () => {
  const outside = declared(CSS.slice(STEAM_END));
  assert.deepEqual(
    [...outside],
    [],
    `a token declared outside the two blocks is a theme the switch cannot reach: ${[...outside].join(', ')}`,
  );
});

test('every token the file uses is declared, or written with a fallback', () => {
  const known = declared(CSS.slice(ROOT_AT, STEAM_END));
  const missing = [];

  for (const match of CSS.matchAll(/var\(\s*(--[\w-]+)\s*(,?)/g)) {
    const [, name, comma] = match;
    if (known.has(name)) continue;
    if (SET_FROM_CODE.includes(name) && comma === ',') continue;
    missing.push(name);
  }

  assert.deepEqual(
    [...new Set(missing)],
    [],
    `a token that is neither declared nor given a fallback resolves to nothing: ${missing.join(', ')}`,
  );
});

test('the quietest text colour stays readable on the surfaces it is written on', () => {
  // The contrast of the three levels of text was recomputed by hand against
  // every surface they land on; `--text-dim` is the one that sits closest to
  // the 4.5 : 1 line, so it is the one worth pinning. Both values below clear
  // it on the lightest surface each theme writes them on.
  const value = (block, name) => {
    const found = block.match(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm'));
    return found ? found[1].trim() : null;
  };
  const root = CSS.slice(ROOT_AT, STEAM_AT);
  const steam = CSS.slice(STEAM_AT, STEAM_END);

  assert.equal(contrast(value(root, '--text-dim'), '#1a2531') >= 4.5, true);
  assert.equal(contrast(value(steam, '--text-dim'), '#1b2838') >= 4.5, true);
  assert.equal(contrast(value(root, '--text-muted'), '#1a2531') >= 4.5, true);
  assert.equal(contrast(value(steam, '--text-muted'), '#22384c') >= 4.5, true);
});

/**
 * The WCAG contrast ratio of two opaque hex colours.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function contrast(a, b) {
  const luminance = (hex) => {
    const channel = (from) => {
      const value = parseInt(hex.slice(from, from + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
