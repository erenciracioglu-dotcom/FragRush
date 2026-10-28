// Ay Ussu haritasi: buyuk bir kraterin tabaninda, cam kubbelerden kurulu bir us. Dusuk yercekimi (normalin
// ~0.35 kati), sert alcak gunes, yildizli siyah gok, gokte yarisi aydinlik Dunya.
// Yerlesim: dort cam kubbe (sera, komuta, yasam, laboratuvar), aralarinda basincli tup koridorlar; kubbelerin
// arasindaki avluda iletisim kulesi (tepesindeki canakta KIYAMET kuresi, avludaki pedlerle cikilir, dogu
// yuzundeki basamaklarla orta yukseklige tirmanilir). Kuzeyde gunes paneli tarlasi, doguda haritayi kesen dar
// kanyon (rille) ve uzerindeki kopru, kanyonun otesinde inis pisti ve inis araci; konteynerler, gezici arac,
// yakit tanklari, irili ufakli kraterler, kayalar.
// Basincli hacimler: her kubbe (giris koridorlari dahil) ve her tup ayri bir hacim. Kapilarda kuvvet alani
// zarlari: aktorler ve mermiler gecer, hava gecmez (fx/moon.js). Hacimlerin ici / kabugu / disi uretimde
// sel doldurmayla bulunur (moon.volumes). Tum yerlesim voxel biriminde; donen konumlar metre.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';
import { mulberry32 } from './mapgen.js';

// dusuk yercekimi: ziplama ~2.75 m (zaman ~1.7 sn), azami dusus hizi, atilmanin yukari hizi
export const MOON_PHYS = { gravity: 7.7, move: { jumpVel: 6.5, maxFallSpeed: 30, dashUp: 1.3 } };
const G0 = 14;                      // regolit yuzeyi: ilk bos voxel (3.5 m)
const CEIL = 28;                    // m: yumusak tavan (mover.js)

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
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

// ---------------------------------------------------------------- yerlesim (voxel)
// kubbeler: merkez, dis yaricap R, gevde halkasi yuksekligi; doors: dis kapilarin yonleri (giris koridoru)
const DOMES = [
  { name: 'greenhouse', x: 72, z: 104, R: 28, ring: 6, doors: [[0, -1], [-1, 0]] },
  { name: 'command', x: 160, z: 104, R: 23, ring: 6, doors: [[0, -1], [1, 0]] },
  { name: 'habitat', x: 72, z: 196, R: 25, ring: 6, doors: [[-1, 0], [0, 1], [1, 0]] },
  { name: 'lab', x: 160, z: 192, R: 21, ring: 6, doors: [[0, 1], [1, 0], [-1, 0]] },
];
// tup koridorlar: iki kubbe (eksen hizali)
const TUBES = [{ a: 0, b: 1, axis: 'x' }, { a: 0, b: 2, axis: 'z' }, { a: 1, b: 3, axis: 'z' }];
const DW = 5, DH = 11, DL = 6;      // kapi / tup: ic yari genislik (|b| < DW), ic yukseklik, giris koridoru boyu
const TOWER = [116, 150];           // iletisim kulesi (avlu)
const TW = 6;                       // kule yari genisligi
const DISH_Y = G0 + 52;             // canak tabani (16.5 m): KIYAMET kuresi
const DISH_R = 13;
const LEDGE = 8;                    // kule basamaklari arasi (2 m: dusuk yercekiminde ziplanir)
const PAD = [228, 116, 266, 154];   // inis pisti (x0, z0, x1, z1)
const LANDER = [247, 135];
const CRATERS = [
  // x, z, yaricap, derinlik, kenar (voxel)
  [34, 38, 20, 7, 3], [252, 44, 24, 8, 4], [36, 254, 22, 7, 3], [172, 260, 16, 5, 2.5],
  [120, 26, 10, 4, 2], [262, 238, 14, 5, 2.5], [196, 56, 9, 3, 1.5], [104, 262, 9, 3, 1.5], [24, 150, 10, 4, 2],
];
const RILLE_Z0 = 36, RILLE_Z1 = 252, RILLE_D = 8;
const rilleX = (z) => 210 + 6 * Math.sin(z / 37 + 0.6) + 2.5 * Math.sin(z / 13 + 1.7);
const rilleW = (z) => 6.5 + 1.2 * Math.sin(z / 23 + 2.2);
const BRIDGE_Z = 128;               // kopru (z0..z0+12)
export const MOON_LAYOUT = { G0, domes: DOMES, tubes: TUBES, tower: TOWER, dishY: DISH_Y, ledge: LEDGE, pad: PAD, lander: LANDER, ceil: CEIL, rilleX, rilleW, bridgeZ: BRIDGE_Z, door: [DW, DH, DL] };

// zon: 0 duzluk, 1 krater kenari yamaci (harita siniri), 2 yikilmaz kenar, 3 kanyon tabani
class Gen {
  constructor(world, seed) {
    this.w = world; this.sx = world.sx; this.sy = world.sy; this.sz = world.sz;
    this.rng = mulberry32(seed);
    this.ns = (seed % 7919) | 0;
    this.H = new Int16Array(this.sx * this.sz);
    this.zone = new Uint8Array(this.sx * this.sz);
    this.blocked = [];
    this.memb = new Set();              // kuvvet alani zari hucreleri (hava gecmez)
    this.doors = [];                    // zar dikdortgenleri (cizim)
    this.volDefs = [];
  }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[this.idx(x, y, z)] = m; }
  soft(x, y, z, m) { if (this.in(x, y, z) && !this.w.mat[this.idx(x, y, z)]) this.w.mat[this.idx(x, y, z)] = m; }
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

export function generateMoon(world, seed = 1) {
  const g = new Gen(world, seed);
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Ay Ussu'],
    env: 'moon', quadWhere: 'quadWhereMoon',
    gravity: MOON_PHYS.gravity, move: MOON_PHYS.move, ceilY: CEIL,
    navJump: { up: 9, drop: 72 },
    moon: null,
  };
  terrain(g);
  fillColumns(g);
  for (const D of DOMES) g.block(D.x, D.z, D.R + 10);
  g.block(TOWER[0], TOWER[1], 22);
  g.block((PAD[0] + PAD[2]) / 2, (PAD[1] + PAD[3]) / 2, 26);
  scatterRocks(g);

  // us: kubbeler, giris koridorlari, tupler, ic donanim
  for (let i = 0; i < DOMES.length; i++) dome(g, DOMES[i], i);
  for (const T of TUBES) tube(g, T);
  greenhouse(g, out, DOMES[0]);
  command(g, out, DOMES[1]);
  habitat(g, out, DOMES[2]);
  lab(g, out, DOMES[3]);
  for (const T of TUBES) tubeLight(g, out, T);
  // avlu ve dis yapilar
  tower(g, out);
  solarField(g);
  bridge(g);
  landingPad(g, out);
  lander(g, out);
  containers(g, out);
  rover(g);
  fuelTanks(g);
  // pedler: avludan canaga (ucus koridorlari yapilardan sonra temizlenir)
  const ang = [Math.PI * 0.75, Math.PI * 0.25, -Math.PI * 0.5];
  // ucus canagin kenarinin (~18 m) ustunden gecer, besleme boynuzunun altina degil canagin yakin yamacina iner
  for (const a of ang) padAt(g, out, TOWER[0] + Math.cos(a) * 26, TOWER[1] - Math.sin(a) * 26, TOWER[0] + 0.5 + Math.cos(a) * 6.4, DISH_Y + 1, TOWER[1] + 0.5 - Math.sin(a) * 6.4, 5);
  carvePadPaths(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  const volumes = buildVolumes(g, out);
  out.moon = { G0, volumes, doors: g.doors, leaks: volumes.filter((v) => v.leak).map((v) => v.name) };
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- arazi
// ussun duz zemini: kubbelerin, avlunun, kulenin ve pistin cevresinde zemin G0'a duzlenir (yumusak gecis)
function flatWeight(x, z) {
  let w = 0;
  for (const D of DOMES) {
    const d = Math.hypot(x - D.x, z - D.z) - (D.R + DL + 4);
    w = Math.max(w, 1 - clamp01(d / 14));
  }
  const rect = (x0, z0, x1, z1, fall) => {
    const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
    return 1 - clamp01(Math.hypot(dx, dz) / fall);
  };
  w = Math.max(w, rect(66, 96, 166, 204, 12));            // avlu + tupler
  w = Math.max(w, rect(PAD[0] - 4, PAD[1] - 4, PAD[2] + 4, PAD[3] + 4, 14));
  return smooth(w);
}

function craterH(x, z) {
  let h = 0;
  for (const [cx, cz, r, dep, rim] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d < 1) h += -dep * (1 - d * d) + rim * Math.pow(d, 6);
    else if (d < 2.2) h += rim * Math.exp(-(((d - 1) / 0.38) ** 2));
  }
  return h;
}

// kanyon derinligi (voxel): uclarda tabandan zemine yumusak rampa
function rilleDepth(z) {
  if (z < RILLE_Z0 || z > RILLE_Z1) return 0;
  const e = Math.min(z - RILLE_Z0, RILLE_Z1 - z);
  return RILLE_D * smooth(clamp01(e / 26));
}

function terrain(g) {
  const sx = g.sx, sz = g.sz, s = g.ns;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const i = x + sx * z;
    let H = G0 + 2.8 * (fbm(x / 46, z / 46, s + 1) - 0.5) + 1.3 * (fbm(x / 13, z / 13, s + 7) - 0.5);
    H += craterH(x, z);
    const fw = flatWeight(x, z);
    H = H * (1 - fw) + G0 * fw;
    let zone = 0;
    // kanyon: dik duvarli dar yarik
    const rd = rilleDepth(z);
    if (rd > 0 && Math.abs(x + 0.5 - rilleX(z)) < rilleW(z)) { H = Math.min(H, G0 - rd); if (rd > 2) zone = 3; }
    // haritanin cevresi: buyuk kraterin duvari (ic yamac regolit / kaya, en dista yikilmaz kenar)
    const eN = z, eS = sz - 1 - z, eW = x, eE = sx - 1 - x;
    const e = Math.min(eN, eS, eW, eE);
    const k = e === eN ? 1 : e === eS ? 2 : e === eW ? 3 : 4;
    const along = k <= 2 ? x : z;
    const band = 17 + 9 * fbm(along / 27, k * 9.7, s + 11, 3);
    if (e < band) {
      const rise = (18 + 12 * fbm(along / 19, k * 3.1, s + 23, 3)) * Math.pow(smooth(1 - e / band), 1.5);
      H = Math.max(H, G0 + rise - 1);
      zone = e < 5 ? 2 : 1;
    }
    g.H[i] = Math.max(4, Math.min(g.sy - 6, Math.round(H)));
    g.zone[i] = zone;
  }
}

function fillColumns(g) {
  const w = g.w, sx = g.sx, sz = g.sz, sxz = w.sxz, mat = w.mat;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z, H = g.H[c], zone = g.zone[c];
    mat[c] = M.BEDROCK; mat[c + sxz] = M.BEDROCK;
    // yamac dikligi: komsu kolonlarla en buyuk fark
    let slope = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) slope = Math.max(slope, Math.abs(H - g.h(x + dx, z + dz)));
    for (let y = 2; y < H; y++) {
      let m;
      if (zone === 2) m = M.MCLIFF;
      else if (y < H - 6 || (zone === 1 && slope >= 3 && y < H - 1)) m = M.MROCK;
      else m = M.REGOLITH;
      mat[c + sxz * y] = m;
    }
  }
}

// kaya: gurultulu elipsoit
function rockBlob(g, cx, cy, cz, rx, ry, rz, m = M.MROCK) {
  for (let y = Math.max(2, Math.floor(cy - ry)); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
    if (dx * dx + dy * dy + dz * dz < 1 - 0.3 * hash3(x, y, z)) g.set(x, y, z, m);
  }
}

function scatterRocks(g) {
  const rng = g.rng;
  let n = 0;
  for (let t = 0; t < 900 && n < 30; t++) {
    const x = 22 + rng() * (g.sx - 44), z = 22 + rng() * (g.sz - 44);
    const c = (x | 0) + g.sx * (z | 0);
    if (g.zone[c] !== 0 || flatWeight(x, z) > 0.05) continue;
    if (Math.abs(x - rilleX(z)) < rilleW(z) + 4) continue;
    const big = rng() < 0.3;
    const r = big ? 4 + rng() * 4 : 1.8 + rng() * 2.2;
    if (!g.free(x, z, r + 3)) continue;
    const gy = g.h(x, z);
    rockBlob(g, x, gy + r * 0.2, z, r * (1 + rng() * 0.5), r * (0.6 + rng() * 0.4), r * (0.8 + rng() * 0.4));
    if (big && rng() < 0.6) rockBlob(g, x + (rng() - 0.5) * r * 1.6, gy, z + (rng() - 0.5) * r * 1.6, r * 0.55, r * 0.45, r * 0.6);
    g.block(x, z, r + 2);
    n++;
  }
}

// ---------------------------------------------------------------- kubbeler
// kubbenin icinde mi: 'in' (ic hacim), 'shell' (kabuk), 'out' (disi). Halka (y < by) silindir, ustu yarim kure.
function domeRel(D, x, y, z) {
  const by = G0 + D.ring;
  const dh = Math.hypot(x + 0.5 - (D.x + 0.5), z + 0.5 - (D.z + 0.5));
  const d = y < by ? dh : Math.hypot(dh, y + 0.5 - by);
  return d < D.R - 1 ? 'in' : d < D.R ? 'shell' : 'out';
}

function dome(g, D, idx) {
  const { x: cx, z: cz, R, ring } = D;
  const by = G0 + ring, ox = cx + 0.5, oz = cz + 0.5;
  const RIBS = 8, LAT = Math.round(R * 0.57);
  for (let z = cz - R - 1; z <= cz + R + 1; z++) for (let x = cx - R - 1; x <= cx + R + 1; x++) {
    const dh = Math.hypot(x + 0.5 - ox, z + 0.5 - oz);
    if (dh >= R) continue;
    // zemin: ic taban karo, halka altinda govde; tabanin ustu bos
    for (let y = G0; y < by + R + 1; y++) g.set(x, y, z, 0);
    for (let y = G0 - 3; y < G0; y++) g.set(x, y, z, M.REGOLITH);
    g.set(x, G0 - 1, z, dh < R - 1 ? (hash3(x >> 2, 3, z >> 2) < 0.5 ? M.TILE_A : M.TILE_B) : M.HULL);
    const phi = Math.atan2(z + 0.5 - oz, x + 0.5 - ox);
    const ribA = Math.abs(((phi / (Math.PI * 2 / RIBS)) % 1 + 1.5) % 1 - 0.5) * (Math.PI * 2 / RIBS) * dh;
    // halka duvar: tabanda govde seridi, meridyen kaburgalari arasi cam (icerdeki disaridan gorulur, cam vurulabilir)
    if (dh >= R - 1) for (let y = G0; y < by; y++) g.set(x, y, z, y === G0 || ribA < 0.75 ? M.HULL : M.GLASS);
    // yarim kure kabuk: cam, meridyen ve enlem kaburgalari, tepede govde tacı
    for (let y = by; y < by + R; y++) {
      const dy = y + 0.5 - by, d = Math.hypot(dh, dy);
      if (d < R - 1 || d >= R) continue;
      const rib = ribA < 0.75 || Math.abs(dy - LAT) < 0.75 || dh < 3.2;
      g.set(x, y, z, rib ? M.HULL : M.GLASS);
    }
  }
  // tepe: kucuk anten + isaret lambasi
  g.set(cx, by + R, cz, M.HULL); g.set(cx, by + R + 1, cz, M.STEEL); g.set(cx, by + R + 2, cz, M.LAMP);
  for (const dir of D.doors) vestibule(g, D, idx, dir);
  D.by = by;
}

// giris koridoru (hava kilidi): kubbeden disari 1.5 m'lik govde tunel, agzinda kuvvet alani zari
function vestibule(g, D, idx, [dx, dz]) {
  const { x: cx, z: cz, R } = D;
  const px = -dz, pz = dx;                   // yana dik yon
  const a0 = R - 4, a1 = R + DL;             // koridor boyu (kubbe merkezinden)
  for (let a = a0; a < a1 + 1; a++) for (let b = -DW - 1; b <= DW + 1; b++) for (let y = G0 - 1; y <= G0 + DH + 1; y++) {
    const x = cx + dx * a + px * b, z = cz + dz * a + pz * b;
    const rel = domeRel(D, x, y, z);
    const inner = Math.abs(b) < DW && y >= G0 && y < G0 + DH;
    if (a < a1) {
      if (inner) { g.set(x, y, z, 0); continue; }
      if (rel === 'in') continue;                         // kubbenin icine duvar uzatma
      if (Math.abs(b) <= DW && y >= G0 - 1 && y <= G0 + DH) g.set(x, y, z, y === G0 - 1 ? M.HULL : M.HULL);
    } else if (!inner && Math.abs(b) <= DW + 1 && y <= G0 + DH + 1) {
      // agiz cercevesi: ikaz seritli kalin govde halkasi
      g.set(x, y, z, (Math.abs(b) === DW + 1 || y === G0 + DH + 1) && ((a + b + y) & 1) ? M.HAZARD : M.HULL);
    }
  }
  // zar: koridorun son dilimi (a1 - 1), agiz cercevesinin ici
  const am = a1 - 1;
  for (let b = -DW + 1; b < DW; b++) for (let y = G0; y < G0 + DH; y++) g.memb.add(g.idx(cx + dx * am + px * b, y, cz + dz * am + pz * b));
  // agzin ustunde lamba
  g.set(cx + dx * a1, G0 + DH + 2, cz + dz * a1, M.LAMP);
  g.doors.push({ x: (cx + 0.5 + dx * (am + 0.5)) * VS, y: (G0 + DH / 2) * VS, z: (cz + 0.5 + dz * (am + 0.5)) * VS, w: (2 * DW - 1) * VS, h: DH * VS, nx: dx, nz: dz, vols: [idx] });
}

// tup koridor: iki kubbe arasinda govde tunel (yanlarda cam pencere seridi, dista kaburga halkalari)
function tube(g, T) {
  const A = DOMES[T.a], B = DOMES[T.b];
  const ax = T.axis === 'x';
  const ca = ax ? A.x : A.z, cb = ax ? B.x : B.z, cc = ax ? A.z : A.x;
  const pos = (a, b) => (ax ? [a, cc + b] : [cc + b, a]);
  for (let a = ca; a <= cb; a++) for (let b = -DW - 1; b <= DW + 1; b++) for (let y = G0 - 1; y <= G0 + DH + 1; y++) {
    const [x, z] = pos(a, b);
    const relA = domeRel(A, x, y, z), relB = domeRel(B, x, y, z);
    const inner = Math.abs(b) < DW && y >= G0 && y < G0 + DH && !(Math.abs(b) === DW - 1 && y === G0 + DH - 1);
    if (relA !== 'out' || relB !== 'out') {
      // kubbenin kabugu / ici: yalniz kabukta gecit ac
      if (inner) g.set(x, y, z, 0);
      continue;
    }
    if (inner) { g.set(x, y, z, 0); continue; }
    const rib = (a - ca) % 12 === 6;
    if (Math.abs(b) <= DW && y >= G0 - 1 && y <= G0 + DH) {
      const win = Math.abs(b) === DW && y >= G0 + 4 && y < G0 + 8 && (a % 8) !== 0 && !rib;
      g.set(x, y, z, win ? M.GLASS : M.HULL);
    } else if (rib) g.set(x, y, z, M.HULL);
  }
  // zarlar: kubbelerin dis yaricapinin hemen otesinde, tup kesitini kapatan dilim
  const ma = ca + A.R, mb = cb - B.R - 1;
  for (const am of [ma, mb]) for (let b = -DW + 1; b < DW; b++) for (let y = G0; y < G0 + DH; y++) {
    if (Math.abs(b) === DW - 1 && y === G0 + DH - 1) continue;
    const [x, z] = pos(am, b);
    g.memb.add(g.idx(x, y, z));
  }
  const ti = DOMES.length + TUBES.indexOf(T);
  for (const [am, di] of [[ma, T.a], [mb, T.b]]) {
    const [x, z] = pos(am, 0);
    g.doors.push({ x: (x + 0.5) * VS, y: (G0 + DH / 2) * VS, z: (z + 0.5) * VS, w: (2 * DW - 1) * VS, h: DH * VS, nx: ax ? 1 : 0, nz: ax ? 0 : 1, vols: [di, ti] });
  }
  T.ma = ma; T.mb = mb; T.cc = cc;
}

function tubeLight(g, out, T) {
  const ax = T.axis === 'x';
  const mid = Math.round((T.ma + T.mb) / 2);
  for (let a = T.ma + 2; a < T.mb - 1; a += 6) {
    const [x, z] = ax ? [a, T.cc] : [T.cc, a];
    g.set(x, G0 + DH - 1, z, M.LAMP);
  }
  const [x, z] = ax ? [mid, T.cc] : [T.cc, mid];
  out.lights.push({ x: (x + 0.5) * VS, y: (G0 + DH - 2) * VS, z: (z + 0.5) * VS, color: 0xdcecff, intensity: 2.6, distance: 9, voxR: 4 });
  T.light = out.lights.length - 1;
}

// ---------------------------------------------------------------- ic donanim
// kubbenin ic tabaninda (kabuktan en az 'pad' voxel iceride) bir kolon mu
function inside(D, x, z, pad = 2) { return Math.hypot(x + 0.5 - (D.x + 0.5), z + 0.5 - (D.z + 0.5)) < D.R - 1 - pad; }
// kapi / tup acikliklarina giden yolda mi (esya koyma)
function aisle(D, x, z, w = 6) {
  const dx = x - D.x, dz = z - D.z;
  const dirs = [...D.doors];
  for (const T of TUBES) {
    if (DOMES[T.a] === D) dirs.push(T.axis === 'x' ? [1, 0] : [0, 1]);
    if (DOMES[T.b] === D) dirs.push(T.axis === 'x' ? [-1, 0] : [0, -1]);
  }
  for (const [ux, uz] of dirs) {
    const along = dx * ux + dz * uz, across = Math.abs(-dx * uz + dz * ux);
    if (along > 2 && across < w) return true;
  }
  return false;
}

function greenhouse(g, out, D) {
  const { x: cx, z: cz } = D;
  // ortada agac: kalin govde, genis yaprak tacı (alti yurunur), dibinde MEGA
  for (let y = G0; y < G0 + 15; y++) {
    const r = 1.3 + (y < G0 + 2 ? 0.8 : 0);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) <= r) g.set(cx + dx, y, cz + dz, M.BARK);
  }
  for (let y = G0 + 11; y < G0 + 25; y++) for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) {
    const e = (dx * dx + dz * dz) / 64 + ((y - G0 - 17.5) ** 2) / 36;
    if (e > 1 - 0.35 * hash3((cx + dx) >> 1, y >> 1, (cz + dz) >> 1)) continue;
    g.soft(cx + dx, y, cz + dz, hash3(cx + dx, y, cz + dz) < 0.12 ? M.FLOWER : M.PLANT);
  }
  // halka tarhlar (iki sira), koridor yonlerinde gecit
  for (let z = cz - D.R; z <= cz + D.R; z++) for (let x = cx - D.R; x <= cx + D.R; x++) {
    const dh = Math.hypot(x - cx, z - cz);
    const ring = (dh >= 8 && dh < 11) || (dh >= 15.5 && dh < 18.5);
    if (!ring || !inside(D, x, z, 3) || aisle(D, x, z, 5)) continue;
    const a = Math.atan2(z - cz, x - cx);
    if (Math.abs(((a / (Math.PI / 3)) % 1 + 1.5) % 1 - 0.5) < 0.06) continue;   // ara gecitler
    g.set(x, G0, z, M.HULL); g.set(x, G0 + 1, z, M.DIRT); g.set(x, G0 + 2, z, M.DIRT);
    if (hash3(x, 9, z) < 0.8) g.set(x, G0 + 3, z, M.PLANT);
    if (hash3(x, 11, z) < 0.35) g.set(x, G0 + 4, z, hash3(x, 13, z) < 0.3 ? M.FLOWER : M.PLANT);
  }
  // buyume lambalari: camin icinde, 3.5 m yukseklikte halka (kabuga yaslanir)
  const ly = G0 + 14, rr = Math.sqrt((D.R - 1) ** 2 - (ly + 0.5 - (G0 + D.ring)) ** 2) - 1.5;
  for (let k = 0; k < 360; k++) {
    const a = k / 360 * Math.PI * 2;
    if (Math.abs(((a / (Math.PI / 4)) % 1 + 1.5) % 1 - 0.5) > 0.18) continue;
    const x = Math.floor(cx + 0.5 + Math.cos(a) * rr), z = Math.floor(cz + 0.5 + Math.sin(a) * rr);
    g.set(x, ly, z, M.GROW);
    for (let yy = ly + 1; yy < G0 + 40 && !g.get(x, yy, z); yy++) g.set(x, yy, z, M.STEEL);   // tavana askı
  }
  out.lights.push({ x: (cx + 0.5) * VS, y: (G0 + 13) * VS, z: (cz + 0.5) * VS, color: 0xff5ad8, intensity: 9, distance: 17, voxR: 0 });
  D.light = out.lights.length - 1;
  // su tanklari
  for (const [ox, oz] of [[-15, 15], [15, 15]]) {
    const tx = cx + ox, tz = cz + oz;
    if (aisle(D, tx, tz, 7)) continue;
    for (let y = G0; y < G0 + 9; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) < 2.4) g.set(tx + dx, y, tz + dz, y === G0 + 4 ? M.STEEL : M.HULL);
  }
}

function command(g, out, D) {
  const { x: cx, z: cz } = D;
  // orta harita masasi: govde silindir, ust kenarda ekran bandi
  for (let y = G0; y < G0 + 4; y++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const d = Math.hypot(dx, dz);
    if (d >= 4.3) continue;
    g.set(cx + dx, y, cz + dz, y === G0 + 3 && d >= 3.1 ? M.SCREEN : M.HULL);
  }
  // duvar konsollari: kabuga 2 voxel mesafede masa + dik ekran
  for (let z = cz - D.R; z <= cz + D.R; z++) for (let x = cx - D.R; x <= cx + D.R; x++) {
    const dh = Math.hypot(x - cx, z - cz);
    if (dh < D.R - 7 || dh >= D.R - 4 || aisle(D, x, z, 6)) continue;
    const a = Math.atan2(z - cz, x - cx);
    if (Math.abs(((a / (Math.PI / 4)) % 1 + 1.5) % 1 - 0.5) < 0.08) continue;
    for (let y = G0; y < G0 + 3; y++) g.set(x, y, z, M.HULL);
    if (dh >= D.R - 5) for (let y = G0 + 3; y < G0 + 8; y++) g.set(x, y, z, y === G0 + 3 ? M.HULL : M.SCREEN);
  }
  // sandalyeler
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.3, r = 7.5;
    const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
    if (aisle(D, x, z, 4)) continue;
    g.set(x, G0, z, M.STEEL); g.set(x, G0 + 1, z, M.METAL);
  }
  out.lights.push({ x: (cx + 0.5) * VS, y: (G0 + 9) * VS, z: (cz + 0.5) * VS, color: 0x44d8ff, intensity: 5, distance: 13, voxR: 0 });
  D.light = out.lights.length - 1;
}

function habitat(g, out, D) {
  const { x: cx, z: cz } = D;
  // ortada yemek masasi + taburelar
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (Math.hypot(dx, dz) > 3.2) continue;
    g.set(cx + dx, G0 + 3, cz + dz, M.HULL);
  }
  g.box(cx, G0, cz, cx + 1, G0 + 3, cz + 1, M.STEEL);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const x = Math.round(cx + Math.cos(a) * 5), z = Math.round(cz + Math.sin(a) * 5); g.set(x, G0, z, M.STEEL); g.set(x, G0 + 1, z, M.WOOD); }
  // ranzalar: kuzey ve guney yaylarda, kabuga paralel
  for (const side of [-1, 1]) for (let k = -1; k <= 1; k++) {
    const bx = cx + k * 9 - 3, bz = cz + side * 15 - (side > 0 ? 3 : 0);
    if (!inside(D, bx, bz, 2) || !inside(D, bx + 6, bz + 3, 2) || aisle(D, bx + 3, bz + 1, 6)) continue;
    g.box(bx, G0, bz, bx + 7, G0 + 9, bz + 4, M.HULL);
    g.box(bx + 1, G0 + 1, bz, bx + 6, G0 + 4, bz + 4, 0);
    g.box(bx + 1, G0 + 5, bz, bx + 6, G0 + 8, bz + 4, 0);
    g.box(bx + 1, G0 + 1, bz + (side > 0 ? 0 : 1), bx + 6, G0 + 2, bz + (side > 0 ? 3 : 4), M.CONCRETE_RED);
    g.box(bx + 1, G0 + 5, bz + (side > 0 ? 0 : 1), bx + 6, G0 + 6, bz + (side > 0 ? 3 : 4), M.CONCRETE_RED);
  }
  // dolaplar (bati yay) ve mutfak tezgahi (dogu yay)
  for (let k = -2; k <= 2; k++) { const x = cx - 18, z = cz + k * 3; if (inside(D, x, z, 1) && !aisle(D, x, z, 5)) g.box(x, G0, z, x + 2, G0 + 8, z + 2, M.METAL); }
  for (let k = -3; k <= 3; k++) {
    const x = cx + 18, z = cz + k * 2;
    if (!inside(D, x, z, 1) || aisle(D, x, z, 5)) continue;
    g.box(x, G0, z, x + 2, G0 + 4, z + 2, M.HULL);
    if (k === 0) g.set(x, G0 + 4, z, M.LAMP);
  }
  // tavan lambalari (kaburgaya asili)
  out.lights.push({ x: (cx + 0.5) * VS, y: (G0 + 12) * VS, z: (cz + 0.5) * VS, color: 0xffd6a0, intensity: 6, distance: 15, voxR: 0 });
  D.light = out.lights.length - 1;
}

function lab(g, out, D) {
  const { x: cx, z: cz } = D;
  // laboratuvar tezgahlari: iki sira, ustlerinde cam numune tupleri
  for (const oz of [-8, 6]) for (const ox of [-8, 3]) {
    const x0 = cx + ox, z0 = cz + oz;
    if (!inside(D, x0, z0, 2) || !inside(D, x0 + 6, z0 + 3, 2) || aisle(D, x0 + 3, z0 + 1, 5)) continue;
    g.box(x0, G0, z0, x0 + 7, G0 + 4, z0 + 3, M.HULL);
    for (let k = 0; k < 7; k += 2) { g.set(x0 + k, G0 + 4, z0 + 1, M.GLASS); g.set(x0 + k, G0 + 5, z0 + 1, M.GLASS); }
  }
  // ortada ay kayasi numunesi (kaide ustunde) + buyuk ekran
  g.box(cx - 1, G0, cz - 1, cx + 2, G0 + 3, cz + 2, M.HULL);
  rockBlob(g, cx + 0.5, G0 + 4.2, cz + 0.5, 1.6, 1.3, 1.5, M.MROCK);
  const sx0 = cx - 4, sz0 = cz - D.R + 6;
  if (!aisle(D, cx, sz0, 6)) g.box(sx0, G0 + 2, sz0, sx0 + 9, G0 + 8, sz0 + 1, M.SCREEN);
  out.lights.push({ x: (cx + 0.5) * VS, y: (G0 + 10) * VS, z: (cz + 0.5) * VS, color: 0xd8ecff, intensity: 5, distance: 13, voxR: 0 });
  D.light = out.lights.length - 1;
}

// ---------------------------------------------------------------- iletisim kulesi
function tower(g, out) {
  const [tx, tz] = TOWER;
  const x0 = tx - TW, x1 = tx + TW, z0 = tz - TW, z1 = tz + TW;
  const top = DISH_Y - 2;
  // dort kose ayagi + capraz baglantilar (her yuz)
  for (const [lx, lz] of [[x0, z0], [x1 - 2, z0], [x0, z1 - 2], [x1 - 2, z1 - 2]]) g.box(lx, G0 - 1, lz, lx + 2, top, lz + 2, M.STEEL);
  for (let y = G0 + 4; y < top - 2; y += 10) {
    for (let k = 0; k < 10; k++) {
      const yy = y + k, t = k / 10;
      const u = Math.round(x0 + 1 + t * (x1 - x0 - 3)), v = Math.round(x1 - 2 - t * (x1 - x0 - 3));
      for (const zz of [z0, z1 - 1]) { g.soft(u, yy, zz, M.GRATE); g.soft(v, yy, zz, M.GRATE); }
      const p = Math.round(z0 + 1 + t * (z1 - z0 - 3)), q = Math.round(z1 - 2 - t * (z1 - z0 - 3));
      for (const xx of [x0, x1 - 1]) { g.soft(xx, yy, p, M.GRATE); g.soft(xx, yy, q, M.GRATE); }
    }
  }
  // dogu yuzunde basamaklar: 2 m arayla sirayla kuzey / guney yarida (dusuk yercekiminde ziplanir)
  g.ledges = [];
  for (let k = 1; k <= 5; k++) {
    const y = G0 + k * LEDGE;
    const za = k % 2 ? z0 : tz, zb = k % 2 ? tz : z1;
    g.box(x1, y - 1, za, x1 + 6, y, zb, M.GRATE);
    // dis korkuluk (ziplama yonunu kapatmasin diye yalniz dis kenar)
    for (let z = za; z < zb; z++) if ((z & 1) === 0) g.set(x1 + 5, y, z, M.STEEL);
    g.ledges.push([x1 + 3, y, (za + zb) >> 1]);
  }
  // canak alti platform + canak (paraboloit), ortasi duz
  g.box(x0, top, z0, x1, top + 1, z1, M.STEEL);
  for (let dz = -DISH_R; dz <= DISH_R; dz++) for (let dx = -DISH_R; dx <= DISH_R; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > DISH_R) continue;
    const ys = DISH_Y - 1 + Math.round((Math.max(0, d - 3) / (DISH_R - 3)) ** 2 * 6);
    for (let y = ys - 1; y <= ys; y++) g.set(tx + dx, y, tz + dz, d > DISH_R - 1 ? M.STEEL : M.HULL);
  }
  // besleme boynuzu: kenardan uc destek, tepede kutu + kirmizi isaret lambasi
  const hy = DISH_Y + 13;
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + k * Math.PI * 2 / 3;
    const ax = tx + 0.5 + Math.cos(a) * (DISH_R - 1), az = tz + 0.5 + Math.sin(a) * (DISH_R - 1), ay = DISH_Y + 6;
    for (let s = 0; s <= 40; s++) {
      const t = s / 40;
      g.set(Math.floor(ax + (tx + 0.5 - ax) * t), Math.floor(ay + (hy - ay) * t), Math.floor(az + (tz + 0.5 - az) * t), M.STEEL);
    }
  }
  g.box(tx - 1, hy, tz - 1, tx + 2, hy + 3, tz + 2, M.HULL);
  g.set(tx, hy + 3, tz, M.NEON_ORANGE);
  out.lights.push({ x: (tx + 0.5) * VS, y: (hy + 4.5) * VS, z: (tz + 0.5) * VS, color: 0xff3a20, intensity: 4, distance: 11, voxR: 2 });
  out.beacon = out.lights.length - 1;
  g.dish = { x: tx, z: tz, y: DISH_Y };
}

// ---------------------------------------------------------------- dis yapilar
// gunes paneli tarlasi: uc sira egik panel (2-3 m yukseklikte: alti yurunur), celik direkler
function solarField(g) {
  for (const zc of [34, 50, 66]) for (let x0 = 82; x0 < 180; x0 += 24) {
    const x1 = x0 + 20;
    if (!g.free((x0 + x1) / 2, zc, 6)) continue;
    let gy = G0;
    for (let x = x0; x < x1; x++) gy = Math.max(gy, g.h(x, zc));
    for (let x = x0; x < x1; x++) for (let k = 0; k < 8; k++) {
      const z = zc - 4 + k, y = gy + 8 + (k >> 1);
      g.set(x, y, z, M.SOLAR);
      g.set(x, y - 1, z, M.STEEL);
    }
    for (const x of [x0, x1 - 1]) for (const z of [zc - 4, zc + 3]) for (let y = g.h(x, z) - 1; y < gy + 8 + (z > zc ? 3 : 0); y++) g.set(x, y, z, M.STEEL);
    g.block((x0 + x1) / 2, zc, 10);
  }
}

// kanyonun ustunden pist tarafina celik kopru (izgara guverte, korkuluklar)
function bridge(g) {
  const z0 = BRIDGE_Z, z1 = BRIDGE_Z + 12;
  let xa = 1e9, xb = -1e9;
  for (let z = z0; z < z1; z++) { xa = Math.min(xa, Math.floor(rilleX(z) - rilleW(z)) - 3); xb = Math.max(xb, Math.ceil(rilleX(z) + rilleW(z)) + 3); }
  for (let x = xa; x <= xb; x++) for (let z = z0; z < z1; z++) {
    for (let y = G0; y < G0 + 10; y++) g.set(x, y, z, 0);
    g.set(x, G0 - 1, z, M.GRATE);
    if (z === z0 || z === z1 - 1) { g.set(x, G0 - 2, z, M.STEEL); g.set(x, G0 + 3, z, M.STEEL); if ((x & 3) === 0) for (let y = G0; y < G0 + 3; y++) g.set(x, y, z, M.STEEL); }
  }
  g.block((xa + xb) / 2, (z0 + z1) / 2, 10);
}

function landingPad(g, out) {
  const [x0, z0, x1, z1] = PAD;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    for (let y = G0; y < G0 + 12; y++) if (g.get(x, y, z) === M.REGOLITH || g.get(x, y, z) === M.MROCK) g.set(x, y, z, 0);
    const edge = x < x0 + 2 || x >= x1 - 2 || z < z0 + 2 || z >= z1 - 2;
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    const ring = r > 13.3 && r < 15;
    g.set(x, G0 - 1, z, edge || ring ? M.HAZARD : M.CONCRETE_DARK);
    g.set(x, G0 - 2, z, M.CONCRETE_DARK);
  }
  // kose lambalari
  for (const [x, z] of [[x0, z0], [x1 - 1, z0], [x0, z1 - 1], [x1 - 1, z1 - 1]]) { g.set(x, G0, z, M.STEEL); g.set(x, G0 + 1, z, M.LAMP); }
}

// inis araci: altin folyolu sekizgen alt kat dort bacak ustunde, ustte govde kabin, on yuzde sahanlik ve basamaklar
function lander(g, out) {
  const [cx, cz] = LANDER;
  // alt kat
  for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) {
    if (Math.abs(dx) + Math.abs(dz) > 13) continue;
    for (let y = G0 + 6; y < G0 + 11; y++) g.set(cx + dx, y, cz + dz, M.FOIL);
    g.set(cx + dx, G0 + 11, cz + dz, M.GRATE);
  }
  // bacaklar + ayak tabanlari
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const x = Math.round(cx + sx * (7 + 6 * t)), z = Math.round(cz + sz * (7 + 6 * t)), y = Math.round(G0 + 8 - 8 * t);
      g.box(x, y, z, x + 2, y + 2, z + 2, M.STEEL);
    }
    const fx = cx + sx * 13 + 1, fz = cz + sz * 13 + 1;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) < 2.6) g.set(fx + dx, G0, fz + dz, M.HULL);
  }
  // ust kabin (pist merkezine bakan on yuz: -x), pencereler, anten
  g.box(cx - 5, G0 + 12, cz - 5, cx + 5, G0 + 20, cz + 5, M.HULL);
  g.box(cx - 6, G0 + 15, cz - 3, cx - 5, G0 + 18, cz + 3, M.SOLAR);
  for (const [qx, qz] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) g.box(cx + qx - 1, G0 + 17, cz + qz - 1, cx + qx + 1, G0 + 18, cz + qz + 1, M.METAL);
  for (let y = G0 + 20; y < G0 + 25; y++) g.set(cx + 2, y, cz + 2, M.STEEL);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) <= 2.2) g.set(cx + 2 + dx, G0 + 25 + (Math.hypot(dx, dz) > 1.4 ? 1 : 0), cz + 2 + dz, M.HULL);
  // on sahanlik ve basamaklar (2 m: ziplanir)
  g.box(cx - 14, G0 + 10, cz - 2, cx - 9, G0 + 11, cz + 3, M.GRATE);
  g.box(cx - 20, G0, cz - 2, cx - 15, G0 + 5, cz + 3, M.HULL);
  g.box(cx - 20, G0 + 5, cz - 2, cx - 15, G0 + 6, cz + 3, M.HAZARD);
  out.lights.push({ x: (cx - 11) * VS, y: (G0 + 14) * VS, z: (cz + 0.5) * VS, color: 0xffb040, intensity: 4, distance: 12, voxR: 0 });
  g.landerTop = [cx - 11, G0 + 11, cz];
}

// konteynerler (2.25 m: ziplanip cikilir); bazilari ikili ust uste
function container(g, x0, z0, along, m0, y0 = null) {
  const L = 22, W = 10, H = 9;
  const [lx, lz] = along === 'x' ? [L, W] : [W, L];
  let gy = y0;
  if (gy == null) { gy = 0; for (let z = z0; z < z0 + lz; z++) for (let x = x0; x < x0 + lx; x++) gy = Math.max(gy, g.h(x, z)); }
  for (let z = z0; z < z0 + lz; z++) for (let x = x0; x < x0 + lx; x++) for (let y = gy; y < gy + H; y++) {
    const u = along === 'x' ? x - x0 : z - z0;
    const end = u === 0 || u === L - 1;
    const band = y === gy + H - 2;
    g.set(x, y, z, end ? M.METAL : band ? M.HAZARD : ((u >> 1) & 1 ? m0 : M.HULL));
  }
  for (let z = z0; z < z0 + lz; z++) for (let x = x0; x < x0 + lx; x++) for (let y = g.h(x, z); y < gy; y++) g.set(x, y, z, M.MROCK);
  return gy + H;
}

function containers(g, out) {
  const list = [
    [184, 150, 'z', M.CONCRETE_RED], [236, 168, 'x', M.RUST], [236, 178, 'x', M.HULL], [196, 74, 'x', M.RUST],
    [112, 228, 'x', M.CONCRETE_RED], [138, 236, 'z', M.HULL], [44, 140, 'z', M.RUST],
  ];
  for (const [x, z, along, m] of list) {
    const top = container(g, x, z, along, m);
    g.block(x + 6, z + 6, 14);
    g.containers = g.containers || [];
    g.containers.push([x, z, along, top]);
  }
  // ikili: pistin guneyindekilerin ustune bir tane daha (alttaki komsu konteynerden ziplanir)
  container(g, 236, 168, 'x', M.HULL, g.h(240, 172) + 9);
  out.lights.push({ x: 246 * VS, y: (G0 + 26) * VS, z: 172 * VS, color: 0xfff0d0, intensity: 3.5, distance: 14, voxR: 0 });
}

// alti tekerli gezici arac (ozgun tasarim): govde, tekerlekler, direk ustunde kamera kafasi, gunes paneli
function rover(g) {
  const cx = 226, cz = 232;
  let gy = 0;
  for (let dz = -6; dz <= 6; dz++) for (let dx = -9; dx <= 9; dx++) gy = Math.max(gy, g.h(cx + dx, cz + dz));
  g.box(cx - 7, gy + 3, cz - 4, cx + 8, gy + 6, cz + 4, M.HULL);
  g.box(cx - 7, gy + 6, cz - 4, cx + 8, gy + 7, cz + 4, M.SOLAR);
  for (const wx of [-6, 0, 6]) for (const sz of [-1, 1]) {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.hypot(dx, dy) > 2.8) continue;
      for (let t = 0; t < 2; t++) g.set(cx + wx + dx, gy + 3 + dy, cz + sz * (5 + t), Math.hypot(dx, dy) < 1.2 ? M.HULL : M.STEEL);
    }
  }
  for (let y = gy + 7; y < gy + 13; y++) g.set(cx + 6, y, cz, M.STEEL);
  g.box(cx + 5, gy + 13, cz - 1, cx + 8, gy + 15, cz + 2, M.HULL);
  g.set(cx + 8, gy + 14, cz, M.SCREEN);
  g.block(cx, cz, 12);
}

function fuelTanks(g) {
  for (const [cx, cz] of [[192, 214], [204, 222]]) {
    const gy = g.h(cx, cz), r = 4.2, yc = gy + 8;
    for (let y = gy; y < yc + 5; y++) for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const d = Math.hypot(dx + 0.5, y + 0.5 - yc, dz + 0.5);
      if (d < r) g.set(cx + dx, y, cz + dz, M.HULL);
    }
    for (const [lx, lz] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) for (let y = gy - 1; y < yc - 2; y++) g.set(cx + lx, y, cz + lz, M.STEEL);
    g.block(cx, cz, 8);
  }
}

// ---------------------------------------------------------------- pedler
function padAt(g, out, px, pz, tx, ty, tz, apex) {
  px = Math.round(px); pz = Math.round(pz);
  const y = G0;
  for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
    for (let yy = y; yy < y + 10; yy++) { const m = g.get(x, yy, z); if (m === M.REGOLITH || m === M.MROCK) g.set(x, yy, z, 0); }
    const inner = x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4;
    g.set(x, y - 1, z, inner ? M.PAD : M.HULL);
  }
  out.pads.push({ x: px * VS, y: y * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
}

// ped yorungelerinde (ay yercekimiyle) govde boyunda koridor ac: yalniz kule kafes baglantilari ve kayalar
function carvePadPaths(g, out) {
  const G = MOON_PHYS.gravity;
  for (const p of out.pads) {
    const apexY = Math.max(p.y, p.ty) + p.apex;
    const vy = Math.sqrt(2 * G * (apexY - p.y));
    const T = vy / G + Math.sqrt(2 * Math.max(0.01, apexY - p.ty) / G);
    const vx = (p.tx - p.x) / T, vz = (p.tz - p.z) / T;
    for (let t = 0; t < T; t += 0.01) {
      const wx = (p.x + vx * t) / VS, wy = (p.y + 0.9 + vy * t - 0.5 * G * t * t) / VS, wz = (p.z + vz * t) / VS;
      const R = 4;
      for (let dy = -R; dy <= R + 2; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy * 0.5 + dz * dz > R * R) continue;
        const X = Math.floor(wx + dx), Y = Math.floor(wy + dy), Z = Math.floor(wz + dz);
        const m = g.get(X, Y, Z);
        if (m === M.GRATE || m === M.MROCK || (m === M.STEEL && Y > DISH_Y)) g.set(X, Y, Z, 0);
      }
    }
  }
}

// ---------------------------------------------------------------- ogeler, dogma noktalari
const P = (x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

// (x,z) cevresinde duz ve bos zemin (yukaridan ilk zemin; kubbe / tup icinde de olabilir)
function findGround(g, x, z, R = 8, yTop = G0 + 24) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    if (X < 8 || Z < 8 || X >= g.sx - 8 || Z >= g.sz - 8) continue;
    let y = yTop;
    while (y > 2 && !g.get(X, y - 1, Z)) y--;
    if (y <= 2) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (g.get(X + xx, y + k, Z + zz) !== 0) ok = false;
    for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (!g.get(X + xx, y - 1, Z + zz)) ok = false;
    if (ok) return [X, y, Z];
  }
  return null;
}

function placeItems(g, out) {
  const [tx, tz] = TOWER;
  out.items.push({ type: 'quad', ...P(tx, DISH_Y, tz + 1) });
  const D = DOMES;
  const add = (type, x, z, yTop = G0 + 8, R = 6) => { const p = findGround(g, x, z, R, yTop); if (p) out.items.push({ type, ...P(p[0], p[1], p[2]) }); };
  // MEGA serada agacin dibinde (kubbe delinirse emilip disari ucar)
  add('mega', D[0].x + 4, D[0].z + 4, G0 + 3, 4);
  add('armor', D[2].x + 6, D[2].z, G0 + 3, 4);
  add('health', D[1].x + 6, D[1].z + 6, G0 + 3, 4);
  add('health', D[3].x + 6, D[3].z - 4, G0 + 3, 4);
  for (const T of TUBES) { const mid = Math.round((T.ma + T.mb) / 2); const [x, z] = T.axis === 'x' ? [mid, T.cc] : [T.cc, mid]; add('ammo', x, z, G0 + 3, 2); }
  // dis: inis aracinin sahanligi, kule basamaginin en ustu, avlu, guney, kuzey, bati
  if (g.landerTop) out.items.push({ type: 'armor', ...P(g.landerTop[0], g.landerTop[1], g.landerTop[2]) });
  const top = g.ledges[g.ledges.length - 1];
  out.items.push({ type: 'health', ...P(top[0], top[1], top[2]) });
  add('health', tx, tz + 18);
  add('ammo', 118, 270, G0 + 14);
  add('health', 196, 120);
  add('ammo', 130, 82, G0 + 10);
  add('armor', 34, 196, G0 + 14);
  add('ammo', 250, 210, G0 + 14);
}

function placeSpawns(g, out) {
  const [tx, tz] = TOWER;
  const yawTo = (x, z) => Math.atan2(-(tx - x), -(tz - z));
  const add = (p) => out.spawns.push({ ...P(p[0], p[1], p[2]), yaw: yawTo(p[0], p[2]) });
  // kubbelerin ici (ortanin yaninda, esyadan uzak)
  for (const [D, ox, oz] of [[DOMES[0], -6, -12], [DOMES[0], 12, 7], [DOMES[1], -8, -8], [DOMES[2], -8, -7], [DOMES[2], 9, 10], [DOMES[3], -7, 8]]) {
    const p = findGround(g, D.x + ox, D.z + oz, 4, G0 + 4);
    if (p) add(p);
  }
  // dis: dagitilmis adaylar, birbirinden ve kubbelerden uzak
  const cands = [];
  for (let z = 26; z < g.sz - 26; z += 8) for (let x = 26; x < g.sx - 26; x += 8) {
    const c = x + g.sx * z;
    if (g.zone[c] !== 0) continue;
    if (DOMES.some((D) => Math.hypot(x - D.x, z - D.z) < D.R + 10)) continue;
    if (out.pads.some((p) => Math.hypot(p.x / VS - x, p.z / VS - z) < 9)) continue;
    if (Math.abs(x - rilleX(z)) < rilleW(z) + 2) continue;
    const p = findGround(g, x, z, 3, G0 + 12);
    if (p && p[1] <= G0 + 6) cands.push(p);
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
    add(p);
  }
}

// ---------------------------------------------------------------- basincli hacimler
// Her hacim icin kutusunda sinif dizisi: 0 kati (uretimde), 1 ic hava, 2 dis hava, 3 ice degen kati (kabuk,
// taban, ic esya yuzeyi), 4 zar (hava gecmez), 5 baska hacmin ici. Ic: tohumdan 6-komsu sel doldurma (zar
// gecilmez); kutunun kenarina degerse sizinti (uretim hatasi: leak).
function buildVolumes(g, out) {
  const w = g.w, sx = w.sx, sz = w.sz, mat = w.mat;
  const defs = [];
  DOMES.forEach((D, i) => {
    const pad = DL + 4, top = G0 + D.ring + D.R + 3;
    defs.push({ id: i, name: D.name, kind: 'dome', box: [D.x - D.R - pad, G0 - 3, D.z - D.R - pad, D.x + D.R + pad + 1, top, D.z + D.R + pad + 1], seed: [D.x + 2, G0 + 1, D.z - 3], light: D.light ?? -1, c: [(D.x + 0.5) * VS, (G0 + D.ring * 0.5) * VS, (D.z + 0.5) * VS], r: (D.R + DL) * VS });
  });
  TUBES.forEach((T, k) => {
    const ax = T.axis === 'x', a0 = T.ma - 1, a1 = T.mb + 2;
    const box = ax ? [a0, G0 - 3, T.cc - DW - 3, a1, G0 + DH + 3, T.cc + DW + 4] : [T.cc - DW - 3, G0 - 3, a0, T.cc + DW + 4, G0 + DH + 3, a1];
    const mid = Math.round((T.ma + T.mb) / 2);
    const seed = ax ? [mid, G0 + 1, T.cc] : [T.cc, G0 + 1, mid];
    defs.push({ id: DOMES.length + k, name: 'tube' + k, kind: 'tube', box, seed, light: T.light ?? -1, c: [(seed[0] + 0.5) * VS, (G0 + DH * 0.5) * VS, (seed[2] + 0.5) * VS], r: (T.mb - T.ma) * 0.5 * VS + 2 });
  });
  const vols = [];
  for (const d of defs) {
    const [x0, y0, z0, x1, y1, z1] = d.box;
    const nx = x1 - x0, ny = y1 - y0, nz = z1 - z0, nxz = nx * nz;
    const cls = new Uint8Array(nx * ny * nz);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = x + sx * (z + sz * y), li = (x - x0) + nx * ((z - z0) + nz * (y - y0));
      cls[li] = mat[i] ? 0 : g.memb.has(i) ? 4 : 2;
    }
    // tohum: en yakin dis hava hucresi (kutunun icinde)
    let [qx, qy, qz] = d.seed, seedLi = -1;
    for (let r = 0; r < 8 && seedLi < 0; r++) for (let dy = 0; dy <= r && seedLi < 0; dy++) for (let dz = -r; dz <= r && seedLi < 0; dz++) for (let dx = -r; dx <= r && seedLi < 0; dx++) {
      const x = qx + dx - x0, y = qy + dy - y0, z = qz + dz - z0;
      if (x < 1 || y < 1 || z < 1 || x >= nx - 1 || y >= ny - 1 || z >= nz - 1) continue;
      const li = x + nx * (z + nz * y);
      if (cls[li] === 2) seedLi = li;
    }
    let leak = seedLi < 0, interior = 0;
    if (seedLi >= 0) {
      const st = [seedLi];
      cls[seedLi] = 1;
      while (st.length) {
        const li = st.pop();
        interior++;
        const y = (li / nxz) | 0, rem = li - y * nxz, z = (rem / nx) | 0, x = rem - z * nx;
        if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) { leak = true; continue; }
        for (const n of [li - 1, li + 1, li - nx, li + nx, li - nxz, li + nxz]) if (cls[n] === 2) { cls[n] = 1; st.push(n); }
      }
    }
    // ice degen katilar
    for (let li = 0; li < cls.length; li++) {
      if (cls[li] !== 1) continue;
      const y = (li / nxz) | 0, rem = li - y * nxz, z = (rem / nx) | 0, x = rem - z * nx;
      if (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) continue;
      for (const n of [li - 1, li + 1, li - nx, li + nx, li - nxz, li + nxz]) if (cls[n] === 0) cls[n] = 3;
    }
    vols.push({ id: d.id, name: d.name, kind: d.kind, x0, y0, z0, nx, ny, nz, cls, interior, leak, light: d.light, c: d.c, r: d.r });
  }
  // kutulari ortusen hacimler: digerinin ici 5 (kacak aramasi oradan gecmez)
  for (const V of vols) for (const U of vols) {
    if (U === V) continue;
    const ax0 = Math.max(V.x0, U.x0), ax1 = Math.min(V.x0 + V.nx, U.x0 + U.nx);
    const ay0 = Math.max(V.y0, U.y0), ay1 = Math.min(V.y0 + V.ny, U.y0 + U.ny);
    const az0 = Math.max(V.z0, U.z0), az1 = Math.min(V.z0 + V.nz, U.z0 + U.nz);
    for (let y = ay0; y < ay1; y++) for (let z = az0; z < az1; z++) for (let x = ax0; x < ax1; x++) {
      const lu = (x - U.x0) + U.nx * ((z - U.z0) + U.nz * (y - U.y0));
      if (U.cls[lu] !== 1) continue;
      const lv = (x - V.x0) + V.nx * ((z - V.z0) + V.nz * (y - V.y0));
      if (V.cls[lv] === 2) V.cls[lv] = 5;
    }
  }
  return vols;
}
