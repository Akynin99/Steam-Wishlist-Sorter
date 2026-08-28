/**
 * Stage 1: one item at a time, six categories, hotkeys 1–6.
 *
 * The stage keeps a cursor over the wishlist and nothing else: the categories
 * themselves live in the session, so a reload continues where the user stopped
 * and a category can be changed later by walking back to the item.
 *
 * Skipping the stage entirely is a supported way of working — items without a
 * category are an ordinary sortable bucket in `ranking.js` — so the button that
 * jumps straight to the comparisons needs no special logic behind it.
 */

import { CATEGORIES } from './model.js';
import { categoryTitle, element, plural, renderItemCard } from './ui-common.js';

/**
 * @param {object} app
 * @returns {{ render: Function, handleKey: Function }}
 */
export function createCategorizeScreen(app) {
  const nodes = {
    counter: document.getElementById('cat-counter'),
    bar: document.getElementById('cat-bar'),
    legend: document.getElementById('cat-legend'),
    cover: document.getElementById('cat-cover'),
    title: document.getElementById('cat-title'),
    kind: document.getElementById('cat-kind'),
    link: document.getElementById('cat-link'),
    current: document.getElementById('cat-current'),
    buttons: document.getElementById('cat-buttons'),
    card: document.querySelector('#screen-categorize .card--single'),
    back: document.getElementById('cat-back'),
    defer: document.getElementById('cat-defer'),
    skip: document.getElementById('cat-skip'),
    done: document.getElementById('cat-done'),
    doneText: document.getElementById('cat-done-text'),
    doneButton: document.getElementById('cat-to-compare'),
  };

  /** Position in the wishlist order, not an app id: items may be removed. */
  let cursor = 0;

  /** @type {Map<string, HTMLButtonElement>} */
  const categoryButtons = new Map();

  CATEGORIES.forEach((category, index) => {
    const button = element(
      'button',
      {
        className: 'catbtn',
        attrs: { type: 'button', 'aria-pressed': 'false' },
        dataset: { category: category.id },
      },
      [
        element('span', { className: 'catbtn__key', text: String(index + 1), attrs: { 'aria-hidden': 'true' } }),
        element('span', { className: 'catbtn__label', text: category.label }),
      ],
    );
    button.style.setProperty('--cat-color', `var(--cat-${category.id})`);
    button.addEventListener('click', () => choose(category.id));
    categoryButtons.set(category.id, button);
    nodes.buttons.append(button);
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
    app.announce(`${item.title}: ${categoryTitle(categoryId)}`);
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
      app.toast('Это первая позиция списка.');
      return;
    }
    cursor -= 1;
    render();
  }

  function postpone() {
    const list = items();
    const next = nextUnclassified(cursor);
    if (next === -1 || next === cursor) {
      app.toast('Больше нераспределённых позиций нет.');
      return;
    }
    app.announce(`${list[cursor].title} отложена, вернёмся к ней в конце круга.`);
    cursor = next;
    render();
  }

  /**
   * Called when the stage is opened: the cursor goes to the first item that
   * still needs a category. Inside the stage the cursor is only ever moved by
   * the user, so «предыдущая» really shows the previous position instead of
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
  nodes.skip.addEventListener('click', () => app.show('compare'));
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

  function render() {
    const list = items();
    const total = list.length;

    if (total === 0) {
      nodes.card.hidden = true;
      nodes.buttons.hidden = true;
      nodes.back.disabled = true;
      nodes.defer.disabled = true;
      nodes.skip.disabled = true;
      nodes.counter.textContent = '0 из 0';
      nodes.bar.style.width = '0%';
      nodes.legend.textContent = '';
      nodes.done.hidden = false;
      nodes.doneText.textContent = 'Список пуст: сначала импортируйте wishlist.';
      nodes.doneButton.textContent = 'Перейти к импорту';
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
    nodes.buttons.hidden = false;
    nodes.back.disabled = cursor === 0;
    nodes.defer.disabled = left <= 1 && category === null;
    nodes.skip.disabled = false;

    renderItemCard(nodes, item, app.loadCovers);
    nodes.current.textContent = category === null
      ? `Позиция в вашем wishlist: ${item.wishlistPosition}`
      : `Сейчас: ${categoryTitle(category)}. Выберите другую категорию, чтобы изменить.`;

    for (const [id, button] of categoryButtons) {
      button.setAttribute('aria-pressed', String(id === category));
    }

    nodes.counter.textContent = `${cursor + 1} из ${total}`;
    nodes.bar.style.width = `${Math.round((classified / total) * 100)}%`;
    nodes.legend.textContent =
      `Распределено ${classified} из ${total}` +
      (left > 0 ? `, осталось ${left} ${plural(left, ['позиция', 'позиции', 'позиций'])}.` : '.');

    nodes.done.hidden = left > 0;
    nodes.doneText.textContent = 'Все позиции распределены.';
    nodes.doneButton.textContent = 'Перейти к сравнениям';
  }

  return { render, handleKey, activate };
}
