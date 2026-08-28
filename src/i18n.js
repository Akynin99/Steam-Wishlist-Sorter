/**
 * Interface language: dictionaries and the lookup around them.
 *
 * The application is bilingual, and English is the default in every situation:
 * the live demo is opened by strangers, and a Russian interface simply turns
 * them away. The browser language is deliberately not consulted — a demo that
 * greets one visitor in Russian and another in English is harder to reason
 * about than one that always starts in English and offers a switch.
 *
 * A dictionary is flat: `'result.summary.total'` is one key, not a path into
 * nested objects. Flat keys make the two dictionaries directly comparable,
 * which is what the test that guards against a forgotten translation does.
 *
 * The module has no dependency on the DOM, so it is tested directly, the way
 * `export.js` is. Everything that touches elements lives in `ui-common.js`.
 */

/** Languages the interface is available in. @type {ReadonlyArray<string>} */
export const LANGUAGES = Object.freeze(['en', 'ru']);

/** The language a fresh visitor gets, always. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * How each language calls itself. Native names are not translated — a Russian
 * reader looks for «Русский» in the switch, not for "Russian".
 *
 * @type {Readonly<Record<string, string>>}
 */
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', ru: 'Русский' });

/**
 * Suffixes of the plural forms every counted phrase defines in both
 * dictionaries. Russian needs three of them; English selects only `one` and
 * `many`, and still carries a `few` equal to `many`, so that the two
 * dictionaries hold exactly the same set of keys and the parity test stays a
 * simple set comparison.
 *
 * @type {ReadonlyArray<string>}
 */
export const PLURAL_FORMS = Object.freeze(['one', 'few', 'many']);

/**
 * Which plural form a count takes, per language.
 *
 * @type {Readonly<Record<string, (count: number) => string>>}
 */
const PLURAL_RULES = Object.freeze({
  en: (count) => (Math.abs(count) === 1 ? 'one' : 'many'),
  ru: (count) => {
    const n = Math.abs(count) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return 'many';
    if (last > 1 && last < 5) return 'few';
    if (last === 1) return 'one';
    return 'many';
  },
});

/* ------------------------------------------------------------ english */

/** @type {Readonly<Record<string, string>>} */
const EN = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} item',
  'count.items.few': '{count} items',
  'count.items.many': '{count} items',
  'count.records.one': '{count} record',
  'count.records.few': '{count} records',
  'count.records.many': '{count} records',
  'count.comparisonsMade.one': '{count} comparison made',
  'count.comparisonsMade.few': '{count} comparisons made',
  'count.comparisonsMade.many': '{count} comparisons made',
  'count.pairs.one': '{count} pair',
  'count.pairs.few': '{count} pairs',
  'count.pairs.many': '{count} pairs',
  'count.rows.one': '{count} row',
  'count.rows.few': '{count} rows',
  'count.rows.many': '{count} rows',
  'count.moves.one': '{count} move',
  'count.moves.few': '{count} moves',
  'count.moves.many': '{count} moves',
  'count.answers.one': '{count} answer',
  'count.answers.few': '{count} answers',
  'count.answers.many': '{count} answers',
  'count.marked.one': '{count} item is marked',
  'count.marked.few': '{count} items are marked',
  'count.marked.many': '{count} items are marked',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'A local tool that puts a Steam wishlist in order through pairwise comparisons.',
  'a11y.skipToContent': 'Skip to the content',
  'nav.aria': 'Stages',
  'nav.import': 'Import',
  'nav.categorize': 'Categories',
  'nav.compare': 'Comparisons',
  'nav.result': 'Result',
  'settings.covers': 'Load covers',
  'settings.language': 'Interface language',
  'actions.saveState': 'Save to a file',
  'actions.reset': 'Start over',
  'privacy.note':
    'Your data never leaves the browser. The only external request the application makes at any '
    + 'point is loading game covers from the Steam CDN over a public URL; it is switched off by the '
    + '“Load covers” toggle.',
  'dialog.title': 'Confirm the action',
  'dialog.cancel': 'Cancel',
  'dialog.confirm': 'Continue',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Open in Steam ↗',
  'common.openInSteamAria': 'Open “{title}” in Steam, in a new tab',
  'category.must': 'Really want it',
  'category.want': 'Want it',
  'category.maybe': 'Maybe',
  'category.unlikely': 'Unlikely',
  'category.meh': 'Barely interested',
  'category.remove': 'Remove from the wishlist',
  'category.none': 'No category',
  'kind.game': 'Game',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Type unknown',
  'cover.none': 'No cover',
  'cover.off': 'Covers are off',
  'cover.failed': 'The cover did not load',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'The state could not be saved in the browser. Save it to a file so that nothing is lost.',
  'app.saveFailedReason': 'The state could not be saved: {message}',
  'app.loadFailed': 'The saved state could not be read ({message}). Starting from an empty list.',
  'app.covers.on': 'Covers are on: the application loads pictures from the Steam CDN.',
  'app.covers.off': 'Covers are off: the application makes no external request at all.',
  'app.language.changed': 'Interface language: {language}.',
  'app.reset.title': 'Start over?',
  'app.reset.text':
    'All {items}, the categories, the comparison answers and the manual moves will be deleted. '
    + 'This cannot be undone — if the work may still come in handy, save it to a file first.',
  'app.reset.confirm': 'Delete everything and start over',
  'app.reset.done': 'The state is cleared.',
  'app.state.buildFailed': 'The state file could not be built: {message}',
  'app.state.saved': 'The state is saved to a file.',

  /* -- import screen ------------------------------------------------ */
  'import.heading': 'Import the wishlist',
  'import.hint':
    'Load a JSON file with your wishlist — or take the demo set if you just want to see how this '
    + 'works.',
  'import.file.title': 'JSON file',
  'import.file.hint': 'An export from Steam or a file collected by the userscript.',
  'import.file.button': 'Choose a file…',
  'import.file.none': 'No file chosen',
  'import.paste.title': 'Paste JSON',
  'import.paste.hint': 'The body of the Steam response can be pasted as is.',
  'import.paste.label': 'Wishlist JSON',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Import from the text',
  'import.state.title': 'Saved state',
  'import.state.hint':
    'A file you saved earlier with “Save to a file”: both the categories and every answer come back.',
  'import.state.button': 'Choose a state file…',
  'import.demo.title': 'Demo set',
  'import.demo.hint': '20 real games from Steam. Enough to walk both stages and see the result.',
  'import.demo.button': 'Load the demo set',
  'import.continue': 'Continue',
  'import.current':
    'The list holds {items} right now: {sorted} with a category, {plain} without. Comparisons made: '
    + '{comparisons}. Importing again refreshes the entries and keeps the work already done.',
  'import.announce': 'Imported {count}. The list now holds {total}.',
  'import.source.file': 'File {name}',
  'import.source.pasted': 'Pasted text',
  'import.source.demo': 'Demo set',
  'import.report.title': '{source}: {records} read',
  'import.report.added': 'added',
  'import.report.updated': 'updated',
  'import.report.duplicates': 'duplicates',
  'import.report.skipped': 'skipped',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'record #{number}',
  'import.issue.key': 'key “{key}”',
  'import.issue.more': '…and {count} more',
  'import.skip.notAnObject': 'the record looks neither like an item nor like an app id',
  'import.skip.missingAppId': 'no application id',
  'import.skip.invalidAppId': 'the application id is not a number',
  'import.skip.duplicateInInput': 'the item already occurred in this very file',
  'import.error.title': 'The import failed',
  'import.error.emptyInput': 'There is nothing to import: the file or the field is empty.',
  'import.error.invalidJson':
    'This is not JSON. It looks like the text was copied only in part, or something extra got into it.',
  'import.error.unrecognizedFormat':
    'The JSON was read, but it does not look like a wishlist. What is needed is an array of items, an '
    + 'object shaped like { "440": { … } } or a Steam response with a response.items field.',
  'import.error.emptyResultTitle': 'The import went through, but the list is empty',
  'import.error.emptyResultText':
    'Not a single item could be read. Check that the file really holds a wishlist.',
  'import.error.fileRead': 'The file could not be read',
  'import.demo.failedTitle': 'The demo set did not load',
  'import.demo.failedText':
    '{message}. The file {url} has to sit next to index.html — and the page has to be opened over '
    + 'http(s), not as file://.',
  'import.demo.httpError': 'the server answered {status}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'The state file does not read as JSON.',
  'state.error.foreignState':
    'This is the JSON of another application: it carries no Steam Wishlist Sorter signature.',
  'state.error.unsupportedVersion':
    'The file was saved by another version of the format and is not supported.',
  'state.error.invalidState': 'The file looks like a state, but it holds no session.',
  'state.error.writeFailed': 'The state was read, but the browser refused to save it.',
  'state.confirm.title': 'Load the state over the current one?',
  'state.confirm.text':
    'The list holds {items} and {comparisons} right now. The file replaces all of it whole: the list, '
    + 'the categories, the answers and the manual moves. This cannot be undone.',
  'state.confirm.confirm': 'Replace the current state',
  'state.confirm.cancelled': 'The state import was cancelled — nothing changed.',
  'state.restored.title': 'The state is restored',
  'state.restored.items': 'items',
  'state.restored.comparisons': 'comparisons made',
  'state.restored.moves': 'manual moves',
  'state.restored.toast': 'The state is restored from the file.',

  /* -- categories screen -------------------------------------------- */
  'categorize.heading': 'Step 1. Categories',
  'categorize.hint':
    'How badly do you want it? Keys <kbd>1</kbd>–<kbd>6</kbd>, <kbd>←</kbd> — back, <kbd>→</kbd> or '
    + '<kbd>Space</kbd> — postpone.',
  'categorize.buttonsAria': 'Categories',
  'categorize.counter': '{index} of {total}',
  'categorize.back': '← Previous',
  'categorize.defer': 'Postpone',
  'categorize.skip': 'Skip the stage and go to the comparisons',
  'categorize.done': 'Every item has a category.',
  'categorize.toCompare': 'Go to the comparisons',
  'categorize.empty': 'The list is empty: import a wishlist first.',
  'categorize.toImport': 'Go to the import',
  'categorize.position': 'Position in your wishlist: {position}',
  'categorize.current': 'Now: {category}. Pick another category to change it.',
  'categorize.legend': '{classified} of {total} classified.',
  'categorize.legendLeft': '{classified} of {total} classified, {items} left.',
  'categorize.firstItem': 'This is the first item of the list.',
  'categorize.noneLeft': 'There are no unclassified items left.',
  'categorize.postponed': '{title} is postponed, we come back to it at the end of the lap.',
  'categorize.announce': '{title}: {category}',

  /* -- comparisons screen -------------------------------------------- */
  'compare.heading': 'Step 2. Comparisons',
  'compare.doneLabel': 'comparisons made: ',
  'compare.leftLabel': 'about this many left: ',
  'compare.deferred': 'postponed: {pairs}',
  'compare.pause': 'Pause',
  'compare.stop': 'Stop and see the result',
  'compare.preferA': 'Want it more <kbd>A</kbd>',
  'compare.preferB': 'Want it more <kbd>D</kbd>',
  'compare.drop': 'Do not want it any more',
  'compare.or': 'or',
  'compare.tie': 'About the same <kbd>S</kbd>',
  'compare.defer': 'Cannot decide <kbd>Space</kbd>',
  'compare.undo': 'Undo <kbd>Backspace</kbd>',
  'compare.category': 'Category: {category}',
  'compare.done': 'There is nothing left to compare: the order is settled.',
  'compare.empty': 'There is nothing to compare: the list is empty.',
  'compare.toResult': 'See the result',
  'compare.toImport': 'Go to the import',
  'compare.banner.allDeferred':
    'Every other question is postponed ({count}), and there is no way on without an answer to this '
    + 'one. “About the same” is an answer too, and the sorting moves on.',
  'compare.banner.forced': 'This pair is needed to move on.',
  'compare.rejected': 'The answer was not accepted: {message}',
  'compare.dropped': '“{title}” is on the list to remove from the wishlist.',
  'compare.nothingToUndo': 'There is nothing to undo.',
  'compare.undone': 'The last answer is undone.',
  'compare.chosen': 'Chosen: {title}.',
  'compare.tied': '{a} and {b} — about the same.',
  'compare.postponed': 'The pair is postponed.',
  'compare.paused': 'Paused. Everything is saved — you can close the tab and come back later.',

  /* -- result screen -------------------------------------------------- */
  'result.heading': 'Result',
  'result.continue': 'Continue the sorting',
  'result.complete': 'The sorting is finished',
  'result.toImport': 'Go to the import',
  'result.legend.sorted': 'the order is confirmed by comparisons',
  'result.legend.fallback': 'fallback order — by the position in the wishlist',
  'result.legend.manual': 'moved by hand',
  'result.search': 'Search by title or App ID',
  'result.filterAria': 'What to show',
  'result.filter.all': 'All',
  'result.filter.game': 'Games',
  'result.filter.dlc': 'DLC',
  'result.exportJson': 'Order as JSON',
  'result.exportCsv': 'List as CSV',
  'result.copyText': 'Copy as a list',
  'result.saveState': 'Backup of the state',
  'result.hint':
    'A row can be dragged with the mouse, or selected and moved with <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd>. The moves are saved and survive a reload.',
  'result.removed.hint': 'These items are not part of the numbering of the final list.',
  'result.resetManual': 'Reset the manual edits',
  'result.resetAnswers': 'Reset the comparison answers',
  'result.mark.tied': '= same as the previous one',
  'result.mark.manual': 'moved by hand',
  'result.mark.fallback': 'fallback order',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} in the category',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.ariaManual': 'Moved by hand.',
  'result.row.ariaFallback': 'Fallback order.',
  'result.row.categoryAria': 'Category: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': '{shown} of {total} shown',
  'result.empty.filter': 'Neither the filter nor the search matched a single item.',
  'result.empty.noItems': 'Import a wishlist and the result appears here.',
  'result.empty.allRemoved': 'Every item is marked for removal — there is nothing to order.',
  'result.summary.empty': 'The list is empty: there is nothing to show yet.',
  'result.summary.allRemoved':
    '{marked} for removal from the wishlist, so there is nothing left to order.',
  'result.summary.total': '{items} in total.',
  'result.summary.resolved':
    'The order of {resolved} is confirmed by comparisons, the other {fallback} stand in the fallback '
    + 'order — by their position in your wishlist.',
  'result.summary.manual': '{items} moved by hand.',
  'result.summary.removed':
    'Another {marked} for removal from the wishlist — they go as a separate list.',
  'result.summary.comparisons': 'Comparisons made: {count}.',
  'result.summary.complete': 'The sorting is finished.',
  'result.summary.incomplete': 'The sorting is not finished, it can be continued.',
  'result.move.failed': 'It could not be moved: {message}',
  'result.move.announce': '“{title}” {where}{category}.',
  'result.move.place': 'to place {position}',
  'result.move.newPlace': 'to a new place',
  'result.move.categorySuffix': ', category: {category}',
  'result.move.categoryToast': '“{title}” moved into “{category}”.',
  'result.move.edge':
    'This is the {edge} row of the “{category}” category. The category is changed by the picker in '
    + 'the row itself.',
  'result.move.edgeFirst': 'first',
  'result.move.edgeLast': 'last',
  'result.category.failed': 'The category could not be changed: {message}',
  'result.category.toast': '“{title}” — {category}.',
  'result.export.empty': 'There is nothing to export: the list is empty.',
  'result.export.failed': 'The file could not be built: {message}',
  'result.export.jsonDone': 'The final order is saved as JSON.',
  'result.export.csvDone': 'The final list is saved as CSV.',
  'result.copy.empty': 'There is nothing to copy: the list is empty.',
  'result.copy.done': 'The numbered list is copied to the clipboard.',
  'result.copy.failed':
    'The browser refused access to the clipboard — the list was saved as a file instead.',
  'result.resetManual.none': 'There are no manual moves.',
  'result.resetManual.title': 'Reset the manual edits?',
  'result.resetManual.text':
    '{moves} will be forgotten and the list goes back to the order the comparisons give. The '
    + 'comparison answers stay.',
  'result.resetManual.confirm': 'Reset the moves',
  'result.resetManual.done': 'The manual moves are reset.',
  'result.resetAnswers.none': 'There are no answers yet.',
  'result.resetAnswers.title': 'Reset the comparison answers?',
  'result.resetAnswers.text':
    '{answers} will be deleted and the comparisons start from zero. The list of items, the categories '
    + 'and the manual moves stay. This cannot be undone.',
  'result.resetAnswers.confirm': 'Reset the answers',
  'result.resetAnswers.done': 'The comparison answers are reset.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': '#',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Title',
  'export.csv.category': 'Category',
  'export.csv.kind': 'Type',
  'export.csv.positionInCategory': 'Place in the category',
  'export.csv.origin': 'Where the order comes from',
  'export.csv.wishlistPosition': 'Wishlist position',
  'export.csv.url': 'Link',
  'export.origin.manual': 'by hand',
  'export.origin.comparisons': 'comparisons',
  'export.origin.fallback': 'fallback order',
  'export.kind.game': 'Game',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Unknown',
};

/* ------------------------------------------------------------ russian */

/** @type {Readonly<Record<string, string>>} */
const RU = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} позиция',
  'count.items.few': '{count} позиции',
  'count.items.many': '{count} позиций',
  'count.records.one': '{count} запись',
  'count.records.few': '{count} записи',
  'count.records.many': '{count} записей',
  'count.comparisonsMade.one': '{count} сделанное сравнение',
  'count.comparisonsMade.few': '{count} сделанных сравнения',
  'count.comparisonsMade.many': '{count} сделанных сравнений',
  'count.pairs.one': '{count} пара',
  'count.pairs.few': '{count} пары',
  'count.pairs.many': '{count} пар',
  'count.rows.one': '{count} строка',
  'count.rows.few': '{count} строки',
  'count.rows.many': '{count} строк',
  'count.moves.one': '{count} перестановка',
  'count.moves.few': '{count} перестановки',
  'count.moves.many': '{count} перестановок',
  'count.answers.one': '{count} ответ',
  'count.answers.few': '{count} ответа',
  'count.answers.many': '{count} ответов',
  'count.marked.one': '{count} позиция помечена',
  'count.marked.few': '{count} позиции помечены',
  'count.marked.many': '{count} позиций помечено',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Локальный инструмент, который упорядочивает список желаемого в Steam попарными сравнениями.',
  'a11y.skipToContent': 'Перейти к содержимому',
  'nav.aria': 'Этапы работы',
  'nav.import': 'Импорт',
  'nav.categorize': 'Категории',
  'nav.compare': 'Сравнения',
  'nav.result': 'Результат',
  'settings.covers': 'Загружать обложки',
  'settings.language': 'Язык интерфейса',
  'actions.saveState': 'Сохранить в файл',
  'actions.reset': 'Начать заново',
  'privacy.note':
    'Данные не покидают браузер. Единственный внешний запрос за всё время работы приложения — '
    + 'загрузка обложек игр с CDN Steam по публичному URL; он отключается тумблером «Загружать обложки».',
  'dialog.title': 'Подтвердите действие',
  'dialog.cancel': 'Отмена',
  'dialog.confirm': 'Продолжить',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Открыть в Steam ↗',
  'common.openInSteamAria': 'Открыть «{title}» в Steam, в новой вкладке',
  'category.must': 'Очень хочу',
  'category.want': 'Хочу',
  'category.maybe': 'Возможно',
  'category.unlikely': 'Маловероятно',
  'category.meh': 'Почти не интересует',
  'category.remove': 'Удалить из желаемого',
  'category.none': 'Без категории',
  'kind.game': 'Игра',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Тип неизвестен',
  'cover.none': 'Без обложки',
  'cover.off': 'Обложки выключены',
  'cover.failed': 'Обложка не загрузилась',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'Не удалось сохранить состояние в браузере. Сохраните его в файл, чтобы не потерять.',
  'app.saveFailedReason': 'Не удалось сохранить состояние: {message}',
  'app.loadFailed':
    'Сохранённое состояние не удалось прочитать ({message}). Начинаем с пустого списка.',
  'app.covers.on': 'Обложки включены: приложение загружает картинки с CDN Steam.',
  'app.covers.off': 'Обложки выключены: приложение не делает ни одного внешнего запроса.',
  'app.language.changed': 'Язык интерфейса: {language}.',
  'app.reset.title': 'Начать заново?',
  'app.reset.text':
    'Будут удалены все {items}, категории, ответы на сравнения и ручные перестановки. Отменить это '
    + 'будет нельзя — если работа может пригодиться, сначала сохраните её в файл.',
  'app.reset.confirm': 'Удалить всё и начать заново',
  'app.reset.done': 'Состояние очищено.',
  'app.state.buildFailed': 'Не удалось собрать файл состояния: {message}',
  'app.state.saved': 'Состояние сохранено в файл.',

  /* -- import screen ------------------------------------------------ */
  'import.heading': 'Импорт списка желаемого',
  'import.hint':
    'Загрузите JSON со своим wishlist — или возьмите демо-набор, если хотите просто посмотреть, '
    + 'как это работает.',
  'import.file.title': 'Файл JSON',
  'import.file.hint': 'Выгрузка из Steam или файл, собранный userscript-ом.',
  'import.file.button': 'Выбрать файл…',
  'import.file.none': 'Файл не выбран',
  'import.paste.title': 'Вставить JSON',
  'import.paste.hint': 'Можно вставить прямо содержимое ответа Steam.',
  'import.paste.label': 'JSON списка желаемого',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Импортировать из текста',
  'import.state.title': 'Сохранённое состояние',
  'import.state.hint':
    'Файл, который вы раньше сохранили кнопкой «Сохранить в файл»: вернутся и категории, и все ответы.',
  'import.state.button': 'Выбрать файл состояния…',
  'import.demo.title': 'Демо-набор',
  'import.demo.hint': '20 реальных игр из Steam. Хватает, чтобы пройти оба этапа и увидеть результат.',
  'import.demo.button': 'Загрузить демо-набор',
  'import.continue': 'Продолжить',
  'import.current':
    'Сейчас в списке {items}: {sorted} с категорией, {plain} без. Сравнений сделано: {comparisons}. '
    + 'Повторный импорт обновит позиции и сохранит уже проделанную работу.',
  'import.announce': 'Импортировано {count}. Всего в списке {total}.',
  'import.source.file': 'Файл {name}',
  'import.source.pasted': 'Вставленный текст',
  'import.source.demo': 'Демо-набор',
  'import.report.title': '{source}: прочитано {records}',
  'import.report.added': 'добавлено',
  'import.report.updated': 'обновлено',
  'import.report.duplicates': 'дубликатов',
  'import.report.skipped': 'пропущено',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'запись №{number}',
  'import.issue.key': 'ключ «{key}»',
  'import.issue.more': '…и ещё {count}',
  'import.skip.notAnObject': 'запись не похожа ни на позицию, ни на app id',
  'import.skip.missingAppId': 'нет идентификатора приложения',
  'import.skip.invalidAppId': 'идентификатор приложения не число',
  'import.skip.duplicateInInput': 'позиция уже встречалась в этом же файле',
  'import.error.title': 'Импортировать не удалось',
  'import.error.emptyInput': 'Импортировать нечего: файл или поле пустые.',
  'import.error.invalidJson':
    'Это не JSON. Похоже, текст скопирован не целиком или в него попало что-то лишнее.',
  'import.error.unrecognizedFormat':
    'JSON прочитан, но на список желаемого он не похож. Нужен массив позиций, объект вида '
    + '{ "440": { … } } или ответ Steam с полем response.items.',
  'import.error.emptyResultTitle': 'Импорт прошёл, но список пуст',
  'import.error.emptyResultText':
    'Ни одной позиции прочитать не удалось. Проверьте, что в файле действительно список желаемого.',
  'import.error.fileRead': 'Файл не прочитался',
  'import.demo.failedTitle': 'Демо-набор не загрузился',
  'import.demo.failedText':
    '{message}. Файл {url} должен лежать рядом с index.html — и страница должна быть открыта по '
    + 'http(s), а не как file://.',
  'import.demo.httpError': 'сервер ответил {status}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'Файл состояния не читается как JSON.',
  'state.error.foreignState':
    'Это JSON другого приложения: в нём нет подписи Steam Wishlist Sorter.',
  'state.error.unsupportedVersion': 'Файл сохранён другой версией формата и не поддерживается.',
  'state.error.invalidState': 'Файл похож на состояние, но в нём нет сессии.',
  'state.error.writeFailed': 'Состояние прочитано, но браузер отказался его сохранить.',
  'state.confirm.title': 'Загрузить состояние поверх текущего?',
  'state.confirm.text':
    'Сейчас в списке {items} и {comparisons}. Файл заменит всё это целиком: список, категории, '
    + 'ответы и ручные перестановки. Отменить это будет нельзя.',
  'state.confirm.confirm': 'Заменить текущее состояние',
  'state.confirm.cancelled': 'Импорт состояния отменён — ничего не изменилось.',
  'state.restored.title': 'Состояние восстановлено',
  'state.restored.items': 'позиций',
  'state.restored.comparisons': 'сравнений сделано',
  'state.restored.moves': 'ручных перестановок',
  'state.restored.toast': 'Состояние восстановлено из файла.',

  /* -- categories screen -------------------------------------------- */
  'categorize.heading': 'Шаг 1. Категории',
  'categorize.hint':
    'Насколько сильно вы этого хотите? Клавиши <kbd>1</kbd>–<kbd>6</kbd>, <kbd>←</kbd> — назад, '
    + '<kbd>→</kbd> или <kbd>Space</kbd> — отложить.',
  'categorize.buttonsAria': 'Категории',
  'categorize.counter': '{index} из {total}',
  'categorize.back': '← Предыдущая',
  'categorize.defer': 'Отложить',
  'categorize.skip': 'Пропустить этап и перейти к сравнениям',
  'categorize.done': 'Все позиции распределены.',
  'categorize.toCompare': 'Перейти к сравнениям',
  'categorize.empty': 'Список пуст: сначала импортируйте wishlist.',
  'categorize.toImport': 'Перейти к импорту',
  'categorize.position': 'Позиция в вашем wishlist: {position}',
  'categorize.current': 'Сейчас: {category}. Выберите другую категорию, чтобы изменить.',
  'categorize.legend': 'Распределено {classified} из {total}.',
  'categorize.legendLeft': 'Распределено {classified} из {total}, осталось {items}.',
  'categorize.firstItem': 'Это первая позиция списка.',
  'categorize.noneLeft': 'Больше нераспределённых позиций нет.',
  'categorize.postponed': '{title} отложена, вернёмся к ней в конце круга.',
  'categorize.announce': '{title}: {category}',

  /* -- comparisons screen -------------------------------------------- */
  'compare.heading': 'Шаг 2. Сравнения',
  'compare.doneLabel': 'сравнений сделано: ',
  'compare.leftLabel': 'осталось примерно: ',
  'compare.deferred': 'отложено: {pairs}',
  'compare.pause': 'Пауза',
  'compare.stop': 'Остановиться и посмотреть результат',
  'compare.preferA': 'Хочу больше <kbd>A</kbd>',
  'compare.preferB': 'Хочу больше <kbd>D</kbd>',
  'compare.drop': 'Больше не хочу',
  'compare.or': 'или',
  'compare.tie': 'Примерно одинаково <kbd>S</kbd>',
  'compare.defer': 'Не могу решить <kbd>Space</kbd>',
  'compare.undo': 'Отменить <kbd>Backspace</kbd>',
  'compare.category': 'Категория: {category}',
  'compare.done': 'Сравнивать больше нечего: порядок определён.',
  'compare.empty': 'Сравнивать нечего: список пуст.',
  'compare.toResult': 'Посмотреть результат',
  'compare.toImport': 'Перейти к импорту',
  'compare.banner.allDeferred':
    'Все остальные вопросы отложены ({count}), и без ответа на этот дальше не пройти. Можно ответить '
    + '«примерно одинаково» — это тоже ответ, и сортировка пойдёт дальше.',
  'compare.banner.forced': 'Эта пара нужна, чтобы двигаться дальше.',
  'compare.rejected': 'Ответ не принят: {message}',
  'compare.dropped': '«{title}» — в списке на удаление из желаемого.',
  'compare.nothingToUndo': 'Отменять нечего.',
  'compare.undone': 'Последний ответ отменён.',
  'compare.chosen': 'Выбрано: {title}.',
  'compare.tied': '{a} и {b} — примерно одинаково.',
  'compare.postponed': 'Пара отложена.',
  'compare.paused': 'Пауза. Всё сохранено — можно закрыть вкладку и вернуться позже.',

  /* -- result screen -------------------------------------------------- */
  'result.heading': 'Результат',
  'result.continue': 'Продолжить сортировку',
  'result.complete': 'Сортировка завершена',
  'result.toImport': 'Перейти к импорту',
  'result.legend.sorted': 'порядок подтверждён сравнениями',
  'result.legend.fallback': 'запасной порядок — по позиции в wishlist',
  'result.legend.manual': 'переставлено вручную',
  'result.search': 'Поиск по названию или App ID',
  'result.filterAria': 'Что показывать',
  'result.filter.all': 'Все',
  'result.filter.game': 'Игры',
  'result.filter.dlc': 'DLC',
  'result.exportJson': 'Итог в JSON',
  'result.exportCsv': 'Итог в CSV',
  'result.copyText': 'Скопировать списком',
  'result.saveState': 'Резервная копия состояния',
  'result.hint':
    'Строку можно перетащить мышью или выбрать её и нажать <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd>. Перестановки сохраняются и переживают перезагрузку.',
  'result.removed.hint': 'Эти позиции не входят в нумерацию итогового списка.',
  'result.resetManual': 'Сбросить ручные правки',
  'result.resetAnswers': 'Сбросить ответы сравнений',
  'result.mark.tied': '= как предыдущая',
  'result.mark.manual': 'переставлено вручную',
  'result.mark.fallback': 'запасной порядок',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} в категории',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.ariaManual': 'Переставлено вручную.',
  'result.row.ariaFallback': 'Запасной порядок.',
  'result.row.categoryAria': 'Категория: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': 'показано {shown} из {total}',
  'result.empty.filter': 'Под фильтр и поиск не попала ни одна позиция.',
  'result.empty.noItems': 'Импортируйте список желаемого, и здесь появится результат.',
  'result.empty.allRemoved': 'Все позиции помечены на удаление — упорядочивать нечего.',
  'result.summary.empty': 'Список пуст: пока нечего показывать.',
  'result.summary.allRemoved': 'Все {marked} на удаление из желаемого, упорядочивать нечего.',
  'result.summary.total': 'Всего {items}.',
  'result.summary.resolved':
    'Порядок подтверждён сравнениями у {resolved}, остальные {fallback} стоят в запасном порядке — '
    + 'по позиции в вашем wishlist.',
  'result.summary.manual': 'Вручную переставлено {items}.',
  'result.summary.removed': 'Ещё {marked} на удаление из желаемого — они идут отдельным списком.',
  'result.summary.comparisons': 'Сравнений сделано: {count}.',
  'result.summary.complete': 'Сортировка завершена.',
  'result.summary.incomplete': 'Сортировка не завершена, её можно продолжить.',
  'result.move.failed': 'Не удалось переставить: {message}',
  'result.move.announce': '«{title}» {where}{category}.',
  'result.move.place': 'на место {position}',
  'result.move.newPlace': 'на новое место',
  'result.move.categorySuffix': ', категория: {category}',
  'result.move.categoryToast': '«{title}» переехала в «{category}».',
  'result.move.edge':
    'Это {edge} строка категории «{category}». Категорию меняет список в самой строке.',
  'result.move.edgeFirst': 'первая',
  'result.move.edgeLast': 'последняя',
  'result.category.failed': 'Не удалось сменить категорию: {message}',
  'result.category.toast': '«{title}» — {category}.',
  'result.export.empty': 'Экспортировать нечего: список пуст.',
  'result.export.failed': 'Не удалось собрать файл: {message}',
  'result.export.jsonDone': 'Итоговый порядок сохранён в JSON.',
  'result.export.csvDone': 'Итоговый список сохранён в CSV.',
  'result.copy.empty': 'Копировать нечего: список пуст.',
  'result.copy.done': 'Нумерованный список скопирован в буфер обмена.',
  'result.copy.failed': 'Браузер не дал доступ к буферу обмена — список сохранён файлом.',
  'result.resetManual.none': 'Ручных перестановок нет.',
  'result.resetManual.title': 'Сбросить ручные правки?',
  'result.resetManual.text':
    '{moves} будет забыто, и список вернётся к тому порядку, который дают сравнения. Ответы на '
    + 'сравнения останутся.',
  'result.resetManual.confirm': 'Сбросить перестановки',
  'result.resetManual.done': 'Ручные перестановки сброшены.',
  'result.resetAnswers.none': 'Ответов пока нет.',
  'result.resetAnswers.title': 'Сбросить ответы сравнений?',
  'result.resetAnswers.text':
    '{answers} будет удалено, и сравнения начнутся с нуля. Список позиций, категории и ручные '
    + 'перестановки останутся. Отменить это будет нельзя.',
  'result.resetAnswers.confirm': 'Сбросить ответы',
  'result.resetAnswers.done': 'Ответы сравнений сброшены.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': '№',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Название',
  'export.csv.category': 'Категория',
  'export.csv.kind': 'Тип',
  'export.csv.positionInCategory': 'Место в категории',
  'export.csv.origin': 'Откуда порядок',
  'export.csv.wishlistPosition': 'Позиция в wishlist',
  'export.csv.url': 'Ссылка',
  'export.origin.manual': 'вручную',
  'export.origin.comparisons': 'сравнения',
  'export.origin.fallback': 'запасной порядок',
  'export.kind.game': 'Игра',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Неизвестно',
};

/** Every dictionary, by language code. @type {Readonly<Record<string, object>>} */
export const DICTIONARIES = Object.freeze({ en: Object.freeze(EN), ru: Object.freeze(RU) });

/** The language in use. English until something says otherwise. */
let language = DEFAULT_LANGUAGE;

/**
 * Brings any value to a language the application has a dictionary for.
 * Anything unknown — an old state file, a hand-edited value, `undefined` —
 * becomes English rather than an error: a wrong language code is not a reason
 * to refuse to show the application.
 *
 * @param {unknown} code
 * @returns {string}
 */
export function normalizeLanguage(code) {
  return typeof code === 'string' && LANGUAGES.includes(code) ? code : DEFAULT_LANGUAGE;
}

/** @returns {string} The language currently in use. */
export function getLanguage() {
  return language;
}

/**
 * Switches the language. Nothing is redrawn here: the caller owns the screen
 * and knows when to re-render it.
 *
 * @param {string} code
 * @returns {string} The language that is now in use.
 */
export function setLanguage(code) {
  language = normalizeLanguage(code);
  return language;
}

/**
 * Fills `{name}` placeholders from `params`. A placeholder without a value is
 * left as it is, so a forgotten parameter shows up on the screen instead of
 * turning into `undefined`.
 *
 * @param {string} template
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function format(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

/**
 * Whether a key exists in the dictionary of a language.
 *
 * @param {string} key
 * @param {string} [code] Defaults to the current language.
 * @returns {boolean}
 */
export function hasKey(key, code = language) {
  return Object.hasOwn(DICTIONARIES[normalizeLanguage(code)], key);
}

/**
 * The string behind a key, with the parameters filled in.
 *
 * A key that is missing from the dictionary returns the key itself. It is a
 * deliberate compromise: the application keeps working, and `result.summary.total`
 * standing where a sentence belongs is unmistakable both on the screen and in
 * a test, unlike an empty string that quietly looks like a design choice.
 *
 * @param {string} key
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  const dictionary = DICTIONARIES[language];
  if (!Object.hasOwn(dictionary, key)) return String(key);
  return format(dictionary[key], params);
}

/**
 * The counted form of a phrase: `plural('count.items', 3)` looks up
 * `count.items.few` in Russian and `count.items.many` in English.
 *
 * `count` is available to the template as `{count}` without being passed
 * twice, because every counted phrase needs it.
 *
 * @param {string} key   Base key, without the form suffix.
 * @param {number} count
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function plural(key, count, params = {}) {
  const rule = PLURAL_RULES[language] ?? PLURAL_RULES[DEFAULT_LANGUAGE];
  return t(`${key}.${rule(count)}`, { count, ...params });
}
