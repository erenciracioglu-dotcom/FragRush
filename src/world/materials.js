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
  // ay ussu haritasi (regolit, krater kayasi, cam kubbeler, beyaz govde panelleri, gunes paneli...)
  REGOLITH: 48,
  MROCK: 49,
  MCLIFF: 50,
  GLASS: 51,
  HULL: 52,
  SOLAR: 53,
  FOAM: 54,
  PLANT: 55,
  SCREEN: 56,
  FOIL: 57,
  GROW: 58,
  // oyuncak odasi haritasi (dev cocuk odasi: parke, hali, duvar kagidi, mobilya, oyuncaklar)
  SUBFLOOR: 59,
  PARQUET: 60,
  RUG: 61,
  TRACK: 62,
  TRACK_LINE: 63,
  WALLPAPER: 64,
  WALLCORE: 65,
  CEILING: 66,
  TRIM: 67,
  FURN: 68,
  PAINTED: 69,
  MATTRESS: 70,
  DUVET: 71,
  PILLOW: 72,
  CURTAIN: 73,
  BOOK: 74,
  BLOCK_R: 75,
  BLOCK_B: 76,
  BLOCK_Y: 77,
  BLOCK_G: 78,
  PLASTIC_R: 79,
  PLASTIC_B: 80,
  PLASTIC_Y: 81,
  PLASTIC_O: 82,
  CRAYON_R: 83,
  CRAYON_B: 84,
  CRAYON_G: 85,
  RUBBER: 86,
  FUR: 87,
  FUR_LIGHT: 88,
  BUTTON: 89,
  SHADE: 90,
  DOMINO: 91,
  BOOK_LAY: 92,
  // fisekhane haritasi (gece fisek fabrikasi): sandiklar, fitil, barut deposu, fenerler, isli tugla, cati, havan tupleri
  FW_CRATE: 93,
  FW_CRATE_Y: 94,
  FUSE: 95,
  FUSE_POST: 96,
  KEG: 97,
  BUNKER: 98,
  WARN: 99,
  POWDER: 100,
  LANTERN: 101,
  FBRICK: 102,
  ROOF: 103,
  TUBE: 104,
  COBBLE: 105,
  CORD: 106,
  // gok adalari haritasi (ucan adalar, bulut denizi): ada basina bir kristal kimligi (isigi ve catlaklari adaya gore
  // golgelendirilir: voxelMaterial uMatP), kumtasi alt yuz, ada topragi, mermer, pirinc, bakir kubbe, kiremit, yelken bezi,
  // halat, ada cimeni, bulut tasi (suzulen basamak taslari). 93-108 fisekhane haritasina ayrildi.
  SKY_CRYSTAL0: 109, SKY_CRYSTAL1: 110, SKY_CRYSTAL2: 111, SKY_CRYSTAL3: 112, SKY_CRYSTAL4: 113, SKY_CRYSTAL5: 114,
  SKYROCK: 115, SKYSOIL: 116, MARBLE: 117, BRASS: 118, VERDIGRIS: 119, ROOFTILE: 120, SAIL: 121, ROPE: 122,
  SKYGRASS: 123, CLOUDSTONE: 124,
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
  // regolit: ince gri toz (yumusak, roket genis krater acar); krater kayasi; harita kenarindaki yikilmaz kenar
  [M.REGOLITH, 'regolit', 0x8f8d89, 0.97, 0.0, 0, 30, 'dirt'],
  [M.MROCK, 'ay kayasi', 0x6f6d6a, 0.9, 0.0, 0, 165, 'stone'],
  [M.MCLIFF, 'krater kenari', 0x605e5b, 0.92, 0.0, 0, 255, 'stone'],
  // kubbe cami: govdeden zayif (birkac mermi ya da tek roket / plazma delik acar, hava kacar); tek basibos mermi
  // yalniz catlatir. Ayri saydam mesh olarak cizilir (chunkManager)
  [M.GLASS, 'kubbe cami', 0xa8d8f0, 0.05, 0.0, 0, 100, 'glass'],
  [M.HULL, 'govde paneli', 0xd9dbd8, 0.5, 0.25, 0, 150, 'metal'],
  [M.SOLAR, 'gunes paneli', 0x1c2d5c, 0.22, 0.55, 0, 40, 'glass'],
  // kopuk yama: delinen kubbeyi kapatir; yeniden vurulup delinebilir
  [M.FOAM, 'kopuk yama', 0xe6cf78, 0.95, 0.0, 0, 100, 'dirt'],
  [M.PLANT, 'sera bitkisi', 0x3f9a2e, 0.75, 0.0, 0, 12, 'leaf'],
  [M.SCREEN, 'ekran', 0x2ad8ff, 0.2, 0.0, 1.0, 40, 'glass'],
  [M.FOIL, 'altin folyo', 0xd8a840, 0.3, 0.9, 0, 90, 'metal'],
  [M.GROW, 'buyume lambasi', 0xff4fd8, 0.3, 0.0, 1.0, 40, 'glass'],
  // oyuncak odasi: zemin (sap yikilmaz: parke delinince alti beton), duvar (ici tugla, yikilmaz), tavan
  [M.SUBFLOOR, 'sap', 0x8b8781, 0.92, 0.0, 0, 255, 'stone'],
  [M.PARQUET, 'parke', 0xb98653, 0.5, 0.0, 0, 110, 'wood'],
  [M.RUG, 'hali', 0x4f78c2, 1.0, 0.0, 0, 36, 'cloth'],
  [M.TRACK, 'pist baskisi', 0x4b4e57, 0.95, 0.0, 0, 36, 'cloth'],
  [M.TRACK_LINE, 'pist cizgisi', 0xedebe4, 0.95, 0.0, 0, 36, 'cloth'],
  [M.WALLPAPER, 'duvar kagidi', 0xb9ddd2, 0.9, 0.0, 0, 70, 'stone'],
  [M.WALLCORE, 'duvar tuglasi', 0x9a5843, 0.95, 0.0, 0, 255, 'stone'],
  [M.CEILING, 'tavan', 0xf2efe7, 0.95, 0.0, 0, 70, 'stone'],
  [M.TRIM, 'beyaz pervaz', 0xf3f0e9, 0.42, 0.0, 0, 90, 'wood'],
  // mobilya: acik renk hus ahsap (masa, kitaplik, yatak), krem boyali ahsap (gardirop, komodin, kapi)
  [M.FURN, 'hus ahsap', 0xd6b48a, 0.48, 0.0, 0, 105, 'wood'],
  [M.PAINTED, 'boyali ahsap', 0xebe3d3, 0.4, 0.0, 0, 105, 'wood'],
  // ziplak yumusaklar (mover.js BOUNCY): silte, nevresim, yastik; perde, kitap
  [M.MATTRESS, 'silte', 0xf0ebe2, 0.95, 0.0, 0, 40, 'cloth'],
  [M.DUVET, 'nevresim', 0x2d4a8c, 0.9, 0.0, 0, 36, 'cloth'],
  [M.PILLOW, 'yastik', 0xf6f2ea, 0.95, 0.0, 0, 30, 'cloth'],
  [M.CURTAIN, 'perde', 0xf1cb66, 0.95, 0.0, 0, 22, 'cloth'],
  // kitap: dik duran (her voxel sutunu ayri kitap, sirti one bakar) ve yatik (her kat ayri kitap) iki malzeme
  [M.BOOK, 'kitap', 0x8a4a3a, 0.7, 0.0, 0, 60, 'wood'],
  [M.BOOK_LAY, 'yatik kitap', 0x3a6a8a, 0.7, 0.0, 0, 60, 'wood'],
  // oyuncaklar: boyali tahta bloklar, parlak plastik (kale, rampa, araba), boya kalemi, lastik top, pelus ayi
  [M.BLOCK_R, 'kirmizi blok', 0xd8433a, 0.5, 0.0, 0, 95, 'toy'],
  [M.BLOCK_B, 'mavi blok', 0x3e72d2, 0.5, 0.0, 0, 95, 'toy'],
  [M.BLOCK_Y, 'sari blok', 0xf2c12e, 0.5, 0.0, 0, 95, 'toy'],
  [M.BLOCK_G, 'yesil blok', 0x4ead4c, 0.5, 0.0, 0, 95, 'toy'],
  [M.PLASTIC_R, 'kirmizi plastik', 0xe23a36, 0.26, 0.0, 0, 80, 'toy'],
  [M.PLASTIC_B, 'mavi plastik', 0x2f6fe2, 0.26, 0.0, 0, 80, 'toy'],
  [M.PLASTIC_Y, 'sari plastik', 0xf6c419, 0.26, 0.0, 0, 80, 'toy'],
  [M.PLASTIC_O, 'turuncu plastik', 0xf3862a, 0.26, 0.0, 0, 80, 'toy'],
  [M.CRAYON_R, 'kirmizi boya kalemi', 0xd32f2b, 0.6, 0.0, 0, 50, 'toy'],
  [M.CRAYON_B, 'mavi boya kalemi', 0x2d5dd0, 0.6, 0.0, 0, 50, 'toy'],
  [M.CRAYON_G, 'yesil boya kalemi', 0x38993a, 0.6, 0.0, 0, 50, 'toy'],
  [M.RUBBER, 'lastik', 0xe8452d, 0.34, 0.0, 0, 60, 'rubber'],
  [M.FUR, 'pelus', 0x9a6a3d, 1.0, 0.0, 0, 30, 'cloth'],
  [M.FUR_LIGHT, 'acik pelus', 0xd9b48a, 1.0, 0.0, 0, 30, 'cloth'],
  [M.BUTTON, 'dugme', 0x1b1515, 0.14, 0.0, 0, 80, 'toy'],
  // abajur / lamba kubbesi: isikli (statik isiga bagli, kirilinca soner)
  [M.SHADE, 'abajur', 0xffd498, 0.6, 0.0, 1.0, 30, 'cloth'],
  // domino: dunyada voxeli yok (sanal kati hucre, fx/toyroom.js); isin izleme carpmasi, etki rengi ve sesi
  [M.DOMINO, 'domino', 0xf5efe2, 0.3, 0.0, 0, 90, 'toy'],
  // fisekhane: fisek sandiklari (kagit kapli, tutusur: fx/fireworks.js listeyle izler), barut fitili (tek mermi koparir),
  // fitilin basindaki kirmizi direk, barut ficisi, depo betonu, uyari levhasi, barut cuvali, kagit fener (isikli)
  [M.FW_CRATE, 'fisek sandigi', 0xc4261c, 0.72, 0.0, 0, 40, 'wood'],
  [M.FW_CRATE_Y, 'sari fisek sandigi', 0xeab21a, 0.72, 0.0, 0, 40, 'wood'],
  [M.FUSE, 'barut fitili', 0x3b3936, 0.95, 0.0, 0, 14, 'dirt'],
  [M.FUSE_POST, 'fitil diregi', 0xd42a1e, 0.45, 0.2, 0, 120, 'metal'],
  [M.KEG, 'barut ficisi', 0x5c3b22, 0.78, 0.0, 0, 50, 'wood'],
  [M.BUNKER, 'depo betonu', 0x7b8276, 0.93, 0.0, 0, 150, 'stone'],
  [M.WARN, 'uyari levhasi', 0xf0be1e, 0.45, 0.3, 0, 60, 'metal'],
  [M.POWDER, 'barut cuvali', 0x2f2b27, 1.0, 0.0, 0, 30, 'cloth'],
  [M.LANTERN, 'kagit fener', 0xff5626, 0.6, 0.0, 1.0, 14, 'cloth'],
  // fabrika: isli tugla, cati tahtasi, havan tupu (karton), avlu kaldirimi, fener ipi
  [M.FBRICK, 'isli tugla', 0x6f3b2c, 0.95, 0.0, 0, 72, 'stone'],
  [M.ROOF, 'cati tahtasi', 0x4b3526, 0.86, 0.0, 0, 34, 'wood'],
  [M.TUBE, 'havan tupu', 0x3e5b3b, 0.8, 0.0, 0, 45, 'wood'],
  [M.COBBLE, 'arnavut kaldirimi', 0x5f5c58, 0.9, 0.0, 0, 130, 'stone'],
  [M.CORD, 'fener ipi', 0x3a2b1f, 1.0, 0.0, 0, 10, 'cloth'],
  // gok adalari: kristaller yikilmaz (cani fx/sky-islands.js'te; kirilinca ada duser) ve parlak; kumtasi sert, toprak yumusak
  [M.SKY_CRYSTAL0, 'ana kristal', 0x9fe6ff, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKY_CRYSTAL1, 'bahce kristali', 0x8fd6ff, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKY_CRYSTAL2, 'degirmen kristali', 0xb8a0ff, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKY_CRYSTAL3, 'koy kristali', 0x86f2da, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKY_CRYSTAL4, 'harabe kristali', 0xc9a8ff, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKY_CRYSTAL5, 'ocak kristali', 0x9cbcff, 0.12, 0.0, 0.9, 255, 'glass'],
  [M.SKYROCK, 'ada kayasi', 0xb98a5e, 0.9, 0.0, 0, 150, 'stone'],
  [M.SKYSOIL, 'ada topragi', 0x6e4b30, 1.0, 0.0, 0, 40, 'dirt'],
  [M.MARBLE, 'mermer', 0xe9e3d7, 0.32, 0.0, 0, 140, 'stone'],
  [M.BRASS, 'pirinc', 0xc9a14a, 0.28, 0.9, 0, 170, 'metal'],
  [M.VERDIGRIS, 'bakir kubbe', 0x63a894, 0.55, 0.45, 0, 150, 'metal'],
  [M.ROOFTILE, 'kiremit', 0xb5553a, 0.8, 0.0, 0, 70, 'stone'],
  [M.SAIL, 'yelken bezi', 0xeee3cc, 0.95, 0.0, 0, 20, 'cloth'],
  [M.ROPE, 'halat', 0x9c7a4c, 0.95, 0.0, 0, 25, 'wood'],
  [M.SKYGRASS, 'ada cimeni', 0x6fae3e, 0.95, 0.0, 0, 40, 'dirt'],
  [M.CLOUDSTONE, 'bulut tasi', 0xc9d4e4, 0.6, 0.0, 0.3, 160, 'stone'],
];

// 93-108 fisekhane, 109-124 gok adalari
export const MAT_COUNT = 125;

// ustunde durulunca kayilan malzemeler (mover.js): gol ve dere buzu
export const SLIPPERY = new Uint8Array(MAT_COUNT);
SLIPPERY[M.ICE] = 1;

// ziplak malzemeler (mover.js): hizla dusen geri seker (oyuncak odasi: silte, nevresim, yastik, lastik top)
export const BOUNCY = new Uint8Array(MAT_COUNT);
BOUNCY[M.MATTRESS] = 1; BOUNCY[M.DUVET] = 1; BOUNCY[M.PILLOW] = 1; BOUNCY[M.RUBBER] = 1;

// isigi bir statik isiga bagli malzemeler: yikilinca isik soner (lamba, mangal atesi)
export const LAMP_MATS = new Set([M.LAMP, M.FIRE, M.GROW, M.SCREEN, M.SHADE, M.LANTERN]);
// saydam malzemeler: ayri saydam mesh (mesher bolmesi) ve botlarin gorus hatti (icinden gorulur, mermi carpar)
export const TRANSPARENT = new Uint8Array(MAT_COUNT);
TRANSPARENT[M.GLASS] = 1;
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
    transp: Array.from(TRANSPARENT),
  };
}

// sRGB hex -> [r,g,b] 0..1 lineer
export function linearRGB(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}
