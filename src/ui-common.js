/**
 * Small DOM helpers shared by the screens.
 *
 * Everything here is presentation only: no screen state, no ranking logic and
 * no storage. The rules of the application live in `ranking.js`, and the
 * screens read them from there. The words live in `i18n.js`, and this module
 * is what puts them into elements.
 */

import { t } from './i18n.js';

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
 * Attributes of the markup that carry a dictionary key.
 *
 * `data-i18n-html` exists for the handful of strings that hold inline markup —
 * the `<kbd>` of a hotkey hint. What is written is a dictionary string of this
 * application and never user data, so there is nothing here to inject.
 */
const I18N_TEXT = 'data-i18n';
const I18N_HTML = 'data-i18n-html';
const I18N_ATTR = 'data-i18n-attr';

/**
 * Translates every element of a subtree that carries a key, in the language
 * that is currently set. Called on start and again on every language change:
 * the markup holds keys, so re-running this is all it takes to redraw the
 * static part of the page.
 *
 * @param {ParentNode} [root]
 */
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll(`[${I18N_TEXT}]`)) {
    node.textContent = t(node.getAttribute(I18N_TEXT));
  }
  for (const node of root.querySelectorAll(`[${I18N_HTML}]`)) {
    node.innerHTML = t(node.getAttribute(I18N_HTML));
  }
  for (const node of root.querySelectorAll(`[${I18N_ATTR}]`)) {
    for (const pair of node.getAttribute(I18N_ATTR).split(';')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute && key) node.setAttribute(attribute, t(key));
    }
  }
}

/**
 * Label of an item kind, in the language of the interface.
 *
 * @param {import('./model.js').ItemKind} kind
 * @returns {string}
 */
export function kindLabel(kind) {
  return t(`kind.${kind === 'game' || kind === 'dlc' ? kind : 'unknown'}`);
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
      element('span', { className: 'cover__caption', text: t(loadCovers ? 'cover.none' : 'cover.off') }),
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
        element('span', { className: 'cover__caption', text: t('cover.failed') }),
      );
    },
    { once: true },
  );
  box.append(image);
}

/**
 * Hands a text file to the browser to save.
 *
 * The file is built in the page out of data that is already there, and the
 * link is clicked and thrown away in the same breath: nothing is uploaded
 * anywhere, and the user picks the folder in their own save dialog.
 *
 * @param {string} fileName
 * @param {string} text
 * @param {string} mimeType
 */
export function downloadText(fileName, text, mimeType) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = element('a', { attrs: { href: url, download: fileName } });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Puts text on the clipboard.
 *
 * The clipboard API is the way this is done, but it needs a secure context and
 * a permission the browser may refuse. When it does, the old selection trick
 * still works, and only if that fails too does the caller hear about it — the
 * user is then offered the list as a file instead.
 *
 * @param {string} text
 * @returns {Promise<boolean>} Whether the text really made it to the clipboard.
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused or unavailable: fall through to the selection based way.
  }

  const field = element('textarea', { attrs: { readonly: true, 'aria-hidden': 'true' } });
  field.value = text;
  field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
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
 * Whether the hotkeys of the screens must stay quiet.
 *
 * A field is one reason and `isTypingTarget()` knows it. The other is a dialog
 * standing over the page — the settings menu, the confirmation — where the
 * focus is on a button that is neither an input nor a textarea, so nothing in
 * the test above would have caught it and «1» would have gone on categorising
 * the list behind the menu. Any open modal counts, so a dialog added later is
 * covered without anyone remembering this function exists.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
export function isHotkeyBlocked(target) {
  if (isTypingTarget(target)) return true;
  return document.querySelector('dialog[open]') !== null;
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
  nodes.link.setAttribute('aria-label', t('common.openInSteamAria', { title: item.title }));
  renderCover(nodes.cover, item, loadCovers);
}
