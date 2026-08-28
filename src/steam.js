/**
 * Import straight from a Steam account.
 *
 * No Steam endpoint sends a CORS header, so the page cannot ask Steam for a
 * wishlist by itself. The request is made by `server.js` instead, and this
 * module is everything that request needs to know: how to read what the user
 * typed, which addresses may be called at all, and how to read the answers.
 * The path of the data stays "browser → your own local server → Steam".
 *
 * The security of that arrangement lives here, in three rules:
 *
 *  1. The endpoint takes an account, never a URL. A local server that forwards
 *     arbitrary addresses is an open proxy through which a page could reach
 *     into the home network of whoever is running it.
 *  2. Every address is built in code out of a value that was validated first —
 *     seventeen digits for a SteamID64, the Steam character set for a profile
 *     name — and never glued together out of raw input.
 *  3. Every call goes through `createSteamFetch()`, which refuses any host
 *     outside `ALLOWED_HOSTS`, refuses anything but https, and re-checks the
 *     host of every redirect instead of letting `fetch` follow one anywhere.
 *
 * The module touches neither the DOM nor the network by itself: the caller
 * hands it a `fetch`, which is what lets the tests drive all of it without a
 * single real request.
 */

import { normalizeAppId, normalizeKind, steamStoreUrl } from './model.js';

/**
 * The only hosts the server is ever allowed to call. The list is closed on
 * purpose: an address that is not on it is refused before a socket is opened,
 * whichever way it arrived.
 *
 * @type {ReadonlyArray<string>}
 */
export const ALLOWED_HOSTS = Object.freeze([
  'api.steampowered.com',
  'store.steampowered.com',
  'steamcommunity.com',
]);

/** A SteamID64 is exactly seventeen digits. */
const STEAM_ID_PATTERN = /^\d{17}$/;

/**
 * Character set of a Steam custom profile name. Steam allows latin letters,
 * digits, an underscore and a hyphen, and nothing else — which is also what
 * makes such a name safe to put into a path segment.
 */
const VANITY_PATTERN = /^[A-Za-z0-9_-]{2,32}$/;

/** Hosts a profile link may be written against. */
const PROFILE_HOSTS = new Set(['steamcommunity.com', 'www.steamcommunity.com']);

/** Pause between two `appdetails` calls, in milliseconds. */
export const DETAIL_DELAY_MS = 350;

/** The pause never grows past this, however often Steam says no. */
const MAX_DETAIL_DELAY_MS = 4000;

/**
 * How long to wait after each refusal before asking again. Steam answers 429
 * long before a wishlist of two hundred entries is done, so the retries are
 * long and few rather than quick and many.
 *
 * @type {ReadonlyArray<number>}
 */
export const RETRY_DELAYS_MS = Object.freeze([3000, 8000, 20000]);

/** Redirects followed, each one re-checked against the allowed hosts. */
const MAX_REDIRECTS = 3;

/** How many app ids one call may ask the titles for. */
export const MAX_APP_IDS = 5000;

/**
 * Something the import could not get past. The code is what the interface
 * turns into a sentence, in the language it is currently in; the message is
 * for the console and for the tests.
 */
export class SteamError extends Error {
  /**
   * @param {string} code One of `empty-input`, `invalid-account`,
   *   `account-not-found`, `wishlist-private`, `wishlist-empty`,
   *   `rate-limited`, `blocked-host`, `steam-error`, `network`, `cancelled`.
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'SteamError';
    this.code = code;
  }
}

/* ------------------------------------------------------ what was typed */

/**
 * Reads whatever a person may reasonably paste into the field: a bare
 * SteamID64, a link to a profile in either of its two shapes, or just the
 * profile name.
 *
 * A link is accepted only when it points at `steamcommunity.com`. This is the
 * first of the two places where a foreign host is turned away — the second is
 * `assertAllowedUrl()`, and neither of them trusts the other.
 *
 * @param {unknown} raw
 * @returns {{ kind: 'id', steamId: string } | { kind: 'vanity', vanity: string }}
 * @throws {SteamError} `empty-input` or `invalid-account`.
 */
export function parseAccountInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    throw new SteamError('empty-input', 'Steam import: no account was given');
  }

  // A profile name cannot hold any of these, so anything that does is meant
  // as an address and is read as one — including the addresses that are not
  // Steam at all, which is exactly what has to be refused.
  if (/[/:.\\?#@]/.test(text)) return readProfileUrl(text);

  if (STEAM_ID_PATTERN.test(text)) return { kind: 'id', steamId: text };

  // A profile name may be all digits, but somebody who types a bare number
  // means their SteamID64 and has miscounted it. Reading it as a profile name
  // would send them off to look for an account that was never meant.
  if (/^\d+$/.test(text)) {
    throw new SteamError(
      'invalid-account',
      `Steam import: ${JSON.stringify(text)} is ${text.length} digits, a SteamID64 is 17`,
    );
  }

  if (VANITY_PATTERN.test(text)) return { kind: 'vanity', vanity: text };

  throw new SteamError(
    'invalid-account',
    `Steam import: ${JSON.stringify(text)} is neither a SteamID64 nor a profile name`,
  );
}

/**
 * Reads a profile link. Only the host decides whether the link is acceptable,
 * and it is read by `URL` rather than searched for in the text: a string like
 * `https://steamcommunity.com@example.com/id/x` has `example.com` for a host
 * and is refused, however much it looks like Steam at a glance.
 *
 * @param {string} text
 * @returns {{ kind: 'id', steamId: string } | { kind: 'vanity', vanity: string }}
 * @throws {SteamError} `invalid-account`
 */
function readProfileUrl(text) {
  const refuse = () => {
    throw new SteamError(
      'invalid-account',
      `Steam import: ${JSON.stringify(text)} is not a steamcommunity.com profile link`,
    );
  };

  const hasScheme = /^[A-Za-z][A-Za-z\d+.-]*:/.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return refuse();
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return refuse();
  if (!PROFILE_HOSTS.has(url.hostname.toLowerCase())) return refuse();

  let segments;
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return refuse();
  }

  const [section, value] = segments;
  if (section === 'profiles' && STEAM_ID_PATTERN.test(value ?? '')) {
    return { kind: 'id', steamId: value };
  }
  if (section === 'id' && VANITY_PATTERN.test(value ?? '')) {
    return { kind: 'vanity', vanity: value };
  }
  return refuse();
}

/* ------------------------------------------------- addresses and fetch */

/**
 * The XML view of a profile. It is the way a profile name becomes a SteamID64
 * without an API key, and the way the existence of an account is checked.
 *
 * @param {string} vanity Already validated profile name.
 * @returns {string}
 */
export function vanityLookupUrl(vanity) {
  if (!VANITY_PATTERN.test(String(vanity))) {
    throw new SteamError('invalid-account', `Steam import: ${JSON.stringify(vanity)} is not a profile name`);
  }
  return `https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`;
}

/**
 * The same view, addressed by id. Used only to tell "there is no such account"
 * apart from "the wishlist of this account is closed".
 *
 * @param {string} steamId
 * @returns {string}
 */
export function profileLookupUrl(steamId) {
  return `https://steamcommunity.com/profiles/${assertSteamId(steamId)}/?xml=1`;
}

/**
 * The wishlist itself. This is the only endpoint that still answers with JSON:
 * the old `store.steampowered.com/wishlist/profiles/…/wishlistdata/` returns a
 * page of HTML now and is not used anywhere.
 *
 * @param {string} steamId
 * @returns {string}
 */
export function wishlistUrl(steamId) {
  return `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${assertSteamId(steamId)}`;
}

/**
 * The title and the type of one application. One app id per call — the
 * endpoint answers with the basics of a single application at a time.
 *
 * @param {number|string} appId
 * @returns {string}
 */
export function appDetailsUrl(appId) {
  const id = normalizeAppId(appId);
  if (id === null) {
    throw new SteamError('invalid-account', `Steam import: ${JSON.stringify(appId)} is not an app id`);
  }
  return `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`;
}

/**
 * @param {unknown} steamId
 * @returns {string}
 * @throws {SteamError} `invalid-account`
 */
function assertSteamId(steamId) {
  const text = String(steamId ?? '').trim();
  if (!STEAM_ID_PATTERN.test(text)) {
    throw new SteamError('invalid-account', `Steam import: ${JSON.stringify(steamId)} is not a SteamID64`);
  }
  return text;
}

/**
 * Lets an address through only when it is https and points at one of
 * `ALLOWED_HOSTS`.
 *
 * @param {string} url
 * @returns {string} The same address, normalized.
 * @throws {SteamError} `blocked-host`
 */
export function assertAllowedUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw new SteamError('blocked-host', `Steam import: ${JSON.stringify(String(url))} is not an address`);
  }
  if (parsed.protocol !== 'https:') {
    throw new SteamError('blocked-host', `Steam import: ${parsed.protocol}// is refused, only https is called`);
  }
  if (!ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())) {
    throw new SteamError('blocked-host', `Steam import: ${parsed.hostname} is not a Steam host`);
  }
  return parsed.toString();
}

/**
 * The single door to the network. Everything this module fetches goes through
 * here, so there is one place — and only one — where a host is decided on.
 *
 * Redirects are followed by hand rather than by `fetch`, because following
 * them automatically would take the request to whatever host Steam names in
 * `Location`, and the point of the allow list is that nothing gets to name a
 * host but this code.
 *
 * @param {typeof fetch} [fetchImpl]
 * @returns {(url: string, options?: object) => Promise<Response>}
 */
export function createSteamFetch(fetchImpl = globalThis.fetch) {
  return async function steamFetch(url, options = {}) {
    let target = assertAllowedUrl(url);

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetchImpl(target, { ...options, redirect: 'manual' });
      const location = response.status >= 300 && response.status < 400
        ? response.headers?.get?.('location')
        : null;
      if (!location) return response;
      target = assertAllowedUrl(new URL(location, target).toString());
    }

    throw new SteamError('steam-error', 'Steam import: too many redirects');
  };
}

/* ----------------------------------------------------- reading answers */

/**
 * Pulls the SteamID64 out of the XML view of a profile.
 *
 * @param {string} xml
 * @returns {string}
 * @throws {SteamError} `account-not-found`
 */
export function parseVanityXml(xml) {
  const match = /<steamID64>\s*(\d{17})\s*<\/steamID64>/i.exec(String(xml ?? ''));
  if (!match) {
    throw new SteamError('account-not-found', 'Steam import: no such profile');
  }
  return match[1];
}

/**
 * @typedef {Object} WishlistEntry
 * @property {number} appId
 * @property {number} priority  0 when the user never ordered this entry by hand.
 * @property {number} dateAdded Unix time the entry was put on the wishlist.
 */

/**
 * Reads the answer of `IWishlistService/GetWishlist`.
 *
 * Steam does not say why a wishlist came back without entries, so the shape of
 * the answer is what the two cases are told apart by: an `items` array that is
 * there and empty is an empty wishlist, an answer that carries no `items` at
 * all is one that was not handed over — which in practice means the privacy
 * setting. Both messages name the other case out loud, so a wrong guess still
 * leaves the user with something true to act on.
 *
 * @param {unknown} payload Parsed JSON of the answer.
 * @returns {WishlistEntry[]}
 * @throws {SteamError} `wishlist-private` or `wishlist-empty`.
 */
export function parseWishlistPayload(payload) {
  const response = payload && typeof payload === 'object' ? payload.response : null;
  if (!response || typeof response !== 'object' || !Array.isArray(response.items)) {
    throw new SteamError('wishlist-private', 'Steam import: the wishlist was not handed over');
  }

  /** @type {WishlistEntry[]} */
  const entries = [];
  const seen = new Set();

  for (const raw of response.items) {
    const isObject = raw !== null && typeof raw === 'object';
    const appId = normalizeAppId(isObject ? raw.appid ?? raw.appId : raw);
    if (appId === null || seen.has(appId)) continue;
    seen.add(appId);
    entries.push({
      appId,
      priority: isObject ? positiveInt(raw.priority) : 0,
      dateAdded: isObject ? positiveInt(raw.date_added ?? raw.dateAdded) : 0,
    });
  }

  if (entries.length === 0) {
    throw new SteamError('wishlist-empty', 'Steam import: the wishlist is empty');
  }
  return entries;
}

/**
 * @param {unknown} value
 * @returns {number} 0 for anything that is not a positive number.
 */
function positiveInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

/**
 * Turns wishlist entries into records `import.js` already understands, in the
 * order they should be shown in.
 *
 * Steam only sends a priority for the part of the wishlist the user ordered by
 * hand, and `priority: 0` — most of a real list — means "not ordered". Those
 * entries go after the ordered ones, oldest addition first: when an entry was
 * wished for is the only real order Steam has for them, and it beats the
 * arbitrary order they happen to arrive in.
 *
 * @param {WishlistEntry[]} entries
 * @returns {Array<{ appId: number, wishlistPosition: number, url: string }>}
 */
export function buildWishlistItems(entries) {
  const ordered = entries.filter((entry) => entry.priority > 0);
  const rest = entries.filter((entry) => entry.priority <= 0);

  ordered.sort((a, b) => a.priority - b.priority || a.appId - b.appId);
  rest.sort((a, b) => a.dateAdded - b.dateAdded || a.appId - b.appId);

  return [...ordered, ...rest].map((entry, index) => ({
    appId: entry.appId,
    wishlistPosition: index + 1,
    url: steamStoreUrl(entry.appId),
  }));
}

/**
 * Reads the answer of `appdetails` for one application.
 *
 * `success: false` is not a failure of ours: Steam answers that for an entry
 * that is delisted or not sold in this region, and the item is still a real
 * wishlist entry which is simply shown by its app id.
 *
 * @param {unknown} payload
 * @param {number} appId
 * @returns {{ title: string, kind: string }|null}
 */
export function parseAppDetails(payload, appId) {
  const entry = payload && typeof payload === 'object' ? payload[String(appId)] : null;
  const data = entry && entry.success === true ? entry.data : null;
  if (!data || typeof data !== 'object') return null;

  const title = typeof data.name === 'string' ? data.name.trim() : '';
  if (!title) return null;
  return { title, kind: normalizeKind(data.type) };
}

/* ------------------------------------------------------------ requests */

/**
 * Waits, and gives up waiting when the request is cancelled.
 *
 * @param {number} ms
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(new SteamError('cancelled', 'Steam import: cancelled'));
  if (ms <= 0) return Promise.resolve();

  return new Promise((done, fail) => {
    const onAbort = () => {
      clearTimeout(timer);
      fail(new SteamError('cancelled', 'Steam import: cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      done();
    }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

/**
 * @param {AbortSignal} [signal]
 * @throws {SteamError} `cancelled`
 */
function throwIfCancelled(signal) {
  if (signal?.aborted) throw new SteamError('cancelled', 'Steam import: cancelled');
}

/**
 * Normalizes the options every request function takes, so that one prepared
 * `fetch` and one clock are shared by the whole run.
 *
 * @param {object} [options]
 * @returns {{ steamFetch: Function, sleep: Function, signal: AbortSignal|undefined,
 *            delayMs?: number, retryDelays?: ReadonlyArray<number> }}
 */
function requestContext(options = {}) {
  return {
    ...options,
    steamFetch: options.steamFetch ?? createSteamFetch(options.fetch),
    sleep: options.sleep ?? sleep,
    signal: options.signal,
  };
}

/**
 * Runs one call and turns everything that can go wrong with the connection
 * itself into a `network` failure, so the interface never has to show a raw
 * `TypeError: fetch failed`.
 *
 * @param {Function} steamFetch
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function call(steamFetch, url) {
  try {
    return await steamFetch(url);
  } catch (error) {
    if (error instanceof SteamError) throw error;
    throw new SteamError('network', `Steam import: Steam could not be reached (${error.message})`);
  }
}

/**
 * @param {Response} response
 * @returns {Promise<unknown>} Parsed JSON.
 * @throws {SteamError} `steam-error` when the answer is not JSON.
 */
async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new SteamError('steam-error', 'Steam import: Steam answered with something that is not JSON');
  }
}

/**
 * Brings what the user typed to a SteamID64, resolving a profile name through
 * the public XML view — no API key is involved anywhere.
 *
 * @param {unknown} input
 * @param {object} [options]
 * @returns {Promise<string>}
 * @throws {SteamError}
 */
export async function resolveSteamId(input, options = {}) {
  const account = parseAccountInput(input);
  if (account.kind === 'id') return account.steamId;

  const { steamFetch } = requestContext(options);
  const response = await call(steamFetch, vanityLookupUrl(account.vanity));

  if (response.status === 429) {
    throw new SteamError('rate-limited', 'Steam import: Steam is limiting requests');
  }
  if (response.status === 404) {
    throw new SteamError('account-not-found', 'Steam import: no such profile');
  }
  if (!response.ok) {
    throw new SteamError('steam-error', `Steam import: Steam answered ${response.status}`);
  }
  return parseVanityXml(await response.text());
}

/**
 * Whether an account with this id exists at all. Asked only when a wishlist
 * did not come back, to say "no such account" instead of "the list is closed"
 * when that is what really happened.
 *
 * @param {string} steamId
 * @param {object} [options]
 * @returns {Promise<boolean>} `true` also when the answer was unclear: an
 *          account is only reported missing when Steam actually said so.
 */
export async function profileExists(steamId, options = {}) {
  const { steamFetch } = requestContext(options);
  try {
    const response = await call(steamFetch, profileLookupUrl(steamId));
    if (!response.ok) return true;
    parseVanityXml(await response.text());
    return true;
  } catch (error) {
    return !(error instanceof SteamError && error.code === 'account-not-found');
  }
}

/**
 * Asks for the wishlist of an account.
 *
 * @param {string} steamId
 * @param {object} [options]
 * @returns {Promise<WishlistEntry[]>}
 * @throws {SteamError}
 */
export async function fetchWishlistEntries(steamId, options = {}) {
  const { steamFetch } = requestContext(options);
  const response = await call(steamFetch, wishlistUrl(steamId));

  if (response.status === 429) {
    throw new SteamError('rate-limited', 'Steam import: Steam is limiting requests');
  }
  if (response.status === 401 || response.status === 403) {
    throw new SteamError('wishlist-private', 'Steam import: the wishlist is not public');
  }
  if (!response.ok) {
    // Steam answers with a server error for a wishlist it will not hand over,
    // so a 5xx is read as the closed list it almost always is.
    if (response.status >= 500) {
      throw new SteamError('wishlist-private', 'Steam import: the wishlist was not handed over');
    }
    throw new SteamError('steam-error', `Steam import: Steam answered ${response.status}`);
  }

  return parseWishlistPayload(await readJson(response));
}

/**
 * Asks for the title and the type of one application.
 *
 * @param {number} appId
 * @param {object} [options]
 * @returns {Promise<{ status: 'ok', title: string, kind: string }
 *   | { status: 'missing' } | { status: 'rate-limited' } | { status: 'failed' }>}
 */
export async function fetchAppSummary(appId, options = {}) {
  const { steamFetch } = requestContext(options);
  let response;
  try {
    response = await call(steamFetch, appDetailsUrl(appId));
  } catch (error) {
    // One title is not worth ending the import for: a connection that failed
    // on this entry is reported as a missing title and the walk goes on.
    if (error instanceof SteamError && error.code === 'network') return { status: 'failed' };
    throw error;
  }

  if (response.status === 429) return { status: 'rate-limited' };
  if (!response.ok) return { status: 'failed' };

  let payload;
  try {
    payload = await readJson(response);
  } catch {
    return { status: 'failed' };
  }

  const details = parseAppDetails(payload, appId);
  return details ? { status: 'ok', ...details } : { status: 'missing' };
}

/**
 * Walks a list of app ids and gives out a title at a time.
 *
 * The calls are made one after another with a pause between them, because the
 * refusal of `store.steampowered.com` is not a hypothesis: it arrives after a
 * dozen quick requests. A 429 is answered by waiting longer and asking again,
 * and the pause between the ordinary calls grows with every refusal. Waiting
 * four minutes on a wishlist of two hundred beats breaking off at the ninetieth
 * entry, and every title that did arrive is given out the moment it arrives,
 * so nothing that was already paid for is lost.
 *
 * @param {number[]} appIds
 * @param {object} [options] `fetch`, `sleep`, `signal`, `delayMs`, `retryDelays`.
 * @yields {object} `title`, `title-missing`, `waiting` or `rate-limited`.
 */
export async function* streamAppSummaries(appIds, options = {}) {
  const context = requestContext(options);
  const retryDelays = context.retryDelays ?? RETRY_DELAYS_MS;
  let delay = context.delayMs ?? DETAIL_DELAY_MS;

  const total = appIds.length;
  let done = 0;

  for (const appId of appIds) {
    throwIfCancelled(context.signal);

    let outcome = { status: 'rate-limited' };
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      outcome = await fetchAppSummary(appId, context);
      if (outcome.status !== 'rate-limited') break;
      if (attempt === retryDelays.length) break;
      // Steam said no: wait longer than last time, and keep the ordinary pace
      // slower from now on, or the next entry runs into the same wall.
      delay = Math.min(delay * 2, MAX_DETAIL_DELAY_MS);
      yield { type: 'waiting', appId, waitMs: retryDelays[attempt], done, total };
      await context.sleep(retryDelays[attempt], context.signal);
    }

    if (outcome.status === 'rate-limited') {
      // Still refused after every retry. Stopping leaves the wishlist and the
      // titles collected so far in place; hammering on would lose them.
      yield { type: 'rate-limited', done, total };
      return;
    }

    done += 1;
    if (outcome.status === 'ok') {
      yield { type: 'title', appId, title: outcome.title, kind: outcome.kind, done, total };
    } else {
      yield { type: 'title-missing', appId, done, total };
    }

    if (done < total) await context.sleep(delay, context.signal);
  }
}

/**
 * The whole import, as a stream of events: the account, then the wishlist,
 * then the titles one by one.
 *
 * @param {unknown} input What the user typed.
 * @param {object} [options]
 * @yields {object} `account`, `wishlist`, and then whatever
 *          `streamAppSummaries()` gives out.
 */
export async function* collectWishlist(input, options = {}) {
  const context = requestContext(options);
  const account = parseAccountInput(input);

  const steamId = account.kind === 'id'
    ? account.steamId
    : await resolveSteamId(account.vanity, context);
  yield { type: 'account', steamId };

  let entries;
  try {
    entries = await fetchWishlistEntries(steamId, context);
  } catch (error) {
    // A number that resolves to nothing is a mistyped id far more often than a
    // closed list, and the two need different advice, so ask before deciding.
    if (
      error instanceof SteamError
      && error.code === 'wishlist-private'
      && account.kind === 'id'
      && !(await profileExists(steamId, context))
    ) {
      throw new SteamError('account-not-found', 'Steam import: no account with this id');
    }
    throw error;
  }

  const items = buildWishlistItems(entries);
  yield { type: 'wishlist', steamId, total: items.length, items };

  yield* streamAppSummaries(items.map((item) => item.appId), context);
}

/**
 * The titles alone, for the "fetch the rest" button: the same walk over
 * `appdetails`, without asking for the wishlist again.
 *
 * @param {Array<number|string>} rawAppIds
 * @param {object} [options]
 * @yields {object}
 */
export async function* collectTitles(rawAppIds, options = {}) {
  const appIds = [];
  const seen = new Set();
  for (const raw of rawAppIds ?? []) {
    const appId = normalizeAppId(raw);
    if (appId === null || seen.has(appId)) continue;
    seen.add(appId);
    appIds.push(appId);
  }

  if (appIds.length === 0) {
    throw new SteamError('invalid-account', 'Steam import: no app ids to look up');
  }
  if (appIds.length > MAX_APP_IDS) {
    throw new SteamError('invalid-account', `Steam import: more than ${MAX_APP_IDS} app ids at once`);
  }

  yield { type: 'titles', total: appIds.length };
  yield* streamAppSummaries(appIds, options);
}

/* ---------------------------------------------- the stream on the wire */

/**
 * The events travel as newline-delimited JSON: one event, one line. It is the
 * least a progress stream can be built out of — no framing to get wrong, and a
 * connection that breaks halfway still delivered every complete line before it.
 *
 * @param {ReadableStream<Uint8Array>} stream
 * @yields {object} One parsed event per line.
 */
export async function* readEventStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line);
        newline = buffer.indexOf('\n');
      }
    }

    const rest = buffer.trim();
    if (rest) yield JSON.parse(rest);
  } finally {
    reader.releaseLock?.();
  }
}
