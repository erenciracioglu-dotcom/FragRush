// Prosedurel arena: merkez kule, 4 kale (K/G/D/B), koprular, kose alanlari, siperler.
// Tum yerlesim voxel biriminde; donen konumlar metre.
import { VS, FLOOR_Y } from '../config.js';
import { M } from './materials.js';
import { hash3 } from './voxelWorld.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F = FLOOR_Y;          // zemin ustu
const L1 = F + 22;          // kule/kale ust kat zemini (5.5 m)
const TR = L1 + 20;         // kule cati (10.5 m)
const BR = L1 + 18;         // kale cati (10 m)

class Builder {
  constructor(world, rng) {
    this.w = world; this.rng = rng;
    this.cx = world.sx / 2; this.cz = world.sz / 2;
    this.rot = 0;
  }
  box(x0, y0, z0, x1, y1, z1, m) {
    const w = this.w;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); z0 = Math.max(0, z0);
    x1 = Math.min(w.sx, x1); y1 = Math.min(w.sy, y1); z1 = Math.min(w.sz, z1);
    for (let y = y0; y < y1; y++)
      for (let z = z0; z < z1; z++) {
        let i = x0 + w.sx * (z + w.sz * y);
        for (let x = x0; x < x1; x++, i++) { w.mat[i] = m; w.dmg[i] = 0; }
      }
  }
  // yerel (u,w) voxel -> dunya (x,z) voxel (merkez etrafinda 90 derece donusler)
  map(u, w) {
    const a = u + 0.5, b = w + 0.5;
    let X, Z;
    switch (this.rot & 3) {
      case 0: X = a; Z = b; break;
      case 1: X = b; Z = -a; break;
      case 2: X = -a; Z = -b; break;
      default: X = -b; Z = a; break;
    }
    return [Math.floor(this.cx + X), Math.floor(this.cz + Z)];
  }
  lbox(u0, y0, w0, u1, y1, w1, m) {
    if (u1 <= u0 || w1 <= w0 || y1 <= y0) return;
    const [ax, az] = this.map(u0, w0);
    const [bx, bz] = this.map(u1 - 1, w1 - 1);
    this.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx) + 1, y1, Math.max(az, bz) + 1, m);
  }
  // yerel nokta (voxel, kesirli) -> dunya metre
  lpoint(u, y, w) {
    const a = u, b = w;
    let X, Z;
    switch (this.rot & 3) {
      case 0: X = a; Z = b; break;
      case 1: X = b; Z = -a; break;
      case 2: X = -a; Z = -b; break;
      default: X = -b; Z = a; break;
    }
    return { x: (this.cx + X) * VS, y: y * VS, z: (this.cz + Z) * VS };
  }
  // yerel yon acisi (u ekseni boyunca 0) -> dunya yaw
  lyaw(yawLocal) { return yawLocal - (this.rot & 3) * Math.PI / 2; }
  // ici bos kutu (duvarlar t kalinliginda), taban ve tavan yok
  lwalls(u0, y0, w0, u1, y1, w1, t, m) {
    this.lbox(u0, y0, w0, u1, y1, w0 + t, m);
    this.lbox(u0, y0, w1 - t, u1, y1, w1, m);
    this.lbox(u0, y0, w0, u0 + t, y1, w1, m);
    this.lbox(u1 - t, y0, w0, u1, y1, w1, m);
  }
  // merdiven: u0..u0+width genislik, w boyunca dirW yonunde; her basamak 1 yukselir, 2 ilerler
  lstairs(u0, w0, width, dirW, steps, yBase, m, runPer = 2) {
    for (let s = 0; s < steps; s++) {
      const wa = dirW > 0 ? w0 + s * runPer : w0 - (s + 1) * runPer;
      this.lbox(u0, yBase, wa, u0 + width, yBase + s + 1, wa + runPer, m);
    }
  }
  // u boyunca merdiven
  lstairsU(u0, w0, width, dirU, steps, yBase, m, runPer = 2) {
    for (let s = 0; s < steps; s++) {
      const ua = dirU > 0 ? u0 + s * runPer : u0 - (s + 1) * runPer;
      this.lbox(ua, yBase, w0, ua + runPer, yBase + s + 1, w0 + width, m);
    }
  }
}

export function generateArena(world, seed = 1) {
  const rng = mulberry32(seed);
  const B = new Builder(world, rng);
  const SX = world.sx, SZ = world.sz;
  world.mat.fill(0); world.dmg.fill(0);
  const out = { spawns: [], items: [], pads: [], lights: [], seed, names: [] };

  // --- ana kaya ve zemin ---
  B.box(0, 0, 0, SX, 2, SZ, M.BEDROCK);
  B.box(0, 2, 0, SX, F, SZ, M.CONCRETE_DARK);
  // meydan karolari (kule cevresi)
  const R2 = 58 * 58;
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    const dx = x + 0.5 - B.cx, dz = z + 0.5 - B.cz;
    const d2 = dx * dx + dz * dz;
    const i0 = x + SX * z;
    if (d2 < R2) {
      const t = ((Math.floor(x / 4) + Math.floor(z / 4)) & 1) ? M.TILE_A : M.TILE_B;
      world.mat[i0 + world.sxz * (F - 1)] = t;
      if (d2 > (54 * 54) && d2 < R2) world.mat[i0 + world.sxz * (F - 1)] = M.HAZARD;
    } else {
      const n = hash3(x >> 3, 7, z >> 3);
      if (n > 0.82) world.mat[i0 + world.sxz * (F - 1)] = M.SAND;
      else if (n > 0.76) world.mat[i0 + world.sxz * (F - 1)] = M.RUBBLE;
    }
  }

  // --- sinir duvari (yikilmaz cerceve) ---
  const WH = F + 44, WT = 4;
  B.box(0, F, 0, SX, WH, WT, M.FRAME);
  B.box(0, F, SZ - WT, SX, WH, SZ, M.FRAME);
  B.box(0, F, 0, WT, WH, SZ, M.FRAME);
  B.box(SX - WT, F, 0, SX, WH, SZ, M.FRAME);
  // ic yuz: ikaz seridi + neon serit + yikilabilir beton kaplama
  B.box(WT, F, WT, SX - WT, F + 2, WT + 1, M.HAZARD);
  B.box(WT, F, SZ - WT - 1, SX - WT, F + 2, SZ - WT, M.HAZARD);
  B.box(WT, F, WT, WT + 1, F + 2, SZ - WT, M.HAZARD);
  B.box(SX - WT - 1, F, WT, SX - WT, F + 2, SZ - WT, M.HAZARD);
  B.box(WT, F + 13, WT, SX - WT, F + 14, WT + 1, M.NEON_CYAN);
  B.box(WT, F + 13, SZ - WT - 1, SX - WT, F + 14, SZ - WT, M.NEON_CYAN);
  B.box(WT, F + 13, WT, WT + 1, F + 14, SZ - WT, M.NEON_ORANGE);
  B.box(SX - WT - 1, F + 13, WT, SX - WT, F + 14, SZ - WT, M.NEON_ORANGE);
  B.box(0, WH, 0, SX, WH + 1, WT, M.NEON_ORANGE);
  B.box(0, WH, SZ - WT, SX, WH + 1, SZ, M.NEON_ORANGE);
  B.box(0, WH, 0, WT, WH + 1, SZ, M.NEON_CYAN);
  B.box(SX - WT, WH, 0, SX, WH + 1, SZ, M.NEON_CYAN);
  // duvar destek kolonlari (yikilabilir beton, cerceveye yaslanik)
  for (let k = 16; k < SX - 16; k += 32) {
    B.box(k, F, WT, k + 4, F + 36, WT + 3, M.CONCRETE);
    B.box(k, F, SZ - WT - 3, k + 4, F + 36, SZ - WT, M.CONCRETE);
    B.box(WT, F, k, WT + 3, F + 36, k + 4, M.CONCRETE);
    B.box(SX - WT - 3, F, k, SX - WT, F + 36, k + 4, M.CONCRETE);
  }

  buildTower(B, out);
  const kaleMats = pickKaleStyles(rng);
  for (let r = 0; r < 4; r++) { B.rot = r; buildKale(B, out, kaleMats[r], r); }
  for (let r = 0; r < 4; r++) { B.rot = r; buildCorner(B, out, r); }
  B.rot = 0;
  scatterCover(B, out);
  preDamage(B, world, rng);

  return out;
}

function pickKaleStyles(rng) {
  const styles = [
    { wall: M.BRICK, trim: M.CONCRETE, floor: M.CONCRETE, neon: M.NEON_ORANGE, name: 'Tugla Kale' },
    { wall: M.PLASTER, trim: M.METAL, floor: M.TILE_A, neon: M.NEON_CYAN, name: 'Beyaz Kale' },
    { wall: M.CONCRETE_RED, trim: M.STEEL, floor: M.CONCRETE_DARK, neon: M.NEON_MAGENTA, name: 'Kizil Kale' },
    { wall: M.METAL, trim: M.RUST, floor: M.GRATE, neon: M.NEON_ORANGE, name: 'Celik Kale' },
  ];
  for (let i = styles.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [styles[i], styles[j]] = [styles[j], styles[i]]; }
  return styles;
}

// ---------------- Merkez kule ----------------
function buildTower(B, out) {
  B.rot = 0;
  const h = 20; // yari genislik (5 m)
  const T = 2;
  // zemin kat duvarlari
  B.lwalls(-h, F, -h, h, L1 - 2, h, T, M.CONCRETE);
  // kose kolonlari (kalin, celik bantli)
  for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const u0 = su < 0 ? -h - 1 : h - 4, w0 = sw < 0 ? -h - 1 : h - 4;
    B.lbox(u0, F, w0, u0 + 5, TR + 4, w0 + 5, M.CONCRETE_DARK);
    for (let y = F + 6; y < TR; y += 12) B.lbox(u0, y, w0, u0 + 5, y + 1, w0 + 5, M.STEEL);
  }
  // kemerler (4 yon) 4m genis, 3.5m yuksek
  for (let r = 0; r < 4; r++) {
    B.rot = r;
    B.lbox(-8, F, h - T, 8, F + 14, h, M.AIR);
    B.lbox(-9, F + 14, h - T - 1, 9, F + 15, h + 1, M.METAL); // lento
  }
  B.rot = 0;
  // 1. kat dosemesi
  B.lbox(-h, L1 - 2, -h, h, L1, h, M.CONCRETE_DARK);
  // ust kat duvarlari
  B.lwalls(-h, L1, -h, h, TR - 2, h, T, M.CONCRETE);
  // ust kat kapilari (koprulere) ve pencereler
  for (let r = 0; r < 4; r++) {
    B.rot = r;
    B.lbox(-4, L1, h - T, 4, L1 + 10, h, M.AIR);
    B.lbox(-14, L1 + 5, h - T, -8, L1 + 9, h, M.AIR);
    B.lbox(8, L1 + 5, h - T, 14, L1 + 9, h, M.AIR);
    B.lbox(-5, L1 + 10, h - 1, 5, L1 + 11, h + 1, M.NEON_CYAN);
  }
  B.rot = 0;
  // cati dosemesi + korkuluk
  B.lbox(-h, TR - 2, -h, h, TR, h, M.CONCRETE_DARK);
  B.lwalls(-h, TR, -h, h, TR + 3, h, 2, M.CONCRETE);
  B.lbox(-h, TR + 3, -h, h, TR + 4, -h + 2, M.NEON_CYAN);
  B.lbox(-h, TR + 3, h - 2, h, TR + 4, h, M.NEON_CYAN);
  B.lbox(-h, TR + 3, -h, -h + 2, TR + 4, h, M.NEON_CYAN);
  B.lbox(h - 2, TR + 3, -h, h, TR + 4, h, M.NEON_CYAN);
  for (let r = 0; r < 4; r++) { B.rot = r; B.lbox(4, TR, h - 2, 16, TR + 3, h, M.AIR); }
  B.rot = 0;

  // orta celik cekirdek + sarmal merdiven (zemin -> 1. kat). Aci -> yukseklik.
  B.lbox(-2, F, -2, 2, TR, 2, M.STEEL);
  const RO = 9, rise = L1 - F; // 22 basamak bir turda
  for (let w = -RO; w < RO; w++) for (let u = -RO; u < RO; u++) {
    if (u >= -2 && u < 2 && w >= -2 && w < 2) continue;
    const a = Math.atan2(w + 0.5, u + 0.5);            // -pi..pi
    const t = (a + Math.PI) / (Math.PI * 2);           // 0..1
    const hh = Math.min(rise, Math.floor(t * rise) + 1);
    B.lbox(u, F, w, u + 1, F + hh, w + 1, M.CONCRETE);
    // basin yuksekligi yetmeyen yerlerde doseme boslugu
    if (hh > rise - 14) B.lbox(u, Math.max(L1 - 2, F + hh), w, u + 1, L1, w + 1, M.AIR);
  }
  // merdiven kenar bandi ve ust kat bosluk korkulugu
  for (let w = -RO - 1; w <= RO; w++) for (let u = -RO - 1; u <= RO; u++) {
    const edge = u === -RO - 1 || u === RO || w === -RO - 1 || w === RO;
    if (!edge) continue;
    const a = Math.atan2(w + 0.5, u + 0.5);
    const t = (a + Math.PI) / (Math.PI * 2);
    const hh = Math.floor(t * rise) + 1;
    if (hh > rise - 14 && hh < rise - 1) B.lbox(u, L1, w, u + 1, L1 + 4, w + 1, M.STEEL);
  }
  B.lbox(-3, F + 2, -3, 3, F + 3, 3, M.NEON_ORANGE); // cekirdek isik bandi
  B.lbox(-2, F + 2, -2, 2, F + 3, 2, M.STEEL);
  // anten / isaret kulesi
  B.lbox(-3, TR, -3, 3, TR + 2, 3, M.METAL);
  B.lbox(-2, TR + 2, -2, 2, TR + 18, 2, M.STEEL);
  B.lbox(-3, TR + 18, -3, 3, TR + 20, 3, M.NEON_MAGENTA);
  B.lbox(-1, TR + 20, -1, 1, TR + 26, 1, M.STEEL);
  B.lbox(-2, TR + 26, -2, 2, TR + 28, 2, M.LAMP);

  out.items.push({ type: 'mega', ...B.lpoint(0, F, -14) });
  out.items.push({ type: 'quad', ...B.lpoint(10, TR, 10) });
  out.items.push({ type: 'armor', ...B.lpoint(13, L1, 13) });
  out.items.push({ type: 'ammo', ...B.lpoint(-13, L1, -13) });
  out.lights.push({ ...B.lpoint(0, F + 12, -12), color: 0xffb070, intensity: 7, distance: 14 });
  out.lights.push({ ...B.lpoint(0, TR + 27, 0), color: 0xffe0b0, intensity: 40, distance: 26, voxR: 3 });

  // kule cevresi ziplama pedleri -> cati (her yonde, koprunun yaninda)
  for (let r = 0; r < 4; r++) {
    B.rot = r;
    const pu = 13, pw = 32;
    B.lbox(pu - 4, F - 1, pw - 4, pu + 4, F, pw + 4, M.PAD);
    B.lbox(pu - 5, F, pw - 5, pu + 5, F + 1, pw - 4, M.HAZARD);
    B.lbox(pu - 5, F, pw + 4, pu + 5, F + 1, pw + 5, M.HAZARD);
    B.lbox(pu - 5, F, pw - 4, pu - 4, F + 1, pw + 4, M.HAZARD);
    B.lbox(pu + 4, F, pw - 4, pu + 5, F + 1, pw + 4, M.HAZARD);
    const p = B.lpoint(pu, F, pw);
    const t = B.lpoint(pu - 1, TR, 9);
    out.pads.push({ x: p.x, y: p.y, z: p.z, tx: t.x, ty: t.y, tz: t.z, radius: 1.05, apex: 3.5 });
  }
  B.rot = 0;
}

// ---------------- Kale (yerel: w disari, u yanlara) ----------------
function buildKale(B, out, st, r) {
  const u0 = -32, u1 = 32, w0 = 56, w1 = 104; // 16m x 12m, kuleden 14m disarda
  const T = 2;
  // zemin kat
  B.lwalls(u0, F, w0, u1, L1 - 2, w1, T, st.wall);
  // ust kat
  B.lbox(u0, L1 - 2, w0, u1, L1, w1, st.floor === M.GRATE ? M.METAL : st.trim);
  B.lwalls(u0, L1, w0, u1, BR - 2, w1, T, st.wall);
  // cati
  B.lbox(u0, BR - 2, w0, u1, BR, w1, st.trim);
  B.lwalls(u0, BR, w0, u1, BR + 3, w1, 2, st.wall);
  // kat bantlari / sacak
  B.lbox(u0 - 1, L1 - 2, w0 - 1, u1 + 1, L1 - 1, w1 + 1, st.trim);
  B.lbox(u0 - 1, BR + 3, w0 - 1, u1 + 1, BR + 4, w1 + 1, st.trim);
  B.lbox(u0 - 1, BR + 2, w0 - 1, u1 + 1, BR + 3, w0, st.neon);
  // zemin kat kapilari: kuleye bakan genis kapi, yan kapilar, arka kapi
  B.lbox(-8, F, w0, 8, F + 12, w0 + T, M.AIR);
  B.lbox(u0, F, 70, u0 + T, F + 10, 78, M.AIR);
  B.lbox(u1 - T, F, 82, u1, F + 10, 90, M.AIR);
  B.lbox(14, F, w1 - T, 22, F + 10, w1, M.AIR);
  // zemin kat pencereleri
  for (const pu of [-24, 16]) B.lbox(pu, F + 6, w0, pu + 6, F + 10, w0 + T, M.AIR);
  for (const pw of [62, 92]) { B.lbox(u0, F + 6, pw, u0 + T, F + 10, pw + 5, M.AIR); B.lbox(u1 - T, F + 6, pw, u1, F + 10, pw + 5, M.AIR); }
  // ust kat: kopru kapisi + bol pencere (pusu yerleri)
  B.lbox(-4, L1, w0, 4, L1 + 10, w0 + T, M.AIR);
  for (const pu of [-26, -16, 10, 20]) B.lbox(pu, L1 + 4, w0, pu + 6, L1 + 9, w0 + T, M.AIR);
  for (const pu of [-26, -12, 6, 20]) B.lbox(pu, L1 + 4, w1 - T, pu + 6, L1 + 9, w1, M.AIR);
  for (const pw of [62, 74, 86, 96]) { B.lbox(u0, L1 + 4, pw, u0 + T, L1 + 9, pw + 4, M.AIR); B.lbox(u1 - T, L1 + 4, pw, u1, L1 + 9, pw + 4, M.AIR); }
  // ic merdiven: zemin -> ust kat, uzun duvar boyunca (arka duvar), u boyunca
  const rise = L1 - F; // 22
  B.lstairsU(u0 + T, w1 - T - 5, 5, 1, rise, F, st.trim);
  B.lbox(u0 + T, L1 - 2, w1 - T - 6, u0 + T + rise * 2 + 1, L1, w1 - T, M.AIR);
  B.lbox(u0 + T, L1, w1 - T - 7, u0 + T + rise * 2 + 1, L1 + 4, w1 - T - 6, M.STEEL);
  // ust kat -> cati: yan duvar boyunca (w yonunde)
  const rise2 = BR - L1; // 18
  B.lstairs(u1 - T - 5, w0 + T + 2, 5, 1, rise2, L1, st.trim);
  B.lbox(u1 - T - 6, BR - 2, w0 + T + 1, u1 - T, BR, w0 + T + 3 + rise2 * 2, M.AIR);
  B.lbox(u1 - T - 7, BR, w0 + T + 1, u1 - T - 6, BR + 3, w0 + T + 3 + rise2 * 2, M.STEEL);
  // ic bolme duvari (zemin kat) - siper
  B.lbox(-10, F, 78, 10, F + 6, 80, st.trim);
  // kasalar
  B.lbox(18, F, 64, 22, F + 4, 68, M.WOOD);
  B.lbox(22, F, 64, 26, F + 4, 68, M.WOOD);
  B.lbox(20, F + 4, 64, 24, F + 8, 68, M.WOOD);
  // ust kat orta siper
  B.lbox(-6, L1, 76, 6, L1 + 4, 78, M.WOOD);
  // kopru: kule ust kat (w=20) -> kale (w=56)
  B.lbox(-4, L1 - 2, 20, 4, L1, w0, M.GRATE);
  B.lbox(-5, L1 - 4, 20, -4, L1, w0, M.STEEL);
  B.lbox(4, L1 - 4, 20, 5, L1, w0, M.STEEL);
  for (let w = 22; w < w0; w += 4) { B.lbox(-5, L1, w, -4, L1 + 4, w + 1, M.STEEL); B.lbox(4, L1, w, 5, L1 + 4, w + 1, M.STEEL); }
  B.lbox(-5, L1 + 4, 20, -4, L1 + 5, w0, M.STEEL);
  B.lbox(4, L1 + 4, 20, 5, L1 + 5, w0, M.STEEL);
  B.lbox(-5, L1 - 5, 20, -4, L1 - 4, w0, st.neon);
  B.lbox(4, L1 - 5, 20, 5, L1 - 4, w0, st.neon);
  // kopru ayagi (orta)
  B.lbox(-2, F, 36, 2, L1 - 4, 40, M.STEEL);
  B.lbox(-3, F, 35, 3, F + 3, 41, M.CONCRETE);

  // ogeler + dogma noktalari
  out.items.push({ type: 'armor', ...B.lpoint(0, L1, 86) });
  out.items.push({ type: 'health', ...B.lpoint(-20, F, 66) });
  out.items.push({ type: 'ammo', ...B.lpoint(20, L1, 92) });
  out.items.push({ type: 'health', ...B.lpoint(0, L1, 40) });
  const yawIn = B.lyaw(-Math.PI / 2);
  out.spawns.push({ ...B.lpoint(-18, F, 90), yaw: yawIn });
  out.spawns.push({ ...B.lpoint(14, F, 72), yaw: yawIn });
  out.spawns.push({ ...B.lpoint(8, L1, 88), yaw: yawIn });
  out.spawns.push({ ...B.lpoint(-20, BR, 80), yaw: yawIn });
  out.lights.push({ ...B.lpoint(0, F + 12, 84), color: 0xffc890, intensity: 6.5, distance: 13 });
  out.names.push(st.name);
}

// ---------------- Koseler ----------------
function buildCorner(B, out, r) {
  const rng = B.rng;
  // yerel kose merkezi (u, w) = (+-, +) -> kose: u 56..136, w 56..136 bolgesinin icinden secer
  const type = Math.floor(rng() * 4);
  const cu = 92, cw = 92; // kose merkezi (yerel)
  if (type === 0) containerYard(B, cu, cw, rng);
  else if (type === 1) ruinedDepot(B, cu, cw, rng);
  else if (type === 2) platform(B, cu, cw, rng, out);
  else crystalGarden(B, cu, cw, rng);
  // isik diregi
  const lu = cu - 30, lw = cw - 30;
  B.lbox(lu, F, lw, lu + 2, F + 30, lw + 2, M.STEEL);
  B.lbox(lu - 1, F, lw - 1, lu + 3, F + 2, lw + 3, M.CONCRETE);
  B.lbox(lu - 2, F + 30, lw - 2, lu + 4, F + 31, lw + 4, M.STEEL);
  B.lbox(lu - 1, F + 29, lw - 1, lu + 3, F + 30, lw + 3, M.LAMP);
  out.lights.push({ ...B.lpoint(lu + 3.5, F + 27, lw + 1), color: 0xffd9a0, intensity: 20, distance: 22, voxR: 4 });
  out.spawns.push({ ...B.lpoint(cu + 20, F, cw - 24), yaw: B.lyaw(Math.atan2(-1, -1)) });
  out.spawns.push({ ...B.lpoint(cu - 24, F, cw + 20), yaw: B.lyaw(Math.atan2(-1, -1)) });
  out.items.push({ type: 'health', ...B.lpoint(cu - 34, F, cw - 6) });
  out.items.push({ type: 'ammo', ...B.lpoint(cu - 6, F, cw - 34) });
}

function container(B, u, w, along, y, mat, open) {
  // 6m x 2.5m x 2.6m konteyner; along: true -> u boyunca uzun
  const L = 24, W = 10, H = 10;
  const [du, dw] = along ? [L, W] : [W, L];
  B.lbox(u, y, w, u + du, y + H, w + dw, mat);
  B.lbox(u + 1, y + 1, w + 1, u + du - 1, y + H - 1, w + dw - 1, M.AIR);
  // oluklu gorunum icin dis bantlar
  if (along) { for (let k = 2; k < L; k += 3) B.lbox(u + k, y, w - 0, u + k + 1, y + H, w + 1, M.STEEL); }
  else { for (let k = 2; k < L; k += 3) B.lbox(u, y, w + k, u + 1, y + H, w + k + 1, M.STEEL); }
  if (open) {
    if (along) B.lbox(u, y + 1, w + 1, u + 1, y + H - 1, w + dw - 1, M.AIR);
    else B.lbox(u + 1, y + 1, w, u + du - 1, y + H - 1, w + 1, M.AIR);
  }
}

function containerYard(B, cu, cw, rng) {
  const mats = [M.RUST, M.METAL, M.CONCRETE_RED, M.RUST];
  container(B, cu - 22, cw - 4, true, F, mats[0], true);
  container(B, cu + 6, cw - 20, false, F, mats[1], true);
  container(B, cu - 18, cw + 14, true, F, mats[2], rng() > 0.5);
  container(B, cu - 18, cw + 14, true, F + 10, mats[3], true);
  B.lbox(cu - 18, F + 20, cw + 14, cu + 6, F + 21, cw + 15, M.NEON_MAGENTA);
  // basamak icin kasalar
  B.lbox(cu + 8, F, cw + 14, cu + 12, F + 4, cw + 18, M.WOOD);
  B.lbox(cu + 8, F, cw + 18, cu + 12, F + 8, cw + 22, M.WOOD);
}

function ruinedDepot(B, cu, cw, rng) {
  const m = rng() > 0.5 ? M.BRICK : M.CONCRETE;
  B.lbox(cu - 24, F, cw - 24, cu + 16, F + 18, cw - 22, m);
  B.lbox(cu - 24, F, cw - 24, cu - 22, F + 18, cw + 16, m);
  B.lbox(cu - 24, F + 18, cw - 24, cu + 4, F + 20, cw + 4, M.CONCRETE_DARK); // yarim cati
  for (let k = -20; k < 12; k += 9) {
    B.lbox(cu + k, F + 6, cw - 24, cu + k + 4, F + 12, cw - 22, M.AIR);
    B.lbox(cu - 24, F + 6, cw + k, cu - 22, F + 12, cw + k + 4, M.AIR);
  }
  B.lbox(cu + 2, F, cw + 2, cu + 6, F + 18, cw + 6, M.CONCRETE); // kolon
  B.lbox(cu - 6, F, cw + 10, cu + 14, F + 5, cw + 12, M.CONCRETE_DARK); // alcak duvar
}

function platform(B, cu, cw, rng, out) {
  const pu = cu - 16, pw = cw - 16, S = 32, H = 12;
  B.lbox(pu, F, pw, pu + S, F + H, pw + S, M.CONCRETE);
  B.lbox(pu + 2, F, pw + 2, pu + S - 2, F + H - 2, pw + S - 2, M.AIR); // ici bos (altinda saklanma yeri)
  B.lbox(pu + 12, F, pw, pu + 20, F + 8, pw + 2, M.AIR); // giris
  B.lbox(pu, F + H, pw, pu + S, F + H + 1, pw + 1, M.NEON_ORANGE);
  B.lbox(pu, F + H, pw + S - 1, pu + S, F + H + 1, pw + S, M.NEON_ORANGE);
  // merdivenler: iki yandan disa dogru inen basamaklar
  for (let s = 0; s < H; s++) B.lbox(pu - 2 * (s + 1), F, pw + 4, pu, F + H - s, pw + 10, M.CONCRETE);
  for (let s = 0; s < H; s++) B.lbox(pu + S, F, pw + 4, pu + S + 2 * (H - s), F + s + 1, pw + 10, M.CONCRETE);
  // ust siperler
  B.lbox(pu + 6, F + H, pw + 8, pu + 10, F + H + 4, pw + 12, M.WOOD);
  B.lbox(pu + 20, F + H, pw + 18, pu + 26, F + H + 3, pw + 20, M.CONCRETE_DARK);
  out.items.push({ type: 'ammo', ...B.lpoint(pu + 16, F + H, pw + 16) });
  out.spawns.push({ ...B.lpoint(pu + 16, F + H, pw + 24), yaw: B.lyaw(Math.atan2(-1, -1)) });
}

function crystalGarden(B, cu, cw, rng) {
  // yosun/kum zemin + kristal kumeleri
  for (let k = 0; k < 7; k++) {
    const u = cu - 26 + Math.floor(rng() * 44), w = cw - 26 + Math.floor(rng() * 44);
    const hgt = 6 + Math.floor(rng() * 14), rad = 1 + Math.floor(rng() * 2);
    for (let y = 0; y < hgt; y++) {
      const rr = Math.max(0, Math.round(rad * (1 - y / hgt) + 0.4));
      const lean = Math.floor(y * 0.25);
      B.lbox(u - rr + lean, F + y, w - rr, u + rr + 1 + lean, F + y + 1, w + rr + 1, M.CRYSTAL);
    }
    B.lbox(u - 3, F - 1, w - 3, u + 4, F, w + 4, M.MOSS);
  }
  // alcak taslar
  B.lbox(cu - 10, F, cw + 8, cu + 2, F + 4, cw + 12, M.CONCRETE_DARK);
  B.lbox(cu + 10, F, cw - 12, cu + 14, F + 6, cw - 2, M.CONCRETE_DARK);
}

// ---------------- Daginik siperler ----------------
function scatterCover(B, out) {
  const w = B.w, rng = B.rng;
  const free = (x0, z0, x1, z1, y0, y1) => {
    for (let y = y0; y < y1; y++) for (let z = z0 - 2; z < z1 + 2; z++) for (let x = x0 - 2; x < x1 + 2; x++) {
      if (x < 6 || z < 6 || x >= w.sx - 6 || z >= w.sz - 6) return false;
      if (w.mat[x + w.sx * (z + w.sz * y)] !== 0) return false;
    }
    return true;
  };
  const padNear = (x, z) => out.pads.some((p) => Math.hypot(p.x / VS - x, p.z / VS - z) < 14);
  let placed = 0;
  for (let tries = 0; tries < 900 && placed < 60; tries++) {
    const x = 8 + Math.floor(rng() * (w.sx - 16)), z = 8 + Math.floor(rng() * (w.sz - 16));
    const kind = rng();
    if (padNear(x, z)) continue;
    if (kind < 0.35) {
      // beton bariyer (jersey) 2m x 1m
      const along = rng() > 0.5;
      const [dx, dz] = along ? [8, 3] : [3, 8];
      if (!free(x, z, x + dx, z + dz, F, F + 5)) continue;
      B.box(x, F, z, x + dx, F + 3, z + dz, M.CONCRETE);
      if (along) B.box(x, F + 3, z + 1, x + dx, F + 4, z + 2, M.CONCRETE);
      else B.box(x + 1, F + 3, z, x + 2, F + 4, z + dz, M.CONCRETE);
      B.box(x, F, z, x + dx, F + 1, z + dz, M.HAZARD);
    } else if (kind < 0.62) {
      // kasa yigini
      if (!free(x, z, x + 8, z + 8, F, F + 9)) continue;
      B.box(x, F, z, x + 4, F + 4, z + 4, M.WOOD);
      if (rng() > 0.3) B.box(x + 4, F, z, x + 8, F + 4, z + 4, M.WOOD);
      if (rng() > 0.4) B.box(x, F, z + 4, x + 4, F + 4, z + 8, M.WOOD);
      if (rng() > 0.5) B.box(x + 1, F + 4, z + 1, x + 5, F + 8, z + 5, M.WOOD);
    } else if (kind < 0.8) {
      // alcak duvar parcasi
      const along = rng() > 0.5;
      const len = 10 + Math.floor(rng() * 14);
      const [dx, dz] = along ? [len, 2] : [2, len];
      if (!free(x, z, x + dx, z + dz, F, F + 8)) continue;
      const m = rng() > 0.5 ? M.BRICK : M.CONCRETE;
      B.box(x, F, z, x + dx, F + 5 + Math.floor(rng() * 3), z + dz, m);
    } else {
      // kolon kalintisi
      if (!free(x, z, x + 4, z + 4, F, F + 26)) continue;
      const hgt = 10 + Math.floor(rng() * 16);
      B.box(x, F, z, x + 4, F + hgt, z + 4, M.CONCRETE);
      B.box(x - 1, F, z - 1, x + 5, F + 2, z + 5, M.CONCRETE_DARK);
      if (rng() > 0.5) B.box(x, F + hgt - 1, z, x + 4, F + hgt, z + 4, M.NEON_ORANGE);
    }
    placed++;
  }
}

// ---------------- Onceden hasar (savas gormus gorunum) ----------------
function preDamage(B, world, rng) {
  for (let k = 0; k < 26; k++) {
    const x = 10 + Math.floor(rng() * (world.sx - 20));
    const z = 10 + Math.floor(rng() * (world.sz - 20));
    const y = F + 2 + Math.floor(rng() * 30);
    const r = 1.5 + rng() * 3.5;
    const i = world.idx(x, y, z);
    if (world.mat[i] === 0 || world.mat[i] === M.FRAME || world.mat[i] === M.PAD) continue;
    world.damageSphere(x * VS, y * VS, z * VS, r * VS, 260, { noise: 0.9 });
  }
  world.seedCount = 0;
  world.removedCount = 0;
}
