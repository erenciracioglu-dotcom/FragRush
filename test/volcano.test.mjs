// Volkan haritasi gezilebilirlik testi (tarayicisiz): kulelerin sarmal merdivenleri, ziplama pedleri,
// gezinme aginda lavin icinde dugum ve lavi kesen kenar olmamasi, lav olumu (aktor lava girince).
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateVolcano, VOLCANO_LAVA_Y } from '../src/world/volcano.js';
import { M } from '../src/world/materials.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';

const seed = Number(process.argv[2] || 777);
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateVolcano(w, seed);
w.lavaY = info.lava.y; w.lavaMask = info.lava.mask;
const LY = VOLCANO_LAVA_Y;
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const m = new Mover(w);
// lav kurali (fx/lava.js ile ayni): ayak lav yuzeyinin hemen ustunde ya da altinda, altindaki voxel bos ve maskede
const isLava = (x, y, z) => y < info.lava.y && info.lava.mask[Math.floor(x / VS) + w.sx * Math.floor(z / VS)] === 1 && !w.solidAtWorld(x, y, z);
const inLava = (p) => p.y <= info.lava.y + 0.08 && isLava(p.x, Math.min(p.y + 0.05, info.lava.y - 0.05), p.z);

// sarmal merdiven: gövde cevresinde (cx, cz), halka r0..r1 (voxel), zemin gy'den guverte topY'ye
function climb(name, cx, cz, r0, r1, topY) {
  const R = (r0 + r1) / 2 * VS;
  const ox = (cx + 0.5) * VS, oz = (cz + 0.5) * VS;
  let sx = 0, sz = 0, y = 0;
  for (let a0 = -Math.PI + 0.12; a0 < 0; a0 += 0.15) {
    sx = ox + Math.cos(a0) * R; sz = oz + Math.sin(a0) * R;
    y = (topY - 2) * VS;
    for (let k = 0; k < 80; k++) { if (w.solidAtWorld(sx, y - 0.01, sz) && !m.collides(sx, y, sz)) break; y -= VS; }
    if (w.get(Math.floor(sx / VS), Math.floor((y - 0.01) / VS), Math.floor(sz / VS)) === M.BASALT_BRICK) break;
  }
  m.reset(sx, y + 0.02, sz);
  let maxY = m.pos.y;
  for (let i = 0; i < 9 / dt; i++) {
    const p = m.pos;
    const a = Math.atan2(p.z - oz, p.x - ox);
    const r = Math.hypot(p.x - ox, p.z - oz);
    let tx = -Math.sin(a), tz = Math.cos(a);
    tx += (Math.cos(a) * (R - r)) * 1.5; tz += (Math.sin(a) * (R - r)) * 1.5;
    m.simulate(dt, cmd({ fwd: 1, yaw: Math.atan2(-tx, -tz) }));
    maxY = Math.max(maxY, m.pos.y);
    if (m.pos.y >= topY * VS - 0.05) break;
  }
  check(`${name}: merdivenle guverteye`, maxY >= topY * VS - 0.05, `azami ${maxY.toFixed(2)} m, guverte ${(topY * VS).toFixed(2)} m`);
}
climb('obsidyen kule', 144, 144, 7, 13, 46);
climb('kuzey kulesi', 144, 50, 6, 11, 48);
climb('bati kulesi', 50, 144, 6, 11, 45);
climb('dogu kulesi', 212, 140, 6, 11, 45);

// pedler: firlatip hedefe inis
info.pads.forEach((pd, i) => {
  m.reset(pd.x, pd.y + 0.02, pd.z);
  padLaunchVelocity(pd, m.vel);
  m.onGround = false; m.padLock = 0.5;
  let landed = false;
  for (let k = 0; k < 4 / dt; k++) {
    m.simulate(dt, cmd());
    if (k > 20 && m.onGround) { landed = true; break; }
  }
  const d = Math.hypot(m.pos.x - pd.tx, m.pos.z - pd.tz), dy = m.pos.y - pd.ty;
  check(`ped ${i}: hedefe iner`, landed && d < 1.5 && Math.abs(dy) < 0.6, `uzaklik ${d.toFixed(2)} m, dy ${dy.toFixed(2)}`);
});

// gezinme agi: lavin icinde dugum yok, lavi kesen kenar yok
const nav = new NavGrid(w);
nav.buildAll();
let inl = 0, hot = 0, total = 0, crossing = 0;
const pos = { x: 0, y: 0, z: 0 }, pos2 = { x: 0, y: 0, z: 0 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
for (let c = 0; c < nav.ncell; c++) for (let k = 0; k < nav.cnt[c]; k++) {
  const id = c * 6 + k;
  total++;
  nav.nodePos(id, pos);
  if (inLava({ x: pos.x, y: pos.y, z: pos.z })) inl++;
  if (nav.hot[id]) hot++;
  const cx = c % nav.gx, cz = (c / nav.gx) | 0;
  for (let d = 0; d < 8; d++) {
    const k2 = nav.edge[id * 8 + d];
    if (k2 < 0) continue;
    const c2 = (cx + DIRS[d][0]) + (cz + DIRS[d][1]) * nav.gx;
    nav.nodePos(c2 * 6 + k2, pos2);
    // hat boyunca 8 ornek: zemin lav seviyesinin altinda ve lav varsa kesiyor
    for (let s = 1; s < 8; s++) {
      const t = s / 8, x = pos.x + (pos2.x - pos.x) * t, z = pos.z + (pos2.z - pos.z) * t;
      const top = Math.max(pos.y, pos2.y);
      let ground = false;
      for (let y = top - 0.05; y > info.lava.y - 0.3; y -= VS) if (w.solidAtWorld(x, y, z)) { ground = true; break; }
      if (!ground && isLava(x, info.lava.y - 0.1, z)) { crossing++; break; }
    }
  }
}
check('lavin icinde gezinme dugumu yok', inl === 0, `${total} dugum, ${hot} lav kenarinda, ${inl} lavda`);
check('lavi kesen gezinme kenari yok', crossing === 0, `${crossing} kenar`);

// lav olumu: dere yatagina birakilan aktor lava girer; kiyidaki aktor girmez
// ustu acik (magara icinde olmayan) bir lav noktasi
const pts = info.lava.points;
let lx = 0, lz = 0;
for (let i = 0; i < pts.length; i += 2) {
  if (!w.boxSolid(pts[i] - 0.4, info.lava.y, pts[i + 1] - 0.4, pts[i] + 0.4, info.lava.y + 3.6, pts[i + 1] + 0.4)) { lx = pts[i]; lz = pts[i + 1]; break; }
}
m.reset(lx, info.lava.y + 1.0, lz);
let died = false;
for (let k = 0; k < 2 / dt && !died; k++) { m.simulate(dt, cmd()); if (inLava(m.pos)) died = true; }
check('lava dusen aktor olur', died, `(${lx.toFixed(1)}, ${lz.toFixed(1)})`);
let safe = true;
for (const s of info.spawns) {
  m.reset(s.x, s.y + 0.02, s.z);
  for (let k = 0; k < 0.5 / dt; k++) m.simulate(dt, cmd());
  if (inLava(m.pos)) { safe = false; console.log('  lavda dogma', s); }
}
check('dogma noktalari lavda degil', safe);
console.log(fails ? `${fails} HATA` : 'tum volkan testleri gecti');
process.exitCode = fails ? 1 : 0;
