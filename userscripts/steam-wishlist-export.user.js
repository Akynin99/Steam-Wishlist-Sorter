// ==UserScript==
// @name         Steam Wishlist Sorter — экспорт списка желаемого
// @namespace    https://github.com/Akynin99/Steam-Wishlist-Sorter
// @version      1.0.0
// @description  Собирает список желаемого со страницы Steam (с учётом ленивой подгрузки) и сохраняет его в JSON для Steam Wishlist Sorter
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
 *  - it changes nothing on the page except its own panel.
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
   * `#wishlist_ctn`, the newer one renders a virtualized list with generated
   * class names. The candidates that survive both are the structural ones —
   * a link to `/app/<id>/` inside a row — so they come last as a safety net.
   *
   * How to update it, when Steam breaks it:
   *  1. open the wishlist, right-click one game → «Inspect»;
   *  2. find the element that wraps the whole line (image + title) and add its
   *     selector to `rows`, first in the list;
   *  3. check that the title, the image and the link inside it are still found
   *     by `title`, `image` and `appLink`; add selectors if they are not;
   *  4. reload and press «Собрать список». The report says how many rows were
   *     found and by which route.
   */
  const STEAM = {
    /** Wishlist lives at /wishlist/profiles/<steamid64>/ and /wishlist/id/<vanity>/. */
    pathPattern: /^\/wishlist\/(profiles|id)\//i,

    /**
     * The element that actually scrolls. The lazy loading of the wishlist is
     * driven by its scroll event, so scrolling the wrong thing loads nothing.
     * When none of the candidates matches, the script scrolls the window,
     * which is what the older layout does.
     */
    scrollers: ['#wishlist_ctn', '.wishlist_ctn', '#page_content', '[class*="WishlistScroll"]'],

    /** One wishlist entry, the whole line. */
    rows: [
      '.wishlist_row', // classic layout
      '[id^="wishlist_row_"]', // same layout, addressed by id
      '[data-appid][class*="wishlist" i]',
      '[class*="WishlistRow"]',
      '[class*="wishlist_row"]',
    ],

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
   * The scrolling element of the list, or `window` when the page itself scrolls.
   *
   * @returns {Element|Window}
   */
  function findScroller() {
    for (const selector of STEAM.scrollers) {
      const element = document.querySelector(selector);
      if (element && element.scrollHeight > element.clientHeight + 40) return element;
    }
    return window;
  }

  /**
   * Rows currently present in the DOM, together with the route they were found
   * by — the report tells the user whether the known selectors still work.
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

    // Nothing known matched. Fall back to the one thing every layout must have:
    // a link to the store page of the game. The row is then the highest
    // ancestor that still contains exactly this one link.
    const links = [...document.querySelectorAll(STEAM.appLink)].filter(
      (link) => appIdFromHref(link.getAttribute('href')) !== null,
    );
    const rows = new Set();
    for (const link of links) {
      const row = rowAroundLink(link);
      if (row) rows.add(row);
    }
    return { rows: [...rows], route: rows.size > 0 ? 'запасной разбор по ссылкам на /app/' : 'ничего' };
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
      if (current === document.body || current === document.documentElement) break;
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
   * App id of a row: from an attribute, from the element id, or from the link.
   *
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
      if (text === 'game' || text === 'игра') return 'game';
    }

    // A standalone "DLC" badge, whatever class it happens to carry today.
    const badge = [...row.querySelectorAll('span, div, i')].some(
      (node) => node.children.length === 0 && node.textContent.trim().toUpperCase() === 'DLC',
    );
    return badge ? 'dlc' : 'unknown';
  }

  /**
   * Vertical position of a row inside the scrolled content. The list is
   * virtualized and positioned absolutely, so the order of the nodes in the
   * DOM means nothing — the coordinate is what the user actually sees.
   *
   * @param {Element} row
   * @param {Element|Window} scroller
   * @returns {number}
   */
  function readOffset(row, scroller) {
    const rect = row.getBoundingClientRect();
    if (scroller === window) return rect.top + window.scrollY;
    const box = scroller.getBoundingClientRect();
    return rect.top - box.top + scroller.scrollTop;
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
   * Walks the whole wishlist and returns every entry it saw.
   *
   * The loop is bounded three times over — by wall clock, by the number of
   * steps and by the "nothing new at the bottom" counter — because a page that
   * keeps growing while it is scrolled is exactly the shape of an endless loop.
   *
   * @param {(progress: { found: number, step: number }) => void} onProgress
   * @param {() => boolean} cancelled
   * @returns {Promise<{ items: object[], route: string, steps: number, timedOut: boolean,
   *                     cancelled: boolean, reachedBottom: boolean }>}
   */
  async function collect(onProgress, cancelled) {
    const scroller = findScroller();
    const startedAt = Date.now();
    const restoreTop = scrollMetrics(scroller).top;

    /** @type {Map<number, { appId: number, title: string, url: string, imageUrl: string, kind: string, offset: number, seq: number }>} */
    const seen = new Map();
    let route = 'ничего';
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
        const offset = readOffset(row, scroller);
        const known = seen.get(appId);
        if (known) {
          // The same row may be met again after a re-render; keep the newest
          // coordinate, it is the one the current layout uses.
          known.offset = offset;
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

    const items = [...seen.values()]
      .sort((a, b) => a.offset - b.offset || a.seq - b.seq)
      .map((entry, index) => ({
        appId: entry.appId,
        title: entry.title,
        url: entry.url,
        imageUrl: entry.imageUrl,
        wishlistPosition: index + 1,
        kind: entry.kind,
      }));

    return { items, route, steps, timedOut, cancelled: stopped, reachedBottom };
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
          <b>Wishlist Sorter — экспорт</b>
          <button class="close" type="button" title="Закрыть">✕</button>
        </div>
        <div class="body">
          <div class="status muted">Нажмите «Собрать список»: страница прокрутится сама, чтобы подгрузились все позиции.</div>
          <div class="row">
            <button class="primary" type="button" data-act="run">Собрать список</button>
            <button type="button" data-act="stop" disabled>Остановить</button>
            <button type="button" data-act="save" disabled>Скачать JSON</button>
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
   * @param {number} count
   * @param {[string, string, string]} forms
   * @returns {string}
   */
  function plural(count, forms) {
    const n = Math.abs(count) % 100;
    if (n > 10 && n < 20) return forms[2];
    const tail = n % 10;
    if (tail === 1) return forms[0];
    if (tail >= 2 && tail <= 4) return forms[1];
    return forms[2];
  }

  /** Escapes text that goes into the panel through `innerHTML`. */
  const escapeHtml = (text) =>
    String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

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
    download(payload, `steam-wishlist-${stamp}.json`);
  });

  panel.run.addEventListener('click', async () => {
    cancelled = false;
    payload = '';
    panel.run.disabled = true;
    panel.save.disabled = true;
    panel.stop.disabled = false;
    panel.say('Прокручиваю страницу…');

    const expected = readExpectedCount();
    let result;
    try {
      result = await collect(
        ({ found, step }) =>
          panel.say(
            `Прокручиваю страницу: собрано <b>${found}</b> ${plural(found, ['позиция', 'позиции', 'позиций'])}` +
              `<br><span class="muted">шаг ${step}, страница листается сама — не трогайте её</span>`,
          ),
        () => cancelled,
      );
    } catch (error) {
      panel.say(
        `Сбор прервался ошибкой: ${escapeHtml(error.message)}.<br>` +
          'Перезагрузите страницу и попробуйте ещё раз; если повторяется — вёрстка Steam изменилась, ' +
          'обновите объект <b>STEAM</b> в начале userscript-а.',
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
        'На странице не найдено ни одной позиции.<br>' +
          'Скорее всего, Steam изменил вёрстку wishlist-а. Файл не создан.<br>' +
          '<span class="muted">Что делать: откройте userscript, найдите объект <b>STEAM</b> в начале файла ' +
          'и обновите селекторы <b>rows</b> / <b>titles</b> — там же расписано, как это сделать. ' +
          'Запасной путь без userscript-а описан в README проекта.</span>',
        'error',
      );
      return;
    }

    payload = buildJson(result.items);

    const found = result.items.length;
    const lines = [
      `Собрано <b>${found}</b> ${plural(found, ['позиция', 'позиции', 'позиций'])}.`,
      `<span class="muted">Разбор: ${escapeHtml(result.route)}; шагов прокрутки: ${result.steps}.</span>`,
    ];
    let tone = 'ok';

    if (result.cancelled) {
      tone = 'warn';
      lines.push('<b>Сбор остановлен вручную</b> — список наверняка неполный.');
    } else if (result.timedOut) {
      tone = 'warn';
      lines.push('<b>Сработало ограничение по времени или числу шагов</b> — список может быть неполным.');
    } else if (!result.reachedBottom) {
      tone = 'warn';
      lines.push('<b>Низ списка не был достигнут</b> — список может быть неполным.');
    }

    if (expected !== null && expected !== found) {
      tone = 'warn';
      lines.push(
        `Steam на этой странице сообщает про <b>${expected}</b>, а собрано <b>${found}</b>. ` +
          'Прокрутите список до конца вручную и запустите сбор ещё раз.',
      );
    }

    const unknown = result.items.filter((item) => item.kind === 'unknown').length;
    if (unknown > 0) {
      lines.push(
        `<span class="muted">У ${unknown} ${plural(unknown, ['позиции', 'позиций', 'позиций'])} ` +
          'тип не определён: страница не показывает пометку «DLC». Это нормально, приложение ' +
          'считает такой тип неизвестным и не выдумывает его.</span>',
      );
    }

    lines.push('Нажмите «Скачать JSON» и загрузите файл в Steam Wishlist Sorter.');
    panel.say(lines.join('<br>'), tone);
    panel.save.disabled = false;
  });
})();
