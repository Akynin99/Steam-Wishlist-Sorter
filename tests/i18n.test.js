/**
 * Tests for the dictionaries and the lookup around them.
 *
 * The important one is the first: the two dictionaries must hold exactly the
 * same keys. A key added on one side and forgotten on the other is the way a
 * bilingual interface rots — the missing string shows up months later, on the
 * one screen nobody reopened, in front of the visitor it was added for.
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

test('the two dictionaries hold exactly the same keys', () => {
  const en = new Set(Object.keys(DICTIONARIES.en));
  const ru = new Set(Object.keys(DICTIONARIES.ru));

  const missingInRussian = [...en].filter((key) => !ru.has(key)).sort();
  const missingInEnglish = [...ru].filter((key) => !en.has(key)).sort();

  assert.deepEqual(missingInRussian, [], 'these keys have no Russian translation');
  assert.deepEqual(missingInEnglish, [], 'these keys have no English translation');
  assert.equal(en.size, ru.size);
  assert.ok(en.size > 0);
});

test('every string of every dictionary is a non-empty string', () => {
  for (const language of LANGUAGES) {
    for (const [key, value] of Object.entries(DICTIONARIES[language])) {
      assert.equal(typeof value, 'string', `${language}/${key} is not a string`);
      assert.notEqual(value.trim(), '', `${language}/${key} is empty`);
    }
  }
});

test('a counted phrase defines every plural form in both languages', () => {
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
  assert.deepEqual([...LANGUAGES], ['en', 'ru']);
  assert.deepEqual(LANGUAGE_NAMES, { en: 'English', ru: 'Русский' });
});

test('the browser language is never consulted: only setLanguage decides', () => {
  // The demo is opened by strangers, and it opens in English for all of them.
  assert.equal(normalizeLanguage('ru'), 'ru');
  assert.equal(normalizeLanguage('ru-RU'), 'en', 'a locale tag is not a language of this application');
  assert.equal(normalizeLanguage('de'), 'en');
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

test('every category of the model has a label in both dictionaries', () => {
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
