/**
 * The tier list panel of the result screen.
 *
 * The same order the list behind it shows, laid out as rows of covers — one
 * row per category, the games of a row standing left to right — and the second
 * place that order can be changed from. A card is dragged to another place in
 * its row, to another row, into «not categorized», or into the row of games
 * marked for removal; the keyboard does all four without a mouse.
 *
 * It keeps no state of its own. Every move goes into the session through
 * `applyTierMove()`, the screen behind is redrawn from the same session, and
 * the rows here are built again out of the fresh result — so the panel and the
 * list are one set of data and never two copies of it that have to be kept in
 * step.
 *
 * The rows come from `tier-list.js`, which is given the result the screen has
 * already asked for. They are never read off the list on the screen: the
 * search and the kind filter of that list hide rows rather than rebuild them,
 * and reading the DOM would have dragged a filter into a view that has nothing
 * to do with one.
 *
 * A `<dialog>`, so the focus trap and the inertness of the page behind it come
 * from the browser, and `isHotkeyBlocked()` keeps the hotkeys of the result
 * screen quiet while it stands open. What just happened is said in a line of
 * the panel's own head rather than in a toast: a toast lives on the page
 * behind, and the page behind a modal dialog is not on the screen.
 */

import { t } from './i18n.js';
import { categoryLabel } from './model.js';
import {
  TIER_NONE,
  TIER_REMOVE,
  applyTierMove,
  buildTierBoard,
  planTierMove,
  planTierStep,
} from './tier-list.js';
import { clear, element, renderCover } from './ui-common.js';

/** How long the status line stays empty before it is filled. See `say()`. */
const ANNOUNCE_DELAY_MS = 60;

/**
 * Builds the panel and wires it to the button that opens it.
 *
 * @param {object} app The application object of `ui-app.js`; `app.loadCovers`,
 *   `app.session` and `app.save` are read.
 * @param {{ onChange: (appId: number) => ReturnType<
 *   import('./ranking.js').RankingSession['getResult']> }} hooks
 *   `onChange` is called after every move: it redraws the screen behind — the
 *   list, and with it the bookmarklet link, which carries the order inside its
 *   own address and would otherwise write the order as it stood before the
 *   panel was opened — and hands back the result the panel is rebuilt from.
 * @returns {{ open: (result: ReturnType<
 *   import('./ranking.js').RankingSession['getResult']>) => void }}
 */
export function createTierListPanel(app, hooks) {
  const dialog = document.getElementById('tier-dialog');
  const title = document.getElementById('tier-title');
  const rowsBox = document.getElementById('tier-rows');
  const status = document.getElementById('tier-status');
  const closeButton = document.getElementById('tier-close');
  const openButton = document.getElementById('result-tier-open');

  /**
   * The cards of the last build, in the order they are drawn.
   *
   * The arrows walk this array, so it has to be the order on the screen and
   * not the order of the rows in the data — they are the same thing here, and
   * keeping one array of both is what makes sure they stay so.
   *
   * @type {HTMLElement[]}
   */
  let cards = [];

  /** The rows of the last build, as `buildTierBoard()` gave them. */
  let board = [];

  /** Index of the card that owns the single tab stop of the panel. */
  let stop = 0;

  /** Where the page stood when the panel opened. */
  let scrollY = 0;

  /** App id being dragged, and where it would land. */
  let draggedId = null;
  /** @type {import('./tier-list.js').TierDrop|null} */
  let dropTarget = null;

  let statusTimer = 0;

  /* ----------------------------------------------------------- drawing */

  /**
   * One card: a cover, a quiet number, and the title under both.
   *
   * The title is in the markup and not only in a tooltip, so a screen reader
   * has it; it is drawn over the bottom of the cover and slid out of sight
   * until the card is hovered or focused, so a wall of covers stays a wall of
   * covers. Hidden by the edge of the card rather than by `opacity`: a title
   * faded down to nothing is still text on the screen, and this one is either
   * fully readable or not there at all.
   *
   * Nothing on it is pressable. The card *is* the control: it is dragged, or
   * it is moved with the keyboard, and a button on top of it would be a third
   * way of saying what those two already say.
   *
   * @param {import('./tier-list.js').TierCard} card
   * @param {boolean} loadCovers
   * @returns {HTMLElement}
   */
  function renderCard(card, loadCovers) {
    const cover = element('div', { className: 'cover tier-card__cover' });
    renderCover(cover, card.item, loadCovers);

    const node = element(
      'li',
      {
        className: 'tier-card',
        attrs: {
          draggable: 'true',
          tabindex: '-1',
          'aria-label':
            card.position === null
              ? card.item.title
              : t('tier.card.aria', { position: card.position, title: card.item.title }),
        },
        dataset: { appId: String(card.appId) },
      },
      [cover, element('span', { className: 'tier-card__name', text: card.item.title })],
    );

    // The place in the final list, where there is one. The row of items marked
    // for removal is outside the numbering, so its cards have no number to
    // show and are not given one.
    if (card.position !== null) {
      node.prepend(
        element('span', {
          className: 'tier-card__position',
          text: String(card.position),
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    return node;
  }

  /**
   * One row: its caption and its cards.
   *
   * The colour is the one the category already has everywhere else in the
   * application, handed to the stylesheet as `--cat-color` exactly the way the
   * buttons of the categorisation stage hand it over. The row of items without
   * a category leaves the property unset and takes the neutral fallback: it is
   * not a level of the scale and must not borrow the colour of one.
   *
   * @param {import('./tier-list.js').TierRow} row
   * @param {boolean} loadCovers
   * @returns {HTMLElement}
   */
  function renderRow(row, loadCovers) {
    const headingId = `tier-row-${row.id}`;
    const caption = element('div', { className: 'tier-row__caption' }, [
      element('h3', {
        className: 'tier-row__name',
        text: row.category === null ? t('tier.none') : categoryLabel(row.category),
        attrs: { id: headingId },
      }),
    ]);

    // Said in words, because the row is a row of games the user still has to
    // remove themselves: this application never deletes anything from Steam.
    if (row.id === TIER_REMOVE) {
      caption.append(element('p', { className: 'tier-row__note', text: t('tier.remove.note') }));
    }

    const list = element('ul', { className: 'tier-row__cards' });
    for (const card of row.items) list.append(renderCard(card, loadCovers));

    // An empty row says so, and stays a row: it is where a card is dropped to
    // take its category off or to mark it for removal.
    const body = row.items.length > 0
      ? list
      : element('p', { className: 'tier-row__empty', text: t('tier.empty') });

    const node = element(
      'section',
      {
        className: `tier-row tier-row--${row.id}` + (row.onScale ? '' : ' tier-row--apart'),
        attrs: { 'aria-labelledby': headingId },
        dataset: { row: row.id },
      },
      [caption, body],
    );
    if (row.onScale || row.id === TIER_REMOVE) {
      node.style.setProperty('--cat-color', `var(--cat-${row.id})`);
    }
    return node;
  }

  /**
   * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
   */
  function render(result) {
    const loadCovers = app.loadCovers;
    clear(rowsBox);
    cards = [];
    board = buildTierBoard(result);

    for (const row of board) {
      const node = renderRow(row, loadCovers);
      rowsBox.append(node);
      cards.push(...node.querySelectorAll('.tier-card'));
    }

    stop = 0;
    setTabStop(0);
  }

  /* ---------------------------------------------------------- the moves */

  /**
   * Says what just happened, in the head of the panel.
   *
   * A live region is only read out when its text changes, and the same move
   * made twice is the same sentence twice; so the line is emptied first and
   * filled on the next tick, the way `app.announce()` does it. It is written
   * on the screen as well as read out, because the toasts of the application
   * live on the page behind and a modal dialog stands over that page.
   *
   * @param {string} message
   * @param {boolean} [failed]
   */
  function say(message, failed = false) {
    clearTimeout(statusTimer);
    status.textContent = '';
    status.classList.toggle('tier__status--error', failed);
    statusTimer = setTimeout(() => {
      status.textContent = message;
    }, ANNOUNCE_DELAY_MS);
  }

  /**
   * Where a card ended up, said in the words of the panel: the row it is in
   * and its place along that row. The removal row has no places to be at — its
   * cards are outside the numbering — so it is named and nothing else is.
   *
   * @param {number} appId
   */
  function announcePlace(appId) {
    const row = board.find((candidate) => candidate.items.some((card) => card.appId === appId));
    if (!row) return;
    const index = row.items.findIndex((card) => card.appId === appId);
    const name = row.id === TIER_NONE ? t('tier.none') : categoryLabel(row.category);
    const item = row.items[index].item;

    say(
      row.id === TIER_REMOVE
        ? t('tier.move.removed', { title: item.title, row: name })
        : t('tier.move.announce', {
            title: item.title,
            row: name,
            place: index + 1,
            total: row.items.length,
          }),
    );
  }

  /**
   * Carries a move out and puts the panel back together around it.
   *
   * The panel is rebuilt from the result rather than patched: a move changes
   * the numbers of everything after it, and a card put in place by hand while
   * the rest of the rows keep the numbers of a minute ago is a panel that
   * lies. What must not change is where the user is standing, so the scroll of
   * the rows and the focus are carried over the rebuild — several cards in a
   * row cannot be moved from a panel that jumps back to the top after each.
   *
   * @param {import('./tier-list.js').TierMove|null} move
   * @param {string} [refusal] What to say when there is nothing to do.
   */
  function commit(move, refusal) {
    if (!move) {
      if (refusal) say(refusal);
      return;
    }

    try {
      applyTierMove(app.session, move);
    } catch (error) {
      say(t('tier.move.failed', { message: error.message }), true);
      return;
    }

    app.save();

    const top = rowsBox.scrollTop;
    render(hooks.onChange(move.appId));
    rowsBox.scrollTop = top;

    const index = cards.findIndex((card) => Number(card.dataset.appId) === move.appId);
    if (index !== -1) {
      focusCard(index, true);
      // Only if the card has left the visible part of the rows: `nearest`
      // scrolls the least it can, and does nothing at all when the card is
      // already there — which is the usual case and must stay still.
      cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    announcePlace(move.appId);
  }

  /* ------------------------------------------------------ the keyboard */

  /**
   * Moves the single tab stop of the panel onto a card.
   *
   * A wishlist of two hundred games is two hundred cards, and two hundred tab
   * stops between the title and the way out is not a panel anybody can leave.
   * So the cards are walked with the arrows and only one of them is on the way
   * of the tab key, the same arrangement the list on the screen behind uses.
   *
   * @param {number} index
   */
  function setTabStop(index) {
    if (cards.length === 0) return;
    stop = Math.max(0, Math.min(cards.length - 1, index));
    cards.forEach((card, at) => {
      card.tabIndex = at === stop ? 0 : -1;
    });
  }

  /**
   * @param {number} index
   * @param {boolean} [preventScroll] After a move the rows are put back where
   *        they stood, and focusing a card is allowed to scroll to it.
   */
  function focusCard(index, preventScroll = false) {
    setTabStop(index);
    cards[stop]?.focus({ preventScroll });
  }

  /**
   * The first card of the row above or below the one the focus is in. The
   * empty rows are stepped over, because there is nothing in them to land on.
   *
   * @param {HTMLElement} card
   * @param {-1|1} direction
   * @returns {number} Index in `cards`, or -1 when there is no such row.
   */
  function firstOfNeighbourRow(card, direction) {
    const rows = [...rowsBox.querySelectorAll('.tier-row')];
    const here = rows.findIndex((row) => row.contains(card));
    for (let at = here + direction; at >= 0 && at < rows.length; at += direction) {
      const first = rows[at].querySelector('.tier-card');
      if (first) return cards.indexOf(first);
    }
    return -1;
  }

  /**
   * The keyboard alternative to dragging.
   *
   * `Ctrl` with an arrow moves the card the focus is on — sideways inside its
   * row, up and down between rows — the same modifier the list on the screen
   * behind uses for the same thing. The bare arrows go on walking the cards,
   * so nothing that worked before is taken away.
   *
   * The two refusals are told apart on purpose: the end of a row and the end
   * of the ladder of rows are different walls, and a line saying which one was
   * hit is the difference between «this key does nothing» and «there is
   * nowhere further this way».
   *
   * @param {number} appId
   * @param {'left'|'right'|'up'|'down'} direction
   */
  function moveByKeyboard(appId, direction) {
    const refusals = {
      left: 'tier.move.edgeStart',
      right: 'tier.move.edgeEnd',
      up: 'tier.move.edgeTop',
      down: 'tier.move.edgeBottom',
    };
    commit(planTierStep(board, appId, direction), t(refusals[direction]));
  }

  rowsBox.addEventListener('keydown', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.tier-card') : null;
    if (!card) return;

    const index = cards.indexOf(card);
    if (index === -1) return;

    const sideways = { ArrowRight: 'right', ArrowLeft: 'left' }[event.key];
    const along = { ArrowDown: 'down', ArrowUp: 'up' }[event.key];
    if (sideways === undefined && along === undefined) {
      if (event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      focusCard(event.key === 'Home' ? 0 : cards.length - 1);
      return;
    }

    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      moveByKeyboard(Number(card.dataset.appId), sideways ?? along);
      return;
    }

    if (sideways !== undefined) {
      focusCard(index + (sideways === 'right' ? 1 : -1));
      return;
    }

    const neighbour = firstOfNeighbourRow(card, along === 'down' ? 1 : -1);
    if (neighbour !== -1) focusCard(neighbour);
  });

  // A card reached with the mouse takes the tab stop with it, so the key that
  // leaves the panel leaves it from where the user is actually standing.
  rowsBox.addEventListener('focusin', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.tier-card') : null;
    if (card) setTabStop(cards.indexOf(card));
  });

  /* ------------------------------------------------- drag and drop */

  function clearDropMarks() {
    for (const node of rowsBox.querySelectorAll('.tier-card--drop-before, .tier-card--drop-after')) {
      node.classList.remove('tier-card--drop-before', 'tier-card--drop-after');
    }
    for (const node of rowsBox.querySelectorAll('.tier-row--drop')) {
      node.classList.remove('tier-row--drop');
    }
  }

  function finishDrag() {
    clearDropMarks();
    if (draggedId !== null) {
      rowsBox.querySelector('.tier-card.is-dragging')?.classList.remove('is-dragging');
    }
    draggedId = null;
    dropTarget = null;
  }

  rowsBox.addEventListener('dragstart', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.tier-card') : null;
    if (!card) return;
    draggedId = Number(card.dataset.appId);
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    // Some browsers refuse to start a drag without any payload.
    event.dataTransfer.setData('text/plain', String(draggedId));
  });

  rowsBox.addEventListener('dragover', (event) => {
    if (draggedId === null || !(event.target instanceof Element)) return;
    const row = event.target.closest('.tier-row');
    if (!row) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearDropMarks();

    const card = event.target.closest('.tier-card');

    // Over the card being dragged: it is standing in its own way, and nothing
    // is marked, because dropping it on itself would change nothing.
    if (card && Number(card.dataset.appId) === draggedId) {
      dropTarget = null;
      return;
    }

    if (!card) {
      // The caption, the empty message, the free space after the last cover:
      // the row itself is the target, and the card goes to the end of it.
      row.classList.add('tier-row--drop');
      dropTarget = { appId: draggedId, row: row.dataset.row, anchor: null, side: 'after' };
      return;
    }

    // Left and right and not top and bottom: a row reads left to right, and a
    // row of covers wraps onto the next line rather than starting a column.
    const box = card.getBoundingClientRect();
    const side = event.clientX < box.left + box.width / 2 ? 'before' : 'after';
    card.classList.add(side === 'before' ? 'tier-card--drop-before' : 'tier-card--drop-after');
    dropTarget = {
      appId: draggedId,
      row: row.dataset.row,
      anchor: Number(card.dataset.appId),
      side,
    };
  });

  rowsBox.addEventListener('drop', (event) => {
    if (draggedId === null || dropTarget === null) return;
    event.preventDefault();
    const drop = dropTarget;
    finishDrag();
    commit(planTierMove(board, drop));
  });

  rowsBox.addEventListener('dragend', finishDrag);

  /* ------------------------------------------------- opening and closing */

  /**
   * Builds the panel out of a result and shows it.
   *
   * The result is handed in rather than asked for: the screen has just built
   * it, and building it again would walk the whole ranking a second time.
   *
   * @param {ReturnType<import('./ranking.js').RankingSession['getResult']>} result
   */
  function open(result) {
    render(result);
    clearTimeout(statusTimer);
    status.textContent = '';
    status.classList.remove('tier__status--error');
    scrollY = window.scrollY;

    if (typeof dialog.showModal !== 'function') {
      dialog.setAttribute('open', '');
      return;
    }
    dialog.showModal();
    // The title and not the first card: the panel is something to read before
    // it is something to rearrange, and a reader that starts inside the rows
    // has been handed a tool before being told what it works on.
    title.focus();
  }

  /**
   * Hands the keyboard back to the button that opened the panel, and puts the
   * page back where it stood.
   *
   * The scroll is restored explicitly because focusing a button is allowed to
   * scroll to it, and the result screen must be left at the line the user was
   * reading — not at the tools row the button happens to sit in.
   */
  function restore() {
    openButton.focus({ preventScroll: true });
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }

  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    restore();
  }

  closeButton.addEventListener('click', close);

  // A click outside the panel, which a dialog reports with itself as the
  // target. The head and the rows fill it edge to edge, so nothing inside
  // produces one.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  // Escape is taken over rather than left to the browser, the same way the
  // settings menu takes it over: every way out then runs through one function,
  // and the keyboard comes back to the button whichever way was used. Left to
  // the browser, the focus lands wherever it happened to be before the panel
  // opened, which is not always that button.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  });

  // Any other way it may close — the browser's own, a future one. Restoring
  // twice costs nothing: the focus is already where this puts it.
  dialog.addEventListener('close', restore);

  return { open };
}
