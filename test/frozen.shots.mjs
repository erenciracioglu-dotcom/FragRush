// Buz Golu gorsel kontrolu: gercek Chrome'da (GPU) haritayi yukler, golgelendirici hatalarini toplar ve
// sabit kamera noktalarindan ekran goruntusu alir. Diger haritalar da yuklenip derleme hatasi aranir.
// usage: node test/frozen.shots.mjs [outDir=reports/shots] [haritalar=frozen,meadow,volcano,arena] [cekimler=hepsi]
//        [bot=4] [boyut=1280x720]   (README icin: bot 0, 1578x802)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const outDir = path.resolve(root, process.argv[2] || 'reports/shots');
const maps = (process.argv[3] || 'frozen,meadow,volcano,arena').split(',');
const only = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null;
const BOTS = Number(process.argv[5] || 4);
const [VW, VH] = (process.argv[6] || '1280x720').split('x').map(Number);
fs.mkdirSync(outDir, { recursive: true });
const log = (s) => { fs.appendFileSync(path.join(outDir, 'log.txt'), s + '\n'); };
fs.writeFileSync(path.join(outDir, 'log.txt'), '');

const PORT = 8814;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
// HEADLESS=1: pencere acmadan (bilgisayar kullanilirken ekrana Chrome firlamasin)
const browser = await chromium.launch({ channel: 'chrome', headless: !!process.env.HEADLESS, args: [`--window-size=${VW + 20},${VH + 80}`, '--window-position=60,60'] });

// kardan adam (golun kuzey kiyisi, gole bakar): onunde gorus acik bir kamera yeri (agac / kaya arada kalmasin)
const SNOWMAN = `(() => {
  const g = __enkaz.game, w = g.world, it = g.items.list.find((i) => i.cache && Math.abs(i.home.x - 36.1) < 1 && i.home.z < 12);
  const p = it.home, h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
  const tx = p.x, ty = p.y + 0.45, tz = p.z;
  for (const dist of [6.5, 5.2, 4.2]) for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0]) {
    const a = Math.PI / 2 + da, cx = tx + Math.cos(a) * dist, cz = tz + Math.sin(a) * dist, cy = ty + 1.1;
    const dx = cx - tx, dy = cy - ty, dz = cz - tz, L = Math.hypot(dx, dy, dz), s = 1.3;
    if (!w.raycast(tx + dx / L * s, ty + dy / L * s, tz + dz / L * s, dx / L, dy / L, dz / L, L - s, h)) return [cx, cy, cz, tx, ty, tz];
  }
  return [tx, ty + 1.1, tz + 4.2, tx, ty, tz];
})()`;
// kamera: [x, y, z, bakX, bakY, bakZ] (metre) ya da sayfada hesaplanan ifade; pre: cekimden once calisan ifade
const FROZEN_SHOTS = [
  { name: 'overview', cam: [36, 15, 66, 36, 8, 34], steps: 120, fov: 80 },
  { name: 'castle_ice', cam: [27, 6.4, 47, 36, 11, 36.5], steps: 90, fov: 85 },
  { name: 'cabin', cam: [25.5, 8.5, 21.5, 25, 7.5, 11.5], steps: 90, fov: 85 },
  { name: 'cliff', cam: `[30, __gy(30, 14) + 1.7, 14, 36, __gy(30, 14) + 4.5, 2]`, steps: 60, fov: 85 },
  { name: 'snowman', cam: SNOWMAN, steps: 60, fov: 70 },
  { name: 'snowman_hit', cam: SNOWMAN, steps: 240, fov: 70, pre: `(() => { const g = __enkaz.game, it = g.items.list.find((i) => i.cache && Math.abs(i.home.x - 36.1) < 1 && i.home.z < 12), p = it.home; g.destruction.blast(p.x, p.y + 0.35, p.z + 0.5, 0.95, 260, null, 6, 160); return 'hidden=' + it.hidden; })()`, post: `(() => { const it = __enkaz.game.items.list.find((i) => i.cache && Math.abs(i.home.x - 36.1) < 1 && i.home.z < 12); return 'hidden=' + it.hidden; })()` },
  { name: 'nest', cam: [39.5, 17.6, 40, 62, 6, 62], steps: 60, fov: 90 },
  // golun dogusunda buzu roketle kir: hemen sonra (su fiskirir, buz parcalari ucar) ve dalgalar durulunca
  { name: 'hole_blast', cam: [55.5, 6.7, 31, 42, 6, 36], steps: 22, fov: 85, pre: `(() => { const g = __enkaz.game; g.destruction.blast(51, 4.6, 34, 2.2, 430, null, 10, 320); g.waterSys.explode(51, 4.7, 34, 1); g.fx.explosion(51, 4.8, 34, 3, 0xff7a1a, 1, 0, 1, 0); return 'blast q=' + g.iceSys.queue.size; })()` },
  { name: 'hole', cam: [55.5, 6.7, 31, 42, 6, 36], steps: 260, fov: 85 },
  { name: 'castle_near', cam: [25.2, 6.6, 50.8, 34, 9, 38.5], steps: 30, fov: 85 },
  { name: 'under', cam: [40, 3.4, 47, 33, 3.8, 40], steps: 30, fov: 85 },
];

// sayfaya eklenen yardimcilar: __shot (sabit kamera, n kare ilerlet), __gy (zemin yuksekligi, m)
const helpers = `
window.__shot = (px, py, pz, tx, ty, tz, steps = 2, fov = 90) => { const g = __enkaz.game; g.attractCamera = () => {}; document.getElementById('menu').classList.add('hidden'); g.setFov(fov); g.camera.position.set(px, py, pz); g.camera.lookAt(tx, ty, tz); g.camera.updateMatrixWorld(); return Math.round(__enkaz.step(steps)); };
window.__gy = (x, z) => { const w = __enkaz.game.world, h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 }; return w.raycast(x, 23, z, 0, -1, 0, 30, h) ? 23 - h.dist : 0; };
'helpers ok';`;
const result = {};
try {
  for (const map of maps) {
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { const tx = m.text(); if (m.type() === 'error' || /Shader Error|WebGLProgram|ERROR:/.test(tx)) errors.push(m.type() + ': ' + tx.slice(0, 600)); });
    page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/?test&map=${map}&bots=${BOTS}&lang=tr&q=high`);
    await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
    const ready = Date.now() - t0;
    // menu (harita dugmeleri, arkada tanitim kamerasi): sayfanin tam goruntusu
    if (map === maps[0] && (!only || only.includes('menu'))) {
      await page.evaluate(() => __enkaz.step(150));   // test kipinde oyun dongusu elle ilerler: tanitim kamerasi
      await page.screenshot({ path: path.join(outDir, `menu_${map}.png`) });
    }
    await page.evaluate(helpers);
    let shots = map === 'frozen' ? FROZEN_SHOTS : [{ name: 'view', cam: [36, 14, 64, 36, 6, 36], steps: 90, fov: 85 }];
    if (only && map === 'frozen') shots = shots.filter((s) => only.includes(s.name));
    for (const s of shots) {
      if (s.pre) log(`${map}/${s.name} pre: ` + await page.evaluate(s.pre));
      const cam = typeof s.cam === 'string' ? await page.evaluate(s.cam) : s.cam;
      const url = await page.evaluate(([c, st, fv]) => { __shot(c[0], c[1], c[2], c[3], c[4], c[5], st, fv); return __enkaz.capture(); }, [cam, s.steps, s.fov]);
      fs.writeFileSync(path.join(outDir, `${map}_${s.name}.png`), Buffer.from(url.split(',')[1], 'base64'));
      if (s.post) log(`${map}/${s.name} post: ` + await page.evaluate(s.post));
    }
    const st = await page.evaluate(() => { const g = __enkaz.game; return { mapId: g.mapId, tris: g.chunks.triangles, calls: g.renderer.info.render.calls, ice: !!(g.iceSys && g.iceSys.active), q: g.iceSys ? g.iceSys.queue.size : 0 }; });
    result[map] = { ready, errors, st };
    log(`${map}: ready ${ready} ms, ${JSON.stringify(st)}, errors ${errors.length}`);
    for (const e of errors.slice(0, 8)) log('   ' + e);
    await page.close();
  }
} catch (e) {
  log('HATA ' + (e && e.stack || e));
} finally {
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 1));
  await browser.close(); srv.kill();
  log('bitti');
}
