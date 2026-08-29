// ==UserScript==
// @name         Steam Wishlist Sorter — carry the order into Steam
// @namespace    https://github.com/Akynin99/Steam-Wishlist-Sorter
// @version      3.0.0
// @description  Reads the final JSON of Steam Wishlist Sorter and writes that order into the Steam wishlist: a report first, a backup file second, then one single request. Entries marked for removal are only listed, never deleted.
// @author       Akynin99
// @license      MIT
// @homepageURL  https://github.com/Akynin99/Steam-Wishlist-Sorter
// @match        https://store.steampowered.com/wishlist/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Writes the order produced by Steam Wishlist Sorter into the Steam wishlist.
 *
 * ## How the order is written
 *
 * Dragging a row on the wishlist page sends
 *
 *     POST https://store.steampowered.com/wishlist/action
 *     Content-Type: application/json; charset=utf-8
 *     { "m": "Reorder", "mp": [ [ { "appid": 1509510, "priority": 2 }, … ] ] }
 *
 * and is answered with `{ "data": { "result": 1 } }`. This script sends the
 * same request, once, with the list it built out of the file and the page. The
 * endpoint is not documented and not supported by Valve: it is what the page
 * itself uses, and it may change without a word.
 *
 * `mp` is an array holding **one** element, and that element is the list of
 * pairs. The double brackets are not a typo — they are what was read off a live
 * drag, and a body shaped any other way is not the request the page sends.
 *
 * The list is sent **whole**. A partial list is not a partial reorder — Steam
 * spreads the entries it was given through the ones it was not, and the result
 * is a shuffle nobody asked for.
 *
 * ## What `priority` means
 *
 * A straight numbering of the entries the user has arranged by hand, from one
 * upwards. Entries never arranged sit at the end with `priority: 0` and no
 * number of their own — on the account this was read off, 166 entries were 76
 * with the priorities 1…76 and 90 with a zero.
 *
 * This script numbers the whole list, 1…N, in the order it is sending. That is
 * a one-way step and it is said out loud in the panel: after the write every
 * entry has a priority, including the ones that had none. The backup brings the
 * order back; it cannot bring back "never arranged".
 *
 * ## What proves the right to write
 *
 * Nothing this script holds. There is no `sessionid` and no `access_token` in
 * the body: the address is the origin the page was loaded from, so the browser
 * attaches the cookie of the signed-in account itself, and Steam writes into
 * the wishlist of that account. There is no `@connect` and no `@grant`, so the
 * script could not reach another host even if it tried.
 *
 * ## Whose wishlist is being written
 *
 * The one the browser is signed in as — the address names no account, so there
 * is nothing to aim. The page is still read for the account it belongs to, and
 * the report says which one it found: a wishlist that is not yours is a list of
 * somebody else's app ids, and writing it would put their entries at the top of
 * your own. That is a line in the report and not a lock, because the account is
 * a courtesy here and no longer the thing being addressed. The one case still
 * refused outright is the certain one: a numeric address naming one account
 * while the page says you are signed in as another.
 *
 * ## What it refuses to do
 *
 *  - it deletes nothing. The entries the user marked as "remove from the
 *    wishlist" are put at the end of the order and listed in the panel — taking
 *    them off is a click of theirs, because a deletion cannot be undone;
 *  - it loses nothing. An entry that is on the page but not in the file keeps
 *    its place relative to the other such entries and is appended after the
 *    ordered part, so nothing silently falls out of the wishlist;
 *  - it writes nothing built on a page it read only in part. The list is
 *    virtualized, so a reading that goes wrong yields a shorter list rather
 *    than an error, and an order built on a shorter list is not a partial
 *    order — Steam takes the list whole and scatters everything left out of
 *    it. The rows of the current page are numbered, so the script knows how
 *    many there should be, and a reading that came back with fewer ends the
 *    matter: no checkbox, no "anyway";
 *  - it writes nothing before the user confirms the write in a separate step,
 *    with the backup of the current order one button away.
 */

(() => {
  'use strict';

  // ==========================================================================
  // Steam adapter
  // ==========================================================================

  /**
   * Selectors of the wishlist page. Deliberately a copy of the object in
   * `steam-wishlist-export.user.js`: a userscript is a single standalone file
   * that Tampermonkey loads on its own, so the two cannot share a module. When
   * Steam changes its layout, both files have to be updated — they are next to
   * each other in `userscripts/` for exactly that reason.
   *
   * How to update it is written out in the export script, under the same
   * object; the fields mean the same here.
   */
  const STEAM = {
    pathPattern: /^\/wishlist\/(profiles|id)\//i,
    scrollers: ['#StoreTemplate', '#wishlist_ctn', '.wishlist_ctn', '#page_content', '[class*="WishlistScroll"]'],
    rows: [
      '[data-rfd-draggable-id]',
      '.wishlist_row',
      '[id^="wishlist_row_"]',
      '[data-appid][class*="wishlist" i]',
      '[class*="WishlistRow"]',
      '[class*="wishlist_row"]',
    ],
    draggableId: 'data-rfd-draggable-id',
    draggableIdPattern: /^([A-Za-z][A-Za-z0-9_]*)-(\d{1,10})(?:-(\d{1,7}))?$/,
    appIdAttributes: ['data-app-id', 'data-appid', 'data-ds-appid'],
    appIdFromElementId: /^wishlist_row_(\d+)$/i,
    appLink: 'a[href*="/app/"]',
    titles: ['.title', 'a.title', '[class*="title" i]', 'h2', 'h3'],
    images: ['img.capsule', 'img[src*="/apps/"]', 'img[src*="steamstatic"]', 'img'],
  };

  /** The one origin every request of this script goes to — the page's own. */
  const STEAM_ORIGIN = 'https://store.steampowered.com';

  /**
   * The one address this script writes to. It is a constant and not something
   * built out of anything read: the endpoint names no account, so there is no
   * user value that could end up inside an address here.
   */
  const REORDER_URL = `${STEAM_ORIGIN}/wishlist/action`;

  /** Same bounds as the export script: the page must never spin forever. */
  const TIME_BUDGET_MS = 180_000;
  const MAX_SCROLL_STEPS = 800;
  const GROWTH_TIMEOUT_MS = 2000;
  const POLL_MS = 100;
  const STABLE_STEPS_AT_BOTTOM = 3;
  const SCROLL_STEP_RATIO = 0.8;
  const SCROLL_SLACK_PX = 40;

  /** The file this script accepts, as `src/export.js` writes it. */
  const ORDER_KIND = 'wishlist-order';
  const ORDER_VERSION = 1;
  const APP_SIGNATURE = 'steam-wishlist-sorter';

  /** Attribute the badges are marked with, so they can all be removed again. */
  const BADGE_ATTRIBUTE = 'data-sws-badge';

  /**
   * Where the order that was sent waits for the reload the check needs.
   *
   * The wishlist page does not redraw itself after the request — the new order
   * shows up on a reload, and a reload takes the panel with it. So the list of
   * app ids that was sent is left in `sessionStorage`, which dies with the tab,
   * and the script picks it up on the next load and compares. The value holds
   * app ids and a timestamp, and nothing else: there is no secret in this
   * script to leak into it.
   */
  const CHECK_KEY = 'sws-reorder-check';

  /** How long a pending check stays interesting; older than that is stale. */
  const CHECK_TTL_MS = 60 * 60 * 1000;

  // ==========================================================================
  // Page reading
  // ==========================================================================

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
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
        continue;
      }
      if (found) return found;
    }
    return null;
  }

  /**
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
   * Whether an element holds more than it shows.
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
   * The selectors are a shortcut and nothing more: a candidate is taken only if
   * it really scrolls and really holds the rows, and when none of them fits the
   * ancestors of a row are measured instead. Scrolling the wrong element loads
   * nothing and says nothing, which is how a wishlist of a hundred and sixty
   * six entries is read as fourteen.
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
   * The app id and the row number out of `data-rfd-draggable-id`, whose value
   * looks like `WishlistItem-294100-0`.
   *
   * The number is the place of the row in the whole wishlist rather than in the
   * handful of rows the virtualized list keeps in the markup, which is what
   * lets the script tell a list it read whole from a list it read in part.
   *
   * @param {unknown} value
   * @returns {{ appId: number, index: number|null }|null}
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
   * @param {Element} row
   * @returns {number|null}
   */
  function readRowIndex(row) {
    return parseDraggableId(row.getAttribute?.(STEAM.draggableId))?.index ?? null;
  }

  /**
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
   * Title of a row, for the backup file. An empty result is fine: the file then
   * carries `App <id>`, which is exactly what the application shows for an
   * entry whose name it does not know.
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
   * @param {Element} link
   * @returns {Element|null}
   */
  function rowAroundLink(link) {
    let current = link;
    let best = null;
    for (let depth = 0; depth < 8 && current.parentElement; depth += 1) {
      current = current.parentElement;
      if (current.tagName === 'BODY' || current.tagName === 'HTML') break;
      const ids = new Set(
        [...current.querySelectorAll(STEAM.appLink)]
          .map((item) => appIdFromHref(item.getAttribute('href')))
          .filter((id) => id !== null),
      );
      if (ids.size !== 1) break;
      best = current;
    }
    return best;
  }

  /**
   * Rows currently in the DOM.
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

    const rows = new Set();
    for (const link of doc.querySelectorAll(STEAM.appLink)) {
      if (appIdFromHref(link.getAttribute('href')) === null) continue;
      const row = rowAroundLink(link);
      if (row) rows.add(row);
    }
    return { rows: [...rows], route: rows.size > 0 ? 'fallback parsing by /app/ links' : 'nothing' };
  }

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

  // ==========================================================================
  // Order and completeness
  // ==========================================================================

  /**
   * Puts the rows that were read into the order the wishlist shows them in, and
   * says whether that is the whole wishlist.
   *
   * The order comes from the number in `data-rfd-draggable-id` whenever the
   * page states one, never from the coordinates: the list is virtualized, and a
   * coordinate describes only the handful of rows currently rendered.
   *
   * The completeness comes from the same numbers. The highest number the page
   * ever showed plus one is how many entries the wishlist has, so a gap in
   * `0 … max` is a row that was never read. On a layout that numbers nothing
   * there is no such arithmetic and `complete` is `null`.
   *
   * A copy of the function of the same name in the export script, for the same
   * reason the selectors are a copy: a userscript is a file of its own.
   *
   * @param {Array<{ appId: number, index: number|null, offset: number, seq: number }>} entries
   * @returns {{ entries: object[], expectedTotal: number|null, missingIndexes: number[],
   *             complete: boolean|null, numbered: number, unnumbered: number }}
   */
  function buildPageOrder(entries) {
    const ordered = [...entries].sort((a, b) => {
      if (a.index !== null && b.index !== null) return a.index - b.index || a.seq - b.seq;
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
   * Every caller goes through it, because the failure it guards against is the
   * quiet one. A wishlist of a hundred and sixty six entries read as fourteen
   * looks like a perfectly good list of fourteen games; an order built out of
   * it and written into Steam would scatter the other hundred and fifty two.
   * So the verdict is taken once, in words, and the write hangs off it.
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
   * Walks the whole list and returns the app ids it is made of, in the order
   * they are shown, together with the titles the backup file needs. Reading the
   * page changes nothing on it, so this runs before any confirmation — a report
   * needs real numbers to be worth anything.
   *
   * @param {(found: number) => void} onProgress
   * @returns {Promise<{ appIds: number[], titles: Map<number, string>, duplicates: number[],
   *                     route: string, scrollerRoute: string, timedOut: boolean,
   *                     reachedBottom: boolean, expectedTotal: number|null,
   *                     missingIndexes: number[],
   *                     verdict: { ok: boolean, reason: string|null, message: string } }>}
   */
  async function scanPage(onProgress) {
    const { scroller, route: scrollerRoute } = findScroller();
    const startedAt = Date.now();
    const restoreTop = scrollMetrics(scroller).top;

    /** @type {Map<number, { appId: number, index: number|null, offset: number, seq: number }>} */
    const seen = new Map();
    /** @type {Map<number, string>} */
    const titles = new Map();
    /** @type {number[]} */
    const duplicates = [];
    let route = 'nothing';
    let steps = 0;
    let stable = 0;
    let timedOut = false;
    let reachedBottom = false;

    function harvest() {
      const found = findRows();
      if (found.rows.length > 0) route = found.route;
      /** @type {Set<number>} ids met in this very pass, to spot real duplicates */
      const pass = new Set();
      for (const row of found.rows) {
        const appId = readAppId(row);
        if (appId === null) continue;
        const rect = row.getBoundingClientRect();
        const offset = scroller
          ? rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop
          : rect.top + window.scrollY;
        if (pass.has(appId) && !duplicates.includes(appId)) duplicates.push(appId);
        pass.add(appId);
        const index = readRowIndex(row);
        const known = seen.get(appId);
        if (known) {
          known.offset = offset;
          if (index !== null) known.index = index;
        } else {
          seen.set(appId, { appId, index, offset, seq: seen.size });
        }
        const title = titles.get(appId);
        if (!title || title === `App ${appId}`) titles.set(appId, readTitle(row, appId));
      }
    }

    harvest();
    onProgress(seen.size);

    while (true) {
      if (Date.now() - startedAt > TIME_BUDGET_MS || steps >= MAX_SCROLL_STEPS) {
        timedOut = true;
        break;
      }

      const before = seen.size;
      const metrics = scrollMetrics(scroller);
      const atBottom = metrics.top + metrics.view >= metrics.height - 2;
      scrollTo(scroller, atBottom ? metrics.height : metrics.top + metrics.view * SCROLL_STEP_RATIO);
      steps += 1;

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

      onProgress(seen.size);

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
    const appIds = order.entries.map((entry) => entry.appId);

    return {
      appIds,
      titles,
      duplicates,
      route,
      scrollerRoute,
      timedOut,
      reachedBottom,
      expectedTotal: order.expectedTotal,
      missingIndexes: order.missingIndexes,
      verdict: judgePageRead({
        collected: appIds.length,
        expectedTotal: order.expectedTotal,
        missingIndexes: order.missingIndexes,
        reachedBottom,
        timedOut,
      }),
    };
  }

  // ==========================================================================
  // The order file
  // ==========================================================================

  /** Error with a message meant for the user, not for a log. */
  class OrderFileError extends Error {}

  /**
   * Reads and checks the JSON produced by "Order as JSON" in the application —
   * and the backup this script writes, which is a file of the very same kind.
   *
   * The `kind` field is what separates an order from a state dump: a state has
   * a whole session inside it, and writing a wishlist out of one would put the
   * games in an order the user never approved.
   *
   * @param {string} text
   * @returns {{ items: object[], remove: object[], duplicates: number[], summary: object|null,
   *             exportedAt: string|null, versionWarning: string|null }}
   * @throws {OrderFileError}
   */
  function parseOrderFile(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new OrderFileError(`This is not JSON: ${error.message}`);
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new OrderFileError('The JSON was read, but what is inside is not an order object.');
    }

    if (data.kind !== ORDER_KIND) {
      if (data.session || data.kind === undefined) {
        throw new OrderFileError(
          'This is not an order file. It looks like a dump of the application state (the “Save to a ' +
            'file” button). What is needed is the file from the “Result” screen → the “Order as JSON” button.',
        );
      }
      throw new OrderFileError(`The file is marked as “${String(data.kind)}”, and “${ORDER_KIND}” is needed.`);
    }

    if (data.app !== APP_SIGNATURE) {
      throw new OrderFileError('The file carries no Steam Wishlist Sorter signature.');
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      throw new OrderFileError('The items field of the file holds no entries at all.');
    }

    const versionWarning =
      data.version === ORDER_VERSION
        ? null
        : `The file is version ${String(data.version)}, the script knows version ${ORDER_VERSION}. ` +
          'Read the report over yourself before confirming the write.';

    /** @type {Set<number>} */
    const seen = new Set();
    /** @type {number[]} */
    const duplicates = [];

    const items = data.items
      .map((item) => ({
        position: Number(item?.position) || 0,
        appId: Number(item?.appId),
        title: typeof item?.title === 'string' ? item.title : '',
        category: typeof item?.categoryLabel === 'string' ? item.categoryLabel : (item?.category ?? ''),
        positionInCategory: Number(item?.positionInCategory) || 0,
        origin: typeof item?.origin === 'string' ? item.origin : '',
        tiedWithPrevious: item?.tiedWithPrevious === true,
      }))
      .filter((item) => Number.isSafeInteger(item.appId) && item.appId > 0)
      .sort((a, b) => a.position - b.position)
      .filter((item) => {
        // An App ID listed twice would be sent twice; the first place wins and
        // the report says which ids these were.
        if (seen.has(item.appId)) {
          if (!duplicates.includes(item.appId)) duplicates.push(item.appId);
          return false;
        }
        seen.add(item.appId);
        return true;
      });

    if (items.length === 0) {
      throw new OrderFileError('Not a single entry of items carries a valid App ID.');
    }

    const remove = (Array.isArray(data.remove) ? data.remove : [])
      .map((item) => ({ appId: Number(item?.appId), title: typeof item?.title === 'string' ? item.title : '' }))
      .filter((item) => Number.isSafeInteger(item.appId) && item.appId > 0);

    return {
      items,
      remove,
      duplicates,
      summary: data.summary && typeof data.summary === 'object' ? data.summary : null,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
      versionWarning,
    };
  }

  // ==========================================================================
  // The order that will be sent
  // ==========================================================================

  /**
   * Builds the list of app ids the request is made of.
   *
   * Three rules decide it, and all three are there so that the wishlist after
   * the write holds exactly what it held before:
   *
   *  1. the entries of the file that are on the page come first, in the order
   *     of the file;
   *  2. the entries that are on the page but not in the file — added after the
   *     export, or left out of the ranking — come next, in the order the page
   *     shows them now. The file says nothing about them, and leaving them out
   *     of the request would leave them out of the wishlist;
   *  3. the entries marked as "remove from the wishlist" come last, out of the
   *     way of the ranking, and are handed back as a list. Nothing is deleted
   *     here: that is the user's own click.
   *
   * The result is a permutation of the app ids of the page — the same ids, in a
   * different order, never fewer.
   *
   * @param {{ items: Array<{ appId: number }>, remove: Array<{ appId: number }>, pageAppIds: number[] }} input
   * @returns {{ appIds: number[], placed: object[], missing: object[], extra: number[], removals: number[] }}
   */
  function buildTargetOrder({ items, remove, pageAppIds }) {
    const onPage = new Set(pageAppIds);
    const removeIds = new Set((remove ?? []).map((entry) => entry.appId));

    /** @type {object[]} */
    const placed = [];
    /** @type {object[]} */
    const missing = [];
    /** Everything that already has a place, so that nothing is sent twice. */
    const taken = new Set();

    for (const item of items ?? []) {
      if (!onPage.has(item.appId)) {
        missing.push(item);
        continue;
      }
      if (taken.has(item.appId)) continue;
      taken.add(item.appId);
      placed.push(item);
    }

    /** @type {number[]} */
    const extra = [];
    /** @type {number[]} */
    const removals = [];
    for (const appId of pageAppIds) {
      if (taken.has(appId)) continue;
      taken.add(appId);
      if (removeIds.has(appId)) removals.push(appId);
      else extra.push(appId);
    }

    return {
      appIds: [...placed.map((item) => item.appId), ...extra, ...removals],
      placed,
      missing,
      extra,
      removals,
    };
  }

  /**
   * Compares the order that was asked for with the one the page shows now.
   *
   * The two lists are matched on the ids they have in common: a game bought or
   * taken off the wishlist between the write and the check would otherwise
   * shift everything below it and turn one honest difference into a hundred
   * false ones. Ids present on one side only are reported on their own.
   *
   * @param {number[]} intended
   * @param {number[]} actual
   * @returns {{ matches: boolean, inPlace: number, compared: number, firstMismatch: number,
   *             missing: number[], unexpected: number[] }}
   */
  function compareOrders(intended, actual) {
    const intendedSet = new Set(intended);
    const actualSet = new Set(actual);

    const missing = intended.filter((appId) => !actualSet.has(appId));
    const unexpected = actual.filter((appId) => !intendedSet.has(appId));

    const left = intended.filter((appId) => actualSet.has(appId));
    const right = actual.filter((appId) => intendedSet.has(appId));

    let firstMismatch = -1;
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      if (left[index] !== right[index]) {
        firstMismatch = index;
        break;
      }
    }
    if (firstMismatch === -1 && left.length !== right.length) firstMismatch = Math.min(left.length, right.length);

    return {
      matches: firstMismatch === -1 && missing.length === 0 && unexpected.length === 0,
      inPlace: firstMismatch === -1 ? left.length : firstMismatch,
      compared: left.length,
      firstMismatch,
      missing,
      unexpected,
    };
  }

  // ==========================================================================
  // The backup
  // ==========================================================================

  /**
   * The order the wishlist is in right now, written in the format the
   * application exports — which is the format this very script reads back. That
   * is the whole point of it: undoing a write is picking this file and writing
   * it again, not reconstructing anything by hand.
   *
   * @param {Array<{ appId: number, title: string }>} rows In the order of the page.
   * @param {string} exportedAt ISO timestamp.
   * @returns {object}
   */
  function buildBackupOrder(rows, exportedAt) {
    return {
      app: APP_SIGNATURE,
      kind: ORDER_KIND,
      version: ORDER_VERSION,
      exportedAt,
      source: 'steam-wishlist-page-backup',
      summary: {
        total: rows.length,
        resolved: 0,
        fallback: rows.length,
        manual: 0,
        removed: 0,
        comparisons: 0,
        complete: false,
      },
      items: rows.map((row, index) => ({
        position: index + 1,
        appId: row.appId,
        title: row.title || `App ${row.appId}`,
        url: `${STEAM_ORIGIN}/app/${row.appId}/`,
        kind: 'unknown',
        category: null,
        categoryLabel: '',
        positionInCategory: index + 1,
        wishlistPosition: index + 1,
        origin: 'fallback',
        tiedWithPrevious: false,
      })),
      remove: [],
    };
  }

  // ==========================================================================
  // Talking to Steam
  // ==========================================================================

  /** A Steam id is 17 digits, and nothing of another shape is read as one. */
  const STEAM_ID_PATTERN = /^\d{17}$/;

  /**
   * Where a page writes down the account a wishlist belongs to.
   *
   * Nothing is addressed with it any more — the endpoint names no account. It
   * is read so that the report can say whose list is open, because a wishlist
   * that is not yours is a list of somebody else's app ids, and writing it
   * would put their entries at the top of your own. Steam brings the address to
   * `/wishlist/id/<custom url>/` and the rewritten page defines no `g_steamID`,
   * so several places are looked at: the address itself, the variable the old
   * layout defined, the numeric link the new one puts on the page, the scripts,
   * an attribute.
   */
  const OWNER = {
    numericPath: /^\/wishlist\/profiles\/(\d{17})(?:\/|$)/,
    vanityPath: /^\/wishlist\/id\/([^/?#]+)(?:\/|$)/,
    profileLinks: 'a[href*="wishlist/profiles/"]',
    inlineScripts: 'script:not([src])',
    elements: '[data-steamid]',
    // `(?!\d)` is not decoration: without it an eighteen digit number reads as a
    // seventeen digit one with a digit after it, and the id of nobody becomes
    // the id of somebody.
    inAddress: /wishlist\/profiles\/(\d{17})(?!\d)/,
    everyAddress: /wishlist\/profiles\/(\d{17})(?!\d)/g,
    inScript: /g_steamID\s*=\s*["'](\d{17})["']/,
  };

  /** What each source is, in words, for the line of the report that names the account. */
  const OWNER_SOURCE_WORDS = {
    path: 'the numeric address of this page',
    g_steamID: 'the account this page says is signed in',
    'profile-link': 'a link on the page to this wishlist by its numeric address',
    'inline-script': 'a script of the page',
    'data-steamid': 'an element of the page',
  };

  /**
   * Every account id the page states, each with the source that stated it.
   *
   * It collects rather than returns the first hit on purpose. The sources can
   * disagree — a page carries links to wishlists other than its own — and a
   * disagreement is worth saying out loud rather than resolving by whichever
   * source happened to be looked at first. Nothing is chosen here; the report
   * line is `readOpenWishlist`.
   *
   * Pure: the document and the globals come in as arguments, so the whole chain
   * is exercised against a mock page in the tests.
   *
   * @param {{ pathname?: string, document?: object|null, globals?: Array<object|null> }} [input]
   * @returns {{ fromPath: string|null, vanity: string|null,
   *             candidates: Array<{ source: string, steamId: string }> }}
   */
  function collectOwnerCandidates({ pathname = '', document: doc = null, globals = [] } = {}) {
    const path = String(pathname ?? '');
    const fromPath = OWNER.numericPath.exec(path)?.[1] ?? null;
    const vanity = OWNER.vanityPath.exec(path)?.[1] ?? null;

    /** @type {Array<{ source: string, steamId: string }>} */
    const candidates = [];
    const add = (source, value) => {
      const steamId = String(value ?? '');
      if (STEAM_ID_PATTERN.test(steamId)) candidates.push({ source, steamId });
    };

    // 1. The address, when the page was opened by the numeric form.
    if (fromPath) add('path', fromPath);

    // 2. The variable of the old layout, in the page and in the isolated world.
    for (const scope of globals) {
      if (scope) add('g_steamID', scope.g_steamID);
    }
    const scripts = doc ? [...doc.querySelectorAll(OWNER.inlineScripts)] : [];
    for (const script of scripts) {
      add('g_steamID', OWNER.inScript.exec(String(script.textContent ?? ''))?.[1]);
    }

    // 3. The numeric address of this same wishlist, linked on the page.
    if (doc) {
      for (const link of doc.querySelectorAll(OWNER.profileLinks)) {
        add('profile-link', OWNER.inAddress.exec(link.getAttribute('href') ?? '')?.[1]);
      }
    }

    // 4. The same address written into a script of the page.
    for (const script of scripts) {
      for (const match of String(script.textContent ?? '').matchAll(OWNER.everyAddress)) {
        add('inline-script', match[1]);
      }
    }

    // 5. An attribute, the way the pages of the community carry one.
    if (doc) {
      for (const node of doc.querySelectorAll(OWNER.elements)) add('data-steamid', node.getAttribute('data-steamid'));
    }

    return { fromPath, vanity, candidates };
  }

  /**
   * Whose wishlist is open, in one line for the report.
   *
   * Nothing here decides where the request goes: the endpoint names no account
   * and the browser attaches the cookie of whoever is signed in. What this
   * answers is the question the user should still be asked — *is the list on
   * this screen yours?* — because the app ids come off this page, and a page
   * belonging to somebody else would put their entries at the top of your list.
   *
   * So an unknown account is not an error and two accounts are not an error:
   * both are a sentence in the report, and the write goes on. The single case
   * still refused is the certain one — a numeric address naming one account
   * while `g_steamID` says you are signed in as another. There the page is
   * somebody else's beyond doubt, and going ahead would rearrange your own list
   * with their app ids.
   *
   * @param {{ pathname: string, loggedInSteamId?: string|null,
   *           candidates?: Array<{ source: string, steamId: string }> }} input
   * @returns {{ error: 'not-yours', message: string }
   *           |{ steamId: string|null, source: string|null, vanity: string|null,
   *              accounts: string[], note: string }}
   */
  function readOpenWishlist({ pathname, loggedInSteamId = null, candidates = [] }) {
    const path = String(pathname ?? '');
    const fromPath = OWNER.numericPath.exec(path)?.[1] ?? null;
    const vanity = OWNER.vanityPath.exec(path)?.[1] ?? null;

    // The path is read from `pathname` and from nowhere else, so a candidate
    // list that already holds it cannot make it say something different.
    /** @type {Array<{ source: string, steamId: string }>} */
    const found = [];
    const add = (source, value) => {
      const steamId = String(value ?? '');
      if (STEAM_ID_PATTERN.test(steamId)) found.push({ source, steamId });
    };
    add('g_steamID', loggedInSteamId);
    for (const candidate of candidates ?? []) {
      if (candidate && candidate.source !== 'path') add(candidate.source, candidate.steamId);
    }

    const mine = found.find((candidate) => candidate.source === 'g_steamID')?.steamId ?? null;

    if (fromPath && mine && fromPath !== mine) {
      return {
        error: 'not-yours',
        message:
          'This wishlist is not yours: the address names one account and the page says you are signed ' +
          'in as another. The write would not go to the list on this screen — it goes to the wishlist ' +
          'of the account the browser is signed in as, which means your own list would be rearranged ' +
          "with somebody else's entries. Open your own wishlist and pick the file again.",
      };
    }

    if (fromPath) {
      return {
        steamId: fromPath,
        source: 'path',
        vanity: null,
        accounts: [fromPath],
        note: '',
      };
    }

    /** @type {Map<string, string[]>} */
    const bySteamId = new Map();
    for (const candidate of found) {
      if (!bySteamId.has(candidate.steamId)) bySteamId.set(candidate.steamId, []);
      const sources = bySteamId.get(candidate.steamId);
      if (!sources.includes(candidate.source)) sources.push(candidate.source);
    }

    const accounts = [...bySteamId.keys()];

    if (accounts.length > 1) {
      const listed = [...bySteamId]
        .map(([steamId, sources]) => `${steamId} (${sources.map((s) => OWNER_SOURCE_WORDS[s] ?? s).join(', ')})`)
        .join('; ');
      return {
        steamId: null,
        source: null,
        vanity,
        accounts,
        note:
          `This page names more than one account — ${listed} — so which of them owns the list on the ` +
          'screen cannot be told from here; a page carries links to wishlists other than its own. It ' +
          'changes nothing about where the write goes: that is always the wishlist of the account this ' +
          'browser is signed in as. Check that the list below is the one you meant to rearrange.',
      };
    }

    if (accounts.length === 0) {
      return {
        steamId: null,
        source: null,
        vanity,
        accounts,
        note:
          'Which account this wishlist belongs to is not written anywhere the script can read it' +
          `${vanity ? ' — the address is the custom url form' : ''}. The write goes to the wishlist of ` +
          'the account this browser is signed in as, so check that the list below is your own.',
      };
    }

    const steamId = accounts[0];
    const source = bySteamId.get(steamId)[0];
    return {
      steamId,
      source,
      vanity,
      accounts,
      note: '',
    };
  }

  /**
   * The account whose wishlist is open, in words: the id, the name the address
   * gives if it gives one, and where the id was found.
   *
   * It is a function of its own so that the report and the confirmation say the
   * same thing in the same words — the last place a wrong list is still cheap
   * to notice.
   *
   * @param {{ steamId: string, source: string, vanity?: string|null }} resolved
   * @returns {string}
   */
  function describeAccount(resolved) {
    const nick = resolved.vanity ? ` (${resolved.vanity})` : '';
    return `${resolved.steamId}${nick} — from ${OWNER_SOURCE_WORDS[resolved.source] ?? resolved.source}`;
  }

  /**
   * Every account id the open page states — the sources read off the real
   * document, with `unsafeWindow` consulted for the case where the userscript
   * manager isolates the script from the page it runs on.
   *
   * @returns {Array<{ source: string, steamId: string }>}
   */
  function findOwnerCandidates() {
    return collectOwnerCandidates({
      pathname: location.pathname,
      document,
      globals: [window, typeof unsafeWindow === 'undefined' ? null : unsafeWindow],
    }).candidates;
  }

  /**
   * The body of the reorder request, exactly as the page itself sends it when a
   * row is dragged: the method name and the whole list of app ids, each with
   * the place it is to take.
   *
   * `mp` is an array of one element, and that element is the list of pairs. The
   * double brackets are what a live drag sends, and a body shaped any other way
   * is a different request.
   *
   * `priority` is a straight numbering from one, in the order given. Steam's
   * own numbering runs over the entries the user has arranged and leaves the
   * rest at zero; this script sends the list whole, so every entry it sends
   * gets a number. That is the irreversible half of the write — the order can
   * be put back from the backup, "never arranged" cannot.
   *
   * @param {number[]} appIds In the order the wishlist has to end up in.
   * @returns {string}
   */
  function buildReorderBody(appIds) {
    return JSON.stringify({
      m: 'Reorder',
      mp: [(appIds ?? []).map((appId, index) => ({ appid: appId, priority: index + 1 }))],
    });
  }

  /**
   * Reads what Steam answered and turns it into one case with one message.
   *
   * Every branch ends in something the user can act on. A silent failure — a
   * request that came back wrong and a panel that says nothing about it — is
   * the worst outcome available to a script that writes, so there is no such
   * branch here.
   *
   * @param {{ status: number, contentType?: string, body?: string }} answer
   * @returns {{ ok: boolean, kind: string, message: string }}
   */
  function readReorderAnswer({ status, contentType = '', body = '' }) {
    const text = String(body ?? '');
    const looksLikeLoginPage = /<\s*html/i.test(text) && /(login|sign\s*in|steamcommunity\.com\/login)/i.test(text);

    if (status === 413) {
      return {
        ok: false,
        kind: 'too-large',
        message:
          'Steam answered 413 — the request is too big for it. That happens with very large wishlists: ' +
          'the whole order goes in one request, and this one did not fit. Splitting it is not a way out — ' +
          'Steam interleaves a partial list with the entries it was not given, and the result is a ' +
          'shuffle. Use “Show the order on the page” and drag the rows: the marks say where each one goes.',
      };
    }

    if (status === 401 || status === 403 || looksLikeLoginPage) {
      return {
        ok: false,
        kind: 'signed-out',
        message:
          `Steam did not accept the session: it answered ${status}` +
          `${looksLikeLoginPage ? ' with a sign-in page' : ''}. Most often the session has simply expired. ` +
          'Sign in to Steam again, reload the wishlist and repeat — nothing was written.',
      };
    }

    if (status === 429) {
      return {
        ok: false,
        kind: 'rate-limited',
        message:
          'Steam answered 429 — too many requests. Wait a couple of minutes and press the write button ' +
          'again; nothing was changed.',
      };
    }

    if (status >= 500) {
      return {
        ok: false,
        kind: 'server-error',
        message:
          `Steam answered ${status} — the trouble is on its side. Try again in a few minutes; nothing ` +
          'was written.',
      };
    }

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        kind: 'refused',
        message:
          `Steam answered ${status}, and that is not an answer this script knows. Nothing can be claimed ` +
          'about the order — reload the wishlist and look at it before doing anything else.',
      };
    }

    if (text.trim() === '') {
      return {
        ok: true,
        kind: 'ok-empty',
        message:
          'Steam answered with an empty body — it says nothing either way. Whether the order really ' +
          'changed is decided by the check below, not by this answer.',
      };
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return {
        ok: false,
        kind: 'not-json',
        message:
          'Steam answered with something that is not JSON' +
          `${contentType ? ` (content type: ${contentType})` : ''}. That usually means the endpoint has ` +
          'changed, or that a page came back instead of an answer. Reload the wishlist and see what ' +
          'state it is in before repeating anything.',
      };
    }

    // `{ "data": { "result": 1 } }` is the whole of a successful answer. There
    // is no message in it and no list — a number, and the check below.
    const result = payload?.data?.result;
    if (result === 1) {
      return { ok: true, kind: 'ok', message: 'Steam accepted the order.' };
    }
    if (result === undefined) {
      return {
        ok: true,
        kind: 'ok-unknown',
        message:
          'Steam answered with JSON that carries no data.result field. The answer neither confirms nor ' +
          'denies anything — the check below is what decides.',
      };
    }
    return {
      ok: false,
      kind: 'refused',
      message:
        `Steam refused the order: it answered data.result = ${JSON.stringify(result)}, and said nothing ` +
        'else. Reload the wishlist and look at the order before repeating.',
    };
  }

  /**
   * @param {unknown} error
   * @returns {{ ok: false, kind: 'offline', message: string }}
   */
  function describeNetworkFailure(error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      kind: 'offline',
      message:
        `The request never reached Steam: ${reason}. The network may be down, or an extension may have ` +
        'blocked the request. Nothing was written — check the connection and press the button again.',
    };
  }

  /**
   * Sends the order. The one function of this script that changes anything.
   *
   * `fetch` is a parameter so that the tests can go through every answer
   * without touching the network, and so that this file holds no request a test
   * cannot see.
   *
   * The default is a wrapper rather than `globalThis.fetch` itself: a `fetch`
   * taken off the window and called on its own is refused by some browsers.
   *
   * `credentials: 'include'` is the whole of the authorization. The address is
   * the origin of the page, so the browser attaches the cookie of the account
   * it is signed in as, and this script never sees it.
   *
   * @param {{ appIds: number[], fetchImpl?: typeof fetch }} input
   * @returns {Promise<{ ok: boolean, kind: string, message: string }>}
   */
  async function sendReorder({ appIds, fetchImpl = (target, options) => fetch(target, options) }) {
    let response;
    try {
      response = await fetchImpl(REORDER_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: buildReorderBody(appIds),
      });
    } catch (error) {
      return describeNetworkFailure(error);
    }

    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    return readReorderAnswer({
      status: response.status,
      contentType: response.headers?.get?.('content-type') ?? '',
      body,
    });
  }

  // ==========================================================================
  // Badges on the page
  // ==========================================================================

  /**
   * Draws the target position next to every row it can identify and keeps doing
   * it while the list scrolls: the rows are recycled by the virtualized list,
   * so a badge drawn once would end up on the wrong game.
   *
   * This is the way out when the write is not available — a wishlist too large
   * for one request, an endpoint Steam has changed — so it stays.
   */
  function createHighlighter() {
    /** @type {Map<number, { position: number, title: string, category: string }>} */
    let plan = new Map();
    /** @type {Set<number>} */
    let removals = new Set();
    /** @type {MutationObserver|null} */
    let observer = null;
    let scheduled = false;

    function decorate() {
      scheduled = false;
      const { rows } = findRows();
      for (const row of rows) {
        const appId = readAppId(row);
        if (appId === null) continue;

        let badge = row.querySelector(`[${BADGE_ATTRIBUTE}]`);
        if (!badge) {
          badge = document.createElement('div');
          badge.setAttribute(BADGE_ATTRIBUTE, '1');
          badge.style.cssText =
            'position:absolute;left:-6px;top:-6px;z-index:50;padding:3px 8px;border-radius:6px;' +
            'font:600 12px/1.2 "Segoe UI",Arial,sans-serif;color:#fff;pointer-events:none;' +
            'box-shadow:0 2px 8px rgba(0,0,0,.45);white-space:nowrap;';
          // The row must be a positioning context for the badge to land on it.
          if (getComputedStyle(row).position === 'static') row.style.position = 'relative';
          row.append(badge);
        }

        const target = plan.get(appId);
        if (removals.has(appId)) {
          badge.textContent = 'remove from the wishlist';
          badge.style.background = '#a33b3b';
        } else if (target) {
          badge.textContent = `#${target.position}${target.category ? ` · ${target.category}` : ''}`;
          badge.style.background = '#2d6ea8';
        } else {
          badge.textContent = 'not in the file';
          badge.style.background = '#4a5462';
        }
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(decorate);
    }

    return {
      /**
       * @param {Array<{ appId: number, position: number, title: string, category: string }>} items
       * @param {Array<{ appId: number }>} remove
       */
      start(items, remove) {
        plan = new Map(items.map((item) => [item.appId, item]));
        removals = new Set(remove.map((item) => item.appId));
        decorate();
        observer?.disconnect();
        observer = new MutationObserver(schedule);
        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('scroll', schedule, { passive: true, capture: true });
      },
      stop() {
        observer?.disconnect();
        observer = null;
        window.removeEventListener('scroll', schedule, { capture: true });
        for (const badge of document.querySelectorAll(`[${BADGE_ATTRIBUTE}]`)) badge.remove();
      },
      /** Scrolls a game into view, so the user can find the next one to drag. */
      reveal(appId) {
        const row = findRows().rows.find((candidate) => readAppId(candidate) === appId);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return Boolean(row);
      },
    };
  }

  // ==========================================================================
  // The panel
  // ==========================================================================

  const PANEL_CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      width: 400px; max-width: calc(100vw - 32px);
      background: #12181f; color: #d6dde6; border: 1px solid #2a3542; border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.55);
      font: 13px/1.45 "Segoe UI", Arial, sans-serif;
    }
    .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2a3542; }
    .head b { font-size: 13px; font-weight: 600; color: #eef3f8; flex: 1; }
    .body { padding: 12px; display: grid; gap: 10px; max-height: 70vh; overflow: auto; }
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
    button.danger { background: #8c3b3b; border-color: #b45151; color: #fff; }
    button.danger:hover:not(:disabled) { background: #a34545; }
    .close { border: 0; background: transparent; color: #8b97a5; padding: 2px 6px; }
    input[type=file] { font: inherit; color: #8b97a5; max-width: 100%; }
    label.check { display: flex; gap: 8px; align-items: flex-start; color: #8b97a5; cursor: pointer; }
    ol { margin: 0; padding-left: 20px; display: grid; gap: 3px; }
    .box { border: 1px solid #2a3542; border-radius: 8px; padding: 10px; display: grid; gap: 8px; background: #17202a; }
    .box.alert { border-color: #6b4a2a; background: #1d1a16; }
    .plan { border-top: 1px solid #2a3542; padding-top: 8px; display: grid; gap: 4px; }
    .plan-item { display: flex; gap: 6px; align-items: baseline; cursor: pointer; }
    .plan-item:hover .plan-title { text-decoration: underline; }
    .plan-num { color: #8b97a5; min-width: 34px; text-align: right; }
    .plan-title { flex: 1; }
    .plan-missing { color: #ff8f8f; }
    .hint { background: #17202a; border: 1px solid #2a3542; border-radius: 8px; padding: 10px; }
    a { color: #7fb2e5; }
  `;

  function createPanel() {
    const host = document.createElement('div');
    host.id = 'sws-order-host';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="panel">
        <div class="head">
          <b>Wishlist Sorter — carry the order</b>
          <button class="close" type="button" title="Close">✕</button>
        </div>
        <div class="body">
          <div class="muted">
            Pick the “Order as JSON” file from the “Result” screen — or a backup this script has written.
            The page is read first and a report is shown; nothing is written until you confirm it.
          </div>
          <input type="file" accept=".json,application/json" data-act="file">
          <div class="status muted" data-act="status"></div>

          <div class="box alert" data-act="write-box" hidden>
            <div class="warn"><b>The next step writes into your Steam wishlist.</b></div>
            <div class="muted">
              The order goes to Steam in one request and replaces the one you have now. The endpoint is
              undocumented and the change cannot be undone from inside Steam — so take the backup first.
              It is a file in this very format, and this very script writes it back.
            </div>
            <div class="warn">
              <b>One part of this cannot be undone by anything.</b> Steam numbers only the entries you
              have arranged by hand and leaves the rest without a number. This writes the list whole, so
              after it <b>every</b> entry has a number — including the ones that never had one. The
              backup puts the order back; it cannot put back “never arranged”.
            </div>
            <div class="muted">
              The write goes to the wishlist of the account this browser is signed in as. The address of
              the request names no account, so the list on the screen is what you should check.
            </div>
            <div class="row">
              <button type="button" data-act="backup">Download the current order as a backup</button>
            </div>
            <label class="check">
              <input type="checkbox" data-act="skip-backup">
              <span>I have a backup already, or I do not want one</span>
            </label>
            <div class="row">
              <button class="danger" type="button" data-act="send" disabled>Write the order into Steam</button>
            </div>
            <div class="row" data-act="confirm-box" hidden>
              <button class="danger" type="button" data-act="confirm">Confirm</button>
              <button type="button" data-act="cancel">Cancel</button>
            </div>
          </div>

          <div class="box" data-act="verify-box" hidden>
            <div>The order was sent. The page still shows the old one — it is redrawn by a reload.</div>
            <div class="row">
              <button class="primary" type="button" data-act="verify">Reload and check the result</button>
            </div>
            <div class="muted">
              The check reads the wishlist again and compares it with what was sent, entry by entry.
            </div>
          </div>

          <div class="row">
            <button type="button" data-act="preview" disabled>Show the order on the page</button>
            <button type="button" data-act="clear" disabled>Remove the marks</button>
            <button type="button" data-act="copy" disabled>Copy the list</button>
          </div>

          <div data-act="removals"></div>
          <div data-act="plan"></div>
        </div>
      </div>
    `;
    document.body.append(host);
    const query = (selector) => shadow.querySelector(selector);
    query('.close').addEventListener('click', () => host.remove());
    return {
      shadow,
      file: query('[data-act="file"]'),
      preview: query('[data-act="preview"]'),
      clear: query('[data-act="clear"]'),
      copy: query('[data-act="copy"]'),
      writeBox: query('[data-act="write-box"]'),
      backup: query('[data-act="backup"]'),
      skipBackup: query('[data-act="skip-backup"]'),
      send: query('[data-act="send"]'),
      confirmBox: query('[data-act="confirm-box"]'),
      confirm: query('[data-act="confirm"]'),
      cancel: query('[data-act="cancel"]'),
      verifyBox: query('[data-act="verify-box"]'),
      verify: query('[data-act="verify"]'),
      removals: query('[data-act="removals"]'),
      plan: query('[data-act="plan"]'),
      /**
       * @param {string} html
       * @param {'muted'|'ok'|'warn'|'error'} tone
       */
      say(html, tone = 'muted') {
        const status = query('[data-act="status"]');
        status.className = `status ${tone}`;
        status.innerHTML = html;
      },
    };
  }

  const escapeHtml = (text) =>
    String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

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
  // The pure half, for the tests
  // ==========================================================================

  /**
   * `node --test` loads this file too. Everything above that needs no page —
   * building the order, reading an answer of Steam, comparing what came out
   * with what was asked for, writing the backup — is tested there, with `fetch`
   * replaced by a stub, so that the parts deciding what gets sent are checked
   * before anything is sent.
   *
   * In Node there is no `document`, and this is where the script stops. On the
   * wishlist page the branch is never taken and nothing is published into the
   * page.
   */
  if (typeof document === 'undefined') {
    globalThis.__swsReorderTestApi = {
      APP_SIGNATURE,
      ORDER_KIND,
      ORDER_VERSION,
      OrderFileError,
      REORDER_URL,
      STEAM,
      buildBackupOrder,
      buildPageOrder,
      buildReorderBody,
      buildTargetOrder,
      collectOwnerCandidates,
      compareOrders,
      describeAccount,
      describeNetworkFailure,
      findRows,
      findScroller,
      judgePageRead,
      parseDraggableId,
      parseOrderFile,
      readAppId,
      readOpenWishlist,
      readReorderAnswer,
      readRowIndex,
      readTitle,
      sendReorder,
    };
    return;
  }

  // ==========================================================================
  // Entry point
  // ==========================================================================

  if (!STEAM.pathPattern.test(location.pathname)) return;

  const panel = createPanel();
  const highlighter = createHighlighter();

  /** @type {ReturnType<typeof parseOrderFile>|null} */
  let order = null;
  /** @type {Awaited<ReturnType<typeof scanPage>>|null} */
  let page = null;
  /** @type {ReturnType<typeof buildTargetOrder>|null} */
  let target = null;
  let backupTaken = false;
  /** Whose wishlist the report said was open, so that the confirmation says the same. */
  let owner = null;

  // --------------------------------------------------------------------------
  // The check that survives a reload
  // --------------------------------------------------------------------------

  /**
   * @returns {{ appIds: number[], at: string }|null}
   */
  function readPendingCheck() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(CHECK_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const appIds = Array.isArray(parsed?.appIds) ? parsed.appIds.filter((id) => Number.isSafeInteger(id)) : [];
      if (appIds.length === 0) return null;
      if (Date.now() - Date.parse(parsed.at ?? '') > CHECK_TTL_MS) return null;
      return { appIds, at: String(parsed.at ?? '') };
    } catch {
      return null;
    }
  }

  function clearPendingCheck() {
    try {
      sessionStorage.removeItem(CHECK_KEY);
    } catch {
      // A browser that refuses the storage simply gets no check across the reload.
    }
  }

  /**
   * @param {number[]} appIds
   * @returns {boolean} Whether it will still be there after the reload.
   */
  function rememberPendingCheck(appIds) {
    try {
      sessionStorage.setItem(CHECK_KEY, JSON.stringify({ appIds, at: new Date().toISOString() }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Runs the check left behind by the write that happened before the reload.
   *
   * @param {{ appIds: number[] }} pending
   */
  async function runPendingCheck(pending) {
    panel.say('Checking the result: reading the wishlist again…');
    const now = await scanPage((found) =>
      panel.say(`Checking the result: <b>${found}</b> ${plural(found, 'entry', 'entries')} read…`),
    );
    clearPendingCheck();

    if (now.appIds.length === 0) {
      panel.say(
        'The result could not be checked: not a single entry was found on the page. Look at the wishlist ' +
          'yourself — the order was sent, and what came of it is a question the page answers.',
        'error',
      );
      return;
    }

    // A check run on half a page would report a hundred differences that are
    // not there. Saying nothing is the honest answer, and it is said plainly.
    if (!now.verdict.ok) {
      panel.say(
        '<b>The result could not be checked: the wishlist was read only in part.</b><br>' +
          `${escapeHtml(now.verdict.message)}<br>` +
          'The order was sent — comparing it against a part of the page would invent differences that ' +
          'are not there. Scroll the wishlist to the very end by hand, reload it, and look it over.',
        'warn',
      );
      return;
    }

    const verdict = compareOrders(pending.appIds, now.appIds);
    if (verdict.matches) {
      panel.say(
        `<b>The order is in place.</b> All ${verdict.compared} ${plural(verdict.compared, 'entry', 'entries')} ` +
          'stand exactly as they were sent.',
        'ok',
      );
      return;
    }

    const lines = [
      '<b>The wishlist does not match what was sent.</b>',
      `${verdict.inPlace} of ${verdict.compared} ${plural(verdict.compared, 'entry', 'entries')} stand as ` +
        `asked, and the first difference is at #${verdict.firstMismatch + 1}.`,
    ];
    if (verdict.missing.length > 0) {
      lines.push(
        `Sent, but no longer on the page: ${verdict.missing.length} — ` +
          `${verdict.missing.slice(0, 5).map((id) => `App ${id}`).join(', ')}.`,
      );
    }
    if (verdict.unexpected.length > 0) {
      lines.push(
        `On the page, but not sent: ${verdict.unexpected.length} — ` +
          `${verdict.unexpected.slice(0, 5).map((id) => `App ${id}`).join(', ')}.`,
      );
    }
    lines.push(
      '<span class="muted">Before reading this as a failure, look at the sorting of the wishlist: the ' +
        'page has to be sorted by <b>Your rank</b> with the filters cleared, otherwise it shows the ' +
        'entries in an order of its own and the comparison means nothing.</span>',
    );
    panel.say(lines.join('<br>'), 'warn');
  }

  // --------------------------------------------------------------------------
  // Reading the file
  // --------------------------------------------------------------------------

  panel.file.addEventListener('change', async () => {
    const file = panel.file.files?.[0];
    if (!file) return;

    order = null;
    page = null;
    target = null;
    backupTaken = false;
    panel.preview.disabled = true;
    panel.copy.disabled = true;
    panel.writeBox.hidden = true;
    panel.verifyBox.hidden = true;
    panel.confirmBox.hidden = true;
    panel.send.disabled = true;
    panel.skipBackup.checked = false;
    panel.removals.innerHTML = '';
    panel.plan.innerHTML = '';

    let text;
    try {
      text = await file.text();
    } catch (error) {
      panel.say(`The file could not be read: ${escapeHtml(error.message)}`, 'error');
      return;
    }

    try {
      order = parseOrderFile(text);
    } catch (error) {
      panel.say(escapeHtml(error.message), 'error');
      return;
    }

    panel.say('Reading the page: scrolling the list so that every entry loads…');
    page = await scanPage((found) =>
      panel.say(`Reading the page: <b>${found}</b> ${plural(found, 'entry', 'entries')} found…`),
    );
    // So that picking the very same file again reads the page again.
    panel.file.value = '';

    if (page.appIds.length === 0) {
      panel.say(
        'Not a single wishlist entry was found on the page.<br>' +
          'Most likely Steam has changed the layout. Update the <b>STEAM</b> object at the top of the ' +
          'userscript (the export script spells out how). Nothing was written.',
        'error',
      );
      page = null;
      return;
    }

    // An order built on a page that was read in part is not a partial order: it
    // is a wrong one. Steam takes the list as a whole, so the entries that were
    // never read would be scattered through the ones that were. The write is
    // not offered here at all — no checkbox, no "anyway", because there is no
    // reading of this state under which sending would be right.
    if (!page.verdict.ok) {
      panel.say(
        `<b>The wishlist was read only in part, so nothing will be written.</b><br>` +
          `${escapeHtml(page.verdict.message)}<br>` +
          `<span class="muted">Read: ${escapeHtml(page.route)}; scrolling: ` +
          `${escapeHtml(page.scrollerRoute)}.</span><br>` +
          'The page loads its rows as it is scrolled. Scroll the wishlist to the very end by hand, ' +
          'reload it, and pick the file again.',
        'error',
      );
      page = null;
      return;
    }

    target = buildTargetOrder({ items: order.items, remove: order.remove, pageAppIds: page.appIds });
    showReport();
  });

  /** Builds the report and the clickable plan. Changes nothing on the page. */
  function showReport() {
    const lines = [
      `The file holds <b>${order.items.length}</b> ${plural(order.items.length, 'entry', 'entries')}` +
        `${order.exportedAt ? `, exported on ${escapeHtml(order.exportedAt.slice(0, 10))}` : ''}.`,
      `<b>${target.placed.length}</b> of them were found on the page, and the request will carry ` +
        `<b>${target.appIds.length}</b> ${plural(target.appIds.length, 'entry', 'entries')} — the whole ` +
        'wishlist, because Steam takes the order as a whole and scatters whatever is left out of it.',
    ];
    let tone = 'ok';

    lines.push(`<span class="muted">${escapeHtml(page.verdict.message)}</span>`);
    if (page.verdict.reason === 'unnumbered') tone = 'warn';

    if (order.versionWarning) {
      tone = 'warn';
      lines.push(escapeHtml(order.versionWarning));
    }

    // Whose list is on the screen, said before anything is written rather than
    // after the backup and the confirmation are already behind the user. It
    // does not decide where the request goes — the endpoint names no account —
    // so an account that could not be worked out is a sentence and not a lock.
    const resolved = readOpenWishlist({
      pathname: location.pathname,
      candidates: findOwnerCandidates(),
    });
    if ('error' in resolved) {
      owner = null;
      panel.say([...lines, `<b>${escapeHtml(resolved.message)}</b>`].join('<br>'), 'error');
      panel.preview.disabled = false;
      panel.copy.disabled = false;
      panel.writeBox.hidden = true;
      renderPlan();
      return;
    }
    owner = resolved;

    lines.push(
      'The order goes to the wishlist of the account this browser is signed in as — the address of the ' +
        'request names no account at all.',
    );
    if (resolved.steamId) {
      // The list on the screen, named before the write and again at the
      // confirmation. This is the last place a wrong list is still free to spot.
      lines.push(`The wishlist open here belongs to <b>${escapeHtml(describeAccount(resolved))}</b>.`);
    }
    if (resolved.note) {
      tone = 'warn';
      lines.push(escapeHtml(resolved.note));
    }

    if (order.duplicates.length > 0) {
      tone = 'warn';
      lines.push(
        `The file lists the same App ID more than once: ${order.duplicates.map((id) => `App ${id}`).join(', ')}. ` +
          'Only the first occurrence is used.',
      );
    }
    if (target.missing.length > 0) {
      tone = 'warn';
      const sample = target.missing.slice(0, 5).map((item) => escapeHtml(item.title || `App ${item.appId}`));
      lines.push(
        `Not found on the page: <b>${target.missing.length}</b> — ${sample.join(', ')}` +
          `${target.missing.length > sample.length ? ' and others' : ''}. ` +
          'That usually means the game has been bought or taken off the wishlist; they are skipped.',
      );
    }
    if (target.extra.length > 0) {
      lines.push(
        `<span class="muted">On the page but not in the file: <b>${target.extra.length}</b> ` +
          `${plural(target.extra.length, 'entry', 'entries')} — added to the wishlist after the export. ` +
          'They go after the ordered part, in the order the page shows them now. None of them is lost.</span>',
      );
    }
    if (page.duplicates.length > 0) {
      tone = 'warn';
      lines.push(`Duplicates on the page: ${page.duplicates.map((id) => `App ${id}`).join(', ')}.`);
    }
    if (target.removals.length > 0) {
      lines.push(
        `Marked as “remove from the wishlist”: <b>${target.removals.length}</b>. They go to the very end ` +
          'of the order and are listed below — <b>the script deletes nothing</b>, taking them off is yours.',
      );
    }

    lines.push(
      '<span class="muted">The matching goes by App ID; the titles are there for you to read, nothing more. ' +
        `Read: ${escapeHtml(page.route)}; scrolling: ${escapeHtml(page.scrollerRoute)}.</span>`,
    );
    panel.say(lines.join('<br>'), tone);

    panel.preview.disabled = false;
    panel.copy.disabled = false;
    panel.writeBox.hidden = false;
    panel.confirm.textContent =
      `Confirm: write ${target.appIds.length} ${plural(target.appIds.length, 'entry', 'entries')}`;
    updateSendButton();
    renderRemovals();
    renderPlan();
  }

  /** The entries the user has to take off the wishlist themselves. */
  function renderRemovals() {
    panel.removals.innerHTML = '';
    if (target.removals.length === 0) return;

    const titles = new Map(order.remove.map((item) => [item.appId, item.title]));
    const box = document.createElement('div');
    box.className = 'box';

    const caption = document.createElement('div');
    caption.innerHTML =
      '<b>To be removed by hand.</b> These go to the end of the order; the script deletes nothing, ' +
      'because a deletion cannot be taken back.';
    box.append(caption);

    const list = document.createElement('ol');
    for (const appId of target.removals) {
      const line = document.createElement('li');
      const link = document.createElement('a');
      link.href = `${STEAM_ORIGIN}/app/${appId}/`;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = titles.get(appId) || page.titles.get(appId) || `App ${appId}`;
      line.append(link);
      list.append(line);
    }
    box.append(list);
    panel.removals.append(box);
  }

  /** The target order, clickable. */
  function renderPlan() {
    const container = panel.plan;
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'plan';

    const caption = document.createElement('div');
    caption.className = 'muted';
    caption.textContent = 'The target order — click a line to find it on the page:';
    box.append(caption);

    const missing = new Set(target.missing.map((item) => item.appId));
    for (const item of order.items) {
      const line = document.createElement('div');
      line.className = 'plan-item';
      const isMissing = missing.has(item.appId);

      const number = document.createElement('span');
      number.className = 'plan-num';
      number.textContent = `#${item.position}`;

      const title = document.createElement('span');
      title.className = `plan-title${isMissing ? ' plan-missing' : ''}`;
      title.textContent = `${item.title || `App ${item.appId}`}${isMissing ? ' — not on the page' : ''}`;

      line.append(number, title);
      if (!isMissing) line.addEventListener('click', () => highlighter.reveal(item.appId));
      box.append(line);
    }

    container.append(box);
  }

  // --------------------------------------------------------------------------
  // The backup
  // --------------------------------------------------------------------------

  /** The write stays out of reach until the backup is taken or waived. */
  function updateSendButton() {
    panel.send.disabled = !target || !(backupTaken || panel.skipBackup.checked);
  }

  panel.skipBackup.addEventListener('change', updateSendButton);

  panel.backup.addEventListener('click', () => {
    if (!page) return;
    const rows = page.appIds.map((appId) => ({ appId, title: page.titles.get(appId) ?? `App ${appId}` }));
    const now = new Date().toISOString();
    download(`${JSON.stringify(buildBackupOrder(rows, now), null, 2)}\n`, `wishlist-backup-${now.slice(0, 10)}.json`);
    backupTaken = true;
    panel.backup.textContent = 'Backup downloaded — download it again';
    updateSendButton();
    panel.say(
      `The backup holds the <b>${rows.length}</b> ${plural(rows.length, 'entry', 'entries')} of the wishlist ` +
        'in the order it is in right now. To undo a write, pick that file with this same script and write ' +
        'it back.',
      'ok',
    );
  });

  // --------------------------------------------------------------------------
  // The write
  // --------------------------------------------------------------------------

  panel.send.addEventListener('click', () => {
    panel.confirmBox.hidden = false;
    panel.send.disabled = true;
    panel.say(
      `About to write <b>${target.appIds.length}</b> ${plural(target.appIds.length, 'entry', 'entries')} into ` +
        'the wishlist of the account this browser is signed in as, in one request, replacing the order ' +
        `you have now. ${
          owner?.steamId
            ? `The list open on this page is the one of <b>${escapeHtml(describeAccount(owner))}</b>.`
            : 'Which account the list on this page belongs to could not be worked out — look it over ' +
              'once more before going ahead.'
        }<br>` +
        'All ' +
        `<b>${target.appIds.length}</b> ${plural(target.appIds.length, 'entry', 'entries')} will come out ` +
        'with a priority number, including the ones that have none today. The backup undoes the order, ' +
        'not that. Press “Confirm” to go ahead.',
      'warn',
    );
  });

  panel.cancel.addEventListener('click', () => {
    panel.confirmBox.hidden = true;
    updateSendButton();
    panel.say('Cancelled. Nothing was written.', 'muted');
  });

  panel.confirm.addEventListener('click', async () => {
    if (!target) return;
    panel.confirmBox.hidden = true;
    panel.confirm.disabled = true;

    // The page is read again here rather than trusted from the report: it
    // redraws itself while the panel is open, and a wishlist that turned into
    // somebody else's between the two steps is the one case worth stopping on.
    const resolved = readOpenWishlist({
      pathname: location.pathname,
      candidates: findOwnerCandidates(),
    });
    if ('error' in resolved) {
      panel.say(escapeHtml(resolved.message), 'error');
      panel.confirm.disabled = false;
      updateSendButton();
      return;
    }
    if (owner?.steamId && resolved.steamId && resolved.steamId !== owner.steamId) {
      panel.say(
        '<b>The wishlist on this page changed between the report and this confirmation.</b> The report ' +
          `named ${escapeHtml(owner.steamId)}, the page now says ${escapeHtml(resolved.steamId)}. Nothing ` +
          'was written — the entries below were read off the earlier list. Reload the page and pick the ' +
          'file again.',
        'error',
      );
      panel.confirm.disabled = false;
      updateSendButton();
      return;
    }

    panel.say(`Sending the order: <b>${target.appIds.length}</b> entries, one request…`);
    const answer = await sendReorder({ appIds: target.appIds });
    panel.confirm.disabled = false;

    if (!answer.ok) {
      panel.say(escapeHtml(answer.message), 'error');
      updateSendButton();
      if (answer.kind === 'too-large') offerTheManualWay();
      return;
    }

    const stored = rememberPendingCheck(target.appIds);
    panel.verifyBox.hidden = false;
    panel.say(
      `${escapeHtml(answer.message)}<br>` +
        'What Steam answered is not proof. Press “Reload and check the result”: the wishlist will be read ' +
        'again and compared with what was sent, entry by entry.' +
        (stored
          ? ''
          : '<br><span class="warn">The browser refused the session storage, so the check cannot survive ' +
            'the reload. Look the wishlist over yourself after reloading.</span>'),
      'ok',
    );
  });

  /** Shown when the write is impossible: the manual way is still a way. */
  function offerTheManualWay() {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML =
      '<b>Carrying it by hand.</b><br>' +
      '1. Sort the wishlist by <b>Your rank</b> and clear the filters — dragging is not available otherwise.<br>' +
      '2. Press “Show the order on the page”: every row gets the number it has to end up at.<br>' +
      '3. Drag them from the top down — #1, #2, #3. Steam saves every move itself.';
    panel.plan.prepend(hint);
  }

  panel.verify.addEventListener('click', () => {
    location.reload();
  });

  // --------------------------------------------------------------------------
  // Preview and clipboard
  // --------------------------------------------------------------------------

  panel.preview.addEventListener('click', () => {
    if (!order) return;
    highlighter.start(
      order.items.map((item) => ({
        appId: item.appId,
        position: item.position,
        title: item.title,
        category: item.category,
      })),
      order.remove,
    );
    panel.clear.disabled = false;
    panel.preview.disabled = true;
  });

  panel.clear.addEventListener('click', () => {
    highlighter.stop();
    panel.clear.disabled = true;
    panel.preview.disabled = false;
  });

  panel.copy.addEventListener('click', async () => {
    if (!order) return;
    const text = order.items.map((item) => `${item.position}. ${item.title || `App ${item.appId}`}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      panel.copy.textContent = 'Copied';
      setTimeout(() => {
        panel.copy.textContent = 'Copy the list';
      }, 1500);
    } catch {
      panel.say(
        'The browser refused access to the clipboard. The whole list is visible below — copy it by selecting it.',
        'warn',
      );
    }
  });

  // --------------------------------------------------------------------------
  // A write from before the reload waits for its check
  // --------------------------------------------------------------------------

  const pending = readPendingCheck();
  if (pending) void runPendingCheck(pending);
})();
