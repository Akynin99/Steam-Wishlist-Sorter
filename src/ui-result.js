/**
 * Result screen.
 *
 * The list is available at any moment, finished or not: `getResult()` orders
 * everything the comparisons imply and falls back to the wishlist order for
 * the rest. The screen says out loud which part is which, so a half finished
 * sorting is still usable and is never passed off as a final ranking.
 *
 * Export to JSON, CSV and text is a separate stage of the project; here the
 * list is only shown.
 */

import { categoryTitle, clear, element, plural, renderCover } from './ui-common.js';

/**
 * @param {object} app
 * @returns {{ render: Function }}
 */
export function createResultScreen(app) {
  const nodes = {
    summary: document.getElementById('result-summary'),
    list: document.getElementById('result-list'),
    removed: document.getElementById('result-removed'),
    removedList: document.getElementById('result-removed-list'),
    continueButton: document.getElementById('result-continue'),
    saveButton: document.getElementById('result-save'),
  };

  nodes.continueButton.addEventListener('click', () => {
    app.show(app.session.itemCount === 0 ? 'import' : 'compare');
  });
  nodes.saveButton.addEventListener('click', () => {
    document.getElementById('action-save-state').click();
  });

  /**
   * One line of the ranking.
   *
   * @param {import('./ranking.js').ResultEntry} entry
   * @param {boolean} loadCovers
   * @returns {HTMLElement}
   */
  function renderRow(entry, loadCovers) {
    const cover = element('div', { className: 'cover' });
    renderCover(cover, entry.item, loadCovers);

    const marks = element('div', { className: 'result-row__marks' });
    if (entry.tiedWithPrevious) {
      marks.append(element('span', { text: '= как предыдущая' }));
    }
    if (!entry.resolved) {
      marks.append(element('span', { text: 'порядок не подтверждён сравнениями' }));
    }
    if (entry.item.kind === 'dlc') {
      marks.append(element('span', { className: 'badge badge--dlc', text: 'DLC' }));
    }

    const title = element('div', { className: 'result-row__title' }, [
      element('div', { text: entry.item.title }),
      element('div', {
        className: 'progress__legend',
        text: `${categoryTitle(entry.category)} · ${entry.positionInCategory} в категории`,
      }),
    ]);

    return element(
      'li',
      {
        className: `result-row${entry.resolved ? '' : ' result-row--fallback'}${
          entry.tiedWithPrevious ? ' result-row--tied' : ''
        }`,
      },
      [
        element('span', { className: 'result-row__position', text: String(entry.position) }),
        cover,
        title,
        marks,
      ],
    );
  }

  function render() {
    const { entries, removed, summary } = app.session.getResult();
    const loadCovers = app.loadCovers;

    nodes.summary.textContent = entries.length === 0
      ? 'Список пуст: пока нечего показывать.'
      : `Всего ${summary.total} ${plural(summary.total, ['позиция', 'позиции', 'позиций'])}. ` +
        `Порядок подтверждён сравнениями у ${summary.resolved}, ` +
        `остальные ${summary.fallback} стоят в запасном порядке — по позиции в вашем wishlist. ` +
        `Сравнений сделано: ${summary.comparisons}. ` +
        (summary.complete ? 'Сортировка завершена.' : 'Сортировка не завершена, её можно продолжить.');

    clear(nodes.list);
    for (const entry of entries) nodes.list.append(renderRow(entry, loadCovers));

    nodes.removed.hidden = removed.length === 0;
    clear(nodes.removedList);
    for (const item of removed) {
      nodes.removedList.append(element('li', { text: item.title }));
    }

    nodes.continueButton.disabled = summary.complete && app.session.itemCount > 0;
    nodes.continueButton.textContent = app.session.itemCount === 0
      ? 'Перейти к импорту'
      : summary.complete
        ? 'Сортировка завершена'
        : 'Продолжить сортировку';
  }

  return { render };
}
