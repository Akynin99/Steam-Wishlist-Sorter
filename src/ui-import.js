/**
 * Import screen: the three ways of getting a wishlist into the application
 * plus the demo set, and the report that says what actually happened.
 *
 * Nothing here parses JSON by hand: `import.js` accepts every shape and
 * `storage.js` validates a state file. This module only turns their reason
 * codes into sentences.
 *
 * What the feedback block says is kept as data — which report, which numbers,
 * which failure — and drawn from that on every render. A report that was read
 * in one language is therefore rewritten when the language changes, instead of
 * staying behind as the one Russian paragraph on an English screen.
 */

import { plural, t } from './i18n.js';
import { ImportError, SKIP_REASONS, importItemsSorted } from './import.js';
import { StorageError } from './storage.js';
import { clear, element } from './ui-common.js';

/** Where the demo set lives, relative to `index.html`. */
const DEMO_URL = 'tests/fixtures/sample-wishlist.json';

/** How many problem records the report lists before it stops. */
const MAX_ISSUES_SHOWN = 6;

/** Dictionary key for every reason `import.js` can refuse an input for. */
const IMPORT_ERROR_KEYS = {
  'empty-input': 'import.error.emptyInput',
  'invalid-json': 'import.error.invalidJson',
  'unrecognized-format': 'import.error.unrecognizedFormat',
};

/** The same for a state file, refused by `storage.js`. */
const STATE_ERROR_KEYS = {
  'invalid-json': 'state.error.invalidJson',
  'foreign-state': 'state.error.foreignState',
  'unsupported-version': 'state.error.unsupportedVersion',
  'invalid-state': 'state.error.invalidState',
  'write-failed': 'state.error.writeFailed',
};

/** Why a record of the input did not become an item. */
const SKIP_KEYS = {
  [SKIP_REASONS.NOT_AN_OBJECT]: 'import.skip.notAnObject',
  [SKIP_REASONS.MISSING_APP_ID]: 'import.skip.missingAppId',
  [SKIP_REASONS.INVALID_APP_ID]: 'import.skip.invalidAppId',
  [SKIP_REASONS.DUPLICATE_IN_INPUT]: 'import.skip.duplicateInInput',
};

/**
 * @param {object} app
 * @returns {{ render: Function }}
 */
export function createImportScreen(app) {
  const nodes = {
    file: document.getElementById('import-file'),
    fileName: document.getElementById('import-file-name'),
    text: document.getElementById('import-text'),
    textRun: document.getElementById('import-text-run'),
    state: document.getElementById('import-state'),
    stateName: document.getElementById('import-state-name'),
    demo: document.getElementById('import-demo'),
    feedback: document.getElementById('import-feedback'),
    current: document.getElementById('import-current'),
    currentText: document.getElementById('import-current-text'),
    continue: document.getElementById('import-continue'),
  };

  /**
   * What the feedback block says, as data.
   *
   * @type {null
   *   | { kind: 'report', report: object, sourceKey: string, sourceParams: object }
   *   | { kind: 'state', items: number, comparisons: number, moves: number }
   *   | { kind: 'failure', titleKey: string, textKey?: string, params?: object, text?: string }}
   */
  let feedback = null;

  /**
   * Imports a wishlist and merges it into the session.
   *
   * `setItems` keeps the categories and the answers of the items that survive,
   * so re-importing a refreshed wishlist never throws away the work already
   * done.
   *
   * @param {string} input       JSON text.
   * @param {string} sourceKey   Dictionary key naming what is being imported.
   * @param {object} [sourceParams]
   */
  function runImport(input, sourceKey, sourceParams = {}) {
    let result;
    try {
      result = importItemsSorted(input, { existing: app.session.getItems() });
    } catch (error) {
      showError(error, IMPORT_ERROR_KEYS);
      return;
    }

    if (result.items.length === 0) {
      showFailure({
        titleKey: 'import.error.emptyResultTitle',
        textKey: 'import.error.emptyResultText',
      });
      return;
    }

    app.session.setItems(result.items);
    app.save();
    app.refreshNav();
    feedback = { kind: 'report', report: result.report, sourceKey, sourceParams };
    render();
    app.announce(
      t('import.announce', { count: result.report.total, total: app.session.itemCount }),
    );
  }

  /**
   * Asks before a state file is loaded over work that is already here. An
   * import of a wishlist merges into the session and loses nothing; an import
   * of a state replaces it whole, so it is the one that has to be confirmed.
   *
   * @param {string} text
   */
  async function confirmStateImport(text) {
    if (app.session.itemCount > 0) {
      const { comparisons } = app.session.getProgress();
      const confirmed = await app.confirm({
        title: t('state.confirm.title'),
        text: t('state.confirm.text', {
          items: plural('count.items', app.session.itemCount),
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
    runStateImport(text);
  }

  /**
   * Restores a previously saved state file: items, categories and answers.
   *
   * @param {string} text
   */
  function runStateImport(text) {
    try {
      app.importStateJson(text);
    } catch (error) {
      showError(error, STATE_ERROR_KEYS);
      return;
    }

    feedback = {
      kind: 'state',
      items: app.session.itemCount,
      comparisons: app.session.getProgress().comparisons,
      moves: app.session.manualMoveCount,
    };
    render();
    app.toast(t('state.restored.toast'), 'ok');
  }

  /**
   * @param {object} report
   * @param {string} sourceKey
   * @param {object} sourceParams
   * @returns {HTMLElement}
   */
  function reportBlock(report, sourceKey, sourceParams) {
    const numbers = element('div', { className: 'report__numbers' }, [
      counter(t('import.report.added'), report.added),
      counter(t('import.report.updated'), report.updated),
      counter(t('import.report.duplicates'), report.duplicates),
      counter(t('import.report.skipped'), report.skipped),
    ]);

    const block = element('div', { className: 'report' }, [
      element('p', {
        className: 'report__title',
        text: t('import.report.title', {
          source: t(sourceKey, sourceParams),
          records: plural('count.records', report.total),
        }),
      }),
      numbers,
    ]);

    if (report.issues.length > 0) {
      const list = element('ul', { className: 'report__issues' });
      for (const issue of report.issues.slice(0, MAX_ISSUES_SHOWN)) {
        const where =
          typeof issue.key === 'number'
            ? t('import.issue.entry', { number: issue.key + 1 })
            : t('import.issue.key', { key: issue.key });
        const what = SKIP_KEYS[issue.reason] ? t(SKIP_KEYS[issue.reason]) : issue.reason;
        list.append(element('li', { text: t('import.issue.line', { where, what }) }));
      }
      if (report.issues.length > MAX_ISSUES_SHOWN) {
        list.append(
          element('li', {
            text: t('import.issue.more', { count: report.issues.length - MAX_ISSUES_SHOWN }),
          }),
        );
      }
      block.append(list);
    }

    return block;
  }

  /**
   * @param {{ items: number, comparisons: number, moves: number }} restored
   * @returns {HTMLElement}
   */
  function stateBlock(restored) {
    return element('div', { className: 'report' }, [
      element('p', { className: 'report__title', text: t('state.restored.title') }),
      element('div', { className: 'report__numbers' }, [
        counter(t('state.restored.items'), restored.items),
        counter(t('state.restored.comparisons'), restored.comparisons),
        counter(t('state.restored.moves'), restored.moves),
      ]),
    ]);
  }

  /**
   * @param {string} label
   * @param {number} value
   * @returns {HTMLElement}
   */
  function counter(label, value) {
    return element('span', {}, [
      document.createTextNode(`${label}: `),
      element('b', { text: String(value) }),
    ]);
  }

  /**
   * @param {unknown} error
   * @param {Record<string, string>} keys Reason code to dictionary key.
   */
  function showError(error, keys) {
    const known = error instanceof ImportError || error instanceof StorageError;
    const key = known ? keys[error.code] : undefined;
    showFailure({
      titleKey: 'import.error.title',
      textKey: key,
      text: key ? undefined : error instanceof Error ? error.message : String(error),
    });
  }

  /**
   * @param {{ titleKey: string, textKey?: string, params?: object, text?: string }} failure
   */
  function showFailure(failure) {
    feedback = { kind: 'failure', ...failure };
    render();
    app.announce(`${t(failure.titleKey)}. ${failureText(feedback)}`);
  }

  /**
   * @param {{ textKey?: string, params?: object, text?: string }} failure
   * @returns {string}
   */
  function failureText(failure) {
    return failure.textKey ? t(failure.textKey, failure.params ?? {}) : (failure.text ?? '');
  }

  /** Draws the feedback block from whatever it currently says. */
  function renderFeedback() {
    clear(nodes.feedback);
    if (feedback === null) return;

    if (feedback.kind === 'report') {
      nodes.feedback.append(reportBlock(feedback.report, feedback.sourceKey, feedback.sourceParams));
      return;
    }
    if (feedback.kind === 'state') {
      nodes.feedback.append(stateBlock(feedback));
      return;
    }

    nodes.feedback.append(
      element('div', { className: 'report report--error' }, [
        element('p', { className: 'report__title', text: t(feedback.titleKey) }),
        element('p', { text: failureText(feedback) }),
      ]),
    );
  }

  /**
   * Reads a file the user picked and hands its text to `handler`.
   *
   * @param {HTMLInputElement} input
   * @param {HTMLElement} nameNode
   * @param {(text: string, fileName: string) => void} handler
   */
  function readPickedFile(input, nameNode, handler) {
    const file = input.files?.[0];
    if (!file) return;
    // The name of a picked file is not a translatable string, so the element
    // stops following the dictionary once it holds one.
    nameNode.removeAttribute('data-i18n');
    nameNode.textContent = file.name;
    file
      .text()
      .then((text) => handler(text, file.name))
      .catch((error) =>
        showFailure({ titleKey: 'import.error.fileRead', text: error.message }),
      )
      .finally(() => {
        // Cleared so that picking the same file again fires the event.
        input.value = '';
      });
  }

  nodes.file.addEventListener('change', () => {
    readPickedFile(nodes.file, nodes.fileName, (text, name) =>
      runImport(text, 'import.source.file', { name }),
    );
  });

  nodes.state.addEventListener('change', () => {
    readPickedFile(nodes.state, nodes.stateName, (text) => confirmStateImport(text));
  });

  nodes.textRun.addEventListener('click', () => {
    runImport(nodes.text.value, 'import.source.pasted');
  });

  nodes.demo.addEventListener('click', () => {
    nodes.demo.disabled = true;
    fetch(DEMO_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(t('import.demo.httpError', { status: response.status }));
        }
        return response.text();
      })
      .then((text) => runImport(text, 'import.source.demo'))
      .catch((error) =>
        showFailure({
          titleKey: 'import.demo.failedTitle',
          textKey: 'import.demo.failedText',
          params: { message: error.message, url: DEMO_URL },
        }),
      )
      .finally(() => {
        nodes.demo.disabled = false;
      });
  });

  nodes.continue.addEventListener('click', () => {
    const uncategorized = app.session.getItems().some((item) => app.session.getCategory(item.appId) === null);
    app.show(uncategorized ? 'categorize' : 'compare');
  });

  function render() {
    renderFeedback();

    const count = app.session.itemCount;
    nodes.current.hidden = count === 0;
    if (count === 0) return;

    const items = app.session.getItems();
    const sorted = items.filter((item) => app.session.getCategory(item.appId) !== null).length;
    const comparisons = app.session.getProgress().comparisons;

    nodes.currentText.textContent = t('import.current', {
      items: plural('count.items', count),
      sorted,
      plain: count - sorted,
      comparisons,
    });
  }

  return { render };
}
