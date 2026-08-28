/**
 * Tests for the four export formats.
 *
 * The escaping of the CSV gets the most attention here: game titles really do
 * contain quotes, semicolons and commas, and a table that breaks on one of
 * them is discovered by the user in a spreadsheet, long after the tool is
 * closed.
 *
 * The files follow the language of the interface, so the ones a human reads
 * are checked in both: a header, a category and a separator that stayed
 * English in a Russian export would only be noticed in a spreadsheet.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { setLanguage } from '../src/i18n.js';
import { createItem } from '../src/model.js';
import { createSession } from '../src/ranking.js';
import {
  APP_SIGNATURE,
  CSV_BOM,
  CSV_SEPARATORS,
  ORDER_FORMAT_VERSION,
  ORDER_KIND,
  buildOrderExport,
  csvField,
  csvSeparator,
  entryOrigin,
  exportFileName,
  toCsv,
  toOrderJson,
  toPlainText,
} from '../src/export.js';
import { makeItems } from './helpers/fixtures.js';

const STAMP = '2026-08-28T10:00:00.000Z';

// The language is global, so every test that changes it puts it back: English
// is the default the rest of the suite expects.
test.afterEach(() => setLanguage('en'));

/**
 * A small session: three items sorted by comparisons, two left in the fallback
 * order and one marked for removal.
 *
 * @returns {{ session: import('../src/ranking.js').RankingSession,
 *             items: import('../src/model.js').WishlistItem[] }}
 */
function makeSession() {
  const items = makeItems(6);
  const session = createSession({ items });
  for (const item of items.slice(0, 5)) session.setCategory(item.appId, 'must');
  session.setCategory(items[5].appId, 'remove');
  session.submitAnswer('a', { a: items[1].appId, b: items[0].appId });
  session.submitAnswer('a', { a: items[0].appId, b: items[2].appId });
  return { session, items };
}

/**
 * Splits a CSV that was written by this module back into rows and cells, so a
 * test can assert on the values rather than on the text.
 *
 * @param {string} text
 * @param {string} [separator] Defaults to the one of the current language.
 * @returns {string[][]}
 */
function parseCsv(text, separator = csvSeparator()) {
  const body = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && body[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * The header row of a CSV, without the BOM that comes in front of it.
 *
 * @param {string} text
 * @returns {string}
 */
function headerLine(text) {
  return text.slice(CSV_BOM.length).split('\r\n')[0];
}

test('a field is quoted exactly when it has to be', () => {
  assert.equal(csvField('Portal 2'), 'Portal 2');
  assert.equal(csvField(42), '42');
  assert.equal(csvField(''), '');
  assert.equal(csvField(null), '');
  assert.equal(csvField(undefined), '');
  assert.equal(csvField('Half-Life 2: Episode One'), 'Half-Life 2: Episode One');

  assert.equal(csvField('S.T.A.L.K.E.R.: Clear Sky; Director’s Cut'), '"S.T.A.L.K.E.R.: Clear Sky; Director’s Cut"');
  assert.equal(csvField('The "Best" Game'), '"The ""Best"" Game"');
  assert.equal(csvField('Portal 2, again'), '"Portal 2, again"');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField('two\r\nlines'), '"two\r\nlines"');
});

test('a hostile title survives the round trip through the CSV', () => {
  const nasty = 'Quote " and ; and , and\nnewline';
  const items = [createItem({ appId: 10, title: nasty, wishlistPosition: 1 })];
  const session = createSession({ items });

  const rows = parseCsv(toCsv(session.getResult()));
  assert.equal(rows.length, 2, 'a header and one line');
  assert.equal(rows[1][2], nasty, 'the title comes back exactly as it went in');
});

test('the CSV starts with the BOM and uses CRLF', () => {
  const { session } = makeSession();
  const csv = toCsv(session.getResult());

  assert.ok(csv.startsWith(CSV_BOM), 'Excel needs the BOM to read it as UTF-8');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csv.split('\r\n').length - 1, csv.split('\n').length - 1, 'every LF is part of a CRLF');
});

test('the CSV holds the whole list plus the items marked for removal', () => {
  const { session, items } = makeSession();
  const result = session.getResult();
  const rows = parseCsv(toCsv(result));

  assert.equal(rows.length, 1 + 5 + 1, 'header, five ranked lines, one removed');
  assert.equal(rows[0][0], '#');
  assert.equal(rows[0][2], 'Title');

  const ranked = rows.slice(1, 6);
  assert.deepEqual(ranked.map((row) => row[0]), ['1', '2', '3', '4', '5']);
  assert.deepEqual(
    ranked.map((row) => Number(row[1])),
    result.entries.map((entry) => entry.appId),
  );
  assert.equal(ranked[0][3], 'Really want it');
  assert.equal(ranked[0][6], 'comparisons');
  assert.equal(ranked[4][6], 'fallback order');

  const removedRow = rows[6];
  assert.equal(removedRow[0], '', 'a removed item has no number in the ranking');
  assert.equal(Number(removedRow[1]), items[5].appId);
  assert.equal(removedRow[3], 'Remove from the wishlist');
});

test('the CSV is written in the language of the interface', () => {
  const { session } = makeSession();
  setLanguage('ru');
  const rows = parseCsv(toCsv(session.getResult()));

  assert.equal(rows[0][0], '№');
  assert.equal(rows[0][2], 'Название');
  assert.equal(rows[1][3], 'Очень хочу');
  assert.equal(rows[1][4], 'Игра');
  assert.equal(rows[1][6], 'сравнения');
  assert.equal(rows[5][6], 'запасной порядок');
  assert.equal(rows[6][3], 'Удалить из желаемого');
});

test('the CSV separator follows the language, comma for en and semicolon for ru', () => {
  const { session } = makeSession();

  assert.equal(csvSeparator('en'), ',');
  assert.equal(csvSeparator('ru'), ';');
  assert.equal(csvSeparator('klingon'), CSV_SEPARATORS.en, 'an unknown language reads as English');

  const english = headerLine(toCsv(session.getResult()));
  assert.ok(english.startsWith('#,App ID,Title,'), english);
  assert.ok(!english.includes(';'), 'RFC 4180 asks for a comma and nothing else');

  setLanguage('ru');
  const russian = headerLine(toCsv(session.getResult()));
  // Excel on a Russian locale splits by the system list separator, which is a
  // semicolon: a comma there would open as one long column.
  assert.ok(russian.startsWith('№;App ID;Название;'), russian);
});

test('a title with a comma survives the English CSV, one with a semicolon the Russian', () => {
  const items = [
    createItem({ appId: 10, title: 'Portal 2, again', wishlistPosition: 1 }),
    createItem({ appId: 11, title: 'S.T.A.L.K.E.R.: Clear Sky; Director Cut', wishlistPosition: 2 }),
  ];
  const session = createSession({ items });

  const english = parseCsv(toCsv(session.getResult()));
  assert.equal(english[1][2], 'Portal 2, again');
  assert.equal(english[2][2], 'S.T.A.L.K.E.R.: Clear Sky; Director Cut');

  setLanguage('ru');
  const russian = parseCsv(toCsv(session.getResult()));
  assert.equal(russian[1][2], 'Portal 2, again');
  assert.equal(russian[2][2], 'S.T.A.L.K.E.R.: Clear Sky; Director Cut');
});

test('the text list is a plain numbered list', () => {
  const { session } = makeSession();
  const result = session.getResult();
  const text = toPlainText(result);
  const lines = text.trimEnd().split('\n');

  assert.equal(lines[0], `1. ${result.entries[0].item.title}`);
  assert.equal(lines[4], `5. ${result.entries[4].item.title}`);
  assert.equal(lines[5], '');
  assert.equal(lines[6], 'Remove from the wishlist:');
  assert.equal(lines[7], `- ${result.removed[0].title}`);
  assert.ok(text.endsWith('\n'));

  setLanguage('ru');
  assert.equal(toPlainText(result).trimEnd().split('\n')[6], 'Удалить из желаемого:');
});

test('an empty session still exports every format without throwing', () => {
  const result = createSession().getResult();

  assert.equal(toPlainText(result), '\n');
  assert.equal(parseCsv(toCsv(result)).length, 1, 'the header alone');

  const order = JSON.parse(toOrderJson(result, { exportedAt: STAMP }));
  assert.deepEqual(order.items, []);
  assert.deepEqual(order.remove, []);
  assert.equal(order.summary.total, 0);
});

test('the exported order carries the signature, the order and nothing derived', () => {
  const { session, items } = makeSession();
  const result = session.getResult();
  const order = buildOrderExport(result, { exportedAt: STAMP });

  assert.equal(order.app, APP_SIGNATURE);
  assert.equal(order.kind, ORDER_KIND);
  assert.equal(order.version, ORDER_FORMAT_VERSION);
  assert.equal(order.exportedAt, STAMP);

  assert.equal(order.summary.total, 5);
  assert.equal(order.summary.removed, 1);
  assert.equal(order.summary.comparisons, 2);
  assert.equal(order.summary.complete, false);

  assert.deepEqual(order.items.map((item) => item.position), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    order.items.map((item) => item.appId),
    result.entries.map((entry) => entry.appId),
  );
  assert.equal(order.items[0].categoryLabel, 'Really want it');
  assert.equal(order.items[0].category, 'must');
  assert.equal(order.items[0].kind, 'game');
  assert.ok(order.items[0].url.includes(String(order.items[0].appId)));

  assert.equal(order.remove.length, 1);
  assert.equal(order.remove[0].appId, items[5].appId);

  // The id is the contract of the file, the label is only there for a human:
  // it follows the language, the id never does.
  setLanguage('ru');
  const russian = buildOrderExport(result, { exportedAt: STAMP });
  assert.equal(russian.items[0].category, 'must');
  assert.equal(russian.items[0].categoryLabel, 'Очень хочу');
});

test('the exported JSON is valid JSON and ends with a newline', () => {
  const { session } = makeSession();
  const text = toOrderJson(session.getResult(), { exportedAt: new Date(STAMP) });

  assert.ok(text.endsWith('\n'));
  const parsed = JSON.parse(text);
  assert.equal(parsed.exportedAt, STAMP);
  assert.equal(parsed.items.length, 5);
});

test('a line placed by hand is exported as placed by hand', () => {
  const { session, items } = makeSession();
  const before = session.getResult();
  assert.equal(before.entries[0].appId, items[1].appId);

  // The last item is dragged to the very top of the category.
  session.moveItem(items[4].appId, before.entries[0].appId, 'before');
  const after = session.getResult();

  assert.equal(after.entries[0].appId, items[4].appId);
  assert.equal(entryOrigin(after.entries[0]), 'manual');
  assert.equal(after.summary.manual, 1);

  const order = buildOrderExport(after, { exportedAt: STAMP });
  assert.equal(order.items[0].appId, items[4].appId);
  assert.equal(order.items[0].origin, 'manual');
  assert.equal(order.summary.manual, 1);

  const csvRows = parseCsv(toCsv(after));
  assert.equal(csvRows[1][6], 'by hand');
  assert.equal(toPlainText(after).split('\n')[0], `1. ${after.entries[0].item.title}`);
});

test('the file name carries the day of the export', () => {
  assert.equal(exportFileName('wishlist-order', 'json', STAMP), 'wishlist-order-2026-08-28.json');
  assert.equal(exportFileName('wishlist-order', 'csv', new Date(STAMP)), 'wishlist-order-2026-08-28.csv');
});
