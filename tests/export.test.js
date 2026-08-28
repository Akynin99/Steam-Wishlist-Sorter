/**
 * Tests for the four export formats.
 *
 * The escaping of the CSV gets the most attention here: game titles really do
 * contain quotes, semicolons and commas, and a table that breaks on one of
 * them is discovered by the user in a spreadsheet, long after the tool is
 * closed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createItem } from '../src/model.js';
import { createSession } from '../src/ranking.js';
import {
  APP_SIGNATURE,
  CSV_BOM,
  CSV_SEPARATOR,
  ORDER_FORMAT_VERSION,
  ORDER_KIND,
  buildOrderExport,
  csvField,
  entryOrigin,
  exportFileName,
  toCsv,
  toOrderJson,
  toPlainText,
} from '../src/export.js';
import { makeItems } from './helpers/fixtures.js';

const STAMP = '2026-08-28T10:00:00.000Z';

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
 * @returns {string[][]}
 */
function parseCsv(text) {
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
    else if (char === CSV_SEPARATOR) {
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
  assert.equal(rows[0][0], '№');
  assert.equal(rows[0][2], 'Название');

  const ranked = rows.slice(1, 6);
  assert.deepEqual(ranked.map((row) => row[0]), ['1', '2', '3', '4', '5']);
  assert.deepEqual(
    ranked.map((row) => Number(row[1])),
    result.entries.map((entry) => entry.appId),
  );
  assert.equal(ranked[0][3], 'Очень хочу');
  assert.equal(ranked[0][6], 'сравнения');
  assert.equal(ranked[4][6], 'запасной порядок');

  const removedRow = rows[6];
  assert.equal(removedRow[0], '', 'a removed item has no number in the ranking');
  assert.equal(Number(removedRow[1]), items[5].appId);
  assert.equal(removedRow[3], 'Удалить из желаемого');
});

test('the text list is a plain numbered list', () => {
  const { session } = makeSession();
  const result = session.getResult();
  const text = toPlainText(result);
  const lines = text.trimEnd().split('\n');

  assert.equal(lines[0], `1. ${result.entries[0].item.title}`);
  assert.equal(lines[4], `5. ${result.entries[4].item.title}`);
  assert.equal(lines[5], '');
  assert.equal(lines[6], 'Удалить из желаемого:');
  assert.equal(lines[7], `- ${result.removed[0].title}`);
  assert.ok(text.endsWith('\n'));
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
  assert.equal(order.items[0].categoryLabel, 'Очень хочу');
  assert.equal(order.items[0].category, 'must');
  assert.equal(order.items[0].kind, 'game');
  assert.ok(order.items[0].url.includes(String(order.items[0].appId)));

  assert.equal(order.remove.length, 1);
  assert.equal(order.remove[0].appId, items[5].appId);
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
  assert.equal(csvRows[1][6], 'вручную');
  assert.equal(toPlainText(after).split('\n')[0], `1. ${after.entries[0].item.title}`);
});

test('the file name carries the day of the export', () => {
  assert.equal(exportFileName('wishlist-order', 'json', STAMP), 'wishlist-order-2026-08-28.json');
  assert.equal(exportFileName('wishlist-order', 'csv', new Date(STAMP)), 'wishlist-order-2026-08-28.csv');
});
