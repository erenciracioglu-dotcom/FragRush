// KIYAMET roketi maliyeti + bot sayisi canli degisim
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8798' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('http://127.0.0.1:8798/?test&q=low&bots=4&seed=4242');
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => window.__enkaz.play());
const cnt = () => page.evaluate(() => ({ bots: window.__enkaz.game.bots.length, actors: window.__enkaz.game.actors.length, alive: window.__enkaz.game.bots.filter((b) => b.alive).length }));
console.log('baslangic:', JSON.stringify(await cnt()));
await page.keyboard.press('Escape');
await page.evaluate(() => { const g = window.__enkaz.game; console.log(g.state); const el = document.getElementById('setBots'); el.value = 11; el.dispatchEvent(new Event('input')); });
console.log('duraklatip 11:', JSON.stringify(await cnt()), await page.evaluate(() => window.__enkaz.game.bots.map((b) => b.name).join(', ')));
await page.evaluate(() => { const el = document.getElementById('setBots'); el.value = 2; el.dispatchEvent(new Event('input')); });
console.log('2:', JSON.stringify(await cnt()));
await page.evaluate(() => { const el = document.getElementById('setBots'); el.value = 9; el.dispatchEvent(new Event('input')); });
await page.evaluate(() => window.__enkaz.game.startMatch(true));
console.log('9 + yeni mac:', JSON.stringify(await cnt()));
// kiyamet roketi: arena ortasina
const r = await page.evaluate(async () => {
  const g = window.__enkaz.game, W = g.WEAPONS.find((w) => w.id === 'rocket');
  const p = g.player; p.quad = 15;
  const out = [];
  for (const q of [1, 3]) {
    const x = g.world.sx * 0.25 * 0.5 + (q === 3 ? 10 : -10), z = g.world.sz * 0.25 * 0.5, y = 3;
    const t0 = performance.now();
    g.projectiles.explode({ W, owner: p, quad: q, vel: { x: 1, y: 0, z: 0, clone() { return this; } } }, x, y, z, 0, 1, 0, null);
    const t1 = performance.now();
    let worst = 0, sum = 0;
    for (let i = 0; i < 120; i++) { const a = performance.now(); g.update(1 / 60); const b = performance.now(); worst = Math.max(worst, b - a); sum += b - a; await new Promise((r) => setTimeout(r, 5)); }
    out.push({ q, explodeMs: +(t1 - t0).toFixed(1), removed: g.destruction.stats.removed, worstUpdate: +worst.toFixed(1), avg: +(sum / 120).toFixed(2), bodies: g.destruction.bodies.length });
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log(logs.join('\n'));
await browser.close(); srv.kill();
