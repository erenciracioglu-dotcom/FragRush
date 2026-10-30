// Oyuncak odasi: ev sahibi domino zincirini tetikler, kule devrilir. Konukta devrilen kule govdeleri gorunmeli,
// sonunda iki dunya ayni olmali. usage: SIGNAL=<oda sunucusu> node test/net.toy.mjs [harita=toyroom]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const MAP = process.argv[2] || 'toyroom';
const SIGNAL = process.env.SIGNAL || 'http://127.0.0.1:8787', PORT = process.env.PORT || '8813', BASE = `http://127.0.0.1:${PORT}/`;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT }, stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errs = [];
const q = (extra) => `?q=low&volume=0&signal=${encodeURIComponent(SIGNAL)}${extra}`;
async function open(name, url) {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  return page;
}
const digest = () => { const w = window.__enkaz.game.world; let h = 0x811c9dc5; const m = w.mat, d = w.dmg; for (let i = 0; i < m.length; i++) { h = Math.imul(h ^ m[i], 16777619); h = Math.imul(h ^ d[i], 16777619); } return h >>> 0; };
try {
  const host = await open('host', BASE + q('&map=arena&bots=0'));
  await host.evaluate(() => window.__enkaz.netApi.startFriends());
  await host.waitForFunction(() => window.__enkaz.netApi.roomCode(), null, { timeout: 30000 });
  const code = await host.evaluate(() => window.__enkaz.netApi.roomCode());
  await host.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  const guest = await open('guest', BASE + q(`&room=${code}`));
  await guest.click('#btnJoin');
  await guest.waitForFunction(() => !document.getElementById('startScreen').classList.contains('hidden'), null, { timeout: 60000 });
  await guest.evaluate(() => document.getElementById('startScreen').click());
  await sleep(300); await guest.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  // haritaya gec (ag uzerinden)
  await host.evaluate((m) => { const g = window.__enkaz.game; g.settings.map = m; g.matchTime = 0.2; }, MAP);
  await guest.waitForFunction((m) => window.__enkaz.game.mapId === m && window.__enkaz.game.state === 'playing' && window.__enkaz.game.player.alive, MAP, { timeout: 90000 });
  ok(true, 'konuk ' + MAP + ' haritasina gecti');
  await sleep(2500);
  const armed = await host.evaluate(() => { const g = window.__enkaz.game; return !!(g.toySys && g.toySys.active && g.toySys.armed); });
  ok(armed, 'ev sahibinde domino zinciri kurulu');
  const b0 = await host.evaluate(() => window.__enkaz.game.destruction.stats.bodies);
  await host.evaluate(() => { const g = window.__enkaz.game; g.toySys.trigger(g.player); });
  let maxGuest = 0, maxHost = 0, sawPos = false;
  for (let i = 0; i < 160; i++) {
    await sleep(250);
    const [gh, hh] = await Promise.all([guest.evaluate(() => window.__enkaz.guest.bodies.map.size), host.evaluate((b) => window.__enkaz.game.destruction.stats.bodies - b, b0)]);
    maxGuest = Math.max(maxGuest, gh); maxHost = Math.max(maxHost, hh);
    if (maxGuest > 0 && !sawPos) {
      // konumlar akiyor mu: iki ornek arasinda govde hareket etmeli
      const a = await guest.evaluate(() => [...window.__enkaz.guest.bodies.map.values()].map((e) => e.group.position.y));
      await sleep(300);
      const b = await guest.evaluate(() => [...window.__enkaz.guest.bodies.map.values()].map((e) => e.group.position.y));
      sawPos = a.length > 0 && b.length > 0 && a.some((y, k) => b[k] !== undefined && Math.abs(y - b[k]) > 0.01);
    }
    if (i > 20 && maxHost > 0 && gh === 0) break;
  }
  ok(maxHost > 0, 'ev sahibinde kule govdeleri dogdu (' + maxHost + ')');
  ok(maxGuest > 0, 'konukta devrilen kule govdeleri gorundu (en cok ' + maxGuest + ')');
  ok(sawPos, 'konukta govde konumu akiyor (hareket ediyor)');
  let eq = false;
  for (let i = 0; i < 40 && !eq; i++) { await sleep(500); eq = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(eq, 'domino ve kule sonrasi iki dunya ayni');
  ok(await guest.evaluate(() => window.__enkaz.guest.bodies.map.size === 0), 'yerlesen govdeler konukta kalkti');
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); srv.kill(); }
ok(errs.length === 0, 'sayfa hatasi 0 ' + JSON.stringify(errs.slice(0, 4)));
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
