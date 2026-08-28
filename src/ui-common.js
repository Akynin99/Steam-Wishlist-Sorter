/**
 * Small DOM helpers shared by the screens.
 *
 * Everything here is presentation only: no screen state, no ranking logic and
 * no storage. The rules of the application live in `ranking.js`, and the
 * screens read them from there.
 */

import { UNCATEGORIZED_LABEL, categoryLabel } from './model.js';

/**
 * Creates an element in one call.
 *
 * @param {string} tag
 * @param {{ className?: string, text?: string, html?: string,
 *           attrs?: Record<string, string|number|boolean|null>,
 *           dataset?: Record<string, string> }} [options]
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    if (value === null || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[name] = value;
  }
  for (const child of children) node.append(child);
  return node;
}

/**
 * Removes every child of a node.
 *
 * @param {Element} node
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Russian label of an item kind.
 *
 * @param {import('./model.js').ItemKind} kind
 * @returns {string}
 */
export function kindLabel(kind) {
  if (kind === 'dlc') return 'DLC';
  if (kind === 'game') return 'Игра';
  return 'Тип неизвестен';
}

/**
 * Label of a category, including the implicit bucket of items the user has not
 * classified yet.
 *
 * @param {string|null} category
 * @returns {string}
 */
export function categoryTitle(category) {
  return category === null ? UNCATEGORIZED_LABEL : categoryLabel(category);
}

/**
 * Picks the grammatical form Russian needs for a count.
 *
 * @param {number} count
 * @param {[string, string, string]} forms `[1, 2, 5]`, e.g. позиция/позиции/позиций.
 * @returns {string} The form alone, without the number.
 */
export function plural(count, forms) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

/**
 * Initials shown on the cover placeholder, so that two items without a cover
 * still look different.
 *
 * @param {string} title
 * @returns {string}
 */
function monogram(title) {
  const words = String(title).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Fills a cover box with the capsule image of an item, or with a placeholder.
 *
 * A placeholder is shown in three cases, and they are deliberately the same
 * one: the item has no cover, the user turned the covers off, and the image
 * failed to load. A broken image icon is never shown.
 *
 * @param {HTMLElement} box   The `.cover` element to fill.
 * @param {import('./model.js').WishlistItem} item
 * @param {boolean} loadCovers Value of `settings.loadCovers`.
 */
export function renderCover(box, item, loadCovers) {
  clear(box);
  box.classList.remove('cover--empty');

  if (!loadCovers || !item.imageUrl) {
    box.classList.add('cover--empty');
    box.append(
      element('span', { className: 'cover__monogram', text: monogram(item.title), attrs: { 'aria-hidden': 'true' } }),
      element('span', { className: 'cover__caption', text: loadCovers ? 'Без обложки' : 'Обложки выключены' }),
    );
    return;
  }

  const image = element('img', {
    className: 'cover__image',
    attrs: { alt: '', src: item.imageUrl, loading: 'lazy', decoding: 'async' },
  });
  image.addEventListener(
    'error',
    () => {
      clear(box);
      box.classList.add('cover--empty');
      box.append(
        element('span', { className: 'cover__monogram', text: monogram(item.title), attrs: { 'aria-hidden': 'true' } }),
        element('span', { className: 'cover__caption', text: 'Обложка не загрузилась' }),
      );
    },
    { once: true },
  );
  box.append(image);
}

/**
 * Whether a keyboard event happens inside a field, where the hotkeys of the
 * screens must not fire.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Fills the standard title / kind / link block of an item card.
 *
 * @param {{ title: HTMLElement, kind: HTMLElement, link: HTMLAnchorElement, cover: HTMLElement }} nodes
 * @param {import('./model.js').WishlistItem} item
 * @param {boolean} loadCovers
 */
export function renderItemCard(nodes, item, loadCovers) {
  nodes.title.textContent = item.title;
  nodes.kind.textContent = kindLabel(item.kind);
  nodes.kind.classList.toggle('badge--dlc', item.kind === 'dlc');
  nodes.link.href = item.url;
  nodes.link.setAttribute('aria-label', `Открыть «${item.title}» в Steam, в новой вкладке`);
  renderCover(nodes.cover, item, loadCovers);
}
