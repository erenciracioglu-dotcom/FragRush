// Fisekhane haritasi uretim testi + ustten gorunus (PNG): node test/fireworks.map.mjs [seed] [out.png]
// Dogma noktalarini, ogeleri, pedleri, isiklari, sandiklari, fitilleri ve depolari denetler; resimde catilar gorunur,
// sandiklar turuncu, fitiller sari, kirmizi direkler kirmizi, depolar kirmizi cerceve, dogma yesil, ogeler renkli, pedler camgobegi.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateFireworks, FW_LAYOUT } from '../src/world/fireworks.js';
import { M, MAT_COLOR } from '../src/world/materials.js';

const seed = Number(process.argv[2] || 1);
const outPath = process.argv[3] || '';
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateFireworks(w, seed);
const t1 = performance.now();
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const L = FW_LAYOUT, fw = info.fw, G = L.G;
console.log(`fireworks seed ${seed}: ${(t1 - t0).toFixed(0)} ms, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}, crates ${info.crates.length}, fuses ${fw.fuses.length}, depots ${fw.depots.length}`);
check('statik isik en cok 10', info.lights.length <= 10, String(info.lights.length));
check('uretim hizli', t1 - t0 < 3000, `${(t1 - t0).toFixed(0)} ms`);
let bad = 0;
for (const s of info.spawns) {
  const below = w.solidAtWorld(s.x, s.y - 0.1, s.z), blocked = w.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
  if (!below || blocked) { bad++; console.log('  kotu dogma', JSON.stringify(s), below, blocked); }
}
check('dogma noktalari zeminde ve bos', bad === 0 && info.spawns.length >= 14, `${info.spawns.length} nokta, ${bad} sorunlu`);
const cc = (c) => [(c.x0 + 2) * VS, (c.y0 + 1.5) * VS, (c.z0 + 2) * VS];
let nearC = 0, nearD = 0;
for (const s of info.spawns) {
  for (const c of info.crates) { const p = cc(c); if (Math.hypot(p[0] - s.x, p[2] - s.z) < 4 && Math.abs(p[1] - s.y) < 3) { nearC++; break; } }
  for (const d of fw.depots) if (Math.hypot(d.c[0] - s.x, d.c[2] - s.z) < 8) nearD++;
}
check('dogma noktasi sandigin (4 m) ya da deponun (8 m) dibinde degil', nearC === 0 && nearD === 0, `${nearC} sandik, ${nearD} depo yakini`);
let badI = 0;
for (const it of info.items) if (!w.solidAtWorld(it.x, it.y - 0.1, it.z) || w.boxSolid(it.x - 0.3, it.y + 0.05, it.z - 0.3, it.x + 0.3, it.y + 0.9, it.z + 0.3)) { badI++; console.log('  kotu oge', JSON.stringify(it)); }
check('ogeler zeminde ve bos', badI === 0, info.items.map((i) => i.type).join(' '));
check('KIYAMET kuresi kule merdiveninde / catida (zeminde degil)', info.items.some((i) => i.type === 'quad' && i.y > G * VS + 3), JSON.stringify(info.items.find((i) => i.type === 'quad')));
check('pedlerin hedefi zeminde', info.pads.every((p) => w.solidAtWorld(p.tx, p.ty - 0.1, p.tz)), info.pads.map((p) => `(${p.tx.toFixed(1)},${p.ty.toFixed(1)},${p.tz.toFixed(1)})`).join(' '));
// sandiklar: tam 4x3x4 voxel, alt satiri dolu bir seyin ustunde (havada sandik yok)
let floating = 0;
for (const c of info.crates) { let n = 0; for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) if (w.solid(c.x0 + x, c.y0 - 1, c.z0 + z)) n++; if (n < 8) floating++; }
check('sandiklar bir seyin ustunde (en az yarisi destekli)', floating === 0, `${info.crates.length} sandik, ${floating} havada`);
// fitiller: hucreler bitisik (her adim tek eksende 1), ilk hucre kirmizi direge, son hucre depoya bitisik
fw.fuses.forEach((f, i) => {
  const n = f.cells.length / 3; let jumps = 0;
  for (let k = 1; k < n; k++) { const d = Math.abs(f.cells[k * 3] - f.cells[k * 3 - 3]) + Math.abs(f.cells[k * 3 + 1] - f.cells[k * 3 - 2]) + Math.abs(f.cells[k * 3 + 2] - f.cells[k * 3 - 1]); if (d !== 1) jumps++; }
  const [a, b, c, d, e, g] = f.post, x0 = f.cells[0], z0 = f.cells[2];
  const nearPost = x0 >= a - 2 && x0 <= d + 1 && z0 >= c - 2 && z0 <= g + 1;
  const D = fw.depots[f.depot].box, xe = f.cells[n * 3 - 3], ze = f.cells[n * 3 - 1];
  const atDepot = xe >= D[0] - 2 && xe <= D[3] + 1 && ze >= D[2] - 2 && ze <= D[5] + 1;
  check(`fitil ${i}: ${n} hucre (${(n * VS).toFixed(1)} m, ${(n / 10).toFixed(1)} sn) bitisik, diregin dibinden depo kapisina`, jumps === 0 && nearPost && atDepot && b === G, `${jumps} kopukluk`);
});
fw.depots.forEach((d, i) => { let k = 0; const [x0, y0, z0, x1, y1, z1] = d.box; for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (w.mat[w.idx(x, y, z)] === M.KEG) k++; check(`depo ${i}: barut ficilari icinde`, k > 50, `${k} fici voxeli`); });

if (outPath) {
  const W = w.sx, H = w.sz, S = 3;
  const px = Buffer.alloc(W * S * H * S * 3);
  const put = (x, z, r, g, b) => { for (let dz = 0; dz < S; dz++) for (let dx = 0; dx < S; dx++) { const o = ((z * S + dz) * W * S + x * S + dx) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b; } };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    let y = w.sy - 1; while (y > 0 && !w.mat[w.idx(x, y, z)]) y--;
    const c = MAT_COLOR[w.mat[w.idx(x, y, z)]] || 0, sh = 0.5 + 0.5 * Math.min(1, (y - G) / 60);
    put(x, z, (((c >> 16) & 255) * sh) | 0, (((c >> 8) & 255) * sh) | 0, ((c & 255) * sh) | 0);
  }
  const mark = (xm, zm, col, r = 1) => { const X = Math.floor(xm / VS), Z = Math.floor(zm / VS); for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (X + dx >= 0 && Z + dz >= 0 && X + dx < W && Z + dz < H) put(X + dx, Z + dz, ...col); };
  for (const c of info.crates) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) put(c.x0 + x, c.z0 + z, 255, 130, 30);
  for (const f of fw.fuses) { for (let k = 0; k < f.cells.length; k += 3) put(f.cells[k], f.cells[k + 2], 255, 240, 60); const [a, , c, d, , g] = f.post; for (let z = c; z < g; z++) for (let x = a; x < d; x++) put(x, z, 255, 30, 30); }
  for (const d of fw.depots) { const [x0, , z0, x1, , z1] = d.box; for (let x = x0; x < x1; x++) { put(x, z0, 255, 40, 40); put(x, z1 - 1, 255, 40, 40); } for (let z = z0; z < z1; z++) { put(x0, z, 255, 40, 40); put(x1 - 1, z, 255, 40, 40); } }
  for (const s of info.spawns) mark(s.x, s.z, [40, 255, 60], 2);
  const IC = { quad: [255, 60, 240], mega: [60, 140, 255], health: [60, 255, 120], armor: [255, 210, 60], ammo: [255, 140, 40] };
  for (const it of info.items) mark(it.x, it.z, IC[it.type] || [255, 255, 255], 1);
  for (const p of info.pads) { mark(p.x, p.z, [20, 255, 200], 2); mark(p.tx, p.tz, [20, 255, 200], 0); }
  for (const l of info.lights) mark(l.x, l.z, [255, 255, 160], 0);
  fs.writeFileSync(outPath, png(W * S, H * S, px));
  console.log('yazildi', outPath);
}
console.log(fails ? `${fails} HATA` : 'tum fisekhane harita testleri gecti');
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
