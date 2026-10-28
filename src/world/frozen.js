// Buz Golu haritasi: karli bir vadi, ortada ince buzla kapli donmus gol, golun ortasindaki adada buz kalesi.
// Gol buzu iki kat (0.5 m): atesle kirilir, altindaki su buz gibidir (can yer, fx/ice.js). Kirik buz zamanla
// kenarlarindan yeniden donar. Dere de donmus (dibine kadar buz).
// Kale: yuvarlak buz tugla kule (avludan tepeye sarmal merdiven, tepede KIYAMET kuresi), adanin kenarinda alcak
// mazgalli sur (dort kapi), dort kose burcu (mangal, sarkitlar). Kiyida kutuk evler (baca dumani), avci
// kulubesi, iskele (ucunda buzda balik deligi; MEGA gol dibinde), adaya tahta kopru, cam agaclari, icinde
// esya saklanan kardan adamlar. Sarkitlar vurulunca kopup duser ve altindakini yaralar (destruction.js).
// Su: seviyenin (FROZEN_WATER_Y) altindaki her bos voxel sudur. Tum yerlesim voxel biriminde; donen
// konumlar metre.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';
import { mulberry32 } from './mapgen.js';

export const FROZEN_WATER_Y = 18;   // voxel (4.5 m): bu yukseklikten asagisi su
const WL = FROZEN_WATER_Y;
const ICE_TOP = WL + 1;             // gol buzu WL-1 ve WL katlarinda; ustu (ilk bos voxel) ICE_TOP = 4.75 m
const SUBSOIL = 19;

const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, z, s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash3(ix, s, iz), b = hash3(ix + 1, s, iz), c = hash3(ix, s, iz + 1), d = hash3(ix + 1, s, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function fbm(x, z, s, oct = 4) {
  let v = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise(x, z, s + i * 17); n += a; x *= 2.03; z *= 2.03; a *= 0.5; }
  return v / n;
}

class Gen {
  constructor(world, seed) {
    this.w = world; this.sx = world.sx; this.sy = world.sy; this.sz = world.sz;
    this.rng = mulberry32(seed);
    this.ns = (seed % 7919) | 0;
    const n = this.sx * this.sz;
    this.H = new Int16Array(n);            // ilk bos voxel (zemin yuzeyi)
    this.zone = new Uint8Array(n);         // 0 kar, 1 dere yatagi, 2 dere kiyisi, 3 gol, 4 kiyi, 5 ucurum, 6 ada
    this.creekD = new Float32Array(n).fill(1e9);
    this.lakeIn = new Float32Array(n);     // gol icinde kiyiya uzaklik (voxel), disarida 0
    this.iceY0 = new Int8Array(n).fill(-1);   // kolonda buzun en alt kati (yoksa -1)
    this.noFreeze = new Uint8Array(n);     // yeniden donmayan acik su (buzda balik deligi)
    this.blocked = [];                     // agac/yapi icin dolu daireler [x, z, r]
  }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[this.idx(x, y, z)] = m; }
  // yalniz bos (ya da cam ignesi) voxele yaz: agaclar yapilari ezmesin
  soft(x, y, z, m) {
    if (!this.in(x, y, z)) return;
    const i = this.idx(x, y, z), c = this.w.mat[i];
    if (c === 0 || (c === M.SNOWPINE && m !== M.SNOWPINE)) this.w.mat[i] = m;
  }
  box(x0, y0, z0, x1, y1, z1, m) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); z0 = Math.max(0, z0 | 0);
    x1 = Math.min(this.sx, x1 | 0); y1 = Math.min(this.sy, y1 | 0); z1 = Math.min(this.sz, z1 | 0);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      let i = this.idx(x0, y, z);
      for (let x = x0; x < x1; x++, i++) this.w.mat[i] = m;
    }
  }
  h(x, z) { x = Math.max(0, Math.min(this.sx - 1, x | 0)); z = Math.max(0, Math.min(this.sz - 1, z | 0)); return this.H[x + this.sx * z]; }
  free(x, z, r) { for (const [bx, bz, br] of this.blocked) if (Math.hypot(bx - x, bz - z) < br + r) return false; return true; }
  block(x, z, r) { this.blocked.push([x, z, r]); }
}

// ---------------------------------------------------------------- yerlesim (voxel)
const C = [144, 146];                 // ada ve kale merkezi
const ISLE_R = 31;                    // ada duzlugu (avlu) yaricapi
const PLAT = 26;                      // avlu zemini (6.5 m)
const WALL_R0 = 25, WALL_R1 = 29;     // alcak mazgalli sur (1.25 m: ziplanip asilir) + 0.5 m mazgal
const WALL_TOP = PLAT + 5;
const KEEP_R = 6.5;                   // buz kulesi yaricapi
const NEST = 64;                      // gozetleme yeri (16 m): KIYAMET kuresi; sarmal merdiven ve pedlerle
const TURRET_D = 26.5, TURRET_R = 5, TURRET_TOP = 43;
const LAKE = [[144, 146, 80, 72], [98, 112, 28, 24], [200, 178, 22, 20]];
const CREEK = [[8, 92], [26, 96], [42, 104], [56, 114], [68, 122], [82, 128]];
const CABINS = [[100, 46], [190, 44]];
const STAND = [244, 100];             // avci kulubesi (kazikli)
const DECK_STAND = 38;
const HOLE = [116, 190];              // buzda balik deligi (4x4 merkez), iskele guneyden gelir
const SNOWMEN = [[144, 38, 'armor'], [44, 168, 'health'], [238, 200, 'armor'], [184, 242, 'ammo']];
// testler icin yerlesim (voxel)
export const FROZEN_LAYOUT = { center: C, plat: PLAT, nest: NEST, spiral: [8, 13], hole: HOLE, iceTop: ICE_TOP, snowmen: SNOWMEN };

export function generateFrozen(world, seed = 1) {
  const g = new Gen(world, seed);
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Buz Golu'],
    env: 'frozen', quadWhere: 'quadWhereFrozen',
    water: { y: WL * VS, flow: null, depth: null }, ice: null, chimneys: [],
  };
  terrain(g);
  fillColumns(g);
  freezeLake(g);
  const padPlan = planPads(g);   // ped yerleri ve ucus koridorlari dekordan once ayrilir
  scatterRocks(g);

  // kale
  keep(g, out);
  curtainWall(g, out);
  // kiyi yapilari
  g.cabins = [];
  for (const [x, z] of CABINS) cabin(g, out, x, z);
  hunterStand(g, out, STAND[0], STAND[1], DECK_STAND);
  footbridge(g, out);
  pier(g, out);
  caveIcicles(g);

  // dogal doku: cam agaclari, kar yiginlari, karli kutukler, kardan adamlar
  for (const [x, z, item] of SNOWMEN) snowman(g, out, x, z, item);
  const ca = -1.1;
  snowman(g, out, Math.round(C[0] + Math.cos(ca) * 19.5), Math.round(C[1] + Math.sin(ca) * 19.5), 'health');
  scatterTrees(g);
  cliffTrees(g);
  snowMounds(g);
  logs(g);

  for (const p of padPlan) padAt(g, out, ...p);
  carvePadPaths(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  underwaterRock(g);
  out.water.depth = depthMap(g);
  out.ice = iceData(g);
  // statik isik sayisi haritalar arasinda ayni kalir (game.js bos yuvalari sonuk isikla doldurur)
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- arazi
function creekStamp(g) {
  // Catmull-Rom egrisi boyunca disk damgasi: her kolona dereye uzaklik
  const P = CREEK;
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.ceil(len * 2);
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(P[P.length - 1]);
  g.creekPts = pts;
  const R = 16, sx = g.sx;
  for (const [px, pz] of pts) {
    for (let z = Math.floor(pz - R); z <= pz + R; z++) for (let x = Math.floor(px - R); x <= px + R; x++) {
      if (x < 0 || z < 0 || x >= sx || z >= g.sz) continue;
      const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
      const i = x + sx * z;
      if (d < g.creekD[i]) g.creekD[i] = d;
    }
  }
}

function lakeF(g, x, z) {
  // elipslerin birlesimi; isaretli yaklasik uzaklik (voxel, iceride negatif) + kiyi gurultusu
  let f = 1e9;
  for (const [cx, cz, rx, rz] of LAKE) {
    const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
    f = Math.min(f, (e - 1) * Math.min(rx, rz));
  }
  return f + (fbm(x / 10, z / 10, g.ns + 301, 3) - 0.5) * 8;
}

// adanin merkezine uzaklik (voxel), kiyisi hafif dalgali
function isleD(g, x, z) {
  const dx = x + 0.5 - C[0], dz = z + 0.5 - C[1];
  const a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) - (vnoise(Math.cos(a) * 2.5 + 7, Math.sin(a) * 2.5 + 7, g.ns + 401) - 0.5) * 3;
}

function cliffBand(g, x, z) {
  const sx = g.sx, sz = g.sz;
  const eN = z, eS = sz - 1 - z, eW = x, eE = sx - 1 - x;
  const e = Math.min(eN, eS, eW, eE);
  let along, k;
  if (e === eN) { along = x; k = 1; } else if (e === eS) { along = x; k = 2; } else if (e === eW) { along = z; k = 3; } else { along = z; k = 4; }
  let band = 11 + 13 * fbm(along / 21, k * 9.7, g.ns + 11, 3);
  // donmus dere kaynagi: bati ucurumu orada kalin (magara agzi)
  if (k === 3) band = Math.max(band, 26 * smooth(Math.max(0, 1 - Math.abs(z - 94) / 34)));
  return { e, band, along, k };
}

// ucurum yuzu: dipte karli bir seki (yuksek duvarda iki), ustu tam yukseklik. Seki genisligi ve yuksekligi
// yuz boyunca degisir; yatay kar seritleri duvarin tekduzeligini kirar. Her basamak en az 3 m: ziplayarak
// (atilma + egilme dahil) sekiye cikilmaz, ucurumun tepesine tirmanilmaz.
const LEDGE_MIN = 12;
function cliffH(g, along, k, d, floor, cH) {
  const Hw = cH - floor;
  if (Hw < LEDGE_MIN * 2) return cH;
  const st = (v) => Math.max(0, Math.min(1, (v - 0.5) * 2.4 + 0.5));
  const n1 = st(fbm(along / 12, k * 3.7, g.ns + 31, 3)), n2 = st(fbm(along / 19, k * 5.9, g.ns + 37, 3));
  const w1 = 1 + Math.round(5 * n1);
  if (Hw < LEDGE_MIN * 3) {
    const h1 = floor + Math.max(LEDGE_MIN, Math.min(Hw - LEDGE_MIN, Math.round(Hw * (0.38 + 0.24 * n2))));
    return d < w1 ? h1 : cH;
  }
  const w2 = w1 + 2 + Math.round(6 * n2);
  const h1 = floor + Math.max(LEDGE_MIN, Math.round(Hw * (0.26 + 0.12 * n2)));
  const h2 = Math.min(cH - LEDGE_MIN, Math.max(h1 + LEDGE_MIN, floor + Math.round(Hw * (0.6 + 0.14 * (1 - n1)))));
  return d < w1 ? h1 : d < w2 ? h2 : cH;
}

function terrain(g) {
  creekStamp(g);
  const sx = g.sx, sz = g.sz, s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + sx * z;
    const { e, band, along, k } = cliffBand(g, x, z);
    // karli vadi: hafif dalgalar, iki tepe, ucuruma dogru yukselme
    let base = 24 + 2.4 * fbm(x / 44, z / 44, s + 1);
    base += 4 * smooth(Math.max(0, 1 - Math.hypot(x - 58, z - 238) / 40));
    base += 4 * smooth(Math.max(0, 1 - Math.hypot(x - 238, z - 52) / 36));
    base += 5 * smooth(Math.max(0, Math.min(1, 1 - (e - band) / 34)));
    let H = Math.round(base);
    let zone = 0;
    // gol
    const f = lakeF(g, x, z);
    if (f < 0) {
      const dv = Math.min(11, Math.round(-f * 0.45));
      H = WL - 1 - dv; zone = 3;
      g.lakeIn[i] = -f;
    } else if (f < 26) {
      const sh = Math.round(WL + 1 + f * 0.36);
      if (sh < H) { H = sh; if (H <= WL + 2) zone = 4; }
    }
    // ada: avlu duzlugu + gole inen kayalik yamac
    const di = isleD(g, x, z);
    if (di < ISLE_R + 16) {
      const ih = di < ISLE_R ? PLAT : Math.round(PLAT - (di - ISLE_R) * 1.5);
      if (ih > H) { H = ih; zone = ih >= ICE_TOP ? 6 : 3; }
    }
    // dere: 2.25 m genis yatak (0.5 m su, dibine kadar donmus), basamakli kiyilar
    const dc = g.creekD[i];
    if (dc < 4.6) {
      if (zone !== 3 || H > 16) { H = Math.min(H, 16); zone = zone === 3 ? 3 : 1; }
    } else if (dc < 15) {
      const ch = Math.round(16 + (dc - 4.6) * 1.15);
      if (ch < H) { H = ch; if (zone !== 3 && zone !== 4) zone = 2; }
    }
    // ucurum (dere kaynagi ucurumu yarar)
    if (e < band) {
      const cH = Math.round(50 + 16 * fbm(x / 26, z / 26, s + 5));
      if (dc < 4.6) { /* dere kaynagi: yatak acik kalir */ }
      else if (dc < 15) H = Math.max(H, Math.min(cH, Math.round(16 + (dc - 4.6) * 3.2)));
      else H = Math.max(H, cliffH(g, along, k, band - e, Math.round(base), cH));
      if (dc >= 4.6) zone = 5;
      else zone = 1;
      g.cliffE = g.cliffE || new Int16Array(sx * sz).fill(-1);
      g.cliffE[i] = band - e;
    }
    g.H[i] = Math.max(3, Math.min(g.sy - 4, H));
    g.zone[i] = zone;
  }
}

function fillColumns(g) {
  const w = g.w, sx = g.sx, sz = g.sz, sxz = w.sxz, mat = w.mat;
  const s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    const H = g.H[c], zone = g.zone[c];
    mat[c] = M.BEDROCK; mat[c + sxz] = M.BEDROCK;
    const cliffIn = g.cliffE ? g.cliffE[c] : -1;
    const high = H >= 23;
    for (let y = 2; y < H; y++) {
      let m;
      if (cliffIn >= 0 && zone === 5) m = cliffIn <= 3 ? M.SROCK : M.SCLIFF;
      else if (zone === 6 || (zone === 3 && isleD(g, x, z) < ISLE_R + 16)) m = M.SROCK;
      else if (y < SUBSOIL && high) m = M.ROCK;
      else m = M.DIRT;
      mat[c + sxz * y] = m;
    }
    // ust katman: duz zeminde 0.5 m kar ortusu
    const top = H - 1;
    let tm, deep = false;
    if (zone === 3) tm = isleD(g, x, z) < ISLE_R + 16 ? M.SROCK : g.lakeIn[c] > 10 ? M.DIRT : M.SAND;
    else if (zone === 1) tm = hash3(x >> 1, 3, z >> 1) < 0.3 ? M.ROCK : M.SAND;
    else if (zone === 5) tm = cliffIn <= 3 || H < 40 ? M.SROCK : M.SNOW;
    else if (zone === 6) { tm = H >= PLAT - 1 || hash3(x >> 1, 5, z >> 1) < 0.55 ? M.SNOW : M.SROCK; deep = H >= PLAT; }
    else { tm = M.SNOW; deep = fbm(x / 13, z / 13, s + 77, 3) < 0.7; }
    mat[c + sxz * top] = tm;
    if (deep && top - 1 >= 2) mat[c + sxz * (top - 1)] = M.SNOW;
  }
  // donmus derenin kaynagi: ucurumun icinde kemerli magara agzi (buz yuzeyinin 3.75 m ustu acik)
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    if (!g.cliffE || g.cliffE[c] < 0 || g.creekD[c] >= 6.5) continue;
    const roof = 34 + Math.round(2 * hash3(x >> 1, 9, z >> 1));
    const cH = Math.round(50 + 16 * fbm(x / 26, z / 26, s + 5));
    if (g.cliffE[c] > 2) for (let y = roof; y < cH; y++) mat[c + sxz * y] = g.cliffE[c] <= 4 ? M.SROCK : M.SCLIFF;
  }
}

// gol ve dere: su seviyesindeki her acik kolon donar. Golde buz iki kat (WL-1, WL), derede dibine kadar.
function freezeLake(g) {
  const sx = g.sx, sz = g.sz;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    const H = g.H[c];
    if (H > WL) continue;
    const y0 = g.zone[c] === 1 ? H : Math.max(H, WL - 1);
    for (let y = y0; y <= WL; y++) g.set(x, y, z, M.ICE);
    g.iceY0[c] = y0;
  }
}

// su altinda kar olmaz: buzun altinda kalan karli kaya (ada yamaci, goldeki kayalar) duz kaya olur
function underwaterRock(g) {
  const mat = g.w.mat, sxz = g.w.sxz;
  for (let y = 2; y < WL - 1; y++) {
    const o = sxz * y;
    for (let i = 0; i < sxz; i++) if (mat[o + i] === M.SROCK) mat[o + i] = M.ROCK;
  }
}

function iceData(g) {
  const cols = [];
  for (let c = 0; c < g.sx * g.sz; c++) if (g.iceY0[c] >= 0 && !g.noFreeze[c]) cols.push(c);
  return { y: WL * VS, level: WL, top: ICE_TOP, cols: Int32Array.from(cols), y0: g.iceY0, noFreeze: g.noFreeze, hole: [(HOLE[0] + 0.5) * VS, (HOLE[1] + 0.5) * VS] };
}

// ---------------------------------------------------------------- kaya ve tas
function rockBlob(g, cx, cy, cz, rx, ry, rz, m = M.SROCK) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const e = dx * dx + dy * dy + dz * dz;
    if (e < 1 - 0.28 * hash3(x, y, z) && y >= 2) g.set(x, y, z, m);
  }
}

function scatterRocks(g) {
  const rng = g.rng;
  let placed = 0;
  for (let t = 0; t < 600 && placed < 26; t++) {
    const x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const c = (x | 0) + g.sx * (z | 0);
    const zone = g.zone[c];
    if (zone === 3 || zone === 1 || zone === 5 || zone === 6) continue;
    if (g.creekD[c] < 9 || lakeF(g, x, z) < 6) continue;
    const big = rng() < 0.35;
    const r = big ? 5 + rng() * 4 : 2.5 + rng() * 2.5;
    if (!g.free(x, z, r + 4)) continue;
    const gy = g.h(x, z);
    rockBlob(g, x, gy + r * 0.25, z, r * (1 + rng() * 0.5), r * (0.65 + rng() * 0.35), r * (0.8 + rng() * 0.4));
    if (big && rng() < 0.6) rockBlob(g, x + (rng() - 0.5) * r * 1.6, gy + r * 0.2, z + (rng() - 0.5) * r * 1.6, r * 0.6, r * 0.5, r * 0.6);
    g.block(x, z, r + 2);
    placed++;
  }
  // gol icinde, kale adasinin cevresinde buzdan cikan birkac kaya (siper)
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + 0.4 + rng() * 0.3;
    const d = 46 + rng() * 14;
    const x = C[0] + Math.cos(a) * d * 1.08, z = C[1] + Math.sin(a) * d;
    if (lakeF(g, x, z) > -8 || !g.free(x, z, 6)) continue;
    const r = 2.6 + rng() * 2;
    rockBlob(g, x, ICE_TOP + r * 0.1, z, r * 1.2, r * 0.85, r);
    for (let y = g.h(x, z); y < ICE_TOP; y++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) g.set(Math.floor(x) + dx, y, Math.floor(z) + dz, M.SROCK);
    g.block(x, z, r + 3);
  }
}

// ---------------------------------------------------------------- agaclar, kar
function disc(g, cx, y, cz, r, m, soft = false) {
  const ri = Math.ceil(r);
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const d = Math.hypot(dx + 0.5 - (cx - Math.floor(cx)), dz + 0.5 - (cz - Math.floor(cz)));
    if (d <= r) { const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz; if (soft) g.soft(x, y, z, m); else g.set(x, y, z, m); }
  }
}

function trunk(g, x, z, y0, y1, r0, r1, m = M.BARK) {
  for (let y = y0 - 2; y < y1; y++) {
    const t = Math.max(0, (y - y0) / Math.max(1, y1 - y0));
    disc(g, x, y, z, r0 + (r1 - r0) * t, m);
  }
}

function limb(g, ax, ay, az, bx, by, bz, r0, r1, m = M.BARK) {
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.ceil(L * 1.5);
  for (let k = 0; k <= n; k++) {
    const t = k / n, r = r0 + (r1 - r0) * t;
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy + dz * dz <= r * r + 0.3) g.soft(Math.floor(cx + dx), Math.floor(cy + dy), Math.floor(cz + dz), m);
    }
  }
}

// gurultulu kume (yalniz bos voxellere): kar yigini
function blob(g, cx, cy, cz, rx, ry, rz, m, clipY = 0) {
  for (let y = Math.max(clipY, Math.floor(cy - ry)); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const e = dx * dx + dy * dy + dz * dz;
    if (e > 1 - 0.3 * hash3((x >> 2) + 31, y >> 2, z >> 2)) continue;
    g.soft(x, y, z, m);
  }
}

// karli cam: katmanli koni; dallarin ustu karli (golgelendirici), ucunda kar topu. En alt dallar 2.25 m
// yukarida: altindan yurunur (botlar da), agaclar yan yana gelince gecit vermeyen duvar olmaz.
function pineTree(g, x, z, scale = 1) {
  const gy = g.h(x, z);
  const th = Math.round(28 + 16 * scale), r0 = 1.1 + 0.8 * scale;
  trunk(g, x, z, gy, gy + th, r0, 0.6);
  const R = 6 + 4 * scale;
  for (let y = gy + 9; y < gy + th + 3; y++) {
    const t = (y - gy - 9) / (th - 6);
    const band = 0.74 + 0.26 * Math.sin(y * 1.05 + x);
    const r = Math.max(0.6, R * (1 - t) * band);
    const ri = Math.ceil(r);
    for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > r || (d > r - 1.2 && hash3((x + dx) >> 1, y >> 1, (z + dz) >> 1) > 0.7)) continue;
      g.soft(x + dx, y, z + dz, M.SNOWPINE);
    }
  }
  g.soft(x, gy + th + 3, z, M.SNOW);
  g.block(x, z, 4);
}

function scatterTrees(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 1600 && n < 26; t++) {
    const x = 22 + rng() * (g.sx - 44), z = 22 + rng() * (g.sz - 44);
    const c = (x | 0) + g.sx * (z | 0);
    if ((g.zone[c] !== 0 && g.zone[c] !== 2) || g.creekD[c] < 9) continue;
    if (lakeF(g, x, z) < 12) continue;
    if (!g.free(x, z, 8)) continue;
    pineTree(g, x | 0, z | 0, 0.3 + rng() * 0.7);
    n++;
  }
}

function cliffTrees(g) {
  // ucurum tepesinde cam silueti
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 900 && n < 28; t++) {
    const side = Math.floor(rng() * 4);
    const along = 10 + rng() * (g.sx - 20);
    const depth = 3 + rng() * 9;
    const x = Math.floor(side === 0 || side === 1 ? along : side === 2 ? depth : g.sx - 1 - depth);
    const z = Math.floor(side === 2 || side === 3 ? along : side === 0 ? depth : g.sz - 1 - depth);
    const c = x + g.sx * z;
    if (g.zone[c] !== 5 || g.H[c] < 46 || g.creekD[c] < 10) continue;
    if (!g.free(x, z, 5)) continue;
    pineTree(g, x, z, 0.2 + rng() * 0.5);
    n++;
  }
}

// kar yiginlari (yumusak siper) ve ruzgarin yigdigi kar setleri
function snowMounds(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 900 && n < 24; t++) {
    const x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] === 3 || g.zone[c] === 1 || g.zone[c] === 5 || g.zone[c] === 6) continue;
    const r = 3 + rng() * 3;
    if (!g.free(x, z, r + 2) || g.h(x, z) < ICE_TOP + 1 || lakeF(g, x, z) < 4) continue;
    const gy = g.h(x, z);
    blob(g, x, gy, z, r * 1.5, r * 0.7, r * (0.9 + rng() * 0.4), M.SNOW, gy);
    g.block(x, z, r);
    n++;
  }
}

// devrik kutukler: ustleri karli
function logs(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 400 && n < 6; t++) {
    const x = 30 + rng() * (g.sx - 60), z = 30 + rng() * (g.sz - 60);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || g.creekD[c] < 12 || lakeF(g, x, z) < 10) continue;
    const a = rng() * Math.PI, L = 14 + rng() * 12, r = 1.6 + rng() * 0.9;
    const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
    if (!g.free(x, z, 3) || !g.free(ex, ez, 3) || !g.free((x + ex) / 2, (z + ez) / 2, L / 2)) continue;
    const gy = Math.min(g.h(x, z), g.h(ex, ez));
    limb(g, x, gy + r - 0.3, z, ex, gy + r - 0.3, ez, r, r * 0.9);
    // ust yuzune kar
    const x0 = Math.floor(Math.min(x, ex) - r - 1), x1 = Math.ceil(Math.max(x, ex) + r + 1);
    const z0 = Math.floor(Math.min(z, ez) - r - 1), z1 = Math.ceil(Math.max(z, ez) + r + 1);
    for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      for (let y = gy + Math.ceil(r * 2) + 1; y >= gy; y--) {
        if (g.get(xx, y, zz) === M.BARK) { if (!g.get(xx, y + 1, zz)) g.set(xx, y + 1, zz, M.SNOW); break; }
      }
    }
    g.block((x + ex) / 2, (z + ez) / 2, L / 2);
    n++;
  }
}

// ---------------------------------------------------------------- sarkitlar
// (x, y, z): sacak altindaki ilk bos voxel; asagi dogru en cok len voxel. Altinda en az clear voxel bosluk
// kalir (yurunen yerde kafaya degmesin): bosluk cevredeki (around: 2 -> 5x5) en yuksek zeminden olculur,
// govde kutusu sarkitin yanindaki daha yuksek basamakta da (sarmal merdiven) carpmasin; duvar disindaki
// sacaklarda (kulube, avci kulubesi) yalniz kendi kolonu (around 0). Uzunlarin ust kismi 2x2 kalin.
// Dondurur: konuldu mu.
function icicle(g, x, y, z, len, clear = 9, around = 2) {
  if (g.get(x, y, z) || !g.get(x, y + 1, z)) return false;
  let free = 48;
  for (let dz = -around; dz <= around; dz++) for (let dx = -around; dx <= around; dx++) {
    if (g.get(x + dx, y, z + dz)) continue;   // duvar: altinda durulmaz
    let f = 0;
    while (f < 48 && y - f >= 1 && !g.get(x + dx, y - f, z + dz)) f++;
    free = Math.min(free, f);
  }
  const L = Math.min(len, free - clear);
  if (L < 2) return false;
  const thick = L >= 5 ? Math.ceil(L * 0.4) : 0;
  for (let k = 0; k < L; k++) {
    const yy = y - k;
    g.set(x, yy, z, M.ICICLE);
    if (k < thick) for (const [dx, dz] of [[1, 0], [0, 1], [1, 1]]) if (!g.get(x + dx, yy, z + dz) && (k > 0 || g.get(x + dx, yy + 1, z + dz))) g.set(x + dx, yy, z + dz, M.ICICLE);
  }
  return true;
}

// (cx, cz) cevresinde r yaricapli halka boyunca, yTop'tan asagi sarkitlar
function icicleRing(g, cx, cz, r, yTop, count, minLen, maxLen, clear = 9) {
  const rng = g.rng;
  let n = 0;
  for (let k = 0; k < count; k++) {
    const a = (k + rng() * 0.6) / count * Math.PI * 2;
    const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
    if (icicle(g, x, yTop, z, minLen + Math.floor(rng() * (maxLen - minLen + 1)), clear)) n++;
  }
  return n;
}

// ---------------------------------------------------------------- kale
// merkezde yuvarlak buz tugla kule; tepede gozetleme yeri (16 m): kuleyi saran sarmal merdiven ve kiyidaki pedlerle
function keep(g, out) {
  const [x, z] = C;
  const cx = x + 0.5, cz = z + 0.5;
  const gy = PLAT;
  for (let y = gy - 4; y < NEST - 2; y++) {
    const r = KEEP_R + (y < gy + 3 ? (gy + 3 - y) * 0.5 : 0);
    disc(g, cx, y, cz, r, M.ICE_BRICK);
  }
  // kulede ince pencere yariklari (dekor; ici dolu)
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.26;
    const wx = Math.floor(cx + Math.cos(a) * (KEEP_R - 0.4)), wz = Math.floor(cz + Math.sin(a) * (KEEP_R - 0.4));
    for (let y = NEST - 18; y < NEST - 12; y++) g.set(wx, y, wz, M.ICICLE);
  }
  // gozetleme yeri (halka platform) + kuleyi saran tek turluk sarmal merdiven: avludan dogrudan tepeye
  // (merdivenin son kismi platformda acilan agizdan cikar)
  for (let y = NEST - 2; y < NEST; y++) disc(g, cx, y, cz, 11, M.ICE_BRICK);
  spiral(g, x, z, gy, NEST, 8, 13, M.ICE_BRICK);
  // mazgalli korkuluk: merdiven agzinda ve ped inis yonleri olan caprazlarda acik
  for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
    const d = Math.hypot(dx + 0.5, dz + 0.5);
    if (d < 10.2 || d > 11.2) continue;
    if (g.get(x + dx, NEST - 1, z + dz) !== M.ICE_BRICK) continue;
    const a = Math.atan2(dz + 0.5, dx + 0.5);
    const off = Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
    if (Math.PI / 4 - off < 0.24) continue;   // caprazlarda bosluk
    const seg = Math.floor((a + Math.PI) * 11 / 2.5);
    g.set(x + dx, NEST, z + dz, M.ICE_BRICK);
    if (seg % 2 === 0) { g.set(x + dx, NEST + 1, z + dz, M.ICE_BRICK); g.set(x + dx, NEST + 2, z + dz, M.ICE_BRICK); }
  }
  // tepe kaidesi + isaret atesi
  for (let y = NEST; y < NEST + 3; y++) disc(g, cx, y, cz, 1.8, M.ICE_BRICK);
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) g.set(x + dx, NEST + 3, z + dz, M.FIRE);
  out.lights.push({ x: x * VS, y: (NEST + 4.5) * VS, z: z * VS, color: 0xff9a4a, intensity: 10, distance: 15, voxR: 2 });
  // sarkitlar: gozetleme yerinin kenarindan (merdivenin ustunde kalanlar bas boslugu kadar kisalir)
  icicleRing(g, cx, cz, 10.6, NEST - 3, 26, 3, 8);
  g.block(x, z, 36);
}

function spiral(g, cx, cz, gy, topY, r0, r1, m) {
  const rise = topY - gy;
  const R = r1 + 2;   // balkon boslugu basamaklardan 2 voxel genis (dis kenarda yururken bas carpmasin)
  for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) {
    const r = Math.hypot(dx + 0.5, dz + 0.5);
    if (r < r0 || r >= R) continue;
    const a = Math.atan2(dz + 0.5, dx + 0.5);
    const t = (a + Math.PI) / (Math.PI * 2);
    const hh = Math.min(rise, Math.floor(t * rise) + 1);
    const x = cx + dx, z = cz + dz, top = gy + hh;
    if (r < r1) for (let y = Math.max(gy - 1, top - 2); y < top; y++) g.soft(x, y, z, m);
    // merdivenin ust kismi balkonun altinda kaliyorsa balkonda bosluk ac
    if (top > topY - 12 && top < topY) for (let y = Math.max(top, topY - 2); y < topY; y++) if (g.get(x, y, z) === m && r >= r0) g.set(x, y, z, 0);
  }
}

// adanin kenarinda alcak mazgalli sur (dort ana yonde kapi) + dort kose burcu
function curtainWall(g, out) {
  const [x, z] = C;
  const cx = x + 0.5, cz = z + 0.5;
  for (let dz = -WALL_R1 - 1; dz <= WALL_R1 + 1; dz++) for (let dx = -WALL_R1 - 1; dx <= WALL_R1 + 1; dx++) {
    const r = Math.hypot(dx + 0.5, dz + 0.5);
    if (r < WALL_R0 || r >= WALL_R1) continue;
    if (Math.abs(dx + 0.5) < 4.5 || Math.abs(dz + 0.5) < 4.5) continue;   // kapilar
    const X = x + dx, Z = z + dz;
    for (let y = g.h(X, Z) - 3; y < WALL_TOP; y++) g.set(X, y, Z, M.ICE_BRICK);
    const a = Math.atan2(dz + 0.5, dx + 0.5);
    const seg = Math.floor((a + Math.PI) * WALL_R1 / 3.5);
    if (r >= WALL_R1 - 2 && seg % 2 === 0) for (let y = WALL_TOP; y < WALL_TOP + 2; y++) g.set(X, y, Z, M.ICE_BRICK);
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    turret(g, out, cx + Math.cos(a) * TURRET_D, cz + Math.sin(a) * TURRET_D);
  }
  // guney kapinin onunde fener direkleri (kopru basi)
  const lz = z + WALL_R1 + 2;
  for (const lx of [x - 6, x + 5]) {
    for (let y = g.h(lx, lz) - 1; y < PLAT + 8; y++) g.set(lx, y, lz, M.BARK);
    g.set(lx, PLAT + 8, lz, M.LAMP);
  }
  out.lights.push({ x: x * VS, y: (PLAT + 8.5) * VS, z: (lz + 0.5) * VS, color: 0xffc27a, intensity: 3.6, distance: 10, voxR: 4 });
}

function turret(g, out, cx, cz) {
  const R = TURRET_R;
  const X0 = Math.floor(cx), Z0 = Math.floor(cz);
  let gy = 1e9;
  for (const [dx, dz] of [[-R, 0], [R, 0], [0, -R], [0, R], [0, 0]]) gy = Math.min(gy, g.h(cx + dx, cz + dz));
  for (let y = gy - 3; y < TURRET_TOP; y++) disc(g, cx, y, cz, R, M.ICE_BRICK);
  // ust kisimda disari tasan sacak halkasi (sarkitlar buradan sarkar)
  for (let y = TURRET_TOP - 3; y < TURRET_TOP; y++) disc(g, cx, y, cz, R + 1.3, M.ICE_BRICK);
  const ri = Math.ceil(R + 2);
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const d = Math.hypot(X0 + dx + 0.5 - cx, Z0 + dz + 0.5 - cz);
    if (d < R + 0.2 || d > R + 1.3) continue;
    const a = Math.atan2(Z0 + dz + 0.5 - cz, X0 + dx + 0.5 - cx);
    const seg = Math.floor((a + Math.PI) * (R + 1) / 2.5);
    const hgt = seg % 2 === 0 ? 4 : 2;
    for (let y = TURRET_TOP; y < TURRET_TOP + hgt; y++) g.set(X0 + dx, y, Z0 + dz, M.ICE_BRICK);
  }
  // mangal: kisa demir ayak + ates
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    g.set(X0 + dx, TURRET_TOP, Z0 + dz, M.RUST);
    g.set(X0 + dx, TURRET_TOP + 1, Z0 + dz, M.FIRE);
  }
  out.lights.push({ x: X0 * VS, y: (TURRET_TOP + 2.5) * VS, z: Z0 * VS, color: 0xff8a3a, intensity: 4.2, distance: 11, voxR: 2 });
  icicleRing(g, cx, cz, R + 0.8, TURRET_TOP - 4, 16, 3, 8);
}

// ---------------------------------------------------------------- kiyi yapilari
// zemini duzle: ust iki kat kar, alti toprak
function flattenSnow(g, x0, z0, x1, z1, y) {
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    for (let yy = y; yy < y + 20; yy++) { const m = g.get(x, yy, z); if (m !== M.SCLIFF) g.set(x, yy, z, 0); }
    for (let yy = 2; yy < y; yy++) if (g.get(x, yy, z) === 0) g.set(x, yy, z, M.DIRT);
    g.set(x, y - 1, z, M.SNOW); g.set(x, y - 2, z, M.SNOW);
    g.H[x + g.sx * z] = y;
  }
}

// kutuk ev: kutuk duvarlar, kapi (guneye, gole bakar), pencereler, karli besik cati, sacakta sarkitlar,
// tugla baca (duman fx/ice.js), kapi ustunde fener
function cabin(g, out, x, z) {
  const w = 18, d = 13, H = 12;
  const x0 = x - (w >> 1), z0 = z - (d >> 1), x1 = x0 + w, z1 = z0 + d;
  let gy = 0;
  for (let zz = z0; zz < z1; zz++) for (let xx = x0; xx < x1; xx++) gy = Math.max(gy, g.h(xx, zz));
  flattenSnow(g, x0 - 3, z0 - 3, x1 + 3, z1 + 6, gy);
  for (let y = gy; y < gy + H; y++) for (let zz = z0; zz < z1; zz++) for (let xx = x0; xx < x1; xx++) {
    const edge = xx === x0 || xx === x1 - 1 || zz === z0 || zz === z1 - 1;
    if (!edge) continue;
    const corner = (xx === x0 || xx === x1 - 1) && (zz === z0 || zz === z1 - 1);
    g.set(xx, y, zz, corner ? M.WOOD : ((y - gy) % 2 ? M.WOOD : M.BARK));
  }
  g.box(x0 + 1, gy - 1, z0 + 1, x1 - 1, gy, z1 - 1, M.WOOD);
  const cxm = (x0 + x1) >> 1;
  g.box(cxm - 2, gy, z1 - 1, cxm + 2, gy + 9, z1, 0);   // kapi
  for (const [a, b] of [[x0 + 3, x0 + 6], [x1 - 6, x1 - 3]]) g.box(a, gy + 4, z0, b, gy + 8, z0 + 1, 0);
  for (const [a, b] of [[z0 + 4, z0 + 8]]) { g.box(x0, gy + 4, a, x0 + 1, gy + 8, b, 0); g.box(x1 - 1, gy + 4, a, x1, gy + 8, b, 0); }
  // besik cati: sirt x boyunca; her basamagin ustu kar, 2 voxel sacak; alinlik duvarlari kutuk
  const ov = 2;
  for (let k = 0; ; k++) {
    const za = z0 - ov + k, zb = z1 - 1 + ov - k;
    if (za > zb) break;
    const y = gy + H + k;
    for (let xx = x0 - ov; xx < x1 + ov; xx++) {
      for (const zz of za === zb ? [za] : [za, zb]) { g.set(xx, y, zz, M.WOOD); g.set(xx, y + 1, zz, M.SNOW); }
      if (xx === x0 || xx === x1 - 1) for (let zz = za + 1; zz < zb; zz++) g.set(xx, y, zz, M.BARK);
    }
  }
  // baca
  const bx = x1 - 4, bz = z0 + 3;
  const btop = gy + H + (d >> 1) + 5;
  for (let y = gy; y < btop; y++) { g.set(bx, y, bz, M.BRICK); g.set(bx + 1, y, bz, M.BRICK); g.set(bx, y, bz + 1, M.BRICK); g.set(bx + 1, y, bz + 1, M.BRICK); }
  out.chimneys.push([(bx + 1) * VS, btop * VS, (bz + 1) * VS]);
  // sacak sarkitlari (on ve arka saçak)
  for (let xx = x0 - ov + 1; xx < x1 + ov - 1; xx += 2) {
    if (g.rng() < 0.35) continue;
    for (const zz of [z0 - ov, z1 - 1 + ov]) icicle(g, xx, gy + H - 1, zz, 2 + Math.floor(g.rng() * 3), 8, 0);
  }
  // kapi ustunde fener
  g.set(cxm, gy + 10, z1, M.LAMP);
  g.set(cxm, gy + 11, z1, M.WOOD);
  out.lights.push({ x: (cxm + 0.5) * VS, y: (gy + 9.5) * VS, z: (z1 + 0.5) * VS, color: 0xffc27a, intensity: 3.4, distance: 10, voxR: 1 });
  g.cabins.push({ x: cxm, z: (z0 + z1) >> 1, gy });
  g.block(x, z, Math.max(w, d) * 0.7 + 4);
}

function hunterStand(g, out, x, z, deckY) {
  // kazikli avci kulubesi: dort kazik, platform, alcak duvar, karli cati + sarkitlar, merdiven, fener
  const gy = g.h(x, z);
  const hw = 8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (hw - 1), pz = z + sz * (hw - 1);
    for (let y = g.h(px, pz) - 1; y < deckY + 9; y++) { g.set(px, y, pz, M.BARK); g.set(px + 1, y, pz, M.BARK); g.set(px, y, pz + 1, M.BARK); g.set(px + 1, y, pz + 1, M.BARK); }
  }
  g.box(x - hw, deckY - 2, z - hw, x + hw + 1, deckY, z + hw + 1, M.WOOD);
  for (const [ax, az, bx, bz] of [[x - hw, z - hw, x + hw + 1, z - hw + 1], [x - hw, z + hw, x + hw + 1, z + hw + 1], [x - hw, z - hw, x - hw + 1, z + hw + 1], [x + hw, z - hw, x + hw + 1, z + hw + 1]]) g.box(ax, deckY, az, bx, deckY + 4, bz, M.WOOD);
  g.box(x - hw - 1, deckY + 9, z - hw - 1, x + hw + 2, deckY + 10, z + hw + 2, M.WOOD);
  g.box(x - hw - 1, deckY + 10, z - hw - 1, x + hw + 2, deckY + 11, z + hw + 2, M.SNOW);
  g.box(x - 2, deckY, z + hw, x + 3, deckY + 4, z + hw + 1, 0);   // giris
  const rise = deckY - gy;
  for (let s = 0; s < rise; s++) {
    const zz = z + hw + 1 + (rise - 1 - s) * 2;
    g.box(x - 2, gy + s - 1, zz, x + 3, gy + s + 1, zz + 2, M.WOOD);
  }
  // cati kenarindan sarkitlar (guverte disina sarkar)
  for (let k = -hw; k <= hw + 1; k += 2) {
    for (const [ix, iz] of [[x + k, z - hw - 1], [x + k, z + hw + 1], [x - hw - 1, z + k], [x + hw + 1, z + k]]) {
      if (g.rng() < 0.4) continue;
      icicle(g, ix, deckY + 8, iz, 2 + Math.floor(g.rng() * 5), 9, 0);
    }
  }
  g.set(x, deckY + 8, z, M.LAMP);
  out.lights.push({ x: (x + 0.5) * VS, y: (deckY + 7.5) * VS, z: (z + 0.5) * VS, color: 0xffc27a, intensity: 2.8, distance: 8.5, voxR: 1 });
  g.block(x, z, hw + 4);
  g.stand = { x, z, deckY, hw };
}

// adanin guney kapisindan guney kiyisina tahta kopru: kapidan 1 m'lik basamaklarla inen rampa (basamaklar
// gezinme agi hucrelerine denk: botlar adaya yurur), sonra buzun 0.75 m ustunde duz yol; kaziklar gol
// dibine iner. Kar kupecikleri korkuluk ustunde ve yolun dogu yarisinda (botlarin yurudugu bati yari temiz).
function footbridge(g, out) {
  const x = C[0];
  const y = ICE_TOP + 3;
  const zs = C[1] + WALL_R1 + 1;
  let za = zs;
  while (za < g.sz - 40 && g.h(x, za) > y - 1) za++;
  let zb = Math.max(za, zs + (PLAT - y) * 4) + 6;
  while (zb < g.sz - 30 && g.h(x, zb) < y - 1) zb++;
  for (let z = zs; z <= zb + 2; z++) {
    const yy0 = Math.max(y, PLAT - ((z >> 2) - (zs >> 2)));
    g.box(x - 3, yy0 - 2, z, x + 3, yy0, z + 1, M.WOOD);
    for (let yy = yy0; yy < yy0 + 9; yy++) for (let xx = x - 4; xx < x + 4; xx++) { const m = g.get(xx, yy, z); if (m === M.SNOW || m === M.SROCK) g.set(xx, yy, z, 0); }
    if ((z - zs) % 6 === 0) for (const px of [x - 4, x + 3]) for (let yy = Math.min(g.h(px, z), yy0) - 1; yy < yy0 + 4; yy++) g.set(px, yy, z, M.BARK);
    g.set(x - 4, yy0 + 3, z, M.WOOD); g.set(x + 3, yy0 + 3, z, M.WOOD);
    for (const px of [x - 4, x + 3]) if (g.rng() < 0.75) g.set(px, yy0 + 4, z, M.SNOW);
    if (z > za && g.rng() < 0.3) g.set(x + Math.floor(g.rng() * 3), yy0, z, M.SNOW);
  }
  g.bridge = { x, zs, za, zb, y };
  g.block(x, (zs + zb) / 2, (zb - zs) / 2 + 4);
}

// guney kiyisindan buza uzanan iskele; ucunda buzda balik deligi (yeniden donmaz), tabure, kova, olta, fener
function pier(g, out) {
  const [hx, hz] = HOLE;
  const zEnd = hz + 3;
  const y = ICE_TOP + 2;
  let zb = zEnd;
  while (zb < g.sz - 30 && g.h(hx, zb) < y - 1) zb++;
  for (let z = zEnd; z <= zb + 1; z++) {
    g.box(hx - 3, y - 2, z, hx + 3, y, z + 1, M.WOOD);
    for (let yy = y; yy < y + 8; yy++) for (let xx = hx - 3; xx < hx + 3; xx++) if (g.get(xx, yy, z) === M.SNOW) g.set(xx, yy, z, 0);
    if ((z - zEnd) % 6 === 0) for (const px of [hx - 3, hx + 2]) for (let yy = g.h(px, z) - 1; yy < y; yy++) g.set(px, yy, z, M.BARK);
  }
  // balik deligi: 4x4 acik su
  for (let z = hz - 2; z < hz + 2; z++) for (let x = hx - 2; x < hx + 2; x++) {
    for (let yy = WL - 1; yy <= WL + 1; yy++) g.set(x, yy, z, 0);
    g.noFreeze[x + g.sx * z] = 1;
  }
  // tabure, kova, olta (delige uzanan egik dal)
  g.set(hx - 2, y, zEnd + 1, M.WOOD); g.set(hx - 2, y + 1, zEnd + 1, M.WOOD);
  g.box(hx + 1, y, zEnd + 1, hx + 3, y + 2, zEnd + 3, M.RUST);
  g.set(hx + 1, y + 1, zEnd + 1, 0);
  limb(g, hx - 1, y + 2, zEnd + 1, hx - 0.5, y + 6, hz - 1, 0.45, 0.4, M.BARK);
  // fener direk
  const lx = hx + 2, lz = zEnd + 5;
  for (let yy = y; yy < y + 7; yy++) g.set(lx, yy, lz, M.BARK);
  g.set(lx, y + 7, lz, M.LAMP);
  out.lights.push({ x: (lx + 0.5) * VS, y: (y + 7.5) * VS, z: (lz + 0.5) * VS, color: 0xffc27a, intensity: 3, distance: 9, voxR: 1 });
  g.pierEnd = [hx, zEnd];
  g.block(hx, (zEnd + zb) / 2, (zb - zEnd) / 2 + 4);
}

// donmus derenin cikti magaranin agzinda sarkit perdesi
function caveIcicles(g) {
  const pts = g.creekPts;
  let n = 0;
  for (let k = 0; k < pts.length && n < 14; k++) {
    const [px, pz] = pts[k];
    const c = Math.floor(px) + g.sx * Math.floor(pz);
    if (!g.cliffE || g.cliffE[c] < 0) continue;
    for (let dz = -5; dz <= 5; dz += 2) for (let dx = -2; dx <= 2; dx += 2) {
      const x = Math.floor(px) + dx, z = Math.floor(pz) + dz;
      for (let y = 40; y > ICE_TOP; y--) {
        if (!g.get(x, y, z) && g.get(x, y + 1, z)) { if (icicle(g, x, y, z, 3 + Math.floor(g.rng() * 5), 9)) n++; break; }
      }
    }
  }
}

// kardan adam: uc kar topu, kirmizi atki, havuc burun, komur gozler/dugmeler, sapka, dal kollar.
// item verilirse orta topun icinde saklidir (items.js: kar kirilip yeri bosalinca gorunur).
function snowman(g, out, x, z, item) {
  const gy = g.h(x, z);
  const face = Math.atan2(C[1] - z, C[0] - x);
  const fx = Math.cos(face), fz = Math.sin(face);
  const cx = x + 0.5, cz = z + 0.5;
  const ball = (cy, r) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let dz = -Math.ceil(r); dz <= r; dz++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
      if (Math.hypot(dx + 0.5 - 0.5, y + 0.5 - cy, dz + 0.5 - 0.5) <= r) g.set(x + dx, y, z + dz, M.SNOW);
    }
  };
  const r1 = 3.4, r2 = 2.6, r3 = 1.9;
  const y1 = gy + r1 - 0.7, y2 = y1 + r1 + r2 - 1.4, y3 = y2 + r2 + r3 - 0.9;
  ball(y1, r1); ball(y2, r2); ball(y3, r3);
  // atki
  const ny = Math.floor(y2 + r2 - 0.6);
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; g.set(Math.floor(cx + Math.cos(a) * 2.1), ny, Math.floor(cz + Math.sin(a) * 2.1), M.CONCRETE_RED); }
  for (let y = ny - 3; y < ny; y++) g.set(Math.floor(cx + fx * 1.6 + fz * 1.2), y, Math.floor(cz + fz * 1.6 - fx * 1.2), M.CONCRETE_RED);
  // burun, gozler, dugmeler
  for (let k = 0; k < 4; k++) g.set(Math.floor(cx + fx * (r3 - 0.3 + k * 0.8)), Math.floor(y3), Math.floor(cz + fz * (r3 - 0.3 + k * 0.8)), M.CARROT);
  for (const s of [-0.5, 0.5]) g.set(Math.floor(cx + Math.cos(face + s) * (r3 - 0.2)), Math.floor(y3 + 0.9), Math.floor(cz + Math.sin(face + s) * (r3 - 0.2)), M.OBSIDIAN);
  for (const dy of [-1, 0.2, 1.4]) g.set(Math.floor(cx + fx * (r2 - 0.2)), Math.floor(y2 + dy), Math.floor(cz + fz * (r2 - 0.2)), M.OBSIDIAN);
  // sapka
  const hy = Math.floor(y3 + r3 - 0.4);
  disc(g, cx, hy, cz, 2.3, M.OBSIDIAN);
  for (let y = hy + 1; y < hy + 4; y++) disc(g, cx, y, cz, 1.5, M.OBSIDIAN);
  // dal kollar
  for (const s of [-1, 1]) {
    const ax = cx + fz * s * (r2 - 0.4), az = cz - fx * s * (r2 - 0.4);
    limb(g, ax, y2 + 0.5, az, ax + fz * s * 4, y2 + 3.5, az - fx * s * 4, 0.45, 0.4, M.BARK);
  }
  if (item) out.items.push({ type: item, x: cx * VS, y: Math.floor(y2 - 1) * VS, z: cz * VS, cache: true });
  g.block(x, z, 6);
}

// ---------------------------------------------------------------- pedler
function flatten(g, x0, z0, x1, z1, y) {
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    for (let yy = y; yy < y + 14; yy++) { const m = g.get(x, yy, z); if (m !== M.BARK && m !== M.SCLIFF) g.set(x, yy, z, 0); }
    for (let yy = 2; yy < y; yy++) if (g.get(x, yy, z) === 0) g.set(x, yy, z, M.DIRT);
    g.set(x, y - 1, z, M.SNOW);
    g.H[x + g.sx * z] = y;
  }
}

function padAt(g, out, px, pz, tx, ty, tz, apex = 3.5) {
  px = Math.round(px); pz = Math.round(pz);
  const y = Math.max(g.h(px, pz), ICE_TOP + 2);
  flatten(g, px - 6, pz - 6, px + 6, pz + 6, y);
  g.box(px - 4, y - 1, pz - 4, px + 4, y, pz + 4, M.PAD);
  for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
    if (x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4) continue;
    g.set(x, y, z, M.SROCK);
  }
  out.pads.push({ x: px * VS, y: y * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
  g.block(px, pz, 8);
}

// kiyinin dort capraz noktasindan kulenin tepesine (gozetleme yeri); ucus yolu boyunca alan ayrilir
function planPads(g) {
  const [x, z] = C;
  const plan = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    plan.push([x + Math.cos(a) * 92, z + Math.sin(a) * 92, x + Math.cos(a) * 7, NEST, z + Math.sin(a) * 7, 4]);
  }
  for (const [px, pz, tx, , tz] of plan) {
    const L = Math.hypot(tx - px, tz - pz);
    for (let d = 0; d <= L; d += 3) g.block(px + (tx - px) * d / L, pz + (tz - pz) * d / L, 7);
  }
  return plan;
}

// ped yorungeleri cam igneleri, sarkitlar ve kulenin tepe korkulugunun icinden gecerken koridor ac
function carvePadPaths(g, out) {
  const G = 22;
  for (const p of out.pads) {
    const apexY = Math.max(p.y, p.ty) + p.apex;
    const vy = Math.sqrt(2 * G * (apexY - p.y));
    const T = vy / G + Math.sqrt(2 * Math.max(0.01, apexY - p.ty) / G);
    const vx = (p.tx - p.x) / T, vz = (p.tz - p.z) / T;
    for (let t = 0; t < T; t += 0.01) {
      const wx = (p.x + vx * t) / VS, wy = (p.y + 0.9 + vy * t - 0.5 * G * t * t) / VS, wz = (p.z + vz * t) / VS;
      const R = 5;
      for (let dy = -R; dy <= R + 3; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + (dy * 0.7) * (dy * 0.7) + dz * dz > R * R) continue;
        const X = Math.floor(wx + dx), Y = Math.floor(wy + dy), Z = Math.floor(wz + dz);
        const m = g.get(X, Y, Z);
        if (m === M.SNOWPINE || m === M.ICICLE) g.set(X, Y, Z, 0);
        else if (m === M.ICE_BRICK && Y >= NEST) { const r = Math.hypot(X + 0.5 - C[0] - 0.5, Z + 0.5 - C[1] - 0.5); if (r > 3) g.set(X, Y, Z, 0); }
      }
    }
  }
}

// ---------------------------------------------------------------- ogeler, dogma noktalari
const P = (g, x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });
const ring = (r, a) => [Math.round(C[0] + Math.cos(a) * r), Math.round(C[1] + Math.sin(a) * r)];

function placeItems(g, out) {
  const [ox, oz] = C;
  out.items.push({ type: 'quad', ...P(g, ox + 5, NEST, oz + 5) });
  // MEGA: buzdaki balik deliginin altinda, gol dibinde (dalmak gerekir; botlar suya girmez)
  out.items.push({ type: 'mega', ...P(g, HOLE[0], g.h(HOLE[0], HOLE[1]), HOLE[1]), noBots: true });
  for (const [a, type] of [[Math.PI / 2, 'health'], [Math.PI, 'ammo'], [0, 'ammo'], [-Math.PI / 2, 'armor']]) {
    const [x, z] = ring(19.5, a);
    out.items.push({ type, ...P(g, x, PLAT, z) });
  }
  if (g.stand) out.items.push({ type: 'armor', ...P(g, g.stand.x, g.stand.deckY, g.stand.z) });
  if (g.pierEnd) out.items.push({ type: 'health', ...P(g, g.pierEnd[0], ICE_TOP + 2, g.pierEnd[1] + 3) });
  for (const cab of g.cabins) out.items.push({ type: 'health', ...P(g, cab.x + 4, cab.gy, cab.z) });
  const ground = [[64, 58, 'ammo'], [226, 244, 'health'], [30, 214, 'ammo'], [258, 150, 'health'], [160, 254, 'ammo']];
  for (const [x, z, type] of ground) {
    const p = findGround(g, x, z, 10);
    if (p) out.items.push({ type, ...P(g, p[0], p[1], p[2]) });
  }
}

// (x,z) cevresinde kuru, duz ve bos zemin bul
function findGround(g, x, z, R = 8) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    if (X < 6 || Z < 6 || X >= g.sx - 6 || Z >= g.sz - 6) continue;
    const y = g.h(X, Z);
    if (g.zone[X + g.sx * Z] === 5) continue;   // ucurum sekisi degil
    if (y <= ICE_TOP || g.get(X, y - 1, Z) === 0 || g.get(X, y - 1, Z) === M.ICE) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (g.get(X + xx, y + k, Z + zz) !== 0) ok = false;
    for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (Math.abs(g.h(X + xx, Z + zz) - y) > 1) ok = false;
    if (ok) return [X, y, Z];
  }
  return null;
}

function placeSpawns(g, out) {
  const [ox, oz] = C;
  const yawTo = (x, z) => Math.atan2(-(ox - x), -(oz - z));
  const add = (x, y, z) => out.spawns.push({ ...P(g, x, y, z), yaw: yawTo(x, z) });
  // avlu (kapilardan, burclardan ve kardan adamdan uzak), avci kulubesi, kutuk evlerin ici
  for (const a of [0.39, 2.75, -2.75, 1.96]) { const [x, z] = ring(19.5, a); add(x, PLAT, z); }
  if (g.stand) add(g.stand.x - 4, g.stand.deckY, g.stand.z - 4);
  for (const cab of g.cabins) add(cab.x - 4, cab.gy, cab.z);
  // zemin: kiyiya yayilmis adaylar, birbirinden uzak secilir
  const cands = [];
  for (let z = 26; z < g.sz - 26; z += 9) for (let x = 26; x < g.sx - 26; x += 9) {
    const c = x + g.sx * z;
    if (g.zone[c] !== 0 && g.zone[c] !== 4 && g.zone[c] !== 2) continue;
    if (lakeF(g, x, z) < 6) continue;
    if (out.pads.some((p) => Math.hypot(p.x / VS - x, p.z / VS - z) < 10)) continue;
    const p = findGround(g, x, z, 3);
    if (p) cands.push(p);
  }
  const chosen = [];
  for (let n = 0; n < 12 && cands.length; n++) {
    let bi = 0, bs = -1;
    for (let i = 0; i < cands.length; i++) {
      let d = 1e9;
      for (const s of out.spawns) d = Math.min(d, Math.hypot(s.x / VS - cands[i][0], s.z / VS - cands[i][2]));
      for (const s of chosen) d = Math.min(d, Math.hypot(s[0] - cands[i][0], s[2] - cands[i][2]));
      if (d > bs) { bs = d; bi = i; }
    }
    const p = cands.splice(bi, 1)[0];
    chosen.push(p);
    add(p[0], p[1], p[2]);
  }
}

// zemin yukseklik haritasi (m): water.js patlamalari dipte kirpar, sig suda dalgalar kuculur
function depthMap(g) {
  const cell = 2, W = g.sx / cell, Hh = g.sz / cell;
  const data = new Float32Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) data[j * W + i] = g.h(i * cell + 1, j * cell + 1) * VS;
  return { data, width: W, height: Hh, rect: [0, 0, g.sx * VS, g.sz * VS] };
}
