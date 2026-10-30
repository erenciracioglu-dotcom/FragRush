// Gok Adalari gorsel kontrolu: gercek Chromeda haritayi yukler, golgelendirici hatalarini toplar ve sabit kamera
// noktalarindan ekran goruntusu alir (gun batiminda genel gorunus, dusen ada, kristal, buluttan yukselen ada, selaleli
// bahce, gozlem kulesi). Donmus botlar olcek verir. PNG + README icin JPEG.
// usage: node test/sky.shots.mjs [outDir=reports/sky_shots] [cekimler=hepsi] [bot=6] [boyut=1280x720] [kalite=high]
//        (README icin: 1578x802; HEADLESS=1 pencere acmaz; PORT=8963)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const outDir = path.resolve(root, process.argv[2] || 'reports/sky_shots');
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const BOTS = Number(process.argv[4] || 6);
const [VW, VH] = (process.argv[5] || '1280x720').split('x').map(Number);
const Q = process.argv[6] || 'high';
fs.mkdirSync(outDir, { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(outDir, 'log.txt'), s + '\n'); };
fs.writeFileSync(path.join(outDir, 'log.txt'), '');

const PORT = Number(process.env.PORT || 8963);
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, args: [`--window-size=${VW + 20},${VH + 80}`, '--window-position=60,60', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });

// botlar donar; olcek icin ana adaya dizilir
const helpers = `(() => {
  const g = __enkaz.game, sky = g.skySys;
  window.__cam = (px, py, pz, tx, ty, tz, fov = 90) => { g.attractCamera = () => { g.camera.position.set(px, py, pz); g.camera.lookAt(tx, ty, tz); g.camera.updateMatrixWorld(); }; document.getElementById('menu').classList.add('hidden'); g.setFov(fov); g.attractCamera(); };
  for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; b.takeDamage = () => 0; }
  const sp = (sky.allSpawns || g.arena.spawns).filter((s) => s.isle === 0);
  g.bots.forEach((b, i) => { const s = sp[i % sp.length]; b.mover.reset(s.x, s.y, s.z); b.mover.vel.set(0, 0, 0); b.yaw = s.yaw || 0; });
  return 'ok ' + sp.length;
})()`;

const SHOTS = [
  { name: 'overview', cam: [80, 30, 80, 36, 8, 36], fov: 70, steps: 30 },
  { name: 'crystal', cam: [53, 8.5, 29, 61.6, 9.6, 36.1], fov: 60, steps: 20 },
  { name: 'garden', cam: [48, 14, 22, 36, 9, 10.5], fov: 80, steps: 20 },
  { name: 'tower', cam: [20, 16, 54, 30.5, 17, 41.5], fov: 80, steps: 20 },
  { name: 'drop', cam: [44, 24, 16, 61.5, 6, 36], fov: 75, steps: 200, pre: '__enkaz.game.skySys.forceBreak(2, null)' },
  { name: 'rise', cam: [42, 21, 14, 61.5, 9, 36], fov: 75, steps: 0, pre: 'for (let i = 0; i < 60 && __enkaz.game.skySys.isles[2].phase !== 4; i++) __enkaz.step(60, 1 / 60, false); __enkaz.step(110, 1 / 60, false)' },
];

async function shoot(page, s) {
  await page.evaluate(([c, fv]) => __cam(c[0], c[1], c[2], c[3], c[4], c[5], fv), [s.cam, s.fov]);
  if (s.pre) await page.evaluate(s.pre);
  for (let left = s.steps; left > 0; left -= 6) await page.evaluate((k) => __enkaz.step(k, 1 / 60, false), Math.min(6, left));
  return page.evaluate(async () => {
    __enkaz.step(12, 1 / 60, true);   // cizerek: parca (chunk) meshleri yetissin (cizimsiz adimlarda yeniden orulmuyor)
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
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=sky&bots=${BOTS}&lang=tr&q=${Q}`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  const ready = Date.now() - t0;
  for (let i = 0; i < 25; i++) await page.evaluate(() => __enkaz.step(6, 1 / 60, false));
  log('helpers: ' + await page.evaluate(helpers));
  const shots = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  for (const s of shots) {
    const [png, jpg] = await shoot(page, s);
    fs.writeFileSync(path.join(outDir, `sky_${s.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `sky_${s.name}.jpg`), Buffer.from(jpg.split(',')[1], 'base64'));
    const st = await page.evaluate(() => { const k = __enkaz.game.skySys; return { ph: k.isles.map((s) => s.phase).join(''), drops: k.stats.drops, rises: k.stats.rises }; });
    log(`${s.name}: ${JSON.stringify(st)}`);
  }
  const st = await page.evaluate(() => { const g = __enkaz.game; return { mapId: g.mapId, tris: g.chunks.triangles, calls: g.renderer.info.render.calls, sky: g.skySys.active }; });
  result.sky = { ready, errors, st };
  log(`sky: ready ${ready} ms, ${JSON.stringify(st)}, errors ${errors.length}`);
  for (const e of errors.slice(0, 8)) log('   ' + e);
} catch (e) {
  log('HATA ' + (e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close(); srv.kill();
  log('bitti');
}
