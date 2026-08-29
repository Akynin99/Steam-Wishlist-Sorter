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
    'Your answers settle the place of {resolved} of {total}. The other {fallback} keep the '
    + 'position they had in the wishlist — the fallback order, marked in the list.',
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
    'Будут удалены все {items}, категории, ответы на сравнения и ручные перестановки. Отменить это '
    + 'будет нельзя — если работа может пригодиться, сначала сохраните её в файл.',
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
  'steam.done.titlesText': 'В списке {items}, из них {titles} с названием из Steam.',
  'steam.done.text':
    'Аккаунт Steam {account}: в списке {items}, из них {titles} с названием из Steam.',
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
  'categorize.legendLeft': 'осталось {items}',
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
  'compare.progress': 'Категория «{category}» · {made} · примерно {left} осталось',
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
  'result.summary.headline': '{items} стоят по вашим ответам',
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
  'result.summary.allRemoved': 'Все {marked} на удаление из желаемого, упорядочивать нечего.',
  'result.stats.total': 'в списке',
  'result.stats.confirmed': 'подтверждено',
  'result.stats.removed': 'помечено на удаление',
  'result.built.summary': 'Как построен этот порядок?',
  'result.built.categories':
    'Сначала идут категории, в порядке интереса; внутри категории место определяют сравнения.',
  'result.built.resolved':
    'Ваши ответы определяют место {resolved} из {total}. Остальные {fallback} стоят там же, где '
    + 'стояли в списке желаемого, — это запасной порядок, и в списке он отмечен.',
  'result.built.answers': 'Ответов на сравнения: {count}.',
  'result.built.manual':
    'Вручную переставлено {items}. Ручная перестановка накладывается поверх того, что дают '
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
    '{moves} будет забыто, и список вернётся к порядку, который дают сравнения. Ответы сравнений '
    + 'останутся.',
  'result.resetManual.confirm': 'Сбросить перестановки',
  'result.resetManual.done': 'Ручные перестановки сброшены.',
  'result.resetAnswers': 'Сбросить ответы сравнений',
  'result.resetAnswers.none': 'Ответов пока нет.',
  'result.resetAnswers.title': 'Сбросить ответы сравнений?',
  'result.resetAnswers.text':
    '{answers} будет удалено, и сравнения начнутся с нуля. Список позиций, категории и ручные '
    + 'перестановки останутся. Отменить это будет нельзя.',
  'result.resetAnswers.confirm': 'Сбросить ответы',
  'result.resetAnswers.done': 'Ответы сравнений сброшены.',

  /* -- букмарклет: что он говорит на странице Steam ---------------------- */
  'bookmarklet.title': 'Steam Wishlist Sorter',
  'bookmarklet.wrongPage':
    'Это не список желаемого Steam. Откройте store.steampowered.com/wishlist, войдите в аккаунт и '
    + 'нажмите закладку там. Ничего не отправлено.',
  'bookmarklet.confirm':
    'Сейчас порядок {items} будет записан в список желаемого того аккаунта, под которым вошёл этот '
    + 'браузер. Ничего не удаляется. Отменить это будет нельзя: после записи приоритет получат все '
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
