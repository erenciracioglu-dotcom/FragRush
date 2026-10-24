// ENKAZ yerel sunucu (bagimliliksiz). Kullanim: node serve.mjs  -> http://127.0.0.1:8777/
// Test icin: POST /__report (JSON) ve POST /__shot?name=x (PNG dataURL) -> reports/ klasorune yazar.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, 'dist');
const reports = path.join(here, 'reports');
const PORT = Number(process.env.PORT || 8777);
const AUTO_EXIT = process.argv.includes('--auto-exit');
let lastPing = Date.now();
let pinged = false;
if (AUTO_EXIT) {
  // oyun penceresi kapaninca (sinyal kesilince) sunucu kendini kapatir
  setInterval(() => {
    const idle = Date.now() - lastPing;
    if ((pinged && idle > 45000) || (!pinged && idle > 180000)) { console.log('Oyun kapandi, sunucu kapaniyor.'); process.exit(0); }
  }, 5000);
}

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const headers = {
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };
  try {
    if (url.pathname === '/__ping') { lastPing = Date.now(); pinged = pinged || req.headers['sec-fetch-mode'] !== undefined; res.writeHead(200, headers); res.end('ok'); return; }
    if (req.method === 'POST' && url.pathname === '/__report') {
      const body = await readBody(req);
      fs.mkdirSync(reports, { recursive: true });
      const name = (url.searchParams.get('name') || 'report').replace(/[^\w.-]/g, '_');
      fs.writeFileSync(path.join(reports, name + '.json'), body);
      res.writeHead(200, headers); res.end('ok'); return;
    }
    if (req.method === 'POST' && url.pathname === '/__log') {
      // oyun ici hata / durum gunlugu: reports/game.log (2 MB'yi asinca game.old.log'a doner)
      const body = (await readBody(req)).toString().slice(0, 20000);
      fs.mkdirSync(reports, { recursive: true });
      const f = path.join(reports, 'game.log');
      try { if (fs.statSync(f).size > 2e6) fs.renameSync(f, path.join(reports, 'game.old.log')); } catch (e) { /* yok */ }
      fs.appendFileSync(f, new Date().toISOString() + ' ' + body.replace(/\n/g, '\n    ') + '\n');
      res.writeHead(200, headers); res.end('ok'); return;
    }
    if (req.method === 'POST' && url.pathname === '/__shot') {
      const body = (await readBody(req)).toString();
      fs.mkdirSync(reports, { recursive: true });
      const name = (url.searchParams.get('name') || 'shot').replace(/[^\w.-]/g, '_');
      const m = body.match(/^data:image\/(\w+);base64,/);
      const ext = m && m[1] === 'jpeg' ? '.jpg' : '.png';
      const b64 = body.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(reports, name + ext), Buffer.from(b64, 'base64'));
      res.writeHead(200, headers); res.end('ok'); return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403, headers); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, headers); res.end('not found'); return; }
      res.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500, headers); res.end(String(e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ENKAZ sunucusu: http://127.0.0.1:${PORT}/  (kapatmak icin bu pencereyi kapat)`);
});
