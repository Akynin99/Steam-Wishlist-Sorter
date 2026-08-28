/**
 * Import screen: the three ways of getting a wishlist into the application
 * plus the demo set, and the report that says what actually happened.
 *
 * Nothing here parses JSON by hand: `import.js` accepts every shape and
 * `storage.js` validates a state file. This module only turns their reason
 * codes into Russian sentences.
 */

import { ImportError, SKIP_REASONS, importItemsSorted } from './import.js';
import { StorageError } from './storage.js';
import { clear, element, plural } from './ui-common.js';

/** Where the demo set lives, relative to `index.html`. */
const DEMO_URL = 'tests/fixtures/sample-wishlist.json';

/** How many problem records the report lists before it stops. */
const MAX_ISSUES_SHOWN = 6;

/** @type {Record<string, string>} */
const IMPORT_ERRORS = {
  'empty-input': 'Импортировать нечего: файл или поле пустые.',
  'invalid-json':
    'Это не JSON. Похоже, текст скопирован не целиком или в него попало что-то лишнее.',
  'unrecognized-format':
    'JSON прочитан, но на список желаемого он не похож. Нужен массив позиций, объект вида { "440": { … } } или ответ Steam с полем response.items.',
};

/** @type {Record<string, string>} */
const STATE_ERRORS = {
  'invalid-json': 'Файл состояния не читается как JSON.',
  'foreign-state': 'Это JSON другого приложения: в нём нет подписи Steam Wishlist Sorter.',
  'unsupported-version': 'Файл сохранён другой версией формата и не поддерживается.',
  'invalid-state': 'Файл похож на состояние, но в нём нет сессии.',
  'write-failed': 'Состояние прочитано, но браузер отказался его сохранить.',
};

/** @type {Record<string, string>} */
const SKIP_LABELS = {
  [SKIP_REASONS.NOT_AN_OBJECT]: 'запись не похожа ни на позицию, ни на app id',
  [SKIP_REASONS.MISSING_APP_ID]: 'нет идентификатора приложения',
  [SKIP_REASONS.INVALID_APP_ID]: 'идентификатор приложения не число',
  [SKIP_REASONS.DUPLICATE_IN_INPUT]: 'позиция уже встречалась в этом же файле',
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
   * Imports a wishlist and merges it into the session.
   *
   * `setItems` keeps the categories and the answers of the items that survive,
   * so re-importing a refreshed wishlist never throws away the work already
   * done.
   *
   * @param {string} input   JSON text.
   * @param {string} source  What is being imported, for the message.
   */
  function runImport(input, source) {
    let result;
    try {
      result = importItemsSorted(input, { existing: app.session.getItems() });
    } catch (error) {
      showError(error, IMPORT_ERRORS);
      return;
    }

    if (result.items.length === 0) {
      showFailure(
        'Импорт прошёл, но список пуст',
        'Ни одной позиции прочитать не удалось. Проверьте, что в файле действительно список желаемого.',
      );
      return;
    }

    app.session.setItems(result.items);
    app.save();
    app.refreshNav();
    showReport(result.report, source);
    render();
    app.announce(`Импортировано ${result.report.total}. Всего в списке ${app.session.itemCount}.`);
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
      showError(error, STATE_ERRORS);
      return;
    }

    clear(nodes.feedback);
    nodes.feedback.append(
      element('div', { className: 'report' }, [
        element('p', { className: 'report__title', text: 'Состояние восстановлено' }),
        element('div', { className: 'report__numbers' }, [
          element('span', {}, [
            document.createTextNode('позиций: '),
            element('b', { text: String(app.session.itemCount) }),
          ]),
          element('span', {}, [
            document.createTextNode('сравнений сделано: '),
            element('b', { text: String(app.session.getProgress().comparisons) }),
          ]),
        ]),
      ]),
    );
    render();
    app.toast('Состояние восстановлено из файла.', 'ok');
  }

  /**
   * @param {import('./import.js').ImportReport} report
   * @param {string} source
   */
  function showReport(report, source) {
    const numbers = element('div', { className: 'report__numbers' }, [
      counter('добавлено', report.added),
      counter('обновлено', report.updated),
      counter('дубликатов', report.duplicates),
      counter('пропущено', report.skipped),
    ]);

    const block = element('div', { className: 'report' }, [
      element('p', {
        className: 'report__title',
        text: `${source}: прочитано ${report.total} ${plural(report.total, ['запись', 'записи', 'записей'])}`,
      }),
      numbers,
    ]);

    if (report.issues.length > 0) {
      const list = element('ul', { className: 'report__issues' });
      for (const issue of report.issues.slice(0, MAX_ISSUES_SHOWN)) {
        const where = typeof issue.key === 'number' ? `запись №${issue.key + 1}` : `ключ «${issue.key}»`;
        const what = SKIP_LABELS[issue.reason] ?? issue.reason;
        list.append(element('li', { text: `${where}: ${what}` }));
      }
      if (report.issues.length > MAX_ISSUES_SHOWN) {
        list.append(
          element('li', {
            text: `…и ещё ${report.issues.length - MAX_ISSUES_SHOWN}`,
          }),
        );
      }
      block.append(list);
    }

    clear(nodes.feedback);
    nodes.feedback.append(block);
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
   * @param {Record<string, string>} messages
   */
  function showError(error, messages) {
    const known = error instanceof ImportError || error instanceof StorageError;
    const text = (known && messages[error.code]) || (error instanceof Error ? error.message : String(error));
    showFailure('Импортировать не удалось', text);
  }

  /**
   * @param {string} title
   * @param {string} text
   */
  function showFailure(title, text) {
    clear(nodes.feedback);
    nodes.feedback.append(
      element('div', { className: 'report report--error' }, [
        element('p', { className: 'report__title', text: title }),
        element('p', { text }),
      ]),
    );
    app.announce(`${title}. ${text}`);
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
    nameNode.textContent = file.name;
    file
      .text()
      .then((text) => handler(text, file.name))
      .catch((error) => showFailure('Файл не прочитался', error.message))
      .finally(() => {
        // Cleared so that picking the same file again fires the event.
        input.value = '';
      });
  }

  nodes.file.addEventListener('change', () => {
    readPickedFile(nodes.file, nodes.fileName, (text, name) => runImport(text, `Файл ${name}`));
  });

  nodes.state.addEventListener('change', () => {
    readPickedFile(nodes.state, nodes.stateName, (text) => runStateImport(text));
  });

  nodes.textRun.addEventListener('click', () => {
    runImport(nodes.text.value, 'Вставленный текст');
  });

  nodes.demo.addEventListener('click', () => {
    nodes.demo.disabled = true;
    fetch(DEMO_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
        return response.text();
      })
      .then((text) => runImport(text, 'Демо-набор'))
      .catch((error) =>
        showFailure(
          'Демо-набор не загрузился',
          `${error.message}. Файл ${DEMO_URL} должен лежать рядом с index.html — и страница должна быть открыта с локального сервера, а не как file://.`,
        ),
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
    const count = app.session.itemCount;
    nodes.current.hidden = count === 0;
    if (count === 0) return;

    const items = app.session.getItems();
    const sorted = items.filter((item) => app.session.getCategory(item.appId) !== null).length;
    const comparisons = app.session.getProgress().comparisons;

    nodes.currentText.textContent =
      `Сейчас в списке ${count} ${plural(count, ['позиция', 'позиции', 'позиций'])}: ` +
      `${sorted} с категорией, ${count - sorted} без. Сравнений сделано: ${comparisons}. ` +
      'Повторный импорт обновит позиции и сохранит уже проделанную работу.';
  }

  return { render };
}
