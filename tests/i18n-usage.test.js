/**
 * The net between the dictionaries and the code that uses them.
 *
 * `t()` on an unknown key returns the key itself: a typo travels all the way
 * to the screen instead of stopping at a red test, and a key nobody calls any
 * more sits in both dictionaries forever. This test closes both directions —
 * every key the code asks for exists in both dictionaries, and every key the
 * dictionaries hold is asked for by somebody.
 *
 * Keys reach the code in two ways. The markup names them in `data-i18n`,
 * `data-i18n-html` and `data-i18n-attr`; the modules write them as string
 * literals, whether inside a `t()` call or in a table of error codes. Both are
 * read here as text, because the alternative — running the interface — needs a
 * DOM the project deliberately does not have.
 *
 * What no literal can show is the handful of keys the code builds itself:
 * `category.${id}`, `kind.${kind}`, the plural forms. Those are expanded from
 * the very tables the code builds them from, so that adding a category or a
 * plural form keeps the test honest without anyone editing it.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BOOKMARKLET_TEXT_KEYS } from '../src/bookmarklet.js';
import { DICTIONARIES, LANGUAGES, PLURAL_FORMS } from '../src/i18n.js';
import { CATEGORIES, KINDS } from '../src/model.js';
import { THEMES } from '../src/theme.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The dictionaries are the source of the key list, so the module that holds
 * them cannot also count as a place that uses them: every key is written in it
 * once by definition.
 */
const SOURCE_OF_KEYS = 'i18n.js';

/** Shape of a dictionary key: `nav.result`, `import.skip.missingAppId`. */
const KEY_SHAPE = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+$/;

/** Every string literal of a module, single and double quoted. */
const STRING_LITERAL = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;

/** Namespaces the dictionaries define: `nav`, `import`, `steam` and so on. */
const NAMESPACES = new Set(Object.keys(DICTIONARIES.en).map((key) => key.split('.')[0]));

/**
 * Keys the code assembles from a table instead of writing them out. Each entry
 * is derived from that same table, so the whitelist cannot drift away from the
 * code the way a hand-written list would.
 *
 * @returns {string[]}
 */
function assembledKeys() {
  return [
    // `categoryLabel()` in model.js, plus the caption of an item without one.
    ...CATEGORIES.map((category) => `category.${category.id}`),
    'category.none',
    // `kindLabel()` in ui-common.js and the same table in export.js.
    ...KINDS.map((kind) => `kind.${kind}`),
    ...KINDS.map((kind) => `export.kind.${kind}`),
    // `entryOrigin()` in export.js returns exactly these three.
    'export.origin.manual',
    'export.origin.comparisons',
    'export.origin.fallback',
    // The name of a theme, for the confirmation `ui-app.js` shows on a switch.
    ...THEMES.map((theme) => `theme.${theme}`),
    // The texts carried inside the generated bookmarklet.
    ...BOOKMARKLET_TEXT_KEYS,
  ];
}

/**
 * Strips comments, so that a key named in prose or in an old `@example` does
 * not count as a use. Crude on purpose: it only has to be right about this
 * project, where comments are JSDoc blocks and whole lines.
 *
 * @param {string} source
 * @returns {string}
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/**
 * Every file that may name a dictionary key.
 *
 * @returns {Array<{ name: string, text: string }>}
 */
function readSources() {
  const files = [{ name: 'index.html', text: readFileSync(join(ROOT, 'index.html'), 'utf8') }];
  for (const entry of readdirSync(join(ROOT, 'src')).sort()) {
    if (!entry.endsWith('.js') || entry === SOURCE_OF_KEYS) continue;
    files.push({ name: `src/${entry}`, text: readFileSync(join(ROOT, 'src', entry), 'utf8') });
  }
  return files;
}

/**
 * Keys named by the markup. These are the ones `applyTranslations()` reads.
 *
 * @param {string} html
 * @returns {Map<string, string>} Key to the file it was found in.
 */
function keysFromMarkup(html) {
  const found = new Map();
  for (const [, key] of html.matchAll(/\bdata-i18n(?:-html)?="([^"]+)"/g)) {
    found.set(key.trim(), 'index.html');
  }
  for (const [, value] of html.matchAll(/\bdata-i18n-attr="([^"]+)"/g)) {
    for (const pair of value.split(';')) {
      const [, key] = pair.split(':').map((part) => part.trim());
      if (key) found.set(key, 'index.html');
    }
  }
  return found;
}

/**
 * Keys named by a module as a string literal — in a `t()` call, in a table of
 * error codes, in a field of a failure record. A literal counts as a key only
 * when its first segment is a namespace the dictionaries define, which is what
 * keeps `'./steam.js'` and other dotted strings out of the list.
 *
 * @param {string} code
 * @returns {string[]}
 */
function keysFromCode(code) {
  const keys = [];
  for (const match of withoutComments(code).matchAll(STRING_LITERAL)) {
    const literal = match[1] ?? match[2];
    if (!literal || !KEY_SHAPE.test(literal)) continue;
    if (!NAMESPACES.has(literal.split('.')[0])) continue;
    keys.push(literal);
  }
  return keys;
}

/**
 * Everything the code asks for, with one place it was found in — enough for a
 * failure message to point somewhere.
 *
 * @returns {Map<string, string>}
 */
function collectUsedKeys() {
  const used = new Map();
  for (const file of readSources()) {
    if (file.name === 'index.html') {
      for (const [key, where] of keysFromMarkup(file.text)) used.set(key, where);
    }
    for (const key of keysFromCode(file.text)) {
      if (!used.has(key)) used.set(key, file.name);
    }
  }
  for (const key of assembledKeys()) {
    if (!used.has(key)) used.set(key, 'built by the code from a table');
  }
  return used;
}

/**
 * A counted phrase is stored as one key per plural form and asked for by its
 * base, so a use of `count.items` is a use of `count.items.one` and of its two
 * siblings.
 *
 * @param {string} key
 * @returns {string[]}
 */
function pluralForms(key) {
  return PLURAL_FORMS.map((form) => `${key}.${form}`);
}

test('the markup and the modules do name keys, and the scan finds them', () => {
  const used = collectUsedKeys();

  // A guard on the scan itself: a regex that quietly stopped matching would
  // otherwise turn both tests below green and empty.
  assert.ok(used.size > 100, `only ${used.size} keys were found in the sources`);
  assert.equal(used.get('nav.result'), 'index.html');
  assert.equal(used.get('import.error.emptyInput'), 'src/ui-import.js');
  assert.equal(used.get('steam.error.rateLimited'), 'src/ui-steam.js');
  assert.ok(used.has('category.must'), 'the category captions are expanded from CATEGORIES');
  assert.ok(used.has('bookmarklet.confirm'), 'the bookmarklet texts come from their own table');
});

test('every key the code asks for exists in both dictionaries', () => {
  const missing = [];

  for (const [key, where] of collectUsedKeys()) {
    for (const language of LANGUAGES) {
      const dictionary = DICTIONARIES[language];
      if (Object.hasOwn(dictionary, key)) continue;
      // The base of a counted phrase: the code asks for `count.items`, the
      // dictionary holds the three forms of it.
      if (pluralForms(key).every((form) => Object.hasOwn(dictionary, form))) continue;
      missing.push(`${key} (${where}) is missing from the ${language} dictionary`);
    }
  }

  assert.deepEqual(missing.sort(), [], 'these keys are used but not translated');
});

test('every key of the dictionaries is asked for by somebody', () => {
  const used = collectUsedKeys();
  const alive = new Set(used.keys());
  for (const key of used.keys()) {
    for (const form of pluralForms(key)) alive.add(form);
  }

  const dead = Object.keys(DICTIONARIES.en).filter((key) => !alive.has(key));

  assert.deepEqual(dead.sort(), [], 'these keys are translated but nothing uses them');
});
