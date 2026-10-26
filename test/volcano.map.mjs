// Volkan haritasi uretim testi + ustten gorunus (BMP): node test/volcano.map.mjs [seed] [out.bmp]
// Lav alanini cayirin su alaniyla karsilastirir (lav daha az olmali), dogma noktalarini ve ogeleri denetler.
import fs from 'node:fs';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateVolcano, VOLCANO_LAVA_Y } from '../src/world/volcano.js';
import { generateMeadow, MEADOW_WATER_Y } from '../src/world/meadow.js';
import { MAT_COLOR } from '../src/world/materials.js';

const seed = Number(process.argv[2] || 777);
const out = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateVolcano(w, seed);
const t1 = performance.now();
let solid = 0; for (let i = 0; i < w.n; i++) if (w.mat[i]) solid++;
console.log(`volcano seed ${seed}: ${(t1 - t0).toFixed(0)} ms, solid ${solid}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}, vents ${info.vents.length}`);
const LY = VOLCANO_LAVA_Y;
const L = info.lava;
// lav yuzeyi: maskede, lav seviyesinin hemen altindaki voxel bos olan kolonlar
let lavaCols = 0;
const lavaTop = new Uint8Array(w.sx * w.sz);
for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
  const c = x + w.sx * z;
  if (L.mask[c] && !w.mat[w.idx(x, LY - 1, z)]) { lavaCols++; lavaTop[c] = 1; }
}
// cayirin su yuzeyi (karsilastirma)
const wm = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
generateMeadow(wm, seed);
let waterCols = 0;
for (let z = 0; z < wm.sz; z++) for (let x = 0; x < wm.sx; x++) if (!wm.mat[wm.idx(x, MEADOW_WATER_Y - 1, z)]) waterCols++;
console.log(`lav yuzeyi ${(lavaCols * VS * VS).toFixed(0)} m2, cayir su yuzeyi ${(waterCols * VS * VS).toFixed(0)} m2 (oran ${(lavaCols / waterCols * 100).toFixed(0)}%)`);
console.log(`lav noktalari ${L.points.length / 2}, isiklar: ${info.lights.map((l) => l.intensity).join(' ')}`);
// dogma noktalari: altinda zemin, ustunde bos govde, lavda/lav kenarinda degil
let bad = 0;
const lavaNear = (x, z, r) => { const X = Math.floor(x / VS), Z = Math.floor(z / VS); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const xx = X + dx, zz = Z + dz; if (xx >= 0 && zz >= 0 && xx < w.sx && zz < w.sz && lavaTop[xx + w.sx * zz]) return true; } return false; };
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z);
  const blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  const hot = s.y < (LY + 2) * VS || lavaNear(s.x, s.z, 8);
  if (!below || blocked || hot) { bad++; console.log('  kotu dogma', s, { below, blocked, hot }); }
}
console.log('dogma noktalari sorunlu:', bad);
for (const it of info.items) {
  const below = w.solidAtWorld(it.x, it.y - 0.1, it.z);
  const blocked = w.solidAtWorld(it.x, it.y + 0.3, it.z);
  if (!below || blocked) console.log('  kotu oge', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1), { below, blocked });
}
console.log('ogeler:', info.items.map((i) => i.type + (i.noBots ? '*' : '')).join(' '));
if (out) {
  const W = w.sx, H = w.sz, S = 3;
  const rowB = (W * S * 3 + 3) & ~3;
  const buf = Buffer.alloc(54 + rowB * H * S);
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W * S, 18); buf.writeInt32LE(-H * S, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let y = w.sy - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    const m = w.mat[w.idx(x, y, z)];
    const c = MAT_COLOR[m];
    let r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255;
    const sh = 0.45 + 0.55 * Math.min(1, y / 80);
    r = Math.min(255, r * sh * 1.6); gg = Math.min(255, gg * sh * 1.6); b = Math.min(255, b * sh * 1.6);
    if (lavaTop[x + W * z] && y + 1 < LY) { r = 255; gg = 110; b = 20; }
    for (let a = 0; a < S; a++) for (let bb = 0; bb < S; bb++) { const o = 54 + (z * S + a) * rowB + (x * S + bb) * 3; buf[o] = b; buf[o + 1] = gg; buf[o + 2] = r; }
  }
  const mark = (px, pz, col, rad = 2) => { for (let a = -rad; a <= rad; a++) for (let bb = -rad; bb <= rad; bb++) { const X = Math.round(px / VS) * S + bb, Z = Math.round(pz / VS) * S + a; if (X < 0 || Z < 0 || X >= W * S || Z >= H * S) continue; const o = 54 + Z * rowB + X * 3; buf[o] = col[2]; buf[o + 1] = col[1]; buf[o + 2] = col[0]; } };
  for (const s of info.spawns) mark(s.x, s.z, [255, 255, 255]);
  for (const it of info.items) mark(it.x, it.z, it.type === 'quad' ? [255, 60, 240] : it.type === 'mega' ? [60, 150, 255] : [255, 220, 40]);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 180], 3); mark(p.tx, p.tz, [20, 120, 90], 1); }
  for (const v of info.vents) mark(v[0], v[2], [200, 200, 200], 1);
  fs.writeFileSync(out, buf);
  console.log('yazildi', out);
}
