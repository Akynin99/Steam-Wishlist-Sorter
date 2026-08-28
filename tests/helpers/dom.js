/**
 * A document just large enough to run the wishlist selectors against.
 *
 * The project has no dependencies and is not going to get one, so there is no
 * jsdom here. What the userscripts actually ask of a page is small and can be
 * written out: `querySelector`, `querySelectorAll`, `matches`, `contains`, the
 * chain of parents, the text of an element, and the three numbers that say
 * whether something scrolls. That is what this file implements, and nothing
 * beyond it — an unsupported selector throws instead of quietly matching
 * nothing, so a test can never pass because the mock misread it.
 *
 * The selector subset is the one the scripts use: a list of compound selectors
 * separated by commas, each of them a tag name, `#id`, `.class`, `[attr]` with
 * `=`, `^=`, `*=`, `$=` and `~=`, an `i` flag for a case insensitive match, and
 * `:not(...)`. No combinators — the scripts use none.
 */

/**
 * One compound selector, parsed.
 *
 * @typedef {{ tag: string|null, id: string|null, classes: string[],
 *             attrs: Array<{ name: string, op: string|null, value: string, insensitive: boolean }>,
 *             not: object[] }} Compound
 */

const TAG = /^([a-zA-Z][\w-]*)/;
const ID = /^#([\w-]+)/;
const CLASS = /^\.([\w-]+)/;
const NOT = /^:not\(([^)]*)\)/;
const ATTR = /^\[\s*([\w-]+)\s*(?:([~^*$|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(i|I)?\s*)?\]/;

/**
 * @param {string} text
 * @returns {Compound}
 */
function parseCompound(text) {
  /** @type {Compound} */
  const compound = { tag: null, id: null, classes: [], attrs: [], not: [] };
  let rest = text.trim();

  while (rest.length > 0) {
    let match = TAG.exec(rest);
    if (match) {
      compound.tag = match[1].toUpperCase();
    } else if ((match = ID.exec(rest))) {
      compound.id = match[1];
    } else if ((match = CLASS.exec(rest))) {
      compound.classes.push(match[1]);
    } else if ((match = NOT.exec(rest))) {
      compound.not.push(parseCompound(match[1]));
    } else if ((match = ATTR.exec(rest))) {
      compound.attrs.push({
        name: match[1],
        op: match[2] ?? null,
        value: match[3] ?? match[4] ?? match[5] ?? '',
        insensitive: Boolean(match[6]),
      });
    } else {
      throw new Error(`The mock document does not understand this selector: ${text}`);
    }
    rest = rest.slice(match[0].length).trim();
  }

  return compound;
}

/**
 * @param {string} selector
 * @returns {Compound[]}
 */
function parseSelectorList(selector) {
  return String(selector)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(parseCompound);
}

/**
 * @param {FakeElement} node
 * @param {{ name: string, op: string|null, value: string, insensitive: boolean }} attr
 * @returns {boolean}
 */
function matchesAttribute(node, attr) {
  const raw = node.getAttribute(attr.name);
  if (raw === null) return false;
  if (attr.op === null) return true;

  const actual = attr.insensitive ? raw.toLowerCase() : raw;
  const expected = attr.insensitive ? attr.value.toLowerCase() : attr.value;

  switch (attr.op) {
    case '=':
      return actual === expected;
    case '^=':
      return actual.startsWith(expected);
    case '*=':
      return actual.includes(expected);
    case '$=':
      return actual.endsWith(expected);
    case '~=':
      return actual.split(/\s+/).includes(expected);
    default:
      throw new Error(`The mock document does not understand the operator ${attr.op}`);
  }
}

/**
 * @param {FakeElement} node
 * @param {Compound} compound
 * @returns {boolean}
 */
function matchesCompound(node, compound) {
  if (compound.tag !== null && node.tagName !== compound.tag) return false;
  if (compound.id !== null && node.getAttribute('id') !== compound.id) return false;
  for (const name of compound.classes) if (!node.classList.contains(name)) return false;
  for (const attr of compound.attrs) if (!matchesAttribute(node, attr)) return false;
  for (const negated of compound.not) if (matchesCompound(node, negated)) return false;
  return true;
}

/** An element of the mock page. */
class FakeElement {
  /**
   * @param {string} tag
   * @param {Record<string, string|number>} attributes Keys starting with `$`
   *   are properties of the element rather than attributes of it: `$text`,
   *   `$scrollHeight`, `$clientHeight`, `$scrollTop`, `$top`, `$height`.
   * @param {FakeElement[]} children
   */
  constructor(tag, attributes = {}, children = []) {
    this.tagName = String(tag).toUpperCase();
    /** @type {Map<string, string>} */
    this.attributes = new Map();
    this.parentElement = null;
    this.children = [];

    this.text = '';
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.top = 0;
    this.height = 0;

    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith('$')) this[name.slice(1)] = value;
      else this.attributes.set(name, String(value));
    }

    for (const child of children) this.append(child);
  }

  /**
   * @param {FakeElement} child
   * @returns {FakeElement}
   */
  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return this;
  }

  /**
   * @param {string} name
   * @returns {string|null}
   */
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  get id() {
    return this.getAttribute('id') ?? '';
  }

  get className() {
    return this.getAttribute('class') ?? '';
  }

  get classList() {
    const names = this.className.split(/\s+/).filter(Boolean);
    return { contains: (name) => names.includes(name) };
  }

  get src() {
    return this.getAttribute('src') ?? '';
  }

  get currentSrc() {
    return this.getAttribute('src') ?? '';
  }

  get href() {
    return this.getAttribute('href') ?? '';
  }

  get textContent() {
    return [this.text, ...this.children.map((child) => child.textContent)].join('');
  }

  /** Every element below this one, in document order. */
  get descendants() {
    const all = [];
    for (const child of this.children) all.push(child, ...child.descendants);
    return all;
  }

  /**
   * @param {string} selector
   * @returns {boolean}
   */
  matches(selector) {
    return parseSelectorList(selector).some((compound) => matchesCompound(this, compound));
  }

  /**
   * @param {string} selector
   * @returns {FakeElement[]}
   */
  querySelectorAll(selector) {
    const compounds = parseSelectorList(selector);
    return this.descendants.filter((node) => compounds.some((compound) => matchesCompound(node, compound)));
  }

  /**
   * @param {string} selector
   * @returns {FakeElement|null}
   */
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  /**
   * @param {FakeElement} node
   * @returns {boolean}
   */
  contains(node) {
    for (let current = node; current; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }

  getBoundingClientRect() {
    return { top: this.top, bottom: this.top + this.height, left: 0, right: 0, width: 0, height: this.height };
  }
}

/**
 * An element of the mock page.
 *
 * @param {string} tag
 * @param {Record<string, string|number>} [attributes]
 * @param {FakeElement[]} [children]
 * @returns {FakeElement}
 */
export function el(tag, attributes = {}, children = []) {
  return new FakeElement(tag, attributes, children);
}

/**
 * A document holding the given elements in its body.
 *
 * @param {FakeElement[]} children
 * @returns {{ documentElement: FakeElement, body: FakeElement,
 *             querySelector: (selector: string) => FakeElement|null,
 *             querySelectorAll: (selector: string) => FakeElement[] }}
 */
export function createDocument(children) {
  const body = el('body', {}, children);
  const root = el('html', {}, [body]);

  return {
    documentElement: root,
    body,
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
  };
}
