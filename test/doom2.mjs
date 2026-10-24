// KIYAMET ile coklu oldurme: hata var mi
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8799' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
await page.goto('http://127.0.0.1:8799/?test&q=low&bots=7&seed=4242');
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => window.__enkaz.play());
for (const wid of ['rocket', 'pulse', 'shotgun', 'plasma', 'rail']) {
  const r = await page.evaluate(async (wid) => {
    const g = window.__enkaz.game, p = g.player;
    const { fire } = window.__enkazCombat || {};
    p.quad = 15;
    // botlari oyuncunun onune diz
    const P = p.mover.pos;
    let k = 0;
    const D = g.camera.getWorldDirection(new g.camera.position.constructor()); D.y = 0; D.normalize();
    for (const b of g.bots) { if (!b.alive) b.spawn(g.pickSpawn(b)); b.protect = 0; const dd = 3 + (k % 3) * 0.7, sd = (Math.floor(k / 3) - 1) * 0.6; b.mover.pos.set(P.x + D.x * dd - D.z * sd, P.y, P.z + D.z * dd + D.x * sd); b.mover.vel.set(0, 0, 0); k++; }
    const inp = window.__enkaz.input; if (!inp._md) { inp._md = inp.mouseDown.bind(inp); inp.mouseDown = (b) => (b === 0 && window.__fireHeld) || inp._md(b); }
    const wi = g.WEAPONS.findIndex((w) => w.id === wid);
    p.weapons.ammo[wi] = 50; p.weapons.select ? p.weapons.select(wi) : (p.weapons.cur = wi);
    const t0 = g.time;
    const frames0 = window.__frames || 0;
    p.pitch = -0.05;
    return { cur: p.weapons.def.id, alive: g.bots.filter((b) => b.alive).length };
  }, wid);
  // ates: input uzerinden
  await page.evaluate(() => { window.__fireHeld = true; try { window.__enkaz.step(40, 1/60, false); } catch (e) { window.__err = e.stack; } window.__fireHeld = false; try { window.__enkaz.step(90, 1/60, true); } catch (e) { window.__err = (window.__err || '') + e.stack; } });
  const er = await page.evaluate(() => window.__err); if (er) { console.log('HATA', er); break; }
  const after = await page.evaluate(() => ({ t: window.__enkaz.game.time.toFixed(2), state: window.__enkaz.game.state, alive: window.__enkaz.game.bots.filter((b) => b.alive).length, frags: window.__enkaz.game.player.frags, pl: window.__enkaz.game.player.alive }));
  console.log(wid, JSON.stringify(r), '->', JSON.stringify(after));
}
console.log(logs.join('\n'));
await browser.close(); srv.kill();
