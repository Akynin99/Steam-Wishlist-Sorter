/**
 * Entry point of the interface.
 *
 * The module owns the three things every screen needs — the session, the
 * settings and the storage — and knows nothing about ranking: it asks
 * `ranking.js` and shows what it answers. Screens receive this object, render
 * themselves into the markup of `index.html` and never talk to each other.
 *
 * Every user action goes through `save()`, so an interrupted session is at
 * most one action behind.
 */

import { exportFileName } from './export.js';
import { LANGUAGE_NAMES, getLanguage, plural, setLanguage, t } from './i18n.js';
import {
  ONBOARDING_KEY,
  isStageSeen,
  parseSeenStages,
  serializeSeenStages,
  withStageSeen,
} from './onboarding.js';
import { deserializeSession, createSession } from './ranking.js';
import { StateStorage, StorageError, createEmptyState } from './storage.js';
import { normalizeTheme, writeThemeMirror } from './theme.js';
import { applyTranslations, downloadText, isHotkeyBlocked } from './ui-common.js';
import { createImportScreen } from './ui-import.js';
import { createCategorizeScreen } from './ui-categorize.js';
import { createCompareScreen } from './ui-compare.js';
import { createResultScreen } from './ui-result.js';

/** Screens, in the order of the navigation. */
const SCREEN_IDS = ['import', 'categorize', 'compare', 'result'];

/**
 * Key of the screen the user was last on. It is interface state, not
 * application state, so it lives next to the state instead of inside it: a
 * state file exported on the comparison screen must not force the screen on
 * whoever imports it.
 */
const SCREEN_KEY = 'steam-wishlist-sorter/screen';

/**
 * The stages that explain themselves once, with the dialog that does it and
 * the heading the keyboard is handed back to when it closes.
 *
 * Whether an explanation has been seen is kept next to the screen above and
 * deliberately not in the state: «Start over» wipes the state, and the person
 * in front of the screen has still read the explanation.
 */
const INTROS = {
  categorize: { dialog: 'intro-categorize', heading: 'categorize-heading' },
  compare: { dialog: 'intro-compare', heading: 'compare-heading' },
};

/** How long a toast stays on the screen, in milliseconds. */
const TOAST_MS = 3200;

/**
 * How long the saving status stays lit after the last write, in milliseconds.
 *
 * It is not a toast and it does not queue: `save()` runs after every answer of
 * a comparison, so a queue would be a flicker. The line says one thing, and a
 * new write only pushes the moment it goes out.
 */
const SAVE_STATUS_MS = 2600;

/** How long the live region stays empty before the next sentence goes in. */
const ANNOUNCE_DELAY_MS = 60;

/** Why a state file did not load. The codes come from `storage.js`. */
const STATE_ERROR_KEYS = {
  'invalid-json': 'state.error.invalidJson',
  'foreign-state': 'state.error.foreignState',
  'unsupported-version': 'state.error.unsupportedVersion',
  'invalid-state': 'state.error.invalidState',
  'write-failed': 'state.error.writeFailed',
};

/**
 * Builds the application and wires it to the document.
 *
 * @returns {object} The application context handed to every screen.
 */
function createApp() {
  const storage = new StateStorage();
  const toastNode = document.getElementById('toast');
  const liveRegion = document.getElementById('live-region');
  const coversToggle = document.getElementById('setting-covers');
  const languageSelect = document.getElementById('setting-language');
  const themeSelect = document.getElementById('setting-theme');
  const saveStatus = document.getElementById('save-status');
  const settingsMenu = document.getElementById('settings-menu');
  const settingsButton = document.getElementById('settings-open');
  const stateFileInput = document.getElementById('menu-state-file');

  let state;
  let loadError = null;
  try {
    state = storage.load() ?? createEmptyState();
  } catch (error) {
    // A corrupted store must not leave the user in front of a blank page.
    state = createEmptyState();
    loadError = error;
  }

  let session;
  try {
    session = deserializeSession(state.session);
  } catch (error) {
    session = createSession();
    state.session = session.serialize();
    loadError = loadError ?? error;
  }

  // The language is decided before a single word is drawn, so no screen is
  // ever rendered in one language and then repainted in another. The theme is
  // decided in the same breath, so nothing is ever painted twice.
  applyLanguage(state.settings.language);
  applyTheme(state.settings.theme);

  let toastTimer = 0;
  let saveStatusTimer = 0;
  let announceTimer = 0;
  let current = null;
  let seenIntros = readSeenIntros();

  /** @type {Record<string, { render: Function, handleKey?: Function }>} */
  const screens = {};

  const app = {
    /** @returns {import('./ranking.js').RankingSession} */
    get session() {
      return session;
    },

    /** @returns {boolean} Whether covers may be fetched from the Steam CDN. */
    get loadCovers() {
      return state.settings.loadCovers !== false;
    },

    /** @returns {string} The language of the interface. */
    get language() {
      return getLanguage();
    },

    /** @returns {string} The theme of the interface. */
    get theme() {
      return normalizeTheme(document.documentElement.dataset.theme);
    },

    /** @returns {string} The screen currently shown. */
    get screen() {
      return current;
    },

    /**
     * Writes the session and the settings to the storage. Called after every
     * action of the user.
     *
     * @returns {boolean} `false` when the write failed; the interface keeps
     *          working on the in-memory state and says so.
     */
    save() {
      state.session = session.serialize();
      try {
        state = storage.save(state);
        markSaved();
        return true;
      } catch (error) {
        app.toast(
          error instanceof StorageError
            ? t('app.saveFailed')
            : t('app.saveFailedReason', { message: error.message }),
          'error',
        );
        return false;
      }
    },

    /**
     * Replaces the whole state, e.g. after importing a saved file.
     *
     * @param {import('./storage.js').AppState} nextState
     */
    replaceState(nextState) {
      state = nextState;
      session = deserializeSession(state.session);
      coversToggle.checked = app.loadCovers;
      // A state file carries the language and the theme of whoever saved it;
      // following them silently would answer a question the user did not ask,
      // so the interface stays as it is and the file is brought to it.
      state.settings.language = getLanguage();
      state.settings.theme = app.theme;
      app.refreshNav();
    },

    /** Drops everything and starts from an empty session. */
    resetAll() {
      storage.clear();
      state = createEmptyState();
      state.settings.language = getLanguage();
      state.settings.theme = app.theme;
      session = deserializeSession(state.session);
      coversToggle.checked = true;
      app.refreshNav();
      app.show('import');
    },

    /** @returns {string} The current state as JSON text, for a backup file. */
    exportStateJson() {
      state.session = session.serialize();
      return storage.exportToJson(state);
    },

    /**
     * Reads a saved state file and makes it the current one.
     *
     * @param {string} text
     */
    importStateJson(text) {
      app.replaceState(storage.importFromJson(text));
    },

    /**
     * Offers the current state as a file.
     *
     * A method and not a button, because two places offer the same download —
     * the settings menu and the result screen — and a button that clicks
     * another button breaks silently the day one of them moves.
     */
    downloadState() {
      let text;
      try {
        text = app.exportStateJson();
      } catch (error) {
        app.toast(t('app.state.buildFailed', { message: error.message }), 'error');
        return;
      }

      downloadText(exportFileName('wishlist-state', 'json'), text, 'application/json');
      app.toast(t('app.state.saved'), 'ok');
    },

    /**
     * Puts a saved state file back in place of the current one.
     *
     * A wishlist import merges and loses nothing; a state import replaces
     * everything, so it is the one that asks first.
     *
     * @param {File} file
     * @returns {Promise<void>}
     */
    async loadState(file) {
      let text;
      try {
        text = await file.text();
      } catch (error) {
        app.toast(`${t('import.error.fileRead')}: ${error.message}`, 'error');
        return;
      }

      if (session.itemCount > 0) {
        const { comparisons } = session.getProgress();
        const confirmed = await app.confirm({
          title: t('state.confirm.title'),
          text: t('state.confirm.text', {
            items: plural('count.items', session.itemCount),
            comparisons: plural('count.comparisonsMade', comparisons),
          }),
          confirmLabel: t('state.confirm.confirm'),
          danger: true,
        });
        if (!confirmed) {
          app.toast(t('state.confirm.cancelled'));
          return;
        }
      }

      try {
        app.importStateJson(text);
      } catch (error) {
        const key = error instanceof StorageError ? STATE_ERROR_KEYS[error.code] : undefined;
        app.toast(key ? t(key) : `${t('import.error.title')}: ${error.message}`, 'error');
        return;
      }

      // Every screen is redrawn, not only the one on top: the whole session
      // underneath them has just been replaced.
      app.refreshAll();
      app.show(session.itemCount > 0 ? app.screen : 'import');
      app.toast(t('state.restored.toast'), 'ok');
    },

    /**
     * Shows a screen and renders it.
     *
     * @param {string} name One of `SCREEN_IDS`.
     */
    show(name) {
      const target = SCREEN_IDS.includes(name) ? name : 'import';
      current = target;
      for (const id of SCREEN_IDS) {
        document.getElementById(`screen-${id}`).hidden = id !== target;
      }
      rememberScreen(target);
      app.refreshNav();
      // A screen may want to place itself before drawing — the categories
      // screen jumps to the first item that still needs one. It happens on
      // arrival only, so that walking back through the list is not undone.
      screens[target].activate?.();
      screens[target].render();
      // The explanation comes after the screen is drawn, so that closing it
      // leaves the user in front of a stage that is already there.
      showIntro(target);
    },

    /** Re-renders the screen that is open, and the stages above it. */
    refresh() {
      app.refreshNav();
      if (current) screens[current].render();
    },

    /**
     * Re-renders every screen, not only the one on top. Used when the language
     * changes: a hidden screen keeps the words of its last draw, and the user
     * must not walk into a screen that is still in the previous language.
     */
    refreshAll() {
      for (const id of SCREEN_IDS) screens[id].render();
    },

    /**
     * Draws the four stages as the sequence they are: what has been passed,
     * where the user stands and what is not reachable yet.
     *
     * A stage is passed when its own work is finished, not when the user has
     * merely walked past it — the wishlist is loaded, every item has a
     * category, no comparison is left to ask. The result is never «passed»:
     * it is the place the work ends up in, not a task to close.
     *
     * The tick, the filled badge and the disabled button say the same three
     * things, so nothing here rests on colour alone; the word behind them is
     * for a screen reader, and it is set with `t()` so a change of language
     * carries it along.
     */
    refreshNav() {
      const hasItems = session.itemCount > 0;
      const done = {
        import: hasItems,
        categorize: hasItems && session.getCategoryAssignments().length === session.itemCount,
        compare: hasItems && session.getProgress().done,
        result: false,
      };

      let number = 0;
      for (const button of document.querySelectorAll('.navbtn')) {
        const name = button.dataset.screen;
        number += 1;

        if (button.hasAttribute('data-needs-items')) button.disabled = !hasItems;

        const isCurrent = name === current;
        const isDone = done[name] === true;
        const stage = button.disabled ? 'locked' : isDone ? 'done' : 'todo';
        button.dataset.state = stage;

        if (isCurrent) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');

        button.querySelector('.navbtn__badge').textContent = isDone ? '✓' : String(number);

        // A stage that is simply still ahead says nothing: its number and its
        // place in the list already say it.
        const stateKey = isCurrent
          ? 'nav.state.current'
          : stage === 'locked'
            ? 'nav.state.locked'
            : stage === 'done'
              ? 'nav.state.done'
              : '';
        button.querySelector('.navbtn__state').textContent = stateKey ? t(stateKey) : '';
      }
    },

    /**
     * Shows a short message at the bottom of the window.
     *
     * @param {string} message
     * @param {'info'|'ok'|'error'} [kind]
     */
    toast(message, kind = 'info') {
      toastNode.className = `toast toast--${kind}`;
      toastNode.textContent = message;
      toastNode.hidden = false;
      app.announce(message);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastNode.hidden = true;
      }, TOAST_MS);
    },

    /**
     * Says something to a screen reader without showing it.
     *
     * A live region is only read out when its text changes, and the same
     * sentence twice in a row is not a change: two answers undone, the same
     * refusal pressed twice, and the second one is silent. So the region is
     * emptied first and filled on the next tick, which makes every call a
     * change of its own. The wait is short enough to be part of the same
     * action and long enough for the two writes not to be seen as one.
     *
     * @param {string} message
     */
    announce(message) {
      clearTimeout(announceTimer);
      liveRegion.textContent = '';
      announceTimer = setTimeout(() => {
        liveRegion.textContent = message;
      }, ANNOUNCE_DELAY_MS);
    },

    /**
     * Asks before doing something that cannot be undone. Every such action in
     * the application goes through here, so none of them can quietly grow a
     * different, softer wording than the others.
     *
     * @param {{ title?: string, text: string, confirmLabel?: string,
     *           cancelLabel?: string, danger?: boolean }} options
     * @returns {Promise<boolean>} Whether the user agreed. Escape means no.
     */
    confirm(options) {
      return askConfirmation(options);
    },
  };

  screens.import = createImportScreen(app);
  screens.categorize = createCategorizeScreen(app);
  screens.compare = createCompareScreen(app);
  screens.result = createResultScreen(app);

  /* ------------------------------------------------------- chrome */

  /**
   * Lights the saving line and sets the moment it goes out again.
   *
   * The text itself is never touched: it sits in the markup with its key, so a
   * change of language repaints it like everything else, and a hundred saves
   * in a row change nothing but a timer. That is the whole reason this is not
   * a toast — `save()` runs after every answer of a comparison, and a queue of
   * toasts would be a flicker.
   */
  function markSaved() {
    saveStatus.classList.add('is-visible');
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => saveStatus.classList.remove('is-visible'), SAVE_STATUS_MS);
  }

  /**
   * Shows the one-off explanation of a stage, if it has not been shown yet.
   *
   * It is written down as seen the moment it opens, not when it is closed:
   * every way out of the dialog means it has been read, and a reload with one
   * standing open must not bring it back a second time. An empty list is not a
   * stage anybody is starting, so nothing is explained and nothing is spent.
   *
   * @param {string} stage
   */
  function showIntro(stage) {
    const intro = INTROS[stage];
    if (!intro || session.itemCount === 0 || isStageSeen(seenIntros, stage)) return;

    const dialog = document.getElementById(intro.dialog);
    if (!dialog || typeof dialog.showModal !== 'function') return;

    seenIntros = withStageSeen(seenIntros, stage);
    rememberIntros(seenIntros);

    // A dialog hands the keyboard back to whatever was focused when it opened,
    // and nothing on the screen opened this one — arriving at the stage did,
    // and the button that brought the user here is on a screen that is now
    // hidden. Focusing the heading first is therefore the whole mechanism:
    // closing the explanation, by its button or by Escape, leaves the keyboard
    // on the stage it was explaining. The heading carries `tabindex="-1"` for
    // exactly this, and no `close` handler is needed for it.
    document.getElementById(intro.heading)?.focus();
    dialog.showModal();
  }

  /**
   * Opens the settings menu under the button that asked for it.
   *
   * `<dialog>` places itself in the middle of the window, and this menu hangs
   * off a button in the corner, so the two coordinates are measured and handed
   * to the stylesheet. They are custom properties and not `top` and `right`
   * directly, because a narrow window wants the menu across the whole width
   * and an inline style would have outranked the media query saying so.
   */
  function openSettings() {
    // Skipping a stage is offered only where there is a stage to skip: on the
    // other screens the row would name something the user cannot do.
    document.getElementById('menu-stage-group').hidden = current !== 'categorize';

    const rect = settingsButton.getBoundingClientRect();
    settingsMenu.style.setProperty('--menu-top', `${Math.round(rect.bottom + 8)}px`);
    settingsMenu.style.setProperty(
      '--menu-right',
      `${Math.round(Math.max(8, window.innerWidth - rect.right))}px`,
    );
    settingsButton.setAttribute('aria-expanded', 'true');
    if (typeof settingsMenu.showModal === 'function') settingsMenu.showModal();
    else settingsMenu.setAttribute('open', '');
    settingsMenu.querySelector('#setting-covers')?.focus();
  }

  /**
   * Closes the settings menu and hands the keyboard back to the button that
   * opened it, so that Escape does not drop the focus at the top of the page.
   */
  function closeSettings() {
    const inside = settingsMenu.contains(document.activeElement);
    if (typeof settingsMenu.close === 'function') settingsMenu.close();
    else settingsMenu.removeAttribute('open');
    settingsButton.setAttribute('aria-expanded', 'false');
    if (inside) settingsButton.focus();
  }

  coversToggle.checked = app.loadCovers;
  coversToggle.addEventListener('change', () => {
    state.settings.loadCovers = coversToggle.checked;
    app.save();
    app.refresh();
    app.toast(t(coversToggle.checked ? 'app.covers.on' : 'app.covers.off'));
  });

  // Changing the language redraws, it does not restart: the session object is
  // untouched, so not one answer and not one position in the sorting is lost.
  // The menu is redrawn along with the page — every word in it carries a key,
  // so this holds with the menu standing open.
  languageSelect.addEventListener('change', () => {
    state.settings.language = applyLanguage(languageSelect.value);
    app.save();
    app.refreshAll();
    app.refreshNav();
    app.toast(t('app.language.changed', { language: LANGUAGE_NAMES[app.language] }));
  });

  // Switching the theme is a repaint and nothing more: the tokens change, the
  // markup does not, so there is no screen to redraw and nothing to lose.
  themeSelect.addEventListener('change', () => {
    state.settings.theme = applyTheme(themeSelect.value);
    app.save();
    app.toast(t('app.theme.changed', { theme: t(`theme.${app.theme}`) }));
  });

  /* --------------------------------------------------- settings menu */

  settingsButton.addEventListener('click', () => {
    if (settingsMenu.open) closeSettings();
    else openSettings();
  });

  // A click on the backdrop is reported with the dialog itself as the target,
  // and the dialog has no padding of its own, so nothing else produces one.
  settingsMenu.addEventListener('click', (event) => {
    if (event.target === settingsMenu) closeSettings();
  });

  // Escape is the browser's own way out of a modal dialog, and it takes it
  // without asking us. Taken over here rather than left to the `close` event,
  // because the button outside the dialog carries the open state and the
  // focus has to come back to it: one way out, one place that tidies up.
  settingsMenu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeSettings();
  });

  // Every other way the dialog may close — the browser's own, a future one.
  settingsMenu.addEventListener('close', () => {
    settingsButton.setAttribute('aria-expanded', 'false');
  });

  document.getElementById('action-save-state').addEventListener('click', () => {
    closeSettings();
    app.downloadState();
  });

  document.getElementById('action-load-state').addEventListener('click', () => {
    closeSettings();
    stateFileInput.click();
  });

  stateFileInput.addEventListener('change', () => {
    const file = stateFileInput.files?.[0];
    // Cleared straight away, so that choosing the same file again fires this.
    stateFileInput.value = '';
    if (file) app.loadState(file);
  });

  // The stage itself owns what skipping it means and what it costs; the menu
  // only names the action and gets out of the way of the confirmation.
  document.getElementById('action-skip-stage').addEventListener('click', () => {
    closeSettings();
    screens.categorize.skipStage();
  });

  document.getElementById('action-reset').addEventListener('click', async () => {
    closeSettings();
    const confirmed = await app.confirm({
      title: t('app.reset.title'),
      text: t('app.reset.text', { items: plural('count.items', session.itemCount) }),
      confirmLabel: t('app.reset.confirm'),
      danger: true,
    });
    if (!confirmed) return;
    app.resetAll();
    app.toast(t('app.reset.done'));
  });

  /* -------------------------------------------------- privacy strip */

  // The promise itself stays on the screen always — it is not something to
  // hide in a menu. What folds away is the paragraph naming exactly which
  // requests leave the machine and when.
  const privacyToggle = document.getElementById('privacy-toggle');
  const privacyFull = document.getElementById('privacy-full');
  privacyToggle.addEventListener('click', () => {
    const opened = privacyFull.hidden;
    privacyFull.hidden = !opened;
    privacyToggle.setAttribute('aria-expanded', String(opened));
  });

  /* -------------------------------------------------------- the rest */

  for (const button of document.querySelectorAll('.navbtn')) {
    button.addEventListener('click', () => app.show(button.dataset.screen));
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    // A field takes the key, and so does a dialog standing over the page: the
    // «1» that files an item under a category must not reach the list behind
    // an open settings menu.
    if (isHotkeyBlocked(event.target)) return;
    screens[current]?.handleKey?.(event);
  });

  app.refreshNav();
  app.show(session.itemCount === 0 ? 'import' : rememberedScreen());

  if (loadError) {
    app.toast(t('app.loadFailed', { message: loadError.message }), 'error');
  }

  return app;
}

/**
 * Puts the whole page into a language: the dictionaries, the `lang` of the
 * document (screen readers and hyphenation read it), the switch in the header
 * and every element of the markup that carries a key.
 *
 * The dynamic parts are not touched here — a screen redraws them itself with
 * `app.refresh()`, which is also what keeps the current position in the
 * sorting: nothing is reloaded, only re-rendered.
 *
 * @param {string} code
 * @returns {string} The language that is now in use.
 */
function applyLanguage(code) {
  const language = setLanguage(code);
  document.documentElement.lang = language;
  const select = document.getElementById('setting-language');
  if (select) select.value = language;
  applyTranslations();
  return language;
}

/**
 * Puts the whole page into a theme. One attribute on the root element decides
 * which set of tokens `styles.css` hands out, so this is the entire mechanism:
 * no class is added to anything, and no screen is rebuilt.
 *
 * @param {string} name
 * @returns {string} The theme that is now in use.
 */
function applyTheme(name) {
  const theme = normalizeTheme(name);
  document.documentElement.dataset.theme = theme;
  const select = document.getElementById('setting-theme');
  if (select) select.value = theme;
  rememberTheme(theme);
  return theme;
}

/**
 * Shows the confirmation dialog and resolves with the answer.
 *
 * `<dialog>` does the hard parts itself: the page behind it stops taking
 * clicks, the focus stays inside, and Escape closes it — which counts as "no",
 * like every other way out that is not the confirm button.
 *
 * The answer is taken from the buttons themselves rather than from the `close`
 * event alone. A dialog that closes without ever telling us would leave the
 * caller waiting forever, and the caller here is "delete everything": pressing
 * it and having nothing happen at all is the one outcome worth engineering
 * around.
 *
 * @param {{ title?: string, text: string, confirmLabel?: string,
 *           cancelLabel?: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
function askConfirmation(options) {
  const dialog = document.getElementById('confirm-dialog');
  const okButton = document.getElementById('confirm-ok');
  const cancelButton = document.getElementById('confirm-cancel');

  document.getElementById('confirm-title').textContent = options.title ?? t('dialog.title');
  document.getElementById('confirm-text').textContent = options.text;
  okButton.textContent = options.confirmLabel ?? t('dialog.confirm');
  cancelButton.textContent = options.cancelLabel ?? t('dialog.cancel');
  okButton.classList.toggle('btn--danger', options.danger === true);

  // A browser without <dialog> still has to be able to say no to a deletion.
  if (typeof dialog.showModal !== 'function') {
    return Promise.resolve(window.confirm(`${options.title}\n\n${options.text}`));
  }

  return new Promise((resolve) => {
    const finish = (answer) => {
      okButton.removeEventListener('click', onConfirm);
      cancelButton.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(answer);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onClose = () => finish(dialog.returnValue === 'confirm');

    okButton.addEventListener('click', onConfirm);
    cancelButton.addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);

    dialog.returnValue = '';
    dialog.showModal();
    // The safe answer keeps the focus, so Enter on an unread dialog cancels.
    cancelButton.focus();
  });
}

/**
 * @returns {string} The screen to open on start.
 */
function rememberedScreen() {
  try {
    const stored = window.localStorage.getItem(SCREEN_KEY);
    return SCREEN_IDS.includes(stored) ? stored : 'import';
  } catch {
    return 'import';
  }
}

/**
 * @param {string} name
 */
function rememberScreen(name) {
  try {
    window.localStorage.setItem(SCREEN_KEY, name);
  } catch {
    // Storage may be denied; the screen simply is not remembered.
  }
}

/**
 * Mirrors the theme to the small key the script in the document head reads.
 *
 * Called from `applyTheme()` and therefore from every path a theme can arrive
 * by — the switch, the start of a session, an imported file, starting over —
 * so the mirror cannot drift from `settings.theme`, which stays the one place
 * the theme is really kept.
 *
 * @param {string} theme
 */
function rememberTheme(theme) {
  try {
    writeThemeMirror(window.localStorage, theme);
  } catch {
    // Storage may be denied; the next cold start simply opens in Modern.
  }
}

/**
 * @returns {string[]} The stages whose explanation has already been shown.
 */
function readSeenIntros() {
  try {
    return parseSeenStages(window.localStorage.getItem(ONBOARDING_KEY));
  } catch {
    return [];
  }
}

/**
 * @param {string[]} stages
 */
function rememberIntros(stages) {
  try {
    window.localStorage.setItem(ONBOARDING_KEY, serializeSeenStages(stages));
  } catch {
    // Storage may be denied; the explanation is then shown once more.
  }
}

createApp();
