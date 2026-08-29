/**
 * The one card of the wishlist screen: the card that gets a list into the
 * application.
 *
 * The work itself is done by the local server: no Steam endpoint sends a CORS
 * header, so the page is not allowed to ask Steam anything, and `server.js`
 * asks on its behalf. This module only drives that conversation — it sends an
 * account, reads the stream of events that comes back, and puts what arrives
 * into the session as it arrives.
 *
 * The card is a small state machine, and every state of it is a block that
 * already stands in `index.html`: the form, the progress, the refusal, the
 * loaded list, and the two routes that are left when there is no local server
 * behind the page. `render()` shows one of them and never builds one, so the
 * ids read here are read once and the listeners hung on them keep working.
 *
 * Four things it is careful about:
 *
 *  - The card asks the server whether it is there at all. Opened from GitHub
 *    Pages there is no server behind the page, and a form that cannot work is
 *    not shown at all — two routes that do work take its place.
 *  - A refusal is a state of the card and not a line under it. That is what
 *    gives “Check again” somewhere to live, and it is why the field keeps what
 *    was typed in it: the same value is what the second attempt is made with.
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
import { setProgress } from './ui-common.js';

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
  'wishlist-empty': 'steam.error.wishlistEmpty',
  'rate-limited': 'steam.error.rateLimited',
  network: 'steam.error.network',
  'steam-error': 'steam.error.steamError',
  'not-local': 'steam.error.notLocal',
};

/**
 * The two failures that are not a line of text but a state of the card, and
 * the words each of them is told in.
 *
 * They are apart because Steam does not say the same thing in both. A 401 or
 * a 403 is Steam refusing a list it knows about, and the privacy setting is
 * the reason; a 5xx is the answer to a closed list *and* the answer of a Steam
 * having a bad minute, and claiming the first would send a user off to change
 * a setting that may already be right.
 */
const BLOCKED_TEXTS = {
  'wishlist-private': { title: 'steam.blocked.title', text: 'steam.blocked.text' },
  'wishlist-unavailable': {
    title: 'steam.blocked.unavailableTitle',
    text: 'steam.blocked.unavailableText',
  },
};

/**
 * @param {{ app: object, begin: Function, absorb: Function, finish: Function,
 *           fail: Function }} host
 *   `begin` says that a new run has started, `absorb` merges records into the
 *   session, `finish` draws the summary of a run and `fail` draws a failure
 *   that is only a sentence — all of them in the screen around this card.
 * @returns {{ render: Function, clearFailure: Function }}
 */
export function createSteamCard(host) {
  const nodes = {
    head: document.getElementById('load-head'),
    title: document.getElementById('load-title'),
    sub: document.getElementById('load-sub'),
    iconCloud: document.getElementById('load-icon-cloud'),
    iconLock: document.getElementById('load-icon-lock'),
    iconRoute: document.getElementById('load-icon-route'),

    form: document.getElementById('load-form'),
    account: document.getElementById('steam-account'),
    run: document.getElementById('steam-run'),

    progress: document.getElementById('steam-progress'),
    progressText: document.getElementById('steam-progress-text'),
    progressFill: document.getElementById('steam-progress-fill'),
    cancel: document.getElementById('steam-cancel'),

    blocked: document.getElementById('load-blocked'),
    recheck: document.getElementById('steam-recheck'),

    ready: document.getElementById('load-ready'),
    readyCount: document.getElementById('ready-count'),
    readyNext: document.getElementById('ready-next'),
    again: document.getElementById('load-again'),

    missing: document.getElementById('steam-missing'),
    missingText: document.getElementById('steam-missing-text'),
    missingRun: document.getElementById('steam-missing-run'),

    offline: document.getElementById('load-offline'),
  };

  /** `null` until the server has answered, then whether it can do the import. */
  let available = null;

  /** Whether the question has already been asked. It is asked once. */
  let asked = false;

  /** The run in flight, or `null`. */
  let running = null;

  /**
   * The code of the refusal the card is standing on, or `null`. One of the
   * keys of `BLOCKED_TEXTS`.
   *
   * @type {string|null}
   */
  let blocked = null;

  /**
   * Whether the user asked for the way in again over a list that is already
   * loaded. Without it the card would show the loaded list for good and there
   * would be no way back to the field.
   */
  let wantsForm = false;

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
      host.fail({ titleKey: 'steam.error.title', textKey: 'steam.error.emptyInput' });
      // The refusal is cleared so the field is on screen to be typed into.
      blocked = null;
      wantsForm = true;
      render();
      nodes.account.focus();
      return;
    }

    // From here the field is what the user is working with, and it stays on
    // screen until the run brings a list in: a failure that took the form away
    // would take the value typed into it away with it.
    wantsForm = true;
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
    // A new attempt starts from a clean card: the refusal it may be standing
    // on and the report under it both belong to the previous one.
    blocked = null;
    host.begin();
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
      showFailure(failure);
      return;
    }

    // What is still missing is read off the session rather than counted here:
    // a run that was cancelled halfway did not undo the titles an earlier run
    // had already collected, and the summary must not claim it did.
    summary.items = summary.items || host.app.session.itemCount;
    summary.missing = untitledAppIds().length;
    summary.titles = Math.max(0, summary.items - summary.missing);
    wantsForm = false;
    host.finish(summary);
    render();
  }

  /**
   * Puts a failed run on the screen: the two that have somewhere to go become
   * the state of the card, everything else stays a sentence under it.
   *
   * @param {{ code: string, message: string }} failure
   */
  function showFailure(failure) {
    if (BLOCKED_TEXTS[failure.code]) {
      blocked = failure.code;
      render();
      const words = BLOCKED_TEXTS[failure.code];
      host.app.announce(`${t(words.title)}. ${t(words.text)}`);
      return;
    }

    host.fail({
      titleKey: 'steam.error.title',
      textKey: ERROR_KEYS[failure.code],
      text: ERROR_KEYS[failure.code]
        ? undefined
        : t('steam.error.unknown', { message: failure.message }),
    });
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

  // The same request again, with the same value: there is no cheap way to ask
  // Steam whether a list is public, so asking for it is the check.
  nodes.recheck.addEventListener('click', () => {
    if (!running) runWishlist();
  });

  nodes.cancel.addEventListener('click', () => {
    running?.controller.abort();
  });

  nodes.missingRun.addEventListener('click', () => {
    if (!running) runMissingTitles();
  });

  nodes.again.addEventListener('click', () => {
    wantsForm = true;
    render();
    if (available) nodes.account.focus();
  });

  /* --------------------------------------------------------- drawing */

  /**
   * Which of the blocks of the card is the one to show.
   *
   * @returns {'checking'|'form'|'progress'|'blocked'|'ready'|'offline'}
   */
  function currentState() {
    if (available === null) return 'checking';
    if (running) return 'progress';
    if (blocked) return 'blocked';
    if (host.app.session.itemCount > 0 && !wantsForm) return 'ready';
    return available ? 'form' : 'offline';
  }

  /**
   * The head of the card: which glyph and which two lines stand over the
   * block that is showing.
   *
   * @param {string} state
   */
  function renderHead(state) {
    // The loaded list speaks for itself, in the middle of the card.
    nodes.head.hidden = state === 'ready';
    if (state === 'ready') return;

    const lock = state === 'blocked';
    const route = state === 'offline';
    nodes.iconCloud.hidden = lock || route;
    nodes.iconLock.hidden = !lock;
    nodes.iconRoute.hidden = !route;

    if (lock) {
      const words = BLOCKED_TEXTS[blocked];
      nodes.title.textContent = t(words.title);
      nodes.sub.textContent = t(words.text);
      return;
    }
    if (route) {
      nodes.title.textContent = t('steam.offline.title');
      nodes.sub.textContent = t('steam.offline.subtitle');
      return;
    }
    nodes.title.textContent = t('steam.title');
    nodes.sub.textContent = t('steam.subtitle');
  }

  /** The loaded list: how much came in, and what happens next. */
  function renderReady() {
    const count = host.app.session.itemCount;
    const sorted = host.app.session.getCategoryAssignments().length;
    const { comparisons } = host.app.session.getProgress();

    nodes.readyCount.textContent = plural('import.ready.count', count);
    // A list that has been worked on already gets the numbers of that work
    // instead of the sentence about what to do first.
    nodes.readyNext.textContent = sorted > 0 || comparisons > 0
      ? t('import.current', {
        items: plural('count.items', count),
        sorted,
        plain: count - sorted,
        comparisons,
      })
      : t('import.ready.next');
  }

  /** Draws the card in whatever state it is in. */
  function render() {
    if (!asked) checkAvailability();

    const state = currentState();
    nodes.form.hidden = state !== 'form' && state !== 'checking';
    nodes.progress.hidden = state !== 'progress';
    nodes.blocked.hidden = state !== 'blocked';
    nodes.ready.hidden = state !== 'ready';
    nodes.offline.hidden = state !== 'offline';

    renderHead(state);

    if (state === 'checking') {
      nodes.run.disabled = true;
      nodes.run.textContent = t('steam.checking');
      nodes.account.disabled = true;
      return;
    }

    nodes.run.textContent = t('steam.run');
    nodes.run.disabled = false;
    nodes.account.disabled = false;

    if (state === 'progress') {
      nodes.progressText.textContent = progressText();
      const share = progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
      setProgress(nodes.progressFill, share * 100);
      return;
    }

    if (state !== 'ready') return;

    renderReady();

    // Fetching the rest of the titles needs the server that fetched them.
    const untitled = untitledAppIds().length;
    nodes.missing.hidden = untitled === 0 || !available;
    if (untitled > 0) nodes.missingText.textContent = plural('steam.missing.text', untitled);
  }

  return {
    render,

    /**
     * Drops a refusal the card is standing on. Called when a list arrived by
     * some other way in: the card would otherwise go on explaining a Steam
     * that has nothing left to refuse.
     */
    clearFailure() {
      blocked = null;
      wantsForm = false;
    },
  };
}
