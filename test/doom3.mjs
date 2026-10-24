// KIYAMET stres: oyuncu surekli kiyamette, botlara roket/mermi, her karede cizim
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const secs = Number(process.argv[2] || 60);
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8800' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text()); });
await page.goto('http://127.0.0.1:8800/?test&q=low&bots=11&seed=' + (process.argv[3] || 4242));
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__enkaz.play(); const inp = window.__enkaz.input; inp._md = inp.mouseDown.bind(inp); inp.mouseDown = (b) => (b === 0 && window.__fireHeld) || inp._md(b); });
for (let s = 0; s < secs * 6; s += 1) {
  const r = await page.evaluate((s) => {
    const g = window.__enkaz.game, p = g.player;
    try {
      for (let i = 0; i < 10; i++) {
        if (p.alive) {
          p.quad = 15;
          // en yakin bota nisan
          let best = null, bd = 1e9;
          for (const b of g.bots) { if (!b.alive) continue; const d = b.mover.pos.distanceToSquared(p.mover.pos); if (d < bd) { bd = d; best = b; } }
          if (best) { const dx = best.mover.pos.x - p.mover.pos.x, dz = best.mover.pos.z - p.mover.pos.z, dy = best.mover.pos.y - p.mover.pos.y; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)) * 0.8; }
          const wi = (Math.floor((s * 10 + i) / 150)) % 5; p.weapons.ammo[wi] = 99; p.weapons.select(wi);
          window.__fireHeld = true;
        }
        // botlarin bazilari da kiyamette
        if (i % 30 === 0) for (const b of g.bots) if (Math.random() < 0.15) b.quad = 15;
        const a = performance.now(); window.__enkaz.step(1, 1 / 60, true); g.renderer.getContext().finish(); const ms = performance.now() - a; if (ms > (window.__worst || 0)) window.__worst = ms; if (ms > 400) { window.__slow = (window.__slow || []); window.__slow.push({ ms: Math.round(ms), add: g.fx.add.count, smoke: g.fx.smoke.count, debris: g.fx.debris.count, cam: g.camera.position.toArray().map((v) => +v.toFixed(1)), tris: g.renderer.info.render.triangles, calls: g.renderer.info.render.calls }); }
      }
    } catch (e) { return { err: e.stack }; }
    const sl = window.__slow; window.__slow = null; return { slow: sl, worst: Math.round(window.__worst || 0), t: g.time.toFixed(1), st: g.state, fr: p.frags, al: g.bots.filter((b) => b.alive).length, rem: g.destruction.stats.removed, bodies: g.destruction.bodies.length, def: g.chunks.deferred.size, gl: g.renderer.getContext().isContextLost() };
  }, s);
  if (r.slow || r.err || s % 30 === 0) console.log(JSON.stringify(r));
  if (r.err) break;
}
console.log(logs.slice(0, 20).join('\n'));
await browser.close(); srv.kill();
