// Gok Adalari haritasi: bulut denizinin (~2.6 m) ustunde ucan adalar. Ortada ana ada (gozlemevi, gozlem kulesi,
// kulenin tepesinde KIYAMET kuresi); cevresinde bes uydu ada: kuzeyde sellaleli golet ve bahce, doguda yel degirmeni,
// guneyde koy evi, batida sutunlu harabe, kuzeydoguda kristal ocagi. Her ada altindan sarkan parlak kristalle havada
// durur (fx/sky-islands.js: kristal kirilinca ada bulutlara duser, ~45 sn sonra geri yukselir). Ana adaya dort kopru
// (uc halatli ahsap kopru, guneyde tas kemer); koselerde suzulen bulut taslari (basamak), adalar arasi pedler.
// Tum yerlesim voxel biriminde; donen konumlar metre. Uretim Math.random kullanmaz: ayni seed = ayni dunya.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';

export const CLOUD_Y = 2.6;    // bulut denizinin ust yuzu (m)
export const KILL_Y = 1.0;     // bunun altina inen olur (m)

// ada: merkez (x, z), yaricap r, ust yuzey top (ilk bos kat), derinlik (alt uc tepeden ne kadar asagida), kristal cani,
// kristal boyu cl; box [x0, z0, x1, z1): adanin bolgesi (koprulerin ortasindan ayrilir; dusen govde ve geri kurulum)
export const ISLES = [
  { id: 0, name: 'main', x: 144, z: 144, r: 40, top: 52, depth: 27, hp: 1800, cl: 12, box: [86, 86, 202, 202] },
  { id: 1, name: 'garden', x: 144, z: 42, r: 26, top: 40, depth: 18, hp: 900, cl: 9, box: [114, 12, 175, 86] },
  { id: 2, name: 'windmill', x: 246, z: 144, r: 26, top: 60, depth: 18, hp: 900, cl: 9, box: [202, 114, 276, 175] },
  { id: 3, name: 'village', x: 144, z: 246, r: 26, top: 36, depth: 16, hp: 900, cl: 8, box: [114, 202, 175, 276] },
  { id: 4, name: 'ruins', x: 42, z: 144, r: 26, top: 48, depth: 18, hp: 900, cl: 9, box: [12, 114, 86, 175] },
  { id: 5, name: 'quarry', x: 240, z: 48, r: 22, top: 46, depth: 16, hp: 900, cl: 8, box: [214, 22, 268, 74] },
];
const CRYSTAL_MATS = [M.SKY_CRYSTAL0, M.SKY_CRYSTAL1, M.SKY_CRYSTAL2, M.SKY_CRYSTAL3, M.SKY_CRYSTAL4, M.SKY_CRYSTAL5];
const CRYSTAL_LIGHT = [0x9fe8ff, 0x8fd8ff, 0xb59cff, 0x7ff0d8, 0xc8a4ff, 0x9ab8ff];

class Gen {
  constructor(world) { this.w = world; this.sx = world.sx; this.sy = world.sy; this.sz = world.sz; }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[x + this.sx * (z + this.sz * y)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[x + this.sx * (z + this.sz * y)] = m; }
  box(x0, y0, z0, x1, y1, z1, m) { for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) this.set(x, y, z, m); }
  blob(cx, cy, cz, rx, ry, rz, m) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, m);
    }
  }
  // iki nokta arasi koni / silindir (yaricap r0 -> r1)
  rod(ax, ay, az, bx, by, bz, r0, r1, m) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz, R = Math.max(r0, r1) + 1;
    for (let y = Math.floor(Math.min(ay, by) - R); y <= Math.max(ay, by) + R; y++) for (let z = Math.floor(Math.min(az, bz) - R); z <= Math.max(az, bz) + R; z++) for (let x = Math.floor(Math.min(ax, bx) - R); x <= Math.max(ax, bx) + R; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az, t = (px * dx + py * dy + pz * dz) / L2;
      if (t < 0 || t > 1) continue;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t, r = r0 + (r1 - r0) * t;
      if (qx * qx + qy * qy + qz * qz <= r * r) this.set(x, y, z, m);
    }
  }
  // dikey halka / disk: merkezden uzaklik [r0, r1] (voxel merkezleri), y0..y1-1
  ring(cx, cz, r0, r1, y0, y1, m, skip = null) {
    for (let y = y0; y < y1; y++) for (let z = Math.floor(cz - r1 - 1); z <= cz + r1 + 1; z++) for (let x = Math.floor(cx - r1 - 1); x <= cx + r1 + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d >= r0 && d <= r1 && !(skip && skip(x, y, z))) this.set(x, y, z, m);
    }
  }
}

// yumusak deger gurultusu [0,1)
function vn(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, s, zi), b = hash3(xi + 1, s, zi), c = hash3(xi, s, zi + 1), d = hash3(xi + 1, s, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const P = (x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

export function generateSky(world, seed = 1) {
  const g = new Gen(world);
  world.mat.fill(0); world.dmg.fill(0);
  const s = (Math.abs(seed | 0) % 997) + 11;
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Gok Adalari'],
    env: 'sky', quadWhere: 'quadWhereSky', doomVox: 2,
    sky: { cloudY: CLOUD_Y, killY: KILL_Y, isles: [], rocks: [], falls: null, pond: null, mill: null },
  };
  for (const I of ISLES) islandBody(g, I, s + I.id * 13);
  for (const I of ISLES) crystal(g, I, out);
  mainIsland(g, out);
  garden(g, out);
  windmill(g, out);
  village(g, out);
  ruins(g, out);
  quarry(g);
  bridges(g);
  stones(g, out);
  pads(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- ada govdesi: cimen, toprak, katmanli kumtasi, sarkan uclar
function islandBody(g, I, s) {
  const { x: cx, z: cz, r, top, depth } = I, R = r + 3;
  for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
    const re = r * (0.92 + 0.16 * vn(x * 0.11, z * 0.11, s));
    const d = Math.hypot(x - cx, z - cz) / re;
    if (d > 1) continue;
    const ty = d > 0.94 ? top - 2 : top - 1;
    const drip = d < 0.85 ? Math.floor(hash3(x, s + 3, z) * hash3(x >> 2, s + 5, z >> 2) * 7) : 0;
    const by = Math.round(top - 2 - (depth - 2) * Math.pow(1 - d * d, 1.3) - (vn(x * 0.2, z * 0.2, s + 9) - 0.5) * 3) - drip;
    for (let y = Math.min(by, ty); y <= ty; y++) g.set(x, y, z, y === ty ? M.SKYGRASS : y >= ty - 3 ? M.SKYSOIL : M.SKYROCK);
  }
}

// ---------------------------------------------------------------- kristal: alt uctan sarkan parlak kume (ana prizma + yan prizmalar)
function crystal(g, I, out) {
  const { x: cx, z: cz, top, depth, cl, id } = I;
  const m = CRYSTAL_MATS[id], tip = top - depth, main = id === 0;
  const r0 = main ? 4.2 : 3.2;
  g.rod(cx + 0.5, tip + 4, cz + 0.5, cx + 0.5, tip - cl, cz + 0.5, r0, 0.5, m);
  for (let k = 0; k < (main ? 5 : 4); k++) {
    const a = k * 2.399 + id * 0.7, ox = Math.cos(a), oz = Math.sin(a), L = cl * (0.45 + 0.12 * (k % 3));
    g.rod(cx + 0.5 + ox * 1.5, tip + 2, cz + 0.5 + oz * 1.5, cx + 0.5 + ox * (3 + L * 0.45), tip + 2 - L, cz + 0.5 + oz * (3 + L * 0.45), main ? 2.0 : 1.6, 0.4, m);
  }
  const y1 = (tip + 2) * VS, y0 = (tip - cl) * VS;
  out.sky.isles[id] = {
    id, name: I.name, x: (cx + 0.5) * VS, z: (cz + 0.5) * VS, r: I.r * VS, top: top * VS, tip: tip * VS, hp: I.hp,
    box: I.box.slice(), y0: tip - cl - 2, core: { cx, cz, r: Math.round(I.r * 0.55), lo: tip - 1, hi: top - 1 },
    crystal: { mat: m, x: (cx + 0.5) * VS, z: (cz + 0.5) * VS, y0, y1, r: (r0 + 1.5) * VS },
  };
  out.lights.push({ x: (cx + 0.5) * VS, y: (y0 + y1) * 0.5, z: (cz + 0.5) * VS, color: CRYSTAL_LIGHT[id], intensity: main ? 14 : 10, distance: main ? 12 : 9, voxR: 0 });
}

// ---------------------------------------------------------------- ana ada: mermer meydan, gozlemevi (bakir kubbe, teleskop), gozlem kulesi
function mainIsland(g, out) {
  const T = 52, cx = 144, cz = 144;
  // meydan ve koprulere giden mermer yollar (zemin hizasinda), kose cicek tarhlari
  for (let z = cz - 40; z <= cz + 40; z++) for (let x = cx - 40; x <= cx + 40; x++) {
    if (g.get(x, T - 1, z) !== M.SKYGRASS) continue;
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d < 24 || (x >= 140 && x < 148) || (z >= 140 && z < 148)) g.set(x, T - 1, z, M.MARBLE);
    else if (d < 30 && d > 25 && Math.abs(Math.abs(x - cx) - Math.abs(z - cz)) < 5) g.set(x, T - 1, z, M.FLOWER);
  }
  // gozlemevi: halka duvar (dort kemer kapi), pirinc kusak, doguya yarikli bakir kubbe, teleskop
  const door = (x, y, z) => y < T + 9 && ((Math.abs(x + 0.5 - cx) < 4) || (Math.abs(z + 0.5 - cz) < 4));
  g.ring(cx, cz, 12, 14, T, T + 12, M.MARBLE, door);
  g.ring(cx, cz, 13, 15, T + 12, T + 13, M.BRASS);
  for (let y = T + 12; y < T + 27; y++) for (let z = cz - 15; z <= cz + 15; z++) for (let x = cx - 15; x <= cx + 15; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - (T + 12), z + 0.5 - cz);
    if (d < 12 || d > 14) continue;
    if (Math.abs(z + 0.5 - cz) < 1.6 && x > cx && y > T + 14) continue;
    g.set(x, y, z, M.VERDIGRIS);
  }
  g.box(cx - 2, T, cz - 2, cx + 2, T + 6, cz + 2, M.BRASS);
  g.rod(cx + 0.5, T + 6, cz + 0.5, cx + 13.5, T + 24, cz + 0.5, 1.7, 1.3, M.BRASS);
  g.box(cx - 1, T + 26, cz - 1, cx + 1, T + 28, cz + 1, M.BRASS);
  out.lights.push({ x: (cx + 0.5) * VS, y: (T + 10) * VS, z: (cz + 6.5) * VS, color: 0xffd8a0, intensity: 8, distance: 12, voxR: 0 });
  // gozlem kulesi (guneybatida): mermer govde, 20 m'de seyir terasi, dort direkli bakir catili kosk
  const tx = 122, tz = 166, PL = 78;
  g.box(tx - 5, T, tz - 5, tx + 5, PL - 2, tz + 5, M.MARBLE);
  for (let y = T + 4; y < PL - 4; y += 6) g.box(tx - 5, y, tz - 5, tx + 5, y + 1, tz + 5, M.BRASS);
  g.box(tx - 7, PL - 2, tz - 7, tx + 7, PL, tz + 7, M.MARBLE);
  for (const [ox, oz] of [[-7, -7], [5, -7], [-7, 5], [5, 5]]) g.box(tx + ox, PL, tz + oz, tx + ox + 2, PL + 13, tz + oz + 2, M.MARBLE);
  g.box(tx - 8, PL + 13, tz - 8, tx + 8, PL + 15, tz + 8, M.VERDIGRIS);
  g.box(tx - 6, PL + 15, tz - 6, tx + 6, PL + 16, tz + 6, M.VERDIGRIS);
  g.box(tx - 3, PL + 16, tz - 3, tx + 3, PL + 17, tz + 3, M.VERDIGRIS);
  g.box(tx - 1, PL + 17, tz - 1, tx + 1, PL + 18, tz + 1, M.BRASS);
  out.items.push({ type: 'quad', ...P(tx - 1, PL, tz - 1), isle: 0 });
  for (const [x, z] of [[161, 161], [127, 127]]) { g.box(x, T, z, x + 1, T + 10, z + 1, M.BRASS); g.box(x - 1, T + 10, z - 1, x + 2, T + 12, z + 2, M.LAMP); }
}

// ---------------------------------------------------------------- bahce adasi: golet (kuzeye dokulen sellale), cicek tarhlari, agac
function garden(g, out) {
  const T = 40, px = 152, pz = 30;
  for (let z = pz - 9; z <= pz + 9; z++) for (let x = px - 9; x <= px + 9; x++) {
    const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
    if (d < 7) { g.set(x, T - 1, z, 0); g.set(x, T - 2, z, 0); g.set(x, T - 3, z, M.CLOUDSTONE); }
    else if (d < 8.3 && g.get(x, T - 1, z)) g.set(x, T - 1, z, M.CLOUDSTONE);
  }
  // goletten kenara akan ark; sellale arkin bittigi kenarin dis yuzunden dokulur
  for (let z = 10; z < pz - 5; z++) for (let x = 150; x < 154; x++) { if (g.get(x, T - 1, z)) g.set(x, T - 1, z, 0); if (g.get(x, T - 2, z)) g.set(x, T - 2, z, M.CLOUDSTONE); }
  let zr = 10; while (zr < pz && !g.get(151, T - 2, zr)) zr++;
  out.sky.pond = { x: (px + 0.5) * VS, z: (pz + 0.5) * VS, y: (T - 1.45) * VS, r: 7.6 * VS, isle: 1 };
  out.sky.falls = { x: 152 * VS, z: zr * VS, y: (T - 1.3) * VS, w: 1.05, isle: 1 };
  for (const [bx, bz, br] of [[134, 52, 5], [158, 42, 4]]) {
    for (let z = bz - br - 1; z <= bz + br + 1; z++) for (let x = bx - br - 1; x <= bx + br + 1; x++) {
      const d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz);
      if (d < br) g.set(x, T - 1, z, M.FLOWER);
      else if (d < br + 1 && g.get(x, T - 1, z)) g.set(x, T, z, M.LEAVES);
    }
  }
  g.rod(160.5, T, 56.5, 160.5, T + 12, 56.5, 1.4, 1.1, M.BARK);
  g.blob(160.5, T + 14, 56.5, 6, 4, 6, M.LEAVES);
  g.blob(157.5, T + 16, 58.5, 4, 3, 4, M.LEAVES);
}

// ---------------------------------------------------------------- yel degirmeni adasi: siva kule, kiremit kulah, saman balyalari
function windmill(g, out) {
  const T = 60, cx = 252, cz = 150;
  g.ring(cx, cz, 0, 7, T - 1, T, M.WOOD);
  g.ring(cx, cz, 7, 9, T, T + 24, M.PLASTER, (x, y, z) => y < T + 9 && x < cx - 4 && Math.abs(z + 0.5 - cz) < 2.6);
  for (let y = T + 24; y < T + 34; y++) { const rr = 11 * (1 - (y - T - 24) / 10); g.ring(cx, cz, Math.max(0, rr - 2.2), rr, y, y + 1, M.ROOFTILE); }
  g.box(cx - 1, T + 16, cz - 1, cx + 11, T + 18, cz + 1, M.WOOD);   // kanat mili (kanatlar fx/sky-islands.js)
  g.box(cx - 10, T + 9, cz + 2, cx - 9, T + 11, cz + 3, M.LAMP);
  out.lights.push({ x: (cx - 9.5) * VS, y: (T + 10) * VS, z: (cz + 2.5) * VS, color: 0xffcf8a, intensity: 6, distance: 8, voxR: 2 });
  for (const [x, z] of [[256, 128], [262, 138]]) g.box(x, T, z, x + 6, T + 4, z + 4, M.SAND);
  out.sky.mill = { x: (cx + 11) * VS, y: (T + 17) * VS, z: (cz + 0.5) * VS, isle: 2 };
}

// ---------------------------------------------------------------- koy adasi: siva ev (kiremit cati, baca), kuyu, fener diregi
function village(g, out) {
  const T = 36, x0 = 146, x1 = 160, z0 = 248, z1 = 261;
  g.box(x0, T - 1, z0, x1, T, z1, M.WOOD);
  for (let y = T; y < T + 10; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (x > x0 && x < x1 - 1 && z > z0 && z < z1 - 1) continue;
    if (x === x0 && z >= 252 && z < 256 && y < T + 8) continue;
    const win = (z === z1 - 1 && (x === 151 || x === 152 || x === 155 || x === 156) && (y === T + 4 || y === T + 5)) || (x === x1 - 1 && (z === 252 || z === 253) && (y === T + 4 || y === T + 5));
    g.set(x, y, z, win ? M.LAMP : M.PLASTER);
  }
  for (let z = z0 - 1; z <= z1; z++) {
    const ry = T + 16 - Math.abs(z - 254);
    for (let x = x0 - 1; x <= x1; x++) g.set(x, ry, z, M.ROOFTILE);
    for (const x of [x0, x1 - 1]) for (let y = T + 10; y < ry; y++) if (z >= z0 && z < z1) g.set(x, y, z, M.PLASTER);
  }
  g.box(155, T + 9, 250, 157, T + 19, 252, M.BRICK);
  g.ring(132, 236, 2, 3.3, T, T + 3, M.SKYROCK);
  g.box(128, T, 236, 129, T + 8, 237, M.WOOD); g.box(135, T, 236, 136, T + 8, 237, M.WOOD);
  g.box(127, T + 8, 233, 137, T + 9, 240, M.ROOFTILE);
  g.box(136, T, 254, 137, T + 10, 255, M.WOOD);
  g.box(135, T + 10, 253, 137, T + 12, 255, M.LAMP);
  out.lights.push({ x: 136 * VS, y: (T + 11) * VS, z: 254 * VS, color: 0xffc070, intensity: 6, distance: 9, voxR: 2 });
}

// ---------------------------------------------------------------- harabe adasi: basamakli kaide, kirik sutunlar, devrik sutun, mangal
function ruins(g, out) {
  const T = 48;
  g.box(26, T, 132, 58, T + 1, 156, M.MARBLE);
  g.box(28, T + 1, 134, 56, T + 2, 154, M.MARBLE);
  const H = [24, 9, 20, 14, 24, 6, 17, 22];
  let k = 0;
  for (const z of [137, 151]) for (const x of [31, 39, 47, 55]) {
    const h = H[k++], y0 = T + 2;
    for (let y = y0; y < y0 + h; y++) for (let zz = z - 3; zz <= z + 3; zz++) for (let xx = x - 3; xx <= x + 3; xx++) {
      if (Math.hypot(xx + 0.5 - x, zz + 0.5 - z) > 2.3) continue;
      if (h < 24 && y >= y0 + h - Math.floor(hash3(xx, 7, zz) * 3)) continue;   // kirik tepe (sutun sutun, asili voxel kalmaz)
      g.set(xx, y, zz, M.MARBLE);
    }
  }
  g.box(28, T + 26, 134, 42, T + 28, 140, M.MARBLE);                   // iki sutunu baglayan kiris
  g.rod(34.5, T + 2, 161.5, 50.5, T + 2, 163.5, 2.2, 2.2, M.MARBLE);   // devrik sutun
  g.box(41, T + 2, 143, 44, T + 5, 146, M.MARBLE);
  g.box(41, T + 5, 143, 44, T + 7, 146, M.FIRE);
  out.lights.push({ x: 42.5 * VS, y: (T + 7) * VS, z: 144.5 * VS, color: 0xff9a40, intensity: 7, distance: 10, voxR: 2 });
}

// ---------------------------------------------------------------- kristal ocagi: kristalli kaya cikintilari, iskele, maden arabasi
function quarry(g) {
  const T = 46;
  for (const [x, z, rx, ry, rz] of [[230, 38, 5, 4, 4], [252, 40, 4, 5, 4], [248, 60, 4, 3, 4]]) {
    g.blob(x + 0.5, T + 1, z + 0.5, rx, ry, rz, M.SKYROCK);
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + x * 0.1, L = 4 + k;
      g.rod(x + 0.5, T + 2, z + 0.5, x + 0.5 + Math.cos(a) * 3, T + 3 + L, z + 0.5 + Math.sin(a) * 3, 1.4 - k * 0.2, 0.8, M.CRYSTAL);
    }
  }
  for (const x of [246, 252]) g.box(x, T, 30, x + 2, T + 12, 32, M.WOOD);
  g.box(245, T + 12, 30, 255, T + 14, 32, M.WOOD);
  g.box(249, T + 7, 30, 250, T + 12, 31, M.ROPE);
  g.box(248, T + 5, 29, 251, T + 7, 32, M.RUST);
  g.box(237, T, 58, 242, T + 3, 62, M.RUST);
}

// ---------------------------------------------------------------- kopruler: uc halatli ahsap kopru (sarkik), guneyde mermer tas kemer
// koprulerin olculeri (botlarin tahliye noktalari da buradan): axis 'z': kopru z boyunca [s0, s1], x'te [a, a+8);
// i0 / i1: s0 / s1 ucundaki ada; y0 / y1: uclardaki zemin (ust voxel) kati
export const BRIDGES = [
  { axis: 'z', a: 140, s0: 62, s1: 108, y0: 39, y1: 51, i0: 1, i1: 0 },               // bahce - ana ada
  { axis: 'x', a: 140, s0: 180, s1: 226, y0: 51, y1: 59, i0: 0, i1: 2 },              // ana ada - yel degirmeni
  { axis: 'x', a: 140, s0: 62, s1: 108, y0: 47, y1: 51, i0: 4, i1: 0 },               // harabe - ana ada
  { axis: 'z', a: 140, s0: 180, s1: 226, y0: 51, y1: 35, i0: 0, i1: 3, arch: true },  // tas kemer: ana ada - koy
];
// kopru zemininin ust voxel kati (u: s0 -> s1 arasi 0..1; halatli kopru ortada sarkar)
export const bridgeY = (B, u) => Math.round(B.y0 + (B.y1 - B.y0) * u - (B.arch ? 0 : 3 * Math.sin(Math.PI * u)));
function bridges(g) {
  // axis 'z': kopru z boyunca [s0, s1], x'te [a, a+8); 'x': tersi. y0/y1: uclardaki zemin (ust voxel) kati
  const span = (axis, a, s0, s1, fn) => {
    for (let s = s0; s <= s1; s++) for (let w = 0; w < 8; w++) fn(axis === 'z' ? a + w : s, axis === 'z' ? s : a + w, (s - s0) / (s1 - s0), w, s - s0);
  };
  const rope = (axis, a, s0, s1, y0, y1) => span(axis, a, s0, s1, (x, z, u, w, i) => {
    const y = Math.round(y0 + (y1 - y0) * u - 3 * Math.sin(Math.PI * u));
    g.set(x, y, z, M.WOOD); g.set(x, y - 1, z, M.WOOD);   // iki kat: basamakli sarkmada kalaslar birbirine degsin
    if (w > 0 && w < 7) { for (let k = 1; k <= 9; k++) g.set(x, y + k, z, 0); return; }
    if (i % 6 === 0) for (let k = 1; k < 4; k++) g.set(x, y + k, z, M.WOOD);
    g.set(x, y + 4, z, M.ROPE); g.set(x, y + 3, z, M.ROPE);
  });
  for (const B of BRIDGES) if (!B.arch) rope(B.axis, B.a, B.s0, B.s1, B.y0, B.y1);
  // tas kemer (ana ada - koy): iki kat mermer basamakli yol, alcak korkuluk, alti kemer
  span('z', 140, 180, 226, (x, z, u, w) => {
    const y = Math.round(51 + (35 - 51) * u);
    const ya = y - 2 - Math.round(11 * Math.pow(1 - Math.sin(Math.PI * u), 2));
    for (let yy = y; yy >= ya; yy--) g.set(x, yy, z, M.MARBLE);
    if (w === 0 || w === 7) { g.set(x, y + 1, z, M.MARBLE); g.set(x, y + 2, z, z % 4 === 0 ? M.MARBLE : 0); }
    else for (let k = 1; k <= 9; k++) g.set(x, y + k, z, 0);
  });
}

// ---------------------------------------------------------------- suzulen bulut taslari (basamak taslari; her zaman bagli)
function stones(g, out) {
  const L = [
    [182, 44, 42], [196, 46, 44], [210, 47, 45],                                   // bahce -> kristal ocagi
    [242, 106, 57], [241, 92, 53], [240, 78, 49],                                  // yel degirmeni -> kristal ocagi
    [52, 180, 46], [64, 192, 45], [76, 203, 43], [88, 215, 41], [100, 226, 39], [112, 238, 37],   // harabe -> koy
  ];
  const r = 4;
  for (const [x, z, t] of L) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx + 0.5, dz + 0.5) / (r + 0.3);
      if (d > 1) continue;
      const by = t - 2 - Math.round(3 * (1 - d * d) * (0.7 + 0.3 * hash3(x + dx, 5, z + dz)));
      for (let y = by; y < t; y++) g.set(x + dx, y, z + dz, M.CLOUDSTONE);
    }
    out.sky.rocks.push({ x0: x - r, z0: z - r, x1: x + r + 1, z1: z + r + 1, lo: t - 6, hi: t - 1 });
  }
}

// ---------------------------------------------------------------- ziplama pedleri (ucus koridorlari dekordan once ayrildi)
function pads(g, out) {
  const pad = (px, pz, T, tx, ty, tz, apex, from, to) => {
    for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
      const inner = x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4;
      g.set(x, T - 1, z, inner ? M.PAD : M.BRASS);
      for (let y = T; y < T + 10; y++) g.set(x, y, z, 0);
    }
    out.pads.push({ x: px * VS, y: T * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex, from, to });
  };
  pad(124, 150, 52, 122, 78, 166, 1.2, 0, 0);     // ana ada -> gozlem kulesi (KIYAMET)
  pad(162, 122, 52, 242, 46, 52, 2.5, 0, 5);      // ana ada -> kristal ocagi
  pad(230, 56, 46, 150, 52, 116, 3.0, 5, 0);      // kristal ocagi -> ana ada
  pad(36, 124, 48, 130, 40, 40, 3.0, 4, 1);       // harabe -> bahce
  pad(128, 54, 40, 52, 48, 126, 3.5, 1, 4);       // bahce -> harabe
  pad(156, 236, 36, 232, 60, 150, 3.0, 3, 2);     // koy -> yel degirmeni
  pad(236, 156, 60, 142, 36, 234, 1.5, 2, 3);     // yel degirmeni -> koy
}

// zemin ara: (x,z) cevresinde R hucre icinde, yTop'tan asagi ilk kati zemin; 3x3 taban kati, ustu 8 kat bos
function findGround(g, x, z, R, yTop, yBot = 10) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    let y = yTop;
    while (y > yBot && !g.get(X, y - 1, Z)) y--;
    if (y <= yBot) continue;
    let ok = g.get(X, y - 1, Z) !== M.PAD;
    for (let k = 0; k < 8 && ok; k++) for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (g.get(X + xx, y + k, Z + zz)) ok = false;
    for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (!g.get(X + xx, y - 1, Z + zz)) ok = false;
    if (ok) return [X, y, Z];
  }
  return null;
}
// voxel (x, z) hangi adanin bolgesinde (-1: hicbiri)
export const isleAt = (x, z) => { for (const I of ISLES) { const b = I.box; if (x >= b[0] && x < b[2] && z >= b[1] && z < b[3]) return I.id; } return -1; };

function placeItems(g, out) {
  const add = (type, x, z, T) => { const p = findGround(g, x, z, 4, T + 4, T - 3); if (p) out.items.push({ type, ...P(p[0], p[1], p[2]) }); else console.warn('oge yeri yok', type, x, z); };
  add('health', 138, 152, 52); add('health', 168, 140, 52); add('ammo', 128, 138, 52); add('ammo', 152, 166, 52);
  add('health', 150, 50, 40); add('ammo', 136, 44, 40);
  add('armor', 238, 150, 60); add('ammo', 250, 132, 60);
  add('health', 138, 238, 36); add('ammo', 152, 254, 36);
  add('armor', 34, 144, 50); add('ammo', 50, 152, 50);
  add('mega', 240, 46, 46);
  for (const it of out.items) if (it.isle === undefined) it.isle = isleAt(Math.floor(it.x / VS), Math.floor(it.z / VS));
}

function placeSpawns(g, out) {
  const yawTo = (x, z) => Math.atan2(-(144 - x), -(144 - z));
  const cand = [
    [170, 160, 52], [158, 172, 52], [118, 132, 52], [130, 118, 52], [172, 132, 52], [136, 172, 52],
    [136, 60, 40], [158, 46, 40], [250, 130, 60], [232, 136, 60], [130, 244, 36], [132, 258, 36],
    [30, 128, 48], [56, 164, 48], [244, 36, 46], [250, 50, 46],
  ];
  for (const [x, z, T] of cand) {
    const p = findGround(g, x, z, 4, T + 3, T - 3);
    if (!p) { console.warn('dogma yeri yok', x, z); continue; }
    out.spawns.push({ ...P(p[0], p[1], p[2]), yaw: yawTo(p[0], p[2]), isle: isleAt(p[0], p[2]) });
  }
}
