// Static file server for the UNBURIED offline mirror.
// Usage: node tools/serve.mjs [port] [documentRoot]
//   port         defaults to 4998
//   documentRoot defaults to the repo root (one level above tools/)
// Binds 127.0.0.1 only, honest 404s (no SPA fallback), logs path + status.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] || 4998);
const ROOT = resolve(process.argv[3] || join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.bin': 'application/octet-stream',
  '.dat': 'application/octet-stream',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

const server = createServer((req, res) => {
  const log = (status) => console.log(`${status} ${req.method} ${req.url}`);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    log(405);
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
  } catch {
    log(400);
    return send(res, 400, 'Bad Request');
  }

  const target = resolve(join(ROOT, normalize(pathname)));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    log(403);
    return send(res, 403, 'Forbidden');
  }

  let file = target;
  let st;
  try {
    st = statSync(file);
  } catch {
    log(404);
    return send(res, 404, `404 Not Found: ${pathname}`);
  }

  if (st.isDirectory()) {
    if (!pathname.endsWith('/')) {
      log(301);
      return send(res, 301, '', { Location: pathname + '/' });
    }
    file = join(file, 'index.html');
    try {
      st = statSync(file);
    } catch {
      log(404);
      return send(res, 404, `404 Not Found: ${pathname}`);
    }
  }
  if (!st.isFile()) {
    log(404);
    return send(res, 404, `404 Not Found: ${pathname}`);
  }

  log(200);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`serving ${ROOT} at http://${HOST}:${PORT}/`);
});
