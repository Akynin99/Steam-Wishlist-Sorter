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

import { plural, t } from './i18n.js';
import { CATEGORIES, categoryLabel, isSortableCategory, uncategorizedLabel } from './model.js';
import { exportFileName, toCsv, toOrderJson, toPlainText } from './export.js';
import { clear, copyText, downloadText, element, kindLabel, renderCover } from './ui-common.js';

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
      attrs: { 'aria-label': t('result.row.categoryAria', { title }) },
    });
    select.append(element('option', { text: uncategorizedLabel(), attrs: { value: '' } }));
    for (const category of CATEGORIES) {
      select.append(element('option', { text: categoryLabel(category.id), attrs: { value: category.id } }));
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
      marks.append(element('span', { className: 'mark', text: t('result.mark.tied') }));
    }
    if (entry.manual) {
      marks.append(element('span', { className: 'mark mark--manual', text: t('result.mark.manual') }));
    } else if (!entry.resolved) {
      marks.append(element('span', { className: 'mark mark--fallback', text: t('result.mark.fallback') }));
    }

    const meta = element('div', { className: 'result-row__meta' }, [
      element('span', { className: 'badge', text: kindLabel(entry.item.kind) }),
      element('span', { className: 'result-row__id', text: t('result.row.appId', { appId: entry.appId }) }),
      element('a', {
        className: 'link',
        text: t('common.openInSteam'),
        attrs: {
          href: entry.item.url,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': t('common.openInSteamAria', { title: entry.item.title }),
        },
      }),
      element('span', {
        className: 'result-row__where',
        text: t('result.row.where', {
          category: categoryLabel(entry.category),
          position: entry.positionInCategory,
        }),
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
          'aria-label': t('result.row.aria', {
            position: entry.position,
            title: entry.item.title,
            category: categoryLabel(entry.category),
            kind: kindLabel(entry.item.kind),
            note: entry.manual
              ? t('result.row.ariaManual')
              : entry.resolved
                ? ''
                : t('result.row.ariaFallback'),
          }),
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
              element('span', { className: 'result-row__id', text: t('result.row.appId', { appId: item.appId }) }),
              element('a', {
                className: 'link',
                text: t('common.openInSteam'),
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
      app.toast(t('result.move.failed', { message: error.message }), 'error');
      render();
      return;
    }

    selectedAppId = appId;
    app.save();
    render();
    focusRow(appId);

    const entry = entriesById.get(appId);
    const title = app.session.getItem(appId).title;
    app.announce(
      t('result.move.announce', {
        title,
        where: entry ? t('result.move.place', { position: entry.position }) : t('result.move.newPlace'),
        category: changed ? t('result.move.categorySuffix', { category: categoryLabel(category) }) : '',
      }),
    );
    if (changed) {
      app.toast(t('result.move.categoryToast', { title, category: categoryLabel(category) }));
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
        t('result.move.edge', {
          edge: t(direction === -1 ? 'result.move.edgeFirst' : 'result.move.edgeLast'),
          category: categoryLabel(entry?.category ?? null),
        }),
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
      app.toast(t('result.category.failed', { message: error.message }), 'error');
      render();
      return;
    }
    selectedAppId = isSortableCategory(categoryId) ? appId : null;
    app.save();
    render();
    if (selectedAppId !== null) focusRow(appId);
    app.toast(t('result.category.toast', { title: item.title, category: categoryLabel(categoryId) }));
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
          ? t('result.shown.all', { rows: plural('count.rows', total) })
          : t('result.shown.filtered', { shown, total });

    // An empty list has its own message, put there by `render`; this one is
    // only about a filter that matched nothing.
    if (total > 0) {
      nodes.empty.hidden = shown > 0;
      if (shown === 0) nodes.empty.textContent = t('result.empty.filter');
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
      app.toast(t('result.export.empty'));
      return;
    }
    let file;
    try {
      file = build();
    } catch (error) {
      app.toast(t('result.export.failed', { message: error.message }), 'error');
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
      t('result.export.jsonDone'),
    );
  });

  nodes.exportCsv.addEventListener('click', () => {
    exportFile(
      () => ({
        name: exportFileName('wishlist-order', 'csv'),
        text: toCsv(app.session.getResult()),
        type: 'text/csv;charset=utf-8',
      }),
      t('result.export.csvDone'),
    );
  });

  nodes.copyText.addEventListener('click', async () => {
    if (app.session.itemCount === 0) {
      app.toast(t('result.copy.empty'));
      return;
    }
    const text = toPlainText(app.session.getResult());
    if (await copyText(text)) {
      app.toast(t('result.copy.done'), 'ok');
      return;
    }
    // The browser may simply refuse the clipboard; the list is not lost then.
    downloadText(exportFileName('wishlist-list', 'txt'), text, 'text/plain;charset=utf-8');
    app.toast(t('result.copy.failed'), 'error');
  });

  nodes.saveButton.addEventListener('click', () => {
    document.getElementById('action-save-state').click();
  });

  /* ---------------------------------------------- dangerous actions */

  nodes.resetManual.addEventListener('click', async () => {
    const count = app.session.manualMoveCount;
    if (count === 0) {
      app.toast(t('result.resetManual.none'));
      return;
    }
    const confirmed = await app.confirm({
      title: t('result.resetManual.title'),
      text: t('result.resetManual.text', { moves: plural('count.moves', count) }),
      confirmLabel: t('result.resetManual.confirm'),
      danger: true,
    });
    if (!confirmed) return;

    app.session.clearManualMoves();
    app.save();
    render();
    app.toast(t('result.resetManual.done'), 'ok');
  });

  nodes.resetAnswers.addEventListener('click', async () => {
    const { comparisons } = app.session.getProgress();
    if (comparisons === 0) {
      app.toast(t('result.resetAnswers.none'));
      return;
    }
    const confirmed = await app.confirm({
      title: t('result.resetAnswers.title'),
      text: t('result.resetAnswers.text', { answers: plural('count.answers', comparisons) }),
      confirmLabel: t('result.resetAnswers.confirm'),
      danger: true,
    });
    if (!confirmed) return;

    app.session.clearAnswers();
    app.save();
    render();
    app.toast(t('result.resetAnswers.done'), 'ok');
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
          ? t('result.summary.empty')
          : t('result.summary.allRemoved', { marked: plural('count.marked', summary.removed) });
      return;
    }

    const parts = [
      t('result.summary.total', { items: plural('count.items', summary.total) }),
      t('result.summary.resolved', { resolved: summary.resolved, fallback: summary.fallback }),
    ];
    if (summary.manual > 0) {
      parts.push(t('result.summary.manual', { items: plural('count.items', summary.manual) }));
    }
    if (summary.removed > 0) {
      parts.push(t('result.summary.removed', { marked: plural('count.marked', summary.removed) }));
    }
    parts.push(t('result.summary.comparisons', { count: summary.comparisons }));
    parts.push(t(summary.complete ? 'result.summary.complete' : 'result.summary.incomplete'));

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
      nodes.empty.textContent = t(
        app.session.itemCount === 0 ? 'result.empty.noItems' : 'result.empty.allRemoved',
      );
    }

    applyFilter();

    nodes.continueButton.disabled = summary.complete && app.session.itemCount > 0;
    nodes.continueButton.textContent = t(
      app.session.itemCount === 0
        ? 'result.toImport'
        : summary.complete
          ? 'result.complete'
          : 'result.continue',
    );
  }

  /** Called when the screen is opened: the search of the last visit is dropped. */
  function activate() {
    nodes.search.value = '';
  }

  return { render, activate };
}
