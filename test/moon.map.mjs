// Ay Ussu haritasi uretim testi + ustten gorunus (PNG): node test/moon.map.mjs [seed] [out.png]
// Basincli hacimleri (sizinti yok, ic hacimler), dogma noktalarini, ogeleri, isiklari denetler; resimde cam
// kubbelerin ici gorunur (cam yari saydam), zarlar mor, dogma yesil, ogeler renkli, pedler camgobegi.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateMoon, MOON_LAYOUT } from '../src/world/moon.js';
import { M, MAT_COLOR } from '../src/world/materials.js';

const seed = Number(process.argv[2] || 777);
const outPath = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateMoon(w, seed);
const t1 = performance.now();
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
let solid = 0;
const count = new Map();
for (let i = 0; i < w.n; i++) if (w.mat[i]) { solid++; count.set(w.mat[i], (count.get(w.mat[i]) || 0) + 1); }
console.log(`moon seed ${seed}: ${(t1 - t0).toFixed(0)} ms, solid ${solid}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}, doors ${info.moon.doors.length}`);
console.log('voxel: cam', count.get(M.GLASS), 'govde', count.get(M.HULL), 'regolit', count.get(M.REGOLITH), 'gunes paneli', count.get(M.SOLAR), 'ekran', count.get(M.SCREEN), 'bitki', count.get(M.PLANT));
for (const v of info.moon.volumes) console.log(`  hacim ${v.name}: ic ${v.interior} voxel (${(v.interior * VS ** 3).toFixed(0)} m3), kutu ${v.nx}x${v.ny}x${v.nz}${v.leak ? '  SIZINTI' : ''}`);
check('basincli hacimler sizdirmiyor', info.moon.leaks.length === 0, info.moon.leaks.join(','));
check('her hacmin ici yeterli', info.moon.volumes.every((v) => v.interior > (v.kind === 'dome' ? 20000 : 2500)), info.moon.volumes.map((v) => v.interior).join(' '));
check('statik isik en cok 10', info.lights.length <= 10, String(info.lights.length));
check('uretim hizli', t1 - t0 < 3000, `${(t1 - t0).toFixed(0)} ms`);
let bad = 0;
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z);
  const blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  if (!below || blocked) { bad++; console.log('  kotu dogma', s, { below, blocked }); }
}
check('dogma noktalari zeminde ve bos', bad === 0 && info.spawns.length >= 14, `${info.spawns.length} nokta, ${bad} sorunlu`);
let badI = 0;
for (const it of info.items) {
  const below = w.solidAtWorld(it.x, it.y - 0.1, it.z);
  const blocked = w.solidAtWorld(it.x, it.y + 0.3, it.z);
  if (!below || blocked) { badI++; console.log('  kotu oge', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1), { below, blocked }); }
}
check('ogeler zeminde', badI === 0, info.items.map((i) => i.type).join(' '));
check('KIYAMET kuresi canakta', info.items.some((i) => i.type === 'quad' && Math.abs(i.y - MOON_LAYOUT.dishY * VS) < 0.01));

if (outPath) {
  const W = w.sx, H = w.sz, S = 3;
  const px = Buffer.alloc(W * S * H * S * 3);
  const put = (x, z, r, g, b) => {
    for (let dz = 0; dz < S; dz++) for (let dx = 0; dx < S; dx++) {
      const o = ((z * S + dz) * W * S + x * S + dx) * 3;
      px[o] = r; px[o + 1] = g; px[o + 2] = b;
    }
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let y = w.sy - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    let m = w.mat[w.idx(x, y, z)];
    let glass = 0;
    // cam: altindaki ilk cam olmayan voxeli goster (camla karistir)
    while (y > 0 && (m === M.GLASS || !m)) { if (m === M.GLASS) glass++; y--; m = w.mat[w.idx(x, y, z)]; }
    const c = MAT_COLOR[m] || 0;
    const sh = 0.55 + 0.45 * Math.min(1, y / 60);
    let r = ((c >> 16) & 255) * sh, g = ((c >> 8) & 255) * sh, b = (c & 255) * sh;
    if (glass) { r = r * 0.6 + 60; g = g * 0.6 + 90; b = b * 0.6 + 110; }
    put(x, z, r | 0, g | 0, b | 0);
  }
  const mark = (xm, zm, col, r = 1) => { const X = Math.floor(xm / VS), Z = Math.floor(zm / VS); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (X + dx >= 0 && Z + dz >= 0 && X + dx < W && Z + dz < H) put(X + dx, Z + dz, ...col); };
  for (const d of info.moon.doors) mark(d.x, d.z, [220, 60, 255], 1);
  for (const s of info.spawns) mark(s.x, s.z, [40, 255, 60], 2);
  const IC = { quad: [255, 60, 240], mega: [60, 140, 255], health: [60, 255, 120], armor: [255, 210, 60], ammo: [255, 140, 40] };
  for (const it of info.items) mark(it.x, it.z, IC[it.type] || [255, 255, 255], 1);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 200], 2); mark(p.tx, p.tz, [20, 255, 200], 0); }
  for (const l of info.lights) mark(l.x, l.z, [255, 255, 120], 0);
  fs.writeFileSync(outPath, png(W * S, H * S, px));
  console.log('yazildi', outPath);
}
console.log(fails ? `${fails} HATA` : 'tum ay ussu harita testleri gecti');
process.exitCode = fails ? 1 : 0;

function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 3 + 1)] = 0; rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cb]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
