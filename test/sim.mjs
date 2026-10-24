// Uzun bot simulasyonu (render yok): hata, performans, skor dagilimi
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [,, secs = '180', bots = '7', diff = '1'] = process.argv;
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8792' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
await page.goto(`http://127.0.0.1:8792/?test&q=low&bots=${bots}&seed=777`);
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate((d) => { for (const b of window.__enkaz.game.bots) b.setSkill(+d); }, diff);
const total = +secs * 60;
let worst = 0, sum = 0;
for (let i = 0; i < total; i += 600) {
  const ms = await page.evaluate(() => {
    let w = 0; for (let k = 0; k < 600; k++) { const a = performance.now(); window.__enkaz.step(1, 1 / 60, false); w = Math.max(w, performance.now() - a); } return w;
  });
  worst = Math.max(worst, ms);
  const st = await page.evaluate(() => {
    const g = window.__enkaz.game;
    const pr = g.prof ? Object.fromEntries(Object.entries(g.prof).map(([k, v]) => [k, +v.toFixed(1)])) : null; if (g.prof) for (const k in g.prof) g.prof[k] = 0;
    return { prof: pr, t: g.time.toFixed(0), frags: g.bots.map(b => b.frags).join(','), modes: g.bots.map(b => b.mode[0] + (b.alive ? '' : 'X')).join(''), stuck: g.bots.map(b => b.stuckT.toFixed(1)).join(','), d: g.destruction.stats, debris: g.fx.debris.count, nav: g.nav.dirtyCells.size };
  });
  console.log(JSON.stringify(st), 'worstStep', ms.toFixed(1));
}
console.log(logs.slice(0, 30).join('\n'));
await browser.close(); srv.kill();
