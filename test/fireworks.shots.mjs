// Fisekhane gorsel kontrolu: gercek Chrome'da haritayi yukler, golgelendirici hatalarini toplar ve sabit kamera
// noktalarindan ekran goruntusu alir (gece genel gorunus, avluda zincir ve gokte fisekler, kuleden fisek gosterisi,
// fitilde kosan kivilcim, depo patlamasi, fenerli kule). Donmus botlar olcek verir. PNG + README icin JPEG.
// usage: node test/fireworks.shots.mjs [outDir=reports/fireworks_shots] [cekimler=hepsi] [bot=6] [boyut=1280x720] [kalite=high]
//        (README icin: 1578x802; HEADLESS=1 pencere acmaz; PORT=8913)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const outDir = path.resolve(root, process.argv[2] || 'reports/fireworks_shots');
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const BOTS = Number(process.argv[4] || 6);
const [VW, VH] = (process.argv[5] || '1280x720').split('x').map(Number);
const Q = process.argv[6] || 'high';
fs.mkdirSync(outDir, { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(outDir, 'log.txt'), s + '\n'); };
fs.writeFileSync(path.join(outDir, 'log.txt'), '');

const PORT = Number(process.env.PORT || 8913);
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, args: [`--window-size=${VW + 20},${VH + 80}`, '--window-position=60,60', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

// botlar donar; ucu olcek icin avluya dizilir
const helpers = `(() => {
  const g = __enkaz.game, fw = g.fwSys;
  window.__cam = (px, py, pz, tx, ty, tz, fov = 90) => { g.attractCamera = () => { g.camera.position.set(px, py, pz); g.camera.lookAt(tx, ty, tz); g.camera.updateMatrixWorld(); }; document.getElementById('menu').classList.add('hidden'); g.setFov(fov); g.attractCamera(); };
  const put = (b, x, z, yaw) => { b.mover.reset(x, fw.G * 0.25 + 0.02, z); b.mover.vel.set(0, 0, 0); b.yaw = yaw; };
  for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; b.takeDamage = () => 0; }
  const spots = [[33.5, 51.5, 2.4], [45.5, 50.5, -2.6], [27.5, 41, 0.6], [52, 46, -1.2], [20, 30, 1], [60, 30, -1]];
  g.bots.forEach((b, i) => { const s = spots[i % spots.length]; put(b, s[0], s[1], s[2]); });
  window.__reset = () => { fw.matchReset(); };
  return 'ok';
})()`;

const SHOTS = [
  { name: 'overview', cam: [6, 21, 64, 36, 4, 34], fov: 85, steps: 60, pre: '__reset()' },
  { name: 'chain', cam: [28, 2.2, 47, 45, 9, 61], fov: 90, steps: 140, pre: '__reset(); __enkaz.game.fwSys._ignite(__enkaz.game.fwSys.crates[36], __enkaz.game.bots[0], 0, 0, [0.3, 0.3])' },
  { name: 'sky', cam: [36, 19, 41, 52, 10, 58], fov: 85, steps: 160, pre: '__reset(); const f = __enkaz.game.fwSys; f._ignite(f.crates[44], null, 0, 0, [0.3, 0.3]); f._ignite(f.crates[52], null, 0, 0.4, [0.3, 0.3])' },
  { name: 'fuse', cam: [33.4, 3.0, 56.6, 35.9, 1.6, 59.6], fov: 72, steps: 66, pre: '__reset(); const f = __enkaz.game.fwSys; f._light(f.fuses[0], 0, null, 0)' },
  { name: 'depot', cam: [46, 12, 28, 61, 2, 10], fov: 80, steps: 180, pre: '__reset(); const f = __enkaz.game.fwSys, u = f.fuses[1]; f._light(u, u.n - 12, null, 0)' },
  { name: 'tower', cam: [22, 2.6, 50, 36, 12.5, 36], fov: 85, steps: 30, pre: '__reset()' },
];

async function shoot(page, s) {
  await page.evaluate(([c, fv]) => __cam(c[0], c[1], c[2], c[3], c[4], c[5], fv), [s.cam, s.fov]);
  if (s.pre) await page.evaluate(s.pre);
  for (let left = s.steps; left > 0; left -= 6) await page.evaluate((k) => __enkaz.step(k, 1 / 60, false), Math.min(6, left));
  return page.evaluate(async () => {
    __enkaz.step(1);
    const png = __enkaz.capture(), im = new Image(); im.src = png; await im.decode();
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0);
    return [png, cv.toDataURL('image/jpeg', 0.84)];
  });
}

const result = {};
try {
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const tx = m.text(); if (m.type() === 'error' || /Shader Error|WebGLProgram|ERROR:/.test(tx)) errors.push(m.type() + ': ' + tx.slice(0, 600)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=fireworks&bots=${BOTS}&lang=tr&q=${Q}`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  const ready = Date.now() - t0;
  for (let i = 0; i < 25; i++) await page.evaluate(() => __enkaz.step(6, 1 / 60, false));
  log('helpers: ' + await page.evaluate(helpers));
  const shots = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  for (const s of shots) {
    const [png, jpg] = await shoot(page, s);
    fs.writeFileSync(path.join(outDir, `fireworks_${s.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `fireworks_${s.name}.jpg`), Buffer.from(jpg.split(',')[1], 'base64'));
    const st = await page.evaluate(() => { const f = __enkaz.game.fwSys; return { shells: f.shells.length, crates: f.stats.crates, depots: f.stats.depots, fuse: f.fuses.map((u) => u.st).join('') }; });
    log(`${s.name}: ${JSON.stringify(st)}`);
  }
  const st = await page.evaluate(() => { const g = __enkaz.game; return { mapId: g.mapId, tris: g.chunks.triangles, calls: g.renderer.info.render.calls, fw: g.fwSys.active, stats: g.fwSys.stats }; });
  result.fireworks = { ready, errors, st };
  log(`fireworks: ready ${ready} ms, ${JSON.stringify(st)}, errors ${errors.length}`);
  for (const e of errors.slice(0, 8)) log('   ' + e);
} catch (e) {
  log('HATA ' + (e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close(); srv.kill();
  log('bitti');
}
