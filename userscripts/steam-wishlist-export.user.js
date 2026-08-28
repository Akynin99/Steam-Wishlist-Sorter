// ==UserScript==
// @name         Steam Wishlist Sorter — wishlist export
// @namespace    https://github.com/Akynin99/Steam-Wishlist-Sorter
// @version      1.1.0
// @description  Collects the wishlist from the Steam page (lazy loading included) and saves it as JSON for Steam Wishlist Sorter
// @author       Akynin99
// @license      MIT
// @homepageURL  https://github.com/Akynin99/Steam-Wishlist-Sorter
// @match        https://store.steampowered.com/wishlist/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Reads the wishlist page and writes a JSON file the application imports.
 *
 * What the script does NOT do, on purpose:
 *  - it makes no network request of any kind: no `fetch`, no `XMLHttpRequest`,
 *    no image beacon. Everything it knows comes from the DOM of the page the
 *    user is already looking at;
 *  - it does not read `document.cookie`, the session id, the login token or
 *    any other secret, and it has no `@grant`, so it cannot even ask for the
 *    privileged APIs that would allow it;
 *  - it changes nothing on the page except its own panel;
 *  - it does not hand over a part of a wishlist as if it were the whole of it.
 *    The list is virtualized, so a reading that goes wrong produces a shorter
 *    list rather than an error, and a shorter list looks exactly like a real
 *    one. The rows of the current page are numbered, so the script knows how
 *    many there should be and says out loud when it has fewer.
 *
 * The file it produces is saved by the browser through a `blob:` URL, which
 * never leaves the machine.
 */

(() => {
  'use strict';

  // ==========================================================================
  // Steam adapter
  // ==========================================================================

  /**
   * Everything that depends on the markup of the wishlist page lives here, and
   * only here. When Steam changes its layout, this object is what has to be
   * updated — the rest of the script works in terms of "a row", "a title", "an
   * app id" and does not know a single class name.
   *
   * Every field is a list of candidates tried in order, because the wishlist
   * has been through several layouts and a user may be on any of them: the
   * older one puts absolutely positioned `.wishlist_row` elements into
   * `#wishlist_ctn`, the current one renders a virtualized list — about sixteen
   * rows of a wishlist of any length live in the markup at once — with class
   * names a bundler generates, of the `S2Q8eqrNOA4-` sort, which change by
   * themselves and are worth nothing as an anchor.
   *
   * What the current page does give is `data-rfd-draggable-id`, holding
   * `WishlistItem-<app id>-<number in the list>`. It is set by the drag and
   * drop library the wishlist is built on, so it lives exactly as long as the
   * ability to drag a row with the mouse — which is the same thing this project
   * writes an order through. That makes it a better anchor than any class name,
   * and it carries the row number, which is what lets the script tell a list it
   * read whole from a list it read in part.
   *
   * How to update it, when Steam breaks it:
   *  1. open the wishlist, right-click one game → «Inspect»;
   *  2. find the element that wraps the whole line (image + title) and add its
   *     selector to `rows`, first in the list;
   *  3. check that the title, the image and the link inside it are still found
   *     by `title`, `image` and `appLink`; add selectors if they are not;
   *  4. reload and press "Collect the list". The report says how many rows
   *     were found and by which route, and how the scrolling element was found.
   */
  const STEAM = {
    /** Wishlist lives at /wishlist/profiles/<steamid64>/ and /wishlist/id/<vanity>/. */
    pathPattern: /^\/wishlist\/(profiles|id)\//i,

    /**
     * Hints for the element that actually scrolls. The lazy loading of the
     * wishlist is driven by its scroll event, so scrolling the wrong thing
     * loads nothing — and the page itself does not scroll at all, so the
     * mistake is silent.
     *
     * This is a list of hints and nothing more: when none of them fits,
     * `findScroller()` measures the ancestors of a row and takes the first one
     * that is taller inside than out. That is what has to survive the next
     * redesign, not the names below.
     */
    scrollers: ['#StoreTemplate', '#wishlist_ctn', '.wishlist_ctn', '#page_content', '[class*="WishlistScroll"]'],

    /** One wishlist entry, the whole line. */
    rows: [
      '[data-rfd-draggable-id]', // current layout: the drag and drop anchor
      '.wishlist_row', // classic layout
      '[id^="wishlist_row_"]', // same layout, addressed by id
      '[data-appid][class*="wishlist" i]',
      '[class*="WishlistRow"]',
      '[class*="wishlist_row"]',
    ],

    /** The attribute that carries both the app id and the row number. */
    draggableId: 'data-rfd-draggable-id',

    /**
     * `WishlistItem-294100-0` — a name, the app id, and the number of the row
     * in the whole list. The name is matched as "some word" rather than as
     * `WishlistItem` itself, so that renaming it does not break the parsing;
     * requiring a name at all is what keeps a draggable element of some other
     * kind from being read as a game.
     */
    draggableIdPattern: /^([A-Za-z][A-Za-z0-9_]*)-(\d{1,10})(?:-(\d{1,7}))?$/,

    /** Attributes that may carry the app id directly. */
    appIdAttributes: ['data-app-id', 'data-appid', 'data-ds-appid'],

    /** `id="wishlist_row_440"` — the classic layout writes the id right there. */
    appIdFromElementId: /^wishlist_row_(\d+)$/i,

    /** A link to the store page; the app id is parsed out of its href. */
    appLink: 'a[href*="/app/"]',

    /** The title of the game inside a row. */
    titles: ['.title', 'a.title', '[class*="title" i]', 'h2', 'h3'],

    /** The capsule image inside a row. */
    images: ['img.capsule', 'img[src*="/apps/"]', 'img[src*="steamstatic"]', 'img'],

    /**
     * Small label that marks the entry as downloadable content. Steam does not
     * always show one; when nothing matches, the kind stays `unknown`, which is
     * honest — the application treats it as "not known", not as "a game".
     */
    kindLabels: ['.dlc_flag', '[class*="dlc" i]', '.app_type', '[class*="AppType"]'],

    /** Header that says how many games the wishlist holds, used as a checksum. */
    counters: ['#wishlist_count', '.wishlist_count', '[class*="WishlistCount"]', '.pageheader'],
  };

  // ==========================================================================
  // Limits
  // ==========================================================================

  /** Hard stop for the whole collection, so a broken page cannot spin forever. */
  const TIME_BUDGET_MS = 180_000;

  /** Hard stop on the number of scroll steps, for the same reason. */
  const MAX_SCROLL_STEPS = 800;

  /** How long one step waits for new rows to appear before it gives up. */
  const GROWTH_TIMEOUT_MS = 2000;

  /** Poll interval while waiting for the page to load more rows. */
  const POLL_MS = 100;

  /** How many idle steps at the bottom mean the list really has ended. */
  const STABLE_STEPS_AT_BOTTOM = 3;

  /** Fraction of the viewport one scroll step covers. */
  const SCROLL_STEP_RATIO = 0.8;

  /** How much taller than its own box an element must be to count as scrolling. */
  const SCROLL_SLACK_PX = 40;

  /** Format written into the file, so a reader knows what it is looking at. */
  const EXPORT_KIND = 'wishlist-export';
  const EXPORT_VERSION = 1;
  const APP_SIGNATURE = 'steam-wishlist-sorter';

  // ==========================================================================
  // DOM helpers
  // ==========================================================================

  /**
   * First element matching any of the candidate selectors.
   *
   * @param {ParentNode} root
   * @param {string[]} selectors
   * @returns {Element|null}
   */
  function pick(root, selectors) {
    for (const selector of selectors) {
      let found = null;
      try {
        found = root.querySelector(selector);
      } catch {
        // A selector that a future browser dislikes must not kill the run.
        continue;
      }
      if (found) return found;
    }
    return null;
  }

  /**
   * App id out of a store URL of any shape.
   *
   * @param {string} href
   * @returns {number|null}
   */
  function appIdFromHref(href) {
    const match = /\/app\/(\d+)/.exec(String(href ?? ''));
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Whether an element holds more than it shows — that is, whether scrolling it
   * would move anything.
   *
   * @param {Element|null} element
   * @returns {boolean}
   */
  function scrolls(element) {
    return Boolean(element) && element.scrollHeight > element.clientHeight + SCROLL_SLACK_PX;
  }

  /**
   * The scrolling element of the list, or `null` when the page itself scrolls.
   *
   * The selectors are tried first, and they are only a shortcut: an element is
   * accepted only if it really is taller inside than out and really holds the
   * rows. When none of them fits — which is what a redesign looks like from
   * here — the ancestors of a row are measured one by one and the nearest one
   * that scrolls is taken. That path needs no name of Steam's to keep working,
   * which is the whole point of having it.
   *
   * @param {Document} [doc]
   * @returns {{ scroller: Element|null, route: string }}
   */
  function findScroller(doc = document) {
    const { rows } = findRows(doc);

    for (const selector of STEAM.scrollers) {
      let candidate = null;
      try {
        candidate = doc.querySelector(selector);
      } catch {
        continue;
      }
      if (!scrolls(candidate)) continue;
      if (rows.length > 0 && !rows.some((row) => candidate.contains(row))) continue;
      return { scroller: candidate, route: selector };
    }

    for (const row of rows) {
      let current = row.parentElement;
      while (current && current !== doc.body && current !== doc.documentElement) {
        if (scrolls(current)) return { scroller: current, route: 'measured the ancestors of a row' };
        current = current.parentElement;
      }
    }

    return { scroller: null, route: 'the page itself' };
  }

  /**
   * The app id and the row number out of `data-rfd-draggable-id`.
   *
   * The number is the place of the row in the whole wishlist, not in the part
   * of it that happens to be in the markup — which is what makes it the one
   * thing on this page that says how long the list really is.
   *
   * @param {unknown} value
   * @returns {{ appId: number, index: number|null }|null} `null` for anything
   *   that is not of that shape, an empty attribute and a missing one included.
   */
  function parseDraggableId(value) {
    const match = STEAM.draggableIdPattern.exec(String(value ?? '').trim());
    if (!match) return null;

    const appId = Number(match[2]);
    if (!Number.isSafeInteger(appId) || appId <= 0) return null;

    const index = match[3] === undefined ? null : Number(match[3]);
    return { appId, index: Number.isSafeInteger(index) && index >= 0 ? index : null };
  }

  /**
   * The number of a row in the whole list, when the page states one.
   *
   * @param {Element} row
   * @returns {number|null}
   */
  function readRowIndex(row) {
    return parseDraggableId(row.getAttribute?.(STEAM.draggableId))?.index ?? null;
  }

  /**
   * Rows currently present in the DOM, together with the route they were found
   * by — the report tells the user whether the known selectors still work.
   *
   * @param {Document} [doc]
   * @returns {{ rows: Element[], route: string }}
   */
  function findRows(doc = document) {
    for (const selector of STEAM.rows) {
      let found = [];
      try {
        found = [...doc.querySelectorAll(selector)];
      } catch {
        continue;
      }
      const usable = found.filter((row) => readAppId(row) !== null);
      if (usable.length > 0) return { rows: usable, route: selector };
    }

    // Nothing known matched. Fall back to the one thing every layout must have:
    // a link to the store page of the game. The row is then the highest
    // ancestor that still contains exactly this one link.
    const links = [...doc.querySelectorAll(STEAM.appLink)].filter(
      (link) => appIdFromHref(link.getAttribute('href')) !== null,
    );
    const rows = new Set();
    for (const link of links) {
      const row = rowAroundLink(link);
      if (row) rows.add(row);
    }
    return { rows: [...rows], route: rows.size > 0 ? 'fallback parsing by /app/ links' : 'nothing' };
  }

  /**
   * Climbs from a store link to the element that looks like the whole row: the
   * last ancestor that still holds exactly one app link.
   *
   * @param {Element} link
   * @returns {Element|null}
   */
  function rowAroundLink(link) {
    let current = link;
    let best = null;
    for (let depth = 0; depth < 8 && current.parentElement; depth += 1) {
      current = current.parentElement;
      if (current.tagName === 'BODY' || current.tagName === 'HTML') break;
      const links = current.querySelectorAll(STEAM.appLink);
      const ids = new Set(
        [...links].map((item) => appIdFromHref(item.getAttribute('href'))).filter((id) => id !== null),
      );
      if (ids.size !== 1) break;
      best = current;
    }
    return best;
  }

  /**
   * App id of a row: from the drag and drop anchor, from an attribute, from the
   * element id, or from the link.
   *
   * @param {Element} row
   * @returns {number|null}
   */
  function readAppId(row) {
    const dragged = parseDraggableId(row.getAttribute?.(STEAM.draggableId));
    if (dragged) return dragged.appId;

    for (const attribute of STEAM.appIdAttributes) {
      const value = row.getAttribute?.(attribute);
      if (value) {
        const parsed = Number(String(value).trim());
        if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
      }
    }

    const idMatch = STEAM.appIdFromElementId.exec(row.id ?? '');
    if (idMatch) return Number(idMatch[1]);

    const link = row.matches?.(STEAM.appLink) ? row : row.querySelector(STEAM.appLink);
    return link ? appIdFromHref(link.getAttribute('href')) : null;
  }

  /**
   * Title of a row. Falls back to the text of the store link and then to the
   * alt text of the capsule; an empty result is fine, the application shows
   * `App <id>` for it and a later import fills the real name in.
   *
   * @param {Element} row
   * @param {number} appId
   * @returns {string}
   */
  function readTitle(row, appId) {
    const node = pick(row, STEAM.titles);
    const fromNode = node ? node.textContent.trim() : '';
    if (fromNode) return fromNode;

    const link = row.querySelector(STEAM.appLink);
    const fromLink = link ? link.textContent.trim() : '';
    if (fromLink && !/^\s*\d+\s*$/.test(fromLink)) return fromLink;

    const image = pick(row, STEAM.images);
    const fromAlt = image?.getAttribute('alt')?.trim() ?? '';
    if (fromAlt) return fromAlt;

    return `App ${appId}`;
  }

  /**
   * Capsule image of a row, preferring the one that belongs to this very app —
   * a row may also contain an icon of a bundle or of a base game.
   *
   * @param {Element} row
   * @param {number} appId
   * @returns {string}
   */
  function readImageUrl(row, appId) {
    const images = [...row.querySelectorAll('img')];
    const own = images.find((image) => (image.currentSrc || image.src || '').includes(`/${appId}/`));
    const chosen = own ?? images.find((image) => image.currentSrc || image.src);
    const source = chosen ? chosen.currentSrc || chosen.src : '';
    return source.split('?')[0];
  }

  /**
   * Kind of the entry. Only an explicit marker counts: guessing "game" for
   * everything without a marker would put wrong data into the export, and the
   * application has a real `unknown` for exactly this case.
   *
   * @param {Element} row
   * @returns {'game'|'dlc'|'unknown'}
   */
  function readKind(row) {
    const typeAttribute = row.getAttribute?.('data-app-type') ?? row.getAttribute?.('data-apptype');
    if (typeAttribute) {
      const text = typeAttribute.trim().toLowerCase();
      if (text.includes('dlc')) return 'dlc';
      if (text.includes('game')) return 'game';
    }

    const label = pick(row, STEAM.kindLabels);
    if (label) {
      const text = label.textContent.trim().toLowerCase();
      if (text.includes('dlc') || text.includes('downloadable content')) return 'dlc';
      // The page speaks the language of the store, so the label is matched in
      // both: this is text Steam wrote, not text this script owns.
      if (text === 'game' || text === 'игра') return 'game';
    }

    // A standalone "DLC" badge, whatever class it happens to carry today.
    const badge = [...row.querySelectorAll('span, div, i')].some(
      (node) => node.children.length === 0 && node.textContent.trim().toUpperCase() === 'DLC',
    );
    return badge ? 'dlc' : 'unknown';
  }

  /**
   * Vertical position of a row inside the scrolled content.
   *
   * Only the layouts that number no rows are ordered by this. On the current
   * page a coordinate says where a row sits among the sixteen that happen to be
   * in the markup right now, and nothing at all about where it sits in a list
   * of a hundred and sixty six — so there the number of the row decides, and
   * this is only the tie-breaker for whatever carries no number.
   *
   * @param {Element} row
   * @param {Element|null} scroller `null` when the page itself scrolls.
   * @returns {number}
   */
  function readOffset(row, scroller) {
    const rect = row.getBoundingClientRect();
    if (!scroller) return rect.top + window.scrollY;
    const box = scroller.getBoundingClientRect();
    return rect.top - box.top + scroller.scrollTop;
  }

  // ==========================================================================
  // Order and completeness
  // ==========================================================================

  /**
   * Puts the rows that were read into the order the wishlist shows them in, and
   * says whether that is the whole wishlist.
   *
   * The order comes from the number in `data-rfd-draggable-id` whenever the
   * page states one, never from the coordinates: the list is virtualized, and
   * a coordinate describes only the handful of rows currently rendered.
   *
   * The completeness comes from the same numbers. The highest number the page
   * ever showed plus one is how many entries the wishlist has, so a gap in
   * `0 … max` is a row that was never read — and a list with a gap in it is a
   * failure, not a result. On a layout that numbers nothing there is no such
   * arithmetic and `complete` is `null`: the scrolling having reached the
   * bottom is all that can be said there.
   *
   * @param {Array<{ appId: number, index: number|null, offset: number, seq: number }>} entries
   * @returns {{ entries: object[], expectedTotal: number|null, missingIndexes: number[],
   *             complete: boolean|null, numbered: number, unnumbered: number }}
   */
  function buildPageOrder(entries) {
    const ordered = [...entries].sort((a, b) => {
      if (a.index !== null && b.index !== null) return a.index - b.index || a.seq - b.seq;
      // A row without a number cannot be placed among the numbered ones, so it
      // goes after them rather than into an invented spot.
      if (a.index !== null) return -1;
      if (b.index !== null) return 1;
      return a.offset - b.offset || a.seq - b.seq;
    });

    const numbers = new Set(ordered.filter((entry) => entry.index !== null).map((entry) => entry.index));
    const unnumbered = ordered.length - numbers.size;

    if (numbers.size === 0) {
      return {
        entries: ordered,
        expectedTotal: null,
        missingIndexes: [],
        complete: null,
        numbered: 0,
        unnumbered,
      };
    }

    const expectedTotal = Math.max(...numbers) + 1;
    const missingIndexes = [];
    for (let index = 0; index < expectedTotal; index += 1) {
      if (!numbers.has(index)) missingIndexes.push(index);
    }

    return {
      entries: ordered,
      expectedTotal,
      missingIndexes,
      complete: missingIndexes.length === 0,
      numbered: numbers.size,
      unnumbered,
    };
  }

  /**
   * The one verdict on a page read: may what was collected be used at all.
   *
   * This exists as a function of its own, and every caller goes through it,
   * because the failure it guards against is the quiet one. A wishlist of a
   * hundred and sixty six entries read as fourteen looks like a perfectly good
   * list of fourteen games — there is nothing in it to notice. So the verdict
   * is taken once, in words, and both the file and the write hang off it.
   *
   * @param {{ collected: number, expectedTotal: number|null, missingIndexes?: number[],
   *           reachedBottom: boolean, timedOut: boolean, cancelled?: boolean }} read
   * @returns {{ ok: boolean, reason: string|null, message: string }}
   */
  function judgePageRead({
    collected,
    expectedTotal,
    missingIndexes = [],
    reachedBottom,
    timedOut,
    cancelled = false,
  }) {
    if (collected === 0) {
      return {
        ok: false,
        reason: 'empty',
        message: 'Not a single wishlist row was found on the page.',
      };
    }
    if (cancelled) {
      return {
        ok: false,
        reason: 'cancelled',
        message: `The reading was stopped by hand after ${collected}, so this is a part of the wishlist and not the whole of it.`,
      };
    }
    if (expectedTotal !== null && missingIndexes.length > 0) {
      return {
        ok: false,
        reason: 'gaps',
        message:
          `The page numbers its rows, and the numbering says the wishlist holds ${expectedTotal} ` +
          `${plural(expectedTotal, 'entry', 'entries')}. ${collected} were read, and ` +
          `${missingIndexes.length} of the numbers never appeared — the first one missing is ` +
          `#${missingIndexes[0] + 1}. The list is incomplete.`,
      };
    }
    if (timedOut) {
      return {
        ok: false,
        reason: 'timeout',
        message:
          `Reading the page ran into its limit on time or on scroll steps after ${collected} ` +
          `${plural(collected, 'entry', 'entries')}, so the list may be a part of the wishlist.`,
      };
    }
    if (!reachedBottom) {
      return {
        ok: false,
        reason: 'no-bottom',
        message:
          `The bottom of the list was never reached, so the ${collected} ` +
          `${plural(collected, 'entry', 'entries')} read may be a part of the wishlist.`,
      };
    }
    if (expectedTotal === null) {
      return {
        ok: true,
        reason: 'unnumbered',
        message:
          `${collected} ${plural(collected, 'entry was', 'entries were')} read. This layout numbers no ` +
          'rows, so nothing but the scrolling having reached the bottom vouches for the list being whole.',
      };
    }
    return {
      ok: true,
      reason: null,
      message: `All ${expectedTotal} ${plural(expectedTotal, 'entry', 'entries')} the page numbers were read.`,
    };
  }

  /**
   * The number of entries Steam itself claims the wishlist has, when the page
   * says it anywhere. Used only as a checksum for the report.
   *
   * @returns {number|null}
   */
  function readExpectedCount() {
    for (const selector of STEAM.counters) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const match = /(\d[\d\s ]*)/.exec(node.textContent ?? '');
      if (!match) continue;
      const parsed = Number(match[1].replace(/[\s ]/g, ''));
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  // ==========================================================================
  // Collection
  // ==========================================================================

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * @param {Element|null} scroller `null` when the page itself scrolls.
   * @returns {{ top: number, height: number, view: number }}
   */
  function scrollMetrics(scroller) {
    if (!scroller) {
      const doc = document.scrollingElement ?? document.documentElement;
      return { top: window.scrollY, height: doc.scrollHeight, view: window.innerHeight };
    }
    return { top: scroller.scrollTop, height: scroller.scrollHeight, view: scroller.clientHeight };
  }

  /**
   * @param {Element|null} scroller `null` when the page itself scrolls.
   * @param {number} top
   */
  function scrollTo(scroller, top) {
    if (!scroller) window.scrollTo(0, top);
    else scroller.scrollTop = top;
  }

  /**
   * Walks the whole wishlist and returns every entry it saw.
   *
   * The loop is bounded three times over — by wall clock, by the number of
   * steps and by the "nothing new at the bottom" counter — because a page that
   * keeps growing while it is scrolled is exactly the shape of an endless loop.
   *
   * @param {(progress: { found: number, step: number }) => void} onProgress
   * @param {() => boolean} cancelled
   * @returns {Promise<{ items: object[], route: string, scrollerRoute: string, steps: number,
   *                     timedOut: boolean, cancelled: boolean, reachedBottom: boolean,
   *                     expectedTotal: number|null, missingIndexes: number[],
   *                     verdict: { ok: boolean, reason: string|null, message: string } }>}
   */
  async function collect(onProgress, cancelled) {
    const { scroller, route: scrollerRoute } = findScroller();
    const startedAt = Date.now();
    const restoreTop = scrollMetrics(scroller).top;

    /** @type {Map<number, { appId: number, title: string, url: string, imageUrl: string, kind: string, index: number|null, offset: number, seq: number }>} */
    const seen = new Map();
    let route = 'nothing';
    let steps = 0;
    let stable = 0;
    let timedOut = false;
    let stopped = false;
    let reachedBottom = false;

    /** Reads every row currently in the DOM into `seen`. */
    function harvest() {
      const found = findRows();
      if (found.rows.length > 0) route = found.route;
      for (const row of found.rows) {
        const appId = readAppId(row);
        if (appId === null) continue;
        const index = readRowIndex(row);
        const offset = readOffset(row, scroller);
        const known = seen.get(appId);
        if (known) {
          // The same row may be met again after a re-render; keep the newest
          // coordinate, it is the one the current layout uses.
          known.offset = offset;
          if (index !== null) known.index = index;
          if (known.title.startsWith('App ')) known.title = readTitle(row, appId);
          if (!known.imageUrl) known.imageUrl = readImageUrl(row, appId);
          if (known.kind === 'unknown') known.kind = readKind(row);
          continue;
        }
        seen.set(appId, {
          appId,
          title: readTitle(row, appId),
          url: `https://store.steampowered.com/app/${appId}/`,
          imageUrl: readImageUrl(row, appId),
          kind: readKind(row),
          index,
          offset,
          seq: seen.size,
        });
      }
    }

    harvest();
    onProgress({ found: seen.size, step: 0 });

    while (true) {
      if (cancelled()) {
        stopped = true;
        break;
      }
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      if (steps >= MAX_SCROLL_STEPS) {
        timedOut = true;
        break;
      }

      const before = seen.size;
      const metrics = scrollMetrics(scroller);
      const atBottom = metrics.top + metrics.view >= metrics.height - 2;

      scrollTo(scroller, atBottom ? metrics.height : metrics.top + metrics.view * SCROLL_STEP_RATIO);
      steps += 1;

      // Wait for the page to react: either new rows arrive or the scrollable
      // height grows. Both mean the lazy loading is still working.
      const waitStarted = Date.now();
      let grew = false;
      while (Date.now() - waitStarted < GROWTH_TIMEOUT_MS) {
        await sleep(POLL_MS);
        harvest();
        const now = scrollMetrics(scroller);
        if (seen.size > before || now.height > metrics.height) {
          grew = true;
          break;
        }
      }

      onProgress({ found: seen.size, step: steps });

      if (atBottom && !grew) {
        stable += 1;
        reachedBottom = true;
        if (stable >= STABLE_STEPS_AT_BOTTOM) break;
      } else {
        stable = 0;
        reachedBottom = false;
      }
    }

    harvest();
    scrollTo(scroller, restoreTop);

    const order = buildPageOrder([...seen.values()]);
    const items = order.entries.map((entry, index) => ({
      appId: entry.appId,
      title: entry.title,
      url: entry.url,
      imageUrl: entry.imageUrl,
      wishlistPosition: index + 1,
      kind: entry.kind,
    }));

    return {
      items,
      route,
      scrollerRoute,
      steps,
      timedOut,
      cancelled: stopped,
      reachedBottom,
      expectedTotal: order.expectedTotal,
      missingIndexes: order.missingIndexes,
      verdict: judgePageRead({
        collected: items.length,
        expectedTotal: order.expectedTotal,
        missingIndexes: order.missingIndexes,
        reachedBottom,
        timedOut,
        cancelled: stopped,
      }),
    };
  }

  // ==========================================================================
  // The file
  // ==========================================================================

  /**
   * @param {object[]} items
   * @returns {string}
   */
  function buildJson(items) {
    const payload = {
      app: APP_SIGNATURE,
      kind: EXPORT_KIND,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      source: 'steam-wishlist-page',
      count: items.length,
      items,
    };
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  /**
   * Hands the text to the browser as a file. The `blob:` URL lives in this tab
   * and is revoked right after the click, so nothing is uploaded anywhere.
   *
   * @param {string} text
   * @param {string} name
   */
  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ==========================================================================
  // Panel
  // ==========================================================================

  const PANEL_CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      width: 340px; max-width: calc(100vw - 32px);
      background: #12181f; color: #d6dde6; border: 1px solid #2a3542; border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.55);
      font: 13px/1.45 "Segoe UI", Arial, sans-serif;
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2a3542; }
    .head b { font-size: 13px; font-weight: 600; color: #eef3f8; flex: 1; }
    .body { padding: 12px; display: grid; gap: 10px; }
    .status { white-space: pre-wrap; }
    .muted { color: #8b97a5; }
    .warn { color: #ffcc66; }
    .error { color: #ff8f8f; }
    .ok { color: #96d67a; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      font: inherit; padding: 7px 12px; border-radius: 6px; cursor: pointer;
      border: 1px solid #33475c; background: #1b2733; color: #d6dde6;
    }
    button:hover:not(:disabled) { background: #223141; }
    button:disabled { opacity: .5; cursor: default; }
    button.primary { background: #2d6ea8; border-color: #3b86c6; color: #fff; }
    button.primary:hover:not(:disabled) { background: #3480c1; }
    .close { border: 0; background: transparent; color: #8b97a5; padding: 2px 6px; }
    ul { margin: 0; padding-left: 18px; }
    .box { border: 1px solid #2a3542; border-radius: 8px; padding: 10px; display: grid; gap: 8px; background: #17202a; }
    .box.alert { border-color: #6b4a2a; background: #1d1a16; }
    label.check { display: flex; gap: 8px; align-items: flex-start; color: #8b97a5; cursor: pointer; }
  `;

  /** Builds the floating panel inside a shadow root, so Steam CSS cannot touch it. */
  function createPanel() {
    const host = document.createElement('div');
    host.id = 'sws-export-host';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="panel">
        <div class="head">
          <b>Wishlist Sorter — export</b>
          <button class="close" type="button" title="Close">✕</button>
        </div>
        <div class="body">
          <div class="status muted">Press “Collect the list”: the page scrolls itself so that every item loads.</div>
          <div class="row">
            <button class="primary" type="button" data-act="run">Collect the list</button>
            <button type="button" data-act="stop" disabled>Stop</button>
            <button type="button" data-act="save" disabled>Download JSON</button>
          </div>

          <div class="box alert" data-act="partial-box" hidden>
            <div class="warn"><b>Only a part of the wishlist was read.</b></div>
            <div class="muted">
              A file made of a part looks exactly like a file made of the whole — nothing in it says
              which it is. Read the line above, scroll the wishlist to the very end by hand and
              collect it again. The file stays out of reach until you say you want it anyway.
            </div>
            <label class="check">
              <input type="checkbox" data-act="accept-partial">
              <span>Hand the file over anyway — I know the list is incomplete</span>
            </label>
          </div>
        </div>
      </div>
    `;
    document.body.append(host);

    const query = (selector) => shadow.querySelector(selector);
    query('.close').addEventListener('click', () => host.remove());

    return {
      run: query('[data-act="run"]'),
      stop: query('[data-act="stop"]'),
      save: query('[data-act="save"]'),
      partialBox: query('[data-act="partial-box"]'),
      acceptPartial: query('[data-act="accept-partial"]'),
      status: query('.status'),
      /**
       * @param {string} html
       * @param {'muted'|'ok'|'warn'|'error'} tone
       */
      say(html, tone = 'muted') {
        const status = query('.status');
        status.className = `status ${tone}`;
        status.innerHTML = html;
      },
    };
  }

  /**
   * The English plural of a word, for the counted lines of the report.
   *
   * @param {number} count
   * @param {string} one
   * @param {string} many
   * @returns {string}
   */
  function plural(count, one, many) {
    return Math.abs(count) === 1 ? one : many;
  }

  /** Escapes text that goes into the panel through `innerHTML`. */
  const escapeHtml = (text) =>
    String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

  // ==========================================================================
  // The half that needs no browser, for the tests
  // ==========================================================================

  /**
   * `node --test` loads this file too. Everything that reads the page takes the
   * document it should read as an argument, so the tests hand it a mock of the
   * markup instead — the current virtualized page and the older one — and check
   * what the script makes of each. In Node there is no `document`, and this is
   * where the script stops: on the wishlist page the branch is never taken and
   * nothing is published into the page.
   */
  if (typeof document === 'undefined') {
    globalThis.__swsExportTestApi = {
      STEAM,
      appIdFromHref,
      buildJson,
      buildPageOrder,
      findRows,
      findScroller,
      judgePageRead,
      parseDraggableId,
      readAppId,
      readImageUrl,
      readKind,
      readOffset,
      readRowIndex,
      readTitle,
    };
    return;
  }

  // ==========================================================================
  // Entry point
  // ==========================================================================

  if (!STEAM.pathPattern.test(location.pathname)) return;

  const panel = createPanel();
  let cancelled = false;
  let payload = '';

  panel.stop.addEventListener('click', () => {
    cancelled = true;
    panel.stop.disabled = true;
  });

  panel.save.addEventListener('click', () => {
    if (!payload) return;
    const stamp = new Date().toISOString().slice(0, 10);
    // A list that was read in part says so in the name of the file: the panel
    // is closed and forgotten long before the file is opened again.
    const partial = panel.partialBox.hidden ? '' : '-partial';
    download(payload, `steam-wishlist-${stamp}${partial}.json`);
  });

  /**
   * The file is offered only for a list that was read whole, and for an
   * incomplete one only after the user has said out loud that they want it.
   */
  function updateSaveButton() {
    panel.save.disabled = !payload || (!panel.partialBox.hidden && !panel.acceptPartial.checked);
  }

  panel.acceptPartial.addEventListener('change', updateSaveButton);

  panel.run.addEventListener('click', async () => {
    cancelled = false;
    payload = '';
    panel.run.disabled = true;
    panel.save.disabled = true;
    panel.stop.disabled = false;
    panel.partialBox.hidden = true;
    panel.acceptPartial.checked = false;
    panel.say('Scrolling the page…');

    const expected = readExpectedCount();
    let result;
    try {
      result = await collect(
        ({ found, step }) =>
          panel.say(
            `Scrolling the page: <b>${found}</b> ${plural(found, 'item', 'items')} collected` +
              `<br><span class="muted">step ${step}, the page scrolls itself — do not touch it</span>`,
          ),
        () => cancelled,
      );
    } catch (error) {
      panel.say(
        `The collection stopped with an error: ${escapeHtml(error.message)}.<br>` +
          'Reload the page and try again; if it keeps happening, the layout of Steam has changed — ' +
          'update the <b>STEAM</b> object at the top of the userscript.',
        'error',
      );
      panel.run.disabled = false;
      panel.stop.disabled = true;
      return;
    }

    panel.run.disabled = false;
    panel.stop.disabled = true;

    // Nothing at all: the selectors no longer match. Stop here — an empty file
    // that looks like a successful export is worse than an honest refusal.
    if (result.items.length === 0) {
      panel.say(
        'Not a single item was found on the page.<br>' +
          'Most likely Steam has changed the layout of the wishlist. No file was created.<br>' +
          '<span class="muted">What to do: open the userscript, find the <b>STEAM</b> object at the top of ' +
          'the file and update the <b>rows</b> / <b>titles</b> selectors — the instructions are right there. ' +
          'The way around the userscript is described in the README of the project.</span>',
        'error',
      );
      return;
    }

    payload = buildJson(result.items);

    const found = result.items.length;
    const lines = [
      `<b>${found}</b> ${plural(found, 'item', 'items')} collected.`,
      `<span class="muted">Parsing: ${escapeHtml(result.route)}; scrolling: ` +
        `${escapeHtml(result.scrollerRoute)}; steps: ${result.steps}.</span>`,
    ];

    // The verdict on the reading comes first, because it is the one line that
    // decides whether the rest of the report describes a wishlist or a slice of
    // one. It is never left out and never softened.
    let tone = result.verdict.ok ? 'ok' : 'error';
    lines.push(
      result.verdict.ok ? `<span class="muted">${result.verdict.message}</span>` : `<b>${result.verdict.message}</b>`,
    );
    if (result.verdict.ok && result.verdict.reason === 'unnumbered') tone = 'warn';

    if (!result.verdict.ok) {
      panel.partialBox.hidden = false;
      lines.push(
        '<span class="muted">The page loads its rows as it is scrolled, so a reading that stopped early ' +
          'sees a slice of the list. Scroll the wishlist to the very end by hand and press “Collect the ' +
          'list” again.</span>',
      );
    }

    if (expected !== null && expected !== found) {
      if (tone === 'ok') tone = 'warn';
      lines.push(
        `Steam says there are <b>${expected}</b> on this page, and <b>${found}</b> were collected. ` +
          'Scroll the list to the very end by hand and run the collection again.',
      );
    }

    const unknown = result.items.filter((item) => item.kind === 'unknown').length;
    if (unknown > 0) {
      lines.push(
        `<span class="muted">${unknown} ${plural(unknown, 'item has', 'items have')} no type: the page ` +
          'shows no “DLC” mark for them. That is fine — the application calls such a type unknown ' +
          'instead of inventing one.</span>',
      );
    }

    if (result.verdict.ok) lines.push('Press “Download JSON” and load the file into Steam Wishlist Sorter.');
    panel.say(lines.join('<br>'), tone);
    updateSaveButton();
  });
})();
