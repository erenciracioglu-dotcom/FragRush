// FragRush — tum ayarlanabilir sabitler tek yerde.

export const VS = 0.25;            // voxel boyu (metre)
export const CS = 32;              // chunk boyu (voxel)
export const WORLD = { X: 288, Y: 96, Z: 288 }; // dunya boyutu (voxel) => 72m x 24m x 72m
export const FLOOR_Y = 6;          // zemin ust yuzeyi (voxel). 0-1 ana kaya, 2-5 zemin plakasi

export const GRAVITY = 22;         // m/s^2

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

export const AUDIO = {
  master: 0.7,
};
