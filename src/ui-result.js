/**
 * Result screen.
 *
 * The list is available at any moment, finished or not: `getResult()` orders
 * everything the comparisons imply and falls back to the wishlist order for
 * the rest. The screen says out loud which part is which, so a half finished
 * sorting is still usable and is never passed off as a final ranking.
 *
 * Four blocks, in the order the work ends in. What came of it, as one number
 * and one sentence, with the technique behind that number folded away under
 * «How was this order built?». Then the transfer into Steam, which is the
 * point of the whole application and therefore stands above the list rather
 * than under it. Then the list, where three things can still be edited
 * without going back to the comparisons: the place of an item (drag or `Ctrl`
 * with an arrow), its category (the picker in the row) and whether it belongs
 * in the list at all. Then the files, folded away as well.
 *
 * Above the list stands the same order laid out the other way: «Show tier
 * list» opens a panel of covers, one row per category, where a card is dragged
 * or walked with the keyboard between the places of a row and between the rows
 * themselves. It is a second way into the same three edits and not a fifth
 * block of work: it keeps nothing of its own, every move it makes goes into
 * this session, and this screen is redrawn around it.
 *
 * A hand made placement is kept by `ranking.js` as "this item goes next to
 * that one" and replayed over whatever the comparisons produce, so returning
 * to the sorting improves the list around the placements instead of erasing
 * them.
 *
 * The four exports are built by `export.js`; this module only hands the text
 * to the browser.
 *
 * The way out is the bookmarklet: `bookmarklet.js` builds a link with the
 * order inside its own address, and this module puts it on the screen and
 * rebuilds it on every render, because a link dragged to the bookmarks bar
 * carries the order of the moment it was dragged and nothing later.
 */

import { plural, t } from './i18n.js';
import { CATEGORIES, categoryLabel, isSortableCategory, uncategorizedLabel } from './model.js';
import { exportFileName, toCsv, toOrderJson, toPlainText } from './export.js';
import { bookmarkletAppIds, bookmarkletUrl } from './bookmarklet.js';
import {
  confirmedPercent,
  isApplePlatform,
  linkFreshness,
  orderSignature,
  rowStatus,
} from './result-view.js';
import { clear, copyText, downloadText, element, kindLabel, renderCover } from './ui-common.js';
import { createTierListPanel } from './ui-tier-list.js';

/** What the kind filter can be set to. */
const FILTERS = { all: 'all', game: 'game', dlc: 'dlc' };

/** The caption of a row state, in the order `rowStatus()` decides them. */
const STATUS_KEYS = {
  manual: 'result.mark.manual',
  confirmed: 'result.mark.confirmed',
  fallback: 'result.mark.fallback',
};

/**
 * @param {object} app
 * @returns {{ render: Function, activate: Function }}
 */
export function createResultScreen(app) {
  const nodes = {
    heading: document.getElementById('result-heading'),
    lead: document.getElementById('result-lead'),
    ring: document.getElementById('result-ring'),
    percent: document.getElementById('result-percent'),
    summaryTitle: document.getElementById('result-summary-title'),
    summaryText: document.getElementById('result-summary-text'),
    summaryEyebrow: document.getElementById('result-summary-eyebrow'),
    stats: document.getElementById('result-stats'),
    built: document.getElementById('result-built'),
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
    shortcut: document.getElementById('result-shortcut'),
    shortcutSafari: document.getElementById('result-shortcut-safari'),
    transferMobile: document.getElementById('result-transfer-mobile'),
    transferStale: document.getElementById('result-transfer-stale'),
    bookmarkletLink: document.getElementById('result-bookmarklet-link'),
    bookmarkletCopy: document.getElementById('result-bookmarklet-copy'),
    bookmarkletCarries: document.getElementById('result-bookmarklet-carries'),
    bookmarkletState: document.getElementById('result-bookmarklet-state'),
    bookmarkletEmpty: document.getElementById('result-bookmarklet-empty'),
    tierOpen: document.getElementById('result-tier-open'),
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

  /**
   * The order the user last took away from here, as `orderSignature()` writes
   * it, or `null` while they have not taken the link at all.
   *
   * It is deliberately not stored: a bookmark lives in the browser and this
   * page cannot see it, so a flag surviving a reload would be a claim the
   * application has no way of checking. Within one visit the two moments that
   * *are* observable — the copy button and the start of a drag — are enough to
   * say honestly that the order has moved since.
   */
  let takenSignature = null;

  /** The address of the link as it stands now, for the copy button. */
  let currentUrl = null;

  /**
   * The result of the last render.
   *
   * The tier list is drawn from this and not from the list on the screen:
   * the search and the kind filter hide rows instead of rebuilding them, and
   * a view read off the DOM would have inherited both. Kept from the render
   * rather than asked for again on the click, because `render()` runs after
   * every change and building the ranking twice buys nothing.
   *
   * @type {ReturnType<import('./ranking.js').RankingSession['getResult']>|null}
   */
  let lastResult = null;

  /**
   * The panel behind «Show tier list»; it holds no state between openings.
   *
   * It edits the same session this screen draws, so every move it makes is
   * redrawn here at once — including the bookmarklet link, which carries the
   * order inside its own address and would otherwise be the order as it stood
   * before the panel was opened. The fresh result is handed back so the panel
   * does not walk the whole ranking a second time to get it.
   */
  const tierList = createTierListPanel(app, {
    onChange(appId) {
      // The tab stop of the list follows the card that moved — `render()`
      // hands it to `selectedAppId` at the end — but the focus itself is not
      // touched: it belongs to the panel standing over this screen, and the
      // list behind a modal dialog is inert.
      selectedAppId = appId;
      render();
      return lastResult;
    },
  });

  nodes.tierOpen.addEventListener('click', () => {
    if (lastResult) tierList.open(lastResult);
  });

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
   * The title is the loud part; the app id, the link to the store and the
   * place inside the category are what somebody looks for once and then stops
   * seeing. The state of the line — put here by hand, settled by comparisons,
   * or still standing where the wishlist put it — is a chip on the right, and
   * a tie with the row above is a second chip next to it, because being tied
   * is something a line has as well as its state, not instead of it.
   *
   * @param {import('./ranking.js').ResultEntry} entry
   * @param {boolean} loadCovers
   * @returns {HTMLElement}
   */
  function renderRow(entry, loadCovers) {
    const cover = element('div', { className: 'cover' });
    renderCover(cover, entry.item, loadCovers);

    const status = rowStatus(entry);
    const statusText = t(STATUS_KEYS[status]);

    const marks = element('div', { className: 'result-row__marks' }, [
      element('span', { className: `mark mark--${status}`, text: statusText }),
    ]);
    if (entry.tiedWithPrevious) {
      marks.append(element('span', { className: 'mark mark--tied', text: t('result.mark.tied') }));
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
          `result-row result-row--${status}` + (entry.tiedWithPrevious ? ' result-row--tied' : ''),
        attrs: {
          draggable: 'true',
          tabindex: '-1',
          'aria-label': t('result.row.aria', {
            position: entry.position,
            title: entry.item.title,
            category: categoryLabel(entry.category),
            kind: kindLabel(entry.item.kind),
            note: entry.tiedWithPrevious ? `${statusText}. ${t('result.mark.tied')}` : statusText,
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
        ]),
        marks,
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
   * The controls inside a row — the link to the store, the category picker —
   * are focusable in their own right, and two hundred of each would be the
   * same problem twice over. They follow the row that holds the stop: the
   * keyboard reaches the list, walks it with the arrows, and tabs through the
   * controls of the line it is standing on and then out of the list.
   *
   * @param {number|null} appId
   */
  function setTabStop(appId) {
    selectedAppId = appId;
    const visible = visibleAppIds();
    const target = appId !== null && rows.get(appId)?.hidden === false ? appId : visible[0];
    for (const [id, row] of rows) {
      const stop = id === target;
      row.tabIndex = stop ? 0 : -1;
      for (const control of row.querySelectorAll('a, select, button')) {
        control.tabIndex = stop ? 0 : -1;
      }
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
   *
   * The rows are hidden and not rebuilt: two hundred rows rebuilt on every
   * keystroke of the search are felt.
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

  // The same download the settings menu offers, asked for by name. Clicking
  // the other button instead would have broken the day it moved.
  nodes.saveButton.addEventListener('click', () => app.downloadState());

  /* ------------------------------------------------ transfer to Steam */

  // Only the platform is decided, and only once: the shortcut that shows the
  // bookmarks bar is the same in Chrome, Edge and Firefox, and guessing the
  // browser from a user agent string is how a page ends up naming a shortcut
  // that browser does not have. Safari gets its own line, as a menu path.
  const apple = isApplePlatform(navigator);

  // Dragging a link onto a bookmarks bar is a desktop gesture, and a phone has
  // neither the bar nor a comfortable way of doing it. Said honestly, instead
  // of pretending the three steps work there.
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches === true;

  /**
   * The two lines of the first step and the note about a phone. What the
   * platform is does not change while the page is open, but the language does,
   * so the words are put in by `render()` like every other line built in code.
   */
  function renderPlatformLines() {
    nodes.shortcut.innerHTML = t(apple ? 'result.transfer.shortcutMac' : 'result.transfer.shortcut');
    nodes.shortcutSafari.textContent = t('result.transfer.shortcutSafari');
    nodes.shortcutSafari.hidden = !apple;
    nodes.transferMobile.hidden = !coarsePointer;
  }

  /**
   * Remembers the order the user is walking away with.
   *
   * Called from the two moments the browser really reports — the copy button
   * and the start of a drag. Everything after them can be compared honestly;
   * before them there is nothing to compare, and the page says the milder,
   * true thing instead: the link on the screen is always the current one.
   *
   * @param {string} signature
   */
  function rememberTaken(signature) {
    takenSignature = signature;
    renderLinkState(signature);
  }

  /**
   * The line under the link: whether it is still the order shown below.
   *
   * @param {string} signature
   */
  function renderLinkState(signature) {
    const freshness = linkFreshness(signature, takenSignature);
    nodes.transferStale.hidden = freshness !== 'stale';
    nodes.bookmarkletState.textContent = t(
      freshness === 'fresh' ? 'result.transfer.taken' : 'result.transfer.fresh',
    );
    nodes.bookmarkletState.hidden = freshness === 'stale';
  }

  /**
   * Rebuilds the link that carries the order into Steam.
   *
   * It is rebuilt on every render and not once at start-up, because the order
   * lives inside the address: a link generated before the last move would
   * quietly write the list as it stood then. The user is told the same thing
   * in words next to the link, since a bookmark already on the bar is a copy
   * this page can no longer reach.
   *
   * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
   *        The one `render` already asked for: building the link must not cost
   *        a second pass over the whole ranking.
   */
  function renderBookmarklet(result) {
    const count = bookmarkletAppIds(result).length;

    let url;
    if (count > 0) {
      try {
        url = bookmarkletUrl(result);
      } catch (error) {
        url = undefined;
        nodes.bookmarkletEmpty.textContent = t('result.transfer.failed', { message: error.message });
      }
    }

    currentUrl = url ?? null;
    nodes.bookmarkletLink.hidden = url === undefined;
    nodes.bookmarkletCopy.hidden = url === undefined;
    nodes.bookmarkletCarries.hidden = url === undefined;
    nodes.bookmarkletEmpty.hidden = url !== undefined;

    if (url === undefined) {
      // An `href` of a link that is not offered must not keep the old order.
      nodes.bookmarkletLink.removeAttribute('href');
      nodes.bookmarkletState.hidden = true;
      nodes.transferStale.hidden = true;
      if (count === 0) nodes.bookmarkletEmpty.textContent = t('result.transfer.empty');
      return;
    }

    nodes.bookmarkletLink.href = url;
    nodes.bookmarkletCarries.textContent = t('result.transfer.carries', {
      items: plural('count.items', count),
    });
    renderLinkState(orderSignature(result));
  }

  // A click here would run the bookmarklet on our own page, where there is no
  // wishlist to write — so it is caught, and the hint says what to do instead.
  nodes.bookmarkletLink.addEventListener('click', (event) => {
    event.preventDefault();
    app.toast(t('result.transfer.clickToast'));
  });

  // A drag is the moment the link leaves this page, so it is the moment the
  // page starts being able to say the order has moved since.
  nodes.bookmarkletLink.addEventListener('dragstart', () => {
    rememberTaken(orderSignature(app.session.getResult()));
  });

  // The keyboard way to the same thing: dragging with a mouse must not be the
  // only way to get the link out of here.
  nodes.bookmarkletCopy.addEventListener('click', async () => {
    if (currentUrl === null) {
      app.toast(t('result.transfer.empty'));
      return;
    }
    if (await copyText(currentUrl)) {
      rememberTaken(orderSignature(app.session.getResult()));
      app.toast(t('result.transfer.copied'), 'ok');
      return;
    }
    app.toast(t('result.transfer.copyFailed'), 'error');
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
   * The head and the summary: one number, one sentence, and everything
   * technical folded away under it.
   *
   * @param {object} summary As `getResult()` returns it.
   */
  function renderSummary(summary) {
    const empty = summary.total === 0;
    const percent = confirmedPercent(summary);

    nodes.heading.textContent = t(
      empty ? 'result.head.empty' : summary.complete ? 'result.head.ready' : 'result.head.usable',
    );
    nodes.lead.textContent = t(
      empty ? 'result.lead.empty' : summary.complete ? 'result.lead.ready' : 'result.lead.usable',
    );

    // The ring is drawn with `pathLength="100"`, so the dash pattern is the
    // percentage itself and no radius arithmetic is needed here.
    nodes.ring.style.strokeDasharray = `${percent} 100`;
    nodes.percent.textContent = `${percent}%`;
    nodes.summaryEyebrow.hidden = empty;

    if (empty) {
      nodes.summaryTitle.textContent =
        summary.removed === 0
          ? t('result.summary.empty')
          : t('result.summary.allRemoved', { marked: plural('count.marked', summary.removed) });
      nodes.summaryText.textContent = '';
    } else {
      nodes.summaryTitle.textContent =
        summary.resolved === 0
          ? t('result.summary.headlineNone')
          : summary.resolved === summary.total
            ? t('result.summary.headlineAll')
            : t('result.summary.headline', { items: plural('count.items', summary.resolved) });

      nodes.summaryText.textContent = summary.complete
        ? t('result.summary.done')
        : `${t('result.summary.rest')} ${t('result.summary.choice')}`;
    }

    clear(nodes.stats);
    if (!empty) {
      appendStat(summary.total, t('result.stats.total'));
      appendStat(summary.resolved, t('result.stats.confirmed'));
      if (summary.removed > 0) appendStat(summary.removed, t('result.stats.removed'));
    }

    clear(nodes.built);
    for (const fact of builtFacts(summary)) {
      nodes.built.append(element('li', { text: fact }));
    }
    nodes.legend.hidden = empty;
  }

  /**
   * @param {number} value
   * @param {string} label
   */
  function appendStat(value, label) {
    nodes.stats.append(
      element('div', { className: 'summary__stat' }, [
        element('dt', { className: 'summary__statlabel', text: label }),
        element('dd', { className: 'summary__statvalue', text: String(value) }),
      ]),
    );
  }

  /**
   * The technical account of the order, for whoever opens the disclosure: what
   * decides the sequence, how much of it the answers carry, what was moved by
   * hand and how many answers there are. None of it is on the way of somebody
   * who only wants the list.
   *
   * @param {object} summary
   * @returns {string[]}
   */
  function builtFacts(summary) {
    if (summary.total === 0) return [t('result.built.categories')];

    const facts = [
      t('result.built.categories'),
      t('result.built.resolved', {
        resolved: summary.resolved,
        total: summary.total,
        fallback: summary.fallback,
      }),
      summary.manual > 0
        ? t('result.built.manual', { items: plural('count.items', summary.manual) })
        : t('result.built.noManual'),
      t('result.built.answers', { count: summary.comparisons }),
      t(summary.complete ? 'result.built.complete' : 'result.built.incomplete'),
    ];
    return facts;
  }

  function render() {
    const result = app.session.getResult();
    lastResult = result;
    const { entries, removed, summary } = result;
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
    renderPlatformLines();
    renderBookmarklet(result);

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
