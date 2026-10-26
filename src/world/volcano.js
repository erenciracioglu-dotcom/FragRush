// Volkan haritasi: cayirin karanlik, lavli surumu. Yerlesim cayirla ayni (ortada dev obsidyen kule ve
// gozetleme yeri, uc bazalt kule, aralarinda demir izgara kopruler, gozcu kulubesi, ziplama pedleri),
// ama agac yok: obsidyen kristalleri, bazalt sutun kumeleri, curuf ve bazalt kayalari, magma catlaklari.
// Batidaki ucurum magarasindan cikan dar bir lav deresi kucuk ve sig bir lav goletine akar.
// Lav: seviyenin (VOLCANO_LAVA_Y) altindaki ve lav maskesindeki her bos voxel lavdir; dokunan aninda
// olur. Maske dereyi/goleti biraz asar: kiyida lav seviyesinin altina inen krater lavla dolar, uzaktaki
// derin krater ise kuru kalir. Gorsel lav (fx/lava.js), botlar ve oyun kurallari ayni tanimi kullanir.
// Tum yerlesim voxel biriminde; donen konumlar metre.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';
import { mulberry32 } from './mapgen.js';

export const VOLCANO_LAVA_Y = 18;   // voxel (4.5 m): bu yukseklikten asagisi (maskede) lav
const LY = VOLCANO_LAVA_Y;
const SUBSOIL = 21;                 // zeminde bunun alti bazalt (roket lav seviyesine zor iner)
const DEEP = 12;                    // bunun alti akkor magma kaya (derin kraterde gorunur)
const CREEK_R = 3.0;                // lav yatagi yari genisligi (voxel): ~1.5 m genis dere
const BANK_R = 13;                  // kiyi egiminin uzandigi mesafe (voxel)
const MASK_DIL = 5;                 // lav maskesi kiyiya bu kadar (voxel) tasar

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
    this.H = new Int16Array(n);        // ilk bos voxel (zemin yuzeyi)
    this.zone = new Uint8Array(n);     // 0 ova, 1 lav yatagi, 2 dere kiyisi, 3 golet, 4 golet kiyisi, 5 ucurum, 6 ada
    this.creekD = new Float32Array(n).fill(1e9);
    this.creekT = new Float32Array(n * 2);
    this.pondIn = new Float32Array(n);  // golet icinde kiyiya uzaklik (voxel)
    this.cliffE = new Int16Array(n).fill(-1);
    this.lavaD = new Float32Array(n);   // en yakin lav kolonuna uzaklik (voxel)
    this.blocked = [];
  }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[this.idx(x, y, z)] = m; }
  // yalniz bos voxele yaz (yapilari ezmesin)
  soft(x, y, z, m) {
    if (!this.in(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.w.mat[i] === 0) this.w.mat[i] = m;
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
  lava(x, z) { x = Math.max(0, Math.min(this.sx - 1, x | 0)); z = Math.max(0, Math.min(this.sz - 1, z | 0)); return this.lavaD[x + this.sx * z]; }
  free(x, z, r) { for (const [bx, bz, br] of this.blocked) if (Math.hypot(bx - x, bz - z) < br + r) return false; return true; }
  block(x, z, r) { this.blocked.push([x, z, r]); }
}

// ---------------------------------------------------------------- yerlesim (voxel)
const OAK = [144, 144];              // merkez obsidyen kule
const TH_N = [144, 50];              // kuzey bazalt kulesi
const TH_W = [50, 144];              // bati (dere) kulesi
const TH_E = [212, 140];             // dogu (golet) kulesi
const STAND = [62, 228];             // gozcu kulubesi
const DECK_OAK = 46, DECK_N = 48, DECK_W = 45, DECK_E = 45, DECK_STAND = 38;
const NEST = 74;                     // kulenin tepesindeki gozetleme yeri (KIYAMET kuresi)
const CREEK = [[12, 70], [32, 76], [54, 90], [72, 112], [80, 138], [88, 164], [108, 186], [134, 200], [160, 206], [180, 208]];
const POND = [194, 208, 17, 13];     // merkez x, z, yaricap x, z (voxel): ~8.5 x 6.5 m
const ISLET = [194, 208, 3.6];       // goletin ortasinda bazalt ada (MEGA burada)
// yapi malzemeleri
const DECK = M.BASALT_BRICK, POST = M.STEEL, RAIL = M.RUST;

export function generateVolcano(world, seed = 1) {
  const g = new Gen(world, seed);
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Volkan'],
    env: 'volcano', quadWhere: 'quadWhereVolcano', water: null, lava: null, vents: [],
  };
  terrain(g);
  lavaDistance(g);
  fillColumns(g);
  const padPlan = planPads(g);   // ped yerleri ve ucus koridorlari dekordan once ayrilir
  scatterRocks(g);

  // ana yapilar
  spire(g, out);
  const hn = tower(g, out, TH_N[0], TH_N[1], DECK_N, { half: 13, hut: [-11, -11, 12, 10], hutDoor: 'S' });
  const hw = tower(g, out, TH_W[0], TH_W[1], DECK_W, { half: 13, hut: [-11, -11, 10, 12], hutDoor: 'E' });
  const he = tower(g, out, TH_E[0], TH_E[1], DECK_E, { half: 13, hut: [1, -11, 11, 10], hutDoor: 'W' });
  bridgeZ(g, OAK[0], OAK[1] - 22, TH_N[1] + hn.half, DECK_OAK, DECK_N);
  bridgeX(g, TH_W[0] + hw.half, OAK[0] - 22, OAK[1], DECK_W, DECK_OAK);
  bridgeX(g, OAK[0] + 22, TH_E[0] - he.half, OAK[1], DECK_OAK, DECK_E);
  watchPost(g, out, STAND[0], STAND[1], DECK_STAND);
  arches(g);
  steppingStones(g);

  // dogal doku: bazalt sutunlari, obsidyen kristalleri, ucurum dikenleri, magma catlaklari, fumaroller
  basaltFields(g);
  obsidianClusters(g);
  cliffSpikes(g);
  fissures(g);
  vents(g, out);

  for (const p of padPlan) padAt(g, out, ...p);
  carvePadPaths(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  out.lava = lavaData(g);
  lavaLights(g, out);
  // statik isik sayisi haritalar arasinda ayni kalir (game.js bos yuvalari sonuk isikla doldurur)
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
  const R = BANK_R + 2, sx = g.sx;
  for (let k = 0; k < pts.length; k++) {
    const [px, pz] = pts[k];
    const nx = pts[Math.min(pts.length - 1, k + 1)], pv = pts[Math.max(0, k - 1)];
    let tx = nx[0] - pv[0], tz = nx[1] - pv[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    for (let z = Math.floor(pz - R); z <= pz + R; z++) for (let x = Math.floor(px - R); x <= px + R; x++) {
      if (x < 0 || z < 0 || x >= sx || z >= g.sz) continue;
      const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
      const i = x + sx * z;
      if (d < g.creekD[i]) { g.creekD[i] = d; g.creekT[i * 2] = tx; g.creekT[i * 2 + 1] = tz; }
    }
  }
}

function pondF(g, x, z) {
  // elips; isaretli yaklasik uzaklik (voxel, iceride negatif) + kiyi gurultusu
  const [cx, cz, rx, rz] = POND;
  const e = Math.hypot((x - cx) / rx, (z - cz) / rz);
  return (e - 1) * Math.min(rx, rz) + (fbm(x / 7, z / 7, g.ns + 301, 3) - 0.5) * 5;
}

function cliffBand(g, x, z) {
  const sx = g.sx, sz = g.sz;
  const eN = z, eS = sz - 1 - z, eW = x, eE = sx - 1 - x;
  const e = Math.min(eN, eS, eW, eE);
  let along, k;
  if (e === eN) { along = x; k = 1; } else if (e === eS) { along = x; k = 2; } else if (e === eW) { along = z; k = 3; } else { along = z; k = 4; }
  let band = 11 + 13 * fbm(along / 21, k * 9.7, g.ns + 11, 3);
  // lav kaynagi: bati ucurumu orada kalin (magara agzi)
  if (k === 3) band = Math.max(band, 26 * smooth(Math.max(0, 1 - Math.abs(z - 70) / 34)));
  return { e, band };
}

function terrain(g) {
  creekStamp(g);
  const sx = g.sx, sz = g.sz, s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + sx * z;
    const { e, band } = cliffBand(g, x, z);
    // ova: hafif dalgalar + iki tepe + ucuruma dogru yukselme + puruzlu lav akintisi sirtlari
    let base = 24 + 2.6 * fbm(x / 44, z / 44, s + 1);
    base += 5 * smooth(Math.max(0, 1 - Math.hypot(x - 92, z - 58) / 44));
    base += 4 * smooth(Math.max(0, 1 - Math.hypot(x - 252, z - 92) / 36));
    base += 5 * smooth(Math.max(0, Math.min(1, 1 - (e - band) / 34)));
    base += 1.8 * (fbm(x / 12, z / 12, s + 41, 3) - 0.5);
    let H = Math.round(base);
    let zone = 0;
    // golet: sig (0.25-1 m)
    const f = pondF(g, x, z);
    if (f < 0) {
      const dv = Math.min(3, Math.round(-f * 0.3));
      H = LY - 1 - dv; zone = 3;
      g.pondIn[i] = -f;
      // ortada bazalt ada
      const di = Math.hypot(x + 0.5 - ISLET[0], z + 0.5 - ISLET[1]);
      if (di < ISLET[2] + (vnoise(x / 2, z / 2, s + 91) - 0.5) * 1.6) { H = LY + 3; zone = 6; }
    } else if (f < 16) {
      const sh = Math.round(LY + 1 + f * 0.5);
      if (sh < H) { H = sh; if (H <= LY + 3) zone = 4; }
    }
    // dere: ~1.5 m genis lav yatagi (0.5 m lav), basamakli kiyilar
    const dc = g.creekD[i];
    if (dc < CREEK_R) {
      if (zone !== 3 && zone !== 6) { H = Math.min(H, LY - 2); zone = 1; }
    } else if (dc < BANK_R) {
      const ch = Math.round(LY + 1 + (dc - CREEK_R) * 1.05);
      if (ch < H) { H = ch; if (zone !== 3 && zone !== 4 && zone !== 6) zone = 2; }
    }
    // ucurum (lav kaynagi ucurumu yarar)
    if (e < band) {
      const cH = Math.round(54 + 18 * fbm(x / 26, z / 26, s + 5));
      if (dc < CREEK_R) { /* kaynak: yatak acik */ }
      else if (dc < BANK_R) H = Math.max(H, Math.min(cH, Math.round(LY + 1 + (dc - CREEK_R) * 3.2)));
      else H = cH;
      zone = dc >= CREEK_R ? 5 : 1;
      g.cliffE[i] = band - e;
    }
    g.H[i] = Math.max(3, Math.min(g.sy - 4, H));
    g.zone[i] = zone;
  }
}

// en yakin lav kolonuna uzaklik (iki gecisli pah donusumu, voxel)
function lavaDistance(g) {
  const sx = g.sx, sz = g.sz, D = g.lavaD;
  for (let i = 0; i < sx * sz; i++) D[i] = (g.zone[i] === 1 || g.zone[i] === 3) && g.H[i] < LY ? 0 : 1e6;
  const r2 = Math.SQRT2;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + sx * z;
    let d = D[i];
    if (x > 0) d = Math.min(d, D[i - 1] + 1);
    if (z > 0) { d = Math.min(d, D[i - sx] + 1); if (x > 0) d = Math.min(d, D[i - sx - 1] + r2); if (x < sx - 1) d = Math.min(d, D[i - sx + 1] + r2); }
    D[i] = d;
  }
  for (let z = sz - 1; z >= 0; z--) for (let x = sx - 1; x >= 0; x--) {
    const i = x + sx * z;
    let d = D[i];
    if (x < sx - 1) d = Math.min(d, D[i + 1] + 1);
    if (z < sz - 1) { d = Math.min(d, D[i + sx] + 1); if (x < sx - 1) d = Math.min(d, D[i + sx + 1] + r2); if (x > 0) d = Math.min(d, D[i + sx - 1] + r2); }
    D[i] = d;
  }
}

function fillColumns(g) {
  const w = g.w, sx = g.sx, sz = g.sz, sxz = w.sxz, mat = w.mat;
  const s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    const H = g.H[c], zone = g.zone[c];
    mat[c] = M.BEDROCK; mat[c + sxz] = M.BEDROCK;
    const cliffIn = g.cliffE[c];
    for (let y = 2; y < H; y++) {
      let m;
      if (zone === 5 && cliffIn >= 0) m = cliffIn <= 3 ? M.BASALT : M.VCLIFF;
      else if (y < DEEP) m = M.MAGMA;
      else if (y < SUBSOIL || y < H - 3) m = M.BASALT;
      else m = M.SCORIA;
      mat[c + sxz * y] = m;
    }
    // ust katman
    const top = H - 1;
    let tm;
    const hh = hash3(x >> 1, 7, z >> 1);
    if (zone === 1 || zone === 3) tm = M.MAGMA;                        // lav altindaki yatak
    else if (zone === 6) tm = hh < 0.5 ? M.OBSIDIAN : M.BASALT;          // ada
    else if (zone === 2 || zone === 4) {
      // lav kiyisi: hemen kenarda koyu bazalt ve seyrek sicak magma; yukarida curuf ve kul
      if (H <= LY + 2) tm = hh < 0.22 ? M.MAGMA : M.BASALT;
      else tm = hh < 0.45 ? M.SCORIA : M.ASH;
    } else if (zone === 5) tm = cliffIn <= 3 || H < 40 ? M.BASALT : M.ASH;
    else {
      const n = fbm(x / 15, z / 15, s + 77, 3);
      tm = n > 0.68 ? M.SCORIA : M.ASH;
      if (hash3(x, 5, z) > 0.988) tm = M.OBSIDIAN;   // kul icinde parlayan obsidyen cakillari
    }
    mat[c + sxz * top] = tm;
  }
  // lav kaynagi: ucurumun icinde kemerli magara agzi (lav yuzeyinin ~3 m ustu acik); agizda magma damarlari
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    if (g.cliffE[c] < 0 || g.creekD[c] >= 5.5) continue;
    const roof = 30 + Math.round(2 * hash3(x >> 1, 9, z >> 1));
    const cH = Math.round(54 + 18 * fbm(x / 26, z / 26, s + 5));
    if (g.cliffE[c] > 2) for (let y = roof; y < cH; y++) {
      let m = g.cliffE[c] <= 4 ? M.BASALT : M.VCLIFF;
      if (y < roof + 3 && hash3(x, y, z) < 0.3) m = M.MAGMA;
      mat[c + sxz * y] = m;
    }
  }
}

// ---------------------------------------------------------------- kaya ve sekiller
function rockBlob(g, cx, cy, cz, rx, ry, rz, m = M.BASALT, veins = false) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    const e = dx * dx + dy * dy + dz * dz;
    if (e < 1 - 0.28 * hash3(x, y, z) && y >= 2) {
      let mm = m;
      // magma damari: govdeyi kesen ince akkor catlak
      if (veins && Math.abs(vnoise(x / 2.5 + 3, (y + z * 0.7) / 2.5, g.ns + 71) - 0.5) < 0.05) mm = M.MAGMA;
      g.set(x, y, z, mm);
    }
  }
}

// egik, sivrilen silindir (diken, kristal, payanda)
function limb(g, ax, ay, az, bx, by, bz, r0, r1, m, soft = true) {
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const n = Math.ceil(L * 1.5);
  for (let k = 0; k <= n; k++) {
    const t = k / n, r = r0 + (r1 - r0) * t;
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
      if (dx * dx + dy * dy + dz * dz > r * r + 0.3) continue;
      const X = Math.floor(cx + dx), Y = Math.floor(cy + dy), Z = Math.floor(cz + dz);
      if (soft) g.soft(X, Y, Z, m); else g.set(X, Y, Z, m);
    }
  }
}

function disc(g, cx, y, cz, r, m, soft = false) {
  const ri = Math.ceil(r);
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const d = Math.hypot(dx + 0.5 - (cx - Math.floor(cx)), dz + 0.5 - (cz - Math.floor(cz)));
    if (d <= r) { const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz; if (soft) g.soft(x, y, z, m); else g.set(x, y, z, m); }
  }
}

// altigen prizma (duz kenari z'ye bakan): bazalt sutunu
function hexColumn(g, cx, cz, y0, y1, R, m, soft = false) {
  const ri = Math.ceil(R);
  const k = R * 0.866;
  for (let dz = -ri; dz <= ri; dz++) for (let dx = -ri; dx <= ri; dx++) {
    const ax = Math.abs(dx + 0.5 - (cx - Math.floor(cx))), az = Math.abs(dz + 0.5 - (cz - Math.floor(cz)));
    if (az > k || ax * 0.866 + az * 0.5 > k) continue;
    const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
    for (let y = Math.max(2, y0); y < y1; y++) { if (soft) g.soft(x, y, z, m); else g.set(x, y, z, m); }
  }
}

function scatterRocks(g) {
  const rng = g.rng;
  // ovada irili ufakli bazalt / curuf / obsidyen kayalari (bazilarinda magma damari)
  let placed = 0;
  for (let t = 0; t < 700 && placed < 30; t++) {
    const x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const c = (x | 0) + g.sx * (z | 0);
    const zone = g.zone[c];
    if (zone === 1 || zone === 3 || zone === 5 || zone === 6) continue;
    if (g.lava(x, z) < 10 || Math.hypot(x - OAK[0], z - OAK[1]) < 46) continue;
    if ([TH_N, TH_W, TH_E, STAND].some((p) => Math.hypot(x - p[0], z - p[1]) < 24)) continue;
    const big = rng() < 0.35;
    const r = big ? 5 + rng() * 4 : 2.5 + rng() * 2.5;
    if (!g.free(x, z, r + 4)) continue;
    const gy = g.h(x, z);
    const k = rng();
    const m = k < 0.55 ? M.BASALT : k < 0.85 ? M.SCORIA : M.OBSIDIAN;
    const veins = m === M.BASALT && rng() < 0.55;
    rockBlob(g, x, gy + r * 0.25, z, r * (1 + rng() * 0.5), r * (0.65 + rng() * 0.35), r * (0.8 + rng() * 0.4), m, veins);
    if (big && rng() < 0.6) rockBlob(g, x + (rng() - 0.5) * r * 1.6, gy + r * 0.2, z + (rng() - 0.5) * r * 1.6, r * 0.6, r * 0.5, r * 0.6, rng() < 0.5 ? M.SCORIA : m);
    g.block(x, z, r + 2);
    placed++;
  }
}

// ---------------------------------------------------------------- yapilar
function railing(g, x0, z0, x1, z1, y, gaps = []) {
  // x0..x1 / z0..z1 cizgisi (biri sabit), demir direkler 4'te bir, pasli tirabzan y+3
  const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  for (let k = 0; k <= len; k++) {
    const x = x0 + dx * k, z = z0 + dz * k;
    if (gaps.some(([a, b]) => (dx ? x : z) >= a && (dx ? x : z) < b)) continue;
    if (k % 4 === 0 || k === len) for (let yy = y; yy < y + 4; yy++) g.soft(x, yy, z, POST);
    g.soft(x, y + 3, z, RAIL);
  }
}

// tas kulube: bazalt tas duvar, obsidyen koseler, kapi, pencereler, kademeli bazalt cati, kapida mangal
function hut(g, x0, z0, w, d, y, door, out) {
  const H = 11;
  const x1 = x0 + w, z1 = z0 + d;
  for (let yy = y; yy < y + H; yy++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
    if (!edge) continue;
    const corner = (x === x0 || x === x1 - 1) && (z === z0 || z === z1 - 1);
    g.set(x, yy, z, corner ? M.OBSIDIAN : M.BASALT_BRICK);
  }
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const dw = 2;
  if (door === 'S') g.box(cx - dw, y, z1 - 1, cx + dw, y + 9, z1, 0);
  if (door === 'N') g.box(cx - dw, y, z0, cx + dw, y + 9, z0 + 1, 0);
  if (door === 'E') g.box(x1 - 1, y, cz - dw, x1, y + 9, cz + dw, 0);
  if (door === 'W') g.box(x0, y, cz - dw, x0 + 1, y + 9, cz + dw, 0);
  for (const [a, b] of [[x0 + 2, x0 + 5], [x1 - 5, x1 - 2]]) {
    if (door !== 'N') g.box(a, y + 4, z0, b, y + 8, z0 + 1, 0);
    if (door !== 'S') g.box(a, y + 4, z1 - 1, b, y + 8, z1, 0);
  }
  for (const [a, b] of [[z0 + 2, z0 + 5], [z1 - 5, z1 - 2]]) {
    if (door !== 'W') g.box(x0, y + 4, a, x0 + 1, y + 8, b, 0);
    if (door !== 'E') g.box(x1 - 1, y + 4, a, x1, y + 8, b, 0);
  }
  for (let k = 0; k < 7; k++) {
    const ax = x0 - 1 + k, az = z0 - 1 + k, bx = x1 + 1 - k, bz = z1 + 1 - k;
    if (bx - ax < 2 || bz - az < 2) break;
    for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) {
      if (k < 6 && x > ax && x < bx - 1 && z > az && z < bz - 1 && k > 0) continue;
      g.set(x, y + H + k, z, k === 0 ? M.BASALT_BRICK : M.BASALT);
    }
  }
  // mangal: kapinin ustunde demir kase + ates
  let lx = cx, lz = cz;
  if (door === 'S') lz = z1; if (door === 'N') lz = z0 - 1; if (door === 'E') lx = x1; if (door === 'W') lx = x0 - 1;
  g.set(lx, y + 9, lz, M.RUST);
  g.set(lx, y + 10, lz, M.FIRE);
  if (out) out.lights.push({ x: (lx + 0.5) * VS, y: (y + 10.5) * VS, z: (lz + 0.5) * VS, color: 0xff8a3a, intensity: 3.6, distance: 9.5, voxR: 1 });
}

// bazalt kule: altigen bazalt sutunu + kare tas guverte + korkuluk + tas kulube + sarmal merdiven
function tower(g, out, x, z, deckY, opt) {
  const half = opt.half;
  const gy = g.h(x, z);
  hexColumn(g, x + 0.5, z + 0.5, gy - 3, deckY + 9, 4.9, M.BASALT);
  // sutunun tepesinde kirik, kisa sutunlar (siper ve siluet)
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * Math.PI * 2 + 0.4;
    hexColumn(g, x + 0.5 + Math.cos(a) * 2.2, z + 0.5 + Math.sin(a) * 2.2, deckY + 9, deckY + 11 + k * 2, 1.7, M.BASALT);
  }
  g.box(x - half, deckY - 2, z - half, x + half + 1, deckY, z + half + 1, DECK);
  pillars(g, x, z, half, deckY);
  spiral(g, x, z, gy, deckY, 6, 11);
  const gap = [[x - 4, x + 5]], gapz = [[z - 4, z + 5]];
  railing(g, x - half, z - half, x + half, z - half, deckY, opt.gapN ?? gap);
  railing(g, x - half, z + half, x + half, z + half, deckY, opt.gapS ?? gap);
  railing(g, x - half, z - half, x - half, z + half, deckY, opt.gapW ?? gapz);
  railing(g, x + half, z - half, x + half, z + half, deckY, opt.gapE ?? gapz);
  if (opt.hut) {
    const [hx, hz, hw, hd] = opt.hut;
    hut(g, x + hx, z + hz, hw, hd, deckY, opt.hutDoor, out);
  }
  g.block(x, z, half + 4);
  return { half, gy };
}

// guverte koselerinde yere inen altigen bazalt ayaklar
function pillars(g, x, z, half, deckY) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (half - 1.5) + 0.5, pz = z + sz * (half - 1.5) + 0.5;
    const gy = Math.min(g.h(px - 1, pz - 1), g.h(px + 1, pz + 1), g.h(px, pz));
    hexColumn(g, px, pz, gy - 2, deckY - 2, 2.0, M.BASALT);
  }
}

function spiral(g, cx, cz, gy, topY, r0, r1, m = DECK) {
  const rise = topY - gy;
  const R = r1 + 2;   // guverte boslugu basamaklardan 2 voxel genis (dis kenarda yururken bas carpmasin)
  for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) {
    const r = Math.hypot(dx + 0.5, dz + 0.5);
    if (r < r0 || r >= R) continue;
    const a = Math.atan2(dz + 0.5, dx + 0.5);
    const t = (a + Math.PI) / (Math.PI * 2);
    const hh = Math.min(rise, Math.floor(t * rise) + 1);
    const x = cx + dx, z = cz + dz, top = gy + hh;
    if (r < r1) for (let y = Math.max(gy - 1, top - 2); y < top; y++) g.soft(x, y, z, m);
    // merdivenin ust kismi guvertenin altinda kaliyorsa guvertede bosluk ac
    if (top > topY - 12 && top < topY) for (let y = Math.max(top, topY - 2); y < topY; y++) if (g.get(x, y, z) === DECK) g.set(x, y, z, 0);
  }
}

function bridgeZ(g, x, z0, z1, y0, y1) {
  // z boyunca demir izgara kopru: x-4..x+4; yukseklik dogrusal
  const a = Math.min(z0, z1), b = Math.max(z0, z1);
  for (let z = a; z <= b; z++) {
    const t = (z - a) / Math.max(1, b - a);
    const y = Math.round(z0 < z1 ? y0 + (y1 - y0) * t : y1 + (y0 - y1) * t);
    g.box(x - 4, y - 2, z, x + 4, y, z + 1, M.GRATE);
    for (let yy = y; yy < y + 10; yy++) for (let xx = x - 4; xx < x + 4; xx++) { const m = g.get(xx, yy, z); if (m === M.OBSIDIAN || m === M.BASALT) g.set(xx, yy, z, 0); }
    if ((z - a) % 4 === 0) { for (let yy = y; yy < y + 4; yy++) { g.set(x - 5, yy, z, POST); g.set(x + 4, yy, z, POST); } }
    g.set(x - 5, y + 3, z, RAIL); g.set(x + 4, y + 3, z, RAIL);
  }
}

function bridgeX(g, x0, x1, z, y0, y1) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) {
    const t = (x - a) / Math.max(1, b - a);
    const y = Math.round(x0 < x1 ? y0 + (y1 - y0) * t : y1 + (y0 - y1) * t);
    g.box(x, y - 2, z - 4, x + 1, y, z + 4, M.GRATE);
    for (let yy = y; yy < y + 10; yy++) for (let zz = z - 4; zz < z + 4; zz++) { const m = g.get(x, yy, zz); if (m === M.OBSIDIAN || m === M.BASALT) g.set(x, yy, zz, 0); }
    if ((x - a) % 4 === 0) { for (let yy = y; yy < y + 4; yy++) { g.set(x, yy, z - 5, POST); g.set(x, yy, z + 4, POST); } }
    g.set(x, y + 3, z - 5, RAIL); g.set(x, y + 3, z + 4, RAIL);
  }
}

function watchPost(g, out, x, z, deckY) {
  // bazalt ayakli gozcu kulubesi: dort ayak, tas platform, alcak tas duvar, cati, merdiven, mangal
  const gy = g.h(x, z);
  const hw = 8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (hw - 1), pz = z + sz * (hw - 1);
    for (let y = g.h(px, pz) - 1; y < deckY + 9; y++) { g.set(px, y, pz, M.BASALT); g.set(px + 1, y, pz, M.BASALT); g.set(px, y, pz + 1, M.BASALT); g.set(px + 1, y, pz + 1, M.BASALT); }
  }
  g.box(x - hw, deckY - 2, z - hw, x + hw + 1, deckY, z + hw + 1, DECK);
  for (const [ax, az, bx, bz] of [[x - hw, z - hw, x + hw + 1, z - hw + 1], [x - hw, z + hw, x + hw + 1, z + hw + 1], [x - hw, z - hw, x - hw + 1, z + hw + 1], [x + hw, z - hw, x + hw + 1, z + hw + 1]]) g.box(ax, deckY, az, bx, deckY + 4, bz, M.BASALT_BRICK);
  g.box(x - hw - 1, deckY + 9, z - hw - 1, x + hw + 2, deckY + 10, z + hw + 2, M.BASALT);
  g.box(x - 2, deckY, z + hw, x + 3, deckY + 4, z + hw + 1, 0);   // giris
  const rise = deckY - gy;
  for (let s = 0; s < rise; s++) {
    const zz = z + hw + 1 + (rise - 1 - s) * 2;
    g.box(x - 2, gy + s - 1, zz, x + 3, gy + s + 1, zz + 2, DECK);
  }
  g.set(x, deckY + 7, z, M.RUST);
  g.set(x, deckY + 8, z, M.FIRE);
  out.lights.push({ x: (x + 0.5) * VS, y: (deckY + 7.5) * VS, z: (z + 0.5) * VS, color: 0xff8a3a, intensity: 2.8, distance: 8.5, voxR: 1 });
  g.block(x, z, hw + 4);
  g.stand = { x, z, deckY, hw };
}

function arches(g) {
  // derenin uc yerinde dogal bazalt kemer (zemin seviyesinde, alti kemerli, korkuluk yerine obsidyen taslar)
  const pts = g.creekPts;
  for (const f of [0.28, 0.56, 0.86]) {
    const k = Math.floor(pts.length * f);
    const [px, pz] = pts[k], [qx, qz] = pts[Math.min(pts.length - 1, k + 3)];
    const tx = qx - px, tz = qz - pz;
    const alongX = Math.abs(tz) > Math.abs(tx);   // lav z'ye akiyorsa kemer x boyunca
    const L = 13;
    const y = Math.max(g.h(px - (alongX ? L : 0), pz - (alongX ? 0 : L)), g.h(px + (alongX ? L : 0), pz + (alongX ? 0 : L)));
    for (let d = -L; d <= L; d++) {
      const arch = Math.round(2 * Math.cos(d / L * Math.PI / 2));
      const x = Math.floor(px + (alongX ? d : 0)), z = Math.floor(pz + (alongX ? 0 : d));
      const yy = y + arch - 1;
      const under = Math.round(4 * Math.pow(Math.abs(d) / L, 2));   // kemer: uclara dogru kalinlasir
      if (alongX) {
        g.box(x, yy - 1 - under, z - 3, x + 1, yy + 1, z + 3, M.BASALT);
        if (Math.abs(d) % 5 === 0) { g.box(x, yy + 1, z - 4, x + 1, yy + 3, z - 3, M.OBSIDIAN); g.box(x, yy + 1, z + 3, x + 1, yy + 3, z + 4, M.OBSIDIAN); }
        else { g.set(x, yy + 1, z - 4, M.BASALT); g.set(x, yy + 1, z + 3, M.BASALT); }
      } else {
        g.box(x - 3, yy - 1 - under, z, x + 3, yy + 1, z + 1, M.BASALT);
        if (Math.abs(d) % 5 === 0) { g.box(x - 4, yy + 1, z, x - 3, yy + 3, z + 1, M.OBSIDIAN); g.box(x + 3, yy + 1, z, x + 4, yy + 3, z + 1, M.OBSIDIAN); }
        else { g.set(x - 4, yy + 1, z, M.BASALT); g.set(x + 3, yy + 1, z, M.BASALT); }
      }
    }
    g.block(px, pz, 6);
  }
}

// goletin kuzey ve bati kiyisindan adaya iki kucuk obsidyen basamak (riskli atlayis)
function steppingStones(g) {
  const [cx, cz] = ISLET;
  for (const [dx, dz] of [[0, -8.5], [-10, 1]]) {
    const x = cx + dx, z = cz + dz;
    disc(g, x, LY, z, 1.4, M.OBSIDIAN);
    disc(g, x, LY + 1, z, 1.2, M.OBSIDIAN);
    for (let y = LY - 3; y < LY; y++) disc(g, x, y, z, 1.6, M.BASALT);
  }
  // adaya giden kiyilar acik kalsin
  g.block(cx, cz - 15, 7);
  g.block(cx - 17, cz + 1, 7);
}

// ---------------------------------------------------------------- merkez obsidyen kule
function spire(g, out) {
  const [x, z] = OAK;
  const gy = g.h(x, z);
  g.oakGy = gy;
  const top = NEST + 5;
  // govde: puruzlu, sivrilen bazalt sutun; kabukta dikey obsidyen bantlari ve ince magma damarlari
  for (let y = gy - 3; y < top; y++) {
    const t = Math.max(0, (y - gy) / (top - gy));
    const r = 6.4 - 2.2 * t;
    const R = Math.ceil(r + 1.5);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5);
      const a = Math.atan2(dz + 0.5, dx + 0.5);
      const n = vnoise(Math.cos(a) * 2.2 + 10, Math.sin(a) * 2.2 + y * 0.09, g.ns + 501);
      const rr = r * (0.88 + 0.16 * n);
      if (d > rr) continue;
      let m = M.BASALT;
      if (d > rr - 1.4) {
        const band = vnoise(Math.cos(a) * 5 + 3, Math.sin(a) * 5 + y * 0.035, g.ns + 503);
        if (band > 0.64) m = M.OBSIDIAN;
        else if (Math.abs(band - 0.36) < 0.022 && y < NEST) m = M.MAGMA;
      }
      g.set(x + dx, y, z + dz, m);
    }
  }
  // guverte: 11 m kare tas
  const half = 22;
  g.box(x - half, DECK_OAK - 2, z - half, x + half + 1, DECK_OAK, z + half + 1, DECK);
  pillars(g, x, z, half, DECK_OAK);
  spiral(g, x, z, gy, DECK_OAK, 7, 13);
  const gp = [[x - 4, x + 5]], gz = [[z - 4, z + 5]];
  railing(g, x - half, z - half, x + half, z - half, DECK_OAK, gp);
  railing(g, x - half, z + half, x + half, z + half, DECK_OAK, []);
  railing(g, x - half, z - half, x - half, z + half, DECK_OAK, gz);
  railing(g, x + half, z - half, x + half, z + half, DECK_OAK, gz);
  // kulube kuzeydogu kosesinde (merdiven boslugu halkanin guney yarisinda)
  hut(g, x + 7, z - 20, 14, 13, DECK_OAK, 'W', out);
  // govdeden cikan obsidyen dikenler (ana yonlere yakin; ped koridorlari capraz yonlerde)
  const rng = g.rng;
  for (const a of [0.17, 1.75, 3.32, 4.89]) {
    const y0 = DECK_OAK + 9 + rng() * 6;
    const r0 = 4.6;
    const L = 9 + rng() * 5;
    limb(g, x + Math.cos(a) * r0, y0, z + Math.sin(a) * r0, x + Math.cos(a) * (r0 + L), y0 + 7 + rng() * 5, z + Math.sin(a) * (r0 + L), 1.9, 0.45, M.OBSIDIAN);
  }
  // gozetleme yeri (KIYAMET kuresi): tas halka platform, obsidyen payandalar, korkuluk
  for (let y = NEST - 2; y < NEST; y++) disc(g, x + 0.5, y, z + 0.5, 12, DECK);
  for (let k = 0; k < 80; k++) {
    const a = k / 80 * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * 12), pz = Math.round(z + Math.sin(a) * 12);
    for (let y = NEST; y < NEST + 3; y++) g.set(px, y, pz, k % 10 === 0 ? M.OBSIDIAN : (y === NEST + 2 ? RAIL : g.get(px, y, pz)));
  }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; limb(g, x, NEST - 10, z, x + Math.cos(a) * 11, NEST - 2.5, z + Math.sin(a) * 11, 1.6, 0.9, M.OBSIDIAN); }
  // tepede bazalt kapak + buyuk mangal (isaret atesi)
  for (let y = top; y < top + 2; y++) disc(g, x + 0.5, y, z + 0.5, 2.6, M.BASALT);
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) { g.set(x + dx, top + 2, z + dz, M.FIRE); }
  out.lights.push({ x: x * VS, y: (top + 3.5) * VS, z: z * VS, color: 0xff7a2a, intensity: 11, distance: 15, voxR: 2 });
  g.block(x, z, 30);
}

// ---------------------------------------------------------------- dogal doku
function basaltFields(g) {
  // bazalt sutun kumeleri: ortasi yuksek, kenarlara dogru alcalan altigen sutunlar (siper + basamak)
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 900 && n < 8; t++) {
    const x = 26 + rng() * (g.sx - 52), z = 26 + rng() * (g.sz - 52);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || g.lava(x, z) < 15) continue;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 48 || Math.hypot(x - POND[0], z - POND[1]) < 36) continue;
    const R = 7 + rng() * 5;
    if (!g.free(x, z, R + 4)) continue;
    const hmax = 6 + rng() * 8;
    const sp = 3.7;
    for (let q = -4; q <= 4; q++) for (let r = -4; r <= 4; r++) {
      const px = x + sp * (q + r * 0.5), pz = z + sp * r * 0.866;
      const d = Math.hypot(px - x, pz - z);
      if (d > R) continue;
      const gy = Math.min(g.h(px - 1, pz - 1), g.h(px + 1, pz + 1));
      const hgt = Math.round(hmax * Math.pow(1 - d / R, 0.7) + rng() * 2.2);
      if (hgt < 1) continue;
      hexColumn(g, px, pz, gy - 2, gy + hgt, 1.95, M.BASALT);
    }
    g.block(x, z, R + 2);
    n++;
  }
}

function obsidianClusters(g) {
  // egik, sivri obsidyen kristal kumeleri (siper); dipte obsidyen cakil
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 1400 && n < 16; t++) {
    const x = 22 + rng() * (g.sx - 44), z = 22 + rng() * (g.sz - 44);
    const c = (x | 0) + g.sx * (z | 0);
    const zn = g.zone[c];
    if ((zn !== 0 && zn !== 2 && zn !== 4) || g.lava(x, z) < 9) continue;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 44 || Math.hypot(x - POND[0], z - POND[1]) < 36) continue;
    if (!g.free(x, z, 6)) continue;
    const k = 3 + Math.floor(rng() * 4);
    const scale = 0.6 + rng() * 0.7;
    for (let i = 0; i < k; i++) {
      const bx = x + (rng() - 0.5) * 5, bz = z + (rng() - 0.5) * 5;
      const gy = g.h(bx, bz);
      const hgt = (7 + rng() * 11) * scale;
      const lean = 0.25 + rng() * 0.35;
      const a = rng() * Math.PI * 2;
      limb(g, bx, gy - 1, bz, bx + Math.cos(a) * hgt * lean, gy + hgt, bz + Math.sin(a) * hgt * lean, (1.3 + rng() * 1.2) * scale + 0.4, 0.35, M.OBSIDIAN);
    }
    rockBlob(g, x, g.h(x, z) - 0.5, z, 3.2, 1.4, 3.2, M.OBSIDIAN);
    g.block(x, z, 5);
    n++;
  }
}

function cliffSpikes(g) {
  // ucurum tepesinde siyah diken siluetleri
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
    if (!g.free(x, z, 4)) continue;
    const gy = g.h(x, z);
    const hgt = 6 + rng() * 14;
    const a = rng() * Math.PI * 2, lean = 0.1 + rng() * 0.35;
    limb(g, x, gy - 1, z, x + Math.cos(a) * hgt * lean, gy + hgt, z + Math.sin(a) * hgt * lean, 1.6 + rng() * 1.6, 0.35, rng() < 0.6 ? M.OBSIDIAN : M.BASALT);
    g.block(x, z, 3);
    n++;
  }
}

function fissures(g) {
  // lav kenarina yakin kul zeminde ince, akkor magma catlaklari (yuruyerek gecilir, oldurmez)
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 600 && n < 14; t++) {
    let x = 20 + rng() * (g.sx - 40), z = 20 + rng() * (g.sz - 40);
    const d0 = g.lava(x, z);
    if (d0 < 6 || d0 > 40 || g.zone[(x | 0) + g.sx * (z | 0)] === 5) continue;
    if (!g.free(x, z, 2)) continue;
    let a = rng() * Math.PI * 2;
    const L = 8 + rng() * 16;
    for (let s = 0; s < L; s++) {
      a += (rng() - 0.5) * 0.7;
      x += Math.cos(a); z += Math.sin(a);
      const X = x | 0, Z = z | 0;
      if (X < 4 || Z < 4 || X >= g.sx - 4 || Z >= g.sz - 4) break;
      const top = g.h(X, Z) - 1;
      const m = g.get(X, top, Z);
      if (m !== M.ASH && m !== M.SCORIA) continue;
      if (g.get(X, top + 1, Z) !== 0) continue;
      g.set(X, top, Z, M.MAGMA);
    }
    n++;
  }
}

function vents(g, out) {
  // fumaroller: curuf tepecikleri, ortasinda akkor delik; oyun ici duman tutar (fx/lava.js)
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 600 && n < 5; t++) {
    const x = 30 + rng() * (g.sx - 60), z = 30 + rng() * (g.sz - 60);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || g.lava(x, z) < 14 || Math.hypot(x - OAK[0], z - OAK[1]) < 40) continue;
    if (!g.free(x, z, 6)) continue;
    const gy = g.h(x, z);
    rockBlob(g, x, gy - 0.5, z, 4.2, 2.6, 4.2, M.SCORIA);
    const X = x | 0, Z = z | 0;
    let top = gy + 2;
    while (top > gy - 3 && g.get(X, top, Z) === 0) top--;
    for (let y = top - 1; y <= top + 1; y++) g.set(X, y, Z, 0);
    g.set(X, top - 2, Z, M.MAGMA);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.get(X + dx, top - 1, Z + dz)) g.set(X + dx, top - 1, Z + dz, M.MAGMA);
    out.vents.push([(X + 0.5) * VS, (top - 1) * VS, (Z + 0.5) * VS]);
    g.block(x, z, 5);
    n++;
  }
}

// ---------------------------------------------------------------- pedler
function flatten(g, x0, z0, x1, z1, y) {
  const keep = new Set([M.BASALT_BRICK, M.GRATE, M.STEEL, M.RUST]);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    for (let yy = y; yy < y + 14; yy++) if (!keep.has(g.get(x, yy, z))) g.set(x, yy, z, 0);
    for (let yy = 2; yy < y; yy++) if (g.get(x, yy, z) === 0) g.set(x, yy, z, M.BASALT);
    g.set(x, y - 1, z, M.ASH);
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
    g.set(x, y, z, M.BASALT);
  }
  out.pads.push({ x: px * VS, y: y * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
  g.block(px, pz, 8);
}

function planPads(g) {
  const [x, z] = OAK;
  const plan = [];
  // kulenin dort kosegeninden gozetleme yerine
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    plan.push([x + Math.cos(a) * 44, z + Math.sin(a) * 44, x + Math.cos(a) * 7.5, NEST, z + Math.sin(a) * 7.5]);
  }
  // bazalt kulelere: guvertenin merdiven boslugu disindaki guneydogu kosesine
  plan.push([TH_N[0] + 30, TH_N[1] + 22, TH_N[0] + 9, DECK_N, TH_N[1] + 9, 3.5]);
  plan.push([TH_W[0] + 20, TH_W[1] + 40, TH_W[0] + 9, DECK_W, TH_W[1] + 9, 3.5]);
  plan.push([TH_E[0] + 34, TH_E[1] + 4, TH_E[0] + 9, DECK_E, TH_E[1] + 9, 3.5]);
  for (const [px, pz, tx, , tz] of plan) {
    const L = Math.hypot(tx - px, tz - pz);
    for (let d = 0; d <= L; d += 3) g.block(px + (tx - px) * d / L, pz + (tz - pz) * d / L, 7);
  }
  return plan;
}

// ped yorungeleri dikenlerin / payandalarin icinden gecerken koridor ac
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
        if ((m === M.OBSIDIAN || m === M.MAGMA) && Y > DECK_OAK + 8) {
          const r = Math.hypot(X + 0.5 - OAK[0], Z + 0.5 - OAK[1]);
          if (r > 7 && r < 34) g.set(X, Y, Z, 0);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- ogeler, dogma noktalari
const P = (g, x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

function placeItems(g, out) {
  const [ox, oz] = OAK;
  out.items.push({ type: 'quad', ...P(g, ox + 5, NEST, oz + 5) });
  // MEGA: lav goletinin ortasindaki adada (atlayarak; botlar gitmez)
  out.items.push({ type: 'mega', ...P(g, ISLET[0], LY + 3, ISLET[1]), noBots: true });
  out.items.push({ type: 'armor', ...P(g, ox + 14, DECK_OAK, oz - 14) });
  out.items.push({ type: 'ammo', ...P(g, ox - 16, DECK_OAK, oz - 16) });
  out.items.push({ type: 'health', ...P(g, ox - 16, DECK_OAK, oz + 16) });
  out.items.push({ type: 'armor', ...P(g, TH_N[0] - 6, DECK_N, TH_N[1] - 6) });
  out.items.push({ type: 'ammo', ...P(g, TH_W[0] - 5, DECK_W, TH_W[1] - 4) });
  out.items.push({ type: 'health', ...P(g, TH_E[0] - 10, DECK_E, TH_E[1] + 10) });
  if (g.stand) out.items.push({ type: 'armor', ...P(g, g.stand.x, g.stand.deckY, g.stand.z) });
  // zemindeki ogeler: golet kiyisi, ovalar
  const ground = [[ox, oz + 34, 'health'], [96, 70, 'health'], [236, 64, 'ammo'], [250, 248, 'health'], [140, 250, 'ammo'], [26, 112, 'ammo'], [122, 222, 'health'], [194, 182, 'health']];
  for (const [x, z, type] of ground) {
    const p = findGround(g, x, z, 12);
    if (p) out.items.push({ type, ...P(g, p[0], p[1], p[2]) });
  }
}

// (x,z) cevresinde lavdan uzak, duz ve bos zemin bul
function findGround(g, x, z, R = 8, minLava = 7) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    if (X < 6 || Z < 6 || X >= g.sx - 6 || Z >= g.sz - 6) continue;
    const y = g.h(X, Z);
    if (y <= LY + 2 || g.get(X, y - 1, Z) === 0 || g.lava(X, Z) < minLava) continue;
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
  // zemin: arenaya yayilmis, lavdan uzak adaylar; birbirinden uzak secilir
  const cands = [];
  for (let z = 26; z < g.sz - 26; z += 9) for (let x = 26; x < g.sx - 26; x += 9) {
    const c = x + g.sx * z;
    if (g.zone[c] !== 0 && g.zone[c] !== 4) continue;
    if (g.lava(x, z) < 14 || Math.hypot(x - ox, z - oz) < 26) continue;
    if (out.pads.some((p) => Math.hypot(p.x / VS - x, p.z / VS - z) < 10)) continue;
    const p = findGround(g, x, z, 3, 14);
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

// ---------------------------------------------------------------- lav verileri (fx/lava.js, oyun kurallari)
// mask: lav olabilecek kolonlar (1 bayt/kolon). Ilk lav kolonlari (yatak/golet tabani lav seviyesinin
// altinda) MASK_DIL kadar genisletilir: kiyida lav seviyesinin altina inen krater lavla dolar.
// tex: 0.5 m hucreli RGBA8 (RG akis yonu, B sicaklik = kiyiya uzaklik, A lav), glow: 0.5 m hucreli
// yakinlik (voxel golgelendiricisindeki lav isigi), points: parcacik icin lav yuzeyi noktalari (m).
function lavaData(g) {
  const sx = g.sx, sz = g.sz;
  const core = new Uint8Array(sx * sz);
  for (let i = 0; i < sx * sz; i++) if (g.lavaD[i] === 0) core[i] = 1;
  const mask = new Uint8Array(sx * sz);
  for (let i = 0; i < sx * sz; i++) if (g.lavaD[i] <= MASK_DIL) mask[i] = 1;
  // lav icinde kiyiya uzaklik (sicaklik: kenarlarda kabuk)
  const inD = new Float32Array(sx * sz);
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    if (!core[c]) continue;
    let d = 6;
    for (let r = 1; r <= 6 && d === 6; r++) {
      for (let k = -r; k <= r && d === 6; k++) {
        if (!isCore(x + k, z - r) || !isCore(x + k, z + r) || !isCore(x - r, z + k) || !isCore(x + r, z + k)) d = r;
      }
    }
    inD[c] = d;
  }
  function isCore(x, z) { return x >= 0 && z >= 0 && x < sx && z < sz && core[x + sx * z] === 1; }
  const cell = 2, W = sx / cell, Hh = sz / cell;
  const tex = new Uint8Array(W * Hh * 4);
  const glow = new Uint8Array(W * Hh);
  const pts = [];
  const [pcx, pcz] = POND;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const x = i * cell + 1, z = j * cell + 1;
    const c = x + sx * z;
    const o = (j * W + i) * 4;
    let fx = 0, fz = 0;
    if (g.zone[c] === 3 || g.zone[c] === 4 || g.zone[c] === 6) {
      // golet: yavas girdap + dereden gelen akis
      const rx = x - pcx, rz = z - pcz, rl = Math.hypot(rx, rz) || 1;
      fx = -rz / rl * 0.18 + 0.12; fz = rx / rl * 0.18;
    } else if (g.creekD[c] < BANK_R) {
      const sp = 0.55 + 0.45 * (1 - Math.min(1, g.creekD[c] / CREEK_R));
      fx = g.creekT[c * 2] * sp; fz = g.creekT[c * 2 + 1] * sp;
    }
    tex[o] = Math.round((0.5 + 0.5 * Math.max(-1, Math.min(1, fx))) * 255);
    tex[o + 1] = Math.round((0.5 + 0.5 * Math.max(-1, Math.min(1, fz))) * 255);
    tex[o + 2] = Math.round(Math.min(1, inD[c] / 5) * 255);
    tex[o + 3] = core[c] ? 255 : 0;
    // yakinlik: 3 m icindeki lav miktari
    let s = 0, wsum = 0;
    for (let dz = -12; dz <= 12; dz += 2) for (let dx = -12; dx <= 12; dx += 2) {
      const X = x + dx, Z = z + dz;
      const d = Math.hypot(dx, dz);
      if (d > 12) continue;
      const wgt = (1 - d / 12) * (1 - d / 12);
      wsum += wgt;
      if (isCore(X, Z)) s += wgt;
    }
    glow[j * W + i] = Math.round(Math.min(1, s / wsum * 2.6) * 255);
    if (core[c] && inD[c] >= 1.5) pts.push((x + 0.5) * VS, (z + 0.5) * VS);
  }
  return {
    y: LY * VS, level: LY, mask, width: sx, height: sz,
    tex: { data: tex, width: W, height: Hh },
    glow: { data: glow, width: W, height: Hh },
    points: new Float32Array(pts),
    size: [sx * VS, sz * VS],
  };
}

// lav isiklari: golet ortasi + dere boyunca uc nokta (magara agzi dahil); statik isik yuvalarini doldurur
function lavaLights(g, out) {
  const L = out.lava.y;
  out.lights.push({ x: (POND[0] + 0.5) * VS, y: L + 1.3, z: (POND[1] + 0.5) * VS, color: 0xff6a1e, intensity: 7, distance: 12 });
  const pts = g.creekPts;
  for (const f of [0.05, 0.42, 0.74]) {
    const [x, z] = pts[Math.floor(pts.length * f)];
    out.lights.push({ x: (x + 0.5) * VS, y: L + 1.0, z: (z + 0.5) * VS, color: 0xff6a1e, intensity: 4.2, distance: 9 });
  }
}
