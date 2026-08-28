/**
 * Tests for the local static server.
 *
 * This is the only code in the project that faces a network socket, so the
 * checks here are mostly about what it must refuse: no request may read a file
 * outside the served folder, whichever way it is spelled — `..` segments,
 * percent-encoded separators, a drive letter, backslashes or a null byte.
 *
 * The requests are sent with `node:http` and a raw path on purpose. `fetch`
 * normalizes a URL before it goes out, so `..` would never reach the server
 * and the test would prove nothing.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

import { MIME_TYPES, ROOT, contentTypeOf, createStaticServer, resolveRequestPath } from '../server.js';

/**
 * Sends one request with the path written exactly as given.
 *
 * @param {number} port
 * @param {string} path Raw request target, sent without normalization.
 * @param {string} [method]
 * @returns {Promise<{ status: number, headers: object, body: string }>}
 */
function rawRequest(port, path, method = 'GET') {
  return new Promise((settle, fail) => {
    const call = httpRequest({ host: '127.0.0.1', port, path, method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        settle({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    call.on('error', fail);
    call.end();
  });
}

/**
 * Starts the server on a free port for the duration of one test.
 *
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
async function startServer() {
  const server = createStaticServer();
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    port: server.address().port,
    close: () => new Promise((done) => server.close(done)),
  };
}

/** Every way of spelling a path that tries to leave the served folder. */
const ESCAPE_ATTEMPTS = [
  '/../secret.txt',
  '/../../secret.txt',
  '/../../../../../../etc/passwd',
  '/subdir/../../secret.txt',
  '/%2e%2e/secret.txt',
  '/%2e%2e%2f%2e%2e%2fsecret.txt',
  '/..%2f..%2fsecret.txt',
  '/..%5c..%5csecret.txt',
  '/..\\..\\secret.txt',
  '/%5c..%5c..%5csecret.txt',
  '/C:/Windows/win.ini',
  '/%00/secret.txt',
  '/index.html%00.png',
];

test('a resolved path never leaves the served folder', () => {
  for (const attempt of ESCAPE_ATTEMPTS) {
    const target = resolveRequestPath(attempt);
    if (target === null) continue;
    assert.ok(
      target === ROOT || target.startsWith(ROOT + sep),
      `${attempt} resolved to ${target}, which is outside ${ROOT}`,
    );
  }
});

test('a null byte and a malformed escape are rejected outright', () => {
  assert.equal(resolveRequestPath('/%00/secret.txt'), null);
  assert.equal(resolveRequestPath('/index.html%00.png'), null);
  assert.equal(resolveRequestPath('/%zz'), null);
  assert.equal(resolveRequestPath('/%'), null);
});

test('a drive letter is rejected where it means another drive', { skip: process.platform !== 'win32' }, () => {
  assert.equal(resolveRequestPath('/C:/Windows/win.ini'), null);
  assert.equal(resolveRequestPath('/D:/anything'), null);
});

test('ordinary paths resolve inside the served folder', () => {
  assert.equal(resolveRequestPath('/'), ROOT);
  assert.equal(resolveRequestPath('/index.html'), join(ROOT, 'index.html'));
  assert.equal(resolveRequestPath('/src/model.js'), join(ROOT, 'src', 'model.js'));
  // The query string is not part of the file name.
  assert.equal(resolveRequestPath('/styles.css?v=2'), join(ROOT, 'styles.css'));
  // Percent-encoded characters that are not separators are ordinary characters.
  assert.equal(resolveRequestPath('/docs/screen%20shot.png'), join(ROOT, 'docs', 'screen shot.png'));
});

test('the content type comes from the extension and is case insensitive', () => {
  assert.equal(contentTypeOf('/x/index.html'), MIME_TYPES['.html']);
  assert.equal(contentTypeOf('app.JS'), MIME_TYPES['.js']);
  assert.equal(contentTypeOf('styles.css'), 'text/css; charset=utf-8');
  assert.equal(contentTypeOf('favicon.svg'), 'image/svg+xml');
  assert.equal(contentTypeOf('cover.JPEG'), 'image/jpeg');
  assert.equal(contentTypeOf('state.json'), 'application/json; charset=utf-8');
  assert.equal(contentTypeOf('archive.tar.gz'), 'application/octet-stream');
  assert.equal(contentTypeOf('LICENSE'), 'application/octet-stream');
});

test('a file is served with its content type and is never cached', async () => {
  const server = await startServer();
  try {
    const css = await rawRequest(server.port, '/styles.css');
    assert.equal(css.status, 200);
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8');
    assert.equal(css.headers['cache-control'], 'no-store');
    assert.ok(css.body.includes('--bg'), 'the body is the real file');

    const module = await rawRequest(server.port, '/src/model.js');
    assert.equal(module.status, 200);
    assert.equal(module.headers['content-type'], 'text/javascript; charset=utf-8');

    const icon = await rawRequest(server.port, '/favicon.svg');
    assert.equal(icon.status, 200);
    assert.equal(icon.headers['content-type'], 'image/svg+xml');
  } finally {
    await server.close();
  }
});

test('a directory is served as its index.html', async () => {
  const server = await startServer();
  try {
    const root = await rawRequest(server.port, '/');
    assert.equal(root.status, 200);
    assert.equal(root.headers['content-type'], 'text/html; charset=utf-8');
    assert.ok(root.body.includes('<title>Steam Wishlist Sorter</title>'));

    const explicit = await rawRequest(server.port, '/index.html');
    assert.equal(explicit.body, root.body, 'the folder and its index give the same page');

    // A folder without an index.html has nothing to show.
    const noIndex = await rawRequest(server.port, '/src');
    assert.equal(noIndex.status, 404);
  } finally {
    await server.close();
  }
});

test('a HEAD request answers with the headers and no body', async () => {
  const server = await startServer();
  try {
    const head = await rawRequest(server.port, '/index.html', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
  } finally {
    await server.close();
  }
});

test('a missing path gives 404 and a method other than GET or HEAD gives 405', async () => {
  const server = await startServer();
  try {
    const missing = await rawRequest(server.port, '/there-is-no-such-file.txt');
    assert.equal(missing.status, 404);

    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const answer = await rawRequest(server.port, '/', method);
      assert.equal(answer.status, 405, `${method} must not be served`);
      assert.equal(answer.headers.allow, 'GET, HEAD');
    }
  } finally {
    await server.close();
  }
});

test('no request reads a file that lies outside the served folder', async () => {
  const outsideDir = await mkdtemp(join(tmpdir(), 'wishlist-sorter-test-'));
  const secretFile = join(outsideDir, 'secret.txt');
  const secret = 'this file must never be served';
  await writeFile(secretFile, secret, 'utf8');
  assert.notEqual(resolve(secretFile), ROOT);

  // The same file, spelled as a relative path from the served folder: exactly
  // what a traversal attempt would have to produce to reach it.
  const upwards = relative(ROOT, secretFile).split(sep).join('/');

  const server = await startServer();
  try {
    const attempts = [...ESCAPE_ATTEMPTS, `/${upwards}`, `/${encodeURIComponent(upwards)}`];
    for (const attempt of attempts) {
      const answer = await rawRequest(server.port, attempt);
      assert.ok(
        answer.status === 403 || answer.status === 404,
        `${attempt} answered ${answer.status} instead of refusing`,
      );
      assert.ok(!answer.body.includes(secret), `${attempt} leaked a file outside the served folder`);
    }
  } finally {
    await server.close();
    await rm(outsideDir, { recursive: true, force: true });
  }
});
