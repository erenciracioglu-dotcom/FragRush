// Voxel malzemeleri. Renkler sRGB. tough: 0-255 hasar birimi (255 = yikilmaz).
// snd: carpma/kirilma sesi turu.

export const M = {
  AIR: 0,
  BEDROCK: 1,
  CONCRETE: 2,
  CONCRETE_DARK: 3,
  METAL: 4,
  RUST: 5,
  BRICK: 6,
  WOOD: 7,
  NEON_ORANGE: 8,
  NEON_CYAN: 9,
  NEON_MAGENTA: 10,
  PLASTER: 11,
  RUBBLE: 12,
  TILE_A: 13,
  TILE_B: 14,
  FRAME: 15,
  PAD: 16,
  GRATE: 17,
  HAZARD: 18,
  CRYSTAL: 19,
  SAND: 20,
  MOSS: 21,
  LAMP: 22,
  STEEL: 23,
  CONCRETE_RED: 24,
};

// [id, ad, renk, puruzluluk, metallik, emissive, tough, ses]
const DEFS = [
  [M.BEDROCK, 'anakaya', 0x24262c, 0.85, 0.2, 0, 255, 'stone'],
  [M.CONCRETE, 'beton', 0xa9a395, 0.92, 0.0, 0, 105, 'stone'],
  [M.CONCRETE_DARK, 'koyu beton', 0x6f6d69, 0.9, 0.0, 0, 115, 'stone'],
  [M.METAL, 'celik plaka', 0x55606e, 0.52, 0.75, 0, 190, 'metal'],
  [M.RUST, 'pasli celik', 0x8e4c2b, 0.72, 0.45, 0, 160, 'metal'],
  [M.BRICK, 'tugla', 0x8c4c3a, 0.95, 0.0, 0, 72, 'stone'],
  [M.WOOD, 'tahta', 0x8d6239, 0.82, 0.0, 0, 34, 'wood'],
  [M.NEON_ORANGE, 'turuncu neon', 0xff7a1a, 0.3, 0.0, 1.0, 48, 'glass'],
  [M.NEON_CYAN, 'camgobegi neon', 0x22e4ff, 0.3, 0.0, 1.0, 48, 'glass'],
  [M.NEON_MAGENTA, 'mor neon', 0xff36d2, 0.3, 0.0, 1.0, 48, 'glass'],
  [M.PLASTER, 'siva', 0xd9d3c5, 0.95, 0.0, 0, 58, 'stone'],
  [M.RUBBLE, 'moloz', 0x80776b, 1.0, 0.0, 0, 30, 'stone'],
  [M.TILE_A, 'karo', 0x3d4048, 0.6, 0.05, 0, 135, 'stone'],
  [M.TILE_B, 'karo koyu', 0x2e3137, 0.6, 0.05, 0, 135, 'stone'],
  [M.FRAME, 'cerceve', 0x23262d, 0.55, 0.6, 0, 255, 'metal'],
  [M.PAD, 'ziplama pedi', 0x14ffb4, 0.3, 0.0, 1.0, 255, 'metal'],
  [M.GRATE, 'izgara', 0x5f656e, 0.58, 0.7, 0, 88, 'metal'],
  [M.HAZARD, 'ikaz serit', 0xe6b31f, 0.7, 0.1, 0, 140, 'metal'],
  [M.CRYSTAL, 'kristal cam', 0x9fd8ff, 0.22, 0.0, 0.18, 14, 'glass'],
  [M.SAND, 'kum', 0xb59c74, 1.0, 0.0, 0, 24, 'stone'],
  [M.MOSS, 'yosun', 0x51703a, 1.0, 0.0, 0, 28, 'stone'],
  [M.LAMP, 'lamba', 0xfff0c4, 0.3, 0.0, 1.0, 40, 'glass'],
  [M.STEEL, 'kiris', 0x3a3f47, 0.5, 0.8, 0, 230, 'metal'],
  [M.CONCRETE_RED, 'kirmizi beton', 0x8c5a4c, 0.9, 0.0, 0, 110, 'stone'],
];

export const MAT_COUNT = 32;
export const MAT_NAME = new Array(MAT_COUNT).fill('');
export const MAT_COLOR = new Uint32Array(MAT_COUNT);     // sRGB 0xRRGGBB
export const MAT_ROUGH = new Float32Array(MAT_COUNT).fill(1);
export const MAT_METAL = new Float32Array(MAT_COUNT);
export const MAT_EMISSIVE = new Float32Array(MAT_COUNT);
export const MAT_TOUGH = new Uint8Array(MAT_COUNT);
export const MAT_SOUND = new Array(MAT_COUNT).fill('stone');
export const INDESTRUCTIBLE = new Uint8Array(MAT_COUNT);

for (const [id, name, color, rough, metal, emis, tough, snd] of DEFS) {
  MAT_NAME[id] = name;
  MAT_COLOR[id] = color;
  MAT_ROUGH[id] = rough;
  MAT_METAL[id] = metal;
  MAT_EMISSIVE[id] = emis;
  MAT_TOUGH[id] = tough;
  MAT_SOUND[id] = snd;
  INDESTRUCTIBLE[id] = tough >= 255 ? 1 : 0;
}

// Mesher icin paket: worker'a bir kez gonderilir.
export function paletteForWorker() {
  return {
    color: Array.from(MAT_COLOR),
    rough: Array.from(MAT_ROUGH),
    metal: Array.from(MAT_METAL),
    emis: Array.from(MAT_EMISSIVE),
    tough: Array.from(MAT_TOUGH),
  };
}

// sRGB hex -> [r,g,b] 0..1 lineer
export function linearRGB(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
