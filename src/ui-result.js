/**
 * Result screen.
 *
 * The list is available at any moment, finished or not: `getResult()` orders
 * everything the comparisons imply and falls back to the wishlist order for
 * the rest. The screen says out loud which part is which, so a half finished
 * sorting is still usable and is never passed off as a final ranking.
 *
 * Three lines can be edited here without going back to the comparisons: the
 * place of an item (drag or `Ctrl` with an arrow), its category (the select in
 * the row) and whether it belongs in the list at all. A hand made placement is
 * kept by `ranking.js` as "this item goes next to that one" and replayed over
 * whatever the comparisons produce, so returning to the sorting improves the
 * list around the placements instead of erasing them.
 *
 * The four exports are built by `export.js`; this module only hands the text
 * to the browser.
 */

import { CATEGORIES, UNCATEGORIZED_LABEL, isSortableCategory } from './model.js';
import { exportFileName, toCsv, toOrderJson, toPlainText } from './export.js';
import {
  categoryTitle,
  clear,
  copyText,
  downloadText,
  element,
  kindLabel,
  plural,
  renderCover,
} from './ui-common.js';

/** What the kind filter can be set to. */
const FILTERS = { all: 'all', game: 'game', dlc: 'dlc' };

/**
 * @param {object} app
 * @returns {{ render: Function, activate: Function }}
 */
export function createResultScreen(app) {
  const nodes = {
    summary: document.getElementById('result-summary'),
    legend: document.getElementById('result-legend'),
    search: document.getElementById('result-search'),
    filters: [...document.querySelectorAll('#screen-result [data-filter]')],
    shown: document.getElementById('result-shown'),
    hint: document.getElementById('result-hint'),
    list: document.getElementById('result-list'),
    empty: document.getElementById('result-empty'),
    removed: document.getElementById('result-removed'),
    removedList: document.getElementById('result-removed-list'),
    continueButton: document.getElementById('result-continue'),
    exportJson: document.getElementById('result-export-json'),
    exportCsv: document.getElementById('result-export-csv'),
    copyText: document.getElementById('result-copy-text'),
    saveButton: document.getElementById('result-save'),
    resetManual: document.getElementById('result-reset-manual'),
    resetAnswers: document.getElementById('result-reset-answers'),
  };

  /** @type {'all'|'game'|'dlc'} */
  let filter = FILTERS.all;

  /** The row that owns the tab stop, so the list is one stop and not two hundred. */
  let selectedAppId = null;

  /** @type {Map<number, HTMLElement>} Rows of the last render, by app id. */
  const rows = new Map();

  /** @type {Map<number, import('./ranking.js').ResultEntry>} */
  const entriesById = new Map();

  /** App id being dragged, and where it would land. */
  let draggedId = null;
  /** @type {{ appId: number, side: 'before'|'after' }|null} */
  let dropTarget = null;

  /* ---------------------------------------------------------- rows */

  /**
   * The category picker shown in a row. Changing it is the only way to move an
   * item between categories, and the only way in or out of the removal list.
   *
   * @param {number} appId
   * @param {string|null} current
   * @param {string} title For the label a screen reader reads.
   * @returns {HTMLSelectElement}
   */
  function categorySelect(appId, current, title) {
    const select = element('select', {
      className: 'select select--category',
      attrs: { 'aria-label': `Категория: ${title}` },
    });
    select.append(element('option', { text: UNCATEGORIZED_LABEL, attrs: { value: '' } }));
    for (const category of CATEGORIES) {
      select.append(element('option', { text: category.label, attrs: { value: category.id } }));
    }
    select.value = current ?? '';
    select.addEventListener('change', () => {
      changeCategory(appId, select.value === '' ? null : select.value);
    });
    // A drag started on the picker would fight with choosing an option.
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    return select;
  }

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
      marks.append(element('span', { className: 'mark', text: '= как предыдущая' }));
    }
    if (entry.manual) {
      marks.append(element('span', { className: 'mark mark--manual', text: 'переставлено вручную' }));
    } else if (!entry.resolved) {
      marks.append(element('span', { className: 'mark mark--fallback', text: 'запасной порядок' }));
    }

    const meta = element('div', { className: 'result-row__meta' }, [
      element('span', { className: 'badge', text: kindLabel(entry.item.kind) }),
      element('span', { className: 'result-row__id', text: `App ID ${entry.appId}` }),
      element('a', {
        className: 'link',
        text: 'Открыть в Steam ↗',
        attrs: {
          href: entry.item.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': `Открыть «${entry.item.title}» в Steam, в новой вкладке`,
        },
      }),
      element('span', {
        className: 'result-row__where',
        text: `${categoryTitle(entry.category)} · ${entry.positionInCategory} в категории`,
      }),
    ]);

    if (entry.item.kind === 'dlc') {
      meta.querySelector('.badge').classList.add('badge--dlc');
    }

    const row = element(
      'li',
      {
        className:
          'result-row' +
          (entry.manual ? ' result-row--manual' : entry.resolved ? '' : ' result-row--fallback') +
          (entry.tiedWithPrevious ? ' result-row--tied' : ''),
        attrs: {
          draggable: 'true',
          tabindex: '-1',
          'aria-label':
            `${entry.position}. ${entry.item.title}. ${categoryTitle(entry.category)}. ` +
            `${kindLabel(entry.item.kind)}. ` +
            (entry.manual ? 'Переставлено вручную.' : entry.resolved ? '' : 'Запасной порядок.'),
        },
        dataset: { appId: String(entry.appId) },
      },
      [
        element('span', { className: 'result-row__grip', text: '⠿', attrs: { 'aria-hidden': 'true' } }),
        element('span', { className: 'result-row__position', text: String(entry.position) }),
        cover,
        element('div', { className: 'result-row__main' }, [
          element('div', { className: 'result-row__title', text: entry.item.title }),
          meta,
          marks,
        ]),
        categorySelect(entry.appId, entry.category, entry.item.title),
      ],
    );

    return row;
  }

  /**
   * The block of items marked for removal. They are listed separately and are
   * never numbered together with the ranking, but the picker is there as well:
   * changing your mind must not require going back a stage.
   *
   * @param {import('./model.js').WishlistItem[]} removed
   */
  function renderRemoved(removed) {
    nodes.removed.hidden = removed.length === 0;
    clear(nodes.removedList);

    for (const item of removed) {
      nodes.removedList.append(
        element('li', { className: 'result-removed__row' }, [
          element('div', { className: 'result-removed__main' }, [
            element('div', { text: item.title }),
            element('div', { className: 'result-row__meta' }, [
              element('span', { className: 'result-row__id', text: `App ID ${item.appId}` }),
              element('a', {
                className: 'link',
                text: 'Открыть в Steam ↗',
                attrs: { href: item.url, target: '_blank', rel: 'noopener noreferrer' },
              }),
            ]),
          ]),
          categorySelect(item.appId, 'remove', item.title),
        ]),
      );
    }
  }

  /* -------------------------------------------------------- editing */

  /**
   * Places an item next to another one. A drop on a row of a different
   * category moves the item into that category too — that is what dropping it
   * there means — and the user is told so.
   *
   * @param {number} appId
   * @param {number} anchorId
   * @param {'before'|'after'} side
   */
  function applyMove(appId, anchorId, side) {
    if (appId === anchorId) return;
    const category = app.session.getCategory(anchorId);
    if (!isSortableCategory(category)) return;

    const changed = app.session.getCategory(appId) !== category;
    try {
      if (changed) app.session.setCategory(appId, category);
      app.session.moveItem(appId, anchorId, side);
    } catch (error) {
      app.toast(`Не удалось переставить: ${error.message}`, 'error');
      render();
      return;
    }

    selectedAppId = appId;
    app.save();
    render();
    focusRow(appId);

    const entry = entriesById.get(appId);
    const where = entry ? `на место ${entry.position}` : 'на новое место';
    app.announce(
      `«${app.session.getItem(appId).title}» ${where}` +
        (changed ? `, категория: ${categoryTitle(category)}` : '') + '.',
    );
    if (changed) {
      app.toast(`«${app.session.getItem(appId).title}» переехала в «${categoryTitle(category)}».`);
    }
  }

  /**
   * The keyboard alternative to dragging: the selected line steps over its
   * visible neighbour. It stops at the edge of its category, because a jump
   * into another category is a change of category, and that is a decision the
   * picker in the row makes explicitly.
   *
   * @param {number} appId
   * @param {-1|1} direction
   */
  function moveByKeyboard(appId, direction) {
    const visible = visibleAppIds();
    const index = visible.indexOf(appId);
    if (index === -1) return;

    const neighbour = visible[index + direction];
    const entry = entriesById.get(appId);
    if (neighbour === undefined || entriesById.get(neighbour)?.category !== entry?.category) {
      app.toast(
        `Это ${direction === -1 ? 'первая' : 'последняя'} строка категории ` +
          `«${categoryTitle(entry?.category ?? null)}». Категорию меняет список в самой строке.`,
      );
      return;
    }

    applyMove(appId, neighbour, direction === -1 ? 'before' : 'after');
  }

  /**
   * @param {number} appId
   * @param {string|null} categoryId
   */
  function changeCategory(appId, categoryId) {
    const item = app.session.getItem(appId);
    try {
      app.session.setCategory(appId, categoryId);
    } catch (error) {
      app.toast(`Не удалось сменить категорию: ${error.message}`, 'error');
      render();
      return;
    }
    selectedAppId = isSortableCategory(categoryId) ? appId : null;
    app.save();
    render();
    if (selectedAppId !== null) focusRow(appId);
    app.toast(`«${item.title}» — ${categoryTitle(categoryId)}.`);
  }

  /* ------------------------------------------------- drag and drop */

  function clearDropMarks() {
    for (const row of rows.values()) {
      row.classList.remove('result-row--drop-before', 'result-row--drop-after');
    }
  }

  function finishDrag() {
    clearDropMarks();
    if (draggedId !== null) rows.get(draggedId)?.classList.remove('is-dragging');
    draggedId = null;
    dropTarget = null;
  }

  /**
   * @param {DragEvent} event
   * @returns {HTMLElement|null}
   */
  function rowOf(event) {
    return event.target instanceof Element ? event.target.closest('.result-row') : null;
  }

  nodes.list.addEventListener('dragstart', (event) => {
    const row = rowOf(event);
    if (!row) return;
    draggedId = Number(row.dataset.appId);
    selectedAppId = draggedId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    // Some browsers refuse to start a drag without any payload.
    event.dataTransfer.setData('text/plain', String(draggedId));
  });

  nodes.list.addEventListener('dragover', (event) => {
    if (draggedId === null) return;
    const row = rowOf(event);
    if (!row) return;
    const appId = Number(row.dataset.appId);
    if (appId === draggedId) {
      clearDropMarks();
      dropTarget = null;
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const box = row.getBoundingClientRect();
    const side = event.clientY < box.top + box.height / 2 ? 'before' : 'after';
    clearDropMarks();
    row.classList.add(side === 'before' ? 'result-row--drop-before' : 'result-row--drop-after');
    dropTarget = { appId, side };
  });

  nodes.list.addEventListener('drop', (event) => {
    if (draggedId === null || dropTarget === null) return;
    event.preventDefault();
    const moved = draggedId;
    const target = dropTarget;
    finishDrag();
    applyMove(moved, target.appId, target.side);
  });

  nodes.list.addEventListener('dragend', finishDrag);

  /* -------------------------------------------------- focus and keys */

  /** @returns {number[]} App ids of the rows currently on the screen. */
  function visibleAppIds() {
    return [...rows.entries()]
      .filter(([, row]) => !row.hidden)
      .map(([appId]) => appId);
  }

  /**
   * @param {number} appId
   */
  function focusRow(appId) {
    const row = rows.get(appId);
    if (!row || row.hidden) return;
    setTabStop(appId);
    row.focus({ preventScroll: true });
  }

  /**
   * Moves the single tab stop of the list to a row. Two hundred rows must not
   * become two hundred stops on the way to the next control.
   *
   * @param {number|null} appId
   */
  function setTabStop(appId) {
    selectedAppId = appId;
    const visible = visibleAppIds();
    const target = appId !== null && rows.get(appId)?.hidden === false ? appId : visible[0];
    for (const [id, row] of rows) {
      row.tabIndex = id === target ? 0 : -1;
    }
  }

  nodes.list.addEventListener('focusin', (event) => {
    const row = event.target instanceof Element ? event.target.closest('.result-row') : null;
    if (row) selectedAppId = Number(row.dataset.appId);
  });

  nodes.list.addEventListener('keydown', (event) => {
    const row = event.target instanceof Element ? event.target.closest('.result-row') : null;
    if (!row || event.target !== row) return;

    const appId = Number(row.dataset.appId);
    const isUp = event.key === 'ArrowUp';
    const isDown = event.key === 'ArrowDown';
    if (!isUp && !isDown) return;
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      moveByKeyboard(appId, isUp ? -1 : 1);
      return;
    }

    // Without a modifier the arrows walk the list instead of rearranging it.
    const visible = visibleAppIds();
    const next = visible[visible.indexOf(appId) + (isUp ? -1 : 1)];
    if (next !== undefined) focusRow(next);
  });

  /* ------------------------------------------------------ filtering */

  /**
   * Hides the rows that do not match the search and the kind filter. The
   * numbers stay as they are: they are places in the whole list, and a filter
   * is a way of looking at it, not a different ranking.
   */
  function applyFilter() {
    const query = nodes.search.value.trim().toLowerCase();
    let shown = 0;

    for (const [appId, row] of rows) {
      const entry = entriesById.get(appId);
      const byKind = filter === FILTERS.all || entry.item.kind === filter;
      const byQuery =
        query === '' ||
        entry.item.title.toLowerCase().includes(query) ||
        String(appId).includes(query);
      row.hidden = !(byKind && byQuery);
      if (!row.hidden) shown += 1;
    }

    const total = rows.size;
    nodes.shown.textContent =
      total === 0
        ? ''
        : shown === total
          ? `${total} ${plural(total, ['строка', 'строки', 'строк'])}`
          : `показано ${shown} из ${total}`;

    // An empty list has its own message, put there by `render`; this one is
    // only about a filter that matched nothing.
    if (total > 0) {
      nodes.empty.hidden = shown > 0;
      if (shown === 0) nodes.empty.textContent = 'Под фильтр и поиск не попала ни одна позиция.';
    }
    setTabStop(selectedAppId);
  }

  for (const button of nodes.filters) {
    button.addEventListener('click', () => {
      filter = FILTERS[button.dataset.filter] ?? FILTERS.all;
      for (const other of nodes.filters) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      applyFilter();
    });
  }

  nodes.search.addEventListener('input', applyFilter);

  /* -------------------------------------------------------- exports */

  /**
   * @param {() => { name: string, text: string, type: string }} build
   * @param {string} done
   */
  function exportFile(build, done) {
    if (app.session.itemCount === 0) {
      app.toast('Экспортировать нечего: список пуст.');
      return;
    }
    let file;
    try {
      file = build();
    } catch (error) {
      app.toast(`Не удалось собрать файл: ${error.message}`, 'error');
      return;
    }
    downloadText(file.name, file.text, file.type);
    app.toast(done, 'ok');
  }

  nodes.exportJson.addEventListener('click', () => {
    exportFile(
      () => ({
        name: exportFileName('wishlist-order', 'json'),
        text: toOrderJson(app.session.getResult()),
        type: 'application/json',
      }),
      'Итоговый порядок сохранён в JSON.',
    );
  });

  nodes.exportCsv.addEventListener('click', () => {
    exportFile(
      () => ({
        name: exportFileName('wishlist-order', 'csv'),
        text: toCsv(app.session.getResult()),
        type: 'text/csv;charset=utf-8',
      }),
      'Итоговый список сохранён в CSV.',
    );
  });

  nodes.copyText.addEventListener('click', async () => {
    if (app.session.itemCount === 0) {
      app.toast('Копировать нечего: список пуст.');
      return;
    }
    const text = toPlainText(app.session.getResult());
    if (await copyText(text)) {
      app.toast('Нумерованный список скопирован в буфер обмена.', 'ok');
      return;
    }
    // The browser may simply refuse the clipboard; the list is not lost then.
    downloadText(exportFileName('wishlist-list', 'txt'), text, 'text/plain;charset=utf-8');
    app.toast('Браузер не дал доступ к буферу обмена — список сохранён файлом.', 'error');
  });

  nodes.saveButton.addEventListener('click', () => {
    document.getElementById('action-save-state').click();
  });

  /* ---------------------------------------------- dangerous actions */

  nodes.resetManual.addEventListener('click', async () => {
    const count = app.session.manualMoveCount;
    if (count === 0) {
      app.toast('Ручных перестановок нет.');
      return;
    }
    const confirmed = await app.confirm({
      title: 'Сбросить ручные правки?',
      text:
        `${count} ${plural(count, ['перестановка', 'перестановки', 'перестановок'])} будет забыто, ` +
        'и список вернётся к тому порядку, который дают сравнения. Ответы на сравнения останутся.',
      confirmLabel: 'Сбросить перестановки',
      danger: true,
    });
    if (!confirmed) return;

    app.session.clearManualMoves();
    app.save();
    render();
    app.toast('Ручные перестановки сброшены.', 'ok');
  });

  nodes.resetAnswers.addEventListener('click', async () => {
    const { comparisons } = app.session.getProgress();
    if (comparisons === 0) {
      app.toast('Ответов пока нет.');
      return;
    }
    const confirmed = await app.confirm({
      title: 'Сбросить ответы сравнений?',
      text:
        `${comparisons} ${plural(comparisons, ['ответ', 'ответа', 'ответов'])} будет удалено, и сравнения ` +
        'начнутся с нуля. Список позиций, категории и ручные перестановки останутся. Отменить это будет нельзя.',
      confirmLabel: 'Сбросить ответы',
      danger: true,
    });
    if (!confirmed) return;

    app.session.clearAnswers();
    app.save();
    render();
    app.toast('Ответы сравнений сброшены.', 'ok');
  });

  nodes.continueButton.addEventListener('click', () => {
    app.show(app.session.itemCount === 0 ? 'import' : 'compare');
  });

  /* --------------------------------------------------------- render */

  /**
   * @param {object} summary
   */
  function renderSummary(summary) {
    if (summary.total === 0) {
      nodes.summary.textContent =
        summary.removed === 0
          ? 'Список пуст: пока нечего показывать.'
          : `Все ${summary.removed} ${plural(summary.removed, ['позиция помечена', 'позиции помечены', 'позиций помечено'])} ` +
            'на удаление из желаемого, упорядочивать нечего.';
      return;
    }

    const parts = [
      `Всего ${summary.total} ${plural(summary.total, ['позиция', 'позиции', 'позиций'])}.`,
      `Порядок подтверждён сравнениями у ${summary.resolved}, ` +
        `остальные ${summary.fallback} стоят в запасном порядке — по позиции в вашем wishlist.`,
    ];
    if (summary.manual > 0) {
      parts.push(
        `Вручную переставлено ${summary.manual} ` +
          `${plural(summary.manual, ['позиция', 'позиции', 'позиций'])}.`,
      );
    }
    if (summary.removed > 0) {
      parts.push(
        `Ещё ${summary.removed} ${plural(summary.removed, ['позиция помечена', 'позиции помечены', 'позиций помечено'])} ` +
          'на удаление из желаемого — они идут отдельным списком.',
      );
    }
    parts.push(`Сравнений сделано: ${summary.comparisons}.`);
    parts.push(summary.complete ? 'Сортировка завершена.' : 'Сортировка не завершена, её можно продолжить.');

    nodes.summary.textContent = parts.join(' ');
  }

  function render() {
    const { entries, removed, summary } = app.session.getResult();
    const loadCovers = app.loadCovers;

    renderSummary(summary);

    clear(nodes.list);
    rows.clear();
    entriesById.clear();
    for (const entry of entries) {
      const row = renderRow(entry, loadCovers);
      rows.set(entry.appId, row);
      entriesById.set(entry.appId, entry);
      nodes.list.append(row);
    }

    renderRemoved(removed);

    nodes.legend.hidden = entries.length === 0;
    nodes.hint.hidden = entries.length < 2;
    nodes.empty.hidden = entries.length > 0;
    if (entries.length === 0) {
      nodes.empty.textContent =
        app.session.itemCount === 0
          ? 'Импортируйте список желаемого, и здесь появится результат.'
          : 'Все позиции помечены на удаление — упорядочивать нечего.';
    }

    applyFilter();

    nodes.continueButton.disabled = summary.complete && app.session.itemCount > 0;
    nodes.continueButton.textContent =
      app.session.itemCount === 0
        ? 'Перейти к импорту'
        : summary.complete
          ? 'Сортировка завершена'
          : 'Продолжить сортировку';
  }

  /** Called when the screen is opened: the search of the last visit is dropped. */
  function activate() {
    nodes.search.value = '';
  }

  return { render, activate };
}
