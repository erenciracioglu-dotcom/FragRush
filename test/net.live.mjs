// Canli deneme: GitHub Pages'teki oyun + Cloudflare oda sunucusu. Iki baslik Chrome (ayni bilgisayar) Pages adresinden baglanir.
// usage: node test/net.live.mjs [pages_adresi]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const URL0 = process.argv[2] || 'https://erenciracioglu-dotcom.github.io/FragRush/';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errs = [];
async function open(name, url) {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/GoatCounter|goatcounter|favicon/i.test(m.text())) errs.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  return page;
}
try {
  const host = await open('host', URL0 + '?autohost=1&q=low&volume=0');
  await host.waitForFunction(() => /room=[A-Z0-9]{6}/.test(document.getElementById('roomToast').textContent), null, { timeout: 60000 });
  const code = /room=([A-Z0-9]{6})/.exec(await host.textContent('#roomToast'))[1];
  ok(/^[A-Z0-9]{6}$/.test(code), 'canli sayfada oda acildi, kod ' + code);
  const guest = await open('guest', URL0 + '?room=' + code + '&q=low&volume=0');
  await guest.waitForSelector('#btnJoin:not(.hidden)', { timeout: 60000 });
  const t0 = Date.now();
  await guest.click('#btnJoin');
  await guest.waitForFunction(() => { const s = document.getElementById('startScreen'); return s && !s.classList.contains('hidden'); }, null, { timeout: 90000 });
  ok(true, 'konuk katildi ve dunya hazir (' + ((Date.now() - t0) / 1000).toFixed(1) + ' sn)');
  await sleep(500);
  await guest.evaluate(() => document.getElementById('startScreen').click());
  await sleep(8000);
  const joinHidden = await guest.evaluate(() => document.getElementById('joinScreen').classList.contains('hidden'));
  ok(joinHidden, 'konuk 8 sn oynadi, katilma ekrani kapali');
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); }
ok(errs.length === 0, 'sayfa hatasi 0 ' + JSON.stringify(errs.slice(0, 4)));
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
