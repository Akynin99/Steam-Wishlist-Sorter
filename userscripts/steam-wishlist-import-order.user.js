// ==UserScript==
// @name         Steam Wishlist Sorter — carry the order into Steam (preview)
// @namespace    https://github.com/Akynin99/Steam-Wishlist-Sorter
// @version      1.0.0
// @description  Reads the final JSON of Steam Wishlist Sorter, matches it against the wishlist page and shows where each item has to go. Saves nothing.
// @author       Akynin99
// @license      MIT
// @homepageURL  https://github.com/Akynin99/Steam-Wishlist-Sorter
// @match        https://store.steampowered.com/wishlist/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Preview of the final order on the wishlist page itself.
 *
 * ## Why this script does not reorder the wishlist for you
 *
 * The only way Steam offers to set a custom order is dragging a row by hand on
 * the wishlist page, and the drag is committed by a request that carries the
 * session id of the logged in user. Automating that would mean two things this
 * project refuses to do: reading a session token out of the page, and sending a
 * write request to Steam on the user's behalf. On top of that, the list is
 * virtualized — the rows are recycled while it scrolls — so a script that
 * simulated hundreds of drags would fail somewhere in the middle and leave the
 * wishlist in a state nobody asked for.
 *
 * A tool that half-reorders a 200 item wishlist and cannot tell you where it
 * stopped is worse than no tool. So this script stays on the safe side of the
 * line: it reads the file, checks it against the page, shows the target
 * position of every row and lets the user do the dragging.
 *
 * ## What it does not do
 *
 *  - no network requests at all: no `fetch`, no `XMLHttpRequest`, no `@connect`;
 *  - no cookies, no session id, no tokens — and no `@grant`, so it cannot ask
 *    for the privileged APIs either;
 *  - nothing is changed on the page until the user presses the confirm button,
 *    and even then the change is purely visual: badges next to the rows, which
 *    disappear on reload;
 *  - the save button of Steam is never pressed. By anything. Ever.
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
  };

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

  // ==========================================================================
  // Page reading
  // ==========================================================================

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
   * they are shown. Reading the page is not a change to it, so this runs before
   * the confirmation — the report needs real numbers to be worth anything.
   *
   * @param {(found: number) => void} onProgress
   * @returns {Promise<{ appIds: number[], duplicates: number[], route: string, timedOut: boolean }>}
   */
  async function scanPage(onProgress) {
    const scroller = findScroller();
    const startedAt = Date.now();
    const restoreTop = scrollMetrics(scroller).top;

    /** @type {Map<number, number>} appId -> vertical offset in the scrolled content */
    const offsets = new Map();
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
    return { appIds, duplicates, route, timedOut };
  }

  // ==========================================================================
  // The order file
  // ==========================================================================

  /** Error with a message meant for the user, not for a log. */
  class OrderFileError extends Error {}

  /**
   * Reads and checks the JSON produced by "Order as JSON" in the application.
   *
   * The `kind` field is what separates an order from a state dump: a state has
   * a whole session inside it and importing it here would mean showing the user
   * a list that is not the final order at all.
   *
   * @param {string} text
   * @returns {{ items: object[], remove: object[], summary: object|null, exportedAt: string|null,
   *             versionWarning: string|null }}
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
          'Showing it as it is — the preview changes nothing, but read the list over yourself.';

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
      .sort((a, b) => a.position - b.position);

    if (items.length === 0) {
      throw new OrderFileError('Not a single entry of items carries a valid App ID.');
    }

    const remove = (Array.isArray(data.remove) ? data.remove : [])
      .map((item) => ({ appId: Number(item?.appId), title: typeof item?.title === 'string' ? item.title : '' }))
      .filter((item) => Number.isSafeInteger(item.appId) && item.appId > 0);

    return {
      items,
      remove,
      summary: data.summary && typeof data.summary === 'object' ? data.summary : null,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
      versionWarning,
    };
  }

  // ==========================================================================
  // Badges on the page
  // ==========================================================================

  /**
   * Draws the target position next to every row it can identify and keeps
   * doing it while the list scrolls: the rows are recycled by the virtualized
   * list, so a badge drawn once would end up on the wrong game.
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
  // Panel
  // ==========================================================================

  const PANEL_CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
      width: 380px; max-width: calc(100vw - 32px);
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
    .close { border: 0; background: transparent; color: #8b97a5; padding: 2px 6px; }
    input[type=file] { font: inherit; color: #8b97a5; max-width: 100%; }
    ol { margin: 0; padding-left: 20px; display: grid; gap: 3px; }
    .plan { border-top: 1px solid #2a3542; padding-top: 8px; display: grid; gap: 4px; }
    .plan-item { display: flex; gap: 6px; align-items: baseline; cursor: pointer; }
    .plan-item:hover .plan-title { text-decoration: underline; }
    .plan-num { color: #8b97a5; min-width: 34px; text-align: right; }
    .plan-title { flex: 1; }
    .plan-missing { color: #ff8f8f; }
    .hint { background: #17202a; border: 1px solid #2a3542; border-radius: 8px; padding: 10px; }
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
            Pick the “Order as JSON” file from the “Result” screen. The script matches it against the
            page and shows a report. Nothing on the page changes before you confirm it.
          </div>
          <input type="file" accept=".json,application/json" data-act="file">
          <div class="status muted"></div>
          <div class="row">
            <button class="primary" type="button" data-act="apply" disabled>Show the order on the page</button>
            <button type="button" data-act="clear" disabled>Remove the marks</button>
            <button type="button" data-act="copy" disabled>Copy the list</button>
          </div>
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
      apply: query('[data-act="apply"]'),
      clear: query('[data-act="clear"]'),
      copy: query('[data-act="copy"]'),
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

  // ==========================================================================
  // Entry point
  // ==========================================================================

  if (!STEAM.pathPattern.test(location.pathname)) return;

  const panel = createPanel();
  const highlighter = createHighlighter();

  /** @type {ReturnType<typeof parseOrderFile>|null} */
  let order = null;
  /** @type {{ appIds: number[], duplicates: number[], route: string, timedOut: boolean }|null} */
  let page = null;

  panel.file.addEventListener('change', async () => {
    const file = panel.file.files?.[0];
    if (!file) return;

    order = null;
    page = null;
    panel.apply.disabled = true;
    panel.copy.disabled = true;
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

    panel.say('Reading the page: scrolling the list so that every item loads…');
    page = await scanPage((found) =>
      panel.say(`Reading the page: <b>${found}</b> ${plural(found, 'item', 'items')} found…`),
    );

    if (page.appIds.length === 0) {
      panel.say(
        'Not a single wishlist item was found on the page.<br>' +
          'Most likely Steam has changed the layout. Update the <b>STEAM</b> object at the top of the ' +
          'userscript (the export script spells out how). Nothing was applied.',
        'error',
      );
      return;
    }

    showReport();
  });

  /** Builds the report and the clickable plan. Changes nothing on the page. */
  function showReport() {
    const onPage = new Set(page.appIds);
    const inFile = new Set(order.items.map((item) => item.appId));
    const found = order.items.filter((item) => onPage.has(item.appId));
    const missing = order.items.filter((item) => !onPage.has(item.appId));
    const extra = page.appIds.filter((appId) => !inFile.has(appId) && !order.remove.some((r) => r.appId === appId));
    const removable = order.remove.filter((item) => onPage.has(item.appId));

    const lines = [
      `The file holds <b>${order.items.length}</b> ${plural(order.items.length, 'item', 'items')}` +
        `${order.exportedAt ? `, exported on ${escapeHtml(order.exportedAt.slice(0, 10))}` : ''}.`,
      `<b>${found.length}</b> of them were found on the page.`,
    ];
    let tone = 'ok';

    if (order.versionWarning) {
      tone = 'warn';
      lines.push(escapeHtml(order.versionWarning));
    }
    if (page.timedOut) {
      tone = 'warn';
      lines.push('Reading the page hit the time limit — the list on the page may have been read only in part.');
    }
    if (missing.length > 0) {
      tone = 'warn';
      const sample = missing.slice(0, 5).map((item) => escapeHtml(item.title || `App ${item.appId}`));
      lines.push(
        `Not found on the page: <b>${missing.length}</b> — ${sample.join(', ')}` +
          `${missing.length > sample.length ? ' and others' : ''}. ` +
          'That usually means the game has been bought or taken off the wishlist.',
      );
    }
    if (extra.length > 0) {
      lines.push(
        `<span class="muted">The page holds <b>${extra.length}</b> more ` +
          `${plural(extra.length, 'item', 'items')} that the file does not: they were added to the ` +
          'wishlist after the export. The script does not touch their places.</span>',
      );
    }
    if (page.duplicates.length > 0) {
      tone = 'warn';
      lines.push(`Duplicates on the page: ${page.duplicates.map((id) => `App ${id}`).join(', ')}.`);
    }
    if (removable.length > 0) {
      lines.push(
        `Marked for removal from the wishlist: <b>${removable.length}</b>. ` +
          'The script only marks them red — you remove them yourself.',
      );
    }

    lines.push(
      '<span class="muted">The order is matched by App ID; the titles are there for you to read, nothing more.</span>',
    );
    panel.say(lines.join('<br>'), tone);

    panel.apply.disabled = false;
    panel.copy.disabled = false;
    renderPlan(found, missing);
  }

  /**
   * @param {object[]} found
   * @param {object[]} missing
   */
  function renderPlan(found, missing) {
    const container = panel.plan;
    container.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'plan';

    const caption = document.createElement('div');
    caption.className = 'muted';
    caption.textContent = 'The target order — click a line to find it on the page:';
    box.append(caption);

    for (const item of order.items) {
      const line = document.createElement('div');
      line.className = 'plan-item';
      const isMissing = missing.includes(item);

      const number = document.createElement('span');
      number.className = 'plan-num';
      number.textContent = `#${item.position}`;

      const title = document.createElement('span');
      title.className = `plan-title${isMissing ? ' plan-missing' : ''}`;
      title.textContent = `${item.title || `App ${item.appId}`}${isMissing ? ' — not on the page' : ''}`;

      line.append(number, title);
      if (!isMissing) {
        line.addEventListener('click', () => highlighter.reveal(item.appId));
      }
      box.append(line);
    }

    container.append(box);
    void found;
  }

  panel.apply.addEventListener('click', () => {
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
    panel.apply.disabled = true;

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML =
      '<b>The rest is by hand.</b><br>' +
      'Steam offers no reliable way of arranging the list programmatically, so the script saves ' +
      'nothing and presses nothing.<br><br>' +
      '1. In the wishlist sorting, pick your own order (“Your rank”) and clear the filters — ' +
      'dragging is not available otherwise.<br>' +
      '2. Take the items from the top down: #1, #2, #3 — and drag each one to its place. The blue ' +
      'mark on a row shows the number it has to end up at.<br>' +
      '3. The red marks are what you marked as “remove from the wishlist”; take those off yourself.<br>' +
      '4. Steam saves the arrangement itself; the script never presses the save button.';
    panel.plan.prepend(hint);
  });

  panel.clear.addEventListener('click', () => {
    highlighter.stop();
    panel.clear.disabled = true;
    panel.apply.disabled = false;
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
})();
