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
import { deserializeSession, createSession } from './ranking.js';
import { StateStorage, StorageError, createEmptyState } from './storage.js';
import { downloadText, isTypingTarget, plural } from './ui-common.js';
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
            ? 'Не удалось сохранить состояние в браузере. Сохраните его в файл, чтобы не потерять.'
            : `Не удалось сохранить состояние: ${error.message}`,
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
      app.refreshNav();
    },

    /** Drops everything and starts from an empty session. */
    resetAll() {
      storage.clear();
      state = createEmptyState();
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
     * @param {{ title: string, text: string, confirmLabel?: string,
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
    app.toast(
      coversToggle.checked
        ? 'Обложки включены: приложение загружает картинки с CDN Steam.'
        : 'Обложки выключены: приложение не делает ни одного внешнего запроса.',
    );
  });

  document.getElementById('action-save-state').addEventListener('click', () => {
    downloadStateFile(app);
  });

  document.getElementById('action-reset').addEventListener('click', async () => {
    const confirmed = await app.confirm({
      title: 'Начать заново?',
      text:
        `Будут удалены все ${session.itemCount} ` +
        `${plural(session.itemCount, ['позиция', 'позиции', 'позиций'])}, категории, ответы ` +
        'на сравнения и ручные перестановки. ' +
        'Отменить это будет нельзя — если работа может пригодиться, сначала сохраните её в файл.',
      confirmLabel: 'Удалить всё и начать заново',
      danger: true,
    });
    if (!confirmed) return;
    app.resetAll();
    app.toast('Состояние очищено.');
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
    app.toast(
      `Сохранённое состояние не удалось прочитать (${loadError.message}). Начинаем с пустого списка.`,
      'error',
    );
  }

  return app;
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
    app.toast(`Не удалось собрать файл состояния: ${error.message}`, 'error');
    return;
  }

  downloadText(exportFileName('wishlist-state', 'json'), text, 'application/json');
  app.toast('Состояние сохранено в файл.', 'ok');
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
 * @param {{ title: string, text: string, confirmLabel?: string,
 *           cancelLabel?: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
function askConfirmation(options) {
  const dialog = document.getElementById('confirm-dialog');
  const okButton = document.getElementById('confirm-ok');
  const cancelButton = document.getElementById('confirm-cancel');

  document.getElementById('confirm-title').textContent = options.title;
  document.getElementById('confirm-text').textContent = options.text;
  okButton.textContent = options.confirmLabel ?? 'Продолжить';
  cancelButton.textContent = options.cancelLabel ?? 'Отмена';
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
