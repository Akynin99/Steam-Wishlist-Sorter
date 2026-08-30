/**
 * Interface language: dictionaries and the lookup around them.
 *
 * The application is multilingual, and English is the default in every
 * situation: the live demo is opened by strangers, and an interface in a
 * language they do not read simply turns them away. The browser language is
 * deliberately not consulted — a demo that greets one visitor in Russian and
 * another in English is harder to reason about than one that always starts in
 * English and offers a switch.
 *
 * A dictionary is flat: `'result.summary.total'` is one key, not a path into
 * nested objects. Flat keys make the dictionaries directly comparable, which
 * is what the test that guards against a forgotten translation does.
 *
 * Adding a language is four edits and no new mechanism: its code goes into
 * `LANGUAGES`, its own name into `LANGUAGE_NAMES`, its CLDR rule into
 * `PLURAL_RULES`, and the dictionary itself into `DICTIONARIES`. Everything
 * else — the switch in the header, the parity test, the CSV separator table
 * of `export.js` — reads those four and needs no edit of its own.
 *
 * The module has no dependency on the DOM, so it is tested directly, the way
 * `export.js` is. Everything that touches elements lives in `ui-common.js`.
 */

/**
 * Languages the interface is available in.
 *
 * A code is whatever CLDR calls the language, and `pt-BR` is one: Brazilian
 * Portuguese differs from the European one in wording often enough that a bare
 * `pt` would be a promise the dictionary does not keep. Nothing here parses a
 * code — every table is keyed by the whole string — so the hyphen costs
 * nothing and is never split off.
 *
 * @type {ReadonlyArray<string>}
 */
export const LANGUAGES = Object.freeze(['en', 'ru', 'de', 'fr', 'es', 'pt-BR', 'pl', 'tr']);

/** The language a fresh visitor gets, always. */
export const DEFAULT_LANGUAGE = 'en';

/**
 * How each language calls itself. Native names are not translated — a Russian
 * reader looks for «Русский» in the switch, not for "Russian".
 *
 * @type {Readonly<Record<string, string>>}
 */
export const LANGUAGE_NAMES = Object.freeze({
  en: 'English',
  ru: 'Русский',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  pl: 'Polski',
  tr: 'Türkçe',
});

/**
 * Suffixes of the plural forms every counted phrase defines in every
 * dictionary. Russian and Polish need all three of them; the other languages
 * select only `one` and `many`, and still carry a `few` equal to `many`, so
 * that all the dictionaries hold exactly the same set of keys and the parity
 * test stays a simple set comparison.
 *
 * @type {ReadonlyArray<string>}
 */
export const PLURAL_FORMS = Object.freeze(['one', 'few', 'many']);

/**
 * Which plural form a count takes, per language. The rules follow CLDR, and
 * the differences between them are real: French and Brazilian Portuguese count
 * zero as singular («0 élément», “0 item”), English, German and Spanish do not
 * («0 items», „0 Einträge“, «0 elementos»), and Russian and Polish both look at
 * the last two digits — but not in the same way, which is why Polish has a rule
 * of its own instead of borrowing the Russian one. Russian takes `one` at 21
 * and at 101; Polish takes `many` at both, because outside the 2–4 ending it
 * knows no singular at all. Turkish never changes the noun after a numeral, so
 * its two forms differ only where a sentence around them would.
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
  de: (count) => (Math.abs(count) === 1 ? 'one' : 'many'),
  fr: (count) => (Math.abs(count) < 2 ? 'one' : 'many'),
  es: (count) => (Math.abs(count) === 1 ? 'one' : 'many'),
  'pt-BR': (count) => (Math.abs(count) < 2 ? 'one' : 'many'),
  pl: (count) => {
    if (Math.abs(count) === 1) return 'one';
    const n = Math.abs(count) % 100;
    const last = n % 10;
    if (last > 1 && last < 5 && !(n > 11 && n < 15)) return 'few';
    return 'many';
  },
  tr: (count) => (Math.abs(count) === 1 ? 'one' : 'many'),
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
  /* The same count in the progress line of the comparisons, where the number
     opens the phrase. English says it the same way twice; Russian does not,
     and one phrase cannot serve both places. */
  'count.comparisonsDone.one': '{count} comparison made',
  'count.comparisonsDone.few': '{count} comparisons made',
  'count.comparisonsDone.many': '{count} comparisons made',
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
  /* Names of the three progress bars. A bar is a picture, and a picture with
     no name is a number read out of nowhere. */
  'a11y.progress.import': 'Loading the wishlist',
  'a11y.progress.categorize': 'Items given a category',
  'a11y.progress.compare': 'Comparisons answered',
  'nav.aria': 'Stages',
  /* The stage the wishlist arrives on. The key keeps the name of the screen,
     the caption names what the user goes there for. */
  'nav.import': 'Wishlist',
  'nav.categorize': 'Categories',
  'nav.compare': 'Comparisons',
  'nav.result': 'Result',
  /* Said only to a screen reader: on the screen the same three states are a
     tick, a filled badge and a disabled button. */
  'nav.state.done': 'stage completed',
  'nav.state.current': 'current stage',
  'nav.state.locked': 'stage not available yet',
  'settings.title': 'Settings',
  'settings.covers': 'Load covers',
  'settings.language': 'Interface language',
  'settings.theme': 'Theme',
  'theme.modern': 'Modern',
  'theme.steam': 'Steam-like',
  'actions.saveState': 'Save backup',
  'actions.loadState': 'Load backup',
  /* Only ever offered while the categories are open: everywhere else there is
     no stage to skip and the row would mean nothing. */
  'actions.skipStage': 'Skip the categories',
  'actions.reset': 'Start over',
  'privacy.short': 'Runs locally · your data is not sent to third-party servers',
  'privacy.details': 'Details',
  'privacy.note':
    'Your data never leaves the browser. The only external request the application makes at any '
    + 'point is loading game covers from the Steam CDN over a public URL; it is switched off by the '
    + '“Load covers” toggle. The import straight from an account is asked for by the local server '
    + 'on your own machine: it goes to Steam, to nobody else, and only when you press the button.',
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
  'app.theme.changed': 'Theme: {theme}.',
  'app.reset.title': 'Start over?',
  'app.reset.text':
    'All {items}, the categories, the comparison answers and the manual moves will be deleted. '
    + 'This cannot be undone — if the work may still come in handy, save it to a file first.',
  'app.reset.confirm': 'Delete everything and start over',
  'app.reset.done': 'The state is cleared.',
  'app.state.buildFailed': 'The state file could not be built: {message}',
  'app.state.saved': 'The state is saved to a file.',
  /* The saving status of the shell. It is not a toast: `save()` runs after
     every answer, so this line updates in place and fades out. */
  'app.saved': 'Progress saved in this browser',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'An order you actually chose',
  'import.promise': 'Rank games by how much you actually want to play them',
  'import.lead':
    'Quickly group your wishlist by interest, then choose between two games. Stop at any time — '
    + 'progress is always saved.',
  'import.step.load': 'Load the wishlist',
  'import.step.group': 'Group by interest',
  'import.step.compare': 'Compare games',
  'import.step.send': 'Send the order to Steam',
  'import.sessions':
    'A full sort may take several sessions. Your current result is always available.',
  'import.other': 'Other import methods',
  'import.file.title': 'JSON file',
  'import.file.hint': 'An export from Steam or a file collected by the userscript.',
  'import.file.button': 'Choose a file…',
  'import.file.none': 'No file chosen',
  'import.paste.title': 'Paste JSON',
  'import.paste.hint': 'The body of the Steam response can be pasted as is.',
  'import.paste.label': 'Wishlist JSON',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Import from the text',
  'import.userscript.title': 'From the Steam page, with the userscript',
  'import.userscript.hint': 'The file it downloads is loaded here with “JSON file” above.',
  'import.state.title': 'Saved state',
  'import.state.hint':
    'A file you saved earlier with “Save backup”: both the categories and every answer come back.',
  'import.state.button': 'Choose a state file…',
  'import.demo.button': 'Try with 20 games',
  'import.ready.eyebrow': 'Ready',
  'import.ready.count.one': '{count} item loaded',
  'import.ready.count.few': '{count} items loaded',
  'import.ready.count.many': '{count} items loaded',
  'import.ready.next':
    'Next, group the games into five levels of interest. That is what cuts the number of '
    + 'comparisons down.',
  'import.ready.start': 'Start grouping',
  'import.ready.again': 'Load another wishlist',
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

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Load from Steam',
  'steam.subtitle': 'The easiest way for a public wishlist',
  'steam.field': 'Your Steam profile',
  'steam.placeholder': 'steamcommunity.com/id/yourname, a nickname or a SteamID64',
  'steam.run': 'Check and load',
  'steam.cancel': 'Stop',
  'steam.checking': 'Looking for the local server…',
  'steam.warning': 'Automatic import works when “Game details” are public.',
  'steam.privateAsk': 'What if it is private?',
  'steam.privateHelp':
    'Open your Steam profile, choose “Edit profile”, then “Privacy Settings”, and set “Game '
    + 'details” to Public. If you would rather not open it, the userscript under “Other import '
    + 'methods” reads the page you are logged into and works with a private list.',
  'steam.settingsLink': 'Open Steam settings ↗',

  /* The two ways Steam can decline to hand a list over. They are kept apart
     because Steam keeps them apart: 401 and 403 name the privacy setting, a
     5xx names nothing at all. */
  'steam.blocked.title': 'Steam did not make the wishlist available',
  'steam.blocked.text':
    'That usually means “Game details” are private: the wishlist follows that one setting.',
  'steam.blocked.unavailableTitle': 'The wishlist could not be fetched',
  'steam.blocked.unavailableText':
    'Steam answered with an error, and an error is what it answers both to a list it will not hand '
    + 'over and to a bad minute of its own. So: if “Game details” are private, the steps below open '
    + 'them; if they are public already, wait a few minutes and press “Check again”.',
  'steam.blocked.step1': 'Open your Steam profile and choose “Edit profile”.',
  'steam.blocked.step2': 'Open “Privacy Settings”.',
  'steam.blocked.step3': 'Set “Game details” to Public.',
  'steam.blocked.step4': 'Come back here and press “Check again”.',
  'steam.blocked.settings': 'Open Steam settings',
  'steam.blocked.again': 'Check again',
  'steam.blocked.keepPrivate': 'I don’t want to make it public',

  /* The way in that needs neither an open list nor a local server. */
  'steam.userscript.lead':
    'Collect the list from the Steam page itself. The userscript reads the wishlist page you are '
    + 'logged into, so the privacy setting does not matter, and it makes no network request of its '
    + 'own.',
  'steam.userscript.step1': 'Install Tampermonkey — it exists for Chrome, Edge, Firefox and Opera.',
  'steam.userscript.step2':
    'Install the script “steam-wishlist-export.user.js” from the repository.',
  'steam.userscript.step3':
    'Open your wishlist page and press “Collect the list”, then “Download JSON”.',
  'steam.userscript.step4': 'Come back here and pick that file under “Other import methods”.',
  'steam.userscript.link': 'Open the script on GitHub ↗',

  /* No local server behind the page — the demo on GitHub Pages, or a start
     without Node. The form that cannot work is not shown at all. */
  'steam.offline.title': 'Load my wishlist',
  'steam.offline.subtitle': 'Choose the easiest route',
  'steam.offline.text':
    'Your browser does not allow this page to read Steam directly, and there is no local server '
    + 'behind it to ask on its behalf. Your data still stays yours.',
  'steam.offline.instructions': 'Show instructions',
  'steam.offline.userscript.badge': 'Works with private lists',
  'steam.offline.userscript.title': 'Import from your Steam page',
  'steam.offline.local.title': 'Run the local version',
  'steam.offline.local.text': 'Then a public profile link is all it takes.',
  'steam.offline.local.download': 'Download',
  'steam.offline.local.step1': 'Install Node.js 20 or newer.',
  'steam.offline.local.step2': 'Unpack the archive anywhere.',
  'steam.offline.local.step3':
    'Run “start.bat” on Windows, or “node server.js” on macOS and Linux.',
  'steam.offline.local.step4': 'Open http://localhost:8080/ in the browser.',
  'steam.step.account': 'Looking the account up…',
  'steam.step.wishlist': 'Asking Steam for the wishlist…',
  'steam.step.titles': 'Titles: {done} of {total}',
  'steam.step.waiting': 'Steam is limiting the requests. Waiting {seconds} s and asking again…',
  'steam.note':
    'One title, one request, so a long list takes minutes. Everything that has already arrived is '
    + 'saved — stopping loses nothing.',
  'steam.done.title': 'The wishlist came over',
  'steam.done.titlesTitle': 'The titles are fetched',
  'steam.done.titlesText': '{items} in the list, {titles} of them with a title from Steam.',
  'steam.done.text':
    'Steam account {account}: {items} in the list, {titles} of them with a title from Steam.',
  'steam.done.missing.one': 'Steam did not hand over {count} title: that item is shown by its App ID.',
  'steam.done.missing.few':
    'Steam did not hand over {count} titles: those items are shown by their App ID.',
  'steam.done.missing.many':
    'Steam did not hand over {count} titles: those items are shown by their App ID.',
  'steam.done.throttled':
    'Steam stopped answering at title {done} of {total}: it is limiting the requests. Everything '
    + 'fetched is already in the list — try the button again in a few minutes.',
  'steam.missing.text.one': '{count} item in the list is still shown by an App ID, not a title.',
  'steam.missing.text.few': '{count} items in the list are still shown by an App ID, not a title.',
  'steam.missing.text.many': '{count} items in the list are still shown by an App ID, not a title.',
  'steam.missing.run': 'Fetch the remaining titles',
  'steam.cancelled': 'Stopped. Everything that had arrived by then stayed in the list.',
  'steam.error.title': 'The import from Steam failed',
  'steam.error.emptyInput':
    'The field is empty: type a SteamID64, a profile name or a link to the profile.',
  'steam.error.invalidAccount':
    'This is neither a SteamID64 (17 digits), nor a Steam profile name, nor a link to a profile on '
    + 'steamcommunity.com.',
  'steam.error.accountNotFound':
    'Steam has no such account. Check the spelling — or open your profile in the browser and copy '
    + 'the address of the page.',
  'steam.error.wishlistEmpty':
    'The wishlist of this account is empty: there is nothing to sort yet.',
  'steam.error.rateLimited':
    'Steam is limiting the requests: too many of them came from this address. It lets go after a '
    + 'few minutes — try again then.',
  'steam.error.network':
    'Steam could not be reached. Check the connection, and that the local server is still running.',
  'steam.error.steamError':
    'Steam answered with something unexpected. That is usually Steam itself having a moment; try '
    + 'again a little later.',
  'steam.error.notLocal': 'The local server answers requests from localhost only.',
  'steam.error.unknown': 'Unexpected failure: {message}',

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
  'categorize.eyebrow': 'Step 2 of 4',
  'categorize.heading': 'How interested are you in this game?',
  'categorize.hint': 'Do not think too long — the category can be changed later.',
  'categorize.buttonsAria': 'Levels of interest',
  /* The two ends of the scale, so its direction is said and not merely
     implied by the wording of the five rows. */
  'categorize.more': 'More interested',
  'categorize.less': 'Less interested',
  /* Between the scale and the sixth value, which is not a level of interest
     at all: the two are alternatives, not neighbours. */
  'categorize.or': 'or',
  'categorize.counter': '{index} of {total}',
  'categorize.back': '← Previous',
  'categorize.defer': 'Postpone <kbd>Space</kbd>',
  'categorize.done': 'Every item has a category.',
  'categorize.toCompare': 'Go to the comparisons',
  'categorize.empty': 'The list is empty: import a wishlist first.',
  'categorize.toImport': 'Go to the import',
  'categorize.position': 'Position in your wishlist: {position}',
  'categorize.current': 'Now: {category}. Pick another category to change it.',
  'categorize.legendLeft': '{items} left',
  'categorize.firstItem': 'This is the first item of the list.',
  'categorize.noneLeft': 'There are no unclassified items left.',
  'categorize.postponed': '{title} is postponed, we come back to it at the end of the lap.',
  'categorize.announce': '{title}: {category}',
  /* Skipping the whole stage lives in the settings menu and asks first,
     because what it costs is not visible from the row that offers it. */
  'categorize.skipTitle': 'Skip the categories?',
  'categorize.skipText':
    'Every item stays without a category, and the comparisons then run over the whole list as a '
    + 'single group — many more questions than five smaller groups would have needed. Nothing is '
    + 'lost: you can come back to this stage at any time.',
  'categorize.skipConfirm': 'Skip and go to the comparisons',
  'categorize.skipDone': 'The stage is skipped: the comparisons run over the whole list.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Step 3 of 4',
  'compare.heading': 'Which game do you want more?',
  /* The same head, once there is nothing left to ask: the question would be
     the only thing on the screen still asking it. */
  'compare.headingDone': 'The comparisons are done',
  'compare.hint': 'Choose quickly. A pair you cannot decide on can be postponed.',
  /* The whole progress in one line: which group is being sorted, what has
     been answered, and roughly how much of it is still ahead. */
  'compare.progress': 'Category “{category}” · {made} · about {left} left',
  'compare.deferred': 'postponed: {pairs}',
  'compare.preferA': 'Want it more <kbd>A</kbd>',
  'compare.preferB': 'Want it more <kbd>D</kbd>',
  /* Quiet on purpose: it answers a different question than the pair on the
     screen asks, and it is pressed once in a hundred answers. */
  'compare.drop': 'No longer interested',
  'compare.or': 'or',
  'compare.tie': 'About the same <kbd>S</kbd>',
  'compare.defer': 'Cannot decide <kbd>Space</kbd>',
  'compare.undo': 'Undo <kbd>Backspace</kbd>',
  /* One way out of the stage, and it leads to the result: stopping for today
     and looking at what came of it are the same wish. */
  'compare.finish': 'Finish for today',
  'compare.finishNote': 'The progress is saved — your current result is ready to use.',
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

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Got it',
  'onboarding.categorize.title': 'First, roughly group games by interest',
  'onboarding.categorize.lead':
    'You will see one game at a time and put it somewhere on a scale of five levels — or straight '
    + 'onto the list of games to remove from the wishlist.',
  'onboarding.categorize.why':
    'This is what keeps the sorting short: games are only ever compared inside their own group, so '
    + 'a rough split now saves hundreds of questions later.',
  'onboarding.categorize.later':
    'Do not think too long. A category can be changed at any time — walk back to the game with '
    + '“Previous”, or change it on the result screen.',
  'onboarding.compare.title': 'Now choose between two games',
  'onboarding.compare.lead':
    'Two games at a time, both from the same group. Pick the one you want more — the keys A and D, '
    + 'or the arrows.',
  'onboarding.compare.tie':
    'If you want them equally, say “About the same”: that is an answer too, and the sorting uses it.',
  'onboarding.compare.defer':
    'A hard pair can be postponed with Space; it comes back once the easy ones are answered.',
  'onboarding.compare.stop':
    'Finish whenever you like. Every answer is saved, and the result is ready to look at at any '
    + 'moment — finished or not.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Step 4 of 4',
  'result.head.usable': 'The result is already usable',
  'result.head.ready': 'Your order is ready',
  'result.head.empty': 'There is nothing to order yet',
  'result.lead.usable': 'Transfer it to Steam now, or keep improving it with more answers.',
  'result.lead.ready': 'Every place in it is settled by your own answers.',
  'result.lead.empty': 'Import a wishlist, and the order appears here.',
  'result.continue': 'Continue comparisons',
  'result.complete': 'The sorting is finished',
  'result.toImport': 'Go to the import',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Ready to use',
  'result.summary.headline': '{items} follow your answers',
  'result.summary.headlineAll': 'The whole list follows your answers',
  'result.summary.headlineNone': 'No place is settled by an answer yet',
  'result.summary.rest':
    'The rest keep the order they had in your wishlist; the list below says which ones.',
  'result.summary.choice':
    'Transfer this order to Steam now, or keep comparing — every answer improves it.',
  'result.summary.done': 'There is nothing left to compare. Transfer the order to Steam.',
  'result.summary.empty': 'The list is empty: there is nothing to show yet.',
  'result.summary.allRemoved':
    '{marked} for removal from the wishlist, so there is nothing left to order.',
  'result.stats.total': 'in the list',
  'result.stats.confirmed': 'confirmed',
  'result.stats.removed': 'marked for removal',
  'result.built.summary': 'How was this order built?',
  'result.built.categories':
    'The categories come first, in the order of interest; inside a category the place is decided '
    + 'by the comparisons.',
  'result.built.resolved':
    'Your answers settle the place of {resolved} of {total}. Still in the order the wishlist '
    + 'gave them: {fallback} — the fallback order, marked in the list.',
  'result.built.answers': 'Comparisons answered so far: {count}.',
  'result.built.manual':
    '{items} moved by hand. A hand made move is replayed over whatever the comparisons produce, '
    + 'so new answers go on improving the list around it.',
  'result.built.noManual': 'Nothing has been moved by hand.',
  'result.built.complete': 'The sorting is finished: every pair the order needed has an answer.',
  'result.built.incomplete': 'The sorting is not finished — it can be continued at any time.',
  'result.legend.sorted': 'confirmed by comparisons',
  'result.legend.fallback': 'still in the old order — by the position in the wishlist',
  'result.legend.manual': 'moved by hand',
  'result.legend.tied': 'tied with the row above',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Main action',
  'result.transfer.heading': 'Transfer the order to Steam',
  'result.transfer.sub': 'No extensions or additional software required',
  'result.transfer.step1': 'Show the bookmarks bar',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — in Chrome, Edge and Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — in Chrome, Edge and Firefox.',
  'result.transfer.shortcutSafari': 'In Safari: the “View” menu → “Show Favourites Bar”.',
  'result.transfer.step2': 'Drag this link onto the bar',
  'result.transfer.step3': 'Open your wishlist and press the bookmark',
  'result.transfer.openWishlist': 'Open my wishlist ↗',
  'result.transfer.link': 'Transfer my order to Steam',
  'result.transfer.copy': 'Copy link',
  'result.transfer.carries': 'The link carries {items}.',
  'result.transfer.fresh':
    'The link is rebuilt on every change, so what you take from here is always the current order.',
  'result.transfer.taken':
    'This is the link you took, and it still writes exactly the order shown below.',
  'result.transfer.stale': 'The order has changed — replace the old bookmark with the updated link.',
  'result.transfer.copied':
    'The link is copied. Create a bookmark by hand and paste it in as the address.',
  'result.transfer.copyFailed':
    'The browser refused access to the clipboard — drag the link onto the bookmarks bar instead.',
  'result.transfer.clickToast':
    'This link is not for pressing here: drag it onto the bookmarks bar and press it on the Steam '
    + 'wishlist page.',
  'result.transfer.empty': 'The list is empty — there is no order to carry anywhere yet.',
  'result.transfer.failed': 'The link could not be built: {message}',
  'result.transfer.mobile':
    'On a phone or a tablet this is awkward: a bookmarklet has to be dragged onto a bookmarks bar. '
    + 'The transfer is easier in a desktop browser.',
  'result.transfer.warnAccount': 'The order is written into the account this browser is signed into.',
  'result.transfer.warnNoDelete':
    'Nothing is deleted: the items you marked for removal go to the end of the list.',
  'result.transfer.warnPriority':
    'Afterwards every item has a priority, including the ones that had none before.',
  'result.transfer.warnNoBackup':
    'The bookmarklet makes no backup and does not check the result afterwards.',
  'result.transfer.warnReload':
    'When it is done, reload the Steam page and switch the sorting to your own order.',
  'result.transfer.advanced': 'Need a backup and automatic verification?',
  'result.transfer.advancedText':
    'The userscript reads the wishlist page itself: it saves the order that is there now to a '
    + 'file, writes the new one, and checks afterwards that it arrived. It needs Tampermonkey, '
    + 'which is why it is the longer way and not the main one.',
  'result.transfer.advancedStep2':
    'Install the script “steam-wishlist-import-order.user.js” from the repository.',
  'result.transfer.advancedStep3':
    'Open your wishlist page and follow the panel the script puts on it.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Your order',
  'result.search': 'Search by title or App ID',
  'result.filterAria': 'What to show',
  'result.filter.all': 'All',
  'result.filter.game': 'Games',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'A row can be dragged with the mouse, or selected and moved with <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd>. The moves are saved and survive a reload.',
  'result.removed.hint': 'These items are not part of the numbering of the final list.',
  'result.mark.confirmed': 'Confirmed by comparisons',
  'result.mark.fallback': 'Still in the old order',
  'result.mark.manual': 'Moved by hand',
  'result.mark.tied': 'Tied with the row above',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} in the category',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Category: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': '{shown} of {total} shown',
  'result.empty.filter': 'Neither the filter nor the search matched a single item.',
  'result.empty.noItems': 'Import a wishlist and the result appears here.',
  'result.empty.allRemoved': 'Every item is marked for removal — there is nothing to order.',
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
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Show tier list',
  'tier.title': 'Wishlist tier list',
  'tier.lead': 'Games are ordered from left to right within each category.',
  'tier.close': 'Close',
  'tier.none': 'Not categorized',
  'tier.empty': 'Nothing here',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Marked for removal. Nothing is deleted from Steam here — that is left to you.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Download or share',
  'result.export.hint':
    'The files are built here in the browser and saved by you — nothing is uploaded.',
  'result.exportJson': 'Order as JSON',
  'result.exportCsv': 'List as CSV',
  'result.copyText': 'Copy as a list',
  'result.saveState': 'Backup of the state',
  'result.export.empty': 'There is nothing to export: the list is empty.',
  'result.export.failed': 'The file could not be built: {message}',
  'result.export.jsonDone': 'The final order is saved as JSON.',
  'result.export.csvDone': 'The final list is saved as CSV.',
  'result.copy.empty': 'There is nothing to copy: the list is empty.',
  'result.copy.done': 'The numbered list is copied to the clipboard.',
  'result.copy.failed':
    'The browser refused access to the clipboard — the list was saved as a file instead.',
  'result.resetManual': 'Reset the manual moves',
  'result.resetManual.none': 'There are no manual moves.',
  'result.resetManual.title': 'Reset the manual moves?',
  'result.resetManual.text':
    '{moves} will be forgotten and the list goes back to the order the comparisons give. The '
    + 'comparison answers stay.',
  'result.resetManual.confirm': 'Reset the moves',
  'result.resetManual.done': 'The manual moves are reset.',
  'result.resetAnswers': 'Reset the comparison answers',
  'result.resetAnswers.none': 'There are no answers yet.',
  'result.resetAnswers.title': 'Reset the comparison answers?',
  'result.resetAnswers.text':
    '{answers} will be deleted and the comparisons start from zero. The list of items, the categories '
    + 'and the manual moves stay. This cannot be undone.',
  'result.resetAnswers.confirm': 'Reset the answers',
  'result.resetAnswers.done': 'The comparison answers are reset.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'This is not the Steam wishlist. Open store.steampowered.com/wishlist, sign in, and press the '
    + 'bookmark there. Nothing was sent.',
  'bookmarklet.confirm':
    'About to write the order of {items} into the wishlist of the account this browser is signed in '
    + 'as. Nothing is deleted. This cannot be undone: after the write every entry has a priority, '
    + 'including the ones that had none before, and no backup brings that back.',
  'bookmarklet.write': 'Write the order',
  'bookmarklet.cancel': 'Cancel',
  'bookmarklet.close': 'Close',
  'bookmarklet.sending': 'Sending the order to Steam…',
  'bookmarklet.done':
    'Steam accepted the order. Reload the wishlist page and look at it: this bookmarklet does not '
    + 'read the page, so the check is yours.',
  'bookmarklet.unclear':
    'Steam answered, but the answer neither confirms nor denies anything. Reload the wishlist page '
    + 'and look at the order before repeating.',
  'bookmarklet.refused':
    'Steam refused the order and said nothing useful about why. Reload the wishlist page and look at '
    + 'the order before repeating.',
  'bookmarklet.badRequest':
    'Steam turned the request away at the door with a 400 and an empty body — it never looked at the '
    + 'order, so nothing was written. That is what it answers when the request is missing something '
    + 'it demands, and the answer names nothing. It looks like the endpoint has changed; the project '
    + 'page has what to do about it.',
  'bookmarklet.signedOut':
    'Steam did not accept the session — most often it has simply expired. Sign in to Steam again, '
    + 'reload the wishlist and press the bookmark once more. Nothing was written.',
  'bookmarklet.rateLimited':
    'Steam answered "too many requests". Wait a couple of minutes and press the bookmark again — '
    + 'nothing was changed.',
  'bookmarklet.tooLarge':
    'The request is too big for Steam: the whole order goes in one request, and this one did not '
    + 'fit. Nothing was written. Such a list needs the userscript, which can mark the rows on the '
    + 'page instead.',
  'bookmarklet.serverError':
    'The trouble is on Steam’s side — it answered with a server error. Try again in a few '
    + 'minutes; nothing was written.',
  'bookmarklet.offline':
    'The request never reached Steam. The network may be down, or an extension may have blocked it. '
    + 'Nothing was written — check the connection and press the bookmark again.',

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
  'count.comparisonsDone.one': '{count} сравнение сделано',
  'count.comparisonsDone.few': '{count} сравнения сделано',
  'count.comparisonsDone.many': '{count} сравнений сделано',
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
  'a11y.progress.import': 'Загрузка списка желаемого',
  'a11y.progress.categorize': 'Позиций разложено по категориям',
  'a11y.progress.compare': 'Сравнений отвечено',
  'nav.aria': 'Этапы работы',
  'nav.import': 'Список',
  'nav.categorize': 'Категории',
  'nav.compare': 'Сравнения',
  'nav.result': 'Результат',
  'nav.state.done': 'этап пройден',
  'nav.state.current': 'текущий этап',
  'nav.state.locked': 'этап пока недоступен',
  'settings.title': 'Настройки',
  'settings.covers': 'Загружать обложки',
  'settings.language': 'Язык интерфейса',
  'settings.theme': 'Тема',
  'theme.modern': 'Современная',
  'theme.steam': 'Как в Steam',
  'actions.saveState': 'Сохранить копию',
  'actions.loadState': 'Загрузить копию',
  'actions.skipStage': 'Пропустить категории',
  'actions.reset': 'Начать заново',
  'privacy.short': 'Работает локально · ваши данные не отправляются на сторонние серверы',
  'privacy.details': 'Подробнее',
  'privacy.note':
    'Данные не покидают браузер. Единственный внешний запрос, который приложение делает само, — '
    + 'загрузка обложек игр с CDN Steam по публичному URL; он отключается тумблером '
    + '«Загружать обложки». Импорт прямо из аккаунта запрашивает локальный сервер на вашей же машине: '
    + 'он уходит в Steam, больше никуда, и только когда вы нажимаете кнопку.',
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
  'app.theme.changed': 'Тема: {theme}.',
  'app.reset.title': 'Начать заново?',
  'app.reset.text':
    'Будет удалено всё: {items}, категории, ответы на сравнения и ручные перестановки. Отменить '
    + 'это будет нельзя — если работа может пригодиться, сначала сохраните её в файл.',
  'app.reset.confirm': 'Удалить всё и начать заново',
  'app.reset.done': 'Состояние очищено.',
  'app.state.buildFailed': 'Не удалось собрать файл состояния: {message}',
  'app.state.saved': 'Состояние сохранено в файл.',
  'app.saved': 'Прогресс сохранён в этом браузере',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Порядок, который выбрали вы',
  'import.promise': 'Расставьте игры по тому, насколько на самом деле хотите в них играть',
  'import.lead':
    'Быстро разложите список желаемого по интересу, а потом выбирайте из двух игр. Бросить можно '
    + 'в любой момент — прогресс сохраняется сам.',
  'import.step.load': 'Загрузить список желаемого',
  'import.step.group': 'Разложить по интересу',
  'import.step.compare': 'Сравнить игры',
  'import.step.send': 'Отправить порядок в Steam',
  'import.sessions':
    'Полная сортировка может занять несколько сеансов. Текущий результат доступен всегда.',
  'import.other': 'Другие способы импорта',
  'import.file.title': 'Файл JSON',
  'import.file.hint': 'Выгрузка из Steam или файл, собранный userscript-ом.',
  'import.file.button': 'Выбрать файл…',
  'import.file.none': 'Файл не выбран',
  'import.paste.title': 'Вставить JSON',
  'import.paste.hint': 'Можно вставить прямо содержимое ответа Steam.',
  'import.paste.label': 'JSON списка желаемого',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Импортировать из текста',
  'import.userscript.title': 'Со страницы Steam, через userscript',
  'import.userscript.hint': 'Скачанный им файл загружается здесь пунктом «Файл JSON» выше.',
  'import.state.title': 'Сохранённое состояние',
  'import.state.hint':
    'Файл, который вы раньше сохранили кнопкой «Сохранить копию»: вернутся и категории, и все '
    + 'ответы.',
  'import.state.button': 'Выбрать файл состояния…',
  'import.demo.button': 'Попробовать на 20 играх',
  'import.ready.eyebrow': 'Готово',
  'import.ready.count.one': 'Загружена {count} позиция',
  'import.ready.count.few': 'Загружены {count} позиции',
  'import.ready.count.many': 'Загружено {count} позиций',
  'import.ready.next':
    'Дальше разложим игры по пяти уровням интереса. Именно это и сокращает число сравнений.',
  'import.ready.start': 'Начать раскладывать',
  'import.ready.again': 'Загрузить другой список',
  'import.current':
    'Сейчас в списке {items}: {sorted} с категорией, {plain} без. Сравнений сделано: {comparisons}. '
    + 'Повторный импорт обновит позиции и сохранит уже проделанную работу.',
  'import.announce': 'Импортировано {count}. Всего в списке {total}.',
  'import.source.file': 'Файл {name}',
  'import.source.pasted': 'Вставленный текст',
  'import.source.demo': 'Демо-набор',
  'import.report.title': '{source} — прочитано: {records}',
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

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Загрузить из Steam',
  'steam.subtitle': 'Самый простой путь для открытого списка',
  'steam.field': 'Ваш профиль Steam',
  'steam.placeholder': 'steamcommunity.com/id/yourname, ник или SteamID64',
  'steam.run': 'Проверить и загрузить',
  'steam.cancel': 'Остановить',
  'steam.checking': 'Ищем локальный сервер…',
  'steam.warning': 'Автоматическая загрузка работает, когда «Игровые подробности» открыты.',
  'steam.privateAsk': 'А если они закрыты?',
  'steam.privateHelp':
    'Откройте свой профиль Steam, выберите «Редактировать профиль», затем «Настройки приватности» '
    + 'и поставьте «Игровые подробности» в «Открытый». Если открывать не хочется, userscript в '
    + '«Других способах импорта» читает страницу, на которой вы уже вошли, и работает с закрытым '
    + 'списком.',
  'steam.settingsLink': 'Открыть настройки Steam ↗',
  'steam.blocked.title': 'Steam не открыл список желаемого',
  'steam.blocked.text':
    'Обычно это значит, что «Игровые подробности» закрыты: список желаемого следует именно этой '
    + 'настройке.',
  'steam.blocked.unavailableTitle': 'Список желаемого получить не удалось',
  'steam.blocked.unavailableText':
    'Steam ответил ошибкой, а ошибкой он отвечает и на список, который не отдаёт, и на неполадки у '
    + 'себя. Поэтому так: если «Игровые подробности» закрыты, шаги ниже их открывают; если они уже '
    + 'открыты, подождите несколько минут и нажмите «Проверить снова».',
  'steam.blocked.step1': 'Откройте свой профиль Steam и выберите «Редактировать профиль».',
  'steam.blocked.step2': 'Откройте «Настройки приватности».',
  'steam.blocked.step3': 'Поставьте «Игровые подробности» в «Открытый».',
  'steam.blocked.step4': 'Вернитесь сюда и нажмите «Проверить снова».',
  'steam.blocked.settings': 'Открыть настройки Steam',
  'steam.blocked.again': 'Проверить снова',
  'steam.blocked.keepPrivate': 'Не хочу открывать список',
  'steam.userscript.lead':
    'Соберите список прямо со страницы Steam. Userscript читает страницу списка желаемого, '
    + 'на которой вы уже вошли, поэтому настройка приватности ему не мешает, и своих сетевых '
    + 'запросов он не делает.',
  'steam.userscript.step1': 'Установите Tampermonkey — он есть для Chrome, Edge, Firefox и Opera.',
  'steam.userscript.step2': 'Установите скрипт «steam-wishlist-export.user.js» из репозитория.',
  'steam.userscript.step3':
    'Откройте страницу своего списка желаемого и нажмите «Collect the list», затем «Download JSON».',
  'steam.userscript.step4':
    'Вернитесь сюда и выберите этот файл в «Других способах импорта».',
  'steam.userscript.link': 'Открыть скрипт на GitHub ↗',
  'steam.offline.title': 'Загрузить список желаемого',
  'steam.offline.subtitle': 'Выберите путь попроще',
  'steam.offline.text':
    'Браузер не разрешает этой странице читать Steam напрямую, а локального сервера, который '
    + 'спросил бы за неё, за страницей нет. Ваши данные при этом остаются вашими.',
  'steam.offline.instructions': 'Показать инструкцию',
  'steam.offline.userscript.badge': 'Работает и с закрытыми списками',
  'steam.offline.userscript.title': 'Импорт со страницы Steam',
  'steam.offline.local.title': 'Запустить локальную версию',
  'steam.offline.local.text': 'Дальше достаточно ссылки на открытый профиль.',
  'steam.offline.local.download': 'Скачать',
  'steam.offline.local.step1': 'Установите Node.js 20 или новее.',
  'steam.offline.local.step2': 'Распакуйте архив в любую папку.',
  'steam.offline.local.step3':
    'Запустите «start.bat» в Windows или «node server.js» в macOS и Linux.',
  'steam.offline.local.step4': 'Откройте в браузере http://localhost:8080/.',
  'steam.step.account': 'Ищем аккаунт…',
  'steam.step.wishlist': 'Запрашиваем список желаемого…',
  'steam.step.titles': 'Названия: {done} из {total}',
  'steam.step.waiting': 'Steam ограничил частоту запросов. Ждём {seconds} с и спрашиваем снова…',
  'steam.note':
    'Одно название — один запрос, поэтому длинный список занимает минуты. Всё, что уже пришло, '
    + 'сохранено: остановка ничего не теряет.',
  'steam.done.title': 'Список желаемого получен',
  'steam.done.titlesTitle': 'Названия дотянуты',
  'steam.done.titlesText': 'В списке {items}, с названием из Steam: {titles}.',
  'steam.done.text':
    'Аккаунт Steam {account}. В списке {items}, с названием из Steam: {titles}.',
  'steam.done.missing.one': 'Steam не отдал {count} название: эта позиция показана по App ID.',
  'steam.done.missing.few': 'Steam не отдал {count} названия: эти позиции показаны по App ID.',
  'steam.done.missing.many': 'Steam не отдал {count} названий: эти позиции показаны по App ID.',
  'steam.done.throttled':
    'Steam перестал отвечать на названии {done} из {total}: он ограничивает частоту запросов. Всё '
    + 'полученное уже в списке — попробуйте кнопку снова через несколько минут.',
  'steam.missing.text.one': '{count} позиция в списке показана по App ID, а не по названию.',
  'steam.missing.text.few': '{count} позиции в списке показаны по App ID, а не по названию.',
  'steam.missing.text.many': '{count} позиций в списке показаны по App ID, а не по названию.',
  'steam.missing.run': 'Дотянуть остальные названия',
  'steam.cancelled': 'Остановлено. Всё, что успело прийти, осталось в списке.',
  'steam.error.title': 'Импорт из Steam не удался',
  'steam.error.emptyInput':
    'Поле пустое: введите SteamID64, имя профиля или ссылку на профиль.',
  'steam.error.invalidAccount':
    'Это не SteamID64 (17 цифр), не имя профиля Steam и не ссылка на профиль на steamcommunity.com.',
  'steam.error.accountNotFound':
    'Такого аккаунта в Steam нет. Проверьте написание — или откройте свой профиль в браузере и '
    + 'скопируйте адрес страницы.',
  'steam.error.wishlistEmpty':
    'Список желаемого этого аккаунта пуст: сортировать пока нечего.',
  'steam.error.rateLimited':
    'Steam ограничивает частоту запросов: с этого адреса их пришло слишком много. Через несколько '
    + 'минут ограничение снимается — тогда и попробуйте снова.',
  'steam.error.network':
    'До Steam не достучаться. Проверьте соединение и то, что локальный сервер ещё работает.',
  'steam.error.steamError':
    'Steam ответил чем-то неожиданным. Обычно это временные неполадки на его стороне; попробуйте '
    + 'чуть позже.',
  'steam.error.notLocal': 'Локальный сервер отвечает только на запросы с localhost.',
  'steam.error.unknown': 'Неожиданная ошибка: {message}',

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
  'categorize.eyebrow': 'Шаг 2 из 4',
  'categorize.heading': 'Насколько вам интересна эта игра?',
  'categorize.hint': 'Не раздумывайте долго — категорию можно изменить позже.',
  'categorize.buttonsAria': 'Уровни интереса',
  'categorize.more': 'Интересно больше',
  'categorize.less': 'Интересно меньше',
  'categorize.or': 'или',
  'categorize.counter': '{index} из {total}',
  'categorize.back': '← Предыдущая',
  'categorize.defer': 'Отложить <kbd>Space</kbd>',
  'categorize.done': 'Все позиции распределены.',
  'categorize.toCompare': 'Перейти к сравнениям',
  'categorize.empty': 'Список пуст: сначала импортируйте wishlist.',
  'categorize.toImport': 'Перейти к импорту',
  'categorize.position': 'Позиция в вашем wishlist: {position}',
  'categorize.current': 'Сейчас: {category}. Выберите другую категорию, чтобы изменить.',
  'categorize.legendLeft': 'осталось: {items}',
  'categorize.firstItem': 'Это первая позиция списка.',
  'categorize.noneLeft': 'Больше нераспределённых позиций нет.',
  'categorize.postponed': '{title} отложена, вернёмся к ней в конце круга.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': 'Пропустить категории?',
  'categorize.skipText':
    'Все позиции останутся без категории, и сравнения пойдут по всему списку как по одной группе — '
    + 'вопросов будет гораздо больше, чем при пяти небольших группах. Ничего не потеряется: '
    + 'вернуться к этому этапу можно в любой момент.',
  'categorize.skipConfirm': 'Пропустить и перейти к сравнениям',
  'categorize.skipDone': 'Этап пропущен: сравнения идут по всему списку.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Шаг 3 из 4',
  'compare.heading': 'Какую игру хочется больше?',
  'compare.headingDone': 'Сравнения закончены',
  'compare.hint': 'Выбирайте быстро. Пару, о которой не получается решить, можно отложить.',
  'compare.progress': 'Категория «{category}» · {made} · осталось примерно: {left}',
  'compare.deferred': 'отложено: {pairs}',
  'compare.preferA': 'Хочу больше <kbd>A</kbd>',
  'compare.preferB': 'Хочу больше <kbd>D</kbd>',
  'compare.drop': 'Больше не интересует',
  'compare.or': 'или',
  'compare.tie': 'Примерно одинаково <kbd>S</kbd>',
  'compare.defer': 'Не могу решить <kbd>Space</kbd>',
  'compare.undo': 'Отменить <kbd>Backspace</kbd>',
  'compare.finish': 'Закончить на сегодня',
  'compare.finishNote': 'Прогресс сохранён — текущий результат готов к просмотру.',
  'compare.done': 'Сравнивать больше нечего: порядок определён.',
  'compare.empty': 'Сравнивать нечего: список пуст.',
  'compare.toResult': 'Посмотреть результат',
  'compare.toImport': 'Перейти к импорту',
  'compare.banner.allDeferred':
    'Все остальные вопросы отложены ({count}), и без ответа на этот дальше не пройти. '
    + '«Примерно одинаково» — тоже ответ, и сортировка двинется дальше.',
  'compare.banner.forced': 'Эта пара нужна, чтобы двигаться дальше.',
  'compare.rejected': 'Ответ не принят: {message}',
  'compare.dropped': '«{title}» — в списке на удаление из желаемого.',
  'compare.nothingToUndo': 'Отменять нечего.',
  'compare.undone': 'Последний ответ отменён.',
  'compare.chosen': 'Выбрано: {title}.',
  'compare.tied': '{a} и {b} — примерно одинаково.',
  'compare.postponed': 'Пара отложена.',

  /* -- разовые объяснения --------------------------------------------- */
  'onboarding.start': 'Понятно',
  'onboarding.categorize.title': 'Сначала грубо разделим игры по интересу',
  'onboarding.categorize.lead':
    'Игры будут показываться по одной, и каждую нужно поставить на шкалу из пяти уровней — или '
    + 'сразу в список на удаление из желаемого.',
  'onboarding.categorize.why':
    'Именно это делает сортировку короткой: игры сравниваются только внутри своей группы, поэтому '
    + 'грубое разделение сейчас экономит сотни вопросов потом.',
  'onboarding.categorize.later':
    'Не раздумывайте долго. Категорию можно изменить в любой момент — вернуться к игре кнопкой '
    + '«Предыдущая» или поменять её на экране результата.',
  'onboarding.compare.title': 'Теперь выбираем между двумя играми',
  'onboarding.compare.lead':
    'По две игры за раз, обе из одной группы. Выберите ту, которую хочется больше, — клавиши A и D '
    + 'или стрелки.',
  'onboarding.compare.tie':
    'Если хочется одинаково, скажите «Примерно одинаково»: это тоже ответ, и сортировка его учтёт.',
  'onboarding.compare.defer':
    'Сложную пару можно отложить пробелом — она вернётся, когда простые закончатся.',
  'onboarding.compare.stop':
    'Закончить можно когда угодно. Каждый ответ сохраняется, а результат готов к просмотру в любой '
    + 'момент — завершённый или нет.',

  /* -- экран результата -------------------------------------------------- */
  'result.eyebrow': 'Шаг 4 из 4',
  'result.head.usable': 'Результат уже можно использовать',
  'result.head.ready': 'Ваш порядок готов',
  'result.head.empty': 'Упорядочивать пока нечего',
  'result.lead.usable': 'Перенесите его в Steam сейчас или продолжайте улучшать ответами.',
  'result.lead.ready': 'Каждое место в нём определено вашими ответами.',
  'result.lead.empty': 'Импортируйте список желаемого, и порядок появится здесь.',
  'result.continue': 'Продолжить сравнения',
  'result.complete': 'Сортировка завершена',
  'result.toImport': 'Перейти к импорту',

  /* -- экран результата: сводка ------------------------------------------ */
  'result.summary.eyebrow': 'Уже можно пользоваться',
  'result.summary.headline': 'По вашим ответам расставлено: {items}',
  'result.summary.headlineAll': 'Весь список стоит по вашим ответам',
  'result.summary.headlineNone': 'Ни одно место пока не определено ответами',
  'result.summary.rest':
    'Остальные сохраняют порядок, который был у них в списке желаемого; в списке ниже видно, какие '
    + 'именно.',
  'result.summary.choice':
    'Этот порядок можно перенести в Steam прямо сейчас или продолжить сравнения — каждый ответ '
    + 'улучшает его.',
  'result.summary.done': 'Сравнивать больше нечего. Перенесите порядок в Steam.',
  'result.summary.empty': 'Список пуст: пока нечего показывать.',
  'result.summary.allRemoved': 'Упорядочивать нечего: {marked} на удаление из желаемого.',
  'result.stats.total': 'в списке',
  'result.stats.confirmed': 'подтверждено',
  'result.stats.removed': 'помечено на удаление',
  'result.built.summary': 'Как построен этот порядок?',
  'result.built.categories':
    'Сначала идут категории, в порядке интереса; внутри категории место определяют сравнения.',
  'result.built.resolved':
    'Ваши ответы определяют место {resolved} из {total}. Остальные позиции ({fallback}) стоят там '
    + 'же, где стояли в списке желаемого, — это запасной порядок, и в списке он отмечен.',
  'result.built.answers': 'Ответов на сравнения: {count}.',
  'result.built.manual':
    'Вручную переставлено: {items}. Ручная перестановка накладывается поверх того, что дают '
    + 'сравнения, поэтому новые ответы продолжают улучшать список вокруг неё.',
  'result.built.noManual': 'Вручную ничего не переставляли.',
  'result.built.complete': 'Сортировка завершена: на каждую нужную пару есть ответ.',
  'result.built.incomplete': 'Сортировка не завершена — её можно продолжить в любой момент.',
  'result.legend.sorted': 'подтверждено сравнениями',
  'result.legend.fallback': 'пока в прежнем порядке — по позиции в списке желаемого',
  'result.legend.manual': 'переставлено вручную',
  'result.legend.tied': 'на одном месте с предыдущей',

  /* -- экран результата: перенос порядка в Steam -------------------------- */
  'result.transfer.eyebrow': 'Главное действие',
  'result.transfer.heading': 'Перенести порядок в Steam',
  'result.transfer.sub': 'Без расширений и установки дополнительных программ',
  'result.transfer.step1': 'Покажите панель закладок',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — в Chrome, Edge и Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — в Chrome, Edge и Firefox.',
  'result.transfer.shortcutSafari': 'В Safari: меню «Вид» → «Показать панель избранного».',
  'result.transfer.step2': 'Перетащите эту ссылку на панель',
  'result.transfer.step3': 'Откройте свой список желаемого и нажмите закладку',
  'result.transfer.openWishlist': 'Открыть мой список ↗',
  'result.transfer.link': 'Перенести мой порядок в Steam',
  'result.transfer.copy': 'Скопировать ссылку',
  'result.transfer.carries': 'В ссылке {items}.',
  'result.transfer.fresh':
    'Ссылка пересобирается при каждом изменении, поэтому отсюда всегда уходит текущий порядок.',
  'result.transfer.taken':
    'Это та самая ссылка, которую вы взяли, и она по-прежнему записывает порядок из списка ниже.',
  'result.transfer.stale': 'Порядок изменился — перетащите обновлённую ссылку вместо старой.',
  'result.transfer.copied':
    'Ссылка скопирована. Создайте закладку вручную и вставьте её как адрес.',
  'result.transfer.copyFailed':
    'Браузер не дал доступ к буферу обмена — перетащите ссылку на панель закладок.',
  'result.transfer.clickToast':
    'На эту ссылку здесь нажимать не надо: перетащите её на панель закладок и нажмите уже на '
    + 'странице списка желаемого в Steam.',
  'result.transfer.empty': 'Список пуст — переносить пока нечего.',
  'result.transfer.failed': 'Не удалось собрать ссылку: {message}',
  'result.transfer.mobile':
    'На телефоне или планшете это неудобно: букмарклет нужно перетащить на панель закладок. '
    + 'Перенос проще сделать в настольном браузере.',
  'result.transfer.warnAccount':
    'Порядок записывается в аккаунт, под которым вошёл этот браузер.',
  'result.transfer.warnNoDelete':
    'Ничего не удаляется: позиции, помеченные на удаление, уходят в конец списка.',
  'result.transfer.warnPriority':
    'После записи приоритет получают все позиции, включая те, у которых его не было.',
  'result.transfer.warnNoBackup':
    'Букмарклет не делает резервной копии и не проверяет результат.',
  'result.transfer.warnReload':
    'Когда всё пройдёт, перезагрузите страницу Steam и выберите сортировку по своему порядку.',
  'result.transfer.advanced': 'Нужна резервная копия и автоматическая проверка?',
  'result.transfer.advancedText':
    'Userscript читает саму страницу списка: сохраняет в файл тот порядок, что есть сейчас, '
    + 'записывает новый и потом сверяет, что он доехал. Ему нужен Tampermonkey — поэтому это путь '
    + 'длиннее и не главный.',
  'result.transfer.advancedStep2':
    'Установите скрипт «steam-wishlist-import-order.user.js» из репозитория.',
  'result.transfer.advancedStep3':
    'Откройте страницу списка желаемого и следуйте панели, которую поставит скрипт.',

  /* -- экран результата: список ------------------------------------------ */
  'result.list.heading': 'Ваш порядок',
  'result.search': 'Поиск по названию или App ID',
  'result.filterAria': 'Что показывать',
  'result.filter.all': 'Все',
  'result.filter.game': 'Игры',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Строку можно перетащить мышью или выделить и переместить <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd>. Перестановки сохраняются и переживают перезагрузку.',
  'result.removed.hint': 'Эти позиции не входят в нумерацию итогового списка.',
  'result.mark.confirmed': 'Подтверждено сравнениями',
  'result.mark.fallback': 'Пока в прежнем порядке',
  'result.mark.manual': 'Перемещено вручную',
  'result.mark.tied': 'На одном месте с предыдущей',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} в категории',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Категория: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': 'показано {shown} из {total}',
  'result.empty.filter': 'Под фильтр и поиск не попала ни одна позиция.',
  'result.empty.noItems': 'Импортируйте список желаемого, и здесь появится результат.',
  'result.empty.allRemoved': 'Все позиции помечены на удаление — упорядочивать нечего.',
  'result.move.failed': 'Не удалось переставить: {message}',
  'result.move.announce': '«{title}» {where}{category}.',
  'result.move.place': 'на место {position}',
  'result.move.newPlace': 'на новое место',
  'result.move.categorySuffix': ', категория: {category}',
  'result.move.categoryToast': '«{title}» переехала в «{category}».',
  'result.move.edge':
    'Это {edge} строка категории «{category}». Категория меняется выбором в самой строке.',
  'result.move.edgeFirst': 'первая',
  'result.move.edgeLast': 'последняя',
  'result.category.failed': 'Не удалось сменить категорию: {message}',
  'result.category.toast': '«{title}» — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Отобразить тир-лист',
  'tier.title': 'Тир-лист желаемого',
  'tier.lead': 'Внутри каждой категории игры расположены по порядку слева направо.',
  'tier.close': 'Закрыть',
  'tier.none': 'Без категории',
  'tier.empty': 'Здесь пусто',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Помечено на удаление. Из Steam приложение ничего не удаляет — это остаётся вам.',

  /* -- экран результата: файлы и два сброса ------------------------------- */
  'result.export.summary': 'Скачать или поделиться',
  'result.export.hint':
    'Файлы собираются здесь, в браузере, и сохраняете их вы — никуда ничего не отправляется.',
  'result.exportJson': 'Итог в JSON',
  'result.exportCsv': 'Итог в CSV',
  'result.copyText': 'Скопировать списком',
  'result.saveState': 'Резервная копия состояния',
  'result.export.empty': 'Экспортировать нечего: список пуст.',
  'result.export.failed': 'Не удалось собрать файл: {message}',
  'result.export.jsonDone': 'Итоговый порядок сохранён в JSON.',
  'result.export.csvDone': 'Итоговый список сохранён в CSV.',
  'result.copy.empty': 'Копировать нечего: список пуст.',
  'result.copy.done': 'Нумерованный список скопирован в буфер обмена.',
  'result.copy.failed': 'Браузер не дал доступ к буферу обмена — список сохранён файлом.',
  'result.resetManual': 'Сбросить ручные перемещения',
  'result.resetManual.none': 'Ручных перестановок нет.',
  'result.resetManual.title': 'Сбросить ручные перемещения?',
  'result.resetManual.text':
    'Будет забыто: {moves}. Ответы сравнений останутся на месте.',
  'result.resetManual.confirm': 'Сбросить перестановки',
  'result.resetManual.done': 'Ручные перестановки сброшены.',
  'result.resetAnswers': 'Сбросить ответы сравнений',
  'result.resetAnswers.none': 'Ответов пока нет.',
  'result.resetAnswers.title': 'Сбросить ответы сравнений?',
  'result.resetAnswers.text':
    'Будет удалено: {answers}. Список, категории и ручные перестановки останутся.',
  'result.resetAnswers.confirm': 'Сбросить ответы',
  'result.resetAnswers.done': 'Ответы сравнений сброшены.',

  /* -- букмарклет: что он говорит на странице Steam ---------------------- */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Это не список желаемого Steam. Откройте store.steampowered.com/wishlist, войдите в аккаунт и '
    + 'нажмите закладку там. Ничего не отправлено.',
  'bookmarklet.confirm':
    'Сейчас этот порядок ({items}) будет записан в список желаемого того аккаунта, под которым '
    + 'вошёл этот браузер. Ничего не удаляется. Отменить это будет нельзя: после записи приоритет получат все '
    + 'позиции, включая те, у которых его не было, и никакая резервная копия этого не вернёт.',
  'bookmarklet.write': 'Записать порядок',
  'bookmarklet.cancel': 'Отмена',
  'bookmarklet.close': 'Закрыть',
  'bookmarklet.sending': 'Отправляем порядок в Steam…',
  'bookmarklet.done':
    'Steam принял порядок. Перезагрузите страницу списка желаемого и посмотрите на него: страницу '
    + 'этот букмарклет не читает, так что проверка за вами.',
  'bookmarklet.unclear':
    'Steam ответил, но из ответа не следует ни да, ни нет. Перезагрузите страницу списка желаемого '
    + 'и посмотрите на порядок, прежде чем повторять.',
  'bookmarklet.refused':
    'Steam отверг порядок и не объяснил почему. Перезагрузите страницу списка желаемого и '
    + 'посмотрите на порядок, прежде чем повторять.',
  'bookmarklet.badRequest':
    'Steam отверг запрос на входе: 400 и пустое тело — до порядка он даже не дошёл, записано '
    + 'ничего не было. Так он отвечает, когда запросу не хватает чего-то, чего Steam от него '
    + 'требует, и сам ответ этого не называет. Похоже, эндпоинт изменился; что с этим делать, '
    + 'написано на странице проекта.',
  'bookmarklet.signedOut':
    'Steam не принял сессию — чаще всего она просто истекла. Войдите в Steam заново, перезагрузите '
    + 'список желаемого и нажмите закладку ещё раз. Ничего не записано.',
  'bookmarklet.rateLimited':
    'Steam ответил «слишком много запросов». Подождите пару минут и нажмите закладку снова — ничего '
    + 'не изменилось.',
  'bookmarklet.tooLarge':
    'Запрос слишком велик для Steam: весь порядок уходит одним запросом, и этот не поместился. '
    + 'Ничего не записано. Для такого списка нужен userscript — он умеет вместо записи разметить '
    + 'строки прямо на странице.',
  'bookmarklet.serverError':
    'Беда на стороне Steam — он ответил ошибкой сервера. Попробуйте через несколько минут; ничего '
    + 'не записано.',
  'bookmarklet.offline':
    'Запрос вообще не дошёл до Steam. Возможно, нет сети или его заблокировало расширение. Ничего '
    + 'не записано — проверьте связь и нажмите закладку снова.',

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

/* ------------------------------------------------------------- german */

/** @type {Readonly<Record<string, string>>} */
const DE = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} Eintrag',
  'count.items.few': '{count} Einträge',
  'count.items.many': '{count} Einträge',
  'count.records.one': '{count} Datensatz',
  'count.records.few': '{count} Datensätze',
  'count.records.many': '{count} Datensätze',
  'count.comparisonsMade.one': '{count} durchgeführter Vergleich',
  'count.comparisonsMade.few': '{count} durchgeführte Vergleiche',
  'count.comparisonsMade.many': '{count} durchgeführte Vergleiche',
  'count.comparisonsDone.one': '{count} Vergleich beantwortet',
  'count.comparisonsDone.few': '{count} Vergleiche beantwortet',
  'count.comparisonsDone.many': '{count} Vergleiche beantwortet',
  'count.pairs.one': '{count} Paar',
  'count.pairs.few': '{count} Paare',
  'count.pairs.many': '{count} Paare',
  'count.rows.one': '{count} Zeile',
  'count.rows.few': '{count} Zeilen',
  'count.rows.many': '{count} Zeilen',
  'count.moves.one': '{count} Verschiebung',
  'count.moves.few': '{count} Verschiebungen',
  'count.moves.many': '{count} Verschiebungen',
  'count.answers.one': '{count} Antwort',
  'count.answers.few': '{count} Antworten',
  'count.answers.many': '{count} Antworten',
  'count.marked.one': '{count} Eintrag ist zum Entfernen vorgemerkt',
  'count.marked.few': '{count} Einträge sind zum Entfernen vorgemerkt',
  'count.marked.many': '{count} Einträge sind zum Entfernen vorgemerkt',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Ein lokales Werkzeug, das eine Steam-Wunschliste durch paarweise Vergleiche in eine '
    + 'Reihenfolge bringt.',
  'a11y.skipToContent': 'Zum Inhalt springen',
  'a11y.progress.import': 'Die Wunschliste wird geladen',
  'a11y.progress.categorize': 'Einträge mit einer Kategorie',
  'a11y.progress.compare': 'Beantwortete Vergleiche',
  'nav.aria': 'Schritte',
  'nav.import': 'Wunschliste',
  'nav.categorize': 'Kategorien',
  'nav.compare': 'Vergleiche',
  'nav.result': 'Ergebnis',
  'nav.state.done': 'Schritt abgeschlossen',
  'nav.state.current': 'aktueller Schritt',
  'nav.state.locked': 'Schritt noch nicht verfügbar',
  'settings.title': 'Einstellungen',
  'settings.covers': 'Titelbilder laden',
  'settings.language': 'Sprache der Oberfläche',
  'settings.theme': 'Design',
  'theme.modern': 'Modern',
  'theme.steam': 'Steam-ähnlich',
  'actions.saveState': 'Sicherung speichern',
  'actions.loadState': 'Sicherung laden',
  'actions.skipStage': 'Kategorien überspringen',
  'actions.reset': 'Von vorn beginnen',
  'privacy.short': 'Läuft lokal · deine Daten gehen an keinen fremden Server',
  'privacy.details': 'Einzelheiten',
  'privacy.note':
    'Deine Daten verlassen den Browser nie. Die einzige externe Anfrage, die die Anwendung '
    + 'überhaupt stellt, ist das Laden der Titelbilder vom Steam-CDN über eine öffentliche '
    + 'Adresse; sie wird mit dem Schalter „Titelbilder laden“ abgestellt. Den Import direkt aus '
    + 'einem Konto stellt der lokale Server auf deinem eigenen Rechner: er geht zu Steam, zu sonst '
    + 'niemandem, und nur wenn du die Schaltfläche drückst.',
  'dialog.title': 'Aktion bestätigen',
  'dialog.cancel': 'Abbrechen',
  'dialog.confirm': 'Weiter',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'In Steam öffnen ↗',
  'common.openInSteamAria': '„{title}“ in Steam öffnen, in einem neuen Tab',
  'category.must': 'Will ich unbedingt',
  'category.want': 'Will ich',
  'category.maybe': 'Vielleicht',
  'category.unlikely': 'Eher nicht',
  'category.meh': 'Kaum Interesse',
  'category.remove': 'Von der Wunschliste entfernen',
  'category.none': 'Keine Kategorie',
  'kind.game': 'Spiel',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Art unbekannt',
  'cover.none': 'Kein Titelbild',
  'cover.off': 'Titelbilder sind aus',
  'cover.failed': 'Das Titelbild wurde nicht geladen',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'Der Stand konnte im Browser nicht gespeichert werden. Speichere ihn in eine Datei, damit '
    + 'nichts verloren geht.',
  'app.saveFailedReason': 'Der Stand konnte nicht gespeichert werden: {message}',
  'app.loadFailed':
    'Der gespeicherte Stand ließ sich nicht lesen ({message}). Es geht mit einer leeren Liste weiter.',
  'app.covers.on': 'Titelbilder sind an: die Anwendung lädt Bilder vom Steam-CDN.',
  'app.covers.off': 'Titelbilder sind aus: die Anwendung stellt überhaupt keine externe Anfrage.',
  'app.language.changed': 'Sprache der Oberfläche: {language}.',
  'app.theme.changed': 'Design: {theme}.',
  'app.reset.title': 'Von vorn beginnen?',
  'app.reset.text':
    '{items}, die Kategorien, die Antworten auf die Vergleiche und die Verschiebungen von Hand '
    + 'werden gelöscht. Das lässt sich nicht rückgängig machen — wenn die Arbeit noch nützlich '
    + 'sein könnte, speichere sie zuerst in eine Datei.',
  'app.reset.confirm': 'Alles löschen und von vorn beginnen',
  'app.reset.done': 'Der Stand ist geleert.',
  'app.state.buildFailed': 'Die Zustandsdatei konnte nicht gebaut werden: {message}',
  'app.state.saved': 'Der Stand ist in eine Datei gespeichert.',
  'app.saved': 'Fortschritt in diesem Browser gespeichert',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Eine Reihenfolge, die du wirklich gewählt hast',
  'import.promise': 'Ordne Spiele danach, wie sehr du sie wirklich spielen willst',
  'import.lead':
    'Gruppiere deine Wunschliste schnell nach Interesse und wähle dann zwischen zwei Spielen. Hör '
    + 'auf, wann du willst — der Fortschritt wird immer gespeichert.',
  'import.step.load': 'Wunschliste laden',
  'import.step.group': 'Nach Interesse gruppieren',
  'import.step.compare': 'Spiele vergleichen',
  'import.step.send': 'Reihenfolge an Steam senden',
  'import.sessions':
    'Eine vollständige Sortierung kann mehrere Sitzungen dauern. Dein aktuelles Ergebnis ist immer '
    + 'verfügbar.',
  'import.other': 'Andere Wege des Imports',
  'import.file.title': 'JSON-Datei',
  'import.file.hint': 'Ein Export aus Steam oder eine Datei, die das Userscript gesammelt hat.',
  'import.file.button': 'Datei wählen…',
  'import.file.none': 'Keine Datei gewählt',
  'import.paste.title': 'JSON einfügen',
  'import.paste.hint': 'Der Rumpf der Steam-Antwort kann eingefügt werden, wie er ist.',
  'import.paste.label': 'Wunschlisten-JSON',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Aus dem Text importieren',
  'import.userscript.title': 'Von der Steam-Seite, mit dem Userscript',
  'import.userscript.hint': 'Die Datei, die es herunterlädt, wird oben unter „JSON-Datei“ geladen.',
  'import.state.title': 'Gespeicherter Stand',
  'import.state.hint':
    'Eine Datei, die du früher mit „Sicherung speichern“ angelegt hast: die Kategorien und jede '
    + 'Antwort kommen zurück.',
  'import.state.button': 'Zustandsdatei wählen…',
  'import.demo.button': 'Mit 20 Spielen ausprobieren',
  'import.ready.eyebrow': 'Bereit',
  'import.ready.count.one': '{count} Eintrag geladen',
  'import.ready.count.few': '{count} Einträge geladen',
  'import.ready.count.many': '{count} Einträge geladen',
  'import.ready.next':
    'Als Nächstes teilst du die Spiele in fünf Stufen des Interesses ein. Genau das drückt die '
    + 'Zahl der Vergleiche nach unten.',
  'import.ready.start': 'Mit dem Gruppieren beginnen',
  'import.ready.again': 'Eine andere Wunschliste laden',
  'import.current':
    'Die Liste enthält gerade {items}: {sorted} mit einer Kategorie, {plain} ohne. Durchgeführte '
    + 'Vergleiche: {comparisons}. Ein erneuter Import frischt die Einträge auf und behält die '
    + 'schon geleistete Arbeit.',
  'import.announce': 'Importiert: {count}. Die Liste enthält jetzt {total}.',
  'import.source.file': 'Datei {name}',
  'import.source.pasted': 'Eingefügter Text',
  'import.source.demo': 'Demo-Satz',
  'import.report.title': '{source}: {records} gelesen',
  'import.report.added': 'hinzugefügt',
  'import.report.updated': 'aktualisiert',
  'import.report.duplicates': 'Dubletten',
  'import.report.skipped': 'übersprungen',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'Datensatz Nr. {number}',
  'import.issue.key': 'Schlüssel „{key}“',
  'import.issue.more': '…und {count} weitere',
  'import.skip.notAnObject':
    'der Datensatz sieht weder nach einem Eintrag noch nach einer App ID aus',
  'import.skip.missingAppId': 'keine App ID',
  'import.skip.invalidAppId': 'die App ID ist keine Zahl',
  'import.skip.duplicateInInput': 'der Eintrag kam in dieser Datei schon vor',
  'import.error.title': 'Der Import ist fehlgeschlagen',
  'import.error.emptyInput': 'Es gibt nichts zu importieren: die Datei oder das Feld ist leer.',
  'import.error.invalidJson':
    'Das ist kein JSON. Es sieht aus, als wäre der Text nur zum Teil kopiert worden oder als wäre '
    + 'etwas Fremdes hineingeraten.',
  'import.error.unrecognizedFormat':
    'Das JSON wurde gelesen, sieht aber nicht nach einer Wunschliste aus. Gebraucht wird ein Array '
    + 'von Einträgen, ein Objekt der Form { "440": { … } } oder eine Steam-Antwort mit einem Feld '
    + 'response.items.',
  'import.error.emptyResultTitle': 'Der Import lief durch, die Liste ist aber leer',
  'import.error.emptyResultText':
    'Es ließ sich kein einziger Eintrag lesen. Prüfe, ob die Datei wirklich eine Wunschliste enthält.',
  'import.error.fileRead': 'Die Datei konnte nicht gelesen werden',
  'import.demo.failedTitle': 'Der Demo-Satz wurde nicht geladen',
  'import.demo.failedText':
    '{message}. Die Datei {url} muss neben index.html liegen — und die Seite muss über http(s) '
    + 'geöffnet sein, nicht als file://.',
  'import.demo.httpError': 'der Server antwortete mit {status}',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Aus Steam laden',
  'steam.subtitle': 'Der einfachste Weg bei einer öffentlichen Wunschliste',
  'steam.field': 'Dein Steam-Profil',
  'steam.placeholder': 'steamcommunity.com/id/deinname, ein Profilname oder eine SteamID64',
  'steam.run': 'Prüfen und laden',
  'steam.cancel': 'Anhalten',
  'steam.checking': 'Der lokale Server wird gesucht…',
  'steam.warning': 'Der automatische Import funktioniert, wenn die „Spieldetails“ öffentlich sind.',
  'steam.privateAsk': 'Und wenn sie privat sind?',
  'steam.privateHelp':
    'Öffne dein Steam-Profil, wähle „Profil bearbeiten“, dann „Privatsphäre-Einstellungen“, und '
    + 'setze „Spieldetails“ auf Öffentlich. Wenn du das lieber nicht möchtest: das Userscript '
    + 'unter „Andere Wege des Imports“ liest die Seite, auf der du angemeldet bist, und kommt auch '
    + 'mit einer privaten Liste zurecht.',
  'steam.settingsLink': 'Steam-Einstellungen öffnen ↗',

  'steam.blocked.title': 'Steam hat die Wunschliste nicht herausgegeben',
  'steam.blocked.text':
    'Meist heißt das, dass die „Spieldetails“ privat sind: die Wunschliste hängt an genau dieser '
    + 'einen Einstellung.',
  'steam.blocked.unavailableTitle': 'Die Wunschliste konnte nicht geholt werden',
  'steam.blocked.unavailableText':
    'Steam hat mit einem Fehler geantwortet, und einen Fehler antwortet es sowohl auf eine Liste, '
    + 'die es nicht herausgibt, als auch in einer schlechten eigenen Minute. Also: sind die '
    + '„Spieldetails“ privat, öffnen die Schritte unten sie; sind sie schon öffentlich, warte ein '
    + 'paar Minuten und drücke „Erneut prüfen“.',
  'steam.blocked.step1': 'Öffne dein Steam-Profil und wähle „Profil bearbeiten“.',
  'steam.blocked.step2': 'Öffne die „Privatsphäre-Einstellungen“.',
  'steam.blocked.step3': 'Setze „Spieldetails“ auf Öffentlich.',
  'steam.blocked.step4': 'Komm hierher zurück und drücke „Erneut prüfen“.',
  'steam.blocked.settings': 'Steam-Einstellungen öffnen',
  'steam.blocked.again': 'Erneut prüfen',
  'steam.blocked.keepPrivate': 'Ich will sie nicht öffentlich machen',

  'steam.userscript.lead':
    'Sammle die Liste auf der Steam-Seite selbst. Das Userscript liest die Wunschlisten-Seite, auf '
    + 'der du angemeldet bist, deshalb spielt die Privatsphäre-Einstellung keine Rolle, und es '
    + 'stellt keine eigene Netzwerkanfrage.',
  'steam.userscript.step1':
    'Installiere Tampermonkey — es gibt es für Chrome, Edge, Firefox und Opera.',
  'steam.userscript.step2':
    'Installiere das Skript „steam-wishlist-export.user.js“ aus dem Repository.',
  'steam.userscript.step3':
    'Öffne deine Wunschlisten-Seite und drücke „Liste sammeln“, dann „JSON herunterladen“.',
  'steam.userscript.step4':
    'Komm hierher zurück und wähle diese Datei unter „Andere Wege des Imports“.',
  'steam.userscript.link': 'Das Skript auf GitHub öffnen ↗',

  'steam.offline.title': 'Meine Wunschliste laden',
  'steam.offline.subtitle': 'Wähle den einfachsten Weg',
  'steam.offline.text':
    'Dein Browser erlaubt dieser Seite nicht, Steam direkt zu lesen, und es steht kein lokaler '
    + 'Server dahinter, der in ihrem Namen fragen könnte. Deine Daten bleiben trotzdem deine.',
  'steam.offline.instructions': 'Anleitung zeigen',
  'steam.offline.userscript.badge': 'Funktioniert mit privaten Listen',
  'steam.offline.userscript.title': 'Von deiner Steam-Seite importieren',
  'steam.offline.local.title': 'Die lokale Fassung starten',
  'steam.offline.local.text': 'Dann genügt ein Link auf ein öffentliches Profil.',
  'steam.offline.local.download': 'Herunterladen',
  'steam.offline.local.step1': 'Installiere Node.js 20 oder neuer.',
  'steam.offline.local.step2': 'Entpacke das Archiv an einen beliebigen Ort.',
  'steam.offline.local.step3':
    'Starte „start.bat“ unter Windows oder „node server.js“ unter macOS und Linux.',
  'steam.offline.local.step4': 'Öffne http://localhost:8080/ im Browser.',
  'steam.step.account': 'Das Konto wird gesucht…',
  'steam.step.wishlist': 'Steam wird nach der Wunschliste gefragt…',
  'steam.step.titles': 'Titel: {done} von {total}',
  'steam.step.waiting': 'Steam begrenzt die Anfragen. {seconds} s warten und noch einmal fragen…',
  'steam.note':
    'Ein Titel, eine Anfrage — eine lange Liste dauert also Minuten. Alles, was schon angekommen '
    + 'ist, wird gespeichert: Anhalten verliert nichts.',
  'steam.done.title': 'Die Wunschliste ist angekommen',
  'steam.done.titlesTitle': 'Die Titel sind geholt',
  'steam.done.titlesText': '{items} in der Liste, davon {titles} mit einem Titel von Steam.',
  'steam.done.text':
    'Steam-Konto {account}: {items} in der Liste, davon {titles} mit einem Titel von Steam.',
  'steam.done.missing.one':
    'Steam hat {count} Titel nicht herausgegeben: dieser Eintrag wird mit seiner App ID angezeigt.',
  'steam.done.missing.few':
    'Steam hat {count} Titel nicht herausgegeben: diese Einträge werden mit ihrer App ID angezeigt.',
  'steam.done.missing.many':
    'Steam hat {count} Titel nicht herausgegeben: diese Einträge werden mit ihrer App ID angezeigt.',
  'steam.done.throttled':
    'Steam hat bei Titel {done} von {total} aufgehört zu antworten: es begrenzt die Anfragen. '
    + 'Alles Geholte ist schon in der Liste — versuche es in ein paar Minuten mit derselben '
    + 'Schaltfläche noch einmal.',
  'steam.missing.text.one':
    '{count} Eintrag der Liste wird noch mit einer App ID statt mit einem Titel angezeigt.',
  'steam.missing.text.few':
    '{count} Einträge der Liste werden noch mit einer App ID statt mit einem Titel angezeigt.',
  'steam.missing.text.many':
    '{count} Einträge der Liste werden noch mit einer App ID statt mit einem Titel angezeigt.',
  'steam.missing.run': 'Die fehlenden Titel holen',
  'steam.cancelled': 'Angehalten. Alles, was bis dahin angekommen war, ist in der Liste geblieben.',
  'steam.error.title': 'Der Import aus Steam ist fehlgeschlagen',
  'steam.error.emptyInput':
    'Das Feld ist leer: gib eine SteamID64, einen Profilnamen oder einen Link auf das Profil ein.',
  'steam.error.invalidAccount':
    'Das ist weder eine SteamID64 (17 Ziffern) noch ein Steam-Profilname noch ein Link auf ein '
    + 'Profil bei steamcommunity.com.',
  'steam.error.accountNotFound':
    'Steam kennt kein solches Konto. Prüfe die Schreibweise — oder öffne dein Profil im Browser '
    + 'und kopiere die Adresse der Seite.',
  'steam.error.wishlistEmpty':
    'Die Wunschliste dieses Kontos ist leer: es gibt noch nichts zu sortieren.',
  'steam.error.rateLimited':
    'Steam begrenzt die Anfragen: von dieser Adresse kamen zu viele. Nach ein paar Minuten lässt '
    + 'es wieder los — versuche es dann noch einmal.',
  'steam.error.network':
    'Steam war nicht erreichbar. Prüfe die Verbindung und ob der lokale Server noch läuft.',
  'steam.error.steamError':
    'Steam hat mit etwas Unerwartetem geantwortet. Meist hat Steam selbst gerade einen schlechten '
    + 'Moment; versuche es etwas später noch einmal.',
  'steam.error.notLocal': 'Der lokale Server beantwortet nur Anfragen von localhost.',
  'steam.error.unknown': 'Unerwarteter Fehler: {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'Die Zustandsdatei lässt sich nicht als JSON lesen.',
  'state.error.foreignState':
    'Das ist das JSON einer anderen Anwendung: es trägt keine Signatur von Steam Wishlist Sorter.',
  'state.error.unsupportedVersion':
    'Die Datei wurde mit einer anderen Fassung des Formats gespeichert und wird nicht unterstützt.',
  'state.error.invalidState': 'Die Datei sieht nach einem Stand aus, enthält aber keine Sitzung.',
  'state.error.writeFailed':
    'Der Stand wurde gelesen, aber der Browser hat das Speichern verweigert.',
  'state.confirm.title': 'Den Stand über den aktuellen laden?',
  'state.confirm.text':
    'Aktueller Stand: {items}, {comparisons}. Die Datei ersetzt das alles im Ganzen: '
    + 'die Liste, die Kategorien, die Antworten und die Verschiebungen von Hand. Das lässt sich '
    + 'nicht rückgängig machen.',
  'state.confirm.confirm': 'Den aktuellen Stand ersetzen',
  'state.confirm.cancelled': 'Der Import des Stands wurde abgebrochen — nichts hat sich geändert.',
  'state.restored.title': 'Der Stand ist wiederhergestellt',
  'state.restored.items': 'Einträge',
  'state.restored.comparisons': 'durchgeführte Vergleiche',
  'state.restored.moves': 'Verschiebungen von Hand',
  'state.restored.toast': 'Der Stand ist aus der Datei wiederhergestellt.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': 'Schritt 2 von 4',
  'categorize.heading': 'Wie sehr interessiert dich dieses Spiel?',
  'categorize.hint': 'Denk nicht zu lange nach — die Kategorie lässt sich später ändern.',
  'categorize.buttonsAria': 'Stufen des Interesses',
  'categorize.more': 'Mehr Interesse',
  'categorize.less': 'Weniger Interesse',
  'categorize.or': 'oder',
  'categorize.counter': '{index} von {total}',
  'categorize.back': '← Zurück',
  'categorize.defer': 'Zurückstellen <kbd>Leertaste</kbd>',
  'categorize.done': 'Jeder Eintrag hat eine Kategorie.',
  'categorize.toCompare': 'Zu den Vergleichen',
  'categorize.empty': 'Die Liste ist leer: importiere zuerst eine Wunschliste.',
  'categorize.toImport': 'Zum Import',
  'categorize.position': 'Platz in deiner Wunschliste: {position}',
  'categorize.current': 'Jetzt: {category}. Wähle eine andere Kategorie, um das zu ändern.',
  'categorize.legendLeft': 'noch {items}',
  'categorize.firstItem': 'Das ist der erste Eintrag der Liste.',
  'categorize.noneLeft': 'Es ist kein Eintrag ohne Kategorie mehr übrig.',
  'categorize.postponed': '{title} ist zurückgestellt, am Ende der Runde kommen wir darauf zurück.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': 'Die Kategorien überspringen?',
  'categorize.skipText':
    'Jeder Eintrag bleibt ohne Kategorie, und die Vergleiche laufen dann über die ganze Liste als '
    + 'eine einzige Gruppe — sehr viel mehr Fragen, als fünf kleinere Gruppen gebraucht hätten. '
    + 'Verloren geht nichts: du kannst jederzeit zu diesem Schritt zurückkommen.',
  'categorize.skipConfirm': 'Überspringen und zu den Vergleichen',
  'categorize.skipDone': 'Der Schritt ist übersprungen: die Vergleiche laufen über die ganze Liste.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Schritt 3 von 4',
  'compare.heading': 'Welches Spiel willst du mehr?',
  'compare.headingDone': 'Die Vergleiche sind fertig',
  'compare.hint':
    'Wähle schnell. Ein Paar, bei dem du dich nicht entscheiden kannst, lässt sich zurückstellen.',
  'compare.progress': 'Kategorie „{category}“ · {made} · noch etwa {left}',
  'compare.deferred': 'zurückgestellt: {pairs}',
  'compare.preferA': 'Will ich mehr <kbd>A</kbd>',
  'compare.preferB': 'Will ich mehr <kbd>D</kbd>',
  'compare.drop': 'Kein Interesse mehr',
  'compare.or': 'oder',
  'compare.tie': 'Etwa gleich <kbd>S</kbd>',
  'compare.defer': 'Kann mich nicht entscheiden <kbd>Leertaste</kbd>',
  'compare.undo': 'Rückgängig <kbd>Rücktaste</kbd>',
  'compare.finish': 'Für heute aufhören',
  'compare.finishNote':
    'Der Fortschritt ist gespeichert — dein aktuelles Ergebnis ist einsatzbereit.',
  'compare.done': 'Es gibt nichts mehr zu vergleichen: die Reihenfolge steht.',
  'compare.empty': 'Es gibt nichts zu vergleichen: die Liste ist leer.',
  'compare.toResult': 'Das Ergebnis ansehen',
  'compare.toImport': 'Zum Import',
  'compare.banner.allDeferred':
    'Alle anderen Fragen sind zurückgestellt ({count}), und ohne eine Antwort auf diese hier geht '
    + 'es nicht weiter. „Etwa gleich“ ist auch eine Antwort, und die Sortierung kommt damit voran.',
  'compare.banner.forced': 'Dieses Paar wird gebraucht, um weiterzukommen.',
  'compare.rejected': 'Die Antwort wurde nicht angenommen: {message}',
  'compare.dropped': '„{title}“ steht auf der Liste zum Entfernen von der Wunschliste.',
  'compare.nothingToUndo': 'Es gibt nichts rückgängig zu machen.',
  'compare.undone': 'Die letzte Antwort ist zurückgenommen.',
  'compare.chosen': 'Gewählt: {title}.',
  'compare.tied': '{a} und {b} — etwa gleich.',
  'compare.postponed': 'Das Paar ist zurückgestellt.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Verstanden',
  'onboarding.categorize.title': 'Zuerst die Spiele grob nach Interesse gruppieren',
  'onboarding.categorize.lead':
    'Du siehst ein Spiel nach dem anderen und legst es irgendwo auf einer Skala aus fünf Stufen '
    + 'ab — oder gleich auf der Liste der Spiele, die von der Wunschliste verschwinden sollen.',
  'onboarding.categorize.why':
    'Das ist es, was die Sortierung kurz hält: Spiele werden immer nur innerhalb ihrer eigenen '
    + 'Gruppe verglichen, deshalb spart eine grobe Aufteilung jetzt Hunderte Fragen später.',
  'onboarding.categorize.later':
    'Denk nicht zu lange nach. Eine Kategorie lässt sich jederzeit ändern — geh mit „Zurück“ zum '
    + 'Spiel oder ändere sie auf dem Ergebnisbildschirm.',
  'onboarding.compare.title': 'Jetzt zwischen zwei Spielen wählen',
  'onboarding.compare.lead':
    'Zwei Spiele auf einmal, beide aus derselben Gruppe. Nimm das, was du mehr willst — die '
    + 'Tasten A und D oder die Pfeile.',
  'onboarding.compare.tie':
    'Wenn du beide gleich sehr willst, sag „Etwa gleich“: das ist auch eine Antwort, und die '
    + 'Sortierung nutzt sie.',
  'onboarding.compare.defer':
    'Ein schweres Paar lässt sich mit der Leertaste zurückstellen; es kommt wieder, sobald die '
    + 'leichten beantwortet sind.',
  'onboarding.compare.stop':
    'Hör auf, wann du willst. Jede Antwort wird gespeichert, und das Ergebnis lässt sich jederzeit '
    + 'ansehen — fertig oder nicht.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Schritt 4 von 4',
  'result.head.usable': 'Das Ergebnis ist schon brauchbar',
  'result.head.ready': 'Deine Reihenfolge ist fertig',
  'result.head.empty': 'Es gibt noch nichts zu ordnen',
  'result.lead.usable': 'Übertrage sie jetzt zu Steam oder verbessere sie mit weiteren Antworten.',
  'result.lead.ready': 'Jeder Platz darin steht durch deine eigenen Antworten fest.',
  'result.lead.empty': 'Importiere eine Wunschliste, und die Reihenfolge erscheint hier.',
  'result.continue': 'Vergleiche fortsetzen',
  'result.complete': 'Die Sortierung ist abgeschlossen',
  'result.toImport': 'Zum Import',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Einsatzbereit',
  'result.summary.headline': '{items} — geordnet nach deinen Antworten',
  'result.summary.headlineAll': 'Die ganze Liste folgt deinen Antworten',
  'result.summary.headlineNone': 'Noch steht kein Platz durch eine Antwort fest',
  'result.summary.rest':
    'Der Rest behält die Reihenfolge aus deiner Wunschliste; die Liste unten sagt, welche das sind.',
  'result.summary.choice':
    'Übertrage diese Reihenfolge jetzt zu Steam oder vergleiche weiter — jede Antwort verbessert sie.',
  'result.summary.done': 'Es gibt nichts mehr zu vergleichen. Übertrage die Reihenfolge zu Steam.',
  'result.summary.empty': 'Die Liste ist leer: es gibt noch nichts zu zeigen.',
  'result.summary.allRemoved': '{marked}, also bleibt nichts mehr, was sich ordnen ließe.',
  'result.stats.total': 'in der Liste',
  'result.stats.confirmed': 'bestätigt',
  'result.stats.removed': 'zum Entfernen vorgemerkt',
  'result.built.summary': 'Wie ist diese Reihenfolge entstanden?',
  'result.built.categories':
    'Zuerst kommen die Kategorien, in der Reihenfolge des Interesses; innerhalb einer Kategorie '
    + 'entscheiden die Vergleiche über den Platz.',
  'result.built.resolved':
    'Von deinen Antworten festgelegte Plätze: {resolved} von {total}. Die übrigen '
    + 'Einträge ({fallback}) behalten den Platz, den sie in der Wunschliste hatten — die '
    + 'Ersatzreihenfolge, in der Liste gekennzeichnet.',
  'result.built.answers': 'Bisher beantwortete Vergleiche: {count}.',
  'result.built.manual':
    'Von Hand verschoben: {items}. Eine Verschiebung von Hand wird über das gelegt, was die '
    + 'Vergleiche ergeben, deshalb verbessern neue Antworten die Liste um sie herum weiter.',
  'result.built.noManual': 'Es wurde nichts von Hand verschoben.',
  'result.built.complete':
    'Die Sortierung ist abgeschlossen: jedes Paar, das die Reihenfolge brauchte, hat eine Antwort.',
  'result.built.incomplete':
    'Die Sortierung ist nicht abgeschlossen — sie lässt sich jederzeit fortsetzen.',
  'result.legend.sorted': 'durch Vergleiche bestätigt',
  'result.legend.fallback': 'noch in der alten Reihenfolge — nach dem Platz in der Wunschliste',
  'result.legend.manual': 'von Hand verschoben',
  'result.legend.tied': 'gleichauf mit der Zeile darüber',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Hauptaktion',
  'result.transfer.heading': 'Die Reihenfolge zu Steam übertragen',
  'result.transfer.sub': 'Ohne Erweiterungen und ohne zusätzliche Software',
  'result.transfer.step1': 'Die Lesezeichenleiste einblenden',
  'result.transfer.shortcut':
    '<kbd>Strg</kbd> + <kbd>Umschalt</kbd> + <kbd>B</kbd> — in Chrome, Edge und Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Umschalt</kbd> + <kbd>B</kbd> — in Chrome, Edge und Firefox.',
  'result.transfer.shortcutSafari': 'In Safari: Menü „Darstellung“ → „Favoritenleiste einblenden“.',
  'result.transfer.step2': 'Diesen Link auf die Leiste ziehen',
  'result.transfer.step3': 'Deine Wunschliste öffnen und das Lesezeichen drücken',
  'result.transfer.openWishlist': 'Meine Wunschliste öffnen ↗',
  'result.transfer.link': 'Meine Reihenfolge zu Steam übertragen',
  'result.transfer.copy': 'Link kopieren',
  'result.transfer.carries': 'Der Link trägt {items}.',
  'result.transfer.fresh':
    'Der Link wird bei jeder Änderung neu gebaut; was du hier mitnimmst, ist also immer die '
    + 'aktuelle Reihenfolge.',
  'result.transfer.taken':
    'Das ist der Link, den du mitgenommen hast, und er schreibt weiterhin genau die Reihenfolge, '
    + 'die unten steht.',
  'result.transfer.stale':
    'Die Reihenfolge hat sich geändert — ersetze das alte Lesezeichen durch den neuen Link.',
  'result.transfer.copied':
    'Der Link ist kopiert. Lege von Hand ein Lesezeichen an und füge ihn als Adresse ein.',
  'result.transfer.copyFailed':
    'Der Browser hat den Zugriff auf die Zwischenablage verweigert — zieh stattdessen den Link auf '
    + 'die Lesezeichenleiste.',
  'result.transfer.clickToast':
    'Dieser Link ist nicht zum Anklicken hier: zieh ihn auf die Lesezeichenleiste und drücke ihn '
    + 'auf der Steam-Wunschlisten-Seite.',
  'result.transfer.empty':
    'Die Liste ist leer — es gibt noch keine Reihenfolge, die irgendwohin getragen werden könnte.',
  'result.transfer.failed': 'Der Link konnte nicht gebaut werden: {message}',
  'result.transfer.mobile':
    'Auf einem Telefon oder einem Tablet ist das unbequem: ein Bookmarklet muss auf eine '
    + 'Lesezeichenleiste gezogen werden. In einem Desktop-Browser geht die Übertragung leichter.',
  'result.transfer.warnAccount':
    'Die Reihenfolge wird in das Konto geschrieben, mit dem dieser Browser angemeldet ist.',
  'result.transfer.warnNoDelete':
    'Gelöscht wird nichts: die Einträge, die du zum Entfernen vorgemerkt hast, wandern ans Ende '
    + 'der Liste.',
  'result.transfer.warnPriority':
    'Danach hat jeder Eintrag eine Priorität, auch die, die vorher keine hatten.',
  'result.transfer.warnNoBackup':
    'Das Bookmarklet legt keine Sicherung an und prüft das Ergebnis hinterher nicht.',
  'result.transfer.warnReload':
    'Wenn es fertig ist, lade die Steam-Seite neu und stelle die Sortierung auf deine eigene '
    + 'Reihenfolge um.',
  'result.transfer.advanced': 'Brauchst du eine Sicherung und eine automatische Prüfung?',
  'result.transfer.advancedText':
    'Das Userscript liest die Wunschlisten-Seite selbst: es speichert die Reihenfolge, die dort '
    + 'gerade steht, in eine Datei, schreibt die neue und prüft danach, dass sie angekommen ist. '
    + 'Es braucht Tampermonkey, deshalb ist es der längere Weg und nicht der Hauptweg.',
  'result.transfer.advancedStep2':
    'Installiere das Skript „steam-wishlist-import-order.user.js“ aus dem Repository.',
  'result.transfer.advancedStep3':
    'Öffne deine Wunschlisten-Seite und folge der Leiste, die das Skript darauf setzt.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Deine Reihenfolge',
  'result.search': 'Nach Titel oder App ID suchen',
  'result.filterAria': 'Was gezeigt wird',
  'result.filter.all': 'Alle',
  'result.filter.game': 'Spiele',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Eine Zeile lässt sich mit der Maus ziehen oder auswählen und mit <kbd>Strg</kbd> + '
    + '<kbd>↑</kbd> / <kbd>Strg</kbd> + <kbd>↓</kbd> verschieben. Die Verschiebungen werden '
    + 'gespeichert und überstehen ein Neuladen.',
  'result.removed.hint': 'Diese Einträge gehören nicht zur Nummerierung der endgültigen Liste.',
  'result.mark.confirmed': 'Durch Vergleiche bestätigt',
  'result.mark.fallback': 'Noch in der alten Reihenfolge',
  'result.mark.manual': 'Von Hand verschoben',
  'result.mark.tied': 'Gleichauf mit der Zeile darüber',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} in der Kategorie',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Kategorie: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': '{shown} von {total} gezeigt',
  'result.empty.filter': 'Weder der Filter noch die Suche hat einen einzigen Eintrag getroffen.',
  'result.empty.noItems': 'Importiere eine Wunschliste, und das Ergebnis erscheint hier.',
  'result.empty.allRemoved':
    'Jeder Eintrag ist zum Entfernen vorgemerkt — es gibt nichts zu ordnen.',
  'result.move.failed': 'Es ließ sich nicht verschieben: {message}',
  'result.move.announce': '„{title}“ {where}{category}.',
  'result.move.place': 'auf Platz {position}',
  'result.move.newPlace': 'auf einen neuen Platz',
  'result.move.categorySuffix': ', Kategorie: {category}',
  'result.move.categoryToast': '„{title}“ nach „{category}“ verschoben.',
  'result.move.edge':
    'Das ist die {edge} Zeile der Kategorie „{category}“. Die Kategorie ändert man mit der Auswahl '
    + 'in der Zeile selbst.',
  'result.move.edgeFirst': 'erste',
  'result.move.edgeLast': 'letzte',
  'result.category.failed': 'Die Kategorie ließ sich nicht ändern: {message}',
  'result.category.toast': '„{title}“ — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Tier-Liste anzeigen',
  'tier.title': 'Tier-Liste der Wunschliste',
  'tier.lead': 'Innerhalb jeder Kategorie stehen die Spiele der Reihe nach von links nach rechts.',
  'tier.close': 'Schließen',
  'tier.none': 'Ohne Kategorie',
  'tier.empty': 'Hier ist nichts',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Zum Entfernen vorgemerkt. Aus Steam löscht die Anwendung nichts — das bleibt dir überlassen.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Herunterladen oder weitergeben',
  'result.export.hint':
    'Die Dateien entstehen hier im Browser und werden von dir gespeichert — nichts wird hochgeladen.',
  'result.exportJson': 'Reihenfolge als JSON',
  'result.exportCsv': 'Liste als CSV',
  'result.copyText': 'Als Liste kopieren',
  'result.saveState': 'Sicherung des Stands',
  'result.export.empty': 'Es gibt nichts zu exportieren: die Liste ist leer.',
  'result.export.failed': 'Die Datei konnte nicht gebaut werden: {message}',
  'result.export.jsonDone': 'Die endgültige Reihenfolge ist als JSON gespeichert.',
  'result.export.csvDone': 'Die endgültige Liste ist als CSV gespeichert.',
  'result.copy.empty': 'Es gibt nichts zu kopieren: die Liste ist leer.',
  'result.copy.done': 'Die nummerierte Liste ist in die Zwischenablage kopiert.',
  'result.copy.failed':
    'Der Browser hat den Zugriff auf die Zwischenablage verweigert — die Liste wurde stattdessen '
    + 'als Datei gespeichert.',
  'result.resetManual': 'Verschiebungen von Hand zurücksetzen',
  'result.resetManual.none': 'Es gibt keine Verschiebungen von Hand.',
  'result.resetManual.title': 'Die Verschiebungen von Hand zurücksetzen?',
  'result.resetManual.text':
    'Das vergisst {moves} und führt die Liste in die Reihenfolge zurück, die die Vergleiche '
    + 'ergeben. Die Antworten auf die Vergleiche bleiben.',
  'result.resetManual.confirm': 'Verschiebungen zurücksetzen',
  'result.resetManual.done': 'Die Verschiebungen von Hand sind zurückgesetzt.',
  'result.resetAnswers': 'Antworten auf die Vergleiche zurücksetzen',
  'result.resetAnswers.none': 'Es gibt noch keine Antworten.',
  'result.resetAnswers.title': 'Die Antworten auf die Vergleiche zurücksetzen?',
  'result.resetAnswers.text':
    'Das löscht {answers} und lässt die Vergleiche bei null anfangen. Die Liste der Einträge, die '
    + 'Kategorien und die Verschiebungen von Hand bleiben. Das lässt sich nicht rückgängig machen.',
  'result.resetAnswers.confirm': 'Antworten zurücksetzen',
  'result.resetAnswers.done': 'Die Antworten auf die Vergleiche sind zurückgesetzt.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Das ist nicht die Steam-Wunschliste. Öffne store.steampowered.com/wishlist, melde dich an und '
    + 'drücke das Lesezeichen dort. Es wurde nichts gesendet.',
  'bookmarklet.confirm':
    'Gleich wird die Reihenfolge für {items} in die Wunschliste des Kontos geschrieben, mit dem '
    + 'dieser Browser angemeldet ist. Gelöscht wird nichts. Das lässt sich nicht rückgängig '
    + 'machen: nach dem Schreiben hat jeder Eintrag eine Priorität, auch die, die vorher keine '
    + 'hatten, und keine Sicherung bringt das zurück.',
  'bookmarklet.write': 'Reihenfolge schreiben',
  'bookmarklet.cancel': 'Abbrechen',
  'bookmarklet.close': 'Schließen',
  'bookmarklet.sending': 'Die Reihenfolge wird an Steam gesendet…',
  'bookmarklet.done':
    'Steam hat die Reihenfolge angenommen. Lade die Wunschlisten-Seite neu und sieh sie dir an: '
    + 'dieses Bookmarklet liest die Seite nicht, die Prüfung liegt also bei dir.',
  'bookmarklet.unclear':
    'Steam hat geantwortet, aber die Antwort bestätigt nichts und bestreitet nichts. Lade die '
    + 'Wunschlisten-Seite neu und sieh dir die Reihenfolge an, bevor du es wiederholst.',
  'bookmarklet.refused':
    'Steam hat die Reihenfolge abgelehnt und nichts Brauchbares zum Warum gesagt. Lade die '
    + 'Wunschlisten-Seite neu und sieh dir die Reihenfolge an, bevor du es wiederholst.',
  'bookmarklet.badRequest':
    'Steam hat die Anfrage schon an der Tür abgewiesen, mit einer 400 und einem leeren Rumpf — es '
    + 'hat die Reihenfolge nie angesehen, geschrieben wurde also nichts. So antwortet es, wenn der '
    + 'Anfrage etwas fehlt, das es verlangt, und die Antwort benennt nichts. Es sieht aus, als '
    + 'hätte sich der Endpunkt geändert; auf der Projektseite steht, was dann zu tun ist.',
  'bookmarklet.signedOut':
    'Steam hat die Sitzung nicht angenommen — meist ist sie einfach abgelaufen. Melde dich erneut '
    + 'bei Steam an, lade die Wunschliste neu und drücke das Lesezeichen noch einmal. Es wurde '
    + 'nichts geschrieben.',
  'bookmarklet.rateLimited':
    'Steam hat mit „zu viele Anfragen“ geantwortet. Warte ein paar Minuten und drücke das '
    + 'Lesezeichen noch einmal — geändert wurde nichts.',
  'bookmarklet.tooLarge':
    'Die Anfrage ist zu groß für Steam: die ganze Reihenfolge geht in einer Anfrage, und diese hat '
    + 'nicht hineingepasst. Geschrieben wurde nichts. So eine Liste braucht das Userscript, das '
    + 'die Zeilen stattdessen auf der Seite markieren kann.',
  'bookmarklet.serverError':
    'Das Problem liegt bei Steam — es hat mit einem Serverfehler geantwortet. Versuche es in ein '
    + 'paar Minuten noch einmal; geschrieben wurde nichts.',
  'bookmarklet.offline':
    'Die Anfrage hat Steam nie erreicht. Vielleicht ist das Netz ausgefallen, vielleicht hat eine '
    + 'Erweiterung sie blockiert. Geschrieben wurde nichts — prüfe die Verbindung und drücke das '
    + 'Lesezeichen noch einmal.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'Nr.',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Titel',
  'export.csv.category': 'Kategorie',
  'export.csv.kind': 'Art',
  'export.csv.positionInCategory': 'Platz in der Kategorie',
  'export.csv.origin': 'Woher die Reihenfolge kommt',
  'export.csv.wishlistPosition': 'Platz in der Wunschliste',
  'export.csv.url': 'Link',
  'export.origin.manual': 'von Hand',
  'export.origin.comparisons': 'Vergleiche',
  'export.origin.fallback': 'Ersatzreihenfolge',
  'export.kind.game': 'Spiel',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Unbekannt',
};

/* ------------------------------------------------------------- french */

/** @type {Readonly<Record<string, string>>} */
const FR = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} élément',
  'count.items.few': '{count} éléments',
  'count.items.many': '{count} éléments',
  'count.records.one': '{count} enregistrement lu',
  'count.records.few': '{count} enregistrements lus',
  'count.records.many': '{count} enregistrements lus',
  'count.comparisonsMade.one': '{count} comparaison effectuée',
  'count.comparisonsMade.few': '{count} comparaisons effectuées',
  'count.comparisonsMade.many': '{count} comparaisons effectuées',
  'count.comparisonsDone.one': '{count} comparaison faite',
  'count.comparisonsDone.few': '{count} comparaisons faites',
  'count.comparisonsDone.many': '{count} comparaisons faites',
  'count.pairs.one': '{count} paire',
  'count.pairs.few': '{count} paires',
  'count.pairs.many': '{count} paires',
  'count.rows.one': '{count} ligne',
  'count.rows.few': '{count} lignes',
  'count.rows.many': '{count} lignes',
  'count.moves.one': '{count} déplacement',
  'count.moves.few': '{count} déplacements',
  'count.moves.many': '{count} déplacements',
  'count.answers.one': '{count} réponse',
  'count.answers.few': '{count} réponses',
  'count.answers.many': '{count} réponses',
  'count.marked.one': '{count} élément est marqué pour être retiré',
  'count.marked.few': '{count} éléments sont marqués pour être retirés',
  'count.marked.many': '{count} éléments sont marqués pour être retirés',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Un outil local qui met de l’ordre dans une liste de souhaits Steam par comparaisons deux à deux.',
  'a11y.skipToContent': 'Aller au contenu',
  'a11y.progress.import': 'Chargement de la liste de souhaits',
  'a11y.progress.categorize': 'Éléments ayant une catégorie',
  'a11y.progress.compare': 'Comparaisons auxquelles vous avez répondu',
  'nav.aria': 'Étapes',
  'nav.import': 'Liste de souhaits',
  'nav.categorize': 'Catégories',
  'nav.compare': 'Comparaisons',
  'nav.result': 'Résultat',
  'nav.state.done': 'étape terminée',
  'nav.state.current': 'étape en cours',
  'nav.state.locked': 'étape pas encore accessible',
  'settings.title': 'Réglages',
  'settings.covers': 'Charger les jaquettes',
  'settings.language': 'Langue de l’interface',
  'settings.theme': 'Thème',
  'theme.modern': 'Moderne',
  'theme.steam': 'À la Steam',
  'actions.saveState': 'Enregistrer une sauvegarde',
  'actions.loadState': 'Charger une sauvegarde',
  'actions.skipStage': 'Passer les catégories',
  'actions.reset': 'Tout recommencer',
  'privacy.short': 'Fonctionne en local · vos données ne partent vers aucun serveur tiers',
  'privacy.details': 'Détails',
  'privacy.note':
    'Vos données ne quittent jamais le navigateur. La seule requête externe que l’application '
    + 'émet, à quelque moment que ce soit, est le chargement des jaquettes depuis le CDN de Steam '
    + 'par une adresse publique ; elle se coupe avec l’interrupteur « Charger les jaquettes ». '
    + 'L’import direct depuis un compte est demandé par le serveur local qui tourne sur votre '
    + 'machine : il va vers Steam, vers personne d’autre, et seulement quand vous appuyez sur le '
    + 'bouton.',
  'dialog.title': 'Confirmer l’action',
  'dialog.cancel': 'Annuler',
  'dialog.confirm': 'Continuer',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Ouvrir dans Steam ↗',
  'common.openInSteamAria': 'Ouvrir « {title} » dans Steam, dans un nouvel onglet',
  'category.must': 'J’en ai vraiment envie',
  'category.want': 'J’en ai envie',
  'category.maybe': 'Peut-être',
  'category.unlikely': 'Peu probable',
  'category.meh': 'Presque pas d’intérêt',
  'category.remove': 'Retirer de la liste de souhaits',
  'category.none': 'Sans catégorie',
  'kind.game': 'Jeu',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Type inconnu',
  'cover.none': 'Pas de jaquette',
  'cover.off': 'Les jaquettes sont désactivées',
  'cover.failed': 'La jaquette ne s’est pas chargée',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'L’état n’a pas pu être enregistré dans le navigateur. Enregistrez-le dans un fichier pour ne '
    + 'rien perdre.',
  'app.saveFailedReason': 'L’état n’a pas pu être enregistré : {message}',
  'app.loadFailed':
    'L’état enregistré n’a pas pu être lu ({message}). On repart d’une liste vide.',
  'app.covers.on': 'Jaquettes activées : l’application charge les images depuis le CDN de Steam.',
  'app.covers.off': 'Jaquettes désactivées : l’application n’émet plus aucune requête externe.',
  'app.language.changed': 'Langue de l’interface : {language}.',
  'app.theme.changed': 'Thème : {theme}.',
  'app.reset.title': 'Tout recommencer ?',
  'app.reset.text':
    '{items}, les catégories, les réponses aux comparaisons et les déplacements faits à la main '
    + 'seront supprimés. C’est irréversible — si ce travail peut encore servir, enregistrez-le '
    + 'd’abord dans un fichier.',
  'app.reset.confirm': 'Tout supprimer et recommencer',
  'app.reset.done': 'L’état est effacé.',
  'app.state.buildFailed': 'Le fichier d’état n’a pas pu être construit : {message}',
  'app.state.saved': 'L’état est enregistré dans un fichier.',
  'app.saved': 'Progression enregistrée dans ce navigateur',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Un ordre que vous avez vraiment choisi',
  'import.promise': 'Classez les jeux selon l’envie réelle d’y jouer',
  'import.lead':
    'Groupez vite votre liste de souhaits par niveau d’envie, puis choisissez entre deux jeux. '
    + 'Arrêtez quand vous voulez — la progression est toujours enregistrée.',
  'import.step.load': 'Charger la liste de souhaits',
  'import.step.group': 'Grouper par envie',
  'import.step.compare': 'Comparer les jeux',
  'import.step.send': 'Envoyer l’ordre à Steam',
  'import.sessions':
    'Un tri complet peut prendre plusieurs séances. Votre résultat actuel reste toujours disponible.',
  'import.other': 'Autres façons d’importer',
  'import.file.title': 'Fichier JSON',
  'import.file.hint': 'Un export depuis Steam ou un fichier constitué par le userscript.',
  'import.file.button': 'Choisir un fichier…',
  'import.file.none': 'Aucun fichier choisi',
  'import.paste.title': 'Coller du JSON',
  'import.paste.hint': 'Le corps de la réponse de Steam peut être collé tel quel.',
  'import.paste.label': 'JSON de la liste de souhaits',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Importer depuis le texte',
  'import.userscript.title': 'Depuis la page Steam, avec le userscript',
  'import.userscript.hint':
    'Le fichier qu’il télécharge se charge ici, avec « Fichier JSON » ci-dessus.',
  'import.state.title': 'État enregistré',
  'import.state.hint':
    'Un fichier que vous avez enregistré plus tôt avec « Enregistrer une sauvegarde » : les '
    + 'catégories et chaque réponse reviennent.',
  'import.state.button': 'Choisir un fichier d’état…',
  'import.demo.button': 'Essayer avec 20 jeux',
  'import.ready.eyebrow': 'Prêt',
  'import.ready.count.one': '{count} élément chargé',
  'import.ready.count.few': '{count} éléments chargés',
  'import.ready.count.many': '{count} éléments chargés',
  'import.ready.next':
    'Ensuite, répartissez les jeux sur cinq niveaux d’envie. C’est ce qui fait chuter le nombre de '
    + 'comparaisons.',
  'import.ready.start': 'Commencer le groupement',
  'import.ready.again': 'Charger une autre liste de souhaits',
  'import.current':
    'La liste contient pour l’instant {items} : {sorted} avec une catégorie, {plain} sans. '
    + 'Comparaisons effectuées : {comparisons}. Réimporter rafraîchit les entrées et conserve le '
    + 'travail déjà fait.',
  'import.announce': 'Import terminé : {count}. La liste en contient maintenant {total}.',
  'import.source.file': 'Fichier {name}',
  'import.source.pasted': 'Texte collé',
  'import.source.demo': 'Jeu de démonstration',
  'import.report.title': '{source} : {records}',
  'import.report.added': 'ajoutés',
  'import.report.updated': 'mis à jour',
  'import.report.duplicates': 'doublons',
  'import.report.skipped': 'ignorés',
  'import.issue.line': '{where} : {what}',
  'import.issue.entry': 'enregistrement n° {number}',
  'import.issue.key': 'clé « {key} »',
  'import.issue.more': '…et {count} de plus',
  'import.skip.notAnObject':
    'l’enregistrement ne ressemble ni à un élément ni à un App ID',
  'import.skip.missingAppId': 'pas d’App ID',
  'import.skip.invalidAppId': 'l’App ID n’est pas un nombre',
  'import.skip.duplicateInInput': 'l’élément figurait déjà dans ce même fichier',
  'import.error.title': 'L’import a échoué',
  'import.error.emptyInput': 'Il n’y a rien à importer : le fichier ou le champ est vide.',
  'import.error.invalidJson':
    'Ce n’est pas du JSON. On dirait que le texte n’a été copié qu’en partie, ou que quelque chose '
    + 'd’autre s’y est glissé.',
  'import.error.unrecognizedFormat':
    'Le JSON a bien été lu, mais il ne ressemble pas à une liste de souhaits. Il faut un tableau '
    + 'd’éléments, un objet de la forme { "440": { … } } ou une réponse de Steam avec un champ '
    + 'response.items.',
  'import.error.emptyResultTitle': 'L’import est passé, mais la liste est vide',
  'import.error.emptyResultText':
    'Pas un seul élément n’a pu être lu. Vérifiez que le fichier contient bien une liste de souhaits.',
  'import.error.fileRead': 'Le fichier n’a pas pu être lu',
  'import.demo.failedTitle': 'Le jeu de démonstration ne s’est pas chargé',
  'import.demo.failedText':
    '{message}. Le fichier {url} doit se trouver à côté de index.html — et la page doit être '
    + 'ouverte en http(s), pas en file://.',
  'import.demo.httpError': 'le serveur a répondu {status}',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Charger depuis Steam',
  'steam.subtitle': 'Le plus simple pour une liste de souhaits publique',
  'steam.field': 'Votre profil Steam',
  'steam.placeholder': 'steamcommunity.com/id/votrenom, un pseudo ou un SteamID64',
  'steam.run': 'Vérifier et charger',
  'steam.cancel': 'Arrêter',
  'steam.checking': 'Recherche du serveur local…',
  'steam.warning':
    'L’import automatique fonctionne quand les « Détails des jeux » sont publics.',
  'steam.privateAsk': 'Et s’ils sont privés ?',
  'steam.privateHelp':
    'Ouvrez votre profil Steam, choisissez « Modifier le profil », puis « Paramètres de '
    + 'confidentialité », et passez « Détails des jeux » sur Public. Si vous préférez ne pas '
    + 'l’ouvrir, le userscript décrit sous « Autres façons d’importer » lit la page sur laquelle '
    + 'vous êtes connecté et fonctionne avec une liste privée.',
  'steam.settingsLink': 'Ouvrir les réglages Steam ↗',

  'steam.blocked.title': 'Steam n’a pas donné accès à la liste de souhaits',
  'steam.blocked.text':
    'Cela veut dire le plus souvent que les « Détails des jeux » sont privés : la liste de '
    + 'souhaits suit ce seul réglage.',
  'steam.blocked.unavailableTitle': 'La liste de souhaits n’a pas pu être récupérée',
  'steam.blocked.unavailableText':
    'Steam a répondu par une erreur, et c’est par une erreur qu’il répond aussi bien pour une '
    + 'liste qu’il refuse de donner que dans une mauvaise minute à lui. Donc : si les « Détails '
    + 'des jeux » sont privés, les étapes ci-dessous les ouvrent ; s’ils sont déjà publics, '
    + 'attendez quelques minutes et appuyez sur « Vérifier à nouveau ».',
  'steam.blocked.step1': 'Ouvrez votre profil Steam et choisissez « Modifier le profil ».',
  'steam.blocked.step2': 'Ouvrez les « Paramètres de confidentialité ».',
  'steam.blocked.step3': 'Passez « Détails des jeux » sur Public.',
  'steam.blocked.step4': 'Revenez ici et appuyez sur « Vérifier à nouveau ».',
  'steam.blocked.settings': 'Ouvrir les réglages Steam',
  'steam.blocked.again': 'Vérifier à nouveau',
  'steam.blocked.keepPrivate': 'Je ne veux pas la rendre publique',

  'steam.userscript.lead':
    'Récupérez la liste depuis la page Steam elle-même. Le userscript lit la page de liste de '
    + 'souhaits sur laquelle vous êtes connecté, donc le réglage de confidentialité n’entre pas en '
    + 'jeu, et il n’émet aucune requête réseau de son côté.',
  'steam.userscript.step1':
    'Installez Tampermonkey — il existe pour Chrome, Edge, Firefox et Opera.',
  'steam.userscript.step2':
    'Installez le script « steam-wishlist-export.user.js » depuis le dépôt.',
  'steam.userscript.step3':
    'Ouvrez la page de votre liste de souhaits et appuyez sur « Récupérer la liste », puis '
    + '« Télécharger le JSON ».',
  'steam.userscript.step4':
    'Revenez ici et choisissez ce fichier sous « Autres façons d’importer ».',
  'steam.userscript.link': 'Ouvrir le script sur GitHub ↗',

  'steam.offline.title': 'Charger ma liste de souhaits',
  'steam.offline.subtitle': 'Choisissez la voie la plus simple',
  'steam.offline.text':
    'Votre navigateur n’autorise pas cette page à lire Steam directement, et il n’y a pas de '
    + 'serveur local derrière elle pour le demander à sa place. Vos données restent malgré tout '
    + 'les vôtres.',
  'steam.offline.instructions': 'Voir la marche à suivre',
  'steam.offline.userscript.badge': 'Fonctionne avec les listes privées',
  'steam.offline.userscript.title': 'Importer depuis votre page Steam',
  'steam.offline.local.title': 'Lancer la version locale',
  'steam.offline.local.text': 'Un lien vers un profil public suffit alors.',
  'steam.offline.local.download': 'Télécharger',
  'steam.offline.local.step1': 'Installez Node.js 20 ou plus récent.',
  'steam.offline.local.step2': 'Décompressez l’archive où vous voulez.',
  'steam.offline.local.step3':
    'Lancez « start.bat » sous Windows, ou « node server.js » sous macOS et Linux.',
  'steam.offline.local.step4': 'Ouvrez http://localhost:8080/ dans le navigateur.',
  'steam.step.account': 'Recherche du compte…',
  'steam.step.wishlist': 'Demande de la liste de souhaits à Steam…',
  'steam.step.titles': 'Titres : {done} sur {total}',
  'steam.step.waiting':
    'Steam limite les requêtes. Attente de {seconds} s avant de redemander…',
  'steam.note':
    'Un titre, une requête : une longue liste prend donc plusieurs minutes. Tout ce qui est déjà '
    + 'arrivé est enregistré — s’arrêter ne perd rien.',
  'steam.done.title': 'La liste de souhaits est arrivée',
  'steam.done.titlesTitle': 'Les titres sont récupérés',
  'steam.done.titlesText': '{items} dans la liste, dont {titles} avec un titre venu de Steam.',
  'steam.done.text':
    'Compte Steam {account} : {items} dans la liste, dont {titles} avec un titre venu de Steam.',
  'steam.done.missing.one':
    'Steam n’a pas donné {count} titre : cet élément est affiché par son App ID.',
  'steam.done.missing.few':
    'Steam n’a pas donné {count} titres : ces éléments sont affichés par leur App ID.',
  'steam.done.missing.many':
    'Steam n’a pas donné {count} titres : ces éléments sont affichés par leur App ID.',
  'steam.done.throttled':
    'Steam a cessé de répondre au titre {done} sur {total} : il limite les requêtes. Tout ce qui a '
    + 'été récupéré est déjà dans la liste — réessayez le bouton dans quelques minutes.',
  'steam.missing.text.one':
    '{count} élément de la liste est encore affiché par un App ID, pas par un titre.',
  'steam.missing.text.few':
    '{count} éléments de la liste sont encore affichés par un App ID, pas par un titre.',
  'steam.missing.text.many':
    '{count} éléments de la liste sont encore affichés par un App ID, pas par un titre.',
  'steam.missing.run': 'Récupérer les titres manquants',
  'steam.cancelled': 'Arrêté. Tout ce qui était arrivé jusque-là est resté dans la liste.',
  'steam.error.title': 'L’import depuis Steam a échoué',
  'steam.error.emptyInput':
    'Le champ est vide : saisissez un SteamID64, un nom de profil ou un lien vers le profil.',
  'steam.error.invalidAccount':
    'Ce n’est ni un SteamID64 (17 chiffres), ni un nom de profil Steam, ni un lien vers un profil '
    + 'sur steamcommunity.com.',
  'steam.error.accountNotFound':
    'Steam ne connaît pas ce compte. Vérifiez l’orthographe — ou ouvrez votre profil dans le '
    + 'navigateur et copiez l’adresse de la page.',
  'steam.error.wishlistEmpty':
    'La liste de souhaits de ce compte est vide : il n’y a rien à trier pour l’instant.',
  'steam.error.rateLimited':
    'Steam limite les requêtes : il en est venu trop depuis cette adresse. Il relâche au bout de '
    + 'quelques minutes — réessayez à ce moment-là.',
  'steam.error.network':
    'Steam n’a pas pu être joint. Vérifiez la connexion, et que le serveur local tourne toujours.',
  'steam.error.steamError':
    'Steam a répondu quelque chose d’inattendu. C’est en général Steam lui-même qui a un passage à '
    + 'vide ; réessayez un peu plus tard.',
  'steam.error.notLocal': 'Le serveur local ne répond qu’aux requêtes venant de localhost.',
  'steam.error.unknown': 'Échec inattendu : {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'Le fichier d’état ne se lit pas comme du JSON.',
  'state.error.foreignState':
    'C’est le JSON d’une autre application : il ne porte aucune signature de Steam Wishlist Sorter.',
  'state.error.unsupportedVersion':
    'Le fichier a été enregistré par une autre version du format et n’est pas pris en charge.',
  'state.error.invalidState': 'Le fichier ressemble à un état, mais il ne contient aucune session.',
  'state.error.writeFailed': 'L’état a été lu, mais le navigateur a refusé de l’enregistrer.',
  'state.confirm.title': 'Charger l’état par-dessus l’actuel ?',
  'state.confirm.text':
    'La liste contient pour l’instant {items} et {comparisons}. Le fichier remplace tout cela en '
    + 'bloc : la liste, les catégories, les réponses et les déplacements faits à la main. C’est '
    + 'irréversible.',
  'state.confirm.confirm': 'Remplacer l’état actuel',
  'state.confirm.cancelled': 'L’import de l’état a été annulé — rien n’a changé.',
  'state.restored.title': 'L’état est restauré',
  'state.restored.items': 'éléments',
  'state.restored.comparisons': 'comparaisons effectuées',
  'state.restored.moves': 'déplacements à la main',
  'state.restored.toast': 'L’état est restauré depuis le fichier.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': 'Étape 2 sur 4',
  'categorize.heading': 'Quelle envie avez-vous de ce jeu ?',
  'categorize.hint': 'N’y réfléchissez pas trop — la catégorie pourra changer plus tard.',
  'categorize.buttonsAria': 'Niveaux d’envie',
  'categorize.more': 'Plus d’envie',
  'categorize.less': 'Moins d’envie',
  'categorize.or': 'ou',
  'categorize.counter': '{index} sur {total}',
  'categorize.back': '← Précédent',
  'categorize.defer': 'Remettre à plus tard <kbd>Espace</kbd>',
  'categorize.done': 'Chaque élément a une catégorie.',
  'categorize.toCompare': 'Aller aux comparaisons',
  'categorize.empty': 'La liste est vide : importez d’abord une liste de souhaits.',
  'categorize.toImport': 'Aller à l’import',
  'categorize.position': 'Place dans votre liste de souhaits : {position}',
  'categorize.current': 'Actuellement : {category}. Choisissez une autre catégorie pour en changer.',
  'categorize.legendLeft': 'encore {items}',
  'categorize.firstItem': 'C’est le premier élément de la liste.',
  'categorize.noneLeft': 'Il ne reste plus d’élément sans catégorie.',
  'categorize.postponed': '{title} est remis à plus tard, on y revient à la fin du tour.',
  'categorize.announce': '{title} : {category}',
  'categorize.skipTitle': 'Passer les catégories ?',
  'categorize.skipText':
    'Chaque élément reste sans catégorie, et les comparaisons portent alors sur toute la liste '
    + 'comme sur un seul groupe — bien plus de questions que n’en auraient demandé cinq groupes '
    + 'plus petits. Rien n’est perdu : vous pouvez revenir à cette étape quand vous voulez.',
  'categorize.skipConfirm': 'Passer et aller aux comparaisons',
  'categorize.skipDone': 'L’étape est passée : les comparaisons portent sur toute la liste.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Étape 3 sur 4',
  'compare.heading': 'De quel jeu avez-vous le plus envie ?',
  'compare.headingDone': 'Les comparaisons sont terminées',
  'compare.hint':
    'Choisissez vite. Une paire sur laquelle vous bloquez peut être remise à plus tard.',
  'compare.progress': 'Catégorie « {category} » · {made} · encore {left} environ',
  'compare.deferred': 'en attente : {pairs}',
  'compare.preferA': 'J’en ai plus envie <kbd>A</kbd>',
  'compare.preferB': 'J’en ai plus envie <kbd>D</kbd>',
  'compare.drop': 'Plus envie du tout',
  'compare.or': 'ou',
  'compare.tie': 'À peu près pareil <kbd>S</kbd>',
  'compare.defer': 'Je n’arrive pas à choisir <kbd>Espace</kbd>',
  'compare.undo': 'Annuler <kbd>Retour arrière</kbd>',
  'compare.finish': 'Arrêter pour aujourd’hui',
  'compare.finishNote':
    'La progression est enregistrée — votre résultat actuel est prêt à l’emploi.',
  'compare.done': 'Il n’y a plus rien à comparer : l’ordre est fixé.',
  'compare.empty': 'Il n’y a rien à comparer : la liste est vide.',
  'compare.toResult': 'Voir le résultat',
  'compare.toImport': 'Aller à l’import',
  'compare.banner.allDeferred':
    'Toutes les autres questions sont remises à plus tard ({count}), et rien n’avance sans une '
    + 'réponse à celle-ci. « À peu près pareil » est une réponse aussi, et le tri s’en sert pour '
    + 'continuer.',
  'compare.banner.forced': 'Cette paire est nécessaire pour avancer.',
  'compare.rejected': 'La réponse n’a pas été acceptée : {message}',
  'compare.dropped': '« {title} » est sur la liste des jeux à retirer de la liste de souhaits.',
  'compare.nothingToUndo': 'Il n’y a rien à annuler.',
  'compare.undone': 'La dernière réponse est annulée.',
  'compare.chosen': 'Choisi : {title}.',
  'compare.tied': '{a} et {b} — à peu près pareil.',
  'compare.postponed': 'La paire est remise à plus tard.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Compris',
  'onboarding.categorize.title': 'D’abord, groupez grossièrement les jeux par envie',
  'onboarding.categorize.lead':
    'Vous verrez un jeu à la fois et le placerez quelque part sur une échelle de cinq niveaux — ou '
    + 'directement sur la liste des jeux à retirer de la liste de souhaits.',
  'onboarding.categorize.why':
    'C’est ce qui rend le tri court : les jeux ne sont comparés qu’à l’intérieur de leur propre '
    + 'groupe, donc une répartition grossière maintenant épargne des centaines de questions plus tard.',
  'onboarding.categorize.later':
    'N’y réfléchissez pas trop. Une catégorie peut changer à tout moment — revenez au jeu avec '
    + '« Précédent », ou changez-la sur l’écran du résultat.',
  'onboarding.compare.title': 'Maintenant, choisissez entre deux jeux',
  'onboarding.compare.lead':
    'Deux jeux à la fois, tous les deux du même groupe. Prenez celui dont vous avez le plus envie '
    + '— les touches A et D, ou les flèches.',
  'onboarding.compare.tie':
    'Si les deux vous tentent autant, dites « À peu près pareil » : c’est une réponse aussi, et le '
    + 'tri s’en sert.',
  'onboarding.compare.defer':
    'Une paire difficile peut être remise à plus tard avec Espace ; elle revient une fois les '
    + 'faciles réglées.',
  'onboarding.compare.stop':
    'Arrêtez quand vous voulez. Chaque réponse est enregistrée, et le résultat est consultable à '
    + 'tout moment — fini ou non.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Étape 4 sur 4',
  'result.head.usable': 'Le résultat est déjà utilisable',
  'result.head.ready': 'Votre ordre est prêt',
  'result.head.empty': 'Il n’y a encore rien à ordonner',
  'result.lead.usable':
    'Transférez-le vers Steam maintenant, ou améliorez-le avec d’autres réponses.',
  'result.lead.ready': 'Chaque place y est fixée par vos propres réponses.',
  'result.lead.empty': 'Importez une liste de souhaits, et l’ordre apparaîtra ici.',
  'result.continue': 'Continuer les comparaisons',
  'result.complete': 'Le tri est terminé',
  'result.toImport': 'Aller à l’import',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Prêt à l’emploi',
  'result.summary.headline': 'Vos réponses fixent la place de {items}',
  'result.summary.headlineAll': 'Toute la liste suit vos réponses',
  'result.summary.headlineNone': 'Aucune place n’est encore fixée par une réponse',
  'result.summary.rest':
    'Le reste garde l’ordre qu’il avait dans votre liste de souhaits ; la liste ci-dessous dit '
    + 'lesquels.',
  'result.summary.choice':
    'Transférez cet ordre vers Steam maintenant, ou continuez à comparer — chaque réponse l’améliore.',
  'result.summary.done': 'Il n’y a plus rien à comparer. Transférez l’ordre vers Steam.',
  'result.summary.empty': 'La liste est vide : il n’y a encore rien à montrer.',
  'result.summary.allRemoved': '{marked}, il ne reste donc rien à ordonner.',
  'result.stats.total': 'dans la liste',
  'result.stats.confirmed': 'confirmés',
  'result.stats.removed': 'à retirer',
  'result.built.summary': 'Comment cet ordre a-t-il été construit ?',
  'result.built.categories':
    'Les catégories viennent d’abord, dans l’ordre de l’envie ; à l’intérieur d’une catégorie, la '
    + 'place est décidée par les comparaisons.',
  'result.built.resolved':
    'Places fixées par vos réponses : {resolved} sur {total}. Les autres ({fallback}) gardent '
    + 'la place qu’elles avaient dans la liste de souhaits — l’ordre de repli, signalé dans la '
    + 'liste.',
  'result.built.answers': 'Comparaisons réglées jusqu’ici : {count}.',
  'result.built.manual':
    'À la main, vous avez déplacé {items}. Un déplacement fait à la main est rejoué par-dessus ce '
    + 'que produisent les comparaisons, si bien que les nouvelles réponses continuent d’améliorer '
    + 'la liste autour de lui.',
  'result.built.noManual': 'Rien n’a été déplacé à la main.',
  'result.built.complete':
    'Le tri est terminé : chaque paire dont l’ordre avait besoin a une réponse.',
  'result.built.incomplete': 'Le tri n’est pas terminé — il peut reprendre à tout moment.',
  'result.legend.sorted': 'confirmé par les comparaisons',
  'result.legend.fallback': 'encore dans l’ancien ordre — d’après la place dans la liste de souhaits',
  'result.legend.manual': 'déplacé à la main',
  'result.legend.tied': 'à égalité avec la ligne au-dessus',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Action principale',
  'result.transfer.heading': 'Transférer l’ordre vers Steam',
  'result.transfer.sub': 'Sans extension ni logiciel supplémentaire',
  'result.transfer.step1': 'Afficher la barre de favoris',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Maj</kbd> + <kbd>B</kbd> — dans Chrome, Edge et Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Maj</kbd> + <kbd>B</kbd> — dans Chrome, Edge et Firefox.',
  'result.transfer.shortcutSafari':
    'Dans Safari : menu « Présentation » → « Afficher la barre des favoris ».',
  'result.transfer.step2': 'Glisser ce lien sur la barre',
  'result.transfer.step3': 'Ouvrir votre liste de souhaits et appuyer sur le favori',
  'result.transfer.openWishlist': 'Ouvrir ma liste de souhaits ↗',
  'result.transfer.link': 'Transférer mon ordre vers Steam',
  'result.transfer.copy': 'Copier le lien',
  'result.transfer.carries': 'Le lien porte {items}.',
  'result.transfer.fresh':
    'Le lien est reconstruit à chaque changement : ce que vous emportez d’ici est donc toujours '
    + 'l’ordre actuel.',
  'result.transfer.taken':
    'C’est le lien que vous avez emporté, et il écrit toujours exactement l’ordre affiché '
    + 'ci-dessous.',
  'result.transfer.stale':
    'L’ordre a changé — remplacez l’ancien favori par le lien mis à jour.',
  'result.transfer.copied':
    'Le lien est copié. Créez un favori à la main et collez-le comme adresse.',
  'result.transfer.copyFailed':
    'Le navigateur a refusé l’accès au presse-papiers — glissez plutôt le lien sur la barre de '
    + 'favoris.',
  'result.transfer.clickToast':
    'Ce lien n’est pas fait pour être cliqué ici : glissez-le sur la barre de favoris et appuyez '
    + 'dessus sur la page de la liste de souhaits Steam.',
  'result.transfer.empty':
    'La liste est vide — il n’y a pas encore d’ordre à emporter où que ce soit.',
  'result.transfer.failed': 'Le lien n’a pas pu être construit : {message}',
  'result.transfer.mobile':
    'Sur un téléphone ou une tablette, c’est peu commode : un bookmarklet doit être glissé sur une '
    + 'barre de favoris. Le transfert est plus facile dans un navigateur de bureau.',
  'result.transfer.warnAccount':
    'L’ordre est écrit dans le compte auquel ce navigateur est connecté.',
  'result.transfer.warnNoDelete':
    'Rien n’est supprimé : les éléments que vous avez marqués pour être retirés vont à la fin de '
    + 'la liste.',
  'result.transfer.warnPriority':
    'Ensuite, chaque élément a une priorité, y compris ceux qui n’en avaient aucune.',
  'result.transfer.warnNoBackup':
    'Le bookmarklet ne fait aucune sauvegarde et ne vérifie pas le résultat après coup.',
  'result.transfer.warnReload':
    'Quand c’est fini, rechargez la page Steam et passez le tri sur votre propre ordre.',
  'result.transfer.advanced':
    'Il vous faut une sauvegarde et une vérification automatique ?',
  'result.transfer.advancedText':
    'Le userscript lit la page de la liste de souhaits lui-même : il enregistre dans un fichier '
    + 'l’ordre qui s’y trouve, écrit le nouveau, puis vérifie qu’il est bien arrivé. Il demande '
    + 'Tampermonkey, c’est pourquoi c’est la voie la plus longue et non la voie principale.',
  'result.transfer.advancedStep2':
    'Installez le script « steam-wishlist-import-order.user.js » depuis le dépôt.',
  'result.transfer.advancedStep3':
    'Ouvrez la page de votre liste de souhaits et suivez le panneau que le script y ajoute.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Votre ordre',
  'result.search': 'Rechercher par titre ou App ID',
  'result.filterAria': 'Ce qui est affiché',
  'result.filter.all': 'Tout',
  'result.filter.game': 'Jeux',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Une ligne se glisse à la souris, ou se sélectionne et se déplace avec <kbd>Ctrl</kbd> + '
    + '<kbd>↑</kbd> / <kbd>Ctrl</kbd> + <kbd>↓</kbd>. Les déplacements sont enregistrés et '
    + 'survivent à un rechargement.',
  'result.removed.hint': 'Ces éléments ne font pas partie de la numérotation de la liste finale.',
  'result.mark.confirmed': 'Confirmé par les comparaisons',
  'result.mark.fallback': 'Encore dans l’ancien ordre',
  'result.mark.manual': 'Déplacé à la main',
  'result.mark.tied': 'À égalité avec la ligne au-dessus',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} dans la catégorie',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Catégorie : {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': 'affichage : {shown} sur {total}',
  'result.empty.filter': 'Ni le filtre ni la recherche n’ont trouvé le moindre élément.',
  'result.empty.noItems': 'Importez une liste de souhaits, et le résultat apparaîtra ici.',
  'result.empty.allRemoved':
    'Chaque élément est marqué pour être retiré — il n’y a rien à ordonner.',
  'result.move.failed': 'Le déplacement a échoué : {message}',
  'result.move.announce': '« {title} » {where}{category}.',
  'result.move.place': 'à la place {position}',
  'result.move.newPlace': 'à une nouvelle place',
  'result.move.categorySuffix': ', catégorie : {category}',
  'result.move.categoryToast': '« {title} » déplacé dans « {category} ».',
  'result.move.edge':
    'C’est la {edge} ligne de la catégorie « {category} ». La catégorie se change avec le '
    + 'sélecteur dans la ligne elle-même.',
  'result.move.edgeFirst': 'première',
  'result.move.edgeLast': 'dernière',
  'result.category.failed': 'La catégorie n’a pas pu être changée : {message}',
  'result.category.toast': '« {title} » — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Afficher la tier list',
  'tier.title': 'Tier list de la liste de souhaits',
  'tier.lead': 'Dans chaque catégorie, les jeux sont classés de gauche à droite.',
  'tier.close': 'Fermer',
  'tier.none': 'Sans catégorie',
  'tier.empty': 'Rien ici',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Marqué pour être retiré. L’application ne supprime rien de Steam — cela vous revient.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Télécharger ou partager',
  'result.export.hint':
    'Les fichiers sont construits ici, dans le navigateur, et enregistrés par vous — rien n’est '
    + 'envoyé nulle part.',
  'result.exportJson': 'Ordre en JSON',
  'result.exportCsv': 'Liste en CSV',
  'result.copyText': 'Copier comme liste',
  'result.saveState': 'Sauvegarde de l’état',
  'result.export.empty': 'Il n’y a rien à exporter : la liste est vide.',
  'result.export.failed': 'Le fichier n’a pas pu être construit : {message}',
  'result.export.jsonDone': 'L’ordre final est enregistré en JSON.',
  'result.export.csvDone': 'La liste finale est enregistrée en CSV.',
  'result.copy.empty': 'Il n’y a rien à copier : la liste est vide.',
  'result.copy.done': 'La liste numérotée est copiée dans le presse-papiers.',
  'result.copy.failed':
    'Le navigateur a refusé l’accès au presse-papiers — la liste a été enregistrée dans un fichier '
    + 'à la place.',
  'result.resetManual': 'Réinitialiser les déplacements à la main',
  'result.resetManual.none': 'Il n’y a aucun déplacement à la main.',
  'result.resetManual.title': 'Réinitialiser les déplacements à la main ?',
  'result.resetManual.text':
    'Cela efface {moves} et ramène la liste à l’ordre que donnent les comparaisons. Les réponses '
    + 'aux comparaisons restent.',
  'result.resetManual.confirm': 'Réinitialiser les déplacements',
  'result.resetManual.done': 'Les déplacements à la main sont réinitialisés.',
  'result.resetAnswers': 'Réinitialiser les réponses aux comparaisons',
  'result.resetAnswers.none': 'Il n’y a encore aucune réponse.',
  'result.resetAnswers.title': 'Réinitialiser les réponses aux comparaisons ?',
  'result.resetAnswers.text':
    'Cela supprime {answers} et fait repartir les comparaisons de zéro. La liste des éléments, les '
    + 'catégories et les déplacements à la main restent. C’est irréversible.',
  'result.resetAnswers.confirm': 'Réinitialiser les réponses',
  'result.resetAnswers.done': 'Les réponses aux comparaisons sont réinitialisées.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Ce n’est pas la liste de souhaits Steam. Ouvrez store.steampowered.com/wishlist, connectez-vous, '
    + 'et appuyez sur le favori là-bas. Rien n’a été envoyé.',
  'bookmarklet.confirm':
    'L’ordre de {items} va être écrit dans la liste de souhaits du compte auquel ce navigateur est '
    + 'connecté. Rien n’est supprimé. C’est irréversible : après l’écriture, chaque entrée a une '
    + 'priorité, y compris celles qui n’en avaient aucune, et aucune sauvegarde ne ramène cela.',
  'bookmarklet.write': 'Écrire l’ordre',
  'bookmarklet.cancel': 'Annuler',
  'bookmarklet.close': 'Fermer',
  'bookmarklet.sending': 'Envoi de l’ordre à Steam…',
  'bookmarklet.done':
    'Steam a accepté l’ordre. Rechargez la page de la liste de souhaits et regardez-la : ce '
    + 'bookmarklet ne lit pas la page, la vérification vous revient donc.',
  'bookmarklet.unclear':
    'Steam a répondu, mais la réponse ne confirme ni ne dément rien. Rechargez la page de la liste '
    + 'de souhaits et regardez l’ordre avant de recommencer.',
  'bookmarklet.refused':
    'Steam a refusé l’ordre sans rien dire d’utile sur le pourquoi. Rechargez la page de la liste '
    + 'de souhaits et regardez l’ordre avant de recommencer.',
  'bookmarklet.badRequest':
    'Steam a écarté la requête dès la porte, avec un 400 et un corps vide — il n’a jamais regardé '
    + 'l’ordre, rien n’a donc été écrit. C’est ce qu’il répond quand il manque à la requête quelque '
    + 'chose qu’il exige, et la réponse ne nomme rien. On dirait que le point d’entrée a changé ; '
    + 'la page du projet dit quoi faire dans ce cas.',
  'bookmarklet.signedOut':
    'Steam n’a pas accepté la session — le plus souvent elle a simplement expiré. Reconnectez-vous '
    + 'à Steam, rechargez la liste de souhaits et appuyez sur le favori encore une fois. Rien n’a '
    + 'été écrit.',
  'bookmarklet.rateLimited':
    'Steam a répondu « trop de requêtes ». Attendez deux ou trois minutes et appuyez de nouveau '
    + 'sur le favori — rien n’a été changé.',
  'bookmarklet.tooLarge':
    'La requête est trop grosse pour Steam : tout l’ordre part en une seule requête, et celle-ci '
    + 'n’est pas passée. Rien n’a été écrit. Une liste pareille demande le userscript, qui peut '
    + 'marquer les lignes sur la page à la place.',
  'bookmarklet.serverError':
    'L’ennui est du côté de Steam — il a répondu par une erreur serveur. Réessayez dans quelques '
    + 'minutes ; rien n’a été écrit.',
  'bookmarklet.offline':
    'La requête n’a jamais atteint Steam. Le réseau est peut-être tombé, ou une extension l’a '
    + 'bloquée. Rien n’a été écrit — vérifiez la connexion et appuyez de nouveau sur le favori.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'N°',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Titre',
  'export.csv.category': 'Catégorie',
  'export.csv.kind': 'Type',
  'export.csv.positionInCategory': 'Place dans la catégorie',
  'export.csv.origin': 'D’où vient l’ordre',
  'export.csv.wishlistPosition': 'Place dans la liste de souhaits',
  'export.csv.url': 'Lien',
  'export.origin.manual': 'à la main',
  'export.origin.comparisons': 'comparaisons',
  'export.origin.fallback': 'ordre de repli',
  'export.kind.game': 'Jeu',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Inconnu',
};

/* ------------------------------------------------------------ spanish */

/** @type {Readonly<Record<string, string>>} */
const ES = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} elemento',
  'count.items.few': '{count} elementos',
  'count.items.many': '{count} elementos',
  'count.records.one': '{count} registro leído',
  'count.records.few': '{count} registros leídos',
  'count.records.many': '{count} registros leídos',
  'count.comparisonsMade.one': '{count} comparación realizada',
  'count.comparisonsMade.few': '{count} comparaciones realizadas',
  'count.comparisonsMade.many': '{count} comparaciones realizadas',
  'count.comparisonsDone.one': '{count} comparación hecha',
  'count.comparisonsDone.few': '{count} comparaciones hechas',
  'count.comparisonsDone.many': '{count} comparaciones hechas',
  'count.pairs.one': '{count} par',
  'count.pairs.few': '{count} pares',
  'count.pairs.many': '{count} pares',
  'count.rows.one': '{count} fila',
  'count.rows.few': '{count} filas',
  'count.rows.many': '{count} filas',
  'count.moves.one': '{count} movimiento',
  'count.moves.few': '{count} movimientos',
  'count.moves.many': '{count} movimientos',
  'count.answers.one': '{count} respuesta',
  'count.answers.few': '{count} respuestas',
  'count.answers.many': '{count} respuestas',
  'count.marked.one': '{count} elemento está marcado para quitarlo de la lista de deseados',
  'count.marked.few': '{count} elementos están marcados para quitarlos de la lista de deseados',
  'count.marked.many': '{count} elementos están marcados para quitarlos de la lista de deseados',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Una herramienta local que pone en orden una lista de deseados de Steam mediante '
    + 'comparaciones de dos en dos.',
  'a11y.skipToContent': 'Ir al contenido',
  'a11y.progress.import': 'Carga de la lista de deseados',
  'a11y.progress.categorize': 'Elementos con categoría',
  'a11y.progress.compare': 'Comparaciones respondidas',
  'nav.aria': 'Etapas',
  'nav.import': 'Lista de deseados',
  'nav.categorize': 'Categorías',
  'nav.compare': 'Comparaciones',
  'nav.result': 'Resultado',
  'nav.state.done': 'etapa terminada',
  'nav.state.current': 'etapa actual',
  'nav.state.locked': 'etapa todavía no disponible',
  'settings.title': 'Ajustes',
  'settings.covers': 'Cargar las portadas',
  'settings.language': 'Idioma de la interfaz',
  'settings.theme': 'Tema',
  'theme.modern': 'Moderno',
  'theme.steam': 'Al estilo de Steam',
  'actions.saveState': 'Guardar una copia',
  'actions.loadState': 'Cargar una copia',
  'actions.skipStage': 'Saltar las categorías',
  'actions.reset': 'Empezar de nuevo',
  'privacy.short': 'Funciona en local · tus datos no se envían a servidores de terceros',
  'privacy.details': 'Detalles',
  'privacy.note':
    'Tus datos nunca salen del navegador. La única petición externa que la aplicación hace, en '
    + 'cualquier momento, es la carga de las portadas de los juegos desde el CDN de Steam por una '
    + 'dirección pública; se corta con el interruptor «Cargar las portadas». La importación '
    + 'directa desde una cuenta la pide el servidor local que corre en tu propia máquina: va a '
    + 'Steam, a nadie más, y solo cuando pulsas el botón.',
  'dialog.title': 'Confirmar la acción',
  'dialog.cancel': 'Cancelar',
  'dialog.confirm': 'Continuar',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Abrir en Steam ↗',
  'common.openInSteamAria': 'Abrir «{title}» en Steam, en una pestaña nueva',
  'category.must': 'Lo quiero de verdad',
  'category.want': 'Lo quiero',
  'category.maybe': 'Quizá',
  'category.unlikely': 'Poco probable',
  'category.meh': 'Casi no me interesa',
  'category.remove': 'Quitar de la lista de deseados',
  'category.none': 'Sin categoría',
  'kind.game': 'Juego',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Tipo desconocido',
  'cover.none': 'Sin portada',
  'cover.off': 'Las portadas están desactivadas',
  'cover.failed': 'La portada no se cargó',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'El estado no se pudo guardar en el navegador. Guárdalo en un archivo para no perder nada.',
  'app.saveFailedReason': 'El estado no se pudo guardar: {message}',
  'app.loadFailed':
    'El estado guardado no se pudo leer ({message}). Se empieza con una lista vacía.',
  'app.covers.on': 'Portadas activadas: la aplicación carga las imágenes desde el CDN de Steam.',
  'app.covers.off': 'Portadas desactivadas: la aplicación no hace ninguna petición externa.',
  'app.language.changed': 'Idioma de la interfaz: {language}.',
  'app.theme.changed': 'Tema: {theme}.',
  'app.reset.title': '¿Empezar de nuevo?',
  'app.reset.text':
    'Se borrará todo esto: {items}, las categorías, las respuestas de las comparaciones y los '
    + 'movimientos hechos a mano. No se puede deshacer: si el trabajo todavía puede servir, '
    + 'guárdalo antes en un archivo.',
  'app.reset.confirm': 'Borrarlo todo y empezar de nuevo',
  'app.reset.done': 'El estado está borrado.',
  'app.state.buildFailed': 'El archivo de estado no se pudo construir: {message}',
  'app.state.saved': 'El estado está guardado en un archivo.',
  'app.saved': 'Progreso guardado en este navegador',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Un orden que has elegido de verdad',
  'import.promise': 'Ordena los juegos según las ganas reales de jugarlos',
  'import.lead':
    'Agrupa rápido tu lista de deseados por interés y luego elige entre dos juegos. Para cuando '
    + 'quieras: el progreso siempre se guarda.',
  'import.step.load': 'Cargar la lista de deseados',
  'import.step.group': 'Agrupar por interés',
  'import.step.compare': 'Comparar juegos',
  'import.step.send': 'Enviar el orden a Steam',
  'import.sessions':
    'Una ordenación completa puede llevar varias sesiones. Tu resultado actual siempre está '
    + 'disponible.',
  'import.other': 'Otras formas de importar',
  'import.file.title': 'Archivo JSON',
  'import.file.hint': 'Una exportación de Steam o un archivo reunido por el userscript.',
  'import.file.button': 'Elegir un archivo…',
  'import.file.none': 'Ningún archivo elegido',
  'import.paste.title': 'Pegar JSON',
  'import.paste.hint': 'El cuerpo de la respuesta de Steam se puede pegar tal cual.',
  'import.paste.label': 'JSON de la lista de deseados',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Importar desde el texto',
  'import.userscript.title': 'Desde la página de Steam, con el userscript',
  'import.userscript.hint': 'El archivo que descarga se carga aquí, con «Archivo JSON» de arriba.',
  'import.state.title': 'Estado guardado',
  'import.state.hint':
    'Un archivo que guardaste antes con «Guardar una copia»: vuelven las categorías y todas las '
    + 'respuestas.',
  'import.state.button': 'Elegir un archivo de estado…',
  'import.demo.button': 'Probar con 20 juegos',
  'import.ready.eyebrow': 'Listo',
  'import.ready.count.one': '{count} elemento cargado',
  'import.ready.count.few': '{count} elementos cargados',
  'import.ready.count.many': '{count} elementos cargados',
  'import.ready.next':
    'Ahora reparte los juegos en cinco niveles de interés. Eso es lo que hace bajar el número de '
    + 'comparaciones.',
  'import.ready.start': 'Empezar a agrupar',
  'import.ready.again': 'Cargar otra lista de deseados',
  'import.current':
    'Ahora mismo la lista contiene {items}: {sorted} con categoría y {plain} sin ella. '
    + 'Comparaciones realizadas: {comparisons}. Volver a importar actualiza las entradas y '
    + 'conserva el trabajo ya hecho.',
  'import.announce': 'Elementos importados: {count}. Ahora la lista contiene {total}.',
  'import.source.file': 'Archivo {name}',
  'import.source.pasted': 'Texto pegado',
  'import.source.demo': 'Conjunto de demostración',
  'import.report.title': '{source}: {records}',
  'import.report.added': 'añadidos',
  'import.report.updated': 'actualizados',
  'import.report.duplicates': 'duplicados',
  'import.report.skipped': 'omitidos',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'registro n.º {number}',
  'import.issue.key': 'clave «{key}»',
  'import.issue.more': '…y {count} más',
  'import.skip.notAnObject': 'el registro no parece ni un elemento ni un App ID',
  'import.skip.missingAppId': 'sin App ID',
  'import.skip.invalidAppId': 'el App ID no es un número',
  'import.skip.duplicateInInput': 'el elemento ya aparecía en este mismo archivo',
  'import.error.title': 'La importación falló',
  'import.error.emptyInput': 'No hay nada que importar: el archivo o el campo está vacío.',
  'import.error.invalidJson':
    'Esto no es JSON. Parece que el texto se copió solo en parte, o que se coló algo más.',
  'import.error.unrecognizedFormat':
    'El JSON se leyó bien, pero no parece una lista de deseados. Hace falta un arreglo de '
    + 'elementos, un objeto con la forma { "440": { … } } o una respuesta de Steam con un campo '
    + 'response.items.',
  'import.error.emptyResultTitle': 'La importación pasó, pero la lista está vacía',
  'import.error.emptyResultText':
    'No se pudo leer ni un solo elemento. Comprueba que el archivo contiene de verdad una lista '
    + 'de deseados.',
  'import.error.fileRead': 'El archivo no se pudo leer',
  'import.demo.failedTitle': 'El conjunto de demostración no se cargó',
  'import.demo.failedText':
    '{message}. El archivo {url} tiene que estar junto a index.html, y la página tiene que '
    + 'abrirse por http(s), no como file://.',
  'import.demo.httpError': 'el servidor respondió {status}',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Cargar desde Steam',
  'steam.subtitle': 'Lo más sencillo para una lista de deseados pública',
  'steam.field': 'Tu perfil de Steam',
  'steam.placeholder': 'steamcommunity.com/id/tunombre, un alias o un SteamID64',
  'steam.run': 'Comprobar y cargar',
  'steam.cancel': 'Parar',
  'steam.checking': 'Buscando el servidor local…',
  'steam.warning':
    'La importación automática funciona cuando los «Detalles del juego» son públicos.',
  'steam.privateAsk': '¿Y si son privados?',
  'steam.privateHelp':
    'Abre tu perfil de Steam, elige «Editar perfil» y luego «Configuración de privacidad», y pon '
    + '«Detalles del juego» en Público. Si prefieres no abrirlo, el userscript que hay en «Otras '
    + 'formas de importar» lee la página en la que has iniciado sesión y funciona con una lista '
    + 'privada.',
  'steam.settingsLink': 'Abrir los ajustes de Steam ↗',

  'steam.blocked.title': 'Steam no dio acceso a la lista de deseados',
  'steam.blocked.text':
    'Eso suele significar que los «Detalles del juego» son privados: la lista de deseados sigue '
    + 'ese único ajuste.',
  'steam.blocked.unavailableTitle': 'La lista de deseados no se pudo obtener',
  'steam.blocked.unavailableText':
    'Steam respondió con un error, y con un error responde tanto a una lista que no quiere '
    + 'entregar como en un mal minuto suyo. Así que: si los «Detalles del juego» están en '
    + 'privado, los pasos de abajo los abren; si ya son públicos, espera unos minutos y pulsa '
    + '«Comprobar de nuevo».',
  'steam.blocked.step1': 'Abre tu perfil de Steam y elige «Editar perfil».',
  'steam.blocked.step2': 'Abre la «Configuración de privacidad».',
  'steam.blocked.step3': 'Pon «Detalles del juego» en Público.',
  'steam.blocked.step4': 'Vuelve aquí y pulsa «Comprobar de nuevo».',
  'steam.blocked.settings': 'Abrir los ajustes de Steam',
  'steam.blocked.again': 'Comprobar de nuevo',
  'steam.blocked.keepPrivate': 'No quiero hacerla pública',

  'steam.userscript.lead':
    'Reúne la lista desde la propia página de Steam. El userscript lee la página de la lista de '
    + 'deseados en la que has iniciado sesión, así que el ajuste de privacidad no interviene, y '
    + 'no hace ninguna petición de red por su cuenta.',
  'steam.userscript.step1': 'Instala Tampermonkey: existe para Chrome, Edge, Firefox y Opera.',
  'steam.userscript.step2':
    'Instala el script «steam-wishlist-export.user.js» desde el repositorio.',
  'steam.userscript.step3':
    'Abre la página de tu lista de deseados y pulsa «Reunir la lista» y luego «Descargar el JSON».',
  'steam.userscript.step4': 'Vuelve aquí y elige ese archivo en «Otras formas de importar».',
  'steam.userscript.link': 'Abrir el script en GitHub ↗',

  'steam.offline.title': 'Cargar mi lista de deseados',
  'steam.offline.subtitle': 'Elige el camino más sencillo',
  'steam.offline.text':
    'Tu navegador no permite que esta página lea Steam directamente, y no hay detrás un servidor '
    + 'local que se lo pida en su nombre. Aun así, tus datos siguen siendo tuyos.',
  'steam.offline.instructions': 'Ver las instrucciones',
  'steam.offline.userscript.badge': 'Funciona con listas privadas',
  'steam.offline.userscript.title': 'Importar desde tu página de Steam',
  'steam.offline.local.title': 'Ejecutar la versión local',
  'steam.offline.local.text': 'Entonces basta con un enlace a un perfil público.',
  'steam.offline.local.download': 'Descargar',
  'steam.offline.local.step1': 'Instala Node.js 20 o más reciente.',
  'steam.offline.local.step2': 'Descomprime el archivo donde quieras.',
  'steam.offline.local.step3':
    'Ejecuta «start.bat» en Windows, o «node server.js» en macOS y Linux.',
  'steam.offline.local.step4': 'Abre http://localhost:8080/ en el navegador.',
  'steam.step.account': 'Buscando la cuenta…',
  'steam.step.wishlist': 'Pidiendo la lista de deseados a Steam…',
  'steam.step.titles': 'Títulos: {done} de {total}',
  'steam.step.waiting':
    'Steam está limitando las peticiones. Esperando {seconds} s antes de volver a pedir…',
  'steam.note':
    'Un título, una petición: por eso una lista larga tarda minutos. Todo lo que ya ha llegado '
    + 'queda guardado, así que parar no pierde nada.',
  'steam.done.title': 'La lista de deseados llegó',
  'steam.done.titlesTitle': 'Los títulos están obtenidos',
  'steam.done.titlesText': '{items} en la lista; con título venido de Steam: {titles}.',
  'steam.done.text':
    'Cuenta de Steam {account}: {items} en la lista; con título venido de Steam: {titles}.',
  'steam.done.missing.one':
    'Steam no entregó {count} título: ese elemento se muestra por su App ID.',
  'steam.done.missing.few':
    'Steam no entregó {count} títulos: esos elementos se muestran por su App ID.',
  'steam.done.missing.many':
    'Steam no entregó {count} títulos: esos elementos se muestran por su App ID.',
  'steam.done.throttled':
    'Steam dejó de responder en el título {done} de {total}: está limitando las peticiones. Todo '
    + 'lo obtenido ya está en la lista; prueba el botón otra vez dentro de unos minutos.',
  'steam.missing.text.one':
    '{count} elemento de la lista todavía se muestra por un App ID y no por un título.',
  'steam.missing.text.few':
    '{count} elementos de la lista todavía se muestran por un App ID y no por un título.',
  'steam.missing.text.many':
    '{count} elementos de la lista todavía se muestran por un App ID y no por un título.',
  'steam.missing.run': 'Obtener los títulos que faltan',
  'steam.cancelled': 'Parado. Todo lo que había llegado hasta entonces se quedó en la lista.',
  'steam.error.title': 'La importación desde Steam falló',
  'steam.error.emptyInput':
    'El campo está vacío: escribe un SteamID64, un nombre de perfil o un enlace al perfil.',
  'steam.error.invalidAccount':
    'Esto no es ni un SteamID64 (17 cifras), ni un nombre de perfil de Steam, ni un enlace a un '
    + 'perfil en steamcommunity.com.',
  'steam.error.accountNotFound':
    'Steam no conoce esa cuenta. Comprueba cómo está escrita, o abre tu perfil en el navegador y '
    + 'copia la dirección de la página.',
  'steam.error.wishlistEmpty':
    'La lista de deseados de esta cuenta está vacía: todavía no hay nada que ordenar.',
  'steam.error.rateLimited':
    'Steam está limitando las peticiones: han llegado demasiadas desde esta dirección. Afloja al '
    + 'cabo de unos minutos; prueba entonces otra vez.',
  'steam.error.network':
    'No se pudo llegar a Steam. Comprueba la conexión, y que el servidor local siga en marcha.',
  'steam.error.steamError':
    'Steam respondió algo inesperado. Eso suele ser el propio Steam pasando un mal rato; prueba '
    + 'un poco más tarde.',
  'steam.error.notLocal': 'El servidor local solo responde a peticiones que vienen de localhost.',
  'steam.error.unknown': 'Fallo inesperado: {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'El archivo de estado no se lee como JSON.',
  'state.error.foreignState':
    'Este es el JSON de otra aplicación: no lleva ninguna firma de Steam Wishlist Sorter.',
  'state.error.unsupportedVersion':
    'El archivo se guardó con otra versión del formato y no está admitido.',
  'state.error.invalidState': 'El archivo parece un estado, pero no contiene ninguna sesión.',
  'state.error.writeFailed': 'El estado se leyó, pero el navegador se negó a guardarlo.',
  'state.confirm.title': '¿Cargar el estado encima del actual?',
  'state.confirm.text':
    'Ahora mismo la lista contiene {items} y {comparisons}. El archivo lo reemplaza todo entero: '
    + 'la lista, las categorías, las respuestas y los movimientos hechos a mano. No se puede '
    + 'deshacer.',
  'state.confirm.confirm': 'Reemplazar el estado actual',
  'state.confirm.cancelled': 'La importación del estado se canceló: no cambió nada.',
  'state.restored.title': 'El estado está restaurado',
  'state.restored.items': 'elementos',
  'state.restored.comparisons': 'comparaciones realizadas',
  'state.restored.moves': 'movimientos a mano',
  'state.restored.toast': 'El estado está restaurado desde el archivo.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': 'Paso 2 de 4',
  'categorize.heading': '¿Cuánto te interesa este juego?',
  'categorize.hint': 'No lo pienses demasiado: la categoría se puede cambiar después.',
  'categorize.buttonsAria': 'Niveles de interés',
  'categorize.more': 'Más interés',
  'categorize.less': 'Menos interés',
  'categorize.or': 'o',
  'categorize.counter': '{index} de {total}',
  'categorize.back': '← Anterior',
  'categorize.defer': 'Dejar para luego <kbd>Espacio</kbd>',
  'categorize.done': 'Todos los elementos tienen categoría.',
  'categorize.toCompare': 'Ir a las comparaciones',
  'categorize.empty': 'La lista está vacía: importa antes una lista de deseados.',
  'categorize.toImport': 'Ir a la importación',
  'categorize.position': 'Puesto en tu lista de deseados: {position}',
  'categorize.current': 'Ahora: {category}. Elige otra categoría para cambiarla.',
  'categorize.legendLeft': '{items} por clasificar',
  'categorize.firstItem': 'Este es el primer elemento de la lista.',
  'categorize.noneLeft': 'Ya no queda ningún elemento sin clasificar.',
  'categorize.postponed': '{title} queda para luego; volvemos a él al final de la vuelta.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': '¿Saltar las categorías?',
  'categorize.skipText':
    'Todos los elementos se quedan sin categoría, y las comparaciones pasan entonces por toda la '
    + 'lista como si fuera un solo grupo: muchas más preguntas de las que habrían hecho falta con '
    + 'cinco grupos más pequeños. No se pierde nada: puedes volver a esta etapa cuando quieras.',
  'categorize.skipConfirm': 'Saltarla e ir a las comparaciones',
  'categorize.skipDone': 'La etapa está saltada: las comparaciones pasan por toda la lista.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Paso 3 de 4',
  'compare.heading': '¿Qué juego quieres más?',
  'compare.headingDone': 'Las comparaciones están terminadas',
  'compare.hint': 'Elige rápido. Un par que no consigas decidir se puede dejar para luego.',
  'compare.progress': 'Categoría «{category}» · {made} · aprox. {left} por delante',
  'compare.deferred': 'en espera: {pairs}',
  'compare.preferA': 'Lo quiero más <kbd>A</kbd>',
  'compare.preferB': 'Lo quiero más <kbd>D</kbd>',
  'compare.drop': 'Ya no me interesa',
  'compare.or': 'o',
  'compare.tie': 'Más o menos igual <kbd>S</kbd>',
  'compare.defer': 'No me decido <kbd>Espacio</kbd>',
  'compare.undo': 'Deshacer <kbd>Retroceso</kbd>',
  'compare.finish': 'Terminar por hoy',
  'compare.finishNote': 'El progreso está guardado: tu resultado actual ya se puede usar.',
  'compare.done': 'No queda nada que comparar: el orden está fijado.',
  'compare.empty': 'No hay nada que comparar: la lista está vacía.',
  'compare.toResult': 'Ver el resultado',
  'compare.toImport': 'Ir a la importación',
  'compare.banner.allDeferred':
    'Todas las demás preguntas están dejadas para luego ({count}), y no se avanza sin una '
    + 'respuesta a esta. «Más o menos igual» también es una respuesta, y la ordenación sigue con '
    + 'ella.',
  'compare.banner.forced': 'Este par hace falta para avanzar.',
  'compare.rejected': 'La respuesta no se aceptó: {message}',
  'compare.dropped': '«{title}» está en la lista de juegos que quitar de la lista de deseados.',
  'compare.nothingToUndo': 'No hay nada que deshacer.',
  'compare.undone': 'La última respuesta está deshecha.',
  'compare.chosen': 'Elegido: {title}.',
  'compare.tied': '{a} y {b}: más o menos igual.',
  'compare.postponed': 'El par queda para luego.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Entendido',
  'onboarding.categorize.title': 'Primero, agrupa los juegos por interés a grandes rasgos',
  'onboarding.categorize.lead':
    'Verás un juego cada vez y lo pondrás en algún punto de una escala de cinco niveles, o '
    + 'directamente en la lista de juegos que quitar de la lista de deseados.',
  'onboarding.categorize.why':
    'Esto es lo que mantiene corta la ordenación: los juegos solo se comparan dentro de su propio '
    + 'grupo, así que un reparto aproximado ahora ahorra cientos de preguntas después.',
  'onboarding.categorize.later':
    'No lo pienses demasiado. Una categoría se puede cambiar en cualquier momento: vuelve al '
    + 'juego con «Anterior», o cámbiala en la pantalla del resultado.',
  'onboarding.compare.title': 'Ahora elige entre dos juegos',
  'onboarding.compare.lead':
    'Dos juegos cada vez, los dos del mismo grupo. Toma el que quieras más: las teclas A y D, o '
    + 'las flechas.',
  'onboarding.compare.tie':
    'Si los quieres igual, di «Más o menos igual»: también es una respuesta, y la ordenación la '
    + 'aprovecha.',
  'onboarding.compare.defer':
    'Un par difícil se puede dejar para luego con Espacio; vuelve cuando los fáciles estén '
    + 'respondidos.',
  'onboarding.compare.stop':
    'Termina cuando quieras. Cada respuesta se guarda, y el resultado se puede mirar en cualquier '
    + 'momento, esté acabado o no.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Paso 4 de 4',
  'result.head.usable': 'El resultado ya se puede usar',
  'result.head.ready': 'Tu orden está listo',
  'result.head.empty': 'Todavía no hay nada que ordenar',
  'result.lead.usable': 'Pásalo a Steam ahora, o sigue mejorándolo con más respuestas.',
  'result.lead.ready': 'Cada puesto está fijado por tus propias respuestas.',
  'result.lead.empty': 'Importa una lista de deseados y el orden aparecerá aquí.',
  'result.continue': 'Seguir con las comparaciones',
  'result.complete': 'La ordenación está terminada',
  'result.toImport': 'Ir a la importación',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Listo para usar',
  'result.summary.headline': 'Tus respuestas fijan el puesto de {items}',
  'result.summary.headlineAll': 'Toda la lista sigue tus respuestas',
  'result.summary.headlineNone': 'Todavía no hay ningún puesto fijado por una respuesta',
  'result.summary.rest':
    'El resto conserva el orden que tenía en tu lista de deseados; la lista de abajo dice cuáles.',
  'result.summary.choice':
    'Pasa este orden a Steam ahora, o sigue comparando: cada respuesta lo mejora.',
  'result.summary.done': 'No queda nada que comparar. Pasa el orden a Steam.',
  'result.summary.empty': 'La lista está vacía: todavía no hay nada que mostrar.',
  'result.summary.allRemoved': '{marked}, así que no queda nada que ordenar.',
  'result.stats.total': 'en la lista',
  'result.stats.confirmed': 'confirmados',
  'result.stats.removed': 'marcados para quitar',
  'result.built.summary': '¿Cómo se ha construido este orden?',
  'result.built.categories':
    'Las categorías van primero, en orden de interés; dentro de una categoría el puesto lo '
    + 'deciden las comparaciones.',
  'result.built.resolved':
    'Tus respuestas fijan el puesto de {resolved} de {total}. El resto, {fallback}, conserva el '
    + 'puesto que tenía en la lista de deseados: el orden de reserva, señalado en la lista.',
  'result.built.answers': 'Comparaciones respondidas hasta ahora: {count}.',
  'result.built.manual':
    'A mano has movido {items}. Un movimiento hecho a mano se vuelve a aplicar sobre lo que '
    + 'producen las comparaciones, así que las respuestas nuevas siguen mejorando la lista a su '
    + 'alrededor.',
  'result.built.noManual': 'No se ha movido nada a mano.',
  'result.built.complete':
    'La ordenación está terminada: cada par que el orden necesitaba tiene respuesta.',
  'result.built.incomplete':
    'La ordenación no está terminada; se puede retomar en cualquier momento.',
  'result.legend.sorted': 'confirmado por las comparaciones',
  'result.legend.fallback': 'todavía en el orden antiguo, por el puesto en la lista de deseados',
  'result.legend.manual': 'movido a mano',
  'result.legend.tied': 'empatado con la fila de arriba',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Acción principal',
  'result.transfer.heading': 'Pasar el orden a Steam',
  'result.transfer.sub': 'Sin extensiones ni programas añadidos',
  'result.transfer.step1': 'Mostrar la barra de marcadores',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Mayús</kbd> + <kbd>B</kbd>, en Chrome, Edge y Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Mayús</kbd> + <kbd>B</kbd>, en Chrome, Edge y Firefox.',
  'result.transfer.shortcutSafari':
    'En Safari: menú «Visualización» → «Mostrar barra de favoritos».',
  'result.transfer.step2': 'Arrastrar este enlace a la barra',
  'result.transfer.step3': 'Abrir tu lista de deseados y pulsar el marcador',
  'result.transfer.openWishlist': 'Abrir mi lista de deseados ↗',
  'result.transfer.link': 'Pasar mi orden a Steam',
  'result.transfer.copy': 'Copiar el enlace',
  'result.transfer.carries': 'El enlace lleva {items}.',
  'result.transfer.fresh':
    'El enlace se reconstruye con cada cambio, así que lo que te llevas de aquí es siempre el '
    + 'orden actual.',
  'result.transfer.taken':
    'Este es el enlace que te llevaste, y sigue escribiendo exactamente el orden que se ve abajo.',
  'result.transfer.stale':
    'El orden ha cambiado: sustituye el marcador antiguo por el enlace actualizado.',
  'result.transfer.copied':
    'El enlace está copiado. Crea un marcador a mano y pégalo como dirección.',
  'result.transfer.copyFailed':
    'El navegador negó el acceso al portapapeles; arrastra el enlace a la barra de marcadores en '
    + 'su lugar.',
  'result.transfer.clickToast':
    'Este enlace no es para pulsarlo aquí: arrástralo a la barra de marcadores y púlsalo en la '
    + 'página de la lista de deseados de Steam.',
  'result.transfer.empty':
    'La lista está vacía: todavía no hay ningún orden que llevar a ninguna parte.',
  'result.transfer.failed': 'El enlace no se pudo construir: {message}',
  'result.transfer.mobile':
    'En un teléfono o una tableta esto es incómodo: un bookmarklet hay que arrastrarlo a una '
    + 'barra de marcadores. El traspaso es más fácil en un navegador de escritorio.',
  'result.transfer.warnAccount':
    'El orden se escribe en la cuenta con la que este navegador ha iniciado sesión.',
  'result.transfer.warnNoDelete':
    'No se borra nada: los elementos que marcaste para quitar van al final de la lista.',
  'result.transfer.warnPriority':
    'Después, todos los elementos tienen prioridad, incluidos los que no tenían ninguna.',
  'result.transfer.warnNoBackup':
    'El bookmarklet no hace ninguna copia de seguridad y no comprueba el resultado después.',
  'result.transfer.warnReload':
    'Cuando termine, recarga la página de Steam y cambia la ordenación a tu propio orden.',
  'result.transfer.advanced': '¿Necesitas una copia de seguridad y una comprobación automática?',
  'result.transfer.advancedText':
    'El userscript lee él mismo la página de la lista de deseados: guarda en un archivo el orden '
    + 'que hay ahora, escribe el nuevo y comprueba después que ha llegado. Necesita Tampermonkey, '
    + 'y por eso es el camino largo y no el principal.',
  'result.transfer.advancedStep2':
    'Instala el script «steam-wishlist-import-order.user.js» desde el repositorio.',
  'result.transfer.advancedStep3':
    'Abre la página de tu lista de deseados y sigue el panel que el script pone en ella.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Tu orden',
  'result.search': 'Buscar por título o App ID',
  'result.filterAria': 'Qué se muestra',
  'result.filter.all': 'Todo',
  'result.filter.game': 'Juegos',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Una fila se arrastra con el ratón, o se selecciona y se mueve con <kbd>Ctrl</kbd> + '
    + '<kbd>↑</kbd> / <kbd>Ctrl</kbd> + <kbd>↓</kbd>. Los movimientos se guardan y sobreviven a '
    + 'una recarga.',
  'result.removed.hint': 'Estos elementos no entran en la numeración de la lista final.',
  'result.mark.confirmed': 'Confirmado por las comparaciones',
  'result.mark.fallback': 'Todavía en el orden antiguo',
  'result.mark.manual': 'Movido a mano',
  'result.mark.tied': 'Empatado con la fila de arriba',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} en la categoría',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Categoría: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': '{shown} de {total} a la vista',
  'result.empty.filter': 'Ni el filtro ni la búsqueda encontraron un solo elemento.',
  'result.empty.noItems': 'Importa una lista de deseados y el resultado aparecerá aquí.',
  'result.empty.allRemoved':
    'Todos los elementos están marcados para quitar: no hay nada que ordenar.',
  'result.move.failed': 'No se pudo mover: {message}',
  'result.move.announce': '«{title}» {where}{category}.',
  'result.move.place': 'al puesto {position}',
  'result.move.newPlace': 'a un puesto nuevo',
  'result.move.categorySuffix': ', categoría: {category}',
  'result.move.categoryToast': '«{title}» movido a «{category}».',
  'result.move.edge':
    'Esta es la {edge} fila de la categoría «{category}». La categoría se cambia con el selector '
    + 'de la propia fila.',
  'result.move.edgeFirst': 'primera',
  'result.move.edgeLast': 'última',
  'result.category.failed': 'La categoría no se pudo cambiar: {message}',
  'result.category.toast': '«{title}»: {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Mostrar la tier list',
  'tier.title': 'Tier list de la lista de deseados',
  'tier.lead': 'Dentro de cada categoría, los juegos van en orden de izquierda a derecha.',
  'tier.close': 'Cerrar',
  'tier.none': 'Sin categoría',
  'tier.empty': 'Aquí no hay nada',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Marcado para quitar. La aplicación no borra nada de Steam: eso queda de tu parte.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Descargar o compartir',
  'result.export.hint':
    'Los archivos se construyen aquí, en el navegador, y los guardas tú: no se sube nada.',
  'result.exportJson': 'Orden en JSON',
  'result.exportCsv': 'Lista en CSV',
  'result.copyText': 'Copiar como lista',
  'result.saveState': 'Copia del estado',
  'result.export.empty': 'No hay nada que exportar: la lista está vacía.',
  'result.export.failed': 'El archivo no se pudo construir: {message}',
  'result.export.jsonDone': 'El orden final está guardado en JSON.',
  'result.export.csvDone': 'La lista final está guardada en CSV.',
  'result.copy.empty': 'No hay nada que copiar: la lista está vacía.',
  'result.copy.done': 'La lista numerada está copiada al portapapeles.',
  'result.copy.failed':
    'El navegador negó el acceso al portapapeles; la lista se guardó en un archivo en su lugar.',
  'result.resetManual': 'Restablecer los movimientos a mano',
  'result.resetManual.none': 'No hay ningún movimiento a mano.',
  'result.resetManual.title': '¿Restablecer los movimientos a mano?',
  'result.resetManual.text':
    'Esto olvidará {moves} y devolverá la lista al orden que dan las comparaciones. Las '
    + 'respuestas de las comparaciones se quedan.',
  'result.resetManual.confirm': 'Restablecer los movimientos',
  'result.resetManual.done': 'Los movimientos a mano están restablecidos.',
  'result.resetAnswers': 'Restablecer las respuestas de las comparaciones',
  'result.resetAnswers.none': 'Todavía no hay ninguna respuesta.',
  'result.resetAnswers.title': '¿Restablecer las respuestas de las comparaciones?',
  'result.resetAnswers.text':
    'Esto borrará {answers} y hará que las comparaciones empiecen de cero. La lista de elementos, '
    + 'las categorías y los movimientos a mano se quedan. No se puede deshacer.',
  'result.resetAnswers.confirm': 'Restablecer las respuestas',
  'result.resetAnswers.done': 'Las respuestas de las comparaciones están restablecidas.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Esta no es la lista de deseados de Steam. Abre store.steampowered.com/wishlist, inicia '
    + 'sesión y pulsa allí el marcador. No se envió nada.',
  'bookmarklet.confirm':
    'Se va a escribir el orden de {items} en la lista de deseados de la cuenta con la que este '
    + 'navegador ha iniciado sesión. No se borra nada. No se puede deshacer: después de la '
    + 'escritura todas las entradas tienen prioridad, incluidas las que no tenían ninguna, y '
    + 'ninguna copia de seguridad devuelve eso.',
  'bookmarklet.write': 'Escribir el orden',
  'bookmarklet.cancel': 'Cancelar',
  'bookmarklet.close': 'Cerrar',
  'bookmarklet.sending': 'Enviando el orden a Steam…',
  'bookmarklet.done':
    'Steam aceptó el orden. Recarga la página de la lista de deseados y míralo: este bookmarklet '
    + 'no lee la página, así que la comprobación te toca a ti.',
  'bookmarklet.unclear':
    'Steam respondió, pero la respuesta no confirma ni desmiente nada. Recarga la página de la '
    + 'lista de deseados y mira el orden antes de repetir.',
  'bookmarklet.refused':
    'Steam rechazó el orden y no dijo nada útil sobre el porqué. Recarga la página de la lista de '
    + 'deseados y mira el orden antes de repetir.',
  'bookmarklet.badRequest':
    'Steam apartó la petición en la puerta, con un 400 y un cuerpo vacío: nunca llegó a mirar el '
    + 'orden, así que no se escribió nada. Eso es lo que responde cuando a la petición le falta '
    + 'algo que él exige, y la respuesta no nombra nada. Parece que el punto de entrada ha '
    + 'cambiado; la página del proyecto dice qué hacer en ese caso.',
  'bookmarklet.signedOut':
    'Steam no aceptó la sesión: lo más habitual es que simplemente haya caducado. Vuelve a '
    + 'iniciar sesión en Steam, recarga la lista de deseados y pulsa el marcador una vez más. No '
    + 'se escribió nada.',
  'bookmarklet.rateLimited':
    'Steam respondió «demasiadas peticiones». Espera un par de minutos y pulsa el marcador otra '
    + 'vez: no se cambió nada.',
  'bookmarklet.tooLarge':
    'La petición es demasiado grande para Steam: todo el orden va en una sola petición, y esta no '
    + 'cupo. No se escribió nada. Una lista así necesita el userscript, que puede marcar las '
    + 'filas en la página en su lugar.',
  'bookmarklet.serverError':
    'El problema está del lado de Steam: respondió con un error de servidor. Prueba dentro de '
    + 'unos minutos; no se escribió nada.',
  'bookmarklet.offline':
    'La petición nunca llegó a Steam. Puede que la red se haya caído, o que una extensión la haya '
    + 'bloqueado. No se escribió nada: comprueba la conexión y pulsa el marcador otra vez.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'N.º',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Título',
  'export.csv.category': 'Categoría',
  'export.csv.kind': 'Tipo',
  'export.csv.positionInCategory': 'Puesto en la categoría',
  'export.csv.origin': 'De dónde viene el orden',
  'export.csv.wishlistPosition': 'Puesto en la lista de deseados',
  'export.csv.url': 'Enlace',
  'export.origin.manual': 'a mano',
  'export.origin.comparisons': 'comparaciones',
  'export.origin.fallback': 'orden de reserva',
  'export.kind.game': 'Juego',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Desconocido',
};

/* ------------------------------------------------ brazilian portuguese */

/** @type {Readonly<Record<string, string>>} */
const PT_BR = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} item',
  'count.items.few': '{count} itens',
  'count.items.many': '{count} itens',
  'count.records.one': '{count} registro lido',
  'count.records.few': '{count} registros lidos',
  'count.records.many': '{count} registros lidos',
  'count.comparisonsMade.one': '{count} comparação realizada',
  'count.comparisonsMade.few': '{count} comparações realizadas',
  'count.comparisonsMade.many': '{count} comparações realizadas',
  'count.comparisonsDone.one': '{count} comparação feita',
  'count.comparisonsDone.few': '{count} comparações feitas',
  'count.comparisonsDone.many': '{count} comparações feitas',
  'count.pairs.one': '{count} par',
  'count.pairs.few': '{count} pares',
  'count.pairs.many': '{count} pares',
  'count.rows.one': '{count} linha',
  'count.rows.few': '{count} linhas',
  'count.rows.many': '{count} linhas',
  'count.moves.one': '{count} movimento',
  'count.moves.few': '{count} movimentos',
  'count.moves.many': '{count} movimentos',
  'count.answers.one': '{count} resposta',
  'count.answers.few': '{count} respostas',
  'count.answers.many': '{count} respostas',
  'count.marked.one': '{count} item está marcado para sair da lista de desejos',
  'count.marked.few': '{count} itens estão marcados para sair da lista de desejos',
  'count.marked.many': '{count} itens estão marcados para sair da lista de desejos',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Uma ferramenta local que coloca em ordem uma lista de desejos da Steam por comparações duas '
    + 'a duas.',
  'a11y.skipToContent': 'Ir para o conteúdo',
  'a11y.progress.import': 'Carregamento da lista de desejos',
  'a11y.progress.categorize': 'Itens com categoria',
  'a11y.progress.compare': 'Comparações respondidas',
  'nav.aria': 'Etapas',
  'nav.import': 'Lista de desejos',
  'nav.categorize': 'Categorias',
  'nav.compare': 'Comparações',
  'nav.result': 'Resultado',
  'nav.state.done': 'etapa concluída',
  'nav.state.current': 'etapa atual',
  'nav.state.locked': 'etapa ainda indisponível',
  'settings.title': 'Configurações',
  'settings.covers': 'Carregar as capas',
  'settings.language': 'Idioma da interface',
  'settings.theme': 'Tema',
  'theme.modern': 'Moderno',
  'theme.steam': 'No estilo da Steam',
  'actions.saveState': 'Salvar um backup',
  'actions.loadState': 'Carregar um backup',
  'actions.skipStage': 'Pular as categorias',
  'actions.reset': 'Começar de novo',
  'privacy.short': 'Roda localmente · seus dados não vão para servidores de terceiros',
  'privacy.details': 'Detalhes',
  'privacy.note':
    'Seus dados nunca saem do navegador. A única requisição externa que o aplicativo faz, em '
    + 'qualquer momento, é o carregamento das capas dos jogos a partir da CDN da Steam por um '
    + 'endereço público; ela se desliga no botão “Carregar as capas”. A importação direto de uma '
    + 'conta é feita pelo servidor local que roda na sua máquina: ela vai para a Steam, para mais '
    + 'ninguém, e só quando você aperta o botão.',
  'dialog.title': 'Confirmar a ação',
  'dialog.cancel': 'Cancelar',
  'dialog.confirm': 'Continuar',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Abrir na Steam ↗',
  'common.openInSteamAria': 'Abrir “{title}” na Steam, em uma nova aba',
  'category.must': 'Quero muito',
  'category.want': 'Quero',
  'category.maybe': 'Talvez',
  'category.unlikely': 'Pouco provável',
  'category.meh': 'Quase sem interesse',
  'category.remove': 'Tirar da lista de desejos',
  'category.none': 'Sem categoria',
  'kind.game': 'Jogo',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Tipo desconhecido',
  'cover.none': 'Sem capa',
  'cover.off': 'As capas estão desligadas',
  'cover.failed': 'A capa não carregou',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'O estado não pôde ser salvo no navegador. Salve em um arquivo para não perder nada.',
  'app.saveFailedReason': 'O estado não pôde ser salvo: {message}',
  'app.loadFailed':
    'O estado salvo não pôde ser lido ({message}). Começando de uma lista vazia.',
  'app.covers.on': 'Capas ligadas: o aplicativo carrega as imagens da CDN da Steam.',
  'app.covers.off': 'Capas desligadas: o aplicativo não faz nenhuma requisição externa.',
  'app.language.changed': 'Idioma da interface: {language}.',
  'app.theme.changed': 'Tema: {theme}.',
  'app.reset.title': 'Começar de novo?',
  'app.reset.text':
    'Vai ser apagado tudo isto: {items}, as categorias, as respostas das comparações e os '
    + 'movimentos feitos à mão. Não dá para desfazer — se o trabalho ainda puder servir, salve '
    + 'antes em um arquivo.',
  'app.reset.confirm': 'Apagar tudo e começar de novo',
  'app.reset.done': 'O estado está limpo.',
  'app.state.buildFailed': 'O arquivo de estado não pôde ser montado: {message}',
  'app.state.saved': 'O estado está salvo em um arquivo.',
  'app.saved': 'Progresso salvo neste navegador',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Uma ordem que você escolheu de verdade',
  'import.promise': 'Classifique os jogos pela vontade real de jogar',
  'import.lead':
    'Agrupe rápido a sua lista de desejos por interesse e depois escolha entre dois jogos. Pare '
    + 'quando quiser — o progresso está sempre salvo.',
  'import.step.load': 'Carregar a lista de desejos',
  'import.step.group': 'Agrupar por interesse',
  'import.step.compare': 'Comparar os jogos',
  'import.step.send': 'Enviar a ordem para a Steam',
  'import.sessions':
    'Uma ordenação completa pode levar várias sessões. Seu resultado atual está sempre disponível.',
  'import.other': 'Outras formas de importar',
  'import.file.title': 'Arquivo JSON',
  'import.file.hint': 'Uma exportação da Steam ou um arquivo montado pelo userscript.',
  'import.file.button': 'Escolher um arquivo…',
  'import.file.none': 'Nenhum arquivo escolhido',
  'import.paste.title': 'Colar JSON',
  'import.paste.hint': 'O corpo da resposta da Steam pode ser colado como está.',
  'import.paste.label': 'JSON da lista de desejos',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Importar do texto',
  'import.userscript.title': 'Da página da Steam, com o userscript',
  'import.userscript.hint': 'O arquivo que ele baixa se carrega aqui, com “Arquivo JSON” acima.',
  'import.state.title': 'Estado salvo',
  'import.state.hint':
    'Um arquivo que você salvou antes com “Salvar um backup”: voltam as categorias e todas as '
    + 'respostas.',
  'import.state.button': 'Escolher um arquivo de estado…',
  'import.demo.button': 'Testar com 20 jogos',
  'import.ready.eyebrow': 'Pronto',
  'import.ready.count.one': '{count} item carregado',
  'import.ready.count.few': '{count} itens carregados',
  'import.ready.count.many': '{count} itens carregados',
  'import.ready.next':
    'Agora distribua os jogos em cinco níveis de interesse. É isso que derruba o número de '
    + 'comparações.',
  'import.ready.start': 'Começar a agrupar',
  'import.ready.again': 'Carregar outra lista de desejos',
  'import.current':
    'A lista contém agora {items}: {sorted} com categoria e {plain} sem ela. Comparações '
    + 'realizadas: '
    + '{comparisons}. Importar de novo atualiza as entradas e mantém o trabalho já feito.',
  'import.announce': 'Itens importados: {count}. A lista contém agora {total}.',
  'import.source.file': 'Arquivo {name}',
  'import.source.pasted': 'Texto colado',
  'import.source.demo': 'Conjunto de demonstração',
  'import.report.title': '{source}: {records}',
  'import.report.added': 'adicionados',
  'import.report.updated': 'atualizados',
  'import.report.duplicates': 'duplicados',
  'import.report.skipped': 'ignorados',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'registro n.º {number}',
  'import.issue.key': 'chave “{key}”',
  'import.issue.more': '…e mais {count}',
  'import.skip.notAnObject': 'o registro não parece nem um item nem um App ID',
  'import.skip.missingAppId': 'sem App ID',
  'import.skip.invalidAppId': 'o App ID não é um número',
  'import.skip.duplicateInInput': 'o item já aparecia neste mesmo arquivo',
  'import.error.title': 'A importação falhou',
  'import.error.emptyInput': 'Não há nada para importar: o arquivo ou o campo está vazio.',
  'import.error.invalidJson':
    'Isto não é JSON. Parece que o texto foi copiado só em parte, ou que entrou alguma coisa a '
    + 'mais.',
  'import.error.unrecognizedFormat':
    'O JSON foi lido, mas não parece uma lista de desejos. É preciso um vetor de itens, um objeto '
    + 'no formato { "440": { … } } ou uma resposta da Steam com um campo response.items.',
  'import.error.emptyResultTitle': 'A importação passou, mas a lista está vazia',
  'import.error.emptyResultText':
    'Não foi possível ler um único item. Verifique se o arquivo contém mesmo uma lista de desejos.',
  'import.error.fileRead': 'O arquivo não pôde ser lido',
  'import.demo.failedTitle': 'O conjunto de demonstração não carregou',
  'import.demo.failedText':
    '{message}. O arquivo {url} precisa ficar ao lado de index.html — e a página precisa ser '
    + 'aberta por http(s), não como file://.',
  'import.demo.httpError': 'o servidor respondeu {status}',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Carregar da Steam',
  'steam.subtitle': 'O jeito mais simples para uma lista de desejos pública',
  'steam.field': 'Seu perfil da Steam',
  'steam.placeholder': 'steamcommunity.com/id/seunome, um apelido ou um SteamID64',
  'steam.run': 'Verificar e carregar',
  'steam.cancel': 'Parar',
  'steam.checking': 'Procurando o servidor local…',
  'steam.warning':
    'A importação automática funciona quando os “Detalhes do jogo” estão públicos.',
  'steam.privateAsk': 'E se estiverem privados?',
  'steam.privateHelp':
    'Abra seu perfil da Steam, escolha “Editar perfil” e depois “Configurações de privacidade”, e '
    + 'coloque “Detalhes do jogo” em Público. Se preferir não abrir, o userscript que está em '
    + '“Outras formas de importar” lê a página em que você já entrou e funciona com uma lista '
    + 'privada.',
  'steam.settingsLink': 'Abrir as configurações da Steam ↗',

  'steam.blocked.title': 'A Steam não liberou a lista de desejos',
  'steam.blocked.text':
    'Isso costuma significar que os “Detalhes do jogo” estão privados: a lista de desejos segue '
    + 'essa única configuração.',
  'steam.blocked.unavailableTitle': 'A lista de desejos não pôde ser obtida',
  'steam.blocked.unavailableText':
    'A Steam respondeu com um erro, e é com um erro que ela responde tanto a uma lista que não '
    + 'quer entregar quanto num minuto ruim dela mesma. Então: se os “Detalhes do jogo” estão '
    + 'privados, os passos abaixo os abrem; se já estão públicos, espere alguns minutos e aperte '
    + '“Verificar de novo”.',
  'steam.blocked.step1': 'Abra seu perfil da Steam e escolha “Editar perfil”.',
  'steam.blocked.step2': 'Abra as “Configurações de privacidade”.',
  'steam.blocked.step3': 'Coloque “Detalhes do jogo” em Público.',
  'steam.blocked.step4': 'Volte aqui e aperte “Verificar de novo”.',
  'steam.blocked.settings': 'Abrir as configurações da Steam',
  'steam.blocked.again': 'Verificar de novo',
  'steam.blocked.keepPrivate': 'Não quero deixar pública',

  'steam.userscript.lead':
    'Colete a lista na própria página da Steam. O userscript lê a página da lista de desejos em '
    + 'que você já entrou, então a configuração de privacidade não entra em jogo, e ele não faz '
    + 'nenhuma requisição de rede por conta própria.',
  'steam.userscript.step1':
    'Instale o Tampermonkey — ele existe para Chrome, Edge, Firefox e Opera.',
  'steam.userscript.step2': 'Instale o script “steam-wishlist-export.user.js” do repositório.',
  'steam.userscript.step3':
    'Abra a página da sua lista de desejos e aperte “Coletar a lista” e depois “Baixar o JSON”.',
  'steam.userscript.step4':
    'Volte aqui e escolha esse arquivo em “Outras formas de importar”.',
  'steam.userscript.link': 'Abrir o script no GitHub ↗',

  'steam.offline.title': 'Carregar minha lista de desejos',
  'steam.offline.subtitle': 'Escolha o caminho mais simples',
  'steam.offline.text':
    'Seu navegador não deixa esta página ler a Steam diretamente, e não há um servidor local '
    + 'atrás dela para pedir em nome dela. Mesmo assim, seus dados continuam sendo seus.',
  'steam.offline.instructions': 'Ver as instruções',
  'steam.offline.userscript.badge': 'Funciona com listas privadas',
  'steam.offline.userscript.title': 'Importar da sua página da Steam',
  'steam.offline.local.title': 'Rodar a versão local',
  'steam.offline.local.text': 'Aí basta um link para um perfil público.',
  'steam.offline.local.download': 'Baixar',
  'steam.offline.local.step1': 'Instale o Node.js 20 ou mais novo.',
  'steam.offline.local.step2': 'Descompacte o arquivo onde quiser.',
  'steam.offline.local.step3':
    'Rode “start.bat” no Windows, ou “node server.js” no macOS e no Linux.',
  'steam.offline.local.step4': 'Abra http://localhost:8080/ no navegador.',
  'steam.step.account': 'Procurando a conta…',
  'steam.step.wishlist': 'Pedindo a lista de desejos à Steam…',
  'steam.step.titles': 'Títulos: {done} de {total}',
  'steam.step.waiting':
    'A Steam está limitando as requisições. Esperando {seconds} s para pedir de novo…',
  'steam.note':
    'Um título, uma requisição: por isso uma lista longa leva minutos. Tudo o que já chegou fica '
    + 'salvo — parar não perde nada.',
  'steam.done.title': 'A lista de desejos chegou',
  'steam.done.titlesTitle': 'Os títulos foram obtidos',
  'steam.done.titlesText': '{items} na lista; com título vindo da Steam: {titles}.',
  'steam.done.text':
    'Conta da Steam {account}: {items} na lista; com título vindo da Steam: {titles}.',
  'steam.done.missing.one':
    'A Steam não entregou {count} título: esse item aparece pelo App ID dele.',
  'steam.done.missing.few':
    'A Steam não entregou {count} títulos: esses itens aparecem pelo App ID deles.',
  'steam.done.missing.many':
    'A Steam não entregou {count} títulos: esses itens aparecem pelo App ID deles.',
  'steam.done.throttled':
    'A Steam parou de responder no título {done} de {total}: ela está limitando as requisições. '
    + 'Tudo o que foi obtido já está na lista — tente o botão de novo daqui a alguns minutos.',
  'steam.missing.text.one':
    '{count} item da lista ainda aparece por um App ID, e não por um título.',
  'steam.missing.text.few':
    '{count} itens da lista ainda aparecem por um App ID, e não por um título.',
  'steam.missing.text.many':
    '{count} itens da lista ainda aparecem por um App ID, e não por um título.',
  'steam.missing.run': 'Obter os títulos que faltam',
  'steam.cancelled': 'Parado. Tudo o que tinha chegado até ali ficou na lista.',
  'steam.error.title': 'A importação da Steam falhou',
  'steam.error.emptyInput':
    'O campo está vazio: digite um SteamID64, um nome de perfil ou um link para o perfil.',
  'steam.error.invalidAccount':
    'Isto não é um SteamID64 (17 dígitos), nem um nome de perfil da Steam, nem um link para um '
    + 'perfil em steamcommunity.com.',
  'steam.error.accountNotFound':
    'A Steam não conhece essa conta. Confira como está escrito — ou abra seu perfil no navegador '
    + 'e copie o endereço da página.',
  'steam.error.wishlistEmpty':
    'A lista de desejos desta conta está vazia: ainda não há nada para ordenar.',
  'steam.error.rateLimited':
    'A Steam está limitando as requisições: vieram demais deste endereço. Ela solta depois de '
    + 'alguns minutos — tente de novo aí.',
  'steam.error.network':
    'Não foi possível alcançar a Steam. Confira a conexão, e se o servidor local ainda está no ar.',
  'steam.error.steamError':
    'A Steam respondeu alguma coisa inesperada. Isso costuma ser a própria Steam passando por um '
    + 'mau momento; tente um pouco mais tarde.',
  'steam.error.notLocal': 'O servidor local só responde a requisições vindas de localhost.',
  'steam.error.unknown': 'Falha inesperada: {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'O arquivo de estado não se lê como JSON.',
  'state.error.foreignState':
    'Este é o JSON de outro aplicativo: ele não traz nenhuma assinatura do Steam Wishlist Sorter.',
  'state.error.unsupportedVersion':
    'O arquivo foi salvo por outra versão do formato e não é suportado.',
  'state.error.invalidState': 'O arquivo parece um estado, mas não contém nenhuma sessão.',
  'state.error.writeFailed': 'O estado foi lido, mas o navegador se recusou a salvá-lo.',
  'state.confirm.title': 'Carregar o estado por cima do atual?',
  'state.confirm.text':
    'A lista contém agora {items} e {comparisons}. O arquivo substitui tudo isso de uma vez: a '
    + 'lista, as categorias, as respostas e os movimentos feitos à mão. Não dá para desfazer.',
  'state.confirm.confirm': 'Substituir o estado atual',
  'state.confirm.cancelled': 'A importação do estado foi cancelada — nada mudou.',
  'state.restored.title': 'O estado foi restaurado',
  'state.restored.items': 'itens',
  'state.restored.comparisons': 'comparações realizadas',
  'state.restored.moves': 'movimentos à mão',
  'state.restored.toast': 'O estado foi restaurado do arquivo.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': 'Passo 2 de 4',
  'categorize.heading': 'Qual é o seu interesse neste jogo?',
  'categorize.hint': 'Não pense demais — a categoria pode mudar depois.',
  'categorize.buttonsAria': 'Níveis de interesse',
  'categorize.more': 'Mais interesse',
  'categorize.less': 'Menos interesse',
  'categorize.or': 'ou',
  'categorize.counter': '{index} de {total}',
  'categorize.back': '← Anterior',
  'categorize.defer': 'Deixar para depois <kbd>Espaço</kbd>',
  'categorize.done': 'Todos os itens têm categoria.',
  'categorize.toCompare': 'Ir para as comparações',
  'categorize.empty': 'A lista está vazia: importe antes uma lista de desejos.',
  'categorize.toImport': 'Ir para a importação',
  'categorize.position': 'Lugar na sua lista de desejos: {position}',
  'categorize.current': 'Agora: {category}. Escolha outra categoria para mudar.',
  'categorize.legendLeft': '{items} por classificar',
  'categorize.firstItem': 'Este é o primeiro item da lista.',
  'categorize.noneLeft': 'Não sobrou nenhum item sem classificar.',
  'categorize.postponed': '{title} ficou para depois; voltamos a ele no fim da volta.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': 'Pular as categorias?',
  'categorize.skipText':
    'Todos os itens ficam sem categoria, e as comparações passam então pela lista inteira como um '
    + 'grupo só — muito mais perguntas do que cinco grupos menores teriam pedido. Nada se perde: '
    + 'você pode voltar a esta etapa quando quiser.',
  'categorize.skipConfirm': 'Pular e ir para as comparações',
  'categorize.skipDone': 'A etapa foi pulada: as comparações passam pela lista inteira.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Passo 3 de 4',
  'compare.heading': 'Qual jogo você quer mais?',
  'compare.headingDone': 'As comparações terminaram',
  'compare.hint': 'Escolha rápido. Um par que você não conseguir decidir pode ficar para depois.',
  'compare.progress': 'Categoria “{category}” · {made} · aprox. {left} pela frente',
  'compare.deferred': 'em espera: {pairs}',
  'compare.preferA': 'Quero mais <kbd>A</kbd>',
  'compare.preferB': 'Quero mais <kbd>D</kbd>',
  'compare.drop': 'Não interessa mais',
  'compare.or': 'ou',
  'compare.tie': 'Mais ou menos igual <kbd>S</kbd>',
  'compare.defer': 'Não consigo decidir <kbd>Espaço</kbd>',
  'compare.undo': 'Desfazer <kbd>Backspace</kbd>',
  'compare.finish': 'Encerrar por hoje',
  'compare.finishNote': 'O progresso está salvo — seu resultado atual já dá para usar.',
  'compare.done': 'Não sobrou nada para comparar: a ordem está definida.',
  'compare.empty': 'Não há nada para comparar: a lista está vazia.',
  'compare.toResult': 'Ver o resultado',
  'compare.toImport': 'Ir para a importação',
  'compare.banner.allDeferred':
    'Todas as outras perguntas ficaram para depois ({count}), e não dá para seguir sem uma '
    + 'resposta para esta. “Mais ou menos igual” também é uma resposta, e a ordenação segue com '
    + 'ela.',
  'compare.banner.forced': 'Este par é necessário para seguir.',
  'compare.rejected': 'A resposta não foi aceita: {message}',
  'compare.dropped': '“{title}” está na lista dos jogos a tirar da lista de desejos.',
  'compare.nothingToUndo': 'Não há nada para desfazer.',
  'compare.undone': 'A última resposta foi desfeita.',
  'compare.chosen': 'Escolhido: {title}.',
  'compare.tied': '{a} e {b} — mais ou menos igual.',
  'compare.postponed': 'O par ficou para depois.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Entendi',
  'onboarding.categorize.title': 'Primeiro, agrupe os jogos por interesse, sem precisão',
  'onboarding.categorize.lead':
    'Você verá um jogo por vez e vai colocá-lo em algum ponto de uma escala de cinco níveis — ou '
    + 'direto na lista de jogos a tirar da lista de desejos.',
  'onboarding.categorize.why':
    'É isso que deixa a ordenação curta: os jogos só são comparados dentro do próprio grupo, '
    + 'então uma divisão grosseira agora poupa centenas de perguntas depois.',
  'onboarding.categorize.later':
    'Não pense demais. Uma categoria pode mudar a qualquer momento — volte ao jogo com '
    + '“Anterior”, ou mude na tela do resultado.',
  'onboarding.compare.title': 'Agora escolha entre dois jogos',
  'onboarding.compare.lead':
    'Dois jogos por vez, os dois do mesmo grupo. Pegue o que você quer mais — as teclas A e D, ou '
    + 'as setas.',
  'onboarding.compare.tie':
    'Se quiser os dois igualmente, diga “Mais ou menos igual”: também é uma resposta, e a '
    + 'ordenação usa ela.',
  'onboarding.compare.defer':
    'Um par difícil pode ficar para depois com Espaço; ele volta quando os fáceis estiverem '
    + 'respondidos.',
  'onboarding.compare.stop':
    'Encerre quando quiser. Cada resposta é salva, e o resultado dá para olhar a qualquer momento '
    + '— terminado ou não.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Passo 4 de 4',
  'result.head.usable': 'O resultado já dá para usar',
  'result.head.ready': 'Sua ordem está pronta',
  'result.head.empty': 'Ainda não há nada para ordenar',
  'result.lead.usable': 'Passe para a Steam agora, ou continue melhorando com mais respostas.',
  'result.lead.ready': 'Cada lugar nela está definido pelas suas próprias respostas.',
  'result.lead.empty': 'Importe uma lista de desejos, e a ordem aparece aqui.',
  'result.continue': 'Continuar as comparações',
  'result.complete': 'A ordenação terminou',
  'result.toImport': 'Ir para a importação',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Pronto para usar',
  'result.summary.headline': 'Suas respostas definem o lugar de {items}',
  'result.summary.headlineAll': 'A lista inteira segue as suas respostas',
  'result.summary.headlineNone': 'Nenhum lugar está definido por uma resposta ainda',
  'result.summary.rest':
    'O resto mantém a ordem que tinha na sua lista de desejos; a lista abaixo diz quais.',
  'result.summary.choice':
    'Passe esta ordem para a Steam agora, ou continue comparando — cada resposta melhora ela.',
  'result.summary.done': 'Não sobrou nada para comparar. Passe a ordem para a Steam.',
  'result.summary.empty': 'A lista está vazia: ainda não há nada para mostrar.',
  'result.summary.allRemoved': '{marked}, então não sobrou nada para ordenar.',
  'result.stats.total': 'na lista',
  'result.stats.confirmed': 'confirmados',
  'result.stats.removed': 'marcados para sair',
  'result.built.summary': 'Como esta ordem foi montada?',
  'result.built.categories':
    'As categorias vêm primeiro, na ordem do interesse; dentro de uma categoria o lugar é '
    + 'decidido pelas comparações.',
  'result.built.resolved':
    'Suas respostas definem o lugar de {resolved} de {total}. O resto, {fallback}, mantém o lugar '
    + 'que tinha na lista de desejos — a ordem de reserva, marcada na lista.',
  'result.built.answers': 'Comparações respondidas até agora: {count}.',
  'result.built.manual':
    'À mão, você moveu {items}. Um movimento feito à mão é reaplicado por cima do que as '
    + 'comparações produzem, então as respostas novas continuam melhorando a lista em volta dele.',
  'result.built.noManual': 'Nada foi movido à mão.',
  'result.built.complete':
    'A ordenação terminou: cada par de que a ordem precisava tem resposta.',
  'result.built.incomplete': 'A ordenação não terminou — dá para retomar a qualquer momento.',
  'result.legend.sorted': 'confirmado pelas comparações',
  'result.legend.fallback': 'ainda na ordem antiga — pelo lugar na lista de desejos',
  'result.legend.manual': 'movido à mão',
  'result.legend.tied': 'empatado com a linha de cima',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Ação principal',
  'result.transfer.heading': 'Passar a ordem para a Steam',
  'result.transfer.sub': 'Sem extensões nem programas adicionais',
  'result.transfer.step1': 'Mostrar a barra de favoritos',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — no Chrome, no Edge e no Firefox.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — no Chrome, no Edge e no Firefox.',
  'result.transfer.shortcutSafari':
    'No Safari: menu “Visualizar” → “Mostrar barra de favoritos”.',
  'result.transfer.step2': 'Arrastar este link para a barra',
  'result.transfer.step3': 'Abrir sua lista de desejos e apertar o favorito',
  'result.transfer.openWishlist': 'Abrir minha lista de desejos ↗',
  'result.transfer.link': 'Passar minha ordem para a Steam',
  'result.transfer.copy': 'Copiar o link',
  'result.transfer.carries': 'O link leva {items}.',
  'result.transfer.fresh':
    'O link é remontado a cada mudança, então o que você leva daqui é sempre a ordem atual.',
  'result.transfer.taken':
    'Este é o link que você levou, e ele ainda escreve exatamente a ordem que aparece abaixo.',
  'result.transfer.stale': 'A ordem mudou — troque o favorito antigo pelo link atualizado.',
  'result.transfer.copied':
    'O link foi copiado. Crie um favorito à mão e cole ele como endereço.',
  'result.transfer.copyFailed':
    'O navegador negou o acesso à área de transferência — arraste o link para a barra de '
    + 'favoritos em vez disso.',
  'result.transfer.clickToast':
    'Este link não é para apertar aqui: arraste ele para a barra de favoritos e aperte na página '
    + 'da lista de desejos da Steam.',
  'result.transfer.empty':
    'A lista está vazia — ainda não há ordem nenhuma para levar a lugar nenhum.',
  'result.transfer.failed': 'O link não pôde ser montado: {message}',
  'result.transfer.mobile':
    'Em um celular ou tablet isso fica desconfortável: um bookmarklet precisa ser arrastado para '
    + 'uma barra de favoritos. A passagem é mais fácil num navegador de computador.',
  'result.transfer.warnAccount': 'A ordem é escrita na conta em que este navegador entrou.',
  'result.transfer.warnNoDelete':
    'Nada é apagado: os itens que você marcou para sair vão para o fim da lista.',
  'result.transfer.warnPriority':
    'Depois disso, todos os itens têm prioridade, inclusive os que não tinham nenhuma.',
  'result.transfer.warnNoBackup':
    'O bookmarklet não faz backup nenhum e não confere o resultado depois.',
  'result.transfer.warnReload':
    'Quando terminar, recarregue a página da Steam e troque a ordenação para a sua própria ordem.',
  'result.transfer.advanced': 'Precisa de backup e de conferência automática?',
  'result.transfer.advancedText':
    'O userscript lê ele mesmo a página da lista de desejos: salva em um arquivo a ordem que está '
    + 'lá agora, escreve a nova e confere depois que ela chegou. Ele precisa do Tampermonkey, e '
    + 'por isso é o caminho mais longo e não o principal.',
  'result.transfer.advancedStep2':
    'Instale o script “steam-wishlist-import-order.user.js” do repositório.',
  'result.transfer.advancedStep3':
    'Abra a página da sua lista de desejos e siga o painel que o script coloca nela.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Sua ordem',
  'result.search': 'Buscar por título ou App ID',
  'result.filterAria': 'O que é mostrado',
  'result.filter.all': 'Tudo',
  'result.filter.game': 'Jogos',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Uma linha se arrasta com o mouse, ou se seleciona e se move com <kbd>Ctrl</kbd> + '
    + '<kbd>↑</kbd> / <kbd>Ctrl</kbd> + <kbd>↓</kbd>. Os movimentos são salvos e sobrevivem a um '
    + 'recarregamento.',
  'result.removed.hint': 'Estes itens não entram na numeração da lista final.',
  'result.mark.confirmed': 'Confirmado pelas comparações',
  'result.mark.fallback': 'Ainda na ordem antiga',
  'result.mark.manual': 'Movido à mão',
  'result.mark.tied': 'Empatado com a linha de cima',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} na categoria',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Categoria: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': '{shown} de {total} à vista',
  'result.empty.filter': 'Nem o filtro nem a busca encontraram um único item.',
  'result.empty.noItems': 'Importe uma lista de desejos e o resultado aparece aqui.',
  'result.empty.allRemoved':
    'Todos os itens estão marcados para sair — não há nada para ordenar.',
  'result.move.failed': 'Não foi possível mover: {message}',
  'result.move.announce': '“{title}” {where}{category}.',
  'result.move.place': 'para o lugar {position}',
  'result.move.newPlace': 'para um lugar novo',
  'result.move.categorySuffix': ', categoria: {category}',
  'result.move.categoryToast': '“{title}” foi para “{category}”.',
  'result.move.edge':
    'Esta é a {edge} linha da categoria “{category}”. A categoria se muda pelo seletor da própria '
    + 'linha.',
  'result.move.edgeFirst': 'primeira',
  'result.move.edgeLast': 'última',
  'result.category.failed': 'A categoria não pôde ser mudada: {message}',
  'result.category.toast': '“{title}” — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Mostrar a tier list',
  'tier.title': 'Tier list da lista de desejos',
  'tier.lead': 'Dentro de cada categoria, os jogos ficam em ordem da esquerda para a direita.',
  'tier.close': 'Fechar',
  'tier.none': 'Sem categoria',
  'tier.empty': 'Nada aqui',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Marcado para sair. O aplicativo não apaga nada da Steam — isso fica com você.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Baixar ou compartilhar',
  'result.export.hint':
    'Os arquivos são montados aqui, no navegador, e salvos por você — nada é enviado.',
  'result.exportJson': 'Ordem em JSON',
  'result.exportCsv': 'Lista em CSV',
  'result.copyText': 'Copiar como lista',
  'result.saveState': 'Backup do estado',
  'result.export.empty': 'Não há nada para exportar: a lista está vazia.',
  'result.export.failed': 'O arquivo não pôde ser montado: {message}',
  'result.export.jsonDone': 'A ordem final está salva em JSON.',
  'result.export.csvDone': 'A lista final está salva em CSV.',
  'result.copy.empty': 'Não há nada para copiar: a lista está vazia.',
  'result.copy.done': 'A lista numerada foi copiada para a área de transferência.',
  'result.copy.failed':
    'O navegador negou o acesso à área de transferência — a lista foi salva em um arquivo em vez '
    + 'disso.',
  'result.resetManual': 'Zerar os movimentos à mão',
  'result.resetManual.none': 'Não há nenhum movimento à mão.',
  'result.resetManual.title': 'Zerar os movimentos à mão?',
  'result.resetManual.text':
    'Isto esquece {moves} e devolve a lista à ordem que as comparações dão. As respostas das '
    + 'comparações ficam.',
  'result.resetManual.confirm': 'Zerar os movimentos',
  'result.resetManual.done': 'Os movimentos à mão foram zerados.',
  'result.resetAnswers': 'Zerar as respostas das comparações',
  'result.resetAnswers.none': 'Ainda não há nenhuma resposta.',
  'result.resetAnswers.title': 'Zerar as respostas das comparações?',
  'result.resetAnswers.text':
    'Isto apaga {answers} e faz as comparações começarem do zero. A lista de itens, as categorias '
    + 'e os movimentos à mão ficam. Não dá para desfazer.',
  'result.resetAnswers.confirm': 'Zerar as respostas',
  'result.resetAnswers.done': 'As respostas das comparações foram zeradas.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Esta não é a lista de desejos da Steam. Abra store.steampowered.com/wishlist, entre na conta '
    + 'e aperte o favorito lá. Nada foi enviado.',
  'bookmarklet.confirm':
    'A ordem de {items} vai ser escrita na lista de desejos da conta em que este navegador '
    + 'entrou. Nada é apagado. Não dá para desfazer: depois da escrita, cada entrada tem '
    + 'prioridade, inclusive as que não tinham nenhuma, e nenhum backup traz isso de volta.',
  'bookmarklet.write': 'Escrever a ordem',
  'bookmarklet.cancel': 'Cancelar',
  'bookmarklet.close': 'Fechar',
  'bookmarklet.sending': 'Enviando a ordem para a Steam…',
  'bookmarklet.done':
    'A Steam aceitou a ordem. Recarregue a página da lista de desejos e olhe: este bookmarklet '
    + 'não lê a página, então a conferência é sua.',
  'bookmarklet.unclear':
    'A Steam respondeu, mas a resposta não confirma nem nega nada. Recarregue a página da lista '
    + 'de desejos e olhe a ordem antes de repetir.',
  'bookmarklet.refused':
    'A Steam recusou a ordem e não disse nada de útil sobre o porquê. Recarregue a página da '
    + 'lista de desejos e olhe a ordem antes de repetir.',
  'bookmarklet.badRequest':
    'A Steam barrou a requisição na porta, com um 400 e um corpo vazio — ela nem chegou a olhar a '
    + 'ordem, então nada foi escrito. É isso que ela responde quando falta na requisição alguma '
    + 'coisa que ela exige, e a resposta não nomeia nada. Parece que o endpoint mudou; a página '
    + 'do projeto diz o que fazer nesse caso.',
  'bookmarklet.signedOut':
    'A Steam não aceitou a sessão — na maioria das vezes ela simplesmente expirou. Entre na Steam '
    + 'de novo, recarregue a lista de desejos e aperte o favorito mais uma vez. Nada foi escrito.',
  'bookmarklet.rateLimited':
    'A Steam respondeu “requisições demais”. Espere uns dois minutos e aperte o favorito de novo '
    + '— nada foi mudado.',
  'bookmarklet.tooLarge':
    'A requisição é grande demais para a Steam: a ordem inteira vai em uma requisição só, e esta '
    + 'não coube. Nada foi escrito. Uma lista assim pede o userscript, que consegue marcar as '
    + 'linhas na página em vez disso.',
  'bookmarklet.serverError':
    'O problema está do lado da Steam — ela respondeu com um erro de servidor. Tente daqui a '
    + 'alguns minutos; nada foi escrito.',
  'bookmarklet.offline':
    'A requisição nunca chegou à Steam. Pode ser que a rede tenha caído, ou que uma extensão '
    + 'tenha bloqueado. Nada foi escrito — confira a conexão e aperte o favorito de novo.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'N.º',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Título',
  'export.csv.category': 'Categoria',
  'export.csv.kind': 'Tipo',
  'export.csv.positionInCategory': 'Lugar na categoria',
  'export.csv.origin': 'De onde vem a ordem',
  'export.csv.wishlistPosition': 'Lugar na lista de desejos',
  'export.csv.url': 'Link',
  'export.origin.manual': 'à mão',
  'export.origin.comparisons': 'comparações',
  'export.origin.fallback': 'ordem de reserva',
  'export.kind.game': 'Jogo',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Desconhecido',
};

/* ------------------------------------------------------------- polish */

/** @type {Readonly<Record<string, string>>} */
const PL = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} pozycja',
  'count.items.few': '{count} pozycje',
  'count.items.many': '{count} pozycji',
  'count.records.one': '{count} rekord',
  'count.records.few': '{count} rekordy',
  'count.records.many': '{count} rekordów',
  'count.comparisonsMade.one': '{count} wykonane porównanie',
  'count.comparisonsMade.few': '{count} wykonane porównania',
  'count.comparisonsMade.many': '{count} wykonanych porównań',
  'count.comparisonsDone.one': 'wykonano {count} porównanie',
  'count.comparisonsDone.few': 'wykonano {count} porównania',
  'count.comparisonsDone.many': 'wykonano {count} porównań',
  'count.pairs.one': '{count} para',
  'count.pairs.few': '{count} pary',
  'count.pairs.many': '{count} par',
  'count.rows.one': '{count} wiersz',
  'count.rows.few': '{count} wiersze',
  'count.rows.many': '{count} wierszy',
  'count.moves.one': '{count} przestawienie',
  'count.moves.few': '{count} przestawienia',
  'count.moves.many': '{count} przestawień',
  'count.answers.one': '{count} odpowiedź',
  'count.answers.few': '{count} odpowiedzi',
  'count.answers.many': '{count} odpowiedzi',
  'count.marked.one': '{count} pozycja jest oznaczona do usunięcia',
  'count.marked.few': '{count} pozycje są oznaczone do usunięcia',
  'count.marked.many': '{count} pozycji jest oznaczonych do usunięcia',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Lokalne narzędzie, które porządkuje listę życzeń na Steamie porównaniami parami.',
  'a11y.skipToContent': 'Przejdź do treści',
  'a11y.progress.import': 'Wczytywanie listy życzeń',
  'a11y.progress.categorize': 'Pozycje z przypisaną kategorią',
  'a11y.progress.compare': 'Odpowiedzi na porównania',
  'nav.aria': 'Etapy',
  'nav.import': 'Lista życzeń',
  'nav.categorize': 'Kategorie',
  'nav.compare': 'Porównania',
  'nav.result': 'Wynik',
  'nav.state.done': 'etap ukończony',
  'nav.state.current': 'bieżący etap',
  'nav.state.locked': 'etap jeszcze niedostępny',
  'settings.title': 'Ustawienia',
  'settings.covers': 'Wczytuj okładki',
  'settings.language': 'Język interfejsu',
  'settings.theme': 'Motyw',
  'theme.modern': 'Nowoczesny',
  'theme.steam': 'Jak na Steamie',
  'actions.saveState': 'Zapisz kopię',
  'actions.loadState': 'Wczytaj kopię',
  'actions.skipStage': 'Pomiń kategorie',
  'actions.reset': 'Zacznij od nowa',
  'privacy.short': 'Działa lokalnie · twoje dane nie trafiają na cudze serwery',
  'privacy.details': 'Szczegóły',
  'privacy.note':
    'Dane nie opuszczają przeglądarki. Jedyne zapytanie na zewnątrz, jakie aplikacja wysyła sama '
    + 'z siebie, to pobranie okładek gier z CDN Steama pod publicznym adresem; wyłącza je '
    + 'przełącznik „Wczytuj okładki”. O import prosto z konta pyta lokalny serwer na twoim własnym '
    + 'komputerze: zapytanie idzie do Steama i do nikogo więcej, i tylko wtedy, gdy naciśniesz '
    + 'przycisk.',
  'dialog.title': 'Potwierdź działanie',
  'dialog.cancel': 'Anuluj',
  'dialog.confirm': 'Kontynuuj',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Otwórz na Steamie ↗',
  'common.openInSteamAria': 'Otwórz „{title}” na Steamie, w nowej karcie',
  'category.must': 'Bardzo chcę',
  'category.want': 'Chcę',
  'category.maybe': 'Może',
  'category.unlikely': 'Raczej nie',
  'category.meh': 'Prawie mnie nie interesuje',
  'category.remove': 'Usuń z listy życzeń',
  'category.none': 'Bez kategorii',
  'kind.game': 'Gra',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Typ nieznany',
  'cover.none': 'Bez okładki',
  'cover.off': 'Okładki są wyłączone',
  'cover.failed': 'Okładka się nie wczytała',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'Nie udało się zapisać stanu w przeglądarce. Zapisz go do pliku, żeby nic nie przepadło.',
  'app.saveFailedReason': 'Nie udało się zapisać stanu: {message}',
  'app.loadFailed':
    'Zapisanego stanu nie udało się odczytać ({message}). Zaczynamy od pustej listy.',
  'app.covers.on': 'Okładki są włączone: aplikacja pobiera obrazki z CDN Steama.',
  'app.covers.off': 'Okładki są wyłączone: aplikacja nie wysyła żadnego zapytania na zewnątrz.',
  'app.language.changed': 'Język interfejsu: {language}.',
  'app.theme.changed': 'Motyw: {theme}.',
  'app.reset.title': 'Zacząć od nowa?',
  'app.reset.text':
    'Usunięte zostanie wszystko: {items}, kategorie, odpowiedzi z porównań i ręczne przestawienia. '
    + 'Tego nie da się cofnąć — jeśli praca może się jeszcze przydać, zapisz ją najpierw do pliku.',
  'app.reset.confirm': 'Usuń wszystko i zacznij od nowa',
  'app.reset.done': 'Stan wyczyszczony.',
  'app.state.buildFailed': 'Nie udało się złożyć pliku stanu: {message}',
  'app.state.saved': 'Stan zapisany do pliku.',
  'app.saved': 'Postęp zapisany w tej przeglądarce',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Kolejność, którą wybrałeś sam',
  'import.promise': 'Ustaw gry według tego, jak bardzo naprawdę chcesz w nie zagrać',
  'import.lead':
    'Najpierw szybko rozłóż listę życzeń według zainteresowania, potem wybieraj między dwiema '
    + 'grami. Przerwać można w każdej chwili — postęp zapisuje się sam.',
  'import.step.load': 'Wczytaj listę życzeń',
  'import.step.group': 'Rozłóż według zainteresowania',
  'import.step.compare': 'Porównaj gry',
  'import.step.send': 'Wyślij kolejność na Steama',
  'import.sessions':
    'Pełne sortowanie może zająć kilka posiedzeń. Bieżący wynik jest dostępny zawsze.',
  'import.other': 'Inne sposoby importu',
  'import.file.title': 'Plik JSON',
  'import.file.hint': 'Eksport ze Steama albo plik zebrany przez userscript.',
  'import.file.button': 'Wybierz plik…',
  'import.file.none': 'Nie wybrano pliku',
  'import.paste.title': 'Wklej JSON',
  'import.paste.hint': 'Treść odpowiedzi Steama można wkleić tak, jak jest.',
  'import.paste.label': 'JSON listy życzeń',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Importuj z tekstu',
  'import.userscript.title': 'Ze strony Steama, przez userscript',
  'import.userscript.hint':
    'Pobrany przez niego plik wczytuje się tutaj pozycją „Plik JSON” wyżej.',
  'import.state.title': 'Zapisany stan',
  'import.state.hint':
    'Plik zapisany wcześniej przyciskiem „Zapisz kopię”: wracają i kategorie, i wszystkie '
    + 'odpowiedzi.',
  'import.state.button': 'Wybierz plik stanu…',
  'import.demo.button': 'Wypróbuj na 20 grach',
  'import.ready.eyebrow': 'Gotowe',
  'import.ready.count.one': 'Wczytano {count} pozycję',
  'import.ready.count.few': 'Wczytano {count} pozycje',
  'import.ready.count.many': 'Wczytano {count} pozycji',
  'import.ready.next':
    'Dalej rozłożymy gry na pięć poziomów zainteresowania. Właśnie to skraca liczbę porównań.',
  'import.ready.start': 'Zacznij rozkładać',
  'import.ready.again': 'Wczytaj inną listę',
  'import.current':
    'Na liście jest teraz: {items} — {sorted} z kategorią, {plain} bez. Wykonanych porównań: '
    + '{comparisons}. Ponowny import odświeża pozycje i zachowuje już wykonaną pracę.',
  'import.announce': 'Zaimportowano: {count}. Na liście jest teraz: {total}.',
  'import.source.file': 'Plik {name}',
  'import.source.pasted': 'Wklejony tekst',
  'import.source.demo': 'Zestaw demonstracyjny',
  'import.report.title': '{source}: wczytano {records}',
  'import.report.added': 'dodano',
  'import.report.updated': 'zaktualizowano',
  'import.report.duplicates': 'duplikatów',
  'import.report.skipped': 'pominięto',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': 'rekord nr {number}',
  'import.issue.key': 'klucz „{key}”',
  'import.issue.more': '…i jeszcze {count}',
  'import.skip.notAnObject': 'rekord nie wygląda ani na pozycję, ani na app id',
  'import.skip.missingAppId': 'brak identyfikatora aplikacji',
  'import.skip.invalidAppId': 'identyfikator aplikacji nie jest liczbą',
  'import.skip.duplicateInInput': 'pozycja już wystąpiła w tym samym pliku',
  'import.error.title': 'Import się nie udał',
  'import.error.emptyInput': 'Nie ma czego importować: plik albo pole są puste.',
  'import.error.invalidJson':
    'To nie jest JSON. Wygląda na to, że tekst skopiowano nie w całości albo trafiło do niego coś '
    + 'zbędnego.',
  'import.error.unrecognizedFormat':
    'JSON został odczytany, ale nie wygląda na listę życzeń. Potrzebna jest tablica pozycji, '
    + 'obiekt postaci { "440": { … } } albo odpowiedź Steama z polem response.items.',
  'import.error.emptyResultTitle': 'Import się udał, ale lista jest pusta',
  'import.error.emptyResultText':
    'Nie udało się odczytać ani jednej pozycji. Sprawdź, czy w pliku naprawdę jest lista życzeń.',
  'import.error.fileRead': 'Pliku nie udało się odczytać',
  'import.demo.failedTitle': 'Zestaw demonstracyjny się nie wczytał',
  'import.demo.failedText':
    '{message}. Plik {url} musi leżeć obok index.html — a strona musi być otwarta przez http(s), '
    + 'a nie jako file://.',
  'import.demo.httpError': 'serwer odpowiedział {status}',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Wczytaj ze Steama',
  'steam.subtitle': 'Najprostsza droga dla otwartej listy życzeń',
  'steam.field': 'Twój profil Steam',
  'steam.placeholder': 'steamcommunity.com/id/twojanazwa, nick albo SteamID64',
  'steam.run': 'Sprawdź i wczytaj',
  'steam.cancel': 'Zatrzymaj',
  'steam.checking': 'Szukamy lokalnego serwera…',
  'steam.warning': 'Automatyczny import działa, gdy „Szczegóły gier” są publiczne.',
  'steam.privateAsk': 'A jeśli są prywatne?',
  'steam.privateHelp':
    'Otwórz swój profil Steam, wybierz „Edytuj profil”, potem „Ustawienia prywatności” i ustaw '
    + '„Szczegóły gier” na „Publiczne”. Jeśli wolisz ich nie otwierać, userscript z „Innych '
    + 'sposobów importu” czyta stronę, na której już jesteś zalogowany, i radzi sobie z prywatną '
    + 'listą.',
  'steam.settingsLink': 'Otwórz ustawienia Steama ↗',
  'steam.blocked.title': 'Steam nie udostępnił listy życzeń',
  'steam.blocked.text':
    'Zwykle znaczy to, że „Szczegóły gier” są prywatne: lista życzeń idzie właśnie za tym jednym '
    + 'ustawieniem.',
  'steam.blocked.unavailableTitle': 'Nie udało się pobrać listy życzeń',
  'steam.blocked.unavailableText':
    'Steam odpowiedział błędem, a błędem odpowiada zarówno na listę, której nie oddaje, jak i na '
    + 'własne kłopoty. Dlatego tak: jeśli „Szczegóły gier” są prywatne, kroki niżej je otwierają; '
    + 'jeśli już są publiczne, poczekaj kilka minut i naciśnij „Sprawdź jeszcze raz”.',
  'steam.blocked.step1': 'Otwórz swój profil Steam i wybierz „Edytuj profil”.',
  'steam.blocked.step2': 'Otwórz „Ustawienia prywatności”.',
  'steam.blocked.step3': 'Ustaw „Szczegóły gier” na „Publiczne”.',
  'steam.blocked.step4': 'Wróć tutaj i naciśnij „Sprawdź jeszcze raz”.',
  'steam.blocked.settings': 'Otwórz ustawienia Steama',
  'steam.blocked.again': 'Sprawdź jeszcze raz',
  'steam.blocked.keepPrivate': 'Nie chcę tego upubliczniać',
  'steam.userscript.lead':
    'Zbierz listę prosto ze strony Steama. Userscript czyta stronę listy życzeń, na której już '
    + 'jesteś zalogowany, więc ustawienie prywatności mu nie przeszkadza, i sam nie wysyła żadnego '
    + 'zapytania.',
  'steam.userscript.step1':
    'Zainstaluj Tampermonkey — jest dla Chrome, Edge, Firefoksa i Opery.',
  'steam.userscript.step2': 'Zainstaluj skrypt „steam-wishlist-export.user.js” z repozytorium.',
  'steam.userscript.step3':
    'Otwórz stronę swojej listy życzeń i naciśnij „Collect the list”, potem „Download JSON”.',
  'steam.userscript.step4': 'Wróć tutaj i wybierz ten plik w „Innych sposobach importu”.',
  'steam.userscript.link': 'Otwórz skrypt na GitHubie ↗',
  'steam.offline.title': 'Wczytaj moją listę życzeń',
  'steam.offline.subtitle': 'Wybierz prostszą drogę',
  'steam.offline.text':
    'Przeglądarka nie pozwala tej stronie czytać Steama wprost, a lokalnego serwera, który '
    + 'zapytałby za nią, za stroną nie ma. Twoje dane i tak zostają twoje.',
  'steam.offline.instructions': 'Pokaż instrukcję',
  'steam.offline.userscript.badge': 'Działa też z prywatnymi listami',
  'steam.offline.userscript.title': 'Import ze strony Steama',
  'steam.offline.local.title': 'Uruchom wersję lokalną',
  'steam.offline.local.text': 'Dalej wystarczy odnośnik do publicznego profilu.',
  'steam.offline.local.download': 'Pobierz',
  'steam.offline.local.step1': 'Zainstaluj Node.js 20 albo nowszy.',
  'steam.offline.local.step2': 'Rozpakuj archiwum gdziekolwiek.',
  'steam.offline.local.step3':
    'Uruchom „start.bat” w Windowsie albo „node server.js” w macOS i Linuksie.',
  'steam.offline.local.step4': 'Otwórz w przeglądarce http://localhost:8080/.',
  'steam.step.account': 'Szukamy konta…',
  'steam.step.wishlist': 'Pytamy Steama o listę życzeń…',
  'steam.step.titles': 'Tytuły: {done} z {total}',
  'steam.step.waiting': 'Steam ogranicza liczbę zapytań. Czekamy {seconds} s i pytamy znowu…',
  'steam.note':
    'Jeden tytuł to jedno zapytanie, więc długa lista zajmuje minuty. Wszystko, co już przyszło, '
    + 'jest zapisane — zatrzymanie niczego nie traci.',
  'steam.done.title': 'Lista życzeń dotarła',
  'steam.done.titlesTitle': 'Tytuły zostały pobrane',
  'steam.done.titlesText': 'Na liście: {items}, z tytułem ze Steama: {titles}.',
  'steam.done.text': 'Konto Steam {account}. Na liście: {items}, z tytułem ze Steama: {titles}.',
  'steam.done.missing.one':
    'Steam nie oddał {count} tytułu: ta pozycja jest pokazana przez App ID.',
  'steam.done.missing.few':
    'Steam nie oddał {count} tytułów: te pozycje są pokazane przez App ID.',
  'steam.done.missing.many':
    'Steam nie oddał {count} tytułów: te pozycje są pokazane przez App ID.',
  'steam.done.throttled':
    'Steam przestał odpowiadać przy tytule {done} z {total}: ogranicza liczbę zapytań. Wszystko, '
    + 'co zdążyło przyjść, jest już na liście — spróbuj przycisku znowu za kilka minut.',
  'steam.missing.text.one':
    '{count} pozycja na liście jest wciąż pokazana przez App ID, a nie przez tytuł.',
  'steam.missing.text.few':
    '{count} pozycje na liście są wciąż pokazane przez App ID, a nie przez tytuł.',
  'steam.missing.text.many':
    '{count} pozycji na liście jest wciąż pokazanych przez App ID, a nie przez tytuł.',
  'steam.missing.run': 'Pobierz pozostałe tytuły',
  'steam.cancelled': 'Zatrzymane. Wszystko, co zdążyło przyjść, zostało na liście.',
  'steam.error.title': 'Import ze Steama się nie udał',
  'steam.error.emptyInput':
    'Pole jest puste: wpisz SteamID64, nazwę profilu albo odnośnik do profilu.',
  'steam.error.invalidAccount':
    'To nie jest ani SteamID64 (17 cyfr), ani nazwa profilu Steam, ani odnośnik do profilu na '
    + 'steamcommunity.com.',
  'steam.error.accountNotFound':
    'Takiego konta na Steamie nie ma. Sprawdź pisownię — albo otwórz swój profil w przeglądarce '
    + 'i skopiuj adres strony.',
  'steam.error.wishlistEmpty': 'Lista życzeń tego konta jest pusta: nie ma jeszcze czego sortować.',
  'steam.error.rateLimited':
    'Steam ogranicza liczbę zapytań: z tego adresu przyszło ich za dużo. Po kilku minutach '
    + 'ograniczenie znika — wtedy spróbuj jeszcze raz.',
  'steam.error.network':
    'Do Steama nie da się dobić. Sprawdź połączenie i to, czy lokalny serwer nadal działa.',
  'steam.error.steamError':
    'Steam odpowiedział czymś nieoczekiwanym. Zwykle to chwilowe kłopoty po jego stronie; spróbuj '
    + 'trochę później.',
  'steam.error.notLocal': 'Lokalny serwer odpowiada tylko na zapytania z localhosta.',
  'steam.error.unknown': 'Nieoczekiwany błąd: {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'Plik stanu nie czyta się jako JSON.',
  'state.error.foreignState':
    'To JSON innej aplikacji: nie ma w nim podpisu Steam Wishlist Sorter.',
  'state.error.unsupportedVersion':
    'Plik został zapisany przez inną wersję formatu i nie jest obsługiwany.',
  'state.error.invalidState': 'Plik wygląda na stan, ale nie ma w nim sesji.',
  'state.error.writeFailed': 'Stan został odczytany, ale przeglądarka odmówiła jego zapisania.',
  'state.confirm.title': 'Wczytać stan na miejsce bieżącego?',
  'state.confirm.text':
    'Obecny stan: {items}, {comparisons}. Plik zastępuje to wszystko w całości: listę, kategorie, '
    + 'odpowiedzi i ręczne przestawienia. Tego nie da się cofnąć.',
  'state.confirm.confirm': 'Zastąp bieżący stan',
  'state.confirm.cancelled': 'Import stanu anulowany — nic się nie zmieniło.',
  'state.restored.title': 'Stan przywrócony',
  'state.restored.items': 'pozycji',
  'state.restored.comparisons': 'wykonanych porównań',
  'state.restored.moves': 'ręcznych przestawień',
  'state.restored.toast': 'Stan przywrócony z pliku.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': 'Krok 2 z 4',
  'categorize.heading': 'Jak bardzo interesuje cię ta gra?',
  'categorize.hint': 'Nie zastanawiaj się długo — kategorię można zmienić później.',
  'categorize.buttonsAria': 'Poziomy zainteresowania',
  'categorize.more': 'Bardziej interesuje',
  'categorize.less': 'Mniej interesuje',
  'categorize.or': 'albo',
  'categorize.counter': '{index} z {total}',
  'categorize.back': '← Poprzednia',
  'categorize.defer': 'Odłóż <kbd>Space</kbd>',
  'categorize.done': 'Każda pozycja ma kategorię.',
  'categorize.toCompare': 'Przejdź do porównań',
  'categorize.empty': 'Lista jest pusta: najpierw zaimportuj listę życzeń.',
  'categorize.toImport': 'Przejdź do importu',
  'categorize.position': 'Miejsce na twojej liście życzeń: {position}',
  'categorize.current': 'Teraz: {category}. Wybierz inną kategorię, żeby to zmienić.',
  'categorize.legendLeft': 'pozostało: {items}',
  'categorize.firstItem': 'To pierwsza pozycja listy.',
  'categorize.noneLeft': 'Nie ma już nierozłożonych pozycji.',
  'categorize.postponed': '{title} — odłożone, wrócimy do tego na końcu rundy.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': 'Pominąć kategorie?',
  'categorize.skipText':
    'Wszystkie pozycje zostaną bez kategorii, a porównania pójdą po całej liście jak po jednej '
    + 'grupie — pytań będzie znacznie więcej niż przy pięciu mniejszych grupach. Nic nie przepada: '
    + 'do tego etapu można wrócić w każdej chwili.',
  'categorize.skipConfirm': 'Pomiń i przejdź do porównań',
  'categorize.skipDone': 'Etap pominięty: porównania idą po całej liście.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': 'Krok 3 z 4',
  'compare.heading': 'Na którą grę masz większą ochotę?',
  'compare.headingDone': 'Porównania skończone',
  'compare.hint': 'Wybieraj szybko. Parę, o której nie da się zdecydować, można odłożyć.',
  'compare.progress': 'Kategoria „{category}” · {made} · pozostało około: {left}',
  'compare.deferred': 'odłożono: {pairs}',
  'compare.preferA': 'Chcę bardziej <kbd>A</kbd>',
  'compare.preferB': 'Chcę bardziej <kbd>D</kbd>',
  'compare.drop': 'Już mnie nie interesuje',
  'compare.or': 'albo',
  'compare.tie': 'Mniej więcej tak samo <kbd>S</kbd>',
  'compare.defer': 'Nie umiem zdecydować <kbd>Space</kbd>',
  'compare.undo': 'Cofnij <kbd>Backspace</kbd>',
  'compare.finish': 'Skończ na dziś',
  'compare.finishNote': 'Postęp jest zapisany — bieżący wynik można od razu obejrzeć.',
  'compare.done': 'Nie ma już czego porównywać: kolejność jest ustalona.',
  'compare.empty': 'Nie ma czego porównywać: lista jest pusta.',
  'compare.toResult': 'Zobacz wynik',
  'compare.toImport': 'Przejdź do importu',
  'compare.banner.allDeferred':
    'Wszystkie inne pytania są odłożone ({count}), a bez odpowiedzi na to nie da się iść dalej. '
    + '„Mniej więcej tak samo” to też odpowiedź i sortowanie ruszy dalej.',
  'compare.banner.forced': 'Ta para jest potrzebna, żeby iść dalej.',
  'compare.rejected': 'Odpowiedź nie została przyjęta: {message}',
  'compare.dropped': '„{title}” trafiło na listę do usunięcia z listy życzeń.',
  'compare.nothingToUndo': 'Nie ma czego cofać.',
  'compare.undone': 'Ostatnia odpowiedź cofnięta.',
  'compare.chosen': 'Wybrane: {title}.',
  'compare.tied': '{a} i {b} — mniej więcej tak samo.',
  'compare.postponed': 'Para odłożona.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Jasne',
  'onboarding.categorize.title': 'Najpierw z grubsza rozdziel gry według zainteresowania',
  'onboarding.categorize.lead':
    'Gry będą pokazywane po jednej, a każdą trzeba postawić na skali pięciu poziomów — albo od '
    + 'razu na liście do usunięcia z listy życzeń.',
  'onboarding.categorize.why':
    'To właśnie skraca sortowanie: gry porównuje się tylko wewnątrz własnej grupy, więc zgrubny '
    + 'podział teraz oszczędza setki pytań później.',
  'onboarding.categorize.later':
    'Nie zastanawiaj się długo. Kategorię można zmienić w każdej chwili — wróć do gry przyciskiem '
    + '„Poprzednia” albo zmień ją na ekranie wyniku.',
  'onboarding.compare.title': 'Teraz wybieramy między dwiema grami',
  'onboarding.compare.lead':
    'Po dwie gry naraz, obie z tej samej grupy. Wybierz tę, na którą masz większą ochotę — '
    + 'klawisze A i D albo strzałki.',
  'onboarding.compare.tie':
    'Jeśli masz ochotę tak samo, powiedz „Mniej więcej tak samo”: to też odpowiedź i sortowanie ją '
    + 'wykorzysta.',
  'onboarding.compare.defer':
    'Trudną parę można odłożyć spacją — wróci, gdy skończą się łatwe.',
  'onboarding.compare.stop':
    'Skończyć można kiedykolwiek. Każda odpowiedź jest zapisywana, a wynik można obejrzeć w każdej '
    + 'chwili — skończony czy nie.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': 'Krok 4 z 4',
  'result.head.usable': 'Wyniku można już używać',
  'result.head.ready': 'Twoja kolejność jest gotowa',
  'result.head.empty': 'Nie ma jeszcze czego porządkować',
  'result.lead.usable': 'Przenieś ją na Steama teraz albo poprawiaj dalej kolejnymi odpowiedziami.',
  'result.lead.ready': 'Każde miejsce w niej wynika z twoich własnych odpowiedzi.',
  'result.lead.empty': 'Zaimportuj listę życzeń, a kolejność pojawi się tutaj.',
  'result.continue': 'Kontynuuj porównania',
  'result.complete': 'Sortowanie zakończone',
  'result.toImport': 'Przejdź do importu',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Można już używać',
  'result.summary.headline': 'Ułożone według twoich odpowiedzi: {items}',
  'result.summary.headlineAll': 'Cała lista jest ułożona według twoich odpowiedzi',
  'result.summary.headlineNone': 'Żadne miejsce nie wynika jeszcze z odpowiedzi',
  'result.summary.rest':
    'Reszta zachowuje kolejność, którą miała na liście życzeń; na liście niżej widać które.',
  'result.summary.choice':
    'Tę kolejność można przenieść na Steama od razu albo porównywać dalej — każda odpowiedź ją '
    + 'poprawia.',
  'result.summary.done': 'Nie ma już czego porównywać. Przenieś kolejność na Steama.',
  'result.summary.empty': 'Lista jest pusta: nie ma jeszcze czego pokazywać.',
  'result.summary.allRemoved': 'Nie ma czego porządkować: {marked} z listy życzeń.',
  'result.stats.total': 'na liście',
  'result.stats.confirmed': 'potwierdzonych',
  'result.stats.removed': 'oznaczonych do usunięcia',
  'result.built.summary': 'Jak powstała ta kolejność?',
  'result.built.categories':
    'Najpierw idą kategorie, w kolejności zainteresowania; wewnątrz kategorii o miejscu decydują '
    + 'porównania.',
  'result.built.resolved':
    'Miejsca ustalone twoimi odpowiedziami: {resolved} z {total}. Pozostałe pozycje ({fallback}) '
    + 'stoją tam, gdzie stały na liście życzeń — to kolejność zapasowa, oznaczona na liście.',
  'result.built.answers': 'Odpowiedzi na porównania do tej pory: {count}.',
  'result.built.manual':
    'Ręcznie przestawiono: {items}. Ręczne przestawienie jest nakładane na to, co dają porównania, '
    + 'więc nowe odpowiedzi dalej poprawiają listę wokół niego.',
  'result.built.noManual': 'Ręcznie niczego nie przestawiano.',
  'result.built.complete':
    'Sortowanie zakończone: na każdą parę, której wymagała kolejność, jest odpowiedź.',
  'result.built.incomplete': 'Sortowanie nie jest skończone — można je wznowić w każdej chwili.',
  'result.legend.sorted': 'potwierdzone porównaniami',
  'result.legend.fallback': 'wciąż w dawnej kolejności — według miejsca na liście życzeń',
  'result.legend.manual': 'przestawione ręcznie',
  'result.legend.tied': 'na równi z wierszem wyżej',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Główne działanie',
  'result.transfer.heading': 'Przenieś kolejność na Steama',
  'result.transfer.sub': 'Bez rozszerzeń i bez dodatkowych programów',
  'result.transfer.step1': 'Pokaż pasek zakładek',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — w Chrome, Edge i Firefoksie.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — w Chrome, Edge i Firefoksie.',
  'result.transfer.shortcutSafari': 'W Safari: menu „Widok” → „Pokaż pasek ulubionych”.',
  'result.transfer.step2': 'Przeciągnij ten odnośnik na pasek',
  'result.transfer.step3': 'Otwórz swoją listę życzeń i naciśnij zakładkę',
  'result.transfer.openWishlist': 'Otwórz moją listę życzeń ↗',
  'result.transfer.link': 'Przenieś moją kolejność na Steama',
  'result.transfer.copy': 'Skopiuj odnośnik',
  'result.transfer.carries': 'Zawartość odnośnika: {items}.',
  'result.transfer.fresh':
    'Odnośnik składa się od nowa przy każdej zmianie, więc stąd zawsze zabierasz bieżącą '
    + 'kolejność.',
  'result.transfer.taken':
    'To ten sam odnośnik, który zabrałeś, i wciąż zapisuje dokładnie tę kolejność, co niżej.',
  'result.transfer.stale': 'Kolejność się zmieniła — zastąp starą zakładkę odnośnikiem po zmianie.',
  'result.transfer.copied': 'Odnośnik skopiowany. Utwórz zakładkę ręcznie i wklej go jako adres.',
  'result.transfer.copyFailed':
    'Przeglądarka odmówiła dostępu do schowka — przeciągnij odnośnik na pasek zakładek.',
  'result.transfer.clickToast':
    'Tego odnośnika nie naciska się tutaj: przeciągnij go na pasek zakładek i naciśnij już na '
    + 'stronie listy życzeń na Steamie.',
  'result.transfer.empty': 'Lista jest pusta — nie ma jeszcze czego przenosić.',
  'result.transfer.failed': 'Nie udało się złożyć odnośnika: {message}',
  'result.transfer.mobile':
    'Na telefonie albo tablecie jest to niewygodne: bookmarklet trzeba przeciągnąć na pasek '
    + 'zakładek. Przeniesienie łatwiej zrobić w przeglądarce na komputerze.',
  'result.transfer.warnAccount':
    'Kolejność zapisuje się na koncie, na które zalogowana jest ta przeglądarka.',
  'result.transfer.warnNoDelete':
    'Nic nie jest usuwane: pozycje oznaczone do usunięcia trafiają na koniec listy.',
  'result.transfer.warnPriority':
    'Po zapisie każda pozycja ma priorytet, także te, które go wcześniej nie miały.',
  'result.transfer.warnNoBackup':
    'Bookmarklet nie robi kopii zapasowej i potem niczego nie sprawdza.',
  'result.transfer.warnReload':
    'Gdy będzie po wszystkim, przeładuj stronę Steama i przełącz sortowanie na własną kolejność.',
  'result.transfer.advanced': 'Potrzebna kopia zapasowa i automatyczne sprawdzenie?',
  'result.transfer.advancedText':
    'Userscript czyta samą stronę listy życzeń: zapisuje do pliku kolejność, która jest teraz, '
    + 'zapisuje nową i potem sprawdza, czy dojechała. Potrzebuje Tampermonkey — dlatego to droga '
    + 'dłuższa, a nie główna.',
  'result.transfer.advancedStep2':
    'Zainstaluj skrypt „steam-wishlist-import-order.user.js” z repozytorium.',
  'result.transfer.advancedStep3':
    'Otwórz stronę swojej listy życzeń i idź za panelem, który postawi skrypt.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Twoja kolejność',
  'result.search': 'Szukaj po tytule albo App ID',
  'result.filterAria': 'Co pokazywać',
  'result.filter.all': 'Wszystko',
  'result.filter.game': 'Gry',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Wiersz można przeciągnąć myszą albo zaznaczyć i przenieść <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd>. Przestawienia są zapisywane i przeżywają przeładowanie.',
  'result.removed.hint': 'Te pozycje nie wchodzą do numeracji końcowej listy.',
  'result.mark.confirmed': 'Potwierdzone porównaniami',
  'result.mark.fallback': 'Wciąż w dawnej kolejności',
  'result.mark.manual': 'Przestawione ręcznie',
  'result.mark.tied': 'Na równi z wierszem wyżej',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · {position} w kategorii',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Kategoria: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': 'widoczne: {shown} z {total}',
  'result.empty.filter': 'Pod filtr ani pod wyszukiwanie nie trafiła żadna pozycja.',
  'result.empty.noItems': 'Zaimportuj listę życzeń, a wynik pojawi się tutaj.',
  'result.empty.allRemoved': 'Każda pozycja jest oznaczona do usunięcia — nie ma czego porządkować.',
  'result.move.failed': 'Nie udało się przestawić: {message}',
  'result.move.announce': '„{title}” {where}{category}.',
  'result.move.place': 'na miejsce {position}',
  'result.move.newPlace': 'na nowe miejsce',
  'result.move.categorySuffix': ', kategoria: {category}',
  'result.move.categoryToast': '„{title}” przeniesione do „{category}”.',
  'result.move.edge':
    'To {edge} wiersz kategorii „{category}”. Kategorię zmienia się wyborem w samym wierszu.',
  'result.move.edgeFirst': 'pierwszy',
  'result.move.edgeLast': 'ostatni',
  'result.category.failed': 'Nie udało się zmienić kategorii: {message}',
  'result.category.toast': '„{title}” — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Pokaż tier listę',
  'tier.title': 'Tier lista listy życzeń',
  'tier.lead': 'W każdej kategorii gry stoją po kolei od lewej do prawej.',
  'tier.close': 'Zamknij',
  'tier.none': 'Bez kategorii',
  'tier.empty': 'Tu nic nie ma',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Oznaczone do usunięcia. Aplikacja niczego nie usuwa ze Steama — to zostaje po twojej stronie.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'Pobierz albo udostępnij',
  'result.export.hint':
    'Pliki powstają tutaj, w przeglądarce, i zapisujesz je ty — nic nigdzie nie jest wysyłane.',
  'result.exportJson': 'Kolejność jako JSON',
  'result.exportCsv': 'Lista jako CSV',
  'result.copyText': 'Skopiuj jako listę',
  'result.saveState': 'Kopia zapasowa stanu',
  'result.export.empty': 'Nie ma czego wyeksportować: lista jest pusta.',
  'result.export.failed': 'Nie udało się złożyć pliku: {message}',
  'result.export.jsonDone': 'Końcowa kolejność zapisana jako JSON.',
  'result.export.csvDone': 'Końcowa lista zapisana jako CSV.',
  'result.copy.empty': 'Nie ma czego kopiować: lista jest pusta.',
  'result.copy.done': 'Numerowana lista skopiowana do schowka.',
  'result.copy.failed':
    'Przeglądarka odmówiła dostępu do schowka — lista została zapisana jako plik.',
  'result.resetManual': 'Wyzeruj ręczne przestawienia',
  'result.resetManual.none': 'Nie ma ręcznych przestawień.',
  'result.resetManual.title': 'Wyzerować ręczne przestawienia?',
  'result.resetManual.text':
    'Do skasowania: {moves}. Lista wróci do kolejności, którą dają porównania. Odpowiedzi z '
    + 'porównań zostają.',
  'result.resetManual.confirm': 'Wyzeruj przestawienia',
  'result.resetManual.done': 'Ręczne przestawienia wyzerowane.',
  'result.resetAnswers': 'Wyzeruj odpowiedzi z porównań',
  'result.resetAnswers.none': 'Nie ma jeszcze odpowiedzi.',
  'result.resetAnswers.title': 'Wyzerować odpowiedzi z porównań?',
  'result.resetAnswers.text':
    'Do usunięcia: {answers}. Porównania zaczną się od zera, a lista pozycji, kategorie i ręczne '
    + 'przestawienia zostają. Tego nie da się cofnąć.',
  'result.resetAnswers.confirm': 'Wyzeruj odpowiedzi',
  'result.resetAnswers.done': 'Odpowiedzi z porównań wyzerowane.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'To nie jest lista życzeń Steama. Otwórz store.steampowered.com/wishlist, zaloguj się i '
    + 'naciśnij zakładkę tam. Nic nie zostało wysłane.',
  'bookmarklet.confirm':
    'Ta kolejność ({items}) zostanie zapisana na liście życzeń konta, na które zalogowana jest ta '
    + 'przeglądarka. Nic nie jest usuwane. Tego nie da się cofnąć: po zapisie każda pozycja ma '
    + 'priorytet, także te, które go wcześniej nie miały, i żadna kopia zapasowa tego nie '
    + 'przywróci.',
  'bookmarklet.write': 'Zapisz kolejność',
  'bookmarklet.cancel': 'Anuluj',
  'bookmarklet.close': 'Zamknij',
  'bookmarklet.sending': 'Wysyłamy kolejność na Steama…',
  'bookmarklet.done':
    'Steam przyjął kolejność. Przeładuj stronę listy życzeń i spójrz na nią: ten bookmarklet '
    + 'strony nie czyta, więc sprawdzenie należy do ciebie.',
  'bookmarklet.unclear':
    'Steam odpowiedział, ale z odpowiedzi nie wynika ani tak, ani nie. Przeładuj stronę listy '
    + 'życzeń i spójrz na kolejność, zanim powtórzysz.',
  'bookmarklet.refused':
    'Steam odrzucił kolejność i nie powiedział nic użytecznego o powodzie. Przeładuj stronę listy '
    + 'życzeń i spójrz na kolejność, zanim powtórzysz.',
  'bookmarklet.badRequest':
    'Steam odrzucił zapytanie już na progu: 400 i puste ciało — do kolejności nawet nie dotarł, '
    + 'więc nic nie zostało zapisane. Tak odpowiada, gdy zapytaniu brakuje czegoś, czego wymaga, '
    + 'a sama odpowiedź tego nie nazywa. Wygląda na to, że endpoint się zmienił; co z tym zrobić, '
    + 'jest napisane na stronie projektu.',
  'bookmarklet.signedOut':
    'Steam nie przyjął sesji — najczęściej po prostu wygasła. Zaloguj się na Steama jeszcze raz, '
    + 'przeładuj listę życzeń i naciśnij zakładkę ponownie. Nic nie zostało zapisane.',
  'bookmarklet.rateLimited':
    'Steam odpowiedział „za dużo zapytań”. Poczekaj parę minut i naciśnij zakładkę znowu — nic się '
    + 'nie zmieniło.',
  'bookmarklet.tooLarge':
    'Zapytanie jest dla Steama za duże: cała kolejność idzie jednym zapytaniem, a to się nie '
    + 'zmieściło. Nic nie zostało zapisane. Do takiej listy potrzebny jest userscript — on umie '
    + 'zamiast zapisu oznaczyć wiersze prosto na stronie.',
  'bookmarklet.serverError':
    'Kłopot jest po stronie Steama — odpowiedział błędem serwera. Spróbuj za kilka minut; nic nie '
    + 'zostało zapisane.',
  'bookmarklet.offline':
    'Zapytanie w ogóle nie dotarło do Steama. Może nie ma sieci, a może zablokowało je '
    + 'rozszerzenie. Nic nie zostało zapisane — sprawdź połączenie i naciśnij zakładkę znowu.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'Nr',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Tytuł',
  'export.csv.category': 'Kategoria',
  'export.csv.kind': 'Typ',
  'export.csv.positionInCategory': 'Miejsce w kategorii',
  'export.csv.origin': 'Skąd kolejność',
  'export.csv.wishlistPosition': 'Miejsce na liście życzeń',
  'export.csv.url': 'Odnośnik',
  'export.origin.manual': 'ręcznie',
  'export.origin.comparisons': 'porównania',
  'export.origin.fallback': 'kolejność zapasowa',
  'export.kind.game': 'Gra',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Nieznany',
};

/* ------------------------------------------------------------ turkish */

/** @type {Readonly<Record<string, string>>} */
const TR = {
  /* -- counted phrases -------------------------------------------- */
  'count.items.one': '{count} öğe',
  'count.items.few': '{count} öğe',
  'count.items.many': '{count} öğe',
  'count.records.one': '{count} kayıt okundu',
  'count.records.few': '{count} kayıt okundu',
  'count.records.many': '{count} kayıt okundu',
  'count.comparisonsMade.one': '{count} yapılmış karşılaştırma',
  'count.comparisonsMade.few': '{count} yapılmış karşılaştırma',
  'count.comparisonsMade.many': '{count} yapılmış karşılaştırma',
  'count.comparisonsDone.one': '{count} karşılaştırma yanıtlandı',
  'count.comparisonsDone.few': '{count} karşılaştırma yanıtlandı',
  'count.comparisonsDone.many': '{count} karşılaştırma yanıtlandı',
  'count.pairs.one': '{count} çift',
  'count.pairs.few': '{count} çift',
  'count.pairs.many': '{count} çift',
  'count.rows.one': '{count} satır',
  'count.rows.few': '{count} satır',
  'count.rows.many': '{count} satır',
  'count.moves.one': '{count} taşıma',
  'count.moves.few': '{count} taşıma',
  'count.moves.many': '{count} taşıma',
  'count.answers.one': '{count} yanıt',
  'count.answers.few': '{count} yanıt',
  'count.answers.many': '{count} yanıt',
  'count.marked.one': '{count} öğe istek listesinden çıkarılmak üzere işaretlendi',
  'count.marked.few': '{count} öğe istek listesinden çıkarılmak üzere işaretlendi',
  'count.marked.many': '{count} öğe istek listesinden çıkarılmak üzere işaretlendi',

  /* -- chrome ------------------------------------------------------ */
  'meta.description':
    'Bir Steam istek listesini ikili karşılaştırmalarla sıraya koyan yerel bir araç.',
  'a11y.skipToContent': 'İçeriğe geç',
  'a11y.progress.import': 'İstek listesi yükleniyor',
  'a11y.progress.categorize': 'Kategorisi verilen öğeler',
  'a11y.progress.compare': 'Yanıtlanan karşılaştırmalar',
  'nav.aria': 'Aşamalar',
  'nav.import': 'İstek listesi',
  'nav.categorize': 'Kategoriler',
  'nav.compare': 'Karşılaştırmalar',
  'nav.result': 'Sonuç',
  'nav.state.done': 'aşama tamamlandı',
  'nav.state.current': 'şu anki aşama',
  'nav.state.locked': 'aşama henüz kullanılamıyor',
  'settings.title': 'Ayarlar',
  'settings.covers': 'Kapakları yükle',
  'settings.language': 'Arayüz dili',
  'settings.theme': 'Tema',
  'theme.modern': 'Modern',
  'theme.steam': 'Steam görünümü',
  'actions.saveState': 'Yedek kaydet',
  'actions.loadState': 'Yedek yükle',
  'actions.skipStage': 'Kategorileri atla',
  'actions.reset': 'Baştan başla',
  'privacy.short': 'Yerel çalışır · verileriniz başkasının sunucusuna gitmez',
  'privacy.details': 'Ayrıntılar',
  'privacy.note':
    'Verileriniz tarayıcıdan çıkmaz. Uygulamanın kendiliğinden yaptığı tek dış istek, oyun '
    + 'kapaklarını herkese açık bir adresten, Steam’in CDN’inden indirmektir; bunu “Kapakları '
    + 'yükle” anahtarı kapatır. Doğrudan hesaptan içe aktarmayı kendi bilgisayarınızdaki yerel '
    + 'sunucu ister: istek yalnızca Steam’e gider, başka kimseye değil, ve yalnızca siz düğmeye '
    + 'bastığınızda.',
  'dialog.title': 'İşlemi onaylayın',
  'dialog.cancel': 'Vazgeç',
  'dialog.confirm': 'Devam et',

  /* -- shared item bits -------------------------------------------- */
  'common.openInSteam': 'Steam’de aç ↗',
  'common.openInSteamAria': '“{title}” oyununu yeni bir sekmede Steam’de aç',
  'category.must': 'Gerçekten istiyorum',
  'category.want': 'İstiyorum',
  'category.maybe': 'Belki',
  'category.unlikely': 'Pek sanmıyorum',
  'category.meh': 'Neredeyse ilgilenmiyorum',
  'category.remove': 'İstek listesinden çıkar',
  'category.none': 'Kategorisiz',
  'kind.game': 'Oyun',
  'kind.dlc': 'DLC',
  'kind.unknown': 'Tür bilinmiyor',
  'cover.none': 'Kapak yok',
  'cover.off': 'Kapaklar kapalı',
  'cover.failed': 'Kapak yüklenmedi',

  /* -- application ------------------------------------------------- */
  'app.saveFailed':
    'Durum tarayıcıya kaydedilemedi. Hiçbir şey kaybolmasın diye bir dosyaya kaydedin.',
  'app.saveFailedReason': 'Durum kaydedilemedi: {message}',
  'app.loadFailed': 'Kayıtlı durum okunamadı ({message}). Boş bir listeyle başlıyoruz.',
  'app.covers.on': 'Kapaklar açık: uygulama görselleri Steam’in CDN’inden indiriyor.',
  'app.covers.off': 'Kapaklar kapalı: uygulama tek bir dış istek bile yapmıyor.',
  'app.language.changed': 'Arayüz dili: {language}.',
  'app.theme.changed': 'Tema: {theme}.',
  'app.reset.title': 'Baştan başlansın mı?',
  'app.reset.text':
    'Şunların hepsi silinecek: {items}, kategoriler, karşılaştırma yanıtları ve elle yapılan '
    + 'taşımalar. Bu geri alınamaz — çalışma hâlâ işinize yarayabilecekse önce bir dosyaya '
    + 'kaydedin.',
  'app.reset.confirm': 'Her şeyi sil ve baştan başla',
  'app.reset.done': 'Durum temizlendi.',
  'app.state.buildFailed': 'Durum dosyası oluşturulamadı: {message}',
  'app.state.saved': 'Durum bir dosyaya kaydedildi.',
  'app.saved': 'İlerleme bu tarayıcıya kaydedildi',

  /* -- import screen ------------------------------------------------ */
  'import.eyebrow': 'Kendi seçtiğiniz bir sıra',
  'import.promise': 'Oyunları gerçekten oynamak isteme derecenize göre sıralayın',
  'import.lead':
    'Önce istek listenizi ilgi derecesine göre hızlıca gruplayın, sonra iki oyun arasında seçim '
    + 'yapın. İstediğiniz an bırakabilirsiniz — ilerleme kendiliğinden kaydedilir.',
  'import.step.load': 'İstek listesini yükle',
  'import.step.group': 'İlgiye göre grupla',
  'import.step.compare': 'Oyunları karşılaştır',
  'import.step.send': 'Sırayı Steam’e gönder',
  'import.sessions':
    'Tam bir sıralama birkaç oturum sürebilir. Şu anki sonucunuz her zaman elinizin altındadır.',
  'import.other': 'Diğer içe aktarma yolları',
  'import.file.title': 'JSON dosyası',
  'import.file.hint': 'Steam’den bir dışa aktarma ya da userscript’in topladığı bir dosya.',
  'import.file.button': 'Dosya seç…',
  'import.file.none': 'Dosya seçilmedi',
  'import.paste.title': 'JSON yapıştır',
  'import.paste.hint': 'Steam’in yanıtının gövdesi olduğu gibi yapıştırılabilir.',
  'import.paste.label': 'İstek listesi JSON’u',
  'import.paste.placeholder': '[ { "appid": 620, "name": "Portal 2" }, … ]',
  'import.paste.run': 'Metinden içe aktar',
  'import.userscript.title': 'Steam sayfasından, userscript ile',
  'import.userscript.hint':
    'İndirdiği dosya burada, yukarıdaki “JSON dosyası” ile yüklenir.',
  'import.state.title': 'Kayıtlı durum',
  'import.state.hint':
    'Daha önce “Yedek kaydet” ile kaydettiğiniz bir dosya: hem kategoriler hem de her yanıt geri '
    + 'gelir.',
  'import.state.button': 'Durum dosyası seç…',
  'import.demo.button': '20 oyunla deneyin',
  'import.ready.eyebrow': 'Hazır',
  'import.ready.count.one': '{count} öğe yüklendi',
  'import.ready.count.few': '{count} öğe yüklendi',
  'import.ready.count.many': '{count} öğe yüklendi',
  'import.ready.next':
    'Sırada oyunları beş ilgi düzeyine ayırmak var. Karşılaştırma sayısını kısan tam da budur.',
  'import.ready.start': 'Gruplamaya başla',
  'import.ready.again': 'Başka bir istek listesi yükle',
  'import.current':
    'Listede şu anda: {items} — {sorted} kategorili, {plain} kategorisiz. Yapılan karşılaştırma: '
    + '{comparisons}. Yeniden içe aktarmak kayıtları tazeler ve şimdiye kadarki çalışmayı korur.',
  'import.announce': 'İçe aktarıldı: {count}. Listede şu anda: {total}.',
  'import.source.file': '{name} dosyası',
  'import.source.pasted': 'Yapıştırılan metin',
  'import.source.demo': 'Tanıtım kümesi',
  'import.report.title': '{source}: {records}',
  'import.report.added': 'eklendi',
  'import.report.updated': 'güncellendi',
  'import.report.duplicates': 'yinelenen',
  'import.report.skipped': 'atlandı',
  'import.issue.line': '{where}: {what}',
  'import.issue.entry': '{number}. kayıt',
  'import.issue.key': '“{key}” anahtarı',
  'import.issue.more': '…ve {count} tane daha',
  'import.skip.notAnObject': 'kayıt ne bir öğeye ne de bir app id’ye benziyor',
  'import.skip.missingAppId': 'uygulama kimliği yok',
  'import.skip.invalidAppId': 'uygulama kimliği bir sayı değil',
  'import.skip.duplicateInInput': 'öğe bu dosyada zaten geçmişti',
  'import.error.title': 'İçe aktarma başarısız oldu',
  'import.error.emptyInput': 'İçe aktarılacak bir şey yok: dosya ya da alan boş.',
  'import.error.invalidJson':
    'Bu JSON değil. Görünüşe göre metin eksik kopyalanmış ya da içine fazladan bir şey karışmış.',
  'import.error.unrecognizedFormat':
    'JSON okundu, ama bir istek listesine benzemiyor. Gereken şey bir öğe dizisi, { "440": { … } } '
    + 'biçiminde bir nesne ya da response.items alanı olan bir Steam yanıtı.',
  'import.error.emptyResultTitle': 'İçe aktarma oldu, ama liste boş',
  'import.error.emptyResultText':
    'Tek bir öğe bile okunamadı. Dosyada gerçekten bir istek listesi olduğunu doğrulayın.',
  'import.error.fileRead': 'Dosya okunamadı',
  'import.demo.failedTitle': 'Tanıtım kümesi yüklenmedi',
  'import.demo.failedText':
    '{message}. {url} dosyası index.html ile yan yana durmalı — ve sayfa file:// olarak değil, '
    + 'http(s) üzerinden açılmalı.',
  'import.demo.httpError': 'sunucu {status} yanıtı verdi',

  /* -- import straight from a Steam account ------------------------- */
  'steam.title': 'Steam’den yükle',
  'steam.subtitle': 'Herkese açık bir istek listesi için en kolay yol',
  'steam.field': 'Steam profiliniz',
  'steam.placeholder': 'steamcommunity.com/id/adiniz, bir takma ad ya da bir SteamID64',
  'steam.run': 'Denetle ve yükle',
  'steam.cancel': 'Durdur',
  'steam.checking': 'Yerel sunucu aranıyor…',
  'steam.warning': 'Otomatik içe aktarma, “Oyun ayrıntıları” herkese açıkken çalışır.',
  'steam.privateAsk': 'Peki gizliyse?',
  'steam.privateHelp':
    'Steam profilinizi açın, “Profili Düzenle”yi, sonra “Gizlilik Ayarları”nı seçin ve “Oyun '
    + 'ayrıntıları”nı “Herkese Açık” yapın. Açmak istemiyorsanız, “Diğer içe aktarma yolları” '
    + 'altındaki userscript oturum açtığınız sayfayı okur ve gizli bir listeyle de çalışır.',
  'steam.settingsLink': 'Steam ayarlarını aç ↗',
  'steam.blocked.title': 'Steam istek listesini vermedi',
  'steam.blocked.text':
    'Bu genellikle “Oyun ayrıntıları”nın gizli olduğu anlamına gelir: istek listesi tam olarak bu '
    + 'tek ayarı izler.',
  'steam.blocked.unavailableTitle': 'İstek listesi alınamadı',
  'steam.blocked.unavailableText':
    'Steam bir hatayla yanıt verdi; hata ise hem vermek istemediği bir liste için hem de kendi kötü '
    + 'bir dakikası için verdiği yanıttır. Bu yüzden: “Oyun ayrıntıları” gizliyse aşağıdaki adımlar '
    + 'onu açar; zaten açıksa birkaç dakika bekleyip “Yeniden denetle”ye basın.',
  'steam.blocked.step1': 'Steam profilinizi açın ve “Profili Düzenle”yi seçin.',
  'steam.blocked.step2': '“Gizlilik Ayarları”nı açın.',
  'steam.blocked.step3': '“Oyun ayrıntıları”nı “Herkese Açık” yapın.',
  'steam.blocked.step4': 'Buraya dönün ve “Yeniden denetle”ye basın.',
  'steam.blocked.settings': 'Steam ayarlarını aç',
  'steam.blocked.again': 'Yeniden denetle',
  'steam.blocked.keepPrivate': 'Herkese açık yapmak istemiyorum',
  'steam.userscript.lead':
    'Listeyi doğrudan Steam sayfasından toplayın. Userscript, oturum açtığınız istek listesi '
    + 'sayfasını okur, bu yüzden gizlilik ayarı onu engellemez ve kendisi hiçbir ağ isteği yapmaz.',
  'steam.userscript.step1':
    'Tampermonkey’i kurun — Chrome, Edge, Firefox ve Opera için var.',
  'steam.userscript.step2': 'Depodaki “steam-wishlist-export.user.js” betiğini kurun.',
  'steam.userscript.step3':
    'İstek listesi sayfanızı açın ve “Collect the list”e, sonra “Download JSON”a basın.',
  'steam.userscript.step4':
    'Buraya dönün ve o dosyayı “Diğer içe aktarma yolları” altından seçin.',
  'steam.userscript.link': 'Betiği GitHub’da aç ↗',
  'steam.offline.title': 'İstek listemi yükle',
  'steam.offline.subtitle': 'En kolay yolu seçin',
  'steam.offline.text':
    'Tarayıcınız bu sayfanın Steam’i doğrudan okumasına izin vermiyor ve onun adına soracak bir '
    + 'yerel sunucu da arkasında yok. Verileriniz yine de sizin kalır.',
  'steam.offline.instructions': 'Yönergeleri göster',
  'steam.offline.userscript.badge': 'Gizli listelerle de çalışır',
  'steam.offline.userscript.title': 'Steam sayfanızdan içe aktarma',
  'steam.offline.local.title': 'Yerel sürümü çalıştırın',
  'steam.offline.local.text': 'Sonrası için herkese açık bir profil bağlantısı yeter.',
  'steam.offline.local.download': 'İndir',
  'steam.offline.local.step1': 'Node.js 20 ya da daha yenisini kurun.',
  'steam.offline.local.step2': 'Arşivi istediğiniz yere açın.',
  'steam.offline.local.step3':
    'Windows’ta “start.bat”ı, macOS ve Linux’ta “node server.js”i çalıştırın.',
  'steam.offline.local.step4': 'Tarayıcıda http://localhost:8080/ adresini açın.',
  'steam.step.account': 'Hesap aranıyor…',
  'steam.step.wishlist': 'Steam’den istek listesi isteniyor…',
  'steam.step.titles': 'Başlıklar: {done} / {total}',
  'steam.step.waiting':
    'Steam istekleri sınırlıyor. {seconds} sn beklenip yeniden sorulacak…',
  'steam.note':
    'Bir başlık, bir istek; bu yüzden uzun bir liste dakikalar alır. Gelen her şey kaydedilir — '
    + 'durdurmak hiçbir şey kaybettirmez.',
  'steam.done.title': 'İstek listesi geldi',
  'steam.done.titlesTitle': 'Başlıklar alındı',
  'steam.done.titlesText': 'Listede: {items}, bunlardan Steam’den gelen başlığa sahip: {titles}.',
  'steam.done.text':
    'Steam hesabı {account}. Listede: {items}, bunlardan Steam’den gelen başlığa sahip: {titles}.',
  'steam.done.missing.one':
    'Steam {count} başlık vermedi: o öğe App ID’siyle gösteriliyor.',
  'steam.done.missing.few':
    'Steam {count} başlık vermedi: o öğeler App ID’leriyle gösteriliyor.',
  'steam.done.missing.many':
    'Steam {count} başlık vermedi: o öğeler App ID’leriyle gösteriliyor.',
  'steam.done.throttled':
    'Steam {total} başlığın {done}. sırasında yanıt vermeyi bıraktı: istekleri sınırlıyor. Alınan '
    + 'her şey zaten listede — birkaç dakika sonra düğmeyi yeniden deneyin.',
  'steam.missing.text.one':
    'Listedeki {count} öğe hâlâ başlıkla değil, bir App ID ile gösteriliyor.',
  'steam.missing.text.few':
    'Listedeki {count} öğe hâlâ başlıkla değil, bir App ID ile gösteriliyor.',
  'steam.missing.text.many':
    'Listedeki {count} öğe hâlâ başlıkla değil, bir App ID ile gösteriliyor.',
  'steam.missing.run': 'Kalan başlıkları getir',
  'steam.cancelled': 'Durduruldu. O ana dek gelen her şey listede kaldı.',
  'steam.error.title': 'Steam’den içe aktarma başarısız oldu',
  'steam.error.emptyInput':
    'Alan boş: bir SteamID64, bir profil adı ya da profile bir bağlantı yazın.',
  'steam.error.invalidAccount':
    'Bu ne bir SteamID64 (17 basamak), ne bir Steam profil adı, ne de steamcommunity.com '
    + 'üzerindeki bir profile bağlantı.',
  'steam.error.accountNotFound':
    'Steam’de böyle bir hesap yok. Yazımı denetleyin — ya da profilinizi tarayıcıda açıp sayfanın '
    + 'adresini kopyalayın.',
  'steam.error.wishlistEmpty':
    'Bu hesabın istek listesi boş: sıralanacak bir şey henüz yok.',
  'steam.error.rateLimited':
    'Steam istekleri sınırlıyor: bu adresten çok fazla istek geldi. Birkaç dakika sonra bırakıyor — '
    + 'o zaman yeniden deneyin.',
  'steam.error.network':
    'Steam’e ulaşılamadı. Bağlantınızı ve yerel sunucunun hâlâ çalıştığını denetleyin.',
  'steam.error.steamError':
    'Steam beklenmedik bir şeyle yanıt verdi. Bu genellikle Steam’in kendi kötü bir anıdır; biraz '
    + 'sonra yeniden deneyin.',
  'steam.error.notLocal': 'Yerel sunucu yalnızca localhost’tan gelen isteklere yanıt verir.',
  'steam.error.unknown': 'Beklenmedik hata: {message}',

  /* -- state file --------------------------------------------------- */
  'state.error.invalidJson': 'Durum dosyası JSON olarak okunmuyor.',
  'state.error.foreignState':
    'Bu başka bir uygulamanın JSON’u: üzerinde Steam Wishlist Sorter imzası yok.',
  'state.error.unsupportedVersion':
    'Dosya biçimin başka bir sürümüyle kaydedilmiş ve desteklenmiyor.',
  'state.error.invalidState': 'Dosya bir duruma benziyor, ama içinde oturum yok.',
  'state.error.writeFailed': 'Durum okundu, ama tarayıcı kaydetmeyi reddetti.',
  'state.confirm.title': 'Durum, şu ankinin üzerine yüklensin mi?',
  'state.confirm.text':
    'Şu anki durum: {items}, {comparisons}. Dosya bunların hepsinin yerine bir bütün olarak geçer: '
    + 'liste, kategoriler, yanıtlar ve elle yapılan taşımalar. Bu geri alınamaz.',
  'state.confirm.confirm': 'Şu anki durumun yerine geç',
  'state.confirm.cancelled': 'Durum içe aktarma iptal edildi — hiçbir şey değişmedi.',
  'state.restored.title': 'Durum geri yüklendi',
  'state.restored.items': 'öğe',
  'state.restored.comparisons': 'yapılmış karşılaştırma',
  'state.restored.moves': 'elle taşıma',
  'state.restored.toast': 'Durum dosyadan geri yüklendi.',

  /* -- categories screen -------------------------------------------- */
  'categorize.eyebrow': '4 adımdan 2.’si',
  'categorize.heading': 'Bu oyun ne kadar ilginizi çekiyor?',
  'categorize.hint': 'Uzun düşünmeyin — kategori sonradan değiştirilebilir.',
  'categorize.buttonsAria': 'İlgi düzeyleri',
  'categorize.more': 'Daha çok ilgimi çekiyor',
  'categorize.less': 'Daha az ilgimi çekiyor',
  'categorize.or': 'ya da',
  'categorize.counter': '{index} / {total}',
  'categorize.back': '← Önceki',
  'categorize.defer': 'Ertele <kbd>Space</kbd>',
  'categorize.done': 'Her öğenin bir kategorisi var.',
  'categorize.toCompare': 'Karşılaştırmalara geç',
  'categorize.empty': 'Liste boş: önce bir istek listesi içe aktarın.',
  'categorize.toImport': 'İçe aktarmaya geç',
  'categorize.position': 'İstek listenizdeki yeri: {position}',
  'categorize.current': 'Şu anda: {category}. Değiştirmek için başka bir kategori seçin.',
  'categorize.legendLeft': 'kalan: {items}',
  'categorize.firstItem': 'Bu, listenin ilk öğesi.',
  'categorize.noneLeft': 'Kategorisi olmayan öğe kalmadı.',
  'categorize.postponed': '{title} ertelendi, turun sonunda ona döneceğiz.',
  'categorize.announce': '{title}: {category}',
  'categorize.skipTitle': 'Kategoriler atlansın mı?',
  'categorize.skipText':
    'Her öğe kategorisiz kalır ve karşılaştırmalar tüm listeyi tek bir grup gibi dolaşır — beş '
    + 'küçük grubun gerektireceğinden çok daha fazla soru demektir bu. Hiçbir şey kaybolmaz: bu '
    + 'aşamaya istediğiniz an dönebilirsiniz.',
  'categorize.skipConfirm': 'Atla ve karşılaştırmalara geç',
  'categorize.skipDone': 'Aşama atlandı: karşılaştırmalar tüm liste üzerinde ilerliyor.',

  /* -- comparisons screen -------------------------------------------- */
  'compare.eyebrow': '4 adımdan 3.’sü',
  'compare.heading': 'Hangi oyunu daha çok istiyorsunuz?',
  'compare.headingDone': 'Karşılaştırmalar bitti',
  'compare.hint': 'Çabuk seçin. Karar veremediğiniz bir çift ertelenebilir.',
  'compare.progress': '“{category}” kategorisi · {made} · yaklaşık kalan: {left}',
  'compare.deferred': 'ertelenen: {pairs}',
  'compare.preferA': 'Bunu daha çok istiyorum <kbd>A</kbd>',
  'compare.preferB': 'Bunu daha çok istiyorum <kbd>D</kbd>',
  'compare.drop': 'Artık ilgilenmiyorum',
  'compare.or': 'ya da',
  'compare.tie': 'Aşağı yukarı aynı <kbd>S</kbd>',
  'compare.defer': 'Karar veremiyorum <kbd>Space</kbd>',
  'compare.undo': 'Geri al <kbd>Backspace</kbd>',
  'compare.finish': 'Bugünlük bitir',
  'compare.finishNote': 'İlerleme kaydedildi — şu anki sonucunuz kullanıma hazır.',
  'compare.done': 'Karşılaştırılacak bir şey kalmadı: sıra belirlendi.',
  'compare.empty': 'Karşılaştırılacak bir şey yok: liste boş.',
  'compare.toResult': 'Sonucu gör',
  'compare.toImport': 'İçe aktarmaya geç',
  'compare.banner.allDeferred':
    'Diğer bütün sorular ertelendi ({count}) ve buna yanıt vermeden ilerlemenin yolu yok. “Aşağı '
    + 'yukarı aynı” da bir yanıttır ve sıralama onunla yoluna devam eder.',
  'compare.banner.forced': 'İlerlemek için bu çift gerekli.',
  'compare.rejected': 'Yanıt kabul edilmedi: {message}',
  'compare.dropped': '“{title}” istek listesinden çıkarılacaklar listesinde.',
  'compare.nothingToUndo': 'Geri alınacak bir şey yok.',
  'compare.undone': 'Son yanıt geri alındı.',
  'compare.chosen': 'Seçilen: {title}.',
  'compare.tied': '{a} ile {b} — aşağı yukarı aynı.',
  'compare.postponed': 'Çift ertelendi.',

  /* -- the one-off explanations -------------------------------------- */
  'onboarding.start': 'Anlaşıldı',
  'onboarding.categorize.title': 'Önce oyunları ilgiye göre kabaca gruplayın',
  'onboarding.categorize.lead':
    'Oyunları teker teker göreceksiniz ve her birini beş düzeyli bir ölçeğe — ya da doğrudan istek '
    + 'listesinden çıkarılacaklar listesine — koyacaksınız.',
  'onboarding.categorize.why':
    'Sıralamayı kısa tutan şey budur: oyunlar yalnızca kendi grupları içinde karşılaştırılır, '
    + 'yani şimdi yapılan kaba bir ayrım sonradan yüzlerce soru kazandırır.',
  'onboarding.categorize.later':
    'Uzun düşünmeyin. Kategori istediğiniz an değiştirilebilir — “Önceki” ile oyuna geri dönün ya '
    + 'da sonuç ekranında değiştirin.',
  'onboarding.compare.title': 'Şimdi iki oyun arasında seçim yapıyoruz',
  'onboarding.compare.lead':
    'Her seferinde iki oyun, ikisi de aynı gruptan. Daha çok istediğinizi seçin — A ve D tuşları '
    + 'ya da oklar.',
  'onboarding.compare.tie':
    'İkisini de aynı ölçüde istiyorsanız “Aşağı yukarı aynı” deyin: o da bir yanıttır ve sıralama '
    + 'onu kullanır.',
  'onboarding.compare.defer':
    'Zor bir çift boşluk tuşuyla ertelenebilir; kolaylar yanıtlandığında geri gelir.',
  'onboarding.compare.stop':
    'İstediğiniz an bitirin. Her yanıt kaydedilir ve sonuç her an bakmaya hazırdır — bitmiş olsun '
    + 'ya da olmasın.',

  /* -- result screen -------------------------------------------------- */
  'result.eyebrow': '4 adımdan 4.’sü',
  'result.head.usable': 'Sonuç şimdiden kullanılabilir',
  'result.head.ready': 'Sıranız hazır',
  'result.head.empty': 'Henüz sıraya konacak bir şey yok',
  'result.lead.usable':
    'Şimdi Steam’e aktarın ya da yeni yanıtlarla iyileştirmeyi sürdürün.',
  'result.lead.ready': 'İçindeki her yer sizin kendi yanıtlarınızla belirlendi.',
  'result.lead.empty': 'Bir istek listesi içe aktarın, sıra burada belirsin.',
  'result.continue': 'Karşılaştırmalara devam et',
  'result.complete': 'Sıralama bitti',
  'result.toImport': 'İçe aktarmaya geç',

  /* -- result screen: the summary -------------------------------------- */
  'result.summary.eyebrow': 'Kullanıma hazır',
  'result.summary.headline': 'Yanıtlarınıza göre yerleşen: {items}',
  'result.summary.headlineAll': 'Listenin tamamı yanıtlarınıza göre yerleşti',
  'result.summary.headlineNone': 'Henüz hiçbir yer bir yanıtla belirlenmedi',
  'result.summary.rest':
    'Geri kalanlar istek listenizdeki sıralarını korur; aşağıdaki liste hangileri olduğunu söyler.',
  'result.summary.choice':
    'Bu sırayı şimdi Steam’e aktarın ya da karşılaştırmayı sürdürün — her yanıt onu iyileştirir.',
  'result.summary.done': 'Karşılaştırılacak bir şey kalmadı. Sırayı Steam’e aktarın.',
  'result.summary.empty': 'Liste boş: gösterilecek bir şey henüz yok.',
  'result.summary.allRemoved': 'Sıraya konacak bir şey kalmadı: {marked}.',
  'result.stats.total': 'listede',
  'result.stats.confirmed': 'doğrulanan',
  'result.stats.removed': 'çıkarılmak üzere işaretli',
  'result.built.summary': 'Bu sıra nasıl oluştu?',
  'result.built.categories':
    'Önce kategoriler gelir, ilgi sırasına göre; bir kategorinin içinde yeri karşılaştırmalar '
    + 'belirler.',
  'result.built.resolved':
    'Yanıtlarınızın belirlediği yerler: {resolved} / {total}. Geri kalan öğeler ({fallback}) '
    + 'istek listesindeki yerlerini korur — listede işaretlenmiş olan yedek sıra.',
  'result.built.answers': 'Şimdiye dek yanıtlanan karşılaştırma: {count}.',
  'result.built.manual':
    'Elle taşınan: {items}. Elle yapılan bir taşıma, karşılaştırmaların ürettiği sıranın üzerine '
    + 'yeniden uygulanır, böylece yeni yanıtlar listeyi onun çevresinde iyileştirmeyi sürdürür.',
  'result.built.noManual': 'Elle hiçbir şey taşınmadı.',
  'result.built.complete': 'Sıralama bitti: sıranın gerektirdiği her çiftin bir yanıtı var.',
  'result.built.incomplete': 'Sıralama bitmedi — istediğiniz an sürdürülebilir.',
  'result.legend.sorted': 'karşılaştırmalarla doğrulandı',
  'result.legend.fallback': 'hâlâ eski sırada — istek listesindeki yerine göre',
  'result.legend.manual': 'elle taşındı',
  'result.legend.tied': 'üstündeki satırla aynı düzeyde',

  /* -- result screen: carrying the order into Steam --------------------- */
  'result.transfer.eyebrow': 'Ana işlem',
  'result.transfer.heading': 'Sırayı Steam’e aktarın',
  'result.transfer.sub': 'Eklenti ya da ek yazılım gerekmez',
  'result.transfer.step1': 'Yer imleri çubuğunu gösterin',
  'result.transfer.shortcut':
    '<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — Chrome, Edge ve Firefox’ta.',
  'result.transfer.shortcutMac':
    '<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd> — Chrome, Edge ve Firefox’ta.',
  'result.transfer.shortcutSafari':
    'Safari’de: “Görünüm” menüsü → “Favoriler Çubuğunu Göster”.',
  'result.transfer.step2': 'Bu bağlantıyı çubuğun üzerine sürükleyin',
  'result.transfer.step3': 'İstek listenizi açın ve yer imine basın',
  'result.transfer.openWishlist': 'İstek listemi aç ↗',
  'result.transfer.link': 'Sıramı Steam’e aktar',
  'result.transfer.copy': 'Bağlantıyı kopyala',
  'result.transfer.carries': 'Bağlantının taşıdığı: {items}.',
  'result.transfer.fresh':
    'Bağlantı her değişiklikte yeniden kurulur, bu yüzden buradan aldığınız her zaman şu anki '
    + 'sıradır.',
  'result.transfer.taken':
    'Bu, aldığınız bağlantının ta kendisi ve hâlâ tam olarak aşağıda görünen sırayı yazar.',
  'result.transfer.stale': 'Sıra değişti — eski yer iminin yerine güncel bağlantıyı koyun.',
  'result.transfer.copied':
    'Bağlantı kopyalandı. Elle bir yer imi oluşturun ve onu adres olarak yapıştırın.',
  'result.transfer.copyFailed':
    'Tarayıcı pano erişimini reddetti — bunun yerine bağlantıyı yer imleri çubuğuna sürükleyin.',
  'result.transfer.clickToast':
    'Bu bağlantı burada basılmak için değil: yer imleri çubuğuna sürükleyin ve Steam istek listesi '
    + 'sayfasında basın.',
  'result.transfer.empty': 'Liste boş — henüz taşınacak bir sıra yok.',
  'result.transfer.failed': 'Bağlantı oluşturulamadı: {message}',
  'result.transfer.mobile':
    'Telefonda ya da tablette bu zahmetlidir: bir bookmarklet’in yer imleri çubuğuna sürüklenmesi '
    + 'gerekir. Aktarma masaüstü bir tarayıcıda daha kolaydır.',
  'result.transfer.warnAccount':
    'Sıra, bu tarayıcının oturum açtığı hesaba yazılır.',
  'result.transfer.warnNoDelete':
    'Hiçbir şey silinmez: çıkarılmak üzere işaretlediğiniz öğeler listenin sonuna gider.',
  'result.transfer.warnPriority':
    'Sonrasında her öğenin bir önceliği olur, daha önce hiç önceliği olmayanların da.',
  'result.transfer.warnNoBackup':
    'Bookmarklet yedek almaz ve sonucu sonradan denetlemez.',
  'result.transfer.warnReload':
    'İş bitince Steam sayfasını yeniden yükleyin ve sıralamayı kendi sıranıza geçirin.',
  'result.transfer.advanced': 'Yedek ve otomatik doğrulama mı gerekiyor?',
  'result.transfer.advancedText':
    'Userscript istek listesi sayfasının kendisini okur: şu anda oradaki sırayı bir dosyaya '
    + 'kaydeder, yenisini yazar ve sonra ulaştığını denetler. Tampermonkey gerektirir, uzun yol '
    + 'olmasının ve ana yol olmamasının nedeni de budur.',
  'result.transfer.advancedStep2':
    'Depodaki “steam-wishlist-import-order.user.js” betiğini kurun.',
  'result.transfer.advancedStep3':
    'İstek listesi sayfanızı açın ve betiğin oraya koyduğu paneli izleyin.',

  /* -- result screen: the list ------------------------------------------ */
  'result.list.heading': 'Sıranız',
  'result.search': 'Başlığa ya da App ID’ye göre ara',
  'result.filterAria': 'Ne gösterilsin',
  'result.filter.all': 'Hepsi',
  'result.filter.game': 'Oyunlar',
  'result.filter.dlc': 'DLC',
  'result.hint':
    'Bir satır fareyle sürüklenebilir ya da seçilip <kbd>Ctrl</kbd> + <kbd>↑</kbd> / '
    + '<kbd>Ctrl</kbd> + <kbd>↓</kbd> ile taşınabilir. Taşımalar kaydedilir ve sayfa yenilense de '
    + 'kalır.',
  'result.removed.hint': 'Bu öğeler son listenin numaralandırmasına girmez.',
  'result.mark.confirmed': 'Karşılaştırmalarla doğrulandı',
  'result.mark.fallback': 'Hâlâ eski sırada',
  'result.mark.manual': 'Elle taşındı',
  'result.mark.tied': 'Üstündeki satırla aynı düzeyde',
  'result.row.appId': 'App ID {appId}',
  'result.row.where': '{category} · kategoride {position}',
  'result.row.aria': '{position}. {title}. {category}. {kind}. {note}',
  'result.row.categoryAria': 'Kategori: {title}',
  'result.shown.all': '{rows}',
  'result.shown.filtered': 'görünen: {shown} / {total}',
  'result.empty.filter': 'Ne süzgeç ne de arama tek bir öğeyle eşleşti.',
  'result.empty.noItems': 'Bir istek listesi içe aktarın, sonuç burada belirsin.',
  'result.empty.allRemoved':
    'Her öğe çıkarılmak üzere işaretli — sıraya konacak bir şey yok.',
  'result.move.failed': 'Taşınamadı: {message}',
  'result.move.announce': '“{title}” {where}{category}.',
  'result.move.place': '{position}. sıraya',
  'result.move.newPlace': 'yeni bir yere',
  'result.move.categorySuffix': ', kategori: {category}',
  'result.move.categoryToast': '“{title}” “{category}” kategorisine taşındı.',
  'result.move.edge':
    'Bu, “{category}” kategorisinin {edge} satırı. Kategori, satırın kendisindeki seçiciyle '
    + 'değiştirilir.',
  'result.move.edgeFirst': 'ilk',
  'result.move.edgeLast': 'son',
  'result.category.failed': 'Kategori değiştirilemedi: {message}',
  'result.category.toast': '“{title}” — {category}.',
  /* -- result screen: the tier list ------------------------------------- */
  'tier.open': 'Tier listesini göster',
  'tier.title': 'İstek listesinin tier listesi',
  'tier.lead': 'Her kategorinin içinde oyunlar soldan sağa doğru sırayla dizilir.',
  'tier.close': 'Kapat',
  'tier.none': 'Kategorisiz',
  'tier.empty': 'Burada bir şey yok',
  'tier.card.aria': '{position}. {title}',
  'tier.remove.note':
    'Kaldırılmak üzere işaretlendi. Uygulama Steam’den hiçbir şey silmez — bu size kalıyor.',

  /* -- result screen: the files and the two resets ---------------------- */
  'result.export.summary': 'İndirin ya da paylaşın',
  'result.export.hint':
    'Dosyalar burada, tarayıcıda oluşturulur ve onları siz kaydedersiniz — hiçbir şey yüklenmez.',
  'result.exportJson': 'Sıra JSON olarak',
  'result.exportCsv': 'Liste CSV olarak',
  'result.copyText': 'Liste olarak kopyala',
  'result.saveState': 'Durumun yedeği',
  'result.export.empty': 'Dışa aktarılacak bir şey yok: liste boş.',
  'result.export.failed': 'Dosya oluşturulamadı: {message}',
  'result.export.jsonDone': 'Son sıra JSON olarak kaydedildi.',
  'result.export.csvDone': 'Son liste CSV olarak kaydedildi.',
  'result.copy.empty': 'Kopyalanacak bir şey yok: liste boş.',
  'result.copy.done': 'Numaralı liste panoya kopyalandı.',
  'result.copy.failed':
    'Tarayıcı pano erişimini reddetti — liste bunun yerine bir dosya olarak kaydedildi.',
  'result.resetManual': 'Elle yapılan taşımaları sıfırla',
  'result.resetManual.none': 'Elle yapılmış taşıma yok.',
  'result.resetManual.title': 'Elle yapılan taşımalar sıfırlansın mı?',
  'result.resetManual.text':
    'Unutulacak: {moves}; liste karşılaştırmaların verdiği sıraya döner. Karşılaştırma yanıtları '
    + 'kalır.',
  'result.resetManual.confirm': 'Taşımaları sıfırla',
  'result.resetManual.done': 'Elle yapılan taşımalar sıfırlandı.',
  'result.resetAnswers': 'Karşılaştırma yanıtlarını sıfırla',
  'result.resetAnswers.none': 'Henüz yanıt yok.',
  'result.resetAnswers.title': 'Karşılaştırma yanıtları sıfırlansın mı?',
  'result.resetAnswers.text':
    'Silinecek: {answers}; karşılaştırmalar sıfırdan başlar. Öğe listesi, kategoriler ve elle '
    + 'yapılan taşımalar kalır. Bu geri alınamaz.',
  'result.resetAnswers.confirm': 'Yanıtları sıfırla',
  'result.resetAnswers.done': 'Karşılaştırma yanıtları sıfırlandı.',

  /* -- the bookmarklet: what it says on the Steam page ------------------ */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Burası Steam istek listesi değil. store.steampowered.com/wishlist adresini açın, oturum açın '
    + 've yer imine orada basın. Hiçbir şey gönderilmedi.',
  'bookmarklet.confirm':
    'Bu sıra ({items}) bu tarayıcının oturum açtığı hesabın istek listesine yazılacak. Hiçbir şey '
    + 'silinmez. Bu geri alınamaz: yazma işleminden sonra her kaydın bir önceliği olur, daha önce '
    + 'hiç önceliği olmayanların da, ve hiçbir yedek bunu geri getirmez.',
  'bookmarklet.write': 'Sırayı yaz',
  'bookmarklet.cancel': 'Vazgeç',
  'bookmarklet.close': 'Kapat',
  'bookmarklet.sending': 'Sıra Steam’e gönderiliyor…',
  'bookmarklet.done':
    'Steam sırayı kabul etti. İstek listesi sayfasını yeniden yükleyip ona bakın: bu bookmarklet '
    + 'sayfayı okumaz, yani denetim sizde.',
  'bookmarklet.unclear':
    'Steam yanıt verdi, ama yanıt ne evet ne hayır diyor. Yinelemeden önce istek listesi sayfasını '
    + 'yeniden yükleyip sıraya bakın.',
  'bookmarklet.refused':
    'Steam sırayı geri çevirdi ve nedeni hakkında işe yarar bir şey söylemedi. Yinelemeden önce '
    + 'istek listesi sayfasını yeniden yükleyip sıraya bakın.',
  'bookmarklet.badRequest':
    'Steam isteği daha kapıda geri çevirdi: 400 ve boş bir gövde — sıraya hiç bakmadı, yani '
    + 'hiçbir şey yazılmadı. İstekte kendi istediği bir şey eksik olduğunda böyle yanıt verir ve '
    + 'yanıt bunun ne olduğunu söylemez. Görünüşe göre uç nokta değişmiş; bu konuda ne yapılacağı '
    + 'projenin sayfasında yazıyor.',
  'bookmarklet.signedOut':
    'Steam oturumu kabul etmedi — çoğu zaman süresi dolmuştur. Steam’de yeniden oturum açın, istek '
    + 'listesini yeniden yükleyin ve yer imine bir kez daha basın. Hiçbir şey yazılmadı.',
  'bookmarklet.rateLimited':
    'Steam “çok fazla istek” yanıtı verdi. Birkaç dakika bekleyip yer imine yeniden basın — '
    + 'hiçbir şey değişmedi.',
  'bookmarklet.tooLarge':
    'İstek Steam için fazla büyük: sıranın tamamı tek bir istekle gider ve bu sığmadı. Hiçbir şey '
    + 'yazılmadı. Böyle bir liste için userscript gerekir; o, yazmak yerine satırları sayfanın '
    + 'kendisinde işaretleyebilir.',
  'bookmarklet.serverError':
    'Sorun Steam tarafında — bir sunucu hatasıyla yanıt verdi. Birkaç dakika sonra yeniden '
    + 'deneyin; hiçbir şey yazılmadı.',
  'bookmarklet.offline':
    'İstek Steam’e hiç ulaşmadı. Ağ kopmuş ya da bir eklenti engellemiş olabilir. Hiçbir şey '
    + 'yazılmadı — bağlantınızı denetleyin ve yer imine yeniden basın.',

  /* -- exported files -------------------------------------------------- */
  'export.csv.number': 'No',
  'export.csv.appId': 'App ID',
  'export.csv.title': 'Başlık',
  'export.csv.category': 'Kategori',
  'export.csv.kind': 'Tür',
  'export.csv.positionInCategory': 'Kategorideki yeri',
  'export.csv.origin': 'Sıra nereden geliyor',
  'export.csv.wishlistPosition': 'İstek listesindeki yeri',
  'export.csv.url': 'Bağlantı',
  'export.origin.manual': 'elle',
  'export.origin.comparisons': 'karşılaştırmalar',
  'export.origin.fallback': 'yedek sıra',
  'export.kind.game': 'Oyun',
  'export.kind.dlc': 'DLC',
  'export.kind.unknown': 'Bilinmiyor',
};

/** Every dictionary, by language code. @type {Readonly<Record<string, object>>} */
export const DICTIONARIES = Object.freeze({
  en: Object.freeze(EN),
  ru: Object.freeze(RU),
  de: Object.freeze(DE),
  fr: Object.freeze(FR),
  es: Object.freeze(ES),
  'pt-BR': Object.freeze(PT_BR),
  pl: Object.freeze(PL),
  tr: Object.freeze(TR),
});

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
