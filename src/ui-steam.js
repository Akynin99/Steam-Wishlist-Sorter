/**
 * The card that brings a wishlist over straight from a Steam account.
 *
 * The work itself is done by the local server: no Steam endpoint sends a CORS
 * header, so the page is not allowed to ask Steam anything, and `server.js`
 * asks on its behalf. This module only drives that conversation — it sends an
 * account, reads the stream of events that comes back, and puts what arrives
 * into the session as it arrives.
 *
 * Three things it is careful about:
 *
 *  - The card asks the server whether it is there at all. Opened from GitHub
 *    Pages there is no server behind the page, and a card that explains that
 *    is worth more than a button that fails.
 *  - Titles land in the session while they are still coming. A wishlist of two
 *    hundred takes minutes, and a closed tab or a Steam that stops answering
 *    must not undo the part that already worked.
 *  - Every state the card can be in is kept as data and drawn from it, so a
 *    language change in the middle of a running import rewrites the progress
 *    line instead of leaving it in the previous language.
 */

import { plural, t } from './i18n.js';
import { isPlaceholderTitle } from './model.js';
import { SteamError, readEventStream } from './steam.js';

/** Endpoints of the local server, relative to the page. */
const HEALTH_URL = 'api/health';
const WISHLIST_URL = 'api/steam/wishlist';
const TITLES_URL = 'api/steam/titles';

/**
 * How many titles are collected before they are written to the session.
 *
 * Every write re-serializes the whole state, so one per title would be waste;
 * a batch this small still means that a run interrupted at any moment costs at
 * most a couple of seconds of fetching.
 */
const FLUSH_EVERY = 8;

/** Dictionary key for every reason the import can fail with. */
const ERROR_KEYS = {
  'empty-input': 'steam.error.emptyInput',
  'invalid-account': 'steam.error.invalidAccount',
  'blocked-host': 'steam.error.invalidAccount',
  'account-not-found': 'steam.error.accountNotFound',
  'wishlist-private': 'steam.error.wishlistPrivate',
  'wishlist-empty': 'steam.error.wishlistEmpty',
  'rate-limited': 'steam.error.rateLimited',
  network: 'steam.error.network',
  'steam-error': 'steam.error.steamError',
  'not-local': 'steam.error.notLocal',
};

/**
 * @param {{ app: object, absorb: Function, finish: Function, fail: Function }} host
 *   `absorb` merges records into the session, `finish` draws the summary of a
 *   run and `fail` draws a failure — both in the shared feedback block of the
 *   import screen.
 * @returns {{ render: Function }}
 */
export function createSteamCard(host) {
  const nodes = {
    panel: document.getElementById('steam-panel'),
    hint: document.getElementById('steam-hint'),
    form: document.getElementById('steam-form'),
    account: document.getElementById('steam-account'),
    run: document.getElementById('steam-run'),
    progress: document.getElementById('steam-progress'),
    progressText: document.getElementById('steam-progress-text'),
    progressFill: document.getElementById('steam-progress-fill'),
    cancel: document.getElementById('steam-cancel'),
    missing: document.getElementById('steam-missing'),
    missingText: document.getElementById('steam-missing-text'),
    missingRun: document.getElementById('steam-missing-run'),
    unavailable: document.getElementById('steam-unavailable'),
  };

  /** `null` until the server has answered, then whether it can do the import. */
  let available = null;

  /** Whether the question has already been asked. It is asked once. */
  let asked = false;

  /** The run in flight, or `null`. */
  let running = null;

  /**
   * Where the run has got to, as data rather than as a sentence.
   *
   * @type {{ step: string, done: number, total: number, seconds: number }}
   */
  let progress = { step: 'account', done: 0, total: 0, seconds: 0 };

  /**
   * Items of the session that are still shown by their app id. Read from the
   * session rather than remembered, so the offer to fetch the rest survives a
   * reload — and so it also covers a list that came in from the userscript
   * with app ids and nothing else.
   *
   * @returns {number[]}
   */
  function untitledAppIds() {
    return host.app.session
      .getItems()
      .filter((item) => isPlaceholderTitle(item.title))
      .map((item) => item.appId);
  }

  /* ------------------------------------------------------ the server */

  /** Asks once whether there is a server behind this page. */
  function checkAvailability() {
    asked = true;
    fetch(HEALTH_URL, { headers: { accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((health) => {
        available = health?.steamImport === true;
        render();
      })
      .catch(() => {
        // No server, or it went away: the card says so instead of guessing.
        available = false;
        render();
      });
  }

  /* --------------------------------------------------------- the run */

  /**
   * Runs one conversation with the local server and feeds every event of it
   * to `onEvent`.
   *
   * @param {string} url
   * @param {(event: object) => void} onEvent
   */
  async function consume(url, onEvent) {
    const response = await fetch(url, { signal: running.controller.signal });
    if (!response.body) {
      throw new SteamError('steam-error', `The local server answered ${response.status}`);
    }
    for await (const event of readEventStream(response.body)) onEvent(event);
  }

  /** Fetches the wishlist of the account in the field. */
  async function runWishlist() {
    const account = nodes.account.value.trim();
    if (!account) {
      host.fail({ titleKey: 'steam.error.title', textKey: ERROR_KEYS['empty-input'] });
      nodes.account.focus();
      return;
    }

    await runStream(
      `${WISHLIST_URL}?account=${encodeURIComponent(account)}`,
      { run: 'wishlist', account, items: 0 },
    );
  }

  /** Asks again for the titles that are still missing. */
  async function runMissingTitles() {
    const appIds = untitledAppIds();
    if (appIds.length === 0) return;
    await runStream(
      `${TITLES_URL}?appids=${appIds.join(',')}`,
      { run: 'titles', account: '', items: host.app.session.itemCount },
    );
  }

  /**
   * The body of both runs: read events, put what arrives into the session,
   * and end with a summary of what happened — however it ended.
   *
   * @param {string} url
   * @param {{ run: string, account: string, items: number }} start
   */
  async function runStream(url, start) {
    running = { controller: new AbortController() };
    progress = { step: 'account', done: 0, total: 0, seconds: 0 };

    const summary = { ...start, throttled: null, cancelled: false };
    /** Titles waiting to be written to the session. */
    let pending = [];
    let failure = null;

    const flush = () => {
      if (pending.length === 0) return;
      host.absorb(pending);
      pending = [];
    };

    render();

    try {
      await consume(url, (event) => {
        switch (event.type) {
          case 'account':
            progress = { ...progress, step: 'wishlist' };
            break;

          case 'wishlist':
            // The list itself goes in at once, before a single title: from
            // here on the work survives a closed tab.
            summary.items = event.total;
            host.absorb(event.items);
            progress = { step: 'titles', done: 0, total: event.total, seconds: 0 };
            break;

          case 'titles':
            progress = { step: 'titles', done: 0, total: event.total, seconds: 0 };
            break;

          case 'title':
            pending.push({ appId: event.appId, title: event.title, kind: event.kind });
            if (pending.length >= FLUSH_EVERY) flush();
            progress = { step: 'titles', done: event.done, total: event.total, seconds: 0 };
            break;

          case 'title-missing':
            progress = { step: 'titles', done: event.done, total: event.total, seconds: 0 };
            break;

          case 'waiting':
            progress = {
              step: 'waiting',
              done: event.done,
              total: event.total,
              seconds: Math.round(event.waitMs / 1000),
            };
            break;

          case 'rate-limited':
            summary.throttled = { done: event.done, total: event.total };
            break;

          case 'error':
            failure = event;
            break;

          default:
            break;
        }
        render();
      });
    } catch (error) {
      // Cancelling aborts the connection, and an aborted fetch throws here:
      // that is the normal way out, not a failure.
      if (error.name === 'AbortError') summary.cancelled = true;
      else failure = { code: error.code ?? 'network', message: error.message };
    } finally {
      flush();
      running = null;
    }

    if (failure) {
      host.fail({
        titleKey: 'steam.error.title',
        textKey: ERROR_KEYS[failure.code],
        text: ERROR_KEYS[failure.code] ? undefined : t('steam.error.unknown', { message: failure.message }),
      });
      render();
      return;
    }

    // What is still missing is read off the session rather than counted here:
    // a run that was cancelled halfway did not undo the titles an earlier run
    // had already collected, and the summary must not claim it did.
    summary.items = summary.items || host.app.session.itemCount;
    summary.missing = untitledAppIds().length;
    summary.titles = Math.max(0, summary.items - summary.missing);
    host.finish(summary);
    render();
  }

  /* ------------------------------------------------------- the words */

  /**
   * The progress line, built from the state every time it is drawn.
   *
   * @returns {string}
   */
  function progressText() {
    if (progress.step === 'account') return t('steam.step.account');
    if (progress.step === 'wishlist') return t('steam.step.wishlist');
    if (progress.step === 'waiting') return t('steam.step.waiting', { seconds: progress.seconds });
    return t('steam.step.titles', { done: progress.done, total: progress.total });
  }

  /* --------------------------------------------------------- events */

  nodes.run.addEventListener('click', () => {
    if (!running) runWishlist();
  });

  nodes.account.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !running) {
      event.preventDefault();
      runWishlist();
    }
  });

  nodes.cancel.addEventListener('click', () => {
    running?.controller.abort();
  });

  nodes.missingRun.addEventListener('click', () => {
    if (!running) runMissingTitles();
  });

  /** Draws the card in whatever state it is in. */
  function render() {
    if (!asked) checkAvailability();

    if (available === null) {
      nodes.form.hidden = false;
      nodes.unavailable.hidden = true;
      nodes.run.disabled = true;
      nodes.run.textContent = t('steam.checking');
      return;
    }

    // With no server behind the page the promise of the card cannot be kept,
    // so it is withdrawn rather than left standing over the explanation.
    nodes.hint.hidden = !available;
    nodes.form.hidden = !available;
    nodes.unavailable.hidden = available;
    nodes.panel.classList.toggle('panel--steam-off', !available);

    if (!available) {
      nodes.progress.hidden = true;
      nodes.missing.hidden = true;
      return;
    }

    nodes.run.textContent = t('steam.run');
    nodes.run.disabled = running !== null;
    nodes.account.disabled = running !== null;

    nodes.progress.hidden = running === null;
    if (running) {
      nodes.progressText.textContent = progressText();
      const share = progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
      nodes.progressFill.style.width = `${Math.round(share * 100)}%`;
    }

    const untitled = untitledAppIds().length;
    nodes.missing.hidden = untitled === 0 || running !== null;
    if (untitled > 0) {
      nodes.missingText.textContent = plural('steam.missing.text', untitled);
      nodes.missingRun.disabled = running !== null;
    }
  }

  return { render };
}
