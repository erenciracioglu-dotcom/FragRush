// Oyun senaryosu testi: node test/play.mjs <senaryo> [q]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, scenario = 'basic', q = 'low', outDir = '/tmp/claude-0/shots'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8791' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
await page.goto(`http://127.0.0.1:8791/?test&q=${q}&bots=5&seed=4242`);
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
const shot = async (name) => {
  const url = await page.evaluate(() => { window.__enkaz.step(1, 1 / 60, true); return window.__enkaz.capture(); });
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
};
const step = (n, dt = 1 / 60) => page.evaluate(([n, dt]) => window.__enkaz.step(n, dt, false), [n, dt]);
const ev = (fn, arg) => page.evaluate(fn, arg);
const stats = () => ev(() => window.__enkaz.stats());
const t0 = Date.now();
if (scenario === 'basic') {
  await ev(() => window.__enkaz.play());
  console.log('sim 60 ms', await step(60));
  await shot('p1_spawn');
  // kuleye don, roket at
  await ev(() => { const g = window.__enkaz.game, p = g.player; const c = g.center; const pp = p.mover.pos; p.yaw = Math.atan2(-(c.x - pp.x), -(c.z - pp.z)); p.pitch = 0.05; p.weapons.current = 3; window.__enkaz.input.virtualMouse = 1; });
  console.log('fire 90 ms', await step(90));
  await ev(() => { window.__enkaz.input.virtualMouse = 0; });
  console.log('settle 60 ms', await step(60));
  await shot('p2_after_rockets');
  console.log(JSON.stringify(await stats()));
  // ilerle + ziplama
  await ev(() => { const i = window.__enkaz.input; i.virtual.add('KeyW'); i.virtual.add('Space'); });
  console.log('run 120 ms', await step(120));
  await ev(() => { const i = window.__enkaz.input; i.virtual.clear(); });
  await shot('p3_after_run');
  // botlarin savasi
  console.log('bots 600 ms', await step(600, 1 / 60));
  console.log(JSON.stringify(await stats()));
  await shot('p4_later');
} else if (scenario === 'menu') {
  console.log('sim', await step(120));
  await shot('m1_menu');
  console.log(JSON.stringify(await stats()));
}
console.log('total s', ((Date.now() - t0) / 1000).toFixed(1));
console.log(logs.slice(0, 40).join('\n'));
await browser.close(); srv.kill();
