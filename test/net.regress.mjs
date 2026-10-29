// Gerileme: tek kisilik oyun hicbir sunucuya baglanmaz; CrazyGames (portal) derlemesinde ARKADASLA OYNA dugmesi yok ve
// ag istegi yok. `paketle.ps1` calistirilmaz, FragRush-CrazyGames klasorune yazilmaz: portal derlemesi gecici klasore.
// usage: node test/net.regress.mjs
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) normal derleme dist/ (docs/ yazilmaz) + portal derlemesi gecici klasore
execFileSync(process.execPath, ['build.mjs', '--no-docs'], { cwd: root, stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-portal-'));
execFileSync(process.execPath, ['build.mjs', '--portal', 'crazygames', '--out', tmp], { cwd: root, stdio: 'ignore' });
const portalHtml = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
const normalHtml = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
console.log(`boyut: normal ${(normalHtml.length / 1024).toFixed(0)} KB, portal ${(portalHtml.length / 1024).toFixed(0)} KB`);
ok(!portalHtml.includes('stun.cloudflare.com') && !portalHtml.includes('RTCPeerConnection'), 'portal paketinde ag (WebRTC) kodu yok');

const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: '8813' }, stdio: 'ignore' });
const psrv = (await import('node:http')).createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(portalHtml); }).listen(8814, '127.0.0.1');
await sleep(700);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function run(label, url, play) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  const reqs = [], errs = [];
  page.on('request', (r) => reqs.push(r.url()));
  page.on('websocket', (w) => reqs.push('ws:' + w.url()));
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  const btn = await page.evaluate(() => { const b = document.getElementById('btnFriends'); return { exists: !!b, hidden: !b || b.classList.contains('hidden') }; });
  if (play) {
    await page.evaluate(() => window.__enkaz.play());
    await page.evaluate(() => window.__enkaz.step(600, 1 / 60, false));
  } else await sleep(1500);
  const stats = await page.evaluate(() => (window.__enkaz.stats ? window.__enkaz.stats() : null));
  const external = reqs.filter((u) => !/^http:\/\/127\.0\.0\.1:(8813|8814)\//.test(u) && !u.startsWith('data:') && !u.startsWith('blob:') && !/sdk\.crazygames\.com|goatcounter|gc\.zgo\.at/.test(u));
  await ctx.close();
  return { btn, stats, external, errs };
}
try {
  const solo = await run('solo', 'http://127.0.0.1:8813/?test&q=low&bots=3&map=arena', true);
  ok(solo.errs.length === 0, 'tek kisilik: sayfa hatasi yok ' + JSON.stringify(solo.errs.slice(0, 3)));
  ok(solo.external.length === 0, 'tek kisilik: ag istegi yok ' + JSON.stringify(solo.external.slice(0, 4)));
  ok(solo.stats && solo.stats.state === 'playing' && solo.stats.actors.length >= 4, 'tek kisilik: mac 600 karede calisti, aktor ' + (solo.stats ? solo.stats.actors.length : '-'));
  ok(solo.btn.exists && !solo.btn.hidden, 'normal derleme: ARKADASLA OYNA dugmesi menuyle goruluyor (yerel sunucuda)');
  const portal = await run('portal', 'http://127.0.0.1:8814/?test&q=low&bots=3&map=arena', true);
  ok(portal.errs.length === 0, 'portal: sayfa hatasi yok ' + JSON.stringify(portal.errs.slice(0, 3)));
  ok(portal.btn.hidden, 'portal derlemesi: ARKADASLA OYNA dugmesi gizli');
  ok(portal.external.length === 0, 'portal: ag istegi yok ' + JSON.stringify(portal.external.slice(0, 4)));
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); srv.kill(); psrv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
