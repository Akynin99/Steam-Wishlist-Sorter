// ==UserScript==
// @name         Steam Wishlist Sorter — carry the order into Steam
// @namespace    https://github.com/Akynin99/Steam-Wishlist-Sorter
// @version      2.0.0
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
 * `POST /wishlist/profiles/<steamid64>/reorder/` with the field `sessionid` and
 * the whole list of `appids[]` in the order the wishlist has to end up in. This
 * script sends the same request, once, with the list it built out of the file
 * and the page. The endpoint is not documented and not supported by Valve: it
 * is what the page itself uses, and it may change without a word.
 *
 * The list is sent **whole**. A partial list is not a partial reorder — Steam
 * spreads the entries it was given through the ones it was not, and the result
 * is a shuffle nobody asked for.
 *
 * ## Where `sessionid` comes from and where it goes
 *
 * From `g_sessionID`, the variable the wishlist page defines for its own
 * requests, in the page this script already runs in. It goes into the body of
 * that one POST, to the same origin the page was loaded from, and nowhere else:
 * it is never written to a file, never put into `localStorage` or
 * `sessionStorage`, never printed into the panel or the console, and never sent
 * to the local server of the application. There is no `@connect` and no
 * `@grant`, so the script could not reach another host even if it tried.
 *
 * ## What it refuses to do
 *
 *  - it deletes nothing. The entries the user marked as "remove from the
 *    wishlist" are put at the end of the order and listed in the panel — taking
 *    them off is a click of theirs, because a deletion cannot be undone;
 *  - it loses nothing. An entry that is on the page but not in the file keeps
 *    its place relative to the other such entries and is appended after the
 *    ordered part, so nothing silently falls out of the wishlist;
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
    scrollers: ['#wishlist_ctn', '.wishlist_ctn', '#page_content', '[class*="WishlistScroll"]'],
    rows: [
      '.wishlist_row',
      '[id^="wishlist_row_"]',
      '[data-appid][class*="wishlist" i]',
      '[class*="WishlistRow"]',
      '[class*="wishlist_row"]',
    ],
    appIdAttributes: ['data-app-id', 'data-appid', 'data-ds-appid'],
    appIdFromElementId: /^wishlist_row_(\d+)$/i,
    appLink: 'a[href*="/app/"]',
    titles: ['.title', 'a.title', '[class*="title" i]', 'h2', 'h3'],
    images: ['img.capsule', 'img[src*="/apps/"]', 'img[src*="steamstatic"]', 'img'],
  };

  /** The one origin every request of this script goes to — the page's own. */
  const STEAM_ORIGIN = 'https://store.steampowered.com';

  /** Same bounds as the export script: the page must never spin forever. */
  const TIME_BUDGET_MS = 180_000;
  const MAX_SCROLL_STEPS = 800;
  const GROWTH_TIMEOUT_MS = 2000;
  const POLL_MS = 100;
  const STABLE_STEPS_AT_BOTTOM = 3;
  const SCROLL_STEP_RATIO = 0.8;

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
   * app ids and a timestamp. It never holds `sessionid`: that one lives in the
   * body of a single request and nowhere else.
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

  /** @returns {Element|Window} */
  function findScroller() {
    for (const selector of STEAM.scrollers) {
      const element = document.querySelector(selector);
      if (element && element.scrollHeight > element.clientHeight + 40) return element;
    }
    return window;
  }

  /**
   * @param {Element} row
   * @returns {number|null}
   */
  function readAppId(row) {
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
      if (current === document.body || current === document.documentElement) break;
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
   * @returns {{ rows: Element[], route: string }}
   */
  function findRows() {
    for (const selector of STEAM.rows) {
      let found = [];
      try {
        found = [...document.querySelectorAll(selector)];
      } catch {
        continue;
      }
      const usable = found.filter((row) => readAppId(row) !== null);
      if (usable.length > 0) return { rows: usable, route: selector };
    }

    const rows = new Set();
    for (const link of document.querySelectorAll(STEAM.appLink)) {
      if (appIdFromHref(link.getAttribute('href')) === null) continue;
      const row = rowAroundLink(link);
      if (row) rows.add(row);
    }
    return { rows: [...rows], route: rows.size > 0 ? 'fallback parsing by /app/ links' : 'nothing' };
  }

  /**
   * @param {Element|Window} scroller
   * @returns {{ top: number, height: number, view: number }}
   */
  function scrollMetrics(scroller) {
    if (scroller === window) {
      const doc = document.scrollingElement ?? document.documentElement;
      return { top: window.scrollY, height: doc.scrollHeight, view: window.innerHeight };
    }
    return { top: scroller.scrollTop, height: scroller.scrollHeight, view: scroller.clientHeight };
  }

  /**
   * @param {Element|Window} scroller
   * @param {number} top
   */
  function scrollTo(scroller, top) {
    if (scroller === window) window.scrollTo(0, top);
    else scroller.scrollTop = top;
  }

  /**
   * Walks the whole list and returns the app ids it is made of, in the order
   * they are shown, together with the titles the backup file needs. Reading the
   * page changes nothing on it, so this runs before any confirmation — a report
   * needs real numbers to be worth anything.
   *
   * @param {(found: number) => void} onProgress
   * @returns {Promise<{ appIds: number[], titles: Map<number, string>, duplicates: number[],
   *                     route: string, timedOut: boolean }>}
   */
  async function scanPage(onProgress) {
    const scroller = findScroller();
    const startedAt = Date.now();
    const restoreTop = scrollMetrics(scroller).top;

    /** @type {Map<number, number>} appId -> vertical offset in the scrolled content */
    const offsets = new Map();
    /** @type {Map<number, string>} */
    const titles = new Map();
    /** @type {number[]} */
    const duplicates = [];
    let route = 'nothing';
    let steps = 0;
    let stable = 0;
    let timedOut = false;

    function harvest() {
      const found = findRows();
      if (found.rows.length > 0) route = found.route;
      /** @type {Set<number>} ids met in this very pass, to spot real duplicates */
      const pass = new Set();
      for (const row of found.rows) {
        const appId = readAppId(row);
        if (appId === null) continue;
        const rect = row.getBoundingClientRect();
        const offset =
          scroller === window
            ? rect.top + window.scrollY
            : rect.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
        if (pass.has(appId) && !duplicates.includes(appId)) duplicates.push(appId);
        pass.add(appId);
        offsets.set(appId, offset);
        const known = titles.get(appId);
        if (!known || known === `App ${appId}`) titles.set(appId, readTitle(row, appId));
      }
    }

    harvest();
    onProgress(offsets.size);

    while (true) {
      if (Date.now() - startedAt > TIME_BUDGET_MS || steps >= MAX_SCROLL_STEPS) {
        timedOut = true;
        break;
      }

      const before = offsets.size;
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
        if (offsets.size > before || now.height > metrics.height) {
          grew = true;
          break;
        }
      }

      onProgress(offsets.size);

      if (atBottom && !grew) {
        stable += 1;
        if (stable >= STABLE_STEPS_AT_BOTTOM) break;
      } else {
        stable = 0;
      }
    }

    harvest();
    scrollTo(scroller, restoreTop);

    const appIds = [...offsets.entries()].sort((a, b) => a[1] - b[1]).map(([appId]) => appId);
    return { appIds, titles, duplicates, route, timedOut };
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

  /** A Steam id is 17 digits; nothing else ever goes into an address. */
  const STEAM_ID_PATTERN = /^\d{17}$/;

  /**
   * Address of the reorder endpoint of the wishlist that is open.
   *
   * The id comes from the path of the page or from `g_steamID`, and it is
   * checked against `STEAM_ID_PATTERN` before it goes anywhere near an address:
   * the same rule the local server of the project follows — an address is built
   * out of values that were validated, never out of text as it came.
   *
   * @param {{ pathname: string, loggedInSteamId?: string|null }} input
   * @returns {{ url: string, steamId: string }|{ error: 'unknown-owner'|'not-yours', message: string }}
   */
  function resolveReorderTarget({ pathname, loggedInSteamId = null }) {
    const fromPath = /^\/wishlist\/profiles\/(\d{17})(\/|$)/.exec(String(pathname ?? ''))?.[1] ?? null;
    const mine = STEAM_ID_PATTERN.test(String(loggedInSteamId ?? '')) ? String(loggedInSteamId) : null;

    if (fromPath && mine && fromPath !== mine) {
      return {
        error: 'not-yours',
        message:
          'This wishlist belongs to another account — the one you are signed in with is a different one. ' +
          'Steam would refuse the write, and rightly so. Open your own wishlist and try again.',
      };
    }

    const steamId = fromPath ?? mine;
    if (!steamId) {
      return {
        error: 'unknown-owner',
        message:
          'The Steam ID of this wishlist could not be worked out: the address carries no 17 digit id and ' +
          'the page did not say who is signed in. Open the wishlist by its full address — ' +
          'store.steampowered.com/wishlist/profiles/&lt;your 17 digits&gt;/ — and try again.',
      };
    }

    return { url: `${STEAM_ORIGIN}/wishlist/profiles/${steamId}/reorder/`, steamId };
  }

  /**
   * The session id out of the text of a page script.
   *
   * A function of its own so that it can be tested without a browser, and so
   * that this file holds exactly one expression that knows what the value looks
   * like. The result is used once — in the body of the reorder request — and is
   * never stored, logged or shown.
   *
   * @param {string} text
   * @returns {string|null}
   */
  function sessionIdFromText(text) {
    const match = /g_sessionID\s*=\s*["']([A-Za-z0-9]{8,64})["']/.exec(String(text ?? ''));
    return match ? match[1] : null;
  }

  /**
   * @param {unknown} value
   * @returns {string|null}
   */
  function asSessionId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9]{8,64}$/.test(value) ? value : null;
  }

  /**
   * The session id of the open page.
   *
   * With `@grant none` the script runs in the page itself, so the variable the
   * wishlist defines for its own requests is simply there. When a userscript
   * manager isolates it anyway, the inline scripts of the page are read
   * instead — the same value, out of the same page, without any privileged API.
   *
   * @returns {string|null}
   */
  function findSessionId() {
    const direct =
      asSessionId(window.g_sessionID) ??
      asSessionId(typeof unsafeWindow === 'undefined' ? null : unsafeWindow?.g_sessionID);
    if (direct) return direct;

    for (const script of document.querySelectorAll('script:not([src])')) {
      const found = sessionIdFromText(script.textContent);
      if (found) return found;
    }
    return null;
  }

  /**
   * The Steam id of the signed-in user, the way the page states it.
   *
   * @returns {string|null}
   */
  function findLoggedInSteamId() {
    const candidates = [
      window.g_steamID,
      typeof unsafeWindow === 'undefined' ? null : unsafeWindow?.g_steamID,
      document.querySelector('[data-miniprofile][data-steamid]')?.getAttribute('data-steamid'),
    ];
    for (const candidate of candidates) {
      const value = String(candidate ?? '');
      if (STEAM_ID_PATTERN.test(value)) return value;
    }
    for (const script of document.querySelectorAll('script:not([src])')) {
      const match = /g_steamID\s*=\s*["'](\d{17})["']/.exec(script.textContent ?? '');
      if (match) return match[1];
    }
    return null;
  }

  /**
   * The body of the reorder request, exactly as the page itself sends it: the
   * session id and the whole list of app ids, in order.
   *
   * @param {{ sessionId: string, appIds: number[] }} input
   * @returns {string}
   */
  function buildReorderBody({ sessionId, appIds }) {
    const body = new URLSearchParams();
    body.set('sessionid', sessionId);
    for (const appId of appIds) body.append('appids[]', String(appId));
    return body.toString();
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

    const success = payload?.success;
    if (success === 1 || success === true) {
      return { ok: true, kind: 'ok', message: 'Steam accepted the order.' };
    }
    if (success === undefined) {
      return {
        ok: true,
        kind: 'ok-unknown',
        message:
          'Steam answered without a success field. The answer neither confirms nor denies anything — the ' +
          'check below is what decides.',
      };
    }
    return {
      ok: false,
      kind: 'refused',
      message:
        `Steam refused the order: it answered success = ${JSON.stringify(success)}, and said nothing ` +
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
   * @param {{ url: string, sessionId: string, appIds: number[], fetchImpl?: typeof fetch }} input
   * @returns {Promise<{ ok: boolean, kind: string, message: string }>}
   */
  async function sendReorder({ url, sessionId, appIds, fetchImpl = (target, options) => fetch(target, options) }) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: buildReorderBody({ sessionId, appIds }),
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
          <div class="status muted"></div>

          <div class="box alert" data-act="write-box" hidden>
            <div class="warn"><b>The next step writes into your Steam wishlist.</b></div>
            <div class="muted">
              The order goes to Steam in one request and replaces the one you have now. The endpoint is
              undocumented and the change cannot be undone from inside Steam — so take the backup first.
              It is a file in this very format, and this very script writes it back.
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
        const status = query('.status');
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
      buildBackupOrder,
      buildReorderBody,
      buildTargetOrder,
      compareOrders,
      describeNetworkFailure,
      parseOrderFile,
      readReorderAnswer,
      resolveReorderTarget,
      sendReorder,
      sessionIdFromText,
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

    if (page.appIds.length === 0) {
      panel.say(
        'Not a single wishlist entry was found on the page.<br>' +
          'Most likely Steam has changed the layout. Update the <b>STEAM</b> object at the top of the ' +
          'userscript (the export script spells out how). Nothing was written.',
        'error',
      );
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

    if (order.versionWarning) {
      tone = 'warn';
      lines.push(escapeHtml(order.versionWarning));
    }
    if (page.timedOut) {
      tone = 'warn';
      lines.push(
        'Reading the page hit the time limit — the list may have been read only in part. An order built ' +
          'on half a page would move the other half, so reload and pick the file again.',
      );
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
      '<span class="muted">The matching goes by App ID; the titles are there for you to read, nothing more.</span>',
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
        'the wishlist, in one request, replacing the order you have now. Press “Confirm” to go ahead.',
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

    const resolved = resolveReorderTarget({ pathname: location.pathname, loggedInSteamId: findLoggedInSteamId() });
    if ('error' in resolved) {
      panel.say(resolved.message, 'error');
      panel.confirm.disabled = false;
      updateSendButton();
      return;
    }

    const sessionId = findSessionId();
    if (!sessionId) {
      panel.say(
        'The page did not hand over <b>g_sessionID</b> — the value the wishlist uses for its own requests. ' +
          'Without it Steam accepts nothing, and this script takes it from nowhere else. Reload the page ' +
          '(Ctrl+F5); if it is still missing, check that you are signed in and that the wishlist is your ' +
          'own. Nothing was written.',
        'error',
      );
      panel.confirm.disabled = false;
      updateSendButton();
      return;
    }

    panel.say(`Sending the order: <b>${target.appIds.length}</b> entries, one request…`);
    const answer = await sendReorder({ url: resolved.url, sessionId, appIds: target.appIds });
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
