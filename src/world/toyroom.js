// Oyuncak Odasi haritasi: oyuncular dev bir cocuk odasinda ~18 cm'lik robotlardir (olcek ~1:10; 7 x 7 m'lik oda
// 70 x 70 m). Gun isigi kuzey duvarindaki genis pencereden girer (perdeler iki yana toplanmis, genis pervaz).
// Yerlesim: kuzeyde kitaplik (raflar ve one tasan kitap yiginlari tirmanma yolu, tepesinden cetvel kopruyle
// gardirobun tepesine) ve gardirop (tepesinde KIYAMET kuresi, pedlerle cikilir); doguda yatak (silte ve nevresim
// ziplak: dev trambolin; alti yurunur, altinda MEGA), komodin + gece lambasi, yataga tirmanilan blok basamaklar ve
// ayakucuna dayali dev boya kalemi; batida calisma masasi (masa lambasi, kalemlik, kitaplar) ve sandalye; ortada
// rampali yaris pistli hali ve oyuncak arabalar; guneybatida oyuncak kale; guneyde kale kapisindan kivrilarak giden
// domino dizisi ve sonunda blok kule (devrilince haliya yikilir); guneydoguda oyuncak sandigi, pelus ayi, lastik top;
// guney duvarinda kapi. Duvarlar ve tavan: ic kat yikilir (duvar kagidi / siva), dis kat yikilmaz tugla.
// Tum yerlesim voxel biriminde; donen konumlar metre.
import { VS } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';
import { mulberry32 } from './mapgen.js';

const G0 = 3;                // parke ustu: ilk bos voxel (0.75 m). 0-1 sap (yikilmaz), 2 parke
const RUGY = 4;              // hali ustu (1.0 m)
const CEIL = 94;             // tavanin alt yuzu (94 siva, 95 yikilmaz)
const IN0 = 4, IN1 = 284;    // ic alan (x, z) [IN0, IN1)
const WIN = { x0: 88, x1: 152, y0: 38, y1: 78, sill: 38 };
const SHELF = { x0: 180, x1: 216, z0: 4, z1: 20, floors: [7, 23, 39, 55], top: 71 };
const WARD = { x0: 228, x1: 284, z0: 4, z1: 30, top: 79 };
const BED = { x0: 204, x1: 284, z0: 96, z1: 136, top: 25 };
const DESK = { x0: 4, x1: 28, z0: 104, z1: 152, top: 33 };
const RUG = { x0: 56, x1: 200, z0: 112, z1: 216 };
const CASTLE = { x0: 12, x1: 60, z0: 224, z1: 276, wall: 19 };
const DOOR = { x0: 176, x1: 208, y1: 75 };
const BLOCK_MATS = [M.BLOCK_R, M.BLOCK_B, M.BLOCK_Y, M.BLOCK_G];
// domino dizisi (m): kale kapisinin onunden doguya kivrilip kuzeye donen Bezier; aralik 1.25 m, sonunda blok kule
const CHAIN = { p0: [17.5, 66.5], p1: [29, 66.5], p2: [40.5, 70], p3: [40.5, 59.6], step: 1.25, gap: 1.45 };

export const TOY_LAYOUT = { G0, RUGY, CEIL, WIN, SHELF, WARD, BED, DESK, RUG, CASTLE, DOOR, CHAIN };

class Gen {
  constructor(world, seed) {
    this.w = world; this.sx = world.sx; this.sy = world.sy; this.sz = world.sz;
    this.rng = mulberry32(seed);
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
  // elipsoit (merkez ve yaricaplar voxel); fn(x,y,z) -> malzeme (0: atla)
  blob(cx, cy, cz, rx, ry, rz, fn) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let z = Math.floor(cz - rz); z <= cz + rz; z++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, dz = (z + 0.5 - cz) / rz;
      if (dx * dx + dy * dy + dz * dz > 1) continue;
      const m = typeof fn === 'function' ? fn(x, y, z, dx, dy, dz) : fn;
      if (m) this.set(x, y, z, m);
    }
  }
  // iki nokta arasi silindir / koni (yaricap r0 -> r1)
  rod(ax, ay, az, bx, by, bz, r0, r1, m) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
    const R = Math.max(r0, r1) + 1;
    const x0 = Math.floor(Math.min(ax, bx) - R), x1 = Math.ceil(Math.max(ax, bx) + R);
    const y0 = Math.floor(Math.min(ay, by) - R), y1 = Math.ceil(Math.max(ay, by) + R);
    const z0 = Math.floor(Math.min(az, bz) - R), z1 = Math.ceil(Math.max(az, bz) + R);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
      const t = (px * dx + py * dy + pz * dz) / (L * L);
      if (t < 0 || t > 1) continue;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      const r = r0 + (r1 - r0) * t;
      if (qx * qx + qy * qy + qz * qz <= r * r) this.set(x, y, z, typeof m === 'function' ? m(t, x, y, z) : m);
    }
  }
}

export function generateToyroom(world, seed = 1) {
  const g = new Gen(world, seed);
  world.mat.fill(0); world.dmg.fill(0);
  const out = {
    spawns: [], items: [], pads: [], lights: [], seed, names: ['Oyuncak Odasi'],
    env: 'toyroom', quadWhere: 'quadWhereToyroom',
    // gardirobun (19 m) ve kitapligin tepesinden inis (dusus hasari yok)
    navJump: { up: 5, drop: 80 },
    toy: null,
  };
  shell(g);
  windowNorth(g);
  curtains(g);
  door(g);
  ceilingLamp(g, out);
  bookshelf(g, out);
  wardrobe(g, out);
  ruler(g);
  bed(g);
  nightstand(g, out);
  bedSteps(g);
  desk(g, out);
  chair(g);
  rug(g);
  ramps(g);
  cars(g);
  crayons(g);
  blockCity(g);
  castle(g, out);
  toyBox(g, out);
  teddy(g);
  rubberBall(g);
  const chain = dominoPath();
  const tower = blockTower(g, chain);
  lightsMisc(g, out, tower);
  pads(g, out);
  placeItems(g, out, tower);
  placeSpawns(g, out, chain, tower);
  out.toy = {
    G0, chain, tower,
    decor: {
      clock: { x: (IN0 + 0.02) * VS, y: 17.2, z: 31.5, nx: 1, nz: 0, r: 2.4 },
      drawing: { x: (BED.x1 - 0.02) * VS, y: 15.2, z: 29, nx: -1, nz: 0, w: 7.5, h: 5.4 },
      window: { x0: WIN.x0 * VS, x1: WIN.x1 * VS, y0: WIN.y0 * VS, y1: WIN.y1 * VS, z: 1.0 * VS },
    },
  };
  world.seedCount = 0;
  world.removedCount = 0;
  return out;
}

// ---------------------------------------------------------------- oda kabugu
function shell(g) {
  const { sx, sz } = g;
  g.box(0, 0, 0, sx, 2, sz, M.SUBFLOOR);
  g.box(0, 2, 0, sx, 3, sz, M.PARQUET);
  // dis kat (yikilmaz tugla) ve tavan cekirdegi
  g.box(0, 0, 0, 2, 96, sz, M.WALLCORE); g.box(sx - 2, 0, 0, sx, 96, sz, M.WALLCORE);
  g.box(0, 0, 0, sx, 96, 2, M.WALLCORE); g.box(0, 0, sz - 2, sx, 96, sz, M.WALLCORE);
  g.box(0, 95, 0, sx, 96, sz, M.WALLCORE);
  // ic kat: duvar kagidi ve tavan sivasi
  g.box(2, G0, 2, IN0, CEIL, sz - 2, M.WALLPAPER); g.box(IN1, G0, 2, sx - 2, CEIL, sz - 2, M.WALLPAPER);
  g.box(2, G0, 2, sx - 2, CEIL, IN0, M.WALLPAPER); g.box(2, G0, IN1, sx - 2, CEIL, sz - 2, M.WALLPAPER);
  g.box(2, CEIL, 2, sx - 2, 95, sz - 2, M.CEILING);
  // supurgelik (0.5 m) ve tavan silmesi (iki kademe)
  const band = (y0, y1, d) => {
    g.box(IN0, y0, IN0, IN0 + d, y1, IN1, M.TRIM); g.box(IN1 - d, y0, IN0, IN1, y1, IN1, M.TRIM);
    g.box(IN0, y0, IN0, IN1, y1, IN0 + d, M.TRIM); g.box(IN0, y0, IN1 - d, IN1, y1, IN1, M.TRIM);
  };
  band(G0, G0 + 2, 1);
  band(CEIL - 2, CEIL, 1);
  band(CEIL - 1, CEIL, 2);
}

// kuzey duvarinda pencere: cam (saydam), beyaz cerceve, orta kayit ve kemer, ice tasan genis pervaz, pervaz kasasi
function windowNorth(g) {
  const { x0, x1, y0, y1 } = WIN;
  g.box(x0, y0, 0, x1, y1, IN0, 0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const jamb = x < x0 + 2 || x >= x1 - 2 || y >= y1 - 2;
    const mull = (x >= 119 && x < 121) || (y >= 62 && y < 64);
    if (jamb) for (let z = 0; z < IN0; z++) g.set(x, y, z, M.TRIM);
    else if (mull) { g.set(x, y, 1, M.TRIM); g.set(x, y, 2, M.TRIM); }
    else g.set(x, y, 1, M.GLASS);
  }
  // pervaz: duvarin icinden 1.75 m ice tasar (ustu yurunur)
  g.box(x0 - 4, y0 - 2, 0, x1 + 4, y0, IN0 + 7, M.TRIM);
  g.box(x0 - 3, y0 - 4, IN0, x1 + 3, y0 - 2, IN0 + 2, M.TRIM);
  // kasa (duvardan 1 voxel tasan cerceve)
  g.box(x0 - 2, y0, IN0, x0, y1 + 2, IN0 + 1, M.TRIM);
  g.box(x1, y0, IN0, x1 + 2, y1 + 2, IN0 + 1, M.TRIM);
  g.box(x0 - 2, y1, IN0, x1 + 2, y1 + 2, IN0 + 1, M.TRIM);
  // pervazda saksi: turuncu saksi, toprak, yesil bitki
  const px = 140, pz = 7;
  g.rod(px, y0, pz, px, y0 + 4, pz, 2.2, 2.7, M.PLASTIC_O);
  g.box(px - 1, y0 + 3, pz - 1, px + 2, y0 + 4, pz + 2, M.DIRT);
  for (const [dx, dz, h] of [[0, 0, 7], [-1, 1, 5], [1, -1, 6], [1, 1, 4]]) g.rod(px + 0.5 + dx, y0 + 4, pz + 0.5 + dz, px + 0.5 + dx * 1.8, y0 + 4 + h, pz + 0.5 + dz * 1.8, 0.9, 0.6, M.PLANT);
}

// perdeler: pencerenin iki yaninda yere kadar, dalgali kivrimlar; ahsap korniste asili
function curtains(g) {
  const rodY = 87;
  g.box(72, rodY - 1, 6, 168, rodY + 1, 8, M.FURN);
  for (const x of [74, 165]) g.box(x, rodY - 1, IN0, x + 1, rodY + 1, 6, M.TRIM);
  for (const x of [71, 168]) g.blob(x, rodY, 7, 2, 2, 2, M.PLASTIC_Y);
  for (const [xa, xb] of [[74, 88], [152, 166]]) {
    for (let x = xa; x < xb; x++) {
      const ph = (x - xa) * Math.PI * 2 / 5;
      for (let y = G0 + 1; y < rodY - 1; y++) {
        // kivrim derinligi asagida biraz acilir
        const k = 1.4 + 0.6 * (1 - (y - G0) / (rodY - G0));
        const zc = 8.5 + k * Math.sin(ph);
        for (let z = Math.floor(zc - 0.6); z <= Math.floor(zc + 0.6); z++) g.set(x, y, z, M.CURTAIN);
      }
      g.set(x, rodY - 1, 7, M.CURTAIN);
    }
  }
}

// guney duvarinda kapi: panelli boyali kanat, kasa, yuvarlak tokmak, yaninda lamba anahtari
function door(g) {
  const { x0, x1, y1 } = DOOR;
  g.box(x0, G0, IN1, x1, y1, IN1 + 2, M.PAINTED);
  // kasa
  g.box(x0 - 3, G0, IN1 - 1, x0, y1 + 3, IN1, M.TRIM);
  g.box(x1, G0, IN1 - 1, x1 + 3, y1 + 3, IN1, M.TRIM);
  g.box(x0 - 3, y1, IN1 - 1, x1 + 3, y1 + 3, IN1, M.TRIM);
  // paneller (1 voxel kabartma)
  for (const [ya, yb] of [[G0 + 6, 33], [40, y1 - 6]]) for (const [xa, xb] of [[x0 + 4, 190], [194, x1 - 4]]) {
    g.box(xa, ya, IN1 - 1, xb, yb, IN1, M.PAINTED);
  }
  g.blob(x1 - 4.5, 37.5, IN1 - 1.5, 1.6, 1.6, 1.6, M.PLASTIC_Y);
  g.box(x1 + 6, 34, IN1 - 1, x1 + 9, 38, IN1, M.TRIM);
  g.box(x1 + 7, 35, IN1 - 2, x1 + 8, 37, IN1 - 1, M.PAINTED);
}

// tavanin ortasinda sarkan kubbe abajur
function ceilingLamp(g, out) {
  const cx = 144, cz = 144;
  for (let y = 86; y < CEIL; y++) g.set(cx, y, cz, M.STEEL);
  for (let y = 78; y < 87; y++) for (let z = cz - 8; z <= cz + 8; z++) for (let x = cx - 8; x <= cx + 8; x++) {
    const d = Math.hypot(x + 0.5 - (cx + 0.5), (y + 0.5 - 78) * 1.25, z + 0.5 - (cz + 0.5));
    if (d >= 6.6 && d < 7.8 && y >= 79) g.set(x, y, z, M.SHADE);
  }
  g.box(cx - 1, 80, cz - 1, cx + 2, 83, cz + 2, M.LAMP);
  out.lights.push({ x: (cx + 0.5) * VS, y: 19.6, z: (cz + 0.5) * VS, color: 0xffe2b4, intensity: 55, distance: 52, voxR: 4 });
}

// ---------------------------------------------------------------- kitaplik
// 4 bolme (14 voxel = 3.5 m bos yukseklik); arkada dik kitaplar; her bolmede one tasan yatik kitap yiginlari
// (1, 2, 3 m) bir sonraki rafa merdiven olur (cift bolmelerde soldan saga, teklerde sagdan sola)
function bookshelf(g, out) {
  const { x0, x1, z0, z1, floors, top } = SHELF;
  const rng = g.rng;
  g.box(x0, G0, z0, x0 + 2, top, z1, M.FURN);
  g.box(x1 - 2, G0, z0, x1, top, z1, M.FURN);
  g.box(x0 + 2, G0, z0, x1 - 2, top, z0 + 1, M.FURN);
  g.box(x0 + 2, G0, z0 + 1, x1 - 2, floors[0], z1, M.FURN);
  for (let k = 1; k < floors.length; k++) g.box(x0 + 2, floors[k] - 2, z0 + 1, x1 - 2, floors[k], z1, M.FURN);
  g.box(x0, top - 2, z0, x1, top, z1, M.FURN);
  for (let k = 0; k < floors.length; k++) {
    const S = floors[k];
    // arka sira: dik duran kitaplar (1 voxel kalinlik), ara ara bosluk ve kucuk egik yigin
    for (let x = x0 + 2; x < x1 - 2; x++) {
      if (rng() < 0.12) continue;
      const h = 7 + ((rng() * 5) | 0), d = 6 + ((rng() * 3) | 0);
      g.box(x, S, z0 + 1, x + 1, S + h, z0 + 1 + d, M.BOOK);
    }
    // merdiven yiginlari (yatik kitaplar): rafin onunden 1.25 m tasar; en alcagi bolmenin bos tarafina bakar
    // (cift bolmelerde sola dogru, teklerde saga dogru yukselir: zikzak merdiven)
    const xs = k % 2 === 0 ? [x0 + 12, x0 + 8, x0 + 4] : [x1 - 16, x1 - 12, x1 - 8];
    xs.forEach((xa, j) => {
      const h = 4 * (j + 1);
      g.box(xa, S, 12, xa + 4, S + h, z1 + 5, M.BOOK_LAY);
    });
  }
  // tepede gardiroba cikan iki yigin (1 ve 2 m)
  g.box(x1 - 10, top, 7, x1 - 6, top + 4, 16, M.BOOK_LAY);
  g.box(x1 - 6, top, 7, x1 - 2, top + 8, 16, M.BOOK_LAY);
  // ust kenarda isik zinciri (kucuk lambalar)
  for (let x = x0 + 2; x < x1 - 2; x += 3) g.set(x, top - 3, z1, M.LAMP);
  out.lights.push({ x: (x0 + x1) * 0.5 * VS, y: (top - 4) * VS, z: (z1 + 4) * VS, color: 0xffd9a0, intensity: 6, distance: 12, voxR: 4 });
}

// cetvel kopru: kitapligin tepesindeki yigindan gardirobun tepesine
function ruler(g) {
  g.box(SHELF.x1 - 8, WARD.top, 9, WARD.x0 + 8, WARD.top + 1, 13, M.PLASTIC_Y);
}

// ---------------------------------------------------------------- gardirop
function wardrobe(g, out) {
  const { x0, x1, z0, z1, top } = WARD;
  g.box(x0 + 1, G0, z0, x1, G0 + 4, z1 - 1, M.PAINTED);                  // kaide
  g.box(x0, G0 + 4, z0, x0 + 2, top - 3, z1, M.PAINTED);                 // yanlar
  g.box(x1 - 2, G0 + 4, z0, x1, top - 3, z1, M.PAINTED);
  g.box(x0 + 2, G0 + 4, z0, x1 - 2, top - 3, z0 + 1, M.PAINTED);         // arka
  g.box(x0 + 2, G0 + 4, z0 + 1, x1 - 2, G0 + 6, z1, M.PAINTED);          // taban
  g.box(x0, top - 3, z0, x1, top, z1, M.PAINTED);                         // tavan
  g.box(x0 - 1, top - 2, z0, x1, top, z1 + 1, M.PAINTED);                 // tac kenari
  // kapaklar: iki kanat, ortada ince yarik; kabartma paneller, sari topuz
  const dy0 = G0 + 6, dy1 = top - 3, mid = (x0 + x1) >> 1;
  for (const [xa, xb] of [[x0 + 2, mid], [mid + 1, x1 - 2]]) {
    g.box(xa, dy0, z1 - 1, xb, dy1, z1, M.PAINTED);
    for (const [ya, yb] of [[dy0 + 5, 38], [44, dy1 - 5]]) g.box(xa + 4, ya, z1, xb - 4, yb, z1 + 1, M.PAINTED);
  }
  g.box(mid - 3, 40, z1, mid - 1, 43, z1 + 2, M.PLASTIC_Y);
  g.box(mid + 2, 40, z1, mid + 4, 43, z1 + 2, M.PLASTIC_Y);
  // icerde askilik ve renkli giysiler (kapak kirilinca gorunur)
  g.box(x0 + 2, 66, 16, x1 - 2, 67, 17, M.STEEL);
  const cloth = [M.RUG, M.CURTAIN, M.DUVET, M.PILLOW, M.FUR_LIGHT, M.TRACK, M.RUG];
  for (let k = 0; k < cloth.length; k++) {
    const xc = x0 + 8 + k * 7;
    g.box(xc - 2, 44, 10, xc + 2, 65, 23, cloth[k]);
    g.box(xc - 4, 58, 10, xc + 4, 65, 23, cloth[k]);
  }
  out.lights.push({ x: (x0 + x1) * 0.5 * VS, y: (top + 10) * VS, z: (z0 + z1) * 0.5 * VS, color: 0xfff1de, intensity: 5, distance: 11, voxR: 0 });
}

// ---------------------------------------------------------------- yatak
// ayaklar, cerceve, silte (ziplak), ustu ve yanlari nevresim (ziplak), iki yastik; basucu duvara dayali yuksek tahta
function bed(g) {
  const { x0, x1, z0, z1 } = BED;
  for (const [lx, lz] of [[x0, z0], [x0, z1 - 4], [x0 + 36, z0], [x0 + 36, z1 - 4]]) g.box(lx, G0, lz, lx + 4, 12, lz + 4, M.FURN);
  g.box(x0, 12, z0, x1 - 4, 14, z1, M.FURN);
  // silte: ust kenarlari yuvarlatilmis
  for (let z = z0; z < z1; z++) for (let x = x0 + 2; x < x1 - 4; x++) {
    const e = Math.min(z - z0, z1 - 1 - z, x - (x0 + 2), x1 - 5 - x);
    for (let y = 14; y < 24; y++) { if (e === 0 && y >= 23) continue; g.set(x, y, z, M.MATTRESS); }
  }
  // nevresim: ust kat + yanlardan sarkan kenarlar; basucuna dogru katlanmis rulo
  const dx1 = x1 - 20;
  g.box(x0 + 2, 24, z0, dx1, 25, z1, M.DUVET);
  g.box(x0 + 2, 16, z0 - 1, dx1, 25, z0, M.DUVET);
  g.box(x0 + 2, 16, z1, dx1, 25, z1 + 1, M.DUVET);
  g.box(dx1 - 3, 25, z0 + 1, dx1, 26, z1 - 1, M.DUVET);
  // basucu: kemerli yuksek tahta (duvara dayali)
  for (let z = z0 - 1; z <= z1; z++) {
    const u = (z + 0.5 - (z0 + z1) / 2) / ((z1 - z0) / 2 + 1);
    const h = 36 + Math.round(9 * Math.sqrt(Math.max(0, 1 - u * u)));
    g.box(x1 - 4, G0, z, x1, h, z + 1, M.FURN);
  }
  // ayakucu
  for (let z = z0; z < z1; z++) {
    const u = (z + 0.5 - (z0 + z1) / 2) / ((z1 - z0) / 2);
    g.box(x0, G0, z, x0 + 2, 29 + Math.round(2 * Math.sqrt(Math.max(0, 1 - u * u))), z + 1, M.FURN);
  }
  // yastiklar
  for (const zc of [107, 125]) g.blob(x1 - 11.5, 26.2, zc, 6.5, 2.8, 7.5, M.PILLOW);
}

function nightstand(g, out) {
  const x0 = 262, x1 = 282, z0 = 70, z1 = 92;
  g.box(x0, G0, z0, x1, 23, z1, M.PAINTED);
  g.box(x0 + 2, 6, z1, x1 - 2, 13, z1 + 1, M.PAINTED);
  g.box(x0 + 2, 15, z1, x1 - 2, 21, z1 + 1, M.PAINTED);
  g.box(271, 9, z1 + 1, 273, 11, z1 + 2, M.PLASTIC_Y);
  g.box(271, 17, z1 + 1, 273, 19, z1 + 2, M.PLASTIC_Y);
  // gece lambasi: turuncu ayak, govde, isikli abajur (ici ampul)
  const cx = 272, cz = 79;
  g.rod(cx + 0.5, 23, cz + 0.5, cx + 0.5, 25, cz + 0.5, 3, 2.4, M.PLASTIC_O);
  g.box(cx, 25, cz, cx + 1, 34, cz + 1, M.FURN);
  for (let y = 33; y < 42; y++) {
    const r = 5.6 - (y - 33) * 0.25;
    for (let z = cz - 7; z <= cz + 7; z++) for (let x = cx - 7; x <= cx + 7; x++) {
      const d = Math.hypot(x + 0.5 - (cx + 0.5), z + 0.5 - (cz + 0.5));
      if (d < r && d >= r - 1.2) g.set(x, y, z, M.SHADE);
    }
  }
  g.box(cx - 1, 35, cz - 1, cx + 2, 38, cz + 2, M.LAMP);
  out.lights.push({ x: (cx + 0.5) * VS, y: 37 * VS, z: (cz + 0.5) * VS, color: 0xffb25e, intensity: 9, distance: 15, voxR: 3 });
}

// yatagin guney kenarinda blok basamaklar (1..5 m) + yatagin ayakucuna dayali kirmizi boya kalemi (rampa)
function bedSteps(g) {
  for (let k = 0; k < 5; k++) {
    const xa = 212 + k * 4;
    for (let b = 0; b <= k; b++) g.box(xa, G0 + b * 4, 137, xa + 4, G0 + b * 4 + 4, 143, BLOCK_MATS[(k + b) % 4]);
  }
}

// ---------------------------------------------------------------- masa + sandalye
function desk(g, out) {
  const { x0, x1, z0, z1, top } = DESK;
  g.box(x0, top - 2, z0, x1, top, z1, M.FURN);                             // tabla
  g.box(x0, G0, z0, x1, top - 2, z0 + 12, M.FURN);                          // cekmeceli ayak
  for (const [ya, yb] of [[5, 12], [14, 21], [23, 29]]) {
    g.box(x1, ya, z0 + 1, x1 + 1, yb, z0 + 11, M.PAINTED);
    g.box(x1 + 1, ((ya + yb) >> 1) - 1, z0 + 5, x1 + 2, ((ya + yb) >> 1) + 1, z0 + 7, M.PLASTIC_Y);
  }
  for (const lx of [x0, x1 - 4]) g.box(lx, G0, z1 - 4, lx + 4, top - 2, z1, M.FURN);
  g.box(x0, top - 4, z1 - 2, x1, top - 2, z1, M.FURN);
  g.box(x1 - 2, top - 4, z0 + 12, x1, top - 2, z1, M.FURN);
  // masa lambasi: kirmizi ayak, metal kollar, isikli kafa (asagi bakar)
  const bx = 9, bz = 109;
  g.rod(bx + 0.5, top, bz + 0.5, bx + 0.5, top + 2, bz + 0.5, 3, 2.5, M.PLASTIC_R);
  g.rod(bx + 0.5, top + 2, bz + 0.5, 13.5, 51, 113.5, 0.8, 0.8, M.METAL);
  g.rod(13.5, 51, 113.5, 18.5, 47, 119.5, 0.8, 0.8, M.METAL);
  g.blob(13.5, 51, 113.5, 1.4, 1.4, 1.4, M.PLASTIC_R);
  for (let y = 43; y < 49; y++) {
    const r = 1.6 + (48 - y) * 0.45;
    for (let z = 113; z < 127; z++) for (let x = 12; x < 26; x++) {
      const d = Math.hypot(x + 0.5 - 18.5, z + 0.5 - 120);
      if (d < r && (d >= r - 1.1 || y === 48)) g.set(x, y, z, M.PLASTIC_R);
    }
  }
  g.box(17, 42, 119, 20, 44, 122, M.LAMP);
  out.lights.push({ x: 18.5 * VS, y: 41.5 * VS, z: 120.5 * VS, color: 0xfff1d6, intensity: 10, distance: 13, voxR: 3 });
  // kalemlik ve kalemler
  for (let y = top; y < top + 7; y++) for (let z = 105; z < 112; z++) for (let x = 19; x < 26; x++) {
    const d = Math.hypot(x + 0.5 - 22.5, z + 0.5 - 108.5);
    if (d < 3.2 && (d >= 2.1 || y === top)) g.set(x, y, z, M.PLASTIC_B);
  }
  [[21.5, 107.5, M.CRAYON_R, 13], [23.5, 109, M.CRAYON_G, 11], [22, 110, M.CRAYON_B, 12]].forEach(([x, z, m, h]) => g.rod(x, top + 1, z, x + 0.6, top + h, z - 0.4, 0.7, 0.7, m));
  // kitap yigini ve acik defter
  for (let k = 0; k < 4; k++) g.box(8 + (k & 1), top + k, 138 - (k >> 1), 18 - (k & 1), top + k + 1, 147, M.BOOK_LAY);
  g.box(9, top, 126, 17, top + 1, 134, M.TRIM);
  g.box(9, top, 126, 10, top + 1, 134, M.PLASTIC_B);
}

// sandalye: masaya dayali (masadan oturagina inilir), arkaligi doguda
function chair(g) {
  const x0 = 28, x1 = 48, z0 = 118, z1 = 138;
  g.box(x0, 19, z0, x1, 21, z1, M.PLASTIC_R);
  for (const [lx, lz] of [[x0, z0], [x0, z1 - 2], [x1 - 2, z0], [x1 - 2, z1 - 2]]) g.box(lx, G0, lz, lx + 2, 19, lz + 2, M.PLASTIC_R);
  g.box(x1 - 2, 21, z0, x1, 44, z0 + 2, M.PLASTIC_R);
  g.box(x1 - 2, 21, z1 - 2, x1, 44, z1, M.PLASTIC_R);
  g.box(x1 - 2, 38, z0, x1, 44, z1, M.PLASTIC_R);
  g.box(x1 - 2, 28, z0 + 2, x1, 31, z1 - 2, M.PLASTIC_R);
}

// ---------------------------------------------------------------- hali, pist, rampalar, arabalar
// pist: halinin ortasinda stadyum bicimi (iki duzluk + iki yarim daire), beyaz kenar cizgileri, kesik orta cizgi,
// damali baslangic cizgisi
function trackInfo(x, z) {
  const cxa = 98, cxb = 158, cz = 164, R = 28;
  let d, s;
  if (x < cxa) { const a = Math.atan2(z - cz, x - cxa); d = Math.hypot(x - cxa, z - cz) - R; s = R * (Math.PI - Math.abs(a)); }
  else if (x > cxb) { d = Math.hypot(x - cxb, z - cz) - R; s = (x - cxb) + (z - cz); }
  else { d = Math.abs(z - cz) - R; s = x; }
  return { d, s };
}

function rug(g) {
  const { x0, x1, z0, z1 } = RUG;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const e = Math.min(x - x0, x1 - 1 - x, z - z0, z1 - 1 - z);
    let m = M.RUG;
    if (e < 2 || (e >= 4 && e < 5)) m = M.TRACK_LINE;
    else {
      const { d, s } = trackInfo(x, z);
      const ad = Math.abs(d);
      if (ad < 8) {
        m = M.TRACK;
        if (ad >= 7) m = M.TRACK_LINE;
        else if (ad < 0.6 && ((Math.floor(s / 5) & 1) === 0)) m = M.TRACK_LINE;
        // damali baslangic: guney duzlukte
        if (x >= 126 && x < 132 && z > 164 && ad < 7) m = ((x >> 1) + (z >> 1)) & 1 ? M.TRACK_LINE : M.BUTTON;
      }
    }
    g.set(x, G0, z, m);
  }
}

function ramps(g) {
  // kuzey duzlukte doguya, guney duzlukte batiya yukselen turuncu rampalar (2 m)
  for (let x = 106; x < 130; x++) {
    const h = 1 + Math.floor((x - 106) / 3);
    g.box(x, RUGY, 130, x + 1, RUGY + h, 142, M.PLASTIC_O);
    g.set(x, RUGY + h, 130, M.PLASTIC_Y); g.set(x, RUGY + h, 141, M.PLASTIC_Y);
  }
  for (let x = 134; x < 158; x++) {
    const h = 1 + Math.floor((157 - x) / 3);
    g.box(x, RUGY, 186, x + 1, RUGY + h, 198, M.PLASTIC_O);
    g.set(x, RUGY + h, 186, M.PLASTIC_Y); g.set(x, RUGY + h, 197, M.PLASTIC_Y);
  }
}

// oyuncak araba (ozgun): govde, kabin, siyah camlar, tekerlekler (jant), on farlar. along: 'x' ya da 'z'
function car(g, cx, cz, along, dir, body) {
  const L = 8, W = 4;
  const P = (u, w) => (along === 'x' ? [cx + u * dir, cz + w] : [cx + w, cz + u * dir]);
  for (let u = -L; u < L; u++) for (let w = -W; w < W; w++) {
    const [x, z] = P(u + 0.5, w + 0.5).map(Math.floor);
    const nose = Math.abs(u + 0.5) > L - 2;
    for (let y = RUGY + 2; y < RUGY + (nose ? 5 : 6); y++) g.set(x, y, z, body);
    // kabin
    if (u >= -4 && u < 3 && Math.abs(w + 0.5) < W - 0.5) for (let y = RUGY + 6; y < RUGY + 9; y++) {
      const glass = y < RUGY + 8 && (Math.abs(w + 0.5) > W - 1.6 || u === 2 || u === -4);
      g.set(x, y, z, glass ? M.BUTTON : body);
    }
  }
  // tekerlekler
  for (const u of [-5, 4]) for (const s of [-1, 1]) {
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const r = Math.hypot(a, b);
      if (r > 2.7) continue;
      for (const w of s < 0 ? [-W - 1, -W] : [W - 1, W]) {
        const [x, z] = P(u + a + 0.5, w + 0.5).map(Math.floor);
        g.set(x, RUGY + 3 + b, z, r < 1.2 && (w === -W - 1 || w === W) ? M.METAL : M.BUTTON);
      }
    }
  }
  // farlar
  for (const w of [-3, 2]) { const [x, z] = P((L - 0.5) * 1, w + 0.5).map(Math.floor); g.set(x, RUGY + 4, z, M.LAMP); }
}

function cars(g) {
  car(g, 146, 136, 'x', -1, M.PLASTIC_B);
  car(g, 184, 160, 'z', 1, M.PLASTIC_R);
}

// dev boya kalemleri (alti koseli govde, sivri uc); birisi yatagin ayakucuna dayali rampa
function crayon(g, ax, ay, az, bx, by, bz, r, m) {
  const L = Math.hypot(bx - ax, by - ay, bz - az);
  const tip = Math.min(0.2, 6 / L);
  g.rod(ax, ay, az, bx, by, bz, r, r, m);
  // uc: konik
  const tx = ax + (bx - ax) * (1 - tip), ty = ay + (by - ay) * (1 - tip), tz = az + (bz - az) * (1 - tip);
  g.rod(tx, ty, tz, bx + (bx - ax) / L * 3, by + (by - ay) / L * 3, bz + (bz - az) / L * 3, r * 0.95, 0.4, m);
}

function crayons(g) {
  // rampa: haliyadan (x 156) yatagin ayakucu tepesine (31); egim ~32 derece
  crayon(g, 154, RUGY + 2.4, 118.5, BED.x0 + 1, 31.6, 118.5, 2.6, M.CRAYON_R);
  crayon(g, 70, RUGY + 2.2, 206.5, 112, RUGY + 2.2, 211.5, 2.4, M.CRAYON_B);
  crayon(g, 34, G0 + 2.2, 178, 60, G0 + 2.2, 158, 2.4, M.CRAYON_G);
}

// kuzeybati kosede blok sehri: kuleler, piramit, kemer (siper)
function blockCity(g) {
  const blk = (x, y, z, k) => g.box(x, y, z, x + 4, y + 4, z + 4, BLOCK_MATS[k & 3]);
  for (let k = 0; k < 3; k++) blk(20, G0 + k * 4, 22, k);
  for (let k = 0; k < 2; k++) blk(24, G0 + k * 4, 22, k + 2);
  blk(20, G0, 26, 1);
  // piramit
  for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) blk(40 + i * 4 + l * 2, G0 + l * 4, 30, i + l);
  // kemer
  for (let k = 0; k < 2; k++) { blk(58, G0 + k * 4, 48, k); blk(70, G0 + k * 4, 48, k + 1); }
  g.box(58, G0 + 8, 48, 74, G0 + 12, 52, M.BLOCK_Y);
  blk(30, G0, 60, 3); blk(34, G0, 61, 0); blk(31, G0 + 4, 60, 2);
  blk(64, G0, 76, 1); blk(66, G0, 84, 3);
}

// ---------------------------------------------------------------- oyuncak kale
function castle(g, out) {
  const { x0, x1, z0, z1, wall } = CASTLE;
  const W = 4;
  // surlar (mavi), mazgallar (sari)
  g.box(x0, G0, z0, x1, wall, z0 + W, M.PLASTIC_B); g.box(x0, G0, z1 - W, x1, wall, z1, M.PLASTIC_B);
  g.box(x0, G0, z0, x0 + W, wall, z1, M.PLASTIC_B); g.box(x1 - W, G0, z0, x1, wall, z1, M.PLASTIC_B);
  const merl = (x, z) => { if (((x + z) >> 1) & 1) { g.set(x, wall, z, M.PLASTIC_Y); g.set(x, wall + 1, z, M.PLASTIC_Y); } };
  for (let x = x0; x < x1; x++) { merl(x, z0); merl(x, z1 - 1); }
  for (let z = z0; z < z1; z++) { merl(x0, z); merl(x1 - 1, z); }
  // kapilar: doguda (domino dizisine bakar) ve kuzeyde; sari kemer
  g.box(x1 - W, G0, 244, x1, G0 + 11, 256, 0);
  g.box(x1 - W - 1, G0 + 11, 242, x1 + 1, G0 + 13, 258, M.PLASTIC_Y);
  g.box(30, G0, z0, 42, G0 + 11, z0 + W, 0);
  g.box(28, G0 + 11, z0 - 1, 44, G0 + 13, z0 + W + 1, M.PLASTIC_Y);
  // kose kuleleri (6.75 m); ikisi kirmizi konik catili, ikisi ustu acik (mazgalli)
  const towers = [[x0, z0, false], [x1 - 12, z0, true], [x0, z1 - 12, true], [x1 - 12, z1 - 12, false]];
  for (const [tx, tz, roof] of towers) {
    g.box(tx, G0, tz, tx + 12, 27, tz + 12, M.PLASTIC_B);
    if (roof) {
      for (let y = 27; y < 42; y++) {
        const r = 7.2 * (1 - (y - 27) / 15);
        for (let z = tz - 1; z < tz + 13; z++) for (let x = tx - 1; x < tx + 13; x++) if (Math.hypot(x + 0.5 - (tx + 6), z + 0.5 - (tz + 6)) < r) g.set(x, y, z, M.PLASTIC_R);
      }
      g.box(tx + 6, 42, tz + 6, tx + 7, 48, tz + 7, M.PLASTIC_Y);
      g.box(tx + 7, 45, tz + 6, tx + 11, 48, tz + 7, M.PLASTIC_R);
    } else {
      for (let x = tx; x < tx + 12; x++) for (const z of [tz, tz + 11]) if (((x >> 1) & 1)) { g.set(x, 27, z, M.PLASTIC_Y); g.set(x, 28, z, M.PLASTIC_Y); }
      for (let z = tz; z < tz + 12; z++) for (const x of [tx, tx + 11]) if (((z >> 1) & 1)) { g.set(x, 27, z, M.PLASTIC_Y); g.set(x, 28, z, M.PLASTIC_Y); }
    }
  }
  // ic merdiven: bati surunun icinde, kuzeyden guneye yukselir (3 voxel / 1 m), sur yoluna cikar
  for (let k = 0; k < 6; k++) {
    const za = 238 + k * 4, h = Math.min(wall, G0 + 3 * (k + 1));
    g.box(x0 + W, G0, za, x0 + W + 8, h, za + 4, M.PLASTIC_Y);
  }
  g.box(x0 + W, G0, 262, x0 + W + 8, wall, 264, M.PLASTIC_Y);
  // avluda fener diregi
  g.box(36, G0, 254, 37, G0 + 10, 255, M.FURN);
  g.box(35, G0 + 10, 253, 38, G0 + 12, 256, M.LAMP);
  out.lights.push({ x: 36.5 * VS, y: (G0 + 11) * VS, z: 254.5 * VS, color: 0xffc27a, intensity: 6, distance: 11, voxR: 2 });
}

// ---------------------------------------------------------------- oyuncak sandigi, ayi, top
function toyBox(g, out) {
  const x0 = 220, x1 = 252, z0 = 252, z1 = 280, top = 22;
  g.box(x0, G0, z0, x1, top, z1, M.PLASTIC_B);
  g.box(x0 + 2, G0 + 1, z0 + 2, x1 - 2, top, z1 - 2, 0);
  g.box(x0 - 1, top - 2, z0 - 1, x1 + 1, top, z0 + 1, M.PLASTIC_Y);
  g.box(x0 - 1, top - 2, z0, x0 + 1, top, z1, M.PLASTIC_Y); g.box(x1 - 1, top - 2, z0, x1 + 1, top, z1, M.PLASTIC_Y);
  // kapak: duvara dayali acik kapak
  g.box(x0, top, z1 - 2, x1, top + 26, z1, M.PLASTIC_B);
  g.box(x0 + 3, top + 6, z1 - 3, x1 - 3, top + 20, z1 - 2, M.PLASTIC_Y);
  // ici: bloklar ve toplar (yarisina kadar)
  const rng = g.rng;
  for (let k = 0; k < 18; k++) {
    const x = x0 + 3 + ((rng() * (x1 - x0 - 9)) | 0), z = z0 + 3 + ((rng() * (z1 - z0 - 9)) | 0), y = G0 + 1 + ((rng() * 8) | 0);
    if (rng() < 0.6) g.box(x, y, z, x + 4, y + 4, z + 4, BLOCK_MATS[k & 3]);
    else g.blob(x + 2, y + 2, z + 2, 2.4, 2.4, 2.4, k & 1 ? M.RUBBER : M.PLASTIC_Y);
  }
  // disari tasan oyuncaklar
  g.box(214, G0, 244, 218, G0 + 4, 248, M.BLOCK_G);
  g.box(226, G0, 242, 230, G0 + 4, 246, M.BLOCK_R);
  g.box(227, G0 + 4, 243, 231, G0 + 8, 247, M.BLOCK_Y);
  out.lights.push({ x: 236 * VS, y: 9.5, z: 244 * VS, color: 0xffd6a8, intensity: 6, distance: 14, voxR: 0 });
}

// pelus ayi (genel, ozgun): oturmus, guneydogu kosede odanin ortasina bakar
function teddy(g) {
  const ox = 268, oz = 266;
  const fx = -Math.SQRT1_2, fz = -Math.SQRT1_2, sx = -fz, sz = fx;
  const W = (f, s) => [ox + fx * f + sx * s, oz + fz * f + sz * s];
  const ball = (f, s, y, r, m, sq = 1) => { const [x, z] = W(f, s); g.blob(x, y, z, r, r * sq, r, m); };
  // govde + karin
  { const [x, z] = W(0, 0); g.blob(x, 16, z, 8, 10, 8, (X, Y, Z, dx, dy, dz) => {
    const f = (X + 0.5 - x) * fx + (Z + 0.5 - z) * fz;
    return f > 4.5 && dy < 0.6 && dy > -0.7 ? M.FUR_LIGHT : M.FUR;
  }); }
  // bacaklar (one uzanir) ve taban
  for (const s of [-4.6, 4.6]) {
    const [ax, az] = W(1, s), [bx, bz] = W(11, s * 1.15);
    g.rod(ax, 8, az, bx, 6, bz, 3.6, 3.4, M.FUR);
    const [px, pz] = W(13.2, s * 1.15);
    g.blob(px, 6.4, pz, 2.6, 3.0, 2.6, M.FUR_LIGHT);
  }
  // kollar
  for (const s of [-1, 1]) {
    const [ax, az] = W(0.5, s * 7.2), [bx, bz] = W(6, s * 8.6);
    g.rod(ax, 22, az, bx, 12, bz, 2.9, 2.6, M.FUR);
    const [px, pz] = W(6.6, s * 8.8);
    g.blob(px, 11.5, pz, 2.4, 2.2, 2.4, M.FUR_LIGHT);
  }
  // bas, kulaklar, burun, gozler
  ball(1, 0, 31, 7.2, M.FUR);
  for (const s of [-5.2, 5.2]) { ball(0, s, 37, 2.8, M.FUR); ball(1.1, s, 37, 1.6, M.FUR_LIGHT); }
  ball(6.6, 0, 29, 3.1, M.FUR_LIGHT, 0.85);
  ball(9.2, 0, 30.4, 1.25, M.BUTTON);
  for (const s of [-2.7, 2.7]) ball(6.6, s, 33, 1.05, M.BUTTON);
  // fiyonk
  for (const s of [-2.6, 2.6]) ball(5.8, s, 23.6, 2.1, M.PLASTIC_R, 0.8);
  ball(6.6, 0, 23.6, 1.3, M.PLASTIC_R);
}

function rubberBall(g) {
  g.blob(208, G0 + 8, 234, 8, 8, 8, M.RUBBER);
}

// ---------------------------------------------------------------- domino dizisi ve blok kule
function dominoPath() {
  const { p0, p1, p2, p3, step } = CHAIN;
  const B = (t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };
  // esit yay uzunlugunda ornekle (son domino tam p3'te)
  const pts = [];
  const N = 2000;
  let prev = B(0), acc = 0;
  const samples = [{ t: 0, s: 0, p: prev }];
  for (let i = 1; i <= N; i++) { const p = B(i / N); acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]); samples.push({ t: i / N, s: acc, p }); prev = p; }
  const total = acc, n = Math.floor(total / step) + 1, off = total - (n - 1) * step;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = off + k * step;
    while (j < samples.length - 1 && samples[j + 1].s < s) j++;
    const a = samples[j], b = samples[Math.min(j + 1, samples.length - 1)];
    const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
    pts.push([a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f]);
  }
  return pts.map((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
    const dx = q[0] - r[0], dz = q[1] - r[1], l = Math.hypot(dx, dz) || 1;
    return { x: p[0], y: G0 * VS, z: p[1], fx: dx / l, fz: dz / l };
  });
}

// blok kule: son dominonun 1.45 m onunde; 2x2 m taban, ustte daralan, renkli tahta bloklar; tepede kirmizi cati.
// Devrilme ekseni: on alt kenar (son dominonun yonunde)
function blockTower(g, chain) {
  const last = chain[chain.length - 1];
  const fz = Math.sign(last.fz) || -1;        // kuzey (-z)
  const front = last.z + fz * (0.15 + CHAIN.gap);
  const x0 = Math.round((last.x - 1) / VS), x1 = x0 + 8;
  const z0 = fz < 0 ? Math.round(front / VS) - 8 : Math.round(front / VS), z1 = z0 + 8;
  const L = [];
  const lay = (xa, za, xb, zb) => L.push([xa, za, xb, zb]);
  for (let k = 0; k < 6; k++) lay(x0, z0, x1, z1);
  for (let k = 0; k < 4; k++) lay(x0 + 2, z0, x1 - 2, z1);
  for (let k = 0; k < 2; k++) lay(x0 + 2, z0 + 2, x1 - 2, z1 - 2);
  let y = G0, c = 0;
  for (const [xa, za, xb, zb] of L) {
    for (let bz = za; bz < zb; bz += 4) for (let bx = xa; bx < xb; bx += 4) g.box(bx, y, bz, Math.min(xb, bx + 4), y + 4, Math.min(zb, bz + 4), BLOCK_MATS[(c++ + (y >> 2)) & 3]);
    y += 4;
  }
  // cati: kirmizi ucgen prizma
  for (let k = 0; k < 4; k++) g.box(x0 + 2, y + k, z0 + 2 + k, x1 - 2, y + k + 1, z1 - 2 - k, M.PLASTIC_R);
  const top = y + 4;
  return {
    box: [x0, G0, z0, x1, top, z1],
    // mentese: on alt kenar (devrilme yonunde), metre
    pivot: [(x0 + x1) * 0.5 * VS, G0 * VS, (fz < 0 ? z0 : z1) * VS],
    dir: [0, fz],
    height: (top - G0) * VS,
  };
}

// ---------------------------------------------------------------- isiklar, pedler, ogeler, dogma
function lightsMisc(g, out, tower) {
  // pencereden giren gok isigi (serin dolgu), yatak alti, domino kosesi
  out.lights.push({ x: 30, y: 13.5, z: 4.5, color: 0xd8e6ff, intensity: 16, distance: 26, voxR: 0 });
  out.lights.push({ x: 61, y: 2.4, z: 29, color: 0x93a6ff, intensity: 3.5, distance: 9, voxR: 0 });
  out.lights.push({ x: 29, y: 7.5, z: 63, color: 0xfff0dc, intensity: 6, distance: 15, voxR: 0 });
}

function padAt(g, out, px, pz, tx, ty, tz, apex) {
  const y = G0;
  for (let z = pz - 5; z < pz + 5; z++) for (let x = px - 5; x < px + 5; x++) {
    for (let yy = y; yy < y + 2; yy++) { const m = g.get(x, yy, z); if (m === M.RUG || m === M.TRACK || m === M.TRACK_LINE) g.set(x, yy, z, 0); }
    const inner = x >= px - 4 && x < px + 4 && z >= pz - 4 && z < pz + 4;
    g.set(x, y - 1, z, inner ? M.PAD : M.PLASTIC_Y);
  }
  out.pads.push({ x: px * VS, y: y * VS, z: pz * VS, tx: tx * VS, ty: ty * VS, tz: tz * VS, radius: 1.05, apex });
}

function pads(g, out) {
  const T = WARD.top;
  padAt(g, out, 222, 62, 242, T, 16, 1.6);      // gardiroba (batidan)
  padAt(g, out, 262, 58, 262, T, 18, 1.6);      // gardiroba (guneyden)
  padAt(g, out, 52, 92, 21, DESK.top, 131, 1.5); // masaya
  padAt(g, out, 120, 64, 128, WIN.sill, 7, 1.4); // pencere pervazina
}

const P = (x, y, z) => ({ x: (x + 0.5) * VS, y: y * VS, z: (z + 0.5) * VS });

// (x,z) cevresinde yukaridan ilk duz ve bos zemin
function findGround(g, x, z, R = 6, yTop = 60) {
  for (let r = 0; r <= R; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const X = x + dx, Z = z + dz;
    if (X < IN0 + 2 || Z < IN0 + 2 || X >= IN1 - 2 || Z >= IN1 - 2) continue;
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

function placeItems(g, out, tower) {
  const add = (type, x, z, yTop, R = 4) => { const p = findGround(g, x, z, R, yTop); if (p) out.items.push({ type, ...P(p[0], p[1], p[2]) }); else console.warn('oge yeri yok', type, x, z); };
  out.items.push({ type: 'quad', ...P(256, WARD.top, 17) });
  add('mega', 244, 116, 11, 3);                     // yatagin altinda
  const [tx0, , tz0, tx1] = tower.box;
  add('armor', (tx0 + tx1) >> 1, tz0 - 28, 8, 3);   // kulenin devrilecegi yerde (halida)
  add('armor', 196, 10, SHELF.top + 2, 3);          // kitapligin tepesinde
  add('health', 128, 7, WIN.sill + 2, 2);           // pencere pervazinda
  add('health', 22, 132, DESK.top + 2, 2);          // masada
  add('health', 30, 248, G0 + 2, 3);                // kalenin avlusunda
  add('health', 236, 104, BED.top + 3, 2);          // yatakta (nevresimde)
  add('ammo', 128, 164, RUGY + 2, 3);               // pistin ortasinda
  add('ammo', 32, 40, G0 + 2, 3);                   // blok sehri
  add('ammo', 196, 262, G0 + 2, 3);                 // kapinin onu
  add('ammo', 40, 126, 23, 2);                      // sandalyede
  add('ammo', 90, 40, G0 + 2, 3);                   // pencerenin onu
}

function placeSpawns(g, out, chain, tower) {
  const cx = 144, cz = 144;
  const yawTo = (x, z) => Math.atan2(-(cx - x), -(cz - z));
  const [tx0, , tz0, tx1, , tz1] = tower.box;
  const bad = (x, z) => {
    // domino dizisinin ve kulenin devrilme alaninin yakininda dogma yok
    for (const d of chain) if (Math.hypot(d.x / VS - x, d.z / VS - z) < 12) return true;
    if (x > tx0 - 10 && x < tx1 + 10 && z > tz0 - 64 && z < tz1 + 6) return true;
    return false;
  };
  const cand = [
    [40, 70], [84, 80], [140, 92], [184, 130], [56, 184], [100, 140], [180, 196], [236, 168], [266, 200], [210, 214],
    [270, 150], [176, 64], [140, 40], [30, 200], [100, 236], [240, 70], [236, 116], [40, 250],
  ];
  for (const [x, z] of cand) {
    if (bad(x, z)) continue;
    const yTop = x === 236 && z === 116 ? 11 : x === 40 && z === 250 ? G0 + 4 : 40;
    const p = findGround(g, x, z, 4, yTop);
    if (!p) continue;
    out.spawns.push({ ...P(p[0], p[1], p[2]), yaw: yawTo(p[0], p[2]) });
  }
  // yatagin ustu (ziplak) ve kale avlusu
  for (const [x, z, yTop] of [[230, 120, BED.top + 4], [44, 264, G0 + 2]]) {
    const p = findGround(g, x, z, 3, yTop);
    if (p) out.spawns.push({ ...P(p[0], p[1], p[2]), yaw: yawTo(p[0], p[2]) });
  }
}
