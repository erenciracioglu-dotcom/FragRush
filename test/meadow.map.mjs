// Cayir haritasi uretim testi + ustten gorunus (BMP): node test/meadow.map.mjs [seed] [out.bmp]
import fs from 'node:fs';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateMeadow, MEADOW_WATER_Y } from '../src/world/meadow.js';
import { MAT_COLOR, M } from '../src/world/materials.js';

const seed = Number(process.argv[2] || 777);
const out = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateMeadow(w, seed);
const t1 = performance.now();
let solid = 0; for (let i = 0; i < w.n; i++) if (w.mat[i]) solid++;
console.log(`meadow seed ${seed}: ${(t1 - t0).toFixed(0)} ms, solid ${solid}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}`);
const WL = MEADOW_WATER_Y;
// dogma noktalari: altinda zemin, ustunde bos govde, suda degil
let bad = 0;
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z);
  const blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  const wet = s.y < WL * VS;
  if (!below || blocked || wet) { bad++; console.log('  kotu dogma', s, { below, blocked, wet }); }
}
console.log('dogma noktalari sorunlu:', bad);
for (const it of info.items) {
  const below = w.solidAtWorld(it.x, it.y - 0.1, it.z);
  const blocked = w.solidAtWorld(it.x, it.y + 0.3, it.z);
  if (!below || blocked) console.log('  kotu oge', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1), { below, blocked });
}
if (out) {
  const W = w.sx, H = w.sz, S = 3;
  const rowB = (W * S * 3 + 3) & ~3;
  const buf = Buffer.alloc(54 + rowB * H * S);
  buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W * S, 18); buf.writeInt32LE(-H * S, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let y = w.sy - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    const m = w.mat[w.idx(x, y, z)];
    let c = MAT_COLOR[m];
    let r = (c >> 16) & 255, gg = (c >> 8) & 255, b = c & 255;
    const sh = 0.55 + 0.45 * Math.min(1, y / 80);
    r *= sh; gg *= sh; b *= sh;
    if (y + 1 < WL) { const k = Math.min(0.85, 0.35 + (WL - y) * 0.05); r = r * (1 - k) + 30 * k; gg = gg * (1 - k) + 90 * k; b = b * (1 - k) + 140 * k; }
    for (let a = 0; a < S; a++) for (let bb = 0; bb < S; bb++) { const o = 54 + (z * S + a) * rowB + (x * S + bb) * 3; buf[o] = b; buf[o + 1] = gg; buf[o + 2] = r; }
  }
  const mark = (px, pz, col, rad = 2) => { for (let a = -rad; a <= rad; a++) for (let bb = -rad; bb <= rad; bb++) { const X = Math.round(px / VS) * S + bb, Z = Math.round(pz / VS) * S + a; if (X < 0 || Z < 0 || X >= W * S || Z >= H * S) continue; const o = 54 + Z * rowB + X * 3; buf[o] = col[2]; buf[o + 1] = col[1]; buf[o + 2] = col[0]; } };
  for (const s of info.spawns) mark(s.x, s.z, [255, 255, 255]);
  for (const it of info.items) mark(it.x, it.z, it.type === 'quad' ? [255, 60, 240] : it.type === 'mega' ? [60, 150, 255] : [255, 200, 40]);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 180], 3); mark(p.tx, p.tz, [20, 120, 90], 1); }
  fs.writeFileSync(out, buf);
  console.log('yazildi', out);
}
