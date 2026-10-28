// Ay Ussu gorsel kontrolu: gercek Chrome'da (GPU) haritayi yukler, golgelendirici hatalarini toplar ve sabit
// kamera noktalarindan ekran goruntusu alir (gokte Dunya, kubbeler, kule, inis araci; seranin camina atis:
// hava kacagi, uzaya savrulan bot, vakum, kopuk yama; vakumda patlama tozu).
// usage: node test/moon.shots.mjs [outDir=reports/moon_shots] [cekimler=hepsi] [bot=4] [boyut=1280x720] [kalite=high]
//        (README icin: bot 0, 1578x802; HEADLESS=1 pencere acmaz)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const outDir = path.resolve(root, process.argv[2] || 'reports/moon_shots');
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const BOTS = Number(process.argv[4] || 4);
const [VW, VH] = (process.argv[5] || '1280x720').split('x').map(Number);
const Q = process.argv[6] || 'high';
fs.mkdirSync(outDir, { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(outDir, 'log.txt'), s + '\n'); };
fs.writeFileSync(path.join(outDir, 'log.txt'), '');

const PORT = 8829;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, args: [`--window-size=${VW + 20},${VH + 80}`, '--window-position=60,60'] });

// seranin guneybati paneli (iki kaburga arasi) ve icerde iki bot: biri delige yakin, biri ortada
const BREACH = `(() => {
  const g = __enkaz.game, w = g.world, VS = 0.25;
  for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; b.protect = 0; }
  const D = { x: 72, z: 104, R: 28 }, phi = Math.PI * 157.5 / 180, r0 = D.R - 2.5, h = {};
  const ox = (D.x + 0.5 + Math.cos(phi) * r0) * VS, oz = (D.z + 0.5 + Math.sin(phi) * r0) * VS;
  w.raycast(ox, 19.5 * VS, oz, Math.cos(phi), 0, Math.sin(phi), 2, h);
  const at = (r, da) => [(D.x + 0.5 + Math.cos(phi + da) * r) * VS, 14 * VS + 0.02, (D.z + 0.5 + Math.sin(phi + da) * r) * VS];
  const p0 = at(21.5, 0.02), p1 = at(19, -0.12);
  if (g.bots[0]) { g.bots[0].mover.reset(...p0); g.bots[0].health = 30; g.bots[0].armor = 0; g.bots[0].yaw = -phi - Math.PI / 2; }
  if (g.bots[1]) { g.bots[1].mover.reset(...p1); g.bots[1].health = 200; g.bots[1].yaw = -phi + 0.4; }
  for (let i = 2; i < g.bots.length; i++) g.bots[i].mover.reset(60, 4, 6 + i * 2);
  __enkaz.step(20, 1 / 60, false);
  window.__hole = [(h.x + 0.5) * VS, (h.y + 0.5) * VS, (h.z + 0.5) * VS];
  g.destruction.blast(...window.__hole, 0.3, 160, g.bots[2] || null);
  return 'hole ' + window.__hole.map((v) => v.toFixed(2)).join(',') + ' state ' + g.moonSys.vols[0].state;
})()`;
// cekimlerden once: botlar donar ve haritanin kenarina cekilir (arkada savasip kubbeleri delmesinler)
const FREEZE = `(() => {
  const g = __enkaz.game;
  g.bots.forEach((b, i) => { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; b.mover.reset(66 - i * 1.5, 4, 66); b.protect = 0; });
  return 'bots ' + g.bots.length;
})()`;
const SHOTS = [
  { name: 'overview', cam: [66, 16, 4, 22, 9.5, 48], steps: 120, fov: 90, pre: FREEZE },
  { name: 'earth', cam: [33, 5.4, 6, 24, 12, 34], steps: 60, fov: 85 },
  { name: 'domes', cam: [29.5, 9, 31.5, 18, 6, 47], steps: 60, fov: 85 },
  { name: 'tower', cam: [40, 7, 46, 29, 13, 37.5], steps: 60, fov: 85 },
  { name: 'lander', cam: [52, 6, 44, 62, 5, 34], steps: 60, fov: 85 },
  { name: 'greenhouse_in', cam: [19, 4.6, 21.5, 14.3, 10.2, 29.5], steps: 60, fov: 90 },
  { name: 'command_in', cam: [37, 5.2, 23, 44, 5.4, 30], steps: 60, fov: 90 },
  // hava kacagi: icerden (cam patladiktan hemen sonra), disardan (savrulan bot), vakum (kirmizi alarm)
  { name: 'breach', cam: [20, 5.6, 25.5, 12, 5.4, 28.7], steps: 16, fov: 85, pre: BREACH },
  { name: 'spaced', cam: [3.5, 6.5, 36, 12.5, 5.5, 28.5], steps: 22, fov: 85, post: `'state ' + __enkaz.game.moonSys.vols[0].state + ' ' + JSON.stringify(__enkaz.game.moonSys.stats)` },
  { name: 'vacuum', cam: [20, 5.6, 25.5, 12, 5.4, 28.7], steps: 240, fov: 85, post: `'state ' + __enkaz.game.moonSys.vols[0].state` },
  { name: 'foam', cam: [16, 4.6, 27, 11.5, 5.2, 29.2], steps: 1500, fov: 80, post: `'state ' + __enkaz.game.moonSys.vols[0].state + ' patches ' + __enkaz.game.moonSys.stats.patches` },
  // vakumda roket: duman yukselmez, toz yay cizerek duser
  { name: 'dust', cam: [46, 5.2, 8, 40, 4.5, 16], steps: 24, fov: 85, pre: `(() => { const g = __enkaz.game; g.destruction.blast(40, 3.5, 17, 2.2, 430, null, 10, 320); g.fx.explosion(40, 3.7, 17, 3, 0xff7a1a, 1, 0, 1, 0); return 'ok'; })()` },
];

const helpers = `
window.__shot = (px, py, pz, tx, ty, tz, steps = 2, fov = 90) => { const g = __enkaz.game; g.attractCamera = () => {}; document.getElementById('menu').classList.add('hidden'); g.setFov(fov); g.camera.position.set(px, py, pz); g.camera.lookAt(tx, ty, tz); g.camera.updateMatrixWorld(); return Math.round(__enkaz.step(steps)); };
'helpers ok';`;
const result = {};
try {
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const tx = m.text(); if (m.type() === 'error' || /Shader Error|WebGLProgram|ERROR:/.test(tx)) errors.push(m.type() + ': ' + tx.slice(0, 600)); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=moon&bots=${BOTS}&lang=tr&q=${Q}`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  const ready = Date.now() - t0;
  if (!only || only.includes('menu')) {
    await page.evaluate(() => __enkaz.step(150));
    await page.screenshot({ path: path.join(outDir, 'menu_moon.png') });
  }
  await page.evaluate(helpers);
  const shots = only ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  for (const s of shots) {
    if (s.pre) log(`${s.name} pre: ` + await page.evaluate(s.pre));
    const url = await page.evaluate(([c, st, fv]) => { __shot(c[0], c[1], c[2], c[3], c[4], c[5], st, fv); return __enkaz.capture(); }, [s.cam, s.steps, s.fov]);
    fs.writeFileSync(path.join(outDir, `moon_${s.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    if (s.post) log(`${s.name} post: ` + await page.evaluate(s.post));
  }
  const st = await page.evaluate(() => { const g = __enkaz.game; return { mapId: g.mapId, tris: g.chunks.triangles, calls: g.renderer.info.render.calls, moon: g.moonSys.active, ev: (g.events || []).slice(-8) }; });
  result.moon = { ready, errors, st };
  log(`moon: ready ${ready} ms, ${JSON.stringify(st)}, errors ${errors.length}`);
  for (const e of errors.slice(0, 8)) log('   ' + e);
} catch (e) {
  log('HATA ' + (e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close(); srv.kill();
  log('bitti');
}
