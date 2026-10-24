// Yerel (SwiftShader) bench benzeri: izleme kamerasi + patlamalar, farkli ayarlarla goruntu
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, q = 'medium', extra = '', out = '/tmp/claude-0/shots/bl', secs = '15'] = process.argv;
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8793' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:8793/?test&q=${q}&bots=7&seed=4242${extra}`);
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => { const g = window.__enkaz.game; g.spectate = g.bots[0]; g.benchMode = true; });
const n = +secs;
for (let s = 0; s < n; s++) {
  await page.evaluate(() => {
    const g = window.__enkaz.game;
    for (let k = 0; k < 60; k++) {
      window.__enkaz.step(1, 1 / 60, false);
    }
    const sp = g.spectate;
    if (sp && sp.alive) {
      const V = g.camera.position.constructor;
      const e = sp.eye(new V()), d = sp.aimDir(new V());
      const h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
      if (g.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, 40, h)) {
        const x = e.x + d.x * h.dist, y = e.y + d.y * h.dist, z = e.z + d.z * h.dist;
        g.destruction.blast(x, y, z, 3.2, 520, null, 12, 320);
        g.fx.explosion(x, y, z, 3.4, 0xff7a1a, 1.2);
      }
    }
  });
}
const url = await page.evaluate(() => { window.__enkaz.step(1, 1 / 60, true); return window.__enkaz.capture(); });
fs.writeFileSync(out + '.png', Buffer.from(url.split(',')[1], 'base64'));
console.log(logs.slice(0, 20).join('\n'));
await browser.close(); srv.kill();
