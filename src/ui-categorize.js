/**
 * Stage 1: one item at a time, six categories, hotkeys 1–6.
 *
 * The stage keeps a cursor over the wishlist and nothing else: the categories
 * themselves live in the session, so a reload continues where the user stopped
 * and a category can be changed later by walking back to the item.
 *
 * Five of the six values are a scale of interest and stand together; the
 * sixth, leaving the wishlist, is built by the same loop and put on the other
 * side of the word «or». It is a quiet destructive action and not the bottom
 * of the scale, and the markup says so by placing it apart.
 *
 * Skipping the stage entirely is a supported way of working — items without a
 * category are an ordinary sortable bucket in `ranking.js` — so the row in the
 * settings menu that offers it needs no special logic behind it, only the
 * sentence explaining what the comparisons then look like.
 */

import { plural, t } from './i18n.js';
import { CATEGORIES, categoryLabel } from './model.js';
import { element, renderItemCard } from './ui-common.js';

/** The value that is not a level of interest, and does not stand in the scale. */
const APART = 'remove';

/**
 * @param {object} app
 * @returns {{ render: Function, handleKey: Function, activate: Function, skipStage: Function }}
 */
export function createCategorizeScreen(app) {
  const nodes = {
    heading: document.getElementById('categorize-heading'),
    counter: document.getElementById('cat-counter'),
    bar: document.getElementById('cat-bar'),
    legend: document.getElementById('cat-legend'),
    cover: document.getElementById('cat-cover'),
    title: document.getElementById('cat-title'),
    kind: document.getElementById('cat-kind'),
    link: document.getElementById('cat-link'),
    current: document.getElementById('cat-current'),
    buttons: document.getElementById('cat-buttons'),
    remove: document.getElementById('cat-remove'),
    scale: document.getElementById('cat-scale'),
    card: document.getElementById('cat-card'),
    back: document.getElementById('cat-back'),
    defer: document.getElementById('cat-defer'),
    done: document.getElementById('cat-done'),
    doneText: document.getElementById('cat-done-text'),
    doneButton: document.getElementById('cat-to-compare'),
  };

  /** Position in the wishlist order, not an app id: items may be removed. */
  let cursor = 0;

  /** @type {Map<string, HTMLButtonElement>} */
  const categoryButtons = new Map();

  /** The label span of each button, refilled on every render. @type {Map<string, HTMLElement>} */
  const categoryLabels = new Map();

  CATEGORIES.forEach((category, index) => {
    const apart = category.id === APART;
    const label = element('span', { className: 'catbtn__label' });
    const button = element(
      'button',
      {
        className: apart ? 'catbtn catbtn--apart' : 'catbtn',
        attrs: { type: 'button', 'aria-pressed': 'false' },
        dataset: { category: category.id },
      },
      [
        element('span', { className: 'catbtn__key', text: String(index + 1), attrs: { 'aria-hidden': 'true' } }),
        label,
      ],
    );
    button.style.setProperty('--cat-color', `var(--cat-${category.id})`);
    button.addEventListener('click', () => choose(category.id));
    categoryButtons.set(category.id, button);
    categoryLabels.set(category.id, label);
    (apart ? nodes.remove : nodes.buttons).append(button);
  });

  /** @returns {import('./model.js').WishlistItem[]} */
  const items = () => app.session.getItems();

  /**
   * Index of the next item without a category, starting after `from` and
   * wrapping around once. A postponed item therefore comes back on the next
   * lap instead of being lost.
   *
   * @param {number} from
   * @returns {number} `-1` when every item has a category.
   */
  function nextUnclassified(from) {
    const list = items();
    for (let step = 1; step <= list.length; step += 1) {
      const index = (from + step) % list.length;
      if (app.session.getCategory(list[index].appId) === null) return index;
    }
    return -1;
  }

  /**
   * @param {string} categoryId
   */
  function choose(categoryId) {
    const list = items();
    const item = list[cursor];
    if (!item) return;

    app.session.setCategory(item.appId, categoryId);
    app.save();
    app.announce(t('categorize.announce', { title: item.title, category: categoryLabel(categoryId) }));
    advance();
  }

  /** Moves to the next item that still needs a category. */
  function advance() {
    const next = nextUnclassified(cursor);
    if (next !== -1) cursor = next;
    render();
  }

  function goBack() {
    if (cursor === 0) {
      app.toast(t('categorize.firstItem'));
      return;
    }
    cursor -= 1;
    render();
  }

  function postpone() {
    const list = items();
    const next = nextUnclassified(cursor);
    if (next === -1 || next === cursor) {
      app.toast(t('categorize.noneLeft'));
      return;
    }
    app.announce(t('categorize.postponed', { title: list[cursor].title }));
    cursor = next;
    render();
  }

  /**
   * Leaves the stage with every item still uncategorised.
   *
   * The row that calls this sits in the settings menu, where a button is not
   * pressed by accident, and it still asks: what it costs — one big group
   * instead of five small ones, and many more questions — is not visible from
   * the words «skip the stage».
   *
   * @returns {Promise<void>}
   */
  async function skipStage() {
    const confirmed = await app.confirm({
      title: t('categorize.skipTitle'),
      text: t('categorize.skipText'),
      confirmLabel: t('categorize.skipConfirm'),
    });
    if (!confirmed) return;
    app.show('compare');
    app.toast(t('categorize.skipDone'));
  }

  /**
   * Called when the stage is opened: the cursor goes to the first item that
   * still needs a category. Inside the stage the cursor is only ever moved by
   * the user, so "previous" really shows the previous position instead of
   * bouncing back to the first unclassified one.
   */
  function activate() {
    const list = items();
    if (list.length === 0) return;
    if (cursor >= list.length) cursor = list.length - 1;
    if (app.session.getCategory(list[cursor].appId) === null) return;
    const next = nextUnclassified(cursor);
    if (next !== -1) cursor = next;
  }

  nodes.back.addEventListener('click', goBack);
  nodes.defer.addEventListener('click', postpone);
  nodes.doneButton.addEventListener('click', () => {
    app.show(app.session.itemCount === 0 ? 'import' : 'compare');
  });

  /**
   * @param {KeyboardEvent} event
   */
  function handleKey(event) {
    if (items().length === 0) return;

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= CATEGORIES.length) {
      event.preventDefault();
      choose(CATEGORIES[digit - 1].id);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goBack();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      postpone();
    }
  }

  /**
   * Keeps the keyboard on the screen when the block it was in goes away. The
   * empty list hides the card and the scale, and the button that was focused
   * goes with them; without this the focus would fall back to the document and
   * the next Tab would start again from the top of the page.
   */
  function rescueFocus() {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return;
    if (!nodes.scale.contains(focused) && !nodes.card.contains(focused)) return;
    if (!nodes.done.hidden) nodes.doneButton.focus();
    else nodes.heading.focus();
  }

  function render() {
    const list = items();
    const total = list.length;

    // The buttons are built once and renamed on every draw, which is what
    // makes a language change on this screen a redraw and not a rebuild.
    for (const [id, label] of categoryLabels) label.textContent = categoryLabel(id);

    if (total === 0) {
      nodes.done.hidden = false;
      nodes.card.hidden = true;
      nodes.scale.hidden = true;
      nodes.back.disabled = true;
      nodes.defer.disabled = true;
      nodes.counter.textContent = t('categorize.counter', { index: 0, total: 0 });
      nodes.bar.style.width = '0%';
      nodes.legend.textContent = '';
      nodes.doneText.textContent = t('categorize.empty');
      nodes.doneButton.textContent = t('categorize.toImport');
      rescueFocus();
      return;
    }

    // The cursor survives removals and re-imports by being clamped, never by
    // being trusted.
    if (cursor >= total) cursor = total - 1;
    if (cursor < 0) cursor = 0;

    const classified = list.filter((item) => app.session.getCategory(item.appId) !== null).length;
    const left = total - classified;
    const item = list[cursor];
    const category = app.session.getCategory(item.appId);

    nodes.card.hidden = false;
    nodes.scale.hidden = false;
    nodes.back.disabled = cursor === 0;
    nodes.defer.disabled = left <= 1 && category === null;

    renderItemCard(nodes, item, app.loadCovers);
    nodes.current.textContent = category === null
      ? t('categorize.position', { position: item.wishlistPosition })
      : t('categorize.current', { category: categoryLabel(category) });

    for (const [id, button] of categoryButtons) {
      button.setAttribute('aria-pressed', String(id === category));
    }

    // The counter and the bar say the same thing — how much of the list has a
    // category — so the big number never argues with the line under it.
    nodes.counter.textContent = t('categorize.counter', { index: classified, total });
    nodes.bar.style.width = `${Math.round((classified / total) * 100)}%`;
    nodes.legend.textContent =
      left > 0 ? t('categorize.legendLeft', { items: plural('count.items', left) }) : '';

    nodes.done.hidden = left > 0;
    nodes.doneText.textContent = t('categorize.done');
    nodes.doneButton.textContent = t('categorize.toCompare');
  }

  return { render, handleKey, activate, skipStage };
}
