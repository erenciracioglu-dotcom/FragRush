// Oyuncak Odasi gorsel kontrolu: gercek Chrome'da (GPU) haritayi yukler, golgelendirici hatalarini toplar ve sabit
// kamera noktalarindan ekran goruntusu alir (odanin genel gorunusu, domino dizisi, kosan zincir, devrilen kule, yatak
// trambolin, kitaplik ve gardirop, pencere isigi, kale, masa). Sahnede donmus robotlar olcek verir.
// usage: node test/toyroom.shots.mjs [outDir=reports/toyroom_shots] [cekimler=hepsi] [bot=6] [boyut=1280x720] [kalite=high]
//        (README icin: 1578x802; HEADLESS=1 pencere acmaz)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const outDir = path.resolve(root, process.argv[2] || 'reports/toyroom_shots');
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const BOTS = Number(process.argv[4] || 6);
const [VW, VH] = (process.argv[5] || '1280x720').split('x').map(Number);
const Q = process.argv[6] || 'high';
fs.mkdirSync(outDir, { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(outDir, 'log.txt'), s + '\n'); };
fs.writeFileSync(path.join(outDir, 'log.txt'), '');

const PORT = 8830;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, args: [`--window-size=${VW + 20},${VH + 80}`, '--window-position=60,60'] });

// botlar donar; birkaci olcek icin sahneye dizilir (halida pistin yaninda, kalenin onunde, dominolarin yaninda)
const FREEZE = `(() => {
  const g = __enkaz.game, VS = 0.25;
  window.__put = (b, x, z, yaw, yTop = 90) => {
    const X = Math.floor(x / VS), Z = Math.floor(z / VS);
    let y = 4; for (let yy = yTop; yy > 1; yy--) if (g.world.get(X, yy, Z)) { y = (yy + 1) * VS + 0.02; break; }
    b.mover.reset(x, y, z); b.mover.vel.set(0, 0, 0); b.yaw = yaw; b.pitch = 0;
  };
  g.bots.forEach((b, i) => { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; b.protect = 0; b.health = 100; });
  const spots = [[30, 44, 2.4], [22.5, 61, -2.2], [34.5, 63, 2.6], [46, 38, 1.9], [12, 46, -2.6], [26, 34, 3.0]];
  g.bots.forEach((b, i) => { const s = spots[i % spots.length]; if (!b.alive) b.spawn({ x: s[0], y: 2, z: s[1], yaw: s[2] }); window.__put(b, s[0], s[1], s[2]); });
  g.toySys.matchReset();
  return 'bots ' + g.bots.length;
})()`;
// zincir kosar (ilk domino); kare kosunun ortasinda alinir
const RUN = `(() => { const g = __enkaz.game, ts = g.toySys; ts.matchReset(); ts.trigger(g.bots[1] || null); return 'armed ' + ts.armed; })()`;
// kule devrilirken: zincir bastan kosar, kule devrilmeye baslayinca durulur (cekim adimlari devrilmenin ortasina kadar)
const FALL = `(() => {
  const g = __enkaz.game, ts = g.toySys;
  ts.matchReset(); ts.trigger(g.bots[1] || null);
  let n = 0; while (ts.tower.state !== 'fall' && n < 600) { __enkaz.step(1, 1 / 60, false); n++; }
  return 'fall after ' + (n / 60).toFixed(2) + ' s';
})()`;
// yatak: bir robot yataga dusup sekiyor
const BOUNCE = `(() => {
  const g = __enkaz.game, b = g.bots[3];
  if (!b) return 'no bot';
  b.mover.reset(60, 13, 29.5); b.mover.vel.set(0, 0, 0); b.yaw = 0.8;
  return 'drop';
})()`;
const SHOTS = [
  { name: 'overview', cam: [3.5, 20.5, 69, 38, 4, 30], steps: 120, fov: 92, pre: FREEZE },
  { name: 'overview_ne', cam: [69.5, 22.6, 11, 28, 2, 50], steps: 30, fov: 92 },
  { name: 'dominoes', cam: [15.5, 4.2, 61.5, 36, 2.8, 63.5], steps: 30, fov: 85 },
  { name: 'chain_run', cam: [15.5, 4.2, 61.5, 36, 2.8, 63.5], steps: 150, fov: 85, pre: RUN },
  { name: 'tower_fall', cam: [53, 6.5, 47, 39, 6, 53], steps: 40, fov: 85, pre: FALL },
  { name: 'tower_down', cam: [50, 9.5, 37, 40, 1.5, 49], steps: 150, fov: 85 },
  { name: 'bed', cam: [43, 10.5, 17.5, 61, 8, 30], steps: 72, fov: 85, pre: BOUNCE },
  { name: 'shelf', cam: [41, 11, 23, 54, 11, 2], steps: 30, fov: 88 },
  { name: 'window', cam: [30, 4.6, 31, 30, 14, 0], steps: 30, fov: 88 },
  { name: 'castle', cam: [25.5, 9.5, 51, 9, 3, 63], steps: 30, fov: 85 },
  { name: 'desk', cam: [17, 12.5, 45, 4, 8, 31], steps: 30, fov: 85 },
];

const helpers = `
window.__cam = (px, py, pz, tx, ty, tz, fov = 90) => { const g = __enkaz.game; g.attractCamera = () => {}; document.getElementById('menu').classList.add('hidden'); g.setFov(fov); g.camera.position.set(px, py, pz); g.camera.lookAt(tx, ty, tz); g.camera.updateMatrixWorld(); };
'helpers ok';`;
// cekim: kamera kurulur, adimlar 6'sar karelik parcalarla (tarayici araya worker mesh sonuclarini alir, oyundaki gibi),
// son kare render edilip alinir
async function shoot(page, s) {
  await page.evaluate(([c, fv]) => __cam(c[0], c[1], c[2], c[3], c[4], c[5], fv), [s.cam, s.fov]);
  for (let left = s.steps - 1; left > 0; left -= 6) {
    await page.evaluate((k) => __enkaz.step(k, 1 / 60, false), Math.min(6, left));
    await page.waitForTimeout(12);
  }
  return page.evaluate(() => { __enkaz.step(1); return __enkaz.capture(); });
}
const result = {};
try {
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const tx = m.text(); if (m.type() === 'error' || /Shader Error|WebGLProgram|ERROR:/.test(tx)) errors.push(m.type() + ': ' + tx.slice(0, 600)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=toyroom&bots=${BOTS}&lang=tr&q=${Q}`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  const ready = Date.now() - t0;
  if (!only || only.includes('menu')) {
    await page.evaluate(() => __enkaz.step(150));
    await page.screenshot({ path: path.join(outDir, 'menu_toyroom.png') });
  }
  await page.evaluate(helpers);
  const shots = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  if (only && !only.includes('overview')) log('freeze: ' + await page.evaluate(FREEZE));
  for (const s of shots) {
    if (s.pre) log(`${s.name} pre: ` + await page.evaluate(s.pre));
    const url = await shoot(page, s);
    fs.writeFileSync(path.join(outDir, `toyroom_${s.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    log(`${s.name}: tower ${await page.evaluate(() => __enkaz.game.toySys.tower.state)}`);
  }
  const st = await page.evaluate(() => { const g = __enkaz.game; return { mapId: g.mapId, tris: g.chunks.triangles, calls: g.renderer.info.render.calls, toy: g.toySys.active, stats: g.toySys.stats, ev: (g.events || []).slice(-8) }; });
  result.toyroom = { ready, errors, st };
  log(`toyroom: ready ${ready} ms, ${JSON.stringify(st)}, errors ${errors.length}`);
  for (const e of errors.slice(0, 8)) log('   ' + e);
} catch (e) {
  log('HATA ' + (e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close(); srv.kill();
  log('bitti');
}
