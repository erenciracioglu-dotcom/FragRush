// Gok Adalari haritasi uretim testi + ustten gorunus (PNG): node test/sky.map.mjs [seed] [out.png]
// Adalari (kristal, cekirdek), kopruleri, bulut taslarini, dogma noktalarini, ogeleri, pedleri, isiklari denetler;
// yuklemede havada kopuk parca olmamali (sabit sutunlarla). Resimde kristaller mor, dogma yesil, ogeler renkli.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateSky, BRIDGES, bridgeY, CLOUD_Y } from '../src/world/sky.js';
import { M, MAT_COLOR, MAT_COUNT } from '../src/world/materials.js';
import { SkySystem } from '../src/fx/sky-islands.js';

const seed = Number(process.argv[2] || 777);
const outPath = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateSky(w, seed);
const t1 = performance.now();
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const count = new Map();
let solid = 0;
for (let i = 0; i < w.n; i++) if (w.mat[i]) { solid++; count.set(w.mat[i], (count.get(w.mat[i]) || 0) + 1); }
const S = info.sky;
console.log(`sky seed ${seed}: ${(t1 - t0).toFixed(0)} ms, solid ${solid}, adalar ${S.isles.length}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}`);
console.log('voxel: kaya', count.get(M.SKYROCK), 'toprak', count.get(M.SKYSOIL), 'cim', count.get(M.SKYGRASS), 'mermer', count.get(M.MARBLE), 'pirinc', count.get(M.BRASS), 'bakir pasi', count.get(M.VERDIGRIS), 'kiremit', count.get(M.ROOFTILE), 'yelken', count.get(M.SAIL) || 0, 'halat', count.get(M.ROPE), 'bulut tasi', count.get(M.CLOUDSTONE));
check('malzeme sayisi 125 (109-124 gok adalari)', MAT_COUNT === 125 && M.SKY_CRYSTAL0 === 109 && M.CLOUDSTONE === 124);
check('uretim hizli', t1 - t0 < 1500, `${(t1 - t0).toFixed(0)} ms`);
// kristaller: her adanin kendi malzemesi, adanin ucunun altinda
const mats = new Set();
let cbad = 0;
for (const d of S.isles) {
  const c = d.crystal, n = count.get(c.mat) || 0;
  mats.add(c.mat);
  if (n < 20 || !w.solidAtWorld(c.x, (c.y0 + c.y1) / 2, c.z) || c.y0 < CLOUD_Y + 0.3) { cbad++; console.log('  kotu kristal', d.name, n, c.y0.toFixed(2), c.y1.toFixed(2)); }
}
check('her adanin kristali var (ayri malzeme, bulutlarin ustunde)', cbad === 0 && mats.size === S.isles.length, S.isles.map((d) => d.name + ':' + count.get(d.crystal.mat)).join(' '));
// yuklemede kopuk parca yok (sabit sutunlar: ada cekirdekleri, bulut taslari)
const g = { world: w, scene: new THREE.Scene(), voxelMaterial: new THREE.MeshBasicMaterial(), workers: { workers: [] }, fx: {}, actors: [], arena: info, auth: true, time: 0 };
const sys = new SkySystem(g); sys.setup(info);
w.seedRegion(0, 1, 0, w.sx - 1, w.sy - 1, w.sz - 1);
const loose = w.findIslands();
check('yuklemede kopuk parca yok', loose.length === 0, `${loose.length} parca`);
// kopruler: guverte boyunca zemin, ustu bos
let bbad = 0;
for (const B of BRIDGES) {
  for (let s = B.s0; s <= B.s1; s++) {
    const y = bridgeY(B, (s - B.s0) / (B.s1 - B.s0)), x = B.axis === 'z' ? B.a + 4 : s, z = B.axis === 'z' ? s : B.a + 4;
    if (!w.solid(x, y, z) || w.solid(x, y + 1, z) || w.solid(x, y + 6, z)) bbad++;
  }
}
check('kopru guverteleri surekli ve ustu bos', bbad === 0, `${BRIDGES.length} kopru, ${bbad} kotu hucre`);
let rbad = 0;
for (const r of S.rocks) { let n = 0; for (let y = r.lo; y <= r.hi; y++) for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) if (w.solid(x, y, z)) n++; if (n < 8) rbad++; }
check('bulut taslari yerinde', rbad === 0 && S.rocks.length >= 10, `${S.rocks.length} tas`);
// dogma noktalari: zeminde ve bos, her adada en az iki
let bad = 0;
const per = new Array(S.isles.length).fill(0);
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z);
  const blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  if (!below || blocked || !(s.isle >= 0)) { bad++; console.log('  kotu dogma', s, { below, blocked }); } else per[s.isle]++;
}
check('dogma noktalari zeminde ve bos, her adada en az iki', bad === 0 && info.spawns.length >= 14 && per.every((n) => n >= 2), `${info.spawns.length} nokta, adalara gore ${per.join('/')}`);
let badI = 0;
for (const it of info.items) {
  const below = w.solidAtWorld(it.x, it.y - 0.1, it.z), blocked = w.solidAtWorld(it.x, it.y + 0.3, it.z);
  if (!below || blocked || !(it.isle >= 0)) { badI++; console.log('  kotu oge', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1), { below, blocked }); }
}
check('ogeler zeminde', badI === 0, info.items.map((i) => i.type + '@' + i.isle).join(' '));
const quad = info.items.find((i) => i.type === 'quad'), mega = info.items.find((i) => i.type === 'mega');
check('KIYAMET kuresi gozlemevi kulesinin tepesinde, MEGA kristal ocaginda', !!quad && quad.y > 19 && quad.isle === 0 && !!mega && mega.isle === 5, quad ? `kure y ${quad.y.toFixed(2)}` : '');
let pbad = 0;
for (const p of info.pads) {
  const below = w.solidAtWorld(p.tx, p.ty - 0.1, p.tz), blocked = w.boxSolid(p.tx - 0.3, p.ty + 0.1, p.tz - 0.3, p.tx + 0.3, p.ty + 1.7, p.tz + 0.3);
  if (!below || blocked || !(p.from >= 0 && p.to >= 0)) { pbad++; console.log('  kotu ped', p); }
}
check('pedlerin hedefi zeminde ve bos', pbad === 0 && info.pads.length >= 6, info.pads.map((p) => p.from + '>' + p.to).join(' '));
const L6 = info.lights.slice(0, 6);
check('isiklar <= 10, ilk 6 kristallerde', info.lights.length <= 10 && L6.every((l, i) => Math.hypot(l.x - S.isles[i].crystal.x, l.z - S.isles[i].crystal.z) < 1.5), `${info.lights.length} isik`);

if (outPath) {
  const W = w.sx, H = w.sz, K = 3;
  const px = Buffer.alloc(W * K * H * K * 3);
  const put = (x, z, r, g2, b) => {
    for (let dz = 0; dz < K; dz++) for (let dx = 0; dx < K; dx++) { const o = ((z * K + dz) * W * K + x * K + dx) * 3; px[o] = r; px[o + 1] = g2; px[o + 2] = b; }
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let y = w.sy - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    const m = w.mat[w.idx(x, y, z)];
    if (!m) { put(x, z, 235, 205, 190); continue; }   // bulut denizi
    const c = MAT_COLOR[m] || 0, sh = 0.55 + 0.45 * Math.min(1, y / 70);
    put(x, z, ((c >> 16) & 255) * sh | 0, ((c >> 8) & 255) * sh | 0, (c & 255) * sh | 0);
  }
  const mark = (xm, zm, col, r = 1) => { const X = Math.floor(xm / VS), Z = Math.floor(zm / VS); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (X + dx >= 0 && Z + dz >= 0 && X + dx < W && Z + dz < H) put(X + dx, Z + dz, ...col); };
  for (const d of S.isles) mark(d.crystal.x, d.crystal.z, [200, 80, 255], 2);
  for (const s of info.spawns) mark(s.x, s.z, [40, 255, 60], 2);
  const IC = { quad: [255, 60, 240], mega: [60, 140, 255], health: [60, 255, 120], armor: [255, 210, 60], ammo: [255, 140, 40] };
  for (const it of info.items) mark(it.x, it.z, IC[it.type] || [255, 255, 255], 1);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 200], 2); mark(p.tx, p.tz, [20, 255, 200], 0); }
  fs.writeFileSync(outPath, png(W * K, H * K, px));
  console.log('yazildi', outPath);
}
console.log(fails ? `${fails} HATA` : 'tum gok adalari harita testleri gecti');
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
