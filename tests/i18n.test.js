/**
 * Tests for the dictionaries and the lookup around them.
 *
 * The important one is the first: every dictionary must hold exactly the same
 * keys. A key added on one side and forgotten on the others is the way a
 * multilingual interface rots — the missing string shows up months later, on
 * the one screen nobody reopened, in front of the visitor it was added for.
 * The test walks `LANGUAGES`, so a language added later is checked without
 * anyone editing it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LANGUAGE,
  DICTIONARIES,
  LANGUAGES,
  LANGUAGE_NAMES,
  PLURAL_FORMS,
  format,
  getLanguage,
  hasKey,
  normalizeLanguage,
  plural,
  setLanguage,
  t,
} from '../src/i18n.js';
import { CATEGORIES, categoryLabel, uncategorizedLabel } from '../src/model.js';

// The language is global state, so every test leaves it the way it found it.
test.afterEach(() => setLanguage(DEFAULT_LANGUAGE));

test('every dictionary holds exactly the same keys', () => {
  const en = new Set(Object.keys(DICTIONARIES.en));
  assert.ok(en.size > 0);

  for (const language of LANGUAGES) {
    if (language === DEFAULT_LANGUAGE) continue;
    const other = new Set(Object.keys(DICTIONARIES[language]));

    const untranslated = [...en].filter((key) => !other.has(key)).sort();
    const orphaned = [...other].filter((key) => !en.has(key)).sort();

    assert.deepEqual(untranslated, [], `these keys have no ${language} translation`);
    assert.deepEqual(orphaned, [], `these ${language} keys have no English original`);
    assert.equal(other.size, en.size);
  }
});

test('every language the switch offers has a dictionary and a name of its own', () => {
  for (const language of LANGUAGES) {
    assert.ok(DICTIONARIES[language], `${language} has no dictionary`);
    assert.equal(typeof LANGUAGE_NAMES[language], 'string', `${language} does not name itself`);
    assert.notEqual(LANGUAGE_NAMES[language].trim(), '');
  }
  assert.deepEqual(
    Object.keys(LANGUAGE_NAMES).sort(),
    [...LANGUAGES].sort(),
    'the names and the languages are the same set',
  );
  assert.deepEqual(
    Object.keys(DICTIONARIES).sort(),
    [...LANGUAGES].sort(),
    'the dictionaries and the languages are the same set',
  );
});

test('every string of every dictionary is a non-empty string', () => {
  for (const language of LANGUAGES) {
    for (const [key, value] of Object.entries(DICTIONARIES[language])) {
      assert.equal(typeof value, 'string', `${language}/${key} is not a string`);
      assert.notEqual(value.trim(), '', `${language}/${key} is empty`);
    }
  }
});

test('a counted phrase defines every plural form in every language', () => {
  const bases = new Set(
    Object.keys(DICTIONARIES.en)
      .filter((key) => key.startsWith('count.'))
      .map((key) => key.slice(0, key.lastIndexOf('.'))),
  );

  assert.ok(bases.size > 0, 'the dictionaries do have counted phrases');
  for (const base of bases) {
    for (const form of PLURAL_FORMS) {
      for (const language of LANGUAGES) {
        assert.ok(hasKey(`${base}.${form}`, language), `${language} misses ${base}.${form}`);
      }
    }
  }
});

test('the default language is English, and it is what a fresh module hands out', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(getLanguage(), 'en', 'nothing has switched the language yet');
  assert.equal(t('nav.import'), 'Wishlist');
  assert.deepEqual([...LANGUAGES], ['en', 'ru', 'de', 'fr']);
  assert.deepEqual(LANGUAGE_NAMES, {
    en: 'English',
    ru: 'Русский',
    de: 'Deutsch',
    fr: 'Français',
  });
});

test('the browser language is never consulted: only setLanguage decides', () => {
  // The demo is opened by strangers, and it opens in English for all of them.
  assert.equal(normalizeLanguage('ru'), 'ru');
  assert.equal(normalizeLanguage('de'), 'de');
  assert.equal(normalizeLanguage('fr'), 'fr');
  assert.equal(normalizeLanguage('ru-RU'), 'en', 'a locale tag is not a language of this application');
  assert.equal(normalizeLanguage('de-AT'), 'en');
  assert.equal(normalizeLanguage('es'), 'en', 'a language with no dictionary yet is not offered');
  assert.equal(normalizeLanguage(''), 'en');
  assert.equal(normalizeLanguage(undefined), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(normalizeLanguage(7), 'en');

  assert.equal(setLanguage('ru'), 'ru');
  assert.equal(getLanguage(), 'ru');
  assert.equal(setLanguage('klingon'), 'en', 'an unknown code falls back instead of throwing');
  assert.equal(getLanguage(), 'en');
});

test('switching the language switches the strings', () => {
  assert.equal(t('nav.result'), 'Result');
  setLanguage('ru');
  assert.equal(t('nav.result'), 'Результат');
  setLanguage('en');
  assert.equal(t('nav.result'), 'Result');
});

test('parameters are substituted, and a missing one stays visible', () => {
  assert.equal(format('{a} and {b}', { a: 1, b: 'two' }), '1 and two');
  assert.equal(format('nothing to fill', { a: 1 }), 'nothing to fill');
  assert.equal(format('{a} {a}', { a: 'twice' }), 'twice twice');
  assert.equal(format('{a} {b}', { a: 'here' }), 'here {b}', 'a forgotten parameter is not undefined');
  assert.equal(format('{a}', { a: 0 }), '0', 'a falsy value is still a value');
  assert.equal(format('{a}', { a: '' }), '');

  assert.equal(t('result.built.answers', { count: 12 }), 'Comparisons answered so far: 12.');
  setLanguage('ru');
  assert.equal(t('result.built.answers', { count: 12 }), 'Ответов на сравнения: 12.');
});

test('an unknown key does not throw and is visible as the problem it is', () => {
  const missing = 'no.such.key';

  assert.doesNotThrow(() => t(missing));
  assert.equal(t(missing), missing, 'the key itself stands where a sentence should be');
  assert.equal(t(missing, { count: 3 }), missing);
  assert.equal(hasKey(missing), false);
  assert.equal(hasKey('nav.import'), true);

  setLanguage('ru');
  assert.equal(t(missing), missing, 'and the same in the other language');
});

test('the plural rules pick the form each language needs', () => {
  assert.equal(plural('count.items', 1), '1 item');
  assert.equal(plural('count.items', 2), '2 items');
  assert.equal(plural('count.items', 5), '5 items');
  assert.equal(plural('count.items', 0), '0 items');
  assert.equal(plural('count.items', 21), '21 items');

  setLanguage('ru');
  assert.equal(plural('count.items', 1), '1 позиция');
  assert.equal(plural('count.items', 2), '2 позиции');
  assert.equal(plural('count.items', 4), '4 позиции');
  assert.equal(plural('count.items', 5), '5 позиций');
  assert.equal(plural('count.items', 11), '11 позиций');
  assert.equal(plural('count.items', 14), '14 позиций');
  assert.equal(plural('count.items', 21), '21 позиция');
  assert.equal(plural('count.items', 22), '22 позиции');
  assert.equal(plural('count.items', 111), '111 позиций');
  assert.equal(plural('count.items', 0), '0 позиций');

  setLanguage('de');
  assert.equal(plural('count.items', 1), '1 Eintrag');
  assert.equal(plural('count.items', 2), '2 Einträge');
  assert.equal(plural('count.items', 0), '0 Einträge');
  assert.equal(plural('count.items', 21), '21 Einträge');

  setLanguage('fr');
  assert.equal(plural('count.items', 1), '1 élément');
  assert.equal(plural('count.items', 2), '2 éléments');
  assert.equal(plural('count.items', 0), '0 élément', 'French counts zero as one');
  assert.equal(plural('count.items', 21), '21 éléments');
});

/**
 * The rules themselves, on the numbers where the four languages disagree.
 * The table is the CLDR rule for each of them, written out; the test is that
 * the module picks the same form. It matters most where the difference is one
 * number wide — French takes `one` at zero and nowhere else does, Russian
 * takes `few` at 21 and `one` at 101, the other three take `many` at both.
 */
test('the plural rules follow CLDR on the numbers that separate them', () => {
  const COUNTS = [0, 1, 2, 5, 11, 21, 101];
  const EXPECTED = {
    en: ['many', 'one', 'many', 'many', 'many', 'many', 'many'],
    ru: ['many', 'one', 'few', 'many', 'many', 'one', 'one'],
    de: ['many', 'one', 'many', 'many', 'many', 'many', 'many'],
    fr: ['one', 'one', 'many', 'many', 'many', 'many', 'many'],
  };

  assert.deepEqual(
    Object.keys(EXPECTED).sort(),
    [...LANGUAGES].sort(),
    'a language was added without a row in this table',
  );

  for (const [language, forms] of Object.entries(EXPECTED)) {
    setLanguage(language);
    COUNTS.forEach((count, index) => {
      // `plural()` hands back a string, not the form it chose, so the form is
      // checked through the string the dictionary holds under it.
      assert.equal(
        plural('count.items', count),
        t(`count.items.${forms[index]}`, { count }),
        `${language} takes the wrong form at ${count}`,
      );
    });
  }
});

test('a counted phrase can carry parameters of its own next to the count', () => {
  const progress = () =>
    t('compare.progress', {
      category: categoryLabel('want'),
      made: plural('count.comparisonsDone', 7),
      left: plural('count.pairs', 17),
    });

  assert.equal(progress(), 'Category “Want it” · 7 comparisons made · about 17 pairs left');
  setLanguage('ru');
  assert.equal(progress(), 'Категория «Хочу» · 7 сравнений сделано · примерно 17 пар осталось');
});

test('the category labels follow the language, and the ids never move', () => {
  assert.deepEqual(
    CATEGORIES.map((category) => category.id),
    ['must', 'want', 'maybe', 'unlikely', 'meh', 'remove'],
  );
  assert.equal(
    Object.hasOwn(CATEGORIES[0], 'label'),
    false,
    'a category carries no caption of its own any more',
  );

  assert.equal(categoryLabel('must'), 'Really want it');
  assert.equal(categoryLabel('remove'), 'Remove from the wishlist');
  assert.equal(categoryLabel(null), 'No category');
  assert.equal(uncategorizedLabel(), 'No category');

  setLanguage('ru');

  assert.equal(categoryLabel('must'), 'Очень хочу');
  assert.equal(categoryLabel('remove'), 'Удалить из желаемого');
  assert.equal(categoryLabel(null), 'Без категории');
  assert.equal(uncategorizedLabel(), 'Без категории');
});

test('every category of the model has a label in every dictionary', () => {
  for (const category of CATEGORIES) {
    for (const language of LANGUAGES) {
      assert.ok(hasKey(`category.${category.id}`, language), `${language} misses ${category.id}`);
    }
  }
  for (const language of LANGUAGES) {
    assert.ok(hasKey('category.none', language));
  }
});

test('a category id the model does not know is shown as it is, not translated away', () => {
  assert.equal(categoryLabel('wishlist'), 'wishlist');
});
