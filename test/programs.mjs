// Shader on derlemesi kontrolu: isinma sonrasi oyunda yeni shader programi derleniyor mu?
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [,, secs = '45'] = process.argv;
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8795' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[err] ${m.text()}`); });
await page.goto('http://127.0.0.1:8795/?test&q=ultra&bots=7&seed=4242');
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
const keys = () => page.evaluate(() => window.__enkaz.game.renderer.info.programs.map((p) => p.name + '|' + p.cacheKey));
// ilk gercek kare
await page.evaluate(() => window.__enkaz.step(1, 1 / 60, true));
const k0 = await keys();
console.log('isinma sonrasi program:', k0.length);
for (let s = 0; s < +secs; s++) {
  await page.evaluate(() => { for (let k = 0; k < 60; k++) window.__enkaz.step(1, 1 / 60, k === 59); });
}
const k1 = await keys();
const added = k1.filter((k) => !k0.includes(k));
console.log('sonra program:', k1.length, 'yeni:', added.length);
for (const a of added) console.log('  +', a.slice(0, 160));
const st = await page.evaluate(() => { const g = window.__enkaz.game; return { quad: g.items.list.filter((i) => i.type === 'quad').map((i) => i.active), rockets: g.projectiles.rocketPool.length, time: g.time.toFixed(0) }; });
console.log(JSON.stringify(st));
console.log(logs.slice(0, 10).join('\n'));
await browser.close(); srv.kill();
