// Cayir haritasi gezilebilirlik testi (tarayicisiz): agac evlerinin sarmal merdivenleri, ziplama pedleri,
// dogma noktalari, derin suyun gezinme agindan cikarilmasi.
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateMeadow, MEADOW_WATER_Y } from '../src/world/meadow.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';

const seed = Number(process.argv[2] || 777);
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateMeadow(w, seed);
w.waterY = info.water.y;
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const m = new Mover(w);

// sarmal merdiven: gövde cevresinde (cx, cz), halka r0..r1 (voxel), zemin gy'den guverte topY'ye
function climb(name, cx, cz, r0, r1, topY) {
  const R = (r0 + r1) / 2 * VS;
  const ox = (cx + 0.5) * VS, oz = (cz + 0.5) * VS;
  // yamactaki agacta ilk basamaklar toprak altinda kalabilir: ustu acik ilk basamaktan basla
  let sx = 0, sz = 0, y = 0;
  for (let a0 = -Math.PI + 0.12; a0 < 0; a0 += 0.15) {
    sx = ox + Math.cos(a0) * R; sz = oz + Math.sin(a0) * R;
    y = (topY - 2) * VS;
    for (let k = 0; k < 80; k++) { if (w.solidAtWorld(sx, y - 0.01, sz) && !m.collides(sx, y, sz)) break; y -= VS; }
    if (w.get(Math.floor(sx / VS), Math.floor((y - 0.01) / VS), Math.floor(sz / VS)) === 7) break;
  }
  m.reset(sx, y + 0.02, sz);
  let maxY = m.pos.y;
  for (let i = 0; i < 9 / dt; i++) {
    const p = m.pos;
    const a = Math.atan2(p.z - oz, p.x - ox);
    const r = Math.hypot(p.x - ox, p.z - oz);
    // teget + yaricapa geri cekme
    let tx = -Math.sin(a), tz = Math.cos(a);
    tx += (Math.cos(a) * (R - r)) * 1.5; tz += (Math.sin(a) * (R - r)) * 1.5;
    m.simulate(dt, cmd({ fwd: 1, yaw: Math.atan2(-tx, -tz) }));
    maxY = Math.max(maxY, m.pos.y);
    if (m.pos.y >= topY * VS - 0.05) break;
  }
  check(`${name}: merdivenle guverteye`, maxY >= topY * VS - 0.05, `azami ${maxY.toFixed(2)} m, guverte ${(topY * VS).toFixed(2)} m`);
}
climb('buyuk mese', 144, 144, 7, 13, 46);
climb('gozcu evi', 144, 50, 6, 11, 48);
climb('dere evi', 50, 144, 6, 11, 45);
climb('gol evi', 212, 140, 6, 11, 45);

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

// gezinme agi: derin suda dugum yok, sigda islak dugum var
const nav = new NavGrid(w);
nav.buildAll();
let deep = 0, wet = 0, total = 0;
for (let c = 0; c < nav.ncell; c++) for (let k = 0; k < nav.cnt[c]; k++) {
  const id = c * 6 + k;
  total++;
  if (MEADOW_WATER_Y - nav.ny[id] > 4) deep++;
  if (nav.wet[id]) wet++;
}
check('derin suda gezinme dugumu yok', deep === 0, `${total} dugum, ${wet} sig/islak`);
console.log(fails ? `${fails} HATA` : 'tum cayir testleri gecti');
process.exitCode = fails ? 1 : 0;
