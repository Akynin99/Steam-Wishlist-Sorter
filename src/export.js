/**
 * Turning a result into the four files the user leaves with.
 *
 * The module takes the output of `RankingSession.getResult()` and returns
 * text. It touches neither the DOM nor the storage, so every format can be
 * checked by a test on its own, character by character — which is the point,
 * because an escaping bug in a CSV is exactly the kind of thing that is only
 * noticed later, in a spreadsheet, by someone who no longer has the tool open.
 *
 * The files follow the language of the interface: the CSV header, the category
 * names and the kind of every item are written in it, and so is the field
 * separator, for the reason spelled out at `CSV_SEPARATORS`.
 *
 * Nothing here sends anything anywhere: the caller hands the text to the
 * browser as a file to save or to the clipboard.
 */

import { getLanguage, t } from './i18n.js';
import { categoryLabel } from './model.js';

/** Signature written into the exported order, the same one the state uses. */
export const APP_SIGNATURE = 'steam-wishlist-sorter';

/** What kind of file this is, so an order is never mistaken for a state. */
export const ORDER_KIND = 'wishlist-order';

/** Version of the exported order format. */
export const ORDER_FORMAT_VERSION = 1;

/**
 * Byte order mark. Excel decides the encoding of a `.csv` by it: without the
 * BOM it reads the file in the local ANSI code page and every Russian title
 * turns into mojibake.
 */
export const CSV_BOM = '\uFEFF';

/**
 * Field separator of the CSV, per interface language.
 *
 * A comma for English, the way RFC 4180 asks for, and a semicolon everywhere
 * else. The rule is not about Russian, it is about the decimal mark: Excel
 * splits a `.csv` by the list separator of the system locale, and every locale
 * that writes the decimal mark as a comma sets that separator to a semicolon.
 * Russian, German, French, Spanish and Brazilian Portuguese all do, so a comma
 * separated file opens there as one long column, which defeats the purpose of
 * exporting a table at all. That is the question to answer for a language added
 * later: comma for the decimal mark means a semicolon here.
 *
 * Everything else — LibreOffice, Google Sheets, pandas, `csv` of the standard
 * library — takes the separator as a parameter, so following the language of
 * the export costs those readers one argument and saves the default case on
 * both sides.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const CSV_SEPARATORS = Object.freeze({
  en: ',',
  ru: ';',
  de: ';',
  fr: ';',
  es: ';',
  'pt-BR': ';',
});

/**
 * Separator used by the CSV of a language.
 *
 * @param {string} [language] Defaults to the language of the interface.
 * @returns {string}
 */
export function csvSeparator(language = getLanguage()) {
  return CSV_SEPARATORS[language] ?? CSV_SEPARATORS.en;
}

/** Line ending of the CSV, as RFC 4180 asks for. */
const CSV_EOL = '\r\n';

/** Keys of the header row, in the order the columns come. */
const CSV_HEADER_KEYS = [
  'export.csv.number',
  'export.csv.appId',
  'export.csv.title',
  'export.csv.category',
  'export.csv.kind',
  'export.csv.positionInCategory',
  'export.csv.origin',
  'export.csv.wishlistPosition',
  'export.csv.url',
];

/**
 * Where the place of a line comes from. A line the user dragged is `manual`
 * even when the comparisons agree with it: it is their own decision either
 * way, and hiding that would make the export less honest than the screen.
 *
 * @param {import('./ranking.js').ResultEntry} entry
 * @returns {'manual'|'comparisons'|'fallback'}
 */
export function entryOrigin(entry) {
  if (entry.manual) return 'manual';
  return entry.resolved ? 'comparisons' : 'fallback';
}

/**
 * Name of an item kind in the language of the interface: these files are read
 * by a human, not by a parser.
 *
 * @param {import('./model.js').ItemKind} kind
 * @returns {string}
 */
function kindLabel(kind) {
  return t(`export.kind.${kind === 'game' || kind === 'dlc' ? kind : 'unknown'}`);
}

/**
 * How a line got to where it is, in one word.
 *
 * @param {import('./ranking.js').ResultEntry} entry
 * @returns {string}
 */
function originLabel(entry) {
  return t(`export.origin.${entryOrigin(entry)}`);
}

/**
 * The final order as plain data, ready to be written as JSON.
 *
 * This is the file the wishlist userscript reads back, so the contract is:
 * items come in the order they must end up in, `appId` identifies them and
 * nothing else does, and `remove` is a separate list that is not part of the
 * numbering.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @param {{ exportedAt?: Date|string }} [options] The timestamp is injectable
 *        so that a test can compare the whole file with an expected value.
 * @returns {object}
 */
export function buildOrderExport(result, options = {}) {
  const exportedAt = options.exportedAt ?? new Date();

  return {
    app: APP_SIGNATURE,
    kind: ORDER_KIND,
    version: ORDER_FORMAT_VERSION,
    exportedAt: typeof exportedAt === 'string' ? exportedAt : exportedAt.toISOString(),
    summary: {
      total: result.summary.total,
      resolved: result.summary.resolved,
      fallback: result.summary.fallback,
      manual: result.summary.manual ?? 0,
      removed: result.summary.removed,
      comparisons: result.summary.comparisons,
      complete: result.summary.complete,
    },
    items: result.entries.map((entry) => ({
      position: entry.position,
      appId: entry.appId,
      title: entry.item.title,
      url: entry.item.url,
      kind: entry.item.kind,
      category: entry.category,
      categoryLabel: categoryLabel(entry.category),
      positionInCategory: entry.positionInCategory,
      wishlistPosition: entry.item.wishlistPosition,
      origin: entryOrigin(entry),
      tiedWithPrevious: entry.tiedWithPrevious,
    })),
    remove: result.removed.map((item) => ({
      appId: item.appId,
      title: item.title,
      url: item.url,
      kind: item.kind,
      wishlistPosition: item.wishlistPosition,
    })),
  };
}

/**
 * The final order as JSON text.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @param {{ exportedAt?: Date|string }} [options]
 * @returns {string}
 */
export function toOrderJson(result, options = {}) {
  return `${JSON.stringify(buildOrderExport(result, options), null, 2)}\n`;
}

/**
 * Escapes one CSV field: a field that holds the separator, a quote or a line
 * break is wrapped in quotes, and the quotes inside it are doubled.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (!/[";\r\n,\t]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * @param {Array<unknown>} cells
 * @param {string} separator
 * @returns {string}
 */
function csvRow(cells, separator) {
  return cells.map(csvField).join(separator);
}

/**
 * The final list as a CSV table, with the BOM Excel needs, in the language of
 * the interface.
 *
 * The items marked for removal are part of the table as well — a spreadsheet
 * is where the whole picture is expected — but their number cell is empty, so
 * sorting by it never mixes them into the ranking.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {string}
 */
export function toCsv(result) {
  const separator = csvSeparator();
  const rows = [csvRow(CSV_HEADER_KEYS.map((key) => t(key)), separator)];

  for (const entry of result.entries) {
    rows.push(
      csvRow(
        [
          entry.position,
          entry.appId,
          entry.item.title,
          categoryLabel(entry.category),
          kindLabel(entry.item.kind),
          entry.positionInCategory,
          originLabel(entry),
          entry.item.wishlistPosition,
          entry.item.url,
        ],
        separator,
      ),
    );
  }

  for (const item of result.removed) {
    rows.push(
      csvRow(
        [
          '',
          item.appId,
          item.title,
          categoryLabel('remove'),
          kindLabel(item.kind),
          '',
          '',
          item.wishlistPosition,
          item.url,
        ],
        separator,
      ),
    );
  }

  return CSV_BOM + rows.join(CSV_EOL) + CSV_EOL;
}

/**
 * The plain numbered list, the one that goes into a chat or a note.
 *
 * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
 * @returns {string}
 */
export function toPlainText(result) {
  const lines = result.entries.map((entry) => `${entry.position}. ${entry.item.title}`);

  if (result.removed.length > 0) {
    lines.push('', `${categoryLabel('remove')}:`);
    for (const item of result.removed) lines.push(`- ${item.title}`);
  }

  return `${lines.join('\n')}\n`;
}

/**
 * Name of a file to offer, stamped with the day so that two exports of the
 * same kind do not overwrite each other in the downloads folder.
 *
 * @param {string} base      e.g. `wishlist-order`.
 * @param {string} extension Without the dot.
 * @param {Date|string} [date]
 * @returns {string}
 */
export function exportFileName(base, extension, date = new Date()) {
  const stamp = (typeof date === 'string' ? date : date.toISOString()).slice(0, 10);
  return `${base}-${stamp}.${extension}`;
}
