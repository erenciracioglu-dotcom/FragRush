// Uctan uca mac testi: gercek Chrome'da OYNA'ya basilir, botlar mac bitene kadar (25 frag ya da 10 dk) oynar.
// Hatalar, FPS ve mac sonu kaydedilir. usage: node test/fullmatch.mjs [harita=meadow] [bot=11] [zorluk=6]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const map = process.argv[2] || 'meadow', bots = process.argv[3] || '11', diff = Number(process.argv[4] || 6);
const out = path.join(root, 'reports', `fullmatch_${map}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });

const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: '8812' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1280,760'] });
const errors = [];
const res = { map, bots, start: new Date().toISOString(), samples: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1216, height: 684 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:8812/?map=${map}&bots=${bots}`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  await page.evaluate((d) => {
    const g = window.__enkaz.game; g.settings.difficulty = d;
    // lav olumleri (volkan): kim, ne zaman, itilmis mi
    g.__lava = [];
    if (g.lavaDeath) { const f = g.lavaDeath.bind(g); g.lavaDeath = (a) => { g.__lava.push([a.name, Math.round(g.time), a.lastAttacker ? 1 : 0]); return f(a); }; }
    // olumler silaha gore (* = kendini parcalama): buz golunde soguk su / sarkit / bogulma kime yazildi
    g.__kills = {};
    const ok = g.onKill.bind(g);
    g.onKill = (v, k, wid, head) => { const key = wid + (k && k !== v ? '' : '*'); g.__kills[key] = (g.__kills[key] || 0) + 1; return ok(v, k, wid, head); };
  }, diff);
  // OYNA betikle (guvenilmeyen tiklama): fare kilitlenmez, test penceresi kullanicinin faresini/klavyesini
  // ele gecirmez; kilitsiz oyun duraklar, asagidaki dongu calisir tutar
  await page.evaluate(() => document.getElementById('btnPlay').click());
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const g = window.__enkaz.game; if (g.state === 'paused') g.state = 'playing'; });
  const t0 = Date.now();
  let ended = null;
  while (Date.now() - t0 < 12 * 60 * 1000) {
    await page.waitForTimeout(10000);
    const s = await page.evaluate(() => {
      const g = window.__enkaz.game;
      return { state: g.state, t: Math.round(g.time || 0), fps: Math.round(g.lastFps || 0),
        top: g.actors.map((a) => [a.name, a.frags]).sort((x, y) => y[1] - x[1]).slice(0, 3), lava: (g.__lava || []).length,
        iceQ: g.iceSys && g.iceSys.active ? g.iceSys.queue.size : undefined, wet: g.actors.filter((a) => a.alive && a.mover.inWater).length };
    });
    res.samples.push(s);
    // duraklama (fare kilidi otomasyonda alinamaz) olursa oyunu calisir tut
    if (s.state === 'paused') await page.evaluate(() => { window.__enkaz.game.state = 'playing'; });
    if (s.state === 'matchEnd') { ended = s; break; }
    fs.writeFileSync(out, JSON.stringify({ ...res, errors }, null, 1));
  }
  res.ended = ended; res.seconds = Math.round((Date.now() - t0) / 1000);
  res.lava = await page.evaluate(() => window.__enkaz.game.__lava || []);
  res.kills = await page.evaluate(() => window.__enkaz.game.__kills || {});
  res.final = await page.evaluate(() => window.__enkaz.game.actors.map((a) => [a.name, a.frags, a.deaths]));
} finally {
  res.errors = errors;
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  await browser.close(); srv.kill();
}
console.log('bitti', out);
