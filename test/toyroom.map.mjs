// Oyuncak Odasi haritasi uretim testi + ustten gorunus (PNG): node test/toyroom.map.mjs [seed] [out.png]
// Dogma noktalarini, ogeleri, isiklari, kuleyi ve domino dizisini denetler; resimde tavan atlanir (ustten oda),
// dominolar turuncu, kulenin devrilme alani kirmizi cerceve, dogma yesil, ogeler renkli, pedler camgobegi.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateToyroom, TOY_LAYOUT } from '../src/world/toyroom.js';
import { M, MAT_COLOR } from '../src/world/materials.js';

const seed = Number(process.argv[2] || 777);
const outPath = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateToyroom(w, seed);
const t1 = performance.now();
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
let solid = 0;
const count = new Map();
for (let i = 0; i < w.n; i++) if (w.mat[i]) { solid++; count.set(w.mat[i], (count.get(w.mat[i]) || 0) + 1); }
const L = TOY_LAYOUT, toy = info.toy, T = toy.tower;
console.log(`toyroom seed ${seed}: ${(t1 - t0).toFixed(0)} ms, solid ${solid}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}, domino ${toy.chain.length}`);
console.log('voxel: silte', count.get(M.MATTRESS), 'nevresim', count.get(M.DUVET), 'hali', count.get(M.RUG), 'pist', count.get(M.TRACK), 'kitap', [M.BOOK, M.BOOK_LAY].reduce((n, m) => n + (count.get(m) || 0), 0), 'blok', [M.BLOCK_R, M.BLOCK_B, M.BLOCK_Y, M.BLOCK_G].reduce((n, m) => n + (count.get(m) || 0), 0));
check('statik isik en cok 10', info.lights.length <= 10, String(info.lights.length));
check('uretim hizli', t1 - t0 < 3000, `${(t1 - t0).toFixed(0)} ms`);
check('oda kapali: en ust kat (24 m) tumuyle yikilmaz duvar ozu', (() => { for (let i = 0; i < w.sx * w.sz; i++) if (w.mat[i + (w.sy - 1) * w.sx * w.sz] !== M.WALLCORE) return false; return true; })());
let bad = 0;
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z);
  const blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  if (!below || blocked) { bad++; console.log('  kotu dogma', s, { below, blocked }); }
}
check('dogma noktalari zeminde ve bos', bad === 0 && info.spawns.length >= 14, `${info.spawns.length} nokta, ${bad} sorunlu`);
// dogma noktalari domino dizisinden ve kulenin devrilme alanindan uzak
const [tx0, , tz0, tx1, , tz1] = T.box;
let near = 0;
for (const s of info.spawns) {
  for (const d of toy.chain) if (Math.hypot(d.x - s.x, d.z - s.z) < 3) near++;
  const X = s.x / VS, Z = s.z / VS;
  if (X > tx0 - 10 && X < tx1 + 10 && Z > tz0 - Math.ceil(T.height / VS) - 6 && Z < tz1 + 2) near++;
}
check('dogma noktasi dominolarin dibinde ya da kulenin devrilme alaninda degil', near === 0, String(near));
let badI = 0;
for (const it of info.items) {
  const below = w.solidAtWorld(it.x, it.y - 0.1, it.z);
  const blocked = w.solidAtWorld(it.x, it.y + 0.3, it.z);
  if (!below || blocked) { badI++; console.log('  kotu oge', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1), { below, blocked }); }
}
check('ogeler zeminde', badI === 0, info.items.map((i) => i.type).join(' '));
check('KIYAMET kuresi gardirobun tepesinde', info.items.some((i) => i.type === 'quad' && Math.abs(i.y - L.WARD.top * VS) < 0.01 && i.x > L.WARD.x0 * VS && i.x < L.WARD.x1 * VS && i.z < L.WARD.z1 * VS));
check('MEGA yatagin altinda', info.items.some((i) => i.type === 'mega' && i.y < L.BED.top * VS && i.x > L.BED.x0 * VS && i.x < L.BED.x1 * VS && i.z > L.BED.z0 * VS && i.z < L.BED.z1 * VS));
check('pedlerin hedefi zeminde', info.pads.every((p) => w.solidAtWorld(p.tx, p.ty - 0.1, p.tz)), info.pads.map((p) => `(${p.tx.toFixed(1)},${p.ty.toFixed(1)},${p.tz.toFixed(1)})`).join(' '));
check('kule devrilme alani bos (yalniz hali / pist)', (() => {
  const Lh = Math.round(T.height / VS) + 2;
  for (let k = 2; k < Lh; k++) {
    const z = T.dir[1] < 0 ? tz0 - k : tz1 + k;
    for (let x = tx0; x < tx1; x++) for (let y = L.G0 + 1; y < L.G0 + 12; y++) if (w.get(x, y, z)) return false;
  }
  return true;
})());

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
    // tavanin altindan bak (ic oda)
    let y = L.CEIL - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    const m = w.mat[w.idx(x, y, z)];
    const c = MAT_COLOR[m] || 0;
    const sh = 0.55 + 0.45 * Math.min(1, y / 70);
    put(x, z, (((c >> 16) & 255) * sh) | 0, (((c >> 8) & 255) * sh) | 0, ((c & 255) * sh) | 0);
  }
  const mark = (xm, zm, col, r = 1) => { const X = Math.floor(xm / VS), Z = Math.floor(zm / VS); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (X + dx >= 0 && Z + dz >= 0 && X + dx < W && Z + dz < H) put(X + dx, Z + dz, ...col); };
  for (const d of toy.chain) mark(d.x, d.z, [255, 140, 20], 1);
  // devrilme alani (kirmizi cerceve)
  const Lh = Math.round(T.height / VS) + 6;
  const za = T.dir[1] < 0 ? tz0 - Lh : tz0, zb = T.dir[1] < 0 ? tz1 : tz1 + Lh;
  for (let x = tx0 - 10; x <= tx1 + 10; x++) { put(x, za, 255, 40, 40); put(x, zb, 255, 40, 40); }
  for (let z = za; z <= zb; z++) { put(tx0 - 10, z, 255, 40, 40); put(tx1 + 10, z, 255, 40, 40); }
  for (const s of info.spawns) mark(s.x, s.z, [40, 255, 60], 2);
  const IC = { quad: [255, 60, 240], mega: [60, 140, 255], health: [60, 255, 120], armor: [255, 210, 60], ammo: [255, 140, 40] };
  for (const it of info.items) mark(it.x, it.z, IC[it.type] || [255, 255, 255], 1);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 200], 2); mark(p.tx, p.tz, [20, 255, 200], 0); }
  for (const l of info.lights) mark(l.x, l.z, [255, 255, 120], 0);
  fs.writeFileSync(outPath, png(W * S, H * S, px));
  console.log('yazildi', outPath);
}
console.log(fails ? `${fails} HATA` : 'tum oyuncak odasi harita testleri gecti');
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
