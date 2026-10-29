// FragRush — tum ayarlanabilir sabitler tek yerde.

export const VS = 0.25;            // voxel boyu (metre)
export const CS = 32;              // chunk boyu (voxel)
export const WORLD = { X: 288, Y: 96, Z: 288 }; // dunya boyutu (voxel) => 72m x 24m x 72m
export const FLOOR_Y = 6;          // zemin ust yuzeyi (voxel). 0-1 ana kaya, 2-5 zemin plakasi

// Yercekimi haritaya gore (game.js buildArena -> setPhysics, harita ciktisindaki gravity). Ay ussunde ~0.35 kati;
// diger haritalarda 22. Canli baglanti (export let): mover, botlar, yikim, enkaz ve ogeler hep o anki degeri okur.
export const GRAVITY0 = 22;        // varsayilan (m/s^2)
export let GRAVITY = GRAVITY0;     // m/s^2

export const MOVE = {
  radius: 0.34,          // yatay yari genislik (AABB)
  height: 1.8,
  crouchHeight: 1.15,
  eye: 1.62,
  crouchEye: 1.0,
  runSpeed: 9.6,
  crouchSpeed: 4.6,
  groundAccel: 13,
  airAccel: 1.8,
  airControl: 110,       // CPM tarzi havada yon kontrolu
  friction: 7.5,
  stopSpeed: 3.0,
  jumpVel: 7.4,
  stepHeight: 0.62,
  dashSpeed: 17.5,
  dashUp: 2.6,
  dashCooldown: 0.9,
  maxFallSpeed: 60,
};

// harita fizigi: yercekimi (m/s^2) ve hareketin yercekimine bagli ayarlari (ziplama hizi, azami dusus hizi,
// atilmanin yukari hizi). Verilmeyen deger varsayilana doner: harita degisince onceki haritanin ayari kalmaz.
const MOVE0 = { jumpVel: MOVE.jumpVel, maxFallSpeed: MOVE.maxFallSpeed, dashUp: MOVE.dashUp };
export function setPhysics(gravity = GRAVITY0, move = null) {
  GRAVITY = gravity > 0 ? gravity : GRAVITY0;
  for (const k in MOVE0) MOVE[k] = move && move[k] != null ? move[k] : MOVE0[k];
}

// Su (cayir haritasi): siglikta yavaslama, derinde yuzme, bogulma.
export const WATER = {
  swimDepth: 1.0,        // ayak derinligi (m): bunun ustunde yuzulur, altinda yurunur
  wadeSlow: 1.5,         // siglikta yavaslama: hiz carpani 1 - batan oran * wadeSlow
  wadeMin: 0.45,
  swimSpeed: 4.2,        // m/s (kosu 9.6)
  swimAccel: 4,          // yatay su direnci / itme (1/s)
  buoyancy: 0.97,        // tamamen batinca kaldirma / yercekimi (1'in alti: yavasca batar)
  thrustUp: 0.21,        // Bosluk: yukari itme (yercekimi orani); yuzeyde basin suyun ustunde kalir
  thrustDown: 0.3,       // C: dalis
  dragY: 2,              // dikey dogrusal direnc (1/s)
  dragQ: 0.35,           // karesel direnc: hizli dusus suya girince cabuk yavaslar
  ledge: 1.0,            // sudan tirmanilabilen kiyi yuksekligi (su yuzeyinin ustu, m)
  air: 12,               // nefes (s)
  drownFirst: 10,        // nefes bitince ilk hasar; her saniye drownStep artar
  drownStep: 5,
  drownMax: 40,
};

// Buz golu haritasi: kaygan gol buzu, buz gibi su, buzu alttan kirma, yeniden donma, sarkit.
export const ICE = {
  friction: 1.4,         // gol buzunda surtunme (normal zemin 7.5): tus birakilinca kosu hizindan ~6 m kayilir
  accel: 3.0,            // buzda hizlanma (normal 13): kalkis ve donus genis; ters yone basinca ~2.5 m'de durulur
  slideFriction: 0.22,   // buzda egilip kayma (normal 0.9)
  coldDepth: 0.35,       // ayak bu derinlikten fazla sudaysa (m) soguk hasari
  coldTick: 0.5,         // s: hasar araligi
  coldFirst: 5,          // ilk hasar (zirhi deler), her tikte coldStep artar
  coldStep: 1,
  coldMax: 12,
  credit: 14,            // s: buzu kirilip suya dusen bu sure icinde donar / bogulursa parcalama kirana
  creditFall: 3,         // s: suya dusulen yerin buzu en cok bu kadar once kirildiysa kirana yazilir
  pushTime: 0.9,         // s: buz altinda Bosluk basili tutulunca tavan kirilir
  refreezeTick: 0.25,    // s: yeniden donma adimi
  refreezeTop: 0.12,     // ust katin (yuzey) kenardan donma olasiligi / adim
  refreezeLow: 0.05,     // alt katlarin olasiligi (ustu donmus olmali)
  icicleMin: 30,         // dusen sarkit hasari: icicleMin + voxel * icicleK (en cok icicleMax)
  icicleK: 6,
  icicleMax: 130,
};

// Oyuncak odasi: ziplak yuzeyler (silte, nevresim, yastik, lastik top; materials.js BOUNCY). Belli bir hizin
// ustunde dusen geri seker: cikis hizi = inis hizi * restitution; inerken Bosluk basiliysa + jumpBoost (trambolin).
// Sekmeler sonumlenir (Bosluksuz her sekmede %20 kayip); en yuksek sekme hizi max (~5 m).
export const BOUNCE = {
  min: 4.5,              // m/s: bundan yavas inis sekmez (yurume, kisa dusus)
  restitution: 0.8,
  jumpBoost: 4.5,        // m/s
  max: 15,               // m/s: ~5.1 m yukseklik
};

export const PLAYER = {
  maxHealth: 100,
  overHealth: 200,
  maxArmor: 150,
  spawnHealth: 125,      // dogarken biraz fazla can (Q3 gibi zamanla 100'e iner)
  spawnArmor: 0,
  respawnDelay: 1.6,
  spawnProtect: 1.2,
  selfDamageScale: 0.4,  // roket ziplamasi icin
};

// KIYAMET modu: kisa ama yikici. Her mermi tek vurusta oldurur, roket patlamasi 5 kat.
export const DOOMSDAY = { time: 15, rocketScale: 5, lethal: 999 };

export const MATCH = {
  fragLimit: 25,
  timeLimit: 10 * 60,
  botCount: 7,
  powerupEvery: 70,
};

export const FX = {
  maxDebris: 6000,
  maxParticles: 9000,
  maxSmoke: 2500,
  lightPool: 14,
};

// Cok oyunculu (ARKADASLA OYNA): sinyal sunucusu (Cloudflare Worker). Bos = canli adres henuz yok (yerelde 127.0.0.1:8787).
export const NET = { signal: 'https://fragrush-rooms.fragrush-rooms.workers.dev', maxGuests: 3 };

export const AUDIO = {
  master: 0.7,
};
