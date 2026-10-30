// Fisekhane haritasi (FISEKHANE / FIREWORKS): gece, terk edilmis bir havai fisek fabrikasi, 72 x 72 m.
// Ortada ~16.5 m'lik tugla-celik fisek kulesi: kuleyi bir bucuk tur saran celik merdiven (her yuzde 1 m'lik 6 basamak,
// koselerde sahanlik), tepesinde deneme atis platformu, havan tupleri ve KIYAMET kuresi. Kuzeyde, batida ve doguda iki
// kat gorunumlu tugla atolyeler (ahsap cati, pencereler, icerde tezgahlar ve sandik raflari); karsilikli koselerde iki
// alcak beton barut deposu (kalin kapi, uyari levhalari, barut ficilari). Avlu: palet ustunde fisek sandigi yiginlari,
// el arabalari, yukleme rampasi, su kulesi, kuleyi cevreleyen fener zincirleri, cevre duvari ve kapi. Catilar arasinda
// celik gecitler (kulenin merdivenine baglanir), uc ziplama pedi (kulenin ortasina, iki atolye catisina). Uc barut fitili
// kirmizi direkten depolara kosar; biri sundurmanin duvarina tirmanip catisindan iner. Sandiklar (out.crates), fitiller
// ve depolar fx/fireworks.js'e liste olarak gider. Tum yerlesim voxel biriminde; donen konumlar metre. Math.random yok.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';

const G = 6;                                                     // zemin ustu: ilk bos voxel (1.5 m)
const TW = { x0: 132, x1: 156, z0: 132, z1: 156, top: G + 60 };  // fisek kulesi (cati ustu 16.5 m)
const W1 = { x0: 100, x1: 188, z0: 24, z1: 72 };                 // kuzey atolyesi
const W2 = { x0: 20, x1: 68, z0: 100, z1: 188 };                 // bati atolyesi
const W3 = { x0: 220, x1: 268, z0: 100, z1: 188 };               // dogu atolyesi
const ROOF = G + 26;                                             // atolye cati ustu (8 m)
const D1 = { x0: 24, x1: 60, z0: 224, z1: 260 };                 // guneybati barut deposu (kapi doguda)
const D2 = { x0: 228, x1: 264, z0: 24, z1: 60 };                 // kuzeydogu barut deposu (kapilar batida ve guneyde)
const SHED = { x0: 84, x1: 112, z0: 220, z1: 244, top: G + 16 }; // paketleme sundurmasi (fitil catisindan gecer)
const POSTS = [[110, 110], [178, 110], [178, 196], [110, 196]];  // fener direkleri (zincirler kuleyi cevreler)
export const FW_LAYOUT = { G, TW, W1, W2, W3, ROOF, D1, D2, SHED, POSTS };

class Gen {
  constructor(world) { this.w = world; this.sx = world.sx; this.sy = world.sy; this.sz = world.sz; }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  in(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.in(x, y, z) ? this.w.mat[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.in(x, y, z)) this.w.mat[this.idx(x, y, z)] = m; }
  box(x0, y0, z0, x1, y1, z1, m) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); z0 = Math.max(0, z0 | 0);
    x1 = Math.min(this.sx, x1 | 0); y1 = Math.min(this.sy, y1 | 0); z1 = Math.min(this.sz, z1 | 0);
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) { let i = this.idx(x0, y, z); for (let x = x0; x < x1; x++, i++) this.w.mat[i] = m; }
  }
  // yuzeyleri ortak (6-bagli) voxel cizgisi: yapisal butunluk capraz komsuyu bagli saymaz
  line(ax, ay, az, bx, by, bz, m) {
    let x = ax, y = ay, z = az;
    this.set(x, y, z, m);
    while (x !== bx || y !== by || z !== bz) {
      const dx = bx - x, dy = by - y, dz = bz - z;
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) x += Math.sign(dx);
      else if (Math.abs(dz) >= Math.abs(dy)) z += Math.sign(dz); else y += Math.sign(dy);
      this.set(x, y, z, m);
    }
  }
  cyl(cx, cz, r, y0, y1, m, hollow = false) {
    for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r || (hollow && d < r - 1.2)) continue;
      for (let y = y0; y < y1; y++) this.set(x, y, z, m);
    }
  }
}

export function generateFireworks(world, seed = 1) {
  const g = new Gen(world);
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Fisekhane'],
    env: 'fireworks', quadWhere: 'quadWhereFireworks',
    crates: [], fw: { G, fuses: [], depots: [] },
  };
  ground(g);
  perimeter(g);
  tower(g, out);
  workshop(g, out, W1, [['s', 140, 148], ['e', 40, 48], ['w', 44, 52]], 'n', null);
  workshop(g, out, W2, [['e', 120, 128], ['e', 160, 168], ['n', 40, 48]], 'w', ['e', 146, 154]);
  workshop(g, out, W3, [['w', 128, 140], ['w', 152, 164], ['s', 240, 248]], 'e', ['s', 242, 252]);
  depot(g, out, D1, [['e', 234, 242]]);
  depot(g, out, D2, [['w', 40, 48], ['s', 248, 256]]);
  shed(g);
  yard(g, out);
  catwalks(g);
  chains(g, out);
  fuses(g, out);
  pads(g, out);
  placeItems(g, out);
  placeSpawns(g, out);
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- zemin, cevre duvari, kapi
function ground(g) {
  const { sx, sz } = g;
  g.box(0, 0, 0, sx, 2, sz, M.BEDROCK);
  g.box(0, 2, 0, sx, G - 1, sz, M.CONCRETE_DARK);
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const n = hash3(x >> 2, 3, z >> 2), n2 = hash3(x >> 4, 9, z >> 4);
    g.set(x, G - 1, z, n2 > 0.78 && n > 0.35 ? M.DIRT : n > 0.93 ? M.RUBBLE : M.COBBLE);
  }
}

function perimeter(g) {
  const { sx, sz } = g, H = G + 18;
  for (const [a, b, c, d] of [[0, 0, sx, 2], [0, sz - 2, sx, sz], [0, 0, 2, sz], [sx - 2, 0, sx, sz]]) g.box(a, G, b, c, H, d, M.FRAME);
  for (const [a, b, c, d] of [[2, 2, sx - 2, 4], [2, sz - 4, sx - 2, sz - 2], [2, 2, 4, sz - 2], [sx - 4, 2, sx - 2, sz - 2]]) g.box(a, G, b, c, G + 16, d, M.FBRICK);
  for (let k = 12; k < sx - 12; k += 24) {
    g.box(k, G, 4, k + 3, G + 14, 6, M.FBRICK); g.box(k, G, sz - 6, k + 3, G + 14, sz - 4, M.FBRICK);
    g.box(4, G, k, 6, G + 14, k + 3, M.FBRICK); g.box(sx - 6, G, k, sx - 4, G + 14, k + 3, M.FBRICK);
  }
  // guney kapisi: tugla ayaklar, demir parmaklik, ustte celik kiris, uyari levhasi ve iki fener (arkasi yikilmaz cerceve)
  g.box(120, G, sz - 8, 128, G + 22, sz - 2, M.FBRICK); g.box(160, G, sz - 8, 168, G + 22, sz - 2, M.FBRICK);
  g.box(128, G, sz - 4, 160, G + 16, sz - 2, 0);
  for (let x = 128; x < 160; x += 3) g.box(x, G, sz - 4, x + 1, G + 17, sz - 3, M.GRATE);
  g.box(128, G + 5, sz - 4, 160, G + 6, sz - 3, M.GRATE); g.box(128, G + 12, sz - 4, 160, G + 13, sz - 3, M.GRATE);
  g.box(120, G + 17, sz - 5, 168, G + 19, sz - 2, M.STEEL);
  for (const x of [123, 163]) { g.box(x, G + 22, sz - 6, x + 2, G + 23, sz - 4, M.STEEL); g.box(x, G + 23, sz - 6, x + 2, G + 26, sz - 4, M.LANTERN); }
  g.box(132, G + 19, sz - 4, 156, G + 21, sz - 3, M.WARN);
}

// ---------------------------------------------------------------- fisek kulesi
function tower(g, out) {
  const { x0, x1, z0, z1, top } = TW;
  const R = top;
  g.box(x0, G - 1, z0, x1, G, z1, M.CONCRETE);
  g.box(x0, G, z0, x1, R - 2, z1, M.FBRICK);
  g.box(x0 + 2, G, z0 + 2, x1 - 2, G + 16, z1 - 2, 0);        // zemin kat salonu (4 m)
  g.box(x0 + 2, G + 16, z0 + 2, x1 - 2, G + 18, z1 - 2, M.CONCRETE_DARK);
  // kemerler: kuzey, dogu, bati (guneyde merdivenin basi)
  g.box(140, G, z0, 148, G + 12, z0 + 2, 0); g.box(x1 - 2, G, 140, x1, G + 12, 148, 0); g.box(x0, G, 140, x0 + 2, G + 12, 148, 0);
  g.box(139, G + 12, z0, 149, G + 13, z0 + 2, M.STEEL); g.box(x1 - 2, G + 12, 139, x1, G + 13, 149, M.STEEL); g.box(x0, G + 12, 139, x0 + 2, G + 13, 149, M.STEEL);
  for (const cx of [x0, x1 - 3]) for (const cz of [z0, z1 - 3]) g.box(cx, G, cz, cx + 3, R + 4, cz + 3, M.STEEL);
  for (let y = G + 16; y < R; y += 16) {
    g.box(x0, y, z0, x1, y + 1, z0 + 1, M.STEEL); g.box(x0, y, z1 - 1, x1, y + 1, z1, M.STEEL);
    g.box(x0, y, z0, x0 + 1, y + 1, z1, M.STEEL); g.box(x1 - 1, y, z0, x1, y + 1, z1, M.STEEL);
  }
  // kepenkli pencere girintileri
  for (const y of [G + 24, G + 40]) for (const a of [138, 146]) {
    g.box(a, y, z0, a + 4, y + 7, z0 + 1, 0); g.box(a, y, z0 + 1, a + 4, y + 7, z0 + 2, M.WOOD);
    g.box(a, y, z1 - 1, a + 4, y + 7, z1, 0); g.box(a, y, z1 - 2, a + 4, y + 7, z1 - 1, M.WOOD);
    g.box(x0, y, a, x0 + 1, y + 7, a + 4, 0); g.box(x0 + 1, y, a, x0 + 2, y + 7, a + 4, M.WOOD);
    g.box(x1 - 1, y, a, x1, y + 7, a + 4, 0); g.box(x1 - 2, y, a, x1 - 1, y + 7, a + 4, M.WOOD);
  }
  // cati: doseme, korkuluk (dogu yuzde gecit acikligi), havan tupleri, isaret diregi ve lambasi
  g.box(x0, R - 2, z0, x1, R, z1, M.CONCRETE_DARK);
  g.box(x0, R, z0, x1, R + 3, z0 + 2, M.FBRICK); g.box(x0, R, z1 - 2, x1, R + 3, z1, M.FBRICK);
  g.box(x0, R, z0, x0 + 2, R + 3, z1, M.FBRICK); g.box(x1 - 2, R, z0, x1, R + 3, z1, M.FBRICK);
  g.box(x1 - 2, R, 148, x1, R + 3, 153, 0);
  for (const [tx, tz] of [[135, 135], [138, 135], [135, 138], [149, 135], [152, 135]]) g.box(tx, R, tz, tx + 2, R + 5, tz + 2, M.TUBE);
  g.box(135, R, 151, 137, R + 12, 153, M.STEEL); g.box(134, R + 12, 150, 138, R + 14, 154, M.LAMP);
  out.lights.push({ x: 136 * VS, y: (R + 10) * VS, z: 152 * VS, color: 0xffb070, intensity: 14, distance: 22, voxR: 3 });
  towerStair(g);
  // en ust sahanliktan (guneydogu) catiya kopru
  g.box(x1, R - 2, 148, x1 + 4, R, z1, M.GRATE);
  g.box(x1 + 4, R - 2, 148, x1 + 5, R + 3, z1 + 5, M.STEEL);
}

// kulenin disinda 5 voxel genis halka: 4 voxel basamak + 1 voxel korkuluk (basamaga yapisik: butunluk). Her yuzde 6
// basamak (1 m ileri, 0.5 m yukari), koselerde sahanlik. Guneybati koseden baslar: guney, dogu, kuzey, bati, guney;
// guneydogu sahanligi cati yuksekligindedir. Kuzeydogu sahanligi dogu gecide, kuzey yuzun ilk basamagi kuzey gecide acik.
function towerStair(g) {
  const { x0, x1, z0, z1 } = TW;
  const tread = (ax, az, bx, bz, h) => g.box(ax, G + h - 2, az, bx, G + h, bz, M.GRATE);
  const rail = (ax, az, bx, bz, h) => g.box(ax, G + h - 2, az, bx, G + h + 3, bz, M.STEEL);
  const faces = ['S', 'E', 'N', 'W', 'S'];
  let h = 0;
  for (let f = 0; f < 5; f++) {
    const F = faces[f];
    for (let k = 0; k < 6; k++) {
      h += 2;
      if (F === 'S') { tread(x0 + 4 * k, z1, x0 + 4 * k + 4, z1 + 4, h); rail(x0 + 4 * k, z1 + 4, x0 + 4 * k + 4, z1 + 5, h); }
      else if (F === 'E') { tread(x1, z1 - 4 * k - 4, x1 + 4, z1 - 4 * k, h); rail(x1 + 4, z1 - 4 * k - 4, x1 + 5, z1 - 4 * k, h); }
      else if (F === 'N') { tread(x1 - 4 * k - 4, z0 - 4, x1 - 4 * k, z0, h); if (k > 0) rail(x1 - 4 * k - 4, z0 - 5, x1 - 4 * k, z0 - 4, h); }
      else { tread(x0 - 4, z0 + 4 * k, x0, z0 + 4 * k + 4, h); rail(x0 - 5, z0 + 4 * k, x0 - 4, z0 + 4 * k + 4, h); }
    }
    if (F === 'S') { tread(x1, z1, x1 + 4, z1 + 4, h); rail(x1, z1 + 4, x1 + 5, z1 + 5, h); if (f === 0) rail(x1 + 4, z1, x1 + 5, z1 + 4, h); }
    else if (F === 'E') { tread(x1, z0 - 4, x1 + 4, z0, h); rail(x1, z0 - 5, x1 + 5, z0 - 4, h); }
    else if (F === 'N') { tread(x0 - 4, z0 - 4, x0, z0, h); rail(x0 - 5, z0 - 5, x0, z0 - 4, h); rail(x0 - 5, z0 - 4, x0 - 4, z0, h); }
    else { tread(x0 - 4, z1, x0, z1 + 4, h); rail(x0 - 5, z1, x0 - 4, z1 + 5, h); rail(x0 - 4, z1 + 4, x0, z1 + 5, h); }
  }
}

// ---------------------------------------------------------------- atolyeler
// doors: [yuz, a0, a1] zemin kati kapilari; padGap: cati korkulugunda ped inis acikligi
function workshop(g, out, B, doors, rackSide, padGap) {
  const { x0, x1, z0, z1 } = B, H = G + 24;
  g.box(x0, G - 1, z0, x1, G, z1, M.CONCRETE);
  g.box(x0, G, z0, x1, H, z0 + 2, M.FBRICK); g.box(x0, G, z1 - 2, x1, H, z1, M.FBRICK);
  g.box(x0, G, z0, x0 + 2, H, z1, M.FBRICK); g.box(x1 - 2, G, z0, x1, H, z1, M.FBRICK);
  // kat kusagi (iki kat gorunumu) ve iki sira pencere
  g.box(x0 - 1, G + 13, z0 - 1, x1 + 1, G + 14, z0, M.WOOD); g.box(x0 - 1, G + 13, z1, x1 + 1, G + 14, z1 + 1, M.WOOD);
  g.box(x0 - 1, G + 13, z0, x0, G + 14, z1, M.WOOD); g.box(x1, G + 13, z0, x1 + 1, G + 14, z1, M.WOOD);
  const isDoor = (side, a) => doors.some(([s, a0, a1]) => s === side && a + 5 > a0 - 2 && a < a1 + 2);
  for (const side of ['n', 's', 'w', 'e']) {
    const ns = side === 'n' || side === 's', a0 = ns ? x0 : z0, a1 = ns ? x1 : z1;
    for (let a = a0 + 7; a + 5 <= a1 - 5; a += 14) {
      for (const [ya, yb] of [[G + 5, G + 11], [G + 16, G + 21]]) {
        if (ya < G + 12 && isDoor(side, a)) continue;
        if (side === 'n') g.box(a, ya, z0, a + 5, yb, z0 + 2, 0); else if (side === 's') g.box(a, ya, z1 - 2, a + 5, yb, z1, 0);
        else if (side === 'w') g.box(x0, ya, a, x0 + 2, yb, a + 5, 0); else g.box(x1 - 2, ya, a, x1, yb, a + 5, 0);
      }
    }
  }
  for (const [s, a0, a1] of doors) {
    if (s === 'n') g.box(a0, G, z0, a1, G + 12, z0 + 2, 0); else if (s === 's') g.box(a0, G, z1 - 2, a1, G + 12, z1, 0);
    else if (s === 'w') g.box(x0, G, a0, x0 + 2, G + 12, a1, 0); else g.box(x1 - 2, G, a0, x1, G + 12, a1, 0);
  }
  // ahsap cati ve korkuluk
  g.box(x0, H, z0, x1, ROOF, z1, M.ROOF);
  g.box(x0, ROOF, z0, x1, ROOF + 3, z0 + 2, M.FBRICK); g.box(x0, ROOF, z1 - 2, x1, ROOF + 3, z1, M.FBRICK);
  g.box(x0, ROOF, z0, x0 + 2, ROOF + 3, z1, M.FBRICK); g.box(x1 - 2, ROOF, z0, x1, ROOF + 3, z1, M.FBRICK);
  if (padGap) {
    const [s, a0, a1] = padGap;
    if (s === 'e') g.box(x1 - 2, ROOF, a0, x1, ROOF + 3, a1, 0); else if (s === 's') g.box(a0, ROOF, z1 - 2, a1, ROOF + 3, z1, 0);
  }
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
  for (const [dx, dz] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) g.box(cx + dx + 8, ROOF, cz + dz + 6, cx + dx + 10, ROOF + 4, cz + dz + 8, M.TUBE);
  // tavanda calisma lambasi
  g.box(cx - 1, H - 2, cz - 1, cx + 1, H, cz + 1, M.LAMP);
  out.lights.push({ x: cx * VS, y: (H - 3) * VS, z: cz * VS, color: 0xffd6a0, intensity: 9, distance: 15, voxR: 2 });
  // tezgahlar (1 m)
  const bench = (bx, bz, alongX) => {
    const [w, d] = alongX ? [10, 4] : [4, 10];
    g.box(bx, G + 3, bz, bx + w, G + 4, bz + d, M.WOOD);
    for (const [lx, lz] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) g.box(bx + lx, G, bz + lz, bx + lx + 1, G + 3, bz + lz + 1, M.WOOD);
  };
  const along = rackSide === 'n' || rackSide === 's';
  if (along) { bench(cx - 20, cz + 2, true); bench(cx + 10, cz + 2, true); }
  else { const bx = cx - 2 + (rackSide === 'w' ? 8 : -8); bench(bx, cz - 24, false); bench(bx, cz + 14, false); }
  // sandik rafi: duvar boyunca 8 sandik, cift sirada raf tahtasi ve ustunde ikinci sandik
  const r0 = (along ? x0 : z0) + 10;
  for (let n = 0; n < 8; n++) {
    const a = r0 + n * 6;
    const [bx, bz] = rackSide === 'n' ? [a, z0 + 2] : rackSide === 's' ? [a, z1 - 6] : rackSide === 'w' ? [x0 + 2, a] : [x1 - 6, a];
    crate(g, out, bx, G, bz);
    if (n % 2) continue;
    if (along) { g.box(a - 1, G + 3, bz, a + 5, G + 4, bz + 4, M.WOOD); g.box(a - 1, G, bz, a, G + 8, bz + 1, M.WOOD); }
    else { g.box(bx, G + 3, a - 1, bx + 4, G + 4, a + 5, M.WOOD); g.box(bx, G, a - 1, bx + 1, G + 8, a, M.WOOD); }
    crate(g, out, bx, G + 4, bz);
  }
}

// fisek sandigi: 4x4x3 voxel (1 x 1 x 0.75 m), kirmizi ya da sari kagit
function crate(g, out, x0, y0, z0) {
  const m = hash3(x0, y0, z0) > 0.5 ? M.FW_CRATE : M.FW_CRATE_Y;
  g.box(x0, y0, z0, x0 + 4, y0 + 3, z0 + 4, m);
  out.crates.push({ x0, y0, z0, m });
}

// palet ustunde sandik yigini: nx x nz taban (aralik 5), ikinci kat ortada
function stack(g, out, x0, z0, nx, nz, two = true) {
  g.box(x0 - 1, G, z0 - 1, x0 + nx * 5, G + 1, z0 + nz * 5, M.WOOD);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) crate(g, out, x0 + i * 5, G + 1, z0 + j * 5);
  if (two) for (let i = 0; i < nx - 1; i++) crate(g, out, x0 + i * 5 + 2, G + 4, z0 + ((nz - 1) * 5 >> 1));
}

// ---------------------------------------------------------------- barut depolari
function depot(g, out, D, doors) {
  const { x0, x1, z0, z1 } = D;
  g.box(x0 - 3, G - 1, z0 - 3, x1 + 3, G, z1 + 3, M.CONCRETE);
  g.box(x0, G, z0, x1, G + 12, z1, M.BUNKER);
  g.box(x0 + 3, G, z0 + 3, x1 - 3, G + 9, z1 - 3, 0);
  g.box(x0 + 14, G + 12, z0 + 14, x0 + 20, G + 15, z0 + 20, M.BUNKER);   // havalandirma bacasi
  for (const [s, a0, a1] of doors) {
    // kalin celik kapi: aciklik 8 x 8 voxel, kanat disari acik (duvara dik)
    if (s === 'e') { g.box(x1 - 3, G, a0, x1, G + 8, a1, 0); g.box(x1, G, a1, x1 + 7, G + 8, a1 + 2, M.METAL); }
    else if (s === 'w') { g.box(x0, G, a0, x0 + 3, G + 8, a1, 0); g.box(x0 - 7, G, a1, x0, G + 8, a1 + 2, M.METAL); }
    else if (s === 's') { g.box(a0, G, z1 - 3, a1, G + 8, z1, 0); g.box(a1, G, z1, a1 + 2, G + 8, z1 + 7, M.METAL); }
    else { g.box(a0, G, z0, a1, G + 8, z0 + 3, 0); g.box(a1, G, z0 - 7, a1 + 2, G + 8, z0, M.METAL); }
  }
  // uyari levhalari: her yuzde ikiser (kapinin ustune gelmez)
  const free = (s, a) => !doors.some(([d, a0, a1]) => d === s && a + 4 > a0 - 1 && a < a1 + 1);
  for (const t of [0.25, 0.75]) {
    const ax = Math.round(x0 + (x1 - x0) * t) - 2, az = Math.round(z0 + (z1 - z0) * t) - 2;
    if (free('n', ax)) g.box(ax, G + 2, z0 - 1, ax + 4, G + 6, z0, M.WARN);
    if (free('s', ax)) g.box(ax, G + 2, z1, ax + 4, G + 6, z1 + 1, M.WARN);
    if (free('w', az)) g.box(x0 - 1, G + 2, az, x0, G + 6, az + 4, M.WARN);
    if (free('e', az)) g.box(x1, G + 2, az, x1 + 1, G + 6, az + 4, M.WARN);
  }
  // icerde barut ficilari ve cuvallar
  const cx = (x0 + x1) >> 1, cz = (z0 + z1) >> 1;
  for (const [dx, dz] of [[-8, -8], [-3, -9], [-9, -2], [6, -8], [8, 6], [-7, 7]]) g.cyl(cx + dx, cz + dz, 2.2, G, G + 4, M.KEG);
  g.cyl(cx - 8, cz - 8, 2.2, G + 4, G + 8, M.KEG);
  for (const [dx, dz] of [[2, 2], [2, 5], [6, 2], [3, -2]]) g.box(cx + dx, G, cz + dz, cx + dx + 4, G + 2, cz + dz + 2, M.POWDER);
  g.box(cx + 3, G + 2, cz + 3, cx + 7, G + 4, cz + 5, M.POWDER);
  // kapinin ustunde kirmizi uyari isigi
  const [s0, a0, a1] = doors[0], am = (a0 + a1) / 2;
  const L = s0 === 'e' ? [x1 + 2, am] : s0 === 'w' ? [x0 - 2, am] : s0 === 's' ? [am, z1 + 2] : [am, z0 - 2];
  out.lights.push({ x: L[0] * VS, y: (G + 10) * VS, z: L[1] * VS, color: 0xff3a22, intensity: 5, distance: 11, voxR: 0 });
  // kural verisi (fx/fireworks.js): bina kutusu (voxel), patlama merkezi (m), yeniden kurulum bolgesi
  out.fw.depots.push({ box: [x0, G, z0, x1, G + 12, z1], c: [cx * VS, (G + 4) * VS, cz * VS], snap: [x0 - 8, G - 1, z0 - 8, x1 + 8, G + 16, z1 + 8] });
}

// ---------------------------------------------------------------- avlu: sundurma, yiginlar, arabalar, rampa, su kulesi
function shed(g) {
  const { x0, x1, z0, z1, top } = SHED;
  g.box(x0, G - 1, z0, x1, G, z1, M.CONCRETE);
  g.box(x0, G, z0, x1, top - 2, z1, M.FBRICK);
  g.box(x0 + 2, G, z0 + 2, x1 - 2, top - 2, z1 - 2, 0);
  g.box(x0, top - 2, z0, x1, top, z1, M.ROOF);
  g.box(94, G, z0, 102, G + 10, z0 + 2, 0);
  for (const a of [88, 104]) g.box(a, G + 4, z0, a + 4, G + 8, z0 + 2, 0);
  g.box(x0 + 4, G + 3, z0 + 12, x1 - 4, G + 4, z0 + 16, M.WOOD);       // paketleme tezgahi
  for (const lx of [x0 + 4, x1 - 5]) for (const lz of [z0 + 12, z0 + 15]) g.box(lx, G, lz, lx + 1, G + 3, lz + 1, M.WOOD);
  g.box(x0 + 3, G, z1 - 6, x0 + 7, G + 2, z1 - 4, M.POWDER);
}

function cart(g, x, z, alongX) {
  const [w, d] = alongX ? [8, 5] : [5, 8];
  g.box(x, G + 2, z, x + w, G + 3, z + d, M.WOOD);
  g.box(x, G + 3, z, x + w, G + 5, z + 1, M.WOOD); g.box(x, G + 3, z + d - 1, x + w, G + 5, z + d, M.WOOD);
  g.box(x, G + 3, z, x + 1, G + 5, z + d, M.WOOD); g.box(x + w - 1, G + 3, z, x + w, G + 5, z + d, M.WOOD);
  if (alongX) {
    g.box(x + 3, G, z - 1, x + 5, G + 3, z, M.METAL); g.box(x + 3, G, z + d, x + 5, G + 3, z + d + 1, M.METAL);
    g.line(x + w, G + 2, z + 1, x + w + 4, G + 1, z + 1, M.WOOD); g.line(x + w, G + 2, z + d - 2, x + w + 4, G + 1, z + d - 2, M.WOOD);
  } else {
    g.box(x - 1, G, z + 3, x, G + 3, z + 5, M.METAL); g.box(x + w, G, z + 3, x + w + 1, G + 3, z + 5, M.METAL);
    g.line(x + 1, G + 2, z + d, x + 1, G + 1, z + d + 4, M.WOOD); g.line(x + w - 2, G + 2, z + d, x + w - 2, G + 1, z + d + 4, M.WOOD);
  }
}

function yard(g, out) {
  // palet ustunde sandik yiginlari (fitil diregi yanindakiler zinciri depoya tasir)
  stack(g, out, 156, 242, 3, 2);           // guney avlu: 1. fitilin diregi
  stack(g, out, 196, 214, 3, 2);           // guneydogu
  stack(g, out, 222, 236, 3, 2);
  stack(g, out, 276, 148, 1, 2, false);    // dogu ara sokak: 3. fitilin diregi
  crate(g, out, 110, G, 62); crate(g, out, 116, G, 62);   // 2. fitilin basi (kuzey atolye ici)
  // kulenin dibinde (bati ve dogu kemerlerin onunde)
  for (const z of [134, 150]) crate(g, out, 120, G, z);
  g.box(119, G, 141, 125, G + 3, 147, M.WOOD);
  crate(g, out, 120, G + 3, 142);
  for (const z of [134, 150]) crate(g, out, 166, G, z);
  // dogu atolyenin catisinda sandiklar (havan tuplerinin yaninda)
  for (const [x, z] of [[232, 162], [237, 162], [232, 167]]) crate(g, out, x, ROOF, z);
  // el arabalari, ficilar
  cart(g, 182, 228, true); cart(g, 92, 200, false); cart(g, 250, 80, true);
  for (const [x, z] of [[186, 214], [190, 218], [214, 254], [262, 192], [76, 210], [204, 94]]) g.cyl(x, z, 2.2, G, G + 4, M.KEG);
  // yukleme rampasi (dogu atolyenin bati yuzu): 1 m'lik platform, iki ucta 0.5 m'lik basamak
  g.box(206, G, 112, W3.x0, G + 4, 176, M.CONCRETE);
  g.box(206, G, 176, W3.x0, G + 2, 180, M.CONCRETE); g.box(206, G, 108, W3.x0, G + 2, 112, M.CONCRETE);
  g.box(206, G + 3, 112, 207, G + 4, 176, M.HAZARD);
  // su kulesi: dort celik ayak, caprazlar, ahsap tank, konik cati
  const wx = 258, wz = 258;
  for (const [dx, dz] of [[-8, -8], [6, -8], [-8, 6], [6, 6]]) g.box(wx + dx, G, wz + dz, wx + dx + 2, G + 37, wz + dz + 2, M.STEEL);
  for (const y of [G + 12, G + 26]) {
    g.line(wx - 7, y, wz - 8, wx + 7, y + 6, wz - 8, M.STEEL); g.line(wx - 7, y, wz + 7, wx + 7, y + 6, wz + 7, M.STEEL);
    g.line(wx - 8, y, wz - 7, wx - 8, y + 6, wz + 7, M.STEEL); g.line(wx + 7, y, wz - 7, wx + 7, y + 6, wz + 7, M.STEEL);
  }
  g.cyl(wx, wz, 11, G + 36, G + 38, M.WOOD);
  g.cyl(wx, wz, 11, G + 38, G + 52, M.WOOD, true);
  for (let k = 0; k < 7; k++) g.cyl(wx, wz, 11 - k * 1.6, G + 52 + k, G + 53 + k, M.ROOF);
  for (const y of [G + 42, G + 48]) g.cyl(wx, wz, 11.4, y, y + 1, M.METAL, true);
}

// ---------------------------------------------------------------- celik gecitler (catilar -> kule merdiveni)
// izgara tabani yuruyus seridinin iki yanina tasar, korkuluklar tabanin ustunde (yapisal butunluk)
function catwalks(g) {
  const T = (x0, z0, x1, z1) => g.box(x0, ROOF - 2, z0, x1, ROOF, z1, M.GRATE);
  const Rl = (x0, z0, x1, z1) => g.box(x0, ROOF, z0, x1, ROOF + 3, z1, M.STEEL);
  const gap = (x0, z0, x1, z1) => g.box(x0, ROOF, z0, x1, ROOF + 4, z1, 0);
  // kuzey atolye catisi -> kule merdiveninin kuzey yuzu (ilk basamak cati yuksekliginde)
  T(151, W1.z1, 157, TW.z0 - 4); Rl(151, W1.z1, 152, TW.z0 - 4); Rl(156, W1.z1, 157, TW.z0 - 4);
  g.box(152, G, 98, 156, ROOF - 2, 100, M.STEEL);
  gap(152, W1.z1 - 2, 156, W1.z1);
  // dogu atolye catisi -> kule merdiveninin kuzeydogu sahanligi (0.5 m asagida)
  T(TW.x1 + 4, 127, W3.x0, 133); Rl(TW.x1 + 4, 127, W3.x0, 128); Rl(TW.x1 + 4, 132, W3.x0, 133);
  g.box(190, G, 128, 192, ROOF - 2, 132, M.STEEL);
  gap(W3.x0, 128, W3.x0 + 2, 132);
  // kuzey atolye -> bati atolye: L gecit (catilara korkuluk koselerinden uzakta girer: govde kosede sikismasin)
  T(105, W1.z1, 111, 109); T(W2.x1, 103, 111, 109);
  Rl(110, W1.z1, 111, 109); Rl(W2.x1, 108, 111, 109); Rl(105, W1.z1, 106, 103); Rl(W2.x1, 103, 106, 104);
  g.box(106, G, 104, 110, ROOF - 2, 108, M.STEEL);
  gap(106, W1.z1 - 2, 110, W1.z1); gap(W2.x1 - 2, 104, W2.x1, 108);
}

// ---------------------------------------------------------------- fener zincirleri (kuleyi cevreleyen dort direk)
function chains(g, out) {
  for (let i = 0; i < 4; i++) {
    const [ax, az] = POSTS[i], [bx, bz] = POSTS[(i + 1) % 4];
    const A = [ax + 1, G + 24, az + 1], B = [bx + 1, G + 24, bz + 1];
    const L = Math.max(Math.abs(B[0] - A[0]), Math.abs(B[2] - A[2]));
    let prev = A;
    for (let s = 1; s <= L; s++) {
      const t = s / L;
      const p = [Math.round(A[0] + (B[0] - A[0]) * t), Math.round(G + 24 - 20 * t * (1 - t)), Math.round(A[2] + (B[2] - A[2]) * t)];
      g.line(prev[0], prev[1], prev[2], p[0], p[1], p[2], M.CORD);
      if (s % 9 === 0 && s < L - 3) g.box(p[0], p[1] - 3, p[2], p[0] + 2, p[1], p[2] + 2, M.LANTERN);
      prev = p;
    }
    // zincirin ortasindaki fenerin isigi (fener kirilinca soner: voxR)
    const m = Math.round(L / 18) * 9, t = m / L;
    const px = Math.round(A[0] + (B[0] - A[0]) * t), py = Math.round(G + 24 - 20 * t * (1 - t)), pz = Math.round(A[2] + (B[2] - A[2]) * t);
    out.lights.push({ x: (px + 1) * VS, y: (py - 2) * VS, z: (pz + 1) * VS, color: 0xff8a3c, intensity: 8, distance: 15, voxR: 3 });
  }
  // direkler ipten sonra (ipin ilk voxelleri diregin icinde kalmasin)
  for (const [x, z] of POSTS) {
    g.box(x, G, z, x + 2, G + 26, z + 2, M.STEEL);
    g.box(x - 1, G + 26, z - 1, x + 3, G + 27, z + 3, M.STEEL);
    g.box(x, G + 27, z, x + 2, G + 30, z + 2, M.LANTERN);
  }
}

// ---------------------------------------------------------------- barut fitilleri
// yol: eksene paralel parcalar; hucreler sirali (ilk hucre kirmizi diregin dibinde, son hucre deponun kapisinda)
function fuses(g, out) {
  const defs = [
    // 1: guney avlu -> sundurmanin dogu duvarina tirmanir, catisindan gecer, bati duvarindan iner -> guneybati depo
    { depot: 0, post: [151, G, 239, 153, G + 8, 241], path: [[150, G, 238], [112, G, 238], [112, SHED.top, 238], [83, SHED.top, 238], [83, G, 238], [D1.x1, G, 238]] },
    // 2: kuzey atolyenin icinden (guney duvar dibi, dogu duvar dibi, dogu kapi) -> kuzeydogu depo (bati kapi)
    { depot: 1, post: [105, G, 67, 107, G + 8, 69], path: [[107, G, 69], [W1.x1 - 3, G, 69], [W1.x1 - 3, G, 44], [D2.x0 - 1, G, 44]] },
    // 3: dogu ara sokak (dogu atolyenin duvar dibi) -> kuzeydogu depo (guney kapi)
    { depot: 1, post: [269, G, 151, 271, G + 8, 153], path: [[W3.x1, G, 150], [W3.x1, G, 70], [252, G, 70], [252, G, D2.z1]] },
  ];
  for (const d of defs) {
    const cells = [];
    for (let k = 0; k + 1 < d.path.length; k++) {
      let [x, y, z] = d.path[k];
      const [bx, by, bz] = d.path[k + 1];
      if (k === 0) cells.push(x, y, z);
      while (x !== bx || y !== by || z !== bz) {
        if (x !== bx) x += Math.sign(bx - x); else if (y !== by) y += Math.sign(by - y); else z += Math.sign(bz - z);
        cells.push(x, y, z);
      }
    }
    for (let i = 0; i < cells.length; i += 3) g.set(cells[i], cells[i + 1], cells[i + 2], M.FUSE);
    const [a, b, c, e, f, h] = d.post;
    g.box(a, b, c, e, f, h, M.FUSE_POST);
    g.box(a, f, c, e, f + 1, h, M.LANTERN);
    out.fw.fuses.push({ cells, post: d.post, depot: d.depot });
  }
}

// ---------------------------------------------------------------- pedler, ogeler, dogma noktalari
function padAt(g, out, px, pz, tx, ty, tz, apex) {
  for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
    const inner = x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4;
    g.set(x, G - 1, z, inner ? M.PAD : M.HAZARD);
  }
  out.pads.push({ x: px * VS, y: G * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
}

function pads(g, out) {
  padAt(g, out, 116, 120, 130, G + 36, 130, 4.0);     // kulenin ortasina: merdivenin kuzeybati sahanligi (9 m; dik inis: korkuluga takilmasin)
  padAt(g, out, 86, 150, 44, ROOF, 150, 2.0);         // bati atolye catisina
  padAt(g, out, 252, 204, 246, ROOF, 172, 2.0);       // dogu atolye catisina
}

const P = (x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

// (x,z) cevresinde yukaridan (yTop) ilk duz ve bos zemin
function findGround(g, x, z, R = 6, yTop = 40) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    if (X < 6 || Z < 6 || X >= g.sx - 6 || Z >= g.sz - 6) continue;
    let y = yTop;
    while (y > 2 && !g.get(X, y - 1, Z)) y--;
    if (y <= 2) continue;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) if (g.get(X + xx, y + k, Z + zz) !== 0) ok = false;
    for (let zz = -1; zz <= 1 && ok; zz++) for (let xx = -1; xx <= 1 && ok; xx++) { const m = g.get(X + xx, y - 1, Z + zz); if (!m || m === M.FUSE || m === M.PAD || m === M.FW_CRATE || m === M.FW_CRATE_Y) ok = false; }
    if (ok) return [X, y, Z];
  }
  return null;
}

function placeItems(g, out) {
  const add = (type, x, z, yTop, R = 4) => { const p = findGround(g, x, z, R, yTop); if (p) out.items.push({ type, ...P(p[0], p[1], p[2]) }); };
  out.items.push({ type: 'quad', ...P(143, TW.top, 143) });
  add('mega', 144, 144, G + 2, 3);                    // kulenin zemin kat salonu
  add('armor', 170, 40, ROOF + 1, 3);                 // kuzey atolye catisi
  add('armor', 40, 170, G + 2, 3);                    // bati atolye ici
  for (const [x, z] of [[240, 120], [98, 238], [60, 60], [240, 274], [124, 56]]) add('health', x, z, G + 2, 3);
  for (const [x, z] of [[196, 124], [76, 196], [200, 38], [144, 200], [30, 204], [276, 120]]) add('ammo', x, z, G + 2, 3);
}

function placeSpawns(g, out) {
  const cx = 144, cz = 144;
  const yawTo = (x, z) => Math.atan2(-(cx - x), -(cz - z));
  // sandik kumelerinden (5 m) ve barut depolarindan (12.5 m) uzak
  const far = (x, z, y) => {
    for (const c of out.crates) if (Math.hypot(c.x0 + 2 - x, c.z0 + 2 - z, (c.y0 - y) * 0.5) < 20) return false;
    for (const d of out.fw.depots) if (Math.hypot(d.c[0] / VS - x, d.c[2] / VS - z) < 50) return false;
    return true;
  };
  const cand = [
    [40, 40, G + 2], [80, 40, G + 2], [206, 86, G + 2], [96, 96, G + 2], [196, 100, G + 2], [96, 150, G + 2], [192, 150, G + 2],
    [120, 206, G + 2], [176, 184, G + 2], [140, 268, G + 2], [196, 264, G + 2], [272, 230, G + 2], [14, 150, G + 2], [276, 96, G + 2],
    [144, 56, G + 2], [52, 144, G + 2], [238, 144, G + 2], [130, 44, ROOF + 1], [44, 124, ROOF + 1], [250, 120, ROOF + 1], [100, 268, G + 2],
  ];
  for (const [x, z, yTop] of cand) {
    const p = findGround(g, x, z, 4, yTop);
    if (!p || !far(p[0], p[2], p[1])) continue;
    out.spawns.push({ ...P(p[0], p[1], p[2]), yaw: yawTo(p[0], p[2]) });
  }
}
