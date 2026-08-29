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
import { deserializeSession, createSession } from './ranking.js';
import { StateStorage, StorageError, createEmptyState } from './storage.js';
import { normalizeTheme } from './theme.js';
import { applyTranslations, downloadText, isTypingTarget } from './ui-common.js';
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

/** How long a toast stays on the screen, in milliseconds. */
const TOAST_MS = 3200;

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
  let current = null;

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
      for (const button of document.querySelectorAll('.navbtn')) {
        if (button.dataset.screen === target) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      rememberScreen(target);
      // A screen may want to place itself before drawing — the categories
      // screen jumps to the first item that still needs one. It happens on
      // arrival only, so that walking back through the list is not undone.
      screens[target].activate?.();
      screens[target].render();
    },

    /** Re-renders the screen that is open. */
    refresh() {
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

    /** Enables the stages that need items and disables the ones that do not. */
    refreshNav() {
      const hasItems = session.itemCount > 0;
      for (const button of document.querySelectorAll('.navbtn[data-needs-items]')) {
        button.disabled = !hasItems;
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
     * @param {string} message
     */
    announce(message) {
      liveRegion.textContent = message;
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

  coversToggle.checked = app.loadCovers;
  coversToggle.addEventListener('change', () => {
    state.settings.loadCovers = coversToggle.checked;
    app.save();
    app.refresh();
    app.toast(t(coversToggle.checked ? 'app.covers.on' : 'app.covers.off'));
  });

  // Changing the language redraws, it does not restart: the session object is
  // untouched, so not one answer and not one position in the sorting is lost.
  languageSelect.addEventListener('change', () => {
    state.settings.language = applyLanguage(languageSelect.value);
    app.save();
    app.refreshAll();
    app.toast(t('app.language.changed', { language: LANGUAGE_NAMES[app.language] }));
  });

  // Switching the theme is a repaint and nothing more: the tokens change, the
  // markup does not, so there is no screen to redraw and nothing to lose.
  themeSelect.addEventListener('change', () => {
    state.settings.theme = applyTheme(themeSelect.value);
    app.save();
    app.toast(t('app.theme.changed', { theme: t(`theme.${app.theme}`) }));
  });

  document.getElementById('action-save-state').addEventListener('click', () => {
    downloadStateFile(app);
  });

  document.getElementById('action-reset').addEventListener('click', async () => {
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

  for (const button of document.querySelectorAll('.navbtn')) {
    button.addEventListener('click', () => app.show(button.dataset.screen));
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
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
  return theme;
}

/**
 * Offers the current state as a file. The download never leaves the machine:
 * the blob is built in the page and handed to the browser.
 *
 * @param {object} app
 */
function downloadStateFile(app) {
  let text;
  try {
    text = app.exportStateJson();
  } catch (error) {
    app.toast(t('app.state.buildFailed', { message: error.message }), 'error');
    return;
  }

  downloadText(exportFileName('wishlist-state', 'json'), text, 'application/json');
  app.toast(t('app.state.saved'), 'ok');
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

createApp();
