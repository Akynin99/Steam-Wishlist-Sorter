/**
 * The tier list panel of the result screen.
 *
 * A second way of reading the order that is already on the screen: one row per
 * category, the games of a row standing left to right in the order the ranking
 * gave them. It shows and it does nothing else — no sorting is started, no
 * category is touched, no hand placement is recorded, and there is nothing on
 * a card to press. It keeps no state of its own either: the rows are built
 * from the result every time the panel opens, so whatever was changed on the
 * screen a minute ago is already in them.
 *
 * The rows come from `tier-list.js`, which is given the result the screen has
 * already asked for. They are never read off the list on the screen: the
 * search and the kind filter of that list hide rows rather than rebuild them,
 * and reading the DOM would have dragged a filter into a view that has nothing
 * to do with one.
 *
 * A `<dialog>`, so the focus trap and the inertness of the page behind it come
 * from the browser, and `isHotkeyBlocked()` keeps the hotkeys of the result
 * screen quiet while it stands open.
 */

import { t } from './i18n.js';
import { categoryLabel } from './model.js';
import { TIER_REMOVE, buildTierList } from './tier-list.js';
import { clear, element, renderCover } from './ui-common.js';

/**
 * Builds the panel and wires it to the button that opens it.
 *
 * @param {object} app The application object of `ui-app.js`; only
 *   `app.loadCovers` is read, and only at the moment the panel opens.
 * @returns {{ open: (result: ReturnType<
 *   import('./ranking.js').RankingSession['getResult']>) => void }}
 */
export function createTierListPanel(app) {
  const dialog = document.getElementById('tier-dialog');
  const title = document.getElementById('tier-title');
  const rowsBox = document.getElementById('tier-rows');
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

  /** Index of the card that owns the single tab stop of the panel. */
  let stop = 0;

  /** Where the page stood when the panel opened. */
  let scrollY = 0;

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
   * Nothing on it is pressable. A card is a picture of a place in the list,
   * and a button here would be an action the panel has no business offering.
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
          tabindex: '-1',
          'aria-label':
            card.position === null
              ? card.item.title
              : t('tier.card.aria', { position: card.position, title: card.item.title }),
        },
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

    const body = row.items.length > 0
      ? list
      : element('p', { className: 'tier-row__empty', text: t('tier.empty') });

    const node = element(
      'section',
      {
        className: `tier-row tier-row--${row.id}` + (row.onScale ? '' : ' tier-row--apart'),
        attrs: { 'aria-labelledby': headingId },
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

    for (const row of buildTierList(result)) {
      const node = renderRow(row, loadCovers);
      rowsBox.append(node);
      cards.push(...node.querySelectorAll('.tier-card'));
    }

    stop = 0;
    setTabStop(0);
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
   */
  function focusCard(index) {
    setTabStop(index);
    cards[stop]?.focus();
  }

  /**
   * The first card of the row above or below the one the focus is in. The
   * empty rows of the scale are stepped over, because there is nothing in them
   * to land on.
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

  rowsBox.addEventListener('keydown', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.tier-card') : null;
    if (!card) return;

    const index = cards.indexOf(card);
    if (index === -1) return;

    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      focusCard(index + step);
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusCard(event.key === 'Home' ? 0 : cards.length - 1);
      return;
    }

    const direction = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (direction === undefined) return;
    event.preventDefault();
    const neighbour = firstOfNeighbourRow(card, direction);
    if (neighbour !== -1) focusCard(neighbour);
  });

  // A card reached with the mouse takes the tab stop with it, so the key that
  // leaves the panel leaves it from where the user is actually standing.
  rowsBox.addEventListener('focusin', (event) => {
    const card = event.target instanceof Element ? event.target.closest('.tier-card') : null;
    if (card) setTabStop(cards.indexOf(card));
  });

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
    scrollY = window.scrollY;

    if (typeof dialog.showModal !== 'function') {
      dialog.setAttribute('open', '');
      return;
    }
    dialog.showModal();
    // The title and not the first control: the panel is something to read, and
    // a reader that starts on «Close» has been told the way out before it has
    // been told what it is leaving.
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
