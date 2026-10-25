// Cayir haritasi: inisli cikisli cimen, kayalik ucurum cevresi, ucurumdan cikip gole akan dere,
// kucuk gol, agaclar, agac evleri (koprulerle bagli), ziplama pedleri. Neredeyse her sey yikilir;
// yalniz ucurumun cekirdegi (CLIFF) ve ana kaya kalici.
// Su: seviyenin (MEADOW_WATER_Y) altindaki her bos voxel sudur (gol, dere ve o derinlige inen her
// krater). Gorsel su (water.js) ve oyun kurallari ayni tanimi kullanir.
// Tum yerlesim voxel biriminde; donen konumlar metre.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';
import { mulberry32 } from './mapgen.js';

export const MEADOW_WATER_Y = 18;   // voxel (4.5 m): bu yukseklikten asagisi su
const WL = MEADOW_WATER_Y;
const SUBSOIL = 19;                 // yuksek zeminde bunun altindaki toprak kaya (roket su tabakasina inmesin)

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
    this.H = new Int16Array(this.sx * this.sz);     // ilk bos voxel (zemin yuzeyi)
    this.zone = new Uint8Array(this.sx * this.sz);  // 0 cayir, 1 dere yatagi, 2 dere kiyisi, 3 gol, 4 kiyi, 5 ucurum
    this.creekD = new Float32Array(this.sx * this.sz).fill(1e9);
    this.creekT = new Float32Array(this.sx * this.sz * 2);
    this.lakeIn = new Float32Array(this.sx * this.sz);   // gol icinde kiyiya uzaklik (voxel), disarida 0
    this.blocked = [];                                    // agac/yapi icin dolu daireler [x, z, r]
  }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[this.idx(x, y, z)] = m; }
  // yalniz bos (ya da yaprak) voxele yaz: agaclar yapilari ezmesin
  soft(x, y, z, m) {
    if (!this.in(x, y, z)) return;
    const i = this.idx(x, y, z), c = this.w.mat[i];
    if (c === 0 || (c === M.LEAVES && m !== M.LEAVES)) this.w.mat[i] = m;
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
  // kolonun gercek yuzeyi (yapilar dahil degil, yalniz arazi)
  ground(x, z) { return this.h(x, z); }
  free(x, z, r) { for (const [bx, bz, br] of this.blocked) if (Math.hypot(bx - x, bz - z) < br + r) return false; return true; }
  block(x, z, r) { this.blocked.push([x, z, r]); }
}

// ---------------------------------------------------------------- yerlesim (voxel)
const OAK = [144, 144];              // buyuk mese
const TH_N = [144, 50];              // gozcu evi
const TH_W = [50, 144];              // dere evi
const TH_E = [212, 140];             // gol evi
const STAND = [62, 228];             // avci kulubesi (kazikli)
const DECK_OAK = 46, DECK_N = 48, DECK_W = 45, DECK_E = 45, DECK_STAND = 38;
const NEST = 74;                     // buyuk mesenin tepesindeki gozetleme yeri
const CREEK = [[13, 68], [34, 73], [60, 88], [80, 112], [86, 140], [90, 168], [112, 196], [140, 212], [168, 214], [186, 214]];
const LAKE = [[206, 204, 38, 30], [180, 218, 22, 18], [228, 192, 20, 18]];

export function generateMeadow(world, seed = 1) {
  const g = new Gen(world, seed);
  const rng = g.rng;
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Cayir'],
    env: 'meadow', quadWhere: 'quadWhereMeadow',
    water: { y: WL * VS, flow: null },
  };
  terrain(g);
  fillColumns(g);
  const padPlan = planPads(g);   // ped yerleri ve ucus koridorlari agaclardan once ayrilir
  scatterRocks(g);

  // ana yapilar
  greatOak(g, out);
  const hn = treehouse(g, out, TH_N[0], TH_N[1], DECK_N, { half: 13, hut: [-11, -11, 12, 10], hutDoor: 'S', lamp: true });
  const hw = treehouse(g, out, TH_W[0], TH_W[1], DECK_W, { half: 13, hut: [-11, -11, 10, 12], hutDoor: 'E', lamp: true });
  const he = treehouse(g, out, TH_E[0], TH_E[1], DECK_E, { half: 13, hut: [1, -11, 11, 10], hutDoor: 'W', lamp: true });
  bridgeZ(g, OAK[0], OAK[1] - 22, TH_N[1] + hn.half, DECK_OAK, DECK_N);
  bridgeX(g, TH_W[0] + hw.half, OAK[0] - 22, OAK[1], DECK_W, DECK_OAK);
  bridgeX(g, OAK[0] + 22, TH_E[0] - he.half, OAK[1], DECK_OAK, DECK_E);
  divingBoard(g, TH_E[0] + 2, TH_E[1] + he.half, DECK_E);
  hunterStand(g, out, STAND[0], STAND[1], DECK_STAND);
  footbridges(g);
  dock(g, out);

  // dogal doku: agaclar, calilar, kutukler
  scatterTrees(g);
  cliffTrees(g);
  bushesAndLogs(g);
  reeds(g);

  for (const p of padPlan) padAt(g, out, ...p);
  carvePadPaths(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  out.water.flow = flowMap(g);
  out.water.depth = depthMap(g);
  // statik isiklarin sayisi haritalar arasinda ayni kalsin (sahne isik sayisi degisirse tum shader'lar
  // yeniden derlenir): bos yuvalar oyunda sonuk isik olur
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- arazi
function creekStamp(g) {
  // Catmull-Rom egrisi boyunca disk damgasi: her kolona dereye uzaklik + akis yonu
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
  for (let k = 0; k < pts.length; k++) {
    const [px, pz] = pts[k];
    const nx = pts[Math.min(pts.length - 1, k + 1)], pv = pts[Math.max(0, k - 1)];
    let tx = nx[0] - pv[0], tz = nx[1] - pv[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // dere genisligi biraz degissin
    for (let z = Math.floor(pz - R); z <= pz + R; z++) for (let x = Math.floor(px - R); x <= px + R; x++) {
      if (x < 0 || z < 0 || x >= sx || z >= g.sz) continue;
      const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
      const i = x + sx * z;
      if (d < g.creekD[i]) { g.creekD[i] = d; g.creekT[i * 2] = tx; g.creekT[i * 2 + 1] = tz; }
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
  return f + (fbm(x / 9, z / 9, g.ns + 301, 3) - 0.5) * 7;
}

function cliffBand(g, x, z) {
  const sx = g.sx, sz = g.sz;
  const eN = z, eS = sz - 1 - z, eW = x, eE = sx - 1 - x;
  const e = Math.min(eN, eS, eW, eE);
  let along, k;
  if (e === eN) { along = x; k = 1; } else if (e === eS) { along = x; k = 2; } else if (e === eW) { along = z; k = 3; } else { along = z; k = 4; }
  let band = 11 + 13 * fbm(along / 21, k * 9.7, g.ns + 11, 3);
  // dere kaynagi: bati ucurumu orada kalin (magara agzi)
  if (k === 3) band = Math.max(band, 26 * smooth(Math.max(0, 1 - Math.abs(z - 68) / 34)));
  return { e, band };
}

function terrain(g) {
  creekStamp(g);
  const sx = g.sx, sz = g.sz, s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + sx * z;
    const { e, band } = cliffBand(g, x, z);
    // cayir: hafif dalgalar + iki tepe + ucuruma dogru yukselme
    let base = 24 + 2.6 * fbm(x / 44, z / 44, s + 1);
    base += 5 * smooth(Math.max(0, 1 - Math.hypot(x - 92, z - 58) / 44));
    base += 4 * smooth(Math.max(0, 1 - Math.hypot(x - 252, z - 92) / 36));
    base += 5 * smooth(Math.max(0, Math.min(1, 1 - (e - band) / 34)));
    let H = Math.round(base);
    let zone = 0;
    // gol
    const f = lakeF(g, x, z);
    if (f < 0) {
      const dv = Math.min(12, Math.round(-f * 0.55));
      H = WL - 1 - dv; zone = 3;
      g.lakeIn[i] = -f;
    } else if (f < 26) {
      const sh = Math.round(WL + 1 + f * 0.36);
      if (sh < H) { H = sh; if (H <= WL + 2) zone = 4; }
    }
    // dere: 2.25 m genis yatak (0.5 m su), basamakli kiyilar
    const dc = g.creekD[i];
    if (dc < 4.6) {
      if (zone !== 3 || H > 16) { H = Math.min(H, 16); zone = zone === 3 ? 3 : 1; }
    } else if (dc < 15) {
      const ch = Math.round(16 + (dc - 4.6) * 1.15);
      if (ch < H) { H = ch; if (zone !== 3 && zone !== 4) zone = 2; }
    }
    // ucurum (dere kaynagi ucurumu yarar)
    if (e < band) {
      const cH = Math.round(54 + 18 * fbm(x / 26, z / 26, s + 5));
      if (dc < 4.6) { /* dere kaynagi: yatak acik kalir */ }
      else if (dc < 15) H = Math.max(H, Math.min(cH, Math.round(16 + (dc - 4.6) * 3.2)));
      else H = cH;
      if (dc >= 4.6) zone = 5;
      else zone = 1;
      g.cliffE = g.cliffE || new Int16Array(sx * sz).fill(-1);
      g.cliffE[i] = band - e;   // ucurumun icine derinlik (voxel)
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
      if (cliffIn >= 0 && zone === 5) m = cliffIn <= 3 ? M.ROCK : M.CLIFF;
      else if (y < SUBSOIL && high) m = M.ROCK;
      else m = M.DIRT;
      mat[c + sxz * y] = m;
    }
    // ust katman
    const top = H - 1;
    let tm;
    if (zone === 3) tm = g.lakeIn[c] > 10 ? M.DIRT : M.SAND;
    else if (zone === 1) tm = hash3(x >> 1, 3, z >> 1) < 0.3 ? M.ROCK : M.SAND;
    else if (zone === 4) tm = H <= WL + 1 ? M.SAND : M.GRASS;
    else if (zone === 5) tm = cliffIn <= 3 || H < 40 ? M.ROCK : M.GRASS;
    else tm = fbm(x / 13, z / 13, s + 77, 3) > 0.68 && hash3(x, 5, z) > 0.45 ? M.FLOWER : M.GRASS;
    if (zone === 2 && H < WL + 1) tm = M.DIRT;   // dere kiyisinin su kenari: islak toprak
    mat[c + sxz * top] = tm;
  }
  // dere kaynagi: ucurumun icinde kemerli magara agzi (su yuzeyinin 3.5 m ustu acik)
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    if (!g.cliffE || g.cliffE[c] < 0 || g.creekD[c] >= 6.5) continue;
    const roof = 30 + Math.round(2 * hash3(x >> 1, 9, z >> 1));
    const cH = Math.round(54 + 18 * fbm(x / 26, z / 26, s + 5));
    if (g.cliffE[c] > 2) for (let y = roof; y < cH; y++) mat[c + sxz * y] = g.cliffE[c] <= 4 ? M.ROCK : M.CLIFF;
  }
}

// ---------------------------------------------------------------- kaya ve tas
function rockBlob(g, cx, cy, cz, rx, ry, rz, m = M.ROCK) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const e = dx * dx + dy * dy + dz * dz;
    if (e < 1 - 0.28 * hash3(x, y, z) && y >= 2) g.set(x, y, z, m);
  }
}

function scatterRocks(g) {
  const rng = g.rng;
  // ucurum eteginde dokuntu kayalari ve cayirda irili ufakli kayalar
  let placed = 0;
  for (let t = 0; t < 600 && placed < 30; t++) {
    const x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const c = (x | 0) + g.sx * (z | 0);
    const zone = g.zone[c];
    if (zone === 3 || zone === 1 || zone === 5) continue;
    if (g.creekD[c] < 9 || Math.hypot(x - OAK[0], z - OAK[1]) < 46) continue;
    if ([TH_N, TH_W, TH_E, STAND].some((p) => Math.hypot(x - p[0], z - p[1]) < 24)) continue;
    const big = rng() < 0.35;
    const r = big ? 5 + rng() * 4 : 2.5 + rng() * 2.5;
    if (!g.free(x, z, r + 4)) continue;
    const gy = g.h(x, z);
    rockBlob(g, x, gy + r * 0.25, z, r * (1 + rng() * 0.5), r * (0.65 + rng() * 0.35), r * (0.8 + rng() * 0.4));
    if (big && rng() < 0.6) rockBlob(g, x + (rng() - 0.5) * r * 1.6, gy + r * 0.2, z + (rng() - 0.5) * r * 1.6, r * 0.6, r * 0.5, r * 0.6);
    g.block(x, z, r + 2);
    placed++;
  }
  // derede basamak taslari
  const pts = g.creekPts;
  for (const k of [Math.floor(pts.length * 0.42), Math.floor(pts.length * 0.7)]) {
    const [px, pz] = pts[k];
    const [qx, qz] = pts[k + 2];
    const tx = qx - px, tz = qz - pz, tl = Math.hypot(tx, tz) || 1;
    const nx = -tz / tl, nz = tx / tl;
    for (let j = -2; j <= 2; j++) rockBlob(g, px + nx * j * 2.6, 17.2, pz + nz * j * 2.6, 1.3, 1.4, 1.3);
    g.stones = (g.stones || []).concat([[px, pz]]);
  }
}

// ---------------------------------------------------------------- agaclar
function disc(g, cx, y, cz, r, m, soft = false) {
  const ri = Math.ceil(r);
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const d = Math.hypot(dx + 0.5 - (cx - Math.floor(cx)) , dz + 0.5 - (cz - Math.floor(cz)));
    if (d <= r) { const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz; if (soft) g.soft(x, y, z, m); else g.set(x, y, z, m); }
  }
}

// gövde: konik, hafif egik; kok yayilmasi ile
function trunk(g, x, z, y0, y1, r0, r1, lx = 0, lz = 0, m = M.BARK, roots = true) {
  for (let y = y0 - 2; y < y1; y++) {
    const t = Math.max(0, (y - y0) / Math.max(1, y1 - y0));
    let r = r0 + (r1 - r0) * t;
    if (roots && y < y0 + 4) r += (y0 + 4 - y) * 0.45 * (r0 / 3);
    disc(g, x + lx * t, y, z + lz * t, r, m);
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

// gurultulu yaprak kumesi (yalniz bos voxellere)
function foliage(g, cx, cy, cz, rx, ry, rz, m = M.LEAVES, holeY = -1, holeR = 0, hx = 0, hz = 0, clipY = 0) {
  for (let y = Math.max(clipY, Math.floor(cy - ry)); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const e = dx * dx + dy * dy + dz * dz;
    // topak topak kenar: yaricap 4 voxellik gurultuyle oynar, kenarda 2 voxellik kumeler eksik.
    // Tek voxellik delik yok: yuzey sayisi (ucgen) dusuk kalir.
    const n4 = hash3((x >> 2) + 31, y >> 2, z >> 2), n2 = hash3(x >> 1, y >> 1, z >> 1);
    if (e > 1 - 0.32 * n4) continue;
    if (e > 0.72 && n2 > 0.72) continue;
    if (holeY >= 0 && y >= holeY && Math.hypot(x + 0.5 - hx, z + 0.5 - hz) < holeR) continue;
    g.soft(x, y, z, m);
  }
}

function oakTree(g, x, z, scale = 1) {
  const rng = g.rng;
  const gy = g.h(x, z);
  const r0 = 1.6 + 1.2 * scale, th = Math.round(14 + 12 * scale);
  const lx = (rng() - 0.5) * 3, lz = (rng() - 0.5) * 3;
  trunk(g, x, z, gy, gy + th, r0, r0 * 0.6, lx, lz);
  const tx = x + lx, tz = z + lz, ty = gy + th;
  const cr = 7 + 6 * scale;
  const nb = 3 + Math.floor(rng() * 3);
  for (let b = 0; b < nb; b++) {
    const a = rng() * Math.PI * 2, L = cr * (0.55 + rng() * 0.35);
    const by = ty - 3 + rng() * 4;
    const ex = tx + Math.cos(a) * L, ez = tz + Math.sin(a) * L, ey = by + 3 + rng() * 4;
    limb(g, tx, by - 4, tz, ex, ey, ez, r0 * 0.5, 0.8);
    foliage(g, ex, ey + 1, ez, cr * (0.55 + rng() * 0.2), cr * (0.42 + rng() * 0.15), cr * (0.55 + rng() * 0.2));
  }
  foliage(g, tx, ty + cr * 0.35, tz, cr * 0.85, cr * 0.6, cr * 0.85);
  g.block(x, z, Math.max(4, r0 + 3));
}

function pineTree(g, x, z, scale = 1, m = M.MOSS) {
  const rng = g.rng;
  const gy = g.h(x, z);
  const th = Math.round(28 + 16 * scale), r0 = 1.1 + 0.8 * scale;
  trunk(g, x, z, gy, gy + th, r0, 0.6, 0, 0, M.BARK, false);
  const R = 6 + 4 * scale;
  // katmanli koni
  for (let y = gy + 7; y < gy + th + 3; y++) {
    const t = (y - gy - 7) / (th - 4);
    const band = 0.78 + 0.22 * Math.sin(y * 1.1 + x);
    const r = Math.max(0.6, R * (1 - t) * band);
    const ri = Math.ceil(r);
    for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > r || (d > r - 1.2 && hash3((x + dx) >> 1, y >> 1, (z + dz) >> 1) > 0.7)) continue;
      g.soft(x + dx, y, z + dz, m);
    }
  }
  g.block(x, z, 4);
}

function birchTree(g, x, z, scale = 1) {
  const rng = g.rng;
  const gy = g.h(x, z);
  const th = Math.round(22 + 10 * scale);
  const lx = (rng() - 0.5) * 4, lz = (rng() - 0.5) * 4;
  trunk(g, x, z, gy, gy + th, 1.15, 0.7, lx, lz, M.PLASTER, false);
  foliage(g, x + lx, gy + th - 2, z + lz, 5 + 2 * scale, 8 + 3 * scale, 5 + 2 * scale);
  foliage(g, x + lx * 0.6 + 2, gy + th - 9, z + lz * 0.6 - 1, 4, 4, 4);
  g.block(x, z, 4);
}

function bush(g, x, z, r) {
  const gy = g.h(x, z);
  foliage(g, x, gy + r * 0.35, z, r * 1.2, r * 0.75, r * 1.1);
}

function scatterTrees(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 1400 && n < 24; t++) {
    const x = 24 + rng() * (g.sx - 48), z = 24 + rng() * (g.sz - 48);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || g.creekD[c] < 13) continue;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 52) continue;
    if (lakeF(g, x, z) < 10) continue;
    if (!g.free(x, z, 9)) continue;
    const k = rng();
    if (k < 0.5) oakTree(g, x | 0, z | 0, 0.35 + rng() * 0.6);
    else if (k < 0.78) pineTree(g, x | 0, z | 0, 0.3 + rng() * 0.6);
    else birchTree(g, x | 0, z | 0, rng());
    n++;
  }
}

function cliffTrees(g) {
  // ucurum tepesinde ve eteginde orman siluetleri
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 900 && n < 24; t++) {
    const side = Math.floor(rng() * 4);
    const along = 10 + rng() * (g.sx - 20);
    const depth = 3 + rng() * 9;
    const x = Math.floor(side === 0 || side === 1 ? along : side === 2 ? depth : g.sx - 1 - depth);
    const z = Math.floor(side === 2 || side === 3 ? along : side === 0 ? depth : g.sz - 1 - depth);
    const c = x + g.sx * z;
    if (g.zone[c] !== 5 || g.H[c] < 50 || g.creekD[c] < 10) continue;
    if (!g.free(x, z, 5)) continue;
    if (rng() < 0.7) pineTree(g, x, z, 0.2 + rng() * 0.5); else bush(g, x, z, 3 + rng() * 2);
    n++;
  }
}

function bushesAndLogs(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 800 && n < 26; t++) {
    const x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] === 3 || g.zone[c] === 1 || g.zone[c] === 5) continue;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 44) continue;
    const r = 2.5 + rng() * 2.5;
    if (!g.free(x, z, r + 2) || g.h(x, z) < WL + 3 || lakeF(g, x, z) < 4) continue;
    bush(g, x, z, r);
    g.block(x, z, r);
    n++;
  }
  // devrik kutukler (siper)
  let logs = 0;
  for (let t = 0; t < 400 && logs < 7; t++) {
    const x = 30 + rng() * (g.sx - 60), z = 30 + rng() * (g.sz - 60);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || g.creekD[c] < 12 || Math.hypot(x - OAK[0], z - OAK[1]) < 44) continue;
    const a = rng() * Math.PI, L = 14 + rng() * 12, r = 1.6 + rng() * 0.9;
    const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
    if (!g.free(x, z, 3) || !g.free(ex, ez, 3) || !g.free((x + ex) / 2, (z + ez) / 2, L / 2)) continue;
    const gy = Math.min(g.h(x, z), g.h(ex, ez));
    limb(g, x, gy + r - 0.3, z, ex, gy + r - 0.3, ez, r, r * 0.9);
    g.block((x + ex) / 2, (z + ez) / 2, L / 2);
    logs++;
  }
}

function reeds(g) {
  const sx = g.sx;
  for (let z = 4; z < g.sz - 4; z++) for (let x = 4; x < sx - 4; x++) {
    const c = x + sx * z;
    const zn = g.zone[c];
    const lake = zn === 3 && g.lakeIn[c] < 3.5;
    const creek = zn === 2 && g.H[c] <= WL + 1;
    if (!lake && !creek) continue;
    if (hash3(x, 41, z) > (lake ? 0.07 : 0.035)) continue;
    const H = g.H[c];
    const top = WL + 2 + Math.floor(hash3(x, 43, z) * 4);
    for (let y = H; y < top; y++) if (g.get(x, y, z) === 0) g.set(x, y, z, M.MOSS);
  }
}

// ---------------------------------------------------------------- agac evleri
function railing(g, x0, z0, x1, z1, y, gaps = []) {
  // x0..x1 / z0..z1 cizgisi (biri sabit), direkler 4'te bir, tirabzan y+3
  const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  for (let k = 0; k <= len; k++) {
    const x = x0 + dx * k, z = z0 + dz * k;
    if (gaps.some(([a, b]) => (dx ? x : z) >= a && (dx ? x : z) < b)) continue;
    if (k % 4 === 0 || k === len) for (let yy = y; yy < y + 4; yy++) g.soft(x, yy, z, M.BARK);
    g.soft(x, y + 3, z, M.WOOD);
  }
}

function hut(g, x0, z0, w, d, y, door, out) {
  // tahta kulube: 1 voxel duvar, kapi, pencereler, piramit cati
  const H = 11;
  const x1 = x0 + w, z1 = z0 + d;
  for (let yy = y; yy < y + H; yy++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
    if (!edge) continue;
    const corner = (x === x0 || x === x1 - 1) && (z === z0 || z === z1 - 1);
    g.set(x, yy, z, corner ? M.BARK : M.WOOD);
  }
  // kapi
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const dw = 2;
  if (door === 'S') g.box(cx - dw, y, z1 - 1, cx + dw, y + 9, z1, 0);
  if (door === 'N') g.box(cx - dw, y, z0, cx + dw, y + 9, z0 + 1, 0);
  if (door === 'E') g.box(x1 - 1, y, cz - dw, x1, y + 9, cz + dw, 0);
  if (door === 'W') g.box(x0, y, cz - dw, x0 + 1, y + 9, cz + dw, 0);
  // pencereler
  for (const [a, b] of [[x0 + 2, x0 + 5], [x1 - 5, x1 - 2]]) {
    if (door !== 'N') g.box(a, y + 4, z0, b, y + 8, z0 + 1, 0);
    if (door !== 'S') g.box(a, y + 4, z1 - 1, b, y + 8, z1, 0);
  }
  for (const [a, b] of [[z0 + 2, z0 + 5], [z1 - 5, z1 - 2]]) {
    if (door !== 'W') g.box(x0, y + 4, a, x0 + 1, y + 8, b, 0);
    if (door !== 'E') g.box(x1 - 1, y + 4, a, x1, y + 8, b, 0);
  }
  // cati: kademeli piramit, 1 voxel sacak
  for (let k = 0; k < 7; k++) {
    const ax = x0 - 1 + k, az = z0 - 1 + k, bx = x1 + 1 - k, bz = z1 + 1 - k;
    if (bx - ax < 2 || bz - az < 2) break;
    for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
      if (k < 6 && x > ax && x < bx - 1 && z > az && z < bz - 1 && k > 0) continue;
      g.set(x, y + H + k, z, k === 0 ? M.WOOD : M.BARK);
    }
  }
  // fener: kapinin ustunde
  let lx = cx, lz = cz;
  if (door === 'S') lz = z1; if (door === 'N') lz = z0 - 1; if (door === 'E') lx = x1; if (door === 'W') lx = x0 - 1;
  g.set(lx, y + 10, lz, M.LAMP);
  g.set(lx, y + 11, lz, M.WOOD);
  if (out) out.lights.push({ x: (lx + 0.5) * VS, y: (y + 9.5) * VS, z: (lz + 0.5) * VS, color: 0xffc27a, intensity: 3.2, distance: 9, voxR: 1 });
}

// agac evi: buyuk govde + kare guverte + korkuluk + kulube + sarmal merdiven + tepede yapraklar
function treehouse(g, out, x, z, deckY, opt) {
  const half = opt.half;
  const gy = g.h(x, z);
  const r0 = 4.5, r1 = 3.2;
  const top = deckY + 30;
  trunk(g, x, z, gy, top, r0, r1, 0, 0, M.BARK, false);
  // guverte
  g.box(x - half, deckY - 2, z - half, x + half + 1, deckY, z + half + 1, M.WOOD);
  stilts(g, x, z, half, deckY);
  // sarmal merdiven gövde cevresinde
  spiral(g, x, z, gy, deckY, 6, 11);
  // korkuluk (kopru acikliklari)
  const gap = [[x - 4, x + 5]], gapz = [[z - 4, z + 5]];
  railing(g, x - half, z - half, x + half, z - half, deckY, opt.gapN ?? gap);
  railing(g, x - half, z + half, x + half, z + half, deckY, opt.gapS ?? gap);
  railing(g, x - half, z - half, x - half, z + half, deckY, opt.gapW ?? gapz);
  railing(g, x + half, z - half, x + half, z + half, deckY, opt.gapE ?? gapz);
  // kulube
  if (opt.hut) {
    const [hx, hz, hw, hd] = opt.hut;
    hut(g, x + hx, z + hz, hw, hd, deckY, opt.hutDoor, opt.lamp ? out : null);
  }
  // tac: guvertenin ustunde gölge veren yapraklar
  const cy = deckY + 26;
  for (let b = 0; b < 5; b++) {
    const a = b / 5 * Math.PI * 2 + g.rng() * 0.6;
    const L = 9 + g.rng() * 6;
    const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L;
    limb(g, x, deckY + 18, z, ex, cy - 2, ez, 1.6, 0.9);
    foliage(g, ex, cy, ez, 11, 7, 11);
  }
  foliage(g, x, top + 2, z, 12, 8, 12);
  g.block(x, z, half + 4);
  return { half, gy };
}

// guverte koselerinde yere inen kaziklar (capraz payanda merdiven boslugunu kesiyordu)
function stilts(g, x, z, half, deckY) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (half - 1) + (sx < 0 ? 0 : -1), pz = z + sz * (half - 1) + (sz < 0 ? 0 : -1);
    for (let y = Math.min(g.h(px, pz), g.h(px + 1, pz + 1)) - 1; y < deckY - 2; y++) g.box(px, y, pz, px + 2, y + 1, pz + 2, M.BARK);
  }
}

function spiral(g, cx, cz, gy, topY, r0, r1) {
  const rise = topY - gy;
  const R = r1 + 2;   // guverte boslugu basamaklardan 2 voxel genis (dis kenarda yururken bas carpmasin)
  for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) {
    const r = Math.hypot(dx + 0.5, dz + 0.5);
    if (r < r0 || r >= R) continue;
    const a = Math.atan2(dz + 0.5, dx + 0.5);
    const t = (a + Math.PI) / (Math.PI * 2);
    const hh = Math.min(rise, Math.floor(t * rise) + 1);
    const x = cx + dx, z = cz + dz, top = gy + hh;
    if (r < r1) for (let y = Math.max(gy - 1, top - 2); y < top; y++) g.soft(x, y, z, M.WOOD);
    // merdivenin ust kismi guvertenin altinda kaliyorsa guvertede bosluk ac (oyuncunun govdesi
    // bir onceki basamagin kolonuna da tastigi icin 2 voxel pay)
    if (top > topY - 12 && top < topY) for (let y = Math.max(top, topY - 2); y < topY; y++) if (g.get(x, y, z) === M.WOOD) g.set(x, y, z, 0);
  }
}

function bridgeZ(g, x, z0, z1, y0, y1) {
  // z boyunca kopru: x-4..x+4, z1 < z0 (kuzeye) ya da tersi; yukseklik dogrusal
  const a = Math.min(z0, z1), b = Math.max(z0, z1);
  for (let z = a; z <= b; z++) {
    const t = (z - a) / Math.max(1, b - a);
    const y = Math.round(z0 < z1 ? y0 + (y1 - y0) * t : y1 + (y0 - y1) * t);
    g.box(x - 4, y - 2, z, x + 4, y, z + 1, M.WOOD);
    for (let yy = y; yy < y + 10; yy++) for (let xx = x - 4; xx < x + 4; xx++) if (g.get(xx, yy, z) === M.LEAVES) g.set(xx, yy, z, 0);
    if ((z - a) % 4 === 0) { for (let yy = y; yy < y + 4; yy++) { g.set(x - 5, yy, z, M.BARK); g.set(x + 4, yy, z, M.BARK); } }
    g.set(x - 5, y + 3, z, M.WOOD); g.set(x + 4, y + 3, z, M.WOOD);
  }
}

function bridgeX(g, x0, x1, z, y0, y1) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) {
    const t = (x - a) / Math.max(1, b - a);
    const y = Math.round(x0 < x1 ? y0 + (y1 - y0) * t : y1 + (y0 - y1) * t);
    g.box(x, y - 2, z - 4, x + 1, y, z + 4, M.WOOD);
    for (let yy = y; yy < y + 10; yy++) for (let zz = z - 4; zz < z + 4; zz++) if (g.get(x, yy, zz) === M.LEAVES) g.set(x, yy, zz, 0);
    if ((x - a) % 4 === 0) { for (let yy = y; yy < y + 4; yy++) { g.set(x, yy, z - 5, M.BARK); g.set(x, yy, z + 4, M.BARK); } }
    g.set(x, y + 3, z - 5, M.WOOD); g.set(x, y + 3, z + 4, M.WOOD);
  }
}

function divingBoard(g, x, z0, deckY) {
  // gol evinin guneyinden golun derin yerine uzanan atlama iskelesi (korkuluksuz)
  let z = z0;
  for (; z < z0 + 40; z++) {
    g.box(x - 3, deckY - 2, z, x + 3, deckY, z + 1, M.WOOD);
    const H = g.h(x, z);
    if (H <= WL - 8 && z > z0 + 8) break;
  }
  g.box(x - 3, deckY, z0, x + 3, deckY + 5, z0 + 1, 0);
  g.diveEnd = [x, z];
}

function hunterStand(g, out, x, z, deckY) {
  // kazikli avci kulubesi: dort kazik, platform, alcak duvar, merdiven
  const gy = g.h(x, z);
  const hw = 8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (hw - 1), pz = z + sz * (hw - 1);
    for (let y = g.h(px, pz) - 1; y < deckY + 9; y++) { g.set(px, y, pz, M.BARK); g.set(px + 1, y, pz, M.BARK); g.set(px, y, pz + 1, M.BARK); g.set(px + 1, y, pz + 1, M.BARK); }
  }
  g.box(x - hw, deckY - 2, z - hw, x + hw + 1, deckY, z + hw + 1, M.WOOD);
  // alcak tahta duvar (siper) + cati
  for (const [ax, az, bx, bz] of [[x - hw, z - hw, x + hw + 1, z - hw + 1], [x - hw, z + hw, x + hw + 1, z + hw + 1], [x - hw, z - hw, x - hw + 1, z + hw + 1], [x + hw, z - hw, x + hw + 1, z + hw + 1]]) g.box(ax, deckY, az, bx, deckY + 4, bz, M.WOOD);
  g.box(x - hw - 1, deckY + 9, z - hw - 1, x + hw + 2, deckY + 10, z + hw + 2, M.WOOD);
  g.box(x - 2, deckY, z + hw, x + 3, deckY + 4, z + hw + 1, 0);   // giris
  // merdiven: guneye inen basamaklar
  const rise = deckY - gy;
  for (let s = 0; s < rise; s++) {
    const zz = z + hw + 1 + (rise - 1 - s) * 2;
    g.box(x - 2, gy + s - 1, zz, x + 3, gy + s + 1, zz + 2, M.WOOD);
  }
  g.set(x, deckY + 8, z, M.LAMP);
  out.lights.push({ x: (x + 0.5) * VS, y: (deckY + 7.5) * VS, z: (z + 0.5) * VS, color: 0xffc27a, intensity: 2.6, distance: 8, voxR: 1 });
  g.block(x, z, hw + 4);
  g.stand = { x, z, deckY, hw };
}

function footbridges(g) {
  // derenin iki yerinde kemerli kalas kopru (zemin seviyesinde)
  const pts = g.creekPts;
  for (const f of [0.28, 0.56, 0.86]) {
    const k = Math.floor(pts.length * f);
    const [px, pz] = pts[k], [qx, qz] = pts[Math.min(pts.length - 1, k + 3)];
    const tx = qx - px, tz = qz - pz;
    const alongX = Math.abs(tz) > Math.abs(tx);   // dere z'ye akiyorsa kopru x boyunca
    const L = 15;
    const y = Math.max(g.h(px - (alongX ? L : 0), pz - (alongX ? 0 : L)), g.h(px + (alongX ? L : 0), pz + (alongX ? 0 : L)));
    for (let d = -L; d <= L; d++) {
      const arch = Math.round(2 * Math.cos(d / L * Math.PI / 2));
      const x = Math.floor(px + (alongX ? d : 0)), z = Math.floor(pz + (alongX ? 0 : d));
      const yy = y + arch - 1;
      if (alongX) { g.box(x, yy - 1, z - 3, x + 1, yy + 1, z + 3, M.WOOD); if (d % 4 === 0) { g.box(x, yy + 1, z - 4, x + 1, yy + 4, z - 3, M.BARK); g.box(x, yy + 1, z + 3, x + 1, yy + 4, z + 4, M.BARK); } g.set(x, yy + 3, z - 4, M.WOOD); g.set(x, yy + 3, z + 3, M.WOOD); }
      else { g.box(x - 3, yy - 1, z, x + 3, yy + 1, z + 1, M.WOOD); if (d % 4 === 0) { g.box(x - 4, yy + 1, z, x - 3, yy + 4, z + 1, M.BARK); g.box(x + 3, yy + 1, z, x + 4, yy + 4, z + 1, M.BARK); } g.set(x - 4, yy + 3, z, M.WOOD); g.set(x + 3, yy + 3, z, M.WOOD); }
    }
  }
}

function dock(g, out) {
  // golun guney kiyisindan suya uzanan iskele (su yuzeyinin 0.5 m ustu)
  const x = 206;
  let z = 248;
  while (z > 200 && g.h(x, z) > WL - 6) z--;
  const zEnd = Math.max(z, 222);
  for (let zz = zEnd; zz <= 252; zz++) {
    if (g.h(x, zz) >= WL + 3) break;
    g.box(x - 4, WL, zz, x + 4, WL + 2, zz + 1, M.WOOD);
    if ((zz - zEnd) % 6 === 0) for (const px of [x - 4, x + 3]) for (let y = g.h(px, zz); y < WL + 2; y++) g.set(px, y, zz, M.BARK);
  }
  g.dockEnd = [x, zEnd];
}

// ---------------------------------------------------------------- buyuk mese
function greatOak(g, out) {
  const [x, z] = OAK;
  const gy = g.h(x, z);
  g.oakGy = gy;
  trunk(g, x, z, gy, NEST + 6, 7.2, 4.2, 0, 0, M.BARK, false);
  // ana dallar: guvertenin altindan ve ustunden
  const rng = g.rng;
  for (let b = 0; b < 7; b++) {
    const a = b / 7 * Math.PI * 2 + 0.3;
    const L = 20 + rng() * 6;
    const by = DECK_OAK + 10 + (b % 3) * 4;
    const ex = x + Math.cos(a) * L, ez = z + Math.sin(a) * L, ey = by + 8 + rng() * 6;
    limb(g, x + Math.cos(a) * 4, by, z + Math.sin(a) * 4, ex, ey, ez, 2.6, 1.2);
    foliage(g, ex, ey + 2, ez, 13 + rng() * 3, 8 + rng() * 2, 13 + rng() * 3, M.LEAVES, NEST - 2, 15, x, z, DECK_OAK + 10);
  }
  // ust tac halkasi (gozetleme yerinin cevresi acik kalir)
  for (let b = 0; b < 6; b++) {
    const a = b / 6 * Math.PI * 2;
    foliage(g, x + Math.cos(a) * 19, NEST + 2, z + Math.sin(a) * 19, 10, 8, 10, M.LEAVES, NEST - 2, 15, x, z);
  }
  // guverte: 11 m kare
  const half = 22;
  g.box(x - half, DECK_OAK - 2, z - half, x + half + 1, DECK_OAK, z + half + 1, M.WOOD);
  stilts(g, x, z, half, DECK_OAK);
  spiral(g, x, z, gy, DECK_OAK, 7, 13);
  const gp = [[x - 4, x + 5]], gz = [[z - 4, z + 5]];
  railing(g, x - half, z - half, x + half, z - half, DECK_OAK, gp);
  railing(g, x - half, z + half, x + half, z + half, DECK_OAK, []);
  railing(g, x - half, z - half, x - half, z + half, DECK_OAK, gz);
  railing(g, x + half, z - half, x + half, z + half, DECK_OAK, gz);
  // kulube kuzeydogu kosesinde (merdiven boslugu halkanin guney yarisinda)
  hut(g, x + 7, z - 20, 14, 13, DECK_OAK, 'W', out);
  // gozetleme yeri (KIYAMET kuresi)
  for (let y = NEST - 2; y < NEST; y++) disc(g, x + 0.5, y, z + 0.5, 12, M.WOOD);
  for (let k = 0; k < 80; k++) {
    const a = k / 80 * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * 12), pz = Math.round(z + Math.sin(a) * 12);
    for (let y = NEST; y < NEST + 3; y++) g.set(px, y, pz, k % 10 === 0 ? M.BARK : (y === NEST + 2 ? M.WOOD : g.get(px, y, pz)));
  }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; limb(g, x, NEST - 10, z, x + Math.cos(a) * 11, NEST - 2.5, z + Math.sin(a) * 11, 1.6, 0.9); }
  // tepe direginde fener
  for (let y = NEST + 6; y < NEST + 9; y++) disc(g, x + 0.5, y, z + 0.5, 1.6, M.BARK);
  g.set(x, NEST + 9, z, M.LAMP); g.set(x - 1, NEST + 9, z, M.LAMP); g.set(x, NEST + 9, z - 1, M.LAMP); g.set(x - 1, NEST + 9, z - 1, M.LAMP);
  out.lights.push({ x: x * VS, y: (NEST + 9.5) * VS, z: z * VS, color: 0xffe2b0, intensity: 9, distance: 14, voxR: 2 });
  g.block(x, z, 30);
}

// ---------------------------------------------------------------- pedler
function flatten(g, x0, z0, x1, z1, y) {
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    for (let yy = y; yy < y + 14; yy++) if (g.get(x, yy, z) !== M.BARK) g.set(x, yy, z, 0);
    for (let yy = 2; yy < y; yy++) if (g.get(x, yy, z) === 0) g.set(x, yy, z, M.DIRT);
    g.set(x, y - 1, z, M.GRASS);
    g.H[x + g.sx * z] = y;
  }
}

function padAt(g, out, px, pz, tx, ty, tz, apex = 3.5) {
  px = Math.round(px); pz = Math.round(pz);
  const y = g.h(px, pz);
  flatten(g, px - 6, pz - 6, px + 6, pz + 6, y);
  g.box(px - 4, y - 1, pz - 4, px + 4, y, pz + 4, M.PAD);
  for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
    if (x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4) continue;
    g.set(x, y, z, M.ROCK);
  }
  out.pads.push({ x: px * VS, y: y * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
  g.block(px, pz, 8);
}

// ped yerleri + hedefleri; ucus yolu boyunca agac/kaya konmasin diye alan ayrilir
function planPads(g) {
  const [x, z] = OAK;
  const plan = [];
  // buyuk mesenin dort kosegeninden gozetleme yerine
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    plan.push([x + Math.cos(a) * 44, z + Math.sin(a) * 44, x + Math.cos(a) * 7.5, NEST, z + Math.sin(a) * 7.5]);
  }
  // agac evlerine: guvertenin merdiven boslugu disindaki guneydogu kosesine
  plan.push([TH_N[0] + 30, TH_N[1] + 22, TH_N[0] + 9, DECK_N, TH_N[1] + 9, 3.5]);
  plan.push([TH_W[0] + 20, TH_W[1] + 40, TH_W[0] + 9, DECK_W, TH_W[1] + 9, 3.5]);
  plan.push([TH_E[0] + 34, TH_E[1] + 4, TH_E[0] + 9, DECK_E, TH_E[1] + 9, 3.5]);
  for (const [px, pz, tx, , tz] of plan) {
    const L = Math.hypot(tx - px, tz - pz);
    for (let d = 0; d <= L; d += 3) g.block(px + (tx - px) * d / L, pz + (tz - pz) * d / L, 7);
  }
  return plan;
}

// ped yorungeleri yapraklarin icinden gecerken koridor ac
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
        if (m === M.LEAVES || m === M.MOSS) g.set(X, Y, Z, 0);
        else if (m === M.BARK && Y > DECK_OAK + 8) { const r = Math.hypot(X + 0.5 - OAK[0], Z + 0.5 - OAK[1]); if (r > 7 && r < 34) g.set(X, Y, Z, 0); }
      }
    }
  }
}

// ---------------------------------------------------------------- ogeler, dogma noktalari
const P = (g, x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

function placeItems(g, out) {
  const [ox, oz] = OAK;
  out.items.push({ type: 'quad', ...P(g, ox + 5, NEST, oz + 5) });
  // MEGA: golun en derin yerinde (dalmak gerekir; botlar suya girmez)
  let best = null, bd = -1;
  for (let z = 170; z < 240; z++) for (let x = 150; x < 250; x++) { const c = x + g.sx * z; if (g.zone[c] === 3 && g.lakeIn[c] > bd) { bd = g.lakeIn[c]; best = [x, z]; } }
  if (best) out.items.push({ type: 'mega', ...P(g, best[0], g.h(best[0], best[1]), best[1]), noBots: true });
  out.items.push({ type: 'armor', ...P(g, ox + 14, DECK_OAK, oz - 14) });
  out.items.push({ type: 'ammo', ...P(g, ox - 16, DECK_OAK, oz - 16) });
  out.items.push({ type: 'health', ...P(g, ox - 16, DECK_OAK, oz + 16) });
  out.items.push({ type: 'armor', ...P(g, TH_N[0] - 6, DECK_N, TH_N[1] - 6) });
  out.items.push({ type: 'ammo', ...P(g, TH_W[0] - 5, DECK_W, TH_W[1] - 4) });
  out.items.push({ type: 'health', ...P(g, TH_E[0] - 10, DECK_E, TH_E[1] + 10) });   // guneybati kosesi
  if (g.stand) out.items.push({ type: 'armor', ...P(g, g.stand.x, g.stand.deckY, g.stand.z) });
  if (g.dockEnd) out.items.push({ type: 'health', ...P(g, g.dockEnd[0], WL + 2, g.dockEnd[1] + 2) });
  // zemindeki ogeler: dere kiyisi, kaynak, cayirlar
  const ground = [[ox, oz + 34, 'health'], [96, 70, 'health'], [236, 64, 'ammo'], [250, 248, 'health'], [140, 250, 'ammo'], [30, 100, 'ammo'], [112, 196, 'health']];
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
    if (y <= WL + 1 || g.get(X, y - 1, Z) === 0) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (g.get(X + xx, y + k, Z + zz) !== 0) ok = false;
    for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (Math.abs(g.h(X + xx, Z + zz) - y) > 1) ok = false;
    if (ok) return [X, y, Z];
  }
  return null;
}

function placeSpawns(g, out) {
  const [ox, oz] = OAK;
  const yawTo = (x, z) => Math.atan2(-(ox - x), -(oz - z));
  const add = (x, y, z) => out.spawns.push({ ...P(g, x, y, z), yaw: yawTo(x, z) });
  // guverteler
  add(ox - 16, DECK_OAK, oz - 10);
  add(ox + 16, DECK_OAK, oz + 12);
  add(TH_N[0] + 10, DECK_N, TH_N[1] - 10);
  add(TH_W[0] - 10, DECK_W, TH_W[1] + 10);
  add(TH_E[0] - 10, DECK_E, TH_E[1] - 10);
  if (g.stand) add(g.stand.x - 4, g.stand.deckY, g.stand.z - 4);
  // zemin: arenaya yayilmis adaylar, birbirinden uzak secilir
  const cands = [];
  for (let z = 26; z < g.sz - 26; z += 9) for (let x = 26; x < g.sx - 26; x += 9) {
    const c = x + g.sx * z;
    if (g.zone[c] !== 0 && g.zone[c] !== 4) continue;
    if (Math.hypot(x - ox, z - oz) < 26) continue;
    if (out.pads.some((p) => Math.hypot(p.x / VS - x, p.z / VS - z) < 10)) continue;
    const p = findGround(g, x, z, 3);
    if (p) cands.push(p);
  }
  const chosen = [];
  for (let n = 0; n < 14 && cands.length; n++) {
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

// ---------------------------------------------------------------- su verileri (water.js)
// akis haritasi: 0.5 m hucre, RGBA (RG akis m/s, B kopuk)
function flowMap(g) {
  const cell = 2, W = g.sx / cell, Hh = g.sz / cell;
  const data = new Float32Array(W * Hh * 4);
  const stones = g.stones || [];
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const x = i * cell + 1, z = j * cell + 1;
    const c = x + g.sx * z;
    const dc = g.creekD[c];
    if (dc > 8) continue;
    const zn = g.zone[c];
    const lake = zn === 3 ? Math.min(1, g.lakeIn[c] / 10) : 0;
    const sp = 0.6 * (1 - smooth(Math.min(1, dc / 8))) * (1 - lake);
    const o = (j * W + i) * 4;
    data[o] = g.creekT[c * 2] * sp;
    data[o + 1] = g.creekT[c * 2 + 1] * sp;
    let foam = 0.02 * (1 - lake);
    for (const [sx, sz] of stones) { const d = Math.hypot(sx - x, sz - z); if (d < 9) foam = Math.max(foam, 0.45 * (1 - d / 9)); }
    if (zn === 3 && g.lakeIn[c] < 6) foam = Math.max(foam, 0.25 * (1 - g.lakeIn[c] / 6));
    data[o + 2] = foam;
    data[o + 3] = 1;
  }
  return { data, width: W, height: Hh, rect: [0, 0, g.sx * VS, g.sz * VS] };
}

// zemin yukseklik haritasi (m): water.js patlamalari dipte kirpar, sig suda dalgalar kuculur
function depthMap(g) {
  const cell = 2, W = g.sx / cell, Hh = g.sz / cell;
  const data = new Float32Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) data[j * W + i] = g.h(i * cell + 1, j * cell + 1) * VS;
  return { data, width: W, height: Hh, rect: [0, 0, g.sx * VS, g.sz * VS] };
}
