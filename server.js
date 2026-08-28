/**
 * Local static server for the application.
 *
 * ES modules do not load over `file://`, so the application needs an HTTP
 * origin. Bringing in a package for that would contradict the whole point of a
 * dependency-free, private, local tool, so the twenty lines it actually takes
 * live here, on the standard library of Node alone.
 *
 * Usage:  node server.js [port]
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** @type {import('node:http').RequestListener} */
export async function handleRequest(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method Not Allowed');
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
