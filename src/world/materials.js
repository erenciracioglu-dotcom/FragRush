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
  // cayir haritasi (dogal malzemeler)
  GRASS: 25,
  DIRT: 26,
  BARK: 27,
  LEAVES: 28,
  ROCK: 29,
  CLIFF: 30,
  FLOWER: 31,
  // volkan haritasi (karanlik, lavli cayir)
  ASH: 32,
  BASALT: 33,
  SCORIA: 34,
  OBSIDIAN: 35,
  MAGMA: 36,
  VCLIFF: 37,
  FIRE: 38,
  BASALT_BRICK: 39,
  // buz golu haritasi (karli vadi, donmus gol, buz kalesi)
  SNOW: 40,
  ICE: 41,
  ICE_BRICK: 42,
  ICICLE: 43,
  SNOWPINE: 44,
  CARROT: 45,
  SROCK: 46,
  SCLIFF: 47,
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
  [M.GRASS, 'cimen', 0x5d8c34, 0.95, 0.0, 0, 40, 'dirt'],
  [M.DIRT, 'toprak', 0x6a4a2c, 1.0, 0.0, 0, 38, 'dirt'],
  [M.BARK, 'kabuk', 0x5b4330, 0.9, 0.0, 0, 62, 'wood'],
  [M.LEAVES, 'yaprak', 0x3f6d26, 0.8, 0.0, 0, 12, 'leaf'],
  [M.ROCK, 'kaya', 0x7d7a72, 0.85, 0.0, 0, 175, 'stone'],
  [M.CLIFF, 'ucurum', 0x6e685e, 0.9, 0.0, 0, 255, 'stone'],
  [M.FLOWER, 'cicek', 0x5d8c34, 0.9, 0.0, 0, 40, 'dirt'],
  [M.ASH, 'kul', 0x57514e, 1.0, 0.0, 0, 38, 'dirt'],
  [M.BASALT, 'bazalt', 0x41444c, 0.78, 0.0, 0, 160, 'stone'],
  [M.SCORIA, 'curuf', 0x5a3b31, 1.0, 0.0, 0, 64, 'stone'],
  [M.OBSIDIAN, 'obsidyen', 0x1a1520, 0.1, 0.3, 0, 110, 'glass'],
  // magma kaya: renk catlaklarin parlamasi (kabuk golgelendiricide koyu); kirilinca parlayan enkaz
  [M.MAGMA, 'magma kaya', 0xff5a16, 0.85, 0.0, 0.9, 150, 'stone'],
  [M.VCLIFF, 'volkanik ucurum', 0x37322f, 0.88, 0.0, 0, 255, 'stone'],
  [M.FIRE, 'mangal atesi', 0xff8a2a, 0.3, 0.0, 1.0, 40, 'glass'],
  [M.BASALT_BRICK, 'bazalt tas', 0x4d4745, 0.9, 0.0, 0, 125, 'stone'],
  // kar: yumusak (roket koca krater acar), ustu parlak; gol buzu: ince, kaygan (mover.js), kirilinca alti su
  [M.SNOW, 'kar', 0xeef3f8, 0.85, 0.0, 0, 18, 'snow'],
  [M.ICE, 'gol buzu', 0x9cc9de, 0.07, 0.0, 0, 30, 'ice'],
  [M.ICE_BRICK, 'buz tugla', 0xb2d6e8, 0.16, 0.0, 0, 120, 'ice'],
  [M.ICICLE, 'sarkit', 0xd6f0ff, 0.04, 0.0, 0.05, 10, 'ice'],
  [M.SNOWPINE, 'karli cam', 0x2c4a37, 0.85, 0.0, 0, 12, 'leaf'],
  [M.CARROT, 'havuc', 0xe0701c, 0.6, 0.0, 0, 20, 'dirt'],
  [M.SROCK, 'karli kaya', 0x7a7d82, 0.85, 0.0, 0, 175, 'stone'],
  [M.SCLIFF, 'karli ucurum', 0x6b6e73, 0.88, 0.0, 0, 255, 'stone'],
];

export const MAT_COUNT = 48;

// ustunde durulunca kayilan malzemeler (mover.js): gol ve dere buzu
export const SLIPPERY = new Uint8Array(MAT_COUNT);
SLIPPERY[M.ICE] = 1;

// isigi bir statik isiga bagli malzemeler: yikilinca isik soner (lamba, mangal atesi)
export const LAMP_MATS = new Set([M.LAMP, M.FIRE]);
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
