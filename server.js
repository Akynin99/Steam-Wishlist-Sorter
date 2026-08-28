/**
 * Local static server for the application.
 *
 * ES modules do not load over `file://`, so the application needs an HTTP
 * origin. Bringing in a package for that would contradict the whole point of a
 * dependency-free, private, local tool, so the twenty lines it actually takes
 * live here, on the standard library of Node alone.
 *
 * It serves files, and it does one thing more: on `/api/steam/…` it asks Steam
 * for a wishlist on behalf of the page, because no Steam endpoint sends a CORS
 * header and the browser is therefore not allowed to ask by itself. That is
 * the only outbound request this server ever makes, it goes to Steam and
 * nowhere else, and it happens only when the user presses the button.
 * `src/steam.js` holds the rules it obeys.
 *
 * Usage:  node server.js [port]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_APP_IDS, SteamError, collectTitles, collectWishlist } from './src/steam.js';

/** Directory served to the browser: the project root, next to this file. */
export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));

/** Port used when none is given on the command line or in the environment. */
export const DEFAULT_PORT = 8080;

/**
 * Content types of everything the application ships. Anything else is sent as
 * a byte stream rather than guessed at.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
});

/**
 * @param {string} filePath
 * @returns {string}
 */
export function contentTypeOf(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Turns a request URL into an absolute path inside the served directory.
 *
 * Everything is decided on the resolved path, not on the text of the URL:
 * `..` segments, percent-encoded separators and absolute paths all collapse
 * into a path that is then checked against the root, so no request can read a
 * file outside the project folder.
 *
 * @param {string} requestUrl
 * @returns {string|null} `null` when the request escapes the served directory.
 */
export function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;

  const relative = normalize(pathname).replace(/^[/\\]+/, '');
  const target = resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;

  return target;
}

/**
 * Sends a short plain text answer. Used for every error, so a mistyped URL
 * shows a readable line instead of an empty page.
 *
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {string} message
 */
function sendText(response, status, message) {
  const body = `${status} ${message}\n`;
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

/**
 * Resolves what to send for a path: the file itself, or `index.html` of a
 * directory.
 *
 * @param {string} target
 * @returns {Promise<{ file: string, size: number }|null>}
 */
async function findFile(target) {
  try {
    const info = await stat(target);
    if (info.isFile()) return { file: target, size: info.size };
    if (info.isDirectory()) {
      const index = join(target, 'index.html');
      const indexInfo = await stat(index);
      if (indexInfo.isFile()) return { file: index, size: indexInfo.size };
    }
  } catch {
    return null;
  }
  return null;
}

/* ---------------------------------------------------------------- api */

/**
 * Everything under this prefix is answered by the server itself and is never
 * looked for on disk.
 */
export const API_PREFIX = '/api/';

/**
 * Content type of the progress stream: one JSON event per line. The import of
 * a wishlist of two hundred entries takes minutes, and the page has to show
 * what is happening while it does.
 */
const NDJSON_TYPE = 'application/x-ndjson; charset=utf-8';

/**
 * What HTTP status a failure gets when it happens before the stream has
 * started. Once the first event is out the status is already 200 and the
 * failure travels as an `error` event instead — the page reads both the same
 * way, because a lone JSON object is also a stream of one line.
 *
 * @type {Readonly<Record<string, number>>}
 */
const ERROR_STATUS = Object.freeze({
  'empty-input': 400,
  'invalid-account': 400,
  'account-not-found': 404,
  'wishlist-empty': 404,
  'wishlist-private': 403,
  'rate-limited': 429,
  'blocked-host': 400,
  network: 502,
  'steam-error': 502,
});

/**
 * Whether the request came to the loopback name this server is published
 * under. The server listens on 127.0.0.1 only, so nothing on the network can
 * reach it — but a page on any site can send a request to `localhost`, and a
 * hostname that resolves to 127.0.0.1 is how DNS rebinding is spelled. The
 * check costs one line and closes that door too.
 *
 * @param {import('node:http').IncomingMessage} request
 * @returns {boolean}
 */
function isLocalRequest(request) {
  const host = String(request.headers.host ?? '');
  if (!host) return false;
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

/**
 * Sends a small JSON answer.
 *
 * @param {import('node:http').ServerResponse} response
 * @param {number} status
 * @param {object} payload
 */
function sendJson(response, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

/**
 * Pours a stream of events into the answer, as newline-delimited JSON.
 *
 * The head is written only when the first event is ready, so a request that
 * fails on the input — a malformed account, a closed wishlist — still gets a
 * telling status code instead of a 200 with bad news inside.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {(signal: AbortSignal) => AsyncIterable<object>} makeEvents
 */
async function sendEventStream(request, response, makeEvents) {
  // The browser cancels by dropping the connection, and that has to reach the
  // walk over Steam: otherwise a cancelled import keeps asking for titles.
  const controller = new AbortController();
  request.on('close', () => controller.abort());

  let started = false;
  const write = (event) => {
    if (response.writableEnded || response.destroyed) return;
    if (!started) {
      started = true;
      response.writeHead(200, {
        'Content-Type': NDJSON_TYPE,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
    }
    response.write(`${JSON.stringify(event)}\n`);
  };

  try {
    for await (const event of makeEvents(controller.signal)) write(event);
    write({ type: 'finished' });
  } catch (error) {
    const code = error instanceof SteamError ? error.code : 'steam-error';
    if (code === 'cancelled') {
      // The user walked away; there is nobody left to tell.
      if (!response.writableEnded) response.end();
      return;
    }
    const payload = { type: 'error', code, message: error.message };
    if (started) write(payload);
    else sendJson(response, ERROR_STATUS[code] ?? 502, payload);
  }

  if (!response.writableEnded) response.end();
}

/**
 * Answers the endpoints of the application. Returns `false` when the path is
 * not one of them, so an unknown `/api/…` becomes an ordinary 404 rather than
 * a file lookup.
 *
 * Neither endpoint takes an address: one takes an account, the other a list of
 * app ids. A local server that forwarded arbitrary URLs would be an open proxy
 * into the network of whoever is running it, and that is the one thing this
 * feature must never become.
 *
 * @param {import('node:http').IncomingMessage} request
 * @param {import('node:http').ServerResponse} response
 * @param {URL} url
 * @returns {Promise<boolean>} Whether the request was answered here.
 */
export async function handleApiRequest(request, response, url) {
  if (!isLocalRequest(request)) {
    sendJson(response, 403, {
      type: 'error',
      code: 'not-local',
      message: 'This server answers on localhost only',
    });
    return true;
  }

  // Asked by the page on start: on GitHub Pages there is no server to answer,
  // and the card explains itself instead of offering a button that cannot work.
  if (url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, app: 'steam-wishlist-sorter', steamImport: true });
    return true;
  }

  // A HEAD would start the whole walk over Steam and then throw the answer
  // away, so the two long endpoints are answered for GET alone.
  if (request.method === 'HEAD') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { type: 'error', code: 'method', message: 'GET only' });
    return true;
  }

  if (url.pathname === '/api/steam/wishlist') {
    const account = url.searchParams.get('account') ?? '';
    await sendEventStream(request, response, (signal) => collectWishlist(account, { signal }));
    return true;
  }

  if (url.pathname === '/api/steam/titles') {
    const appIds = (url.searchParams.get('appids') ?? '').split(',').filter(Boolean);
    if (appIds.length > MAX_APP_IDS) {
      sendJson(response, 400, {
        type: 'error',
        code: 'invalid-account',
        message: `Steam import: more than ${MAX_APP_IDS} app ids at once`,
      });
      return true;
    }
    await sendEventStream(request, response, (signal) => collectTitles(appIds, { signal }));
    return true;
  }

  return false;
}

/** @type {import('node:http').RequestListener} */
export async function handleRequest(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  let url;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (url.pathname.startsWith(API_PREFIX)) {
    if (await handleApiRequest(request, response, url)) return;
    sendText(response, 404, 'Not Found');
    return;
  }

  const target = resolveRequestPath(request.url ?? '/');
  if (target === null) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  const found = await findFile(target);
  if (!found) {
    sendText(response, 404, 'Not Found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypeOf(found.file),
    'Content-Length': found.size,
    // The application is edited while it is open; a cached module would show
    // the previous version after a reload and cost an hour of confusion.
    'Cache-Control': 'no-store',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(found.file);
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}

/**
 * Creates the server without listening, so a test can drive it on a port of
 * its own.
 *
 * @returns {import('node:http').Server}
 */
export function createStaticServer() {
  return createServer(handleRequest);
}

/**
 * Starts the server and prints the address to open.
 *
 * @param {number} [port]
 * @returns {import('node:http').Server}
 */
export function start(port = DEFAULT_PORT) {
  const server = createStaticServer();

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is busy. Start it on another one:  node server.js ${port + 1}`);
    } else {
      console.error(`The server could not start: ${error.message}`);
    }
    process.exitCode = 1;
  });

  // Loopback only: the wishlist of the user is not published to the network.
  server.listen(port, '127.0.0.1', () => {
    console.log('Steam Wishlist Sorter');
    console.log(`  Open in the browser:  http://localhost:${port}/`);
    console.log(`  Folder:               ${ROOT}`);
    console.log('  Stop:                 Ctrl+C');
  });

  return server;
}

// Only start when run directly, so importing the module in a test is silent.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const requested = Number(process.argv[2] ?? process.env.PORT ?? DEFAULT_PORT);
  start(Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : DEFAULT_PORT);
}
