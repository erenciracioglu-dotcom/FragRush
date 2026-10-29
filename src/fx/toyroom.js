// Oyuncak Odasi haritasi ortami ve kurallari (world/toyroom.js uretir):
//  - Isik: kuzey penceresinden giren ogle gunesi (golgeli; yerde gunes lekesi), pencereden odaya inen isik
//    huzmeleri ve icinde ucusan toz zerreleri; tavan lambasi, gece lambasi, masa lambasi (statik isiklar). Ortam
//    haritasi: sicak renkli oda (parke, pastel duvarlar, parlak pencere). Pencereden gorunen gok: mavi gok, bulutlar,
//    bahcenin agaclari.
//  - Domino zinciri (game/domino.js): dev dominolar sanal kati hucrelerdir (world.extra). Mermi ya da patlama
//    dokununca devrilir; dalga kuleye kadar kosar, son domino blok kuleye carpinca kule mentese gibi haliya devrilir
//    (destruction.topple). Dusen domino altindakini yaralar, kule ezer: hepsi ilk dominoyu vurana yazilir (DOMINO!).
//    ~45 sn sonra dominolar kalkip yeniden dizilir, sacilan bloklar toplanir, kule yerine kurulur.
//  - Ziplak yuzeyler (mover.js BOUNCY): sekiste boing sesi + toz.
//  - Dekor: duvar saati (gercek saat, tik tak), duvarda bantli cocuk cizimi, disarida kus sesleri, mac basinda
//    muzik kutusu ezgisi.
import * as THREE from 'three';
import { VS } from '../config.js';
import { M, MAT_COLOR, linearRGB } from '../world/materials.js';
import { DominoChain, DOM } from '../game/domino.js';
import { t } from '../i18n.js';

// gunes (pencereden; derece) ve isik ayarlari (game.js applyEnvironment)
export const TOY_ENV = {
  sunElev: 50, sunAzim: 165,
  sun: 0xfff0d8, sunIntensity: 3.3,
  hemiSky: 0xfff3e4, hemiGround: 0x9c7c5c, hemi: 0.95,
  fog: 0xe8ddd0, fogDensity: 0.0030, envIntensity: 0.72,
};
export const RESET_TIME = 45;          // s: zincir basladiktan sonra dominolar yeniden dizilir
const DOMINO_DMG = 40;                 // dusen domino altindakine bir kez
const DOMINO_PUSH = 5;                 // m/s
// dev domino agir: tek mermi sallar, itis birikince devrilir (isabet gucu / 100: darbe 0.78, sacma tanesi 0.96,
// plazma 1.65, ray 3). Ilk domino zincirin tetigi: tek isabet yeter. Birikim saniyede SHOVE_DECAY soner.
const SHOVE_MIN = 2.2, SHOVE_FIRST = 0.5, SHOVE_DECAY = 0.6;
const TOWER_MATS = new Set([M.BLOCK_R, M.BLOCK_B, M.BLOCK_Y, M.BLOCK_G, M.PLASTIC_R]);
const DOMINO_COLORS = [0xd8402f, 0xf2c32e, 0x2f72d8, 0x3aa85c, 0xf08a24, 0x8a52c8];
const BLOCK_LIN = [M.BLOCK_R, M.BLOCK_B, M.BLOCK_Y, M.BLOCK_G].map((m) => linearRGB(MAT_COLOR[m]));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _p = { x: 0, y: 0, z: 0 };

export function toyDirs() {
  const d = THREE.MathUtils.degToRad;
  return { sun: new THREE.Vector3().setFromSphericalCoords(1, d(90 - TOY_ENV.sunElev), d(TOY_ENV.sunAzim)) };
}

// ---------------------------------------------------------------- pencereden gorunen gok / ortam haritasi
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */`
uniform float uTime;
uniform vec3 uSun;
uniform float uEnv;     // 1: ortam haritasi (oda ici: parke, pastel duvar, parlak pencere, lamba)
varying vec3 vDir;
float tHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float tNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(tHash(i), tHash(i + vec3(1, 0, 0)), f.x), mix(tHash(i + vec3(0, 1, 0)), tHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(tHash(i + vec3(0, 0, 1)), tHash(i + vec3(1, 0, 1)), f.x), mix(tHash(i + vec3(0, 1, 1)), tHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float tFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * tNoise(p); p = p * 2.03 + 5.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  vec3 col;
  if (uEnv > 0.5) {
    // oda: tavan sicak beyaz (ortada lamba), duvarlar pastel mavi, zemin parke; kuzeyde (-z) parlak pencere
    float up = d.y;
    vec3 wall = vec3(0.56, 0.64, 0.74);
    vec3 ceil = vec3(0.86, 0.82, 0.76);
    vec3 floor_ = vec3(0.42, 0.27, 0.15);
    col = mix(wall, ceil, smoothstep(0.55, 0.9, up));
    col = mix(col, floor_, smoothstep(-0.15, -0.45, up));
    col += vec3(2.4, 2.0, 1.4) * pow(max(up, 0.0), 40.0);
    float az = atan(d.x, -d.z);
    float win = smoothstep(0.42, 0.3, abs(az)) * smoothstep(0.08, 0.18, up) * smoothstep(0.62, 0.48, up);
    col = mix(col, vec3(2.3, 2.4, 2.6), win);
    // gunesli zemin lekesi (yansiyan sicak isik)
    col += vec3(0.5, 0.38, 0.22) * smoothstep(-0.3, -0.6, up) * smoothstep(1.2, 0.2, abs(az));
  } else {
    float h = max(d.y, 0.0);
    vec3 zen = vec3(0.16, 0.36, 0.78), hor = vec3(0.66, 0.80, 0.94);
    col = mix(hor, zen, pow(h, 0.55));
    // bulutlar (yavas kayar)
    vec2 cp = d.xz / max(0.08, d.y) * 0.9 + vec2(uTime * 0.012, uTime * 0.004);
    float cl = smoothstep(0.52, 0.78, tFbm(vec3(cp, 1.7)));
    col = mix(col, vec3(1.0, 0.99, 0.97), cl * smoothstep(0.03, 0.18, d.y) * 0.85);
    // gunes
    float sd = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.92, 0.7) * (pow(sd, 900.0) * 30.0 + pow(sd, 24.0) * 0.35);
    // ufukta bahcenin agaclari ve cimen (azimuta gore inip cikan sira)
    float az = atan(d.z, d.x);
    float tree = 0.035 + 0.075 * tFbm(vec3(az * 6.0, 0.0, 2.0)) + 0.02 * sin(az * 23.0);
    float isTree = smoothstep(tree + 0.004, tree - 0.004, d.y);
    vec3 tc = mix(vec3(0.10, 0.26, 0.10), vec3(0.20, 0.42, 0.16), tNoise(vec3(az * 40.0, d.y * 60.0, 1.0)));
    col = mix(col, tc, isTree);
    col = mix(col, vec3(0.30, 0.52, 0.18), smoothstep(0.01, -0.01, d.y));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createToySky() {
  const uniforms = { uTime: { value: 0 }, uSun: { value: toyDirs().sun }, uEnv: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'toySky';
  mesh.visible = false;
  return { mesh, uniforms };
}

// oda icinden ortam haritasi (PMREM): parlak plastik ve metal yansimalari, yumusak dolgu
export function createToyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = createToySky();
  sky.uniforms.uEnv.value = 1;
  sky.mesh.visible = true;
  sky.mesh.material.depthTest = true;
  s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose();
  sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- kucuk yardimcilar
function canvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function canvasTex(c) {
  if (!c) return null;
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

// domino yuzu dokusu: 8 hucre (0-6 nokta + bos); her hucrenin alt kenarinda (v=0) orta cizgi
function dominoAtlas() {
  const c = canvas(1024, 128);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1024, 128);
  const P = { TL: [34, 34], TR: [94, 34], ML: [34, 64], C: [64, 64], MR: [94, 64], BL: [34, 94], BR: [94, 94] };
  const sets = [[], ['C'], ['TL', 'BR'], ['TL', 'C', 'BR'], ['TL', 'TR', 'BL', 'BR'], ['TL', 'TR', 'C', 'BL', 'BR'], ['TL', 'TR', 'ML', 'MR', 'BL', 'BR']];
  for (let k = 0; k < 7; k++) {
    const ox = k * 128;
    g.fillStyle = '#1d1e26';
    for (const n of sets[k]) { const [x, y] = P[n]; g.beginPath(); g.arc(ox + x, y - 6, 12, 0, Math.PI * 2); g.fill(); }
    g.fillRect(ox, 121, 128, 7);
  }
  return canvasTex(c);
}

// domino kutusu (merkez orijinde; genislik x, yukari y, kalinlik z). Buyuk yuzler iki yarim: ust ve alt yari
// ayri nokta deseni; yanlar dokunun bos hucresi. Renk: tepe rengi.
function dominoGeometry(top, bot, color) {
  const hw = DOM.W / 2, hh = DOM.H / 2, ht = DOM.T / 2;
  const pos = [], nor = [], uv = [], col = [];
  const c = new THREE.Color(color);
  const quad = (a, b, cc, d, n, q) => {
    const P = [a, b, cc, a, cc, d], Q = [q[0], q[1], q[2], q[0], q[2], q[3]];
    for (let i = 0; i < 6; i++) { pos.push(P[i][0], P[i][1], P[i][2]); nor.push(n[0], n[1], n[2]); uv.push(Q[i][0], Q[i][1]); col.push(c.r, c.g, c.b); }
  };
  const blank = [[7.2 / 8, 0.3], [7.8 / 8, 0.3], [7.8 / 8, 0.8], [7.2 / 8, 0.8]];
  quad([hw, -hh, ht], [hw, -hh, -ht], [hw, hh, -ht], [hw, hh, ht], [1, 0, 0], blank);
  quad([-hw, -hh, -ht], [-hw, -hh, ht], [-hw, hh, ht], [-hw, hh, -ht], [-1, 0, 0], blank);
  quad([-hw, hh, ht], [hw, hh, ht], [hw, hh, -ht], [-hw, hh, -ht], [0, 1, 0], blank);
  quad([-hw, -hh, -ht], [hw, -hh, -ht], [hw, -hh, ht], [-hw, -hh, ht], [0, -1, 0], blank);
  const face = (s, y0, y1, k, flip) => {
    const u0 = k / 8, u1 = (k + 1) / 8, z = s * ht, xl = s > 0 ? -hw : hw, xr = -xl;
    const va = flip ? 1 : 0, vb = flip ? 0 : 1;
    quad([xl, y0, z], [xr, y0, z], [xr, y1, z], [xl, y1, z], [0, 0, s], [[u0, va], [u1, va], [u1, vb], [u0, vb]]);
  };
  for (const s of [1, -1]) { face(s, 0, hh, top, false); face(s, -hh, 0, bot, true); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// isik huzmesi karti (pencereden yere; kameraya donen serit)
const BEAM_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const BEAM_FS = /* glsl */`
uniform float uTime;
uniform float uStrength;
uniform vec3 uColor;
uniform vec3 uCam;
varying vec2 vUv;
varying vec3 vW;
void main() {
  float across = sin(3.14159 * vUv.x); across *= across;
  float along = smoothstep(0.0, 0.1, vUv.y) * (1.0 - 0.6 * vUv.y) * smoothstep(1.0, 0.86, vUv.y);
  float n = 0.72 + 0.28 * sin(vW.x * 1.3 + vW.y * 0.7 + uTime * 0.5) * sin(vW.z * 1.1 - uTime * 0.35);
  float near = smoothstep(1.5, 7.0, distance(uCam, vW));
  float a = across * along * n * near * uStrength;
  gl_FragColor = vec4(uColor * a, a);
}`;

// toz zerreleri (huzme icinde suzulur, isikta parlar)
const MOTE_VS = /* glsl */`
uniform float uTime;
uniform float uScale;
attribute float aPhase;
varying float vA;
void main() {
  vec3 p = position + vec3(sin(uTime * 0.21 + aPhase * 6.0), sin(uTime * 0.13 + aPhase * 4.0) * 0.6, cos(uTime * 0.17 + aPhase * 5.0)) * 0.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uScale * 0.045 / max(0.5, -mv.z);
  vA = (0.45 + 0.55 * sin(uTime * (1.2 + aPhase) + aPhase * 20.0)) * smoothstep(1.0, 4.0, -mv.z);
}`;
const MOTE_FS = /* glsl */`
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.25, 0.02, dot(c, c)) * vA * 0.8;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a, a);
}`;

// duvar saati yuzu (rakamlar, renkli nokta isaretleri)
function clockFace() {
  const c = canvas(256, 256);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf6ea'; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
  const cols = ['#e04a3a', '#f0b030', '#3a7ad8', '#3aa860'];
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    const x = 128 + Math.sin(a) * 100, y = 128 - Math.cos(a) * 100;
    g.fillStyle = cols[k % 4];
    g.beginPath(); g.arc(x, y, k % 3 === 0 ? 9 : 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a2a38';
    g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(k === 0 ? 12 : k), 128 + Math.sin(a) * 76, 128 - Math.cos(a) * 76);
  }
  return canvasTex(c);
}

// bantli cocuk cizimi (ozgun karalama: gunes, ev, agac, el ele iki robot, cimen)
function kidDrawing() {
  const c = canvas(512, 368);
  if (!c) return null;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf4'; g.fillRect(0, 0, 512, 368);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const scribble = (col, w, pts) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); };
  // gok seridi
  for (let i = 0; i < 26; i++) scribble('#7cb4ee', 6, [10 + i * 19, 18, 24 + i * 19, 52]);
  // gunes
  g.fillStyle = '#f6c12c'; g.beginPath(); g.arc(430, 78, 38, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; scribble('#f2a82a', 6, [430 + Math.cos(a) * 48, 78 + Math.sin(a) * 48, 430 + Math.cos(a) * 70, 78 + Math.sin(a) * 70]); }
  // cimen
  for (let i = 0; i < 60; i++) scribble('#4aa646', 5, [6 + i * 8.5, 352, 10 + i * 8.5, 318 - (i % 3) * 6]);
  // ev
  scribble('#d8402f', 7, [60, 300, 60, 200, 190, 200, 190, 300, 60, 300]);
  scribble('#8a52c8', 7, [44, 206, 125, 128, 206, 206]);
  scribble('#3a7ad8', 6, [96, 300, 96, 250, 126, 250, 126, 300]);
  scribble('#f0b030', 6, [146, 220, 172, 220, 172, 246, 146, 246, 146, 220]);
  // agac
  scribble('#7a4a24', 10, [262, 312, 262, 236]);
  g.fillStyle = '#3a9a40'; g.beginPath(); g.arc(262, 206, 42, 0, Math.PI * 2); g.fill();
  // iki robot el ele
  const robot = (x, col) => {
    scribble(col, 6, [x - 16, 258, x + 16, 258, x + 16, 224, x - 16, 224, x - 16, 258]);
    scribble(col, 6, [x - 11, 222, x - 11, 198, x + 11, 198, x + 11, 222]);
    scribble(col, 4, [x, 198, x, 186]);
    g.fillStyle = col; g.beginPath(); g.arc(x, 182, 5, 0, Math.PI * 2); g.fill();
    scribble(col, 5, [x - 8, 258, x - 10, 290]); scribble(col, 5, [x + 8, 258, x + 10, 290]);
  };
  robot(352, '#2f72d8'); robot(426, '#e0602a');
  scribble('#555566', 5, [368, 236, 410, 236]);
  return canvasTex(c);
}

// ---------------------------------------------------------------- sistem
export class ToySystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.group = new THREE.Group();
    this.group.name = 'toyroom';
    game.scene.add(this.group);
    this.chain = null;
    this.meshes = [];
    this.tower = null;
    this.time = 0;
    this.stats = { knocks: 0, chains: 0, topples: 0, resets: 0, hits: 0 };
    this._atlas = null;
    this._dmat = null;
  }

  // arena: world/toyroom.js generateToyroom ciktisi
  setup(arena) {
    this.disable();
    const game = this.game, w = game.world, toy = arena.toy;
    w.extra = w.extra && w.extra.length === w.mat.length ? w.extra.fill(0) : new Uint8Array(w.mat.length);
    w.extraMat = M.DOMINO;
    const ch = this.chain = new DominoChain(w, toy.chain);
    ch.onBlock = (d, x, y, z) => this._onBlock(d, x, y, z);
    ch.isBlock = (x, y, z) => this._towerSolid(x, y, z);
    ch.standAll();
    // zincirin kaba kutusu (patlama on elemesi)
    let bx0 = 1e9, bz0 = 1e9, bx1 = -1e9, bz1 = -1e9;
    for (const d of ch.list) { bx0 = Math.min(bx0, d.x); bx1 = Math.max(bx1, d.x); bz0 = Math.min(bz0, d.z); bz1 = Math.max(bz1, d.z); }
    this.box = [bx0 - 2.5, bz0 - 2.5, bx1 + 2.5, bz1 + 2.5];
    // blok kule: voxel anlik goruntusu (yeniden kurulum), devrilme alani
    const T = toy.tower, [x0, y0, z0, x1, y1, z1] = T.box;
    const nx = x1 - x0, ny = y1 - y0, nz = z1 - z0;
    const snap = new Uint8Array(nx * ny * nz);
    let count = 0;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const m = w.mat[w.idx(x0 + x, y0 + y, z0 + z)];
      snap[x + nx * (z + nz * y)] = m;
      if (m) count++;
    }
    const L = Math.ceil(T.height / VS) + 6;
    const fz = T.dir[1];
    this.tower = {
      ...T, nx, ny, nz, snap, count, state: 'stand', body: null, by: null, layer: -1, layerT: 0, repairT: -1,
      // devrilme alani (voxel): kule genisliginin iki yani + boyu kadar devrilme yonunde
      zone: fz < 0 ? [x0 - 10, z0 - L, x1 + 10, z1 + 2] : [x0 - 10, z0 - 2, x1 + 10, z1 + L],
      checkT: 2,
    };
    this.floorY = toy.G0 * VS;
    this.resetT = -1; this.resetPending = false; this.towerRebuildT = -1; this.warnT = 0; this.runId = 0; this.runBy = null;
    this.time = 0; this.tickT = 1; this.birdT = 3; this._mbPlayed = false;
    this.stats = { knocks: 0, chains: 0, topples: 0, resets: 0, hits: 0 };
    this._buildMeshes(toy);
    this._buildLight(toy);
    this._buildDecor(toy);
    this.group.visible = true;
    this.active = true;
  }

  disable() {
    const w = this.game.world;
    if (this.chain) this.chain.clearAll();
    this.chain = null;
    w.extra = null; w.extraMat = 0;
    for (const o of [...this.group.children]) {
      this.group.remove(o);
      o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material && n.material !== this._dmat && !Array.isArray(n.material)) { if (n.material.map && n.material.map !== this._atlas) n.material.map.dispose(); n.material.dispose(); } });
    }
    this.meshes = []; this.beams = []; this.motes = null; this.clock = null; this.drawing = null;
    this.tower = null;
    this.group.visible = false;
    this.active = false;
  }

  // ---- kurulum: dominolar
  _buildMeshes(toy) {
    if (!this._dmat) {
      this._atlas = dominoAtlas();
      this._dmat = new THREE.MeshStandardMaterial({ map: this._atlas, vertexColors: true, roughness: 0.36, metalness: 0.0 });
    }
    const rng = mulberry(toy.chain.length * 7919 + 13);
    this.meshes = this.chain.list.map((d, i) => {
      const geo = dominoGeometry(1 + ((rng() * 6) | 0), (rng() * 7) | 0, DOMINO_COLORS[i % DOMINO_COLORS.length]);
      const mesh = new THREE.Mesh(geo, this._dmat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.name = 'domino';
      this.group.add(mesh);
      return mesh;
    });
    this._placeDominoes();
  }

  _placeDominoes() {
    const ch = this.chain;
    for (let i = 0; i < ch.list.length; i++) {
      const d = ch.list[i], mesh = this.meshes[i];
      // ayakta domino isabet alinca sallanir (yalniz gorsel; sonumlu salinim)
      let phi = d.phi;
      if (d.wobA) {
        const t = this.time - d.wobT;
        if (d.st !== 'stand' || t > 1.4) d.wobA = 0;
        else phi = d.wobA * Math.exp(-t * 4.5) * Math.sin(t * 19 + 0.3);
      }
      const s = Math.sin(phi), c = Math.cos(phi);
      const Fx = d.fx * d.dir, Fz = d.fz * d.dir;
      const ey = _v.set(Fx * s, c, Fz * s);
      const ez = _v2.set(Fx * c, -s, Fz * c);
      const ex = _v3.crossVectors(ey, ez);
      ch.point(d, 0, DOM.H * 0.5, -DOM.T * 0.5, _p, phi);
      _m.makeBasis(ex, ey, ez).setPosition(_p.x, _p.y, _p.z);
      mesh.matrix.copy(_m);
      mesh.matrixWorldNeedsUpdate = true;
    }
  }

  // ---- kurulum: pencere isigi (huzme kartlari + toz zerreleri)
  _buildLight(toy) {
    const W = toy.decor.window, L = toyDirs().sun.negate();
    this.beamDir = L.clone();
    const rng = mulberry(4242);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0.11 }, uColor: { value: new THREE.Color(1.0, 0.9, 0.72) }, uCam: { value: new THREE.Vector3() } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    });
    this.beamMat = mat;
    const floorY = toy.G0 * VS;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.beams = [];
    for (let k = 0; k < 7; k++) {
      const x = W.x0 + 1.5 + (W.x1 - W.x0 - 3) * ((k + 0.5) / 7) + (rng() - 0.5) * 1.2;
      const y = W.y0 + 1.5 + (W.y1 - W.y0 - 3) * rng();
      const S = new THREE.Vector3(x, y, W.z + 0.9);
      const tl = (y - floorY) / -L.y;
      const E = S.clone().addScaledVector(L, tl);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      mesh.name = 'sunbeam';
      this.group.add(mesh);
      this.beams.push({ mesh, S, E, width: 2.2 + rng() * 2.2 });
    }
    // toz zerreleri
    const N = 260, pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = W.x0 + 0.5 + (W.x1 - W.x0 - 1) * rng(), y = W.y0 + 0.5 + (W.y1 - W.y0 - 1) * rng();
      const tl = (y - floorY) / -L.y * (0.05 + 0.9 * rng());
      pos[i * 3] = x + L.x * tl; pos[i * 3 + 1] = y + L.y * tl; pos[i * 3 + 2] = W.z + 0.9 + L.z * tl;
      ph[i] = rng();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const mm = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 } }, vertexShader: MOTE_VS, fragmentShader: MOTE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.motes = new THREE.Points(mg, mm);
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 9;
    this.group.add(this.motes);
  }

  // ---- kurulum: duvar saati ve cocuk cizimi
  _buildDecor(toy) {
    const D = toy.decor;
    {
      const C = D.clock, g = new THREE.Group();
      g.position.set(C.x + C.nx * 0.05, C.y, C.z);
      g.rotation.y = C.nx > 0 ? Math.PI / 2 : -Math.PI / 2;
      const face = new THREE.Mesh(new THREE.CircleGeometry(C.r, 48), new THREE.MeshStandardMaterial({ map: clockFace(), color: 0xffffff, roughness: 0.7 }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(C.r + 0.08, 0.2, 10, 48), new THREE.MeshStandardMaterial({ color: 0xd8402f, roughness: 0.35 }));
      rim.position.z = 0.05;
      const hand = (len, wid, col, z) => {
        const geo = new THREE.BoxGeometry(wid, len, 0.05); geo.translate(0, len * 0.42, 0);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 }));
        m.position.z = z; g.add(m); return m;
      };
      const hh = hand(C.r * 0.55, 0.17, 0x22232e, 0.06), mh = hand(C.r * 0.82, 0.1, 0x22232e, 0.1), sh = hand(C.r * 0.88, 0.04, 0xd8402f, 0.14);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xf2c32e, roughness: 0.4 }));
      hub.rotation.x = Math.PI / 2; hub.position.z = 0.16;
      g.add(face, rim, hub);
      g.traverse((n) => { if (n.isMesh) n.castShadow = false; });
      this.group.add(g);
      this.clock = { g, hh, mh, sh, wall: [Math.floor((C.x - C.nx * 0.2) / VS), Math.floor(C.y / VS), Math.floor(C.z / VS)], fallen: false, vy: 0, x: C.x, y: C.y, z: C.z };
    }
    {
      const P = D.drawing;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), new THREE.MeshStandardMaterial({ map: kidDrawing(), color: 0xffffff, roughness: 0.92 }));
      m.position.set(P.x + P.nx * 0.03, P.y, P.z);
      m.rotation.y = P.nx > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.rotation.z = 0.035;
      // bant (koselerde yari saydam bej seritler)
      const tapeMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.6, transparent: true, opacity: 0.8 });
      for (const [sx, sy, r] of [[-1, 1, 0.6], [1, 1, -0.6], [-1, -1, -0.6], [1, -1, 0.6]]) {
        const tp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), tapeMat);
        tp.position.set(sx * (P.w / 2 - 0.15), sy * (P.h / 2 - 0.12), 0.01);
        tp.rotation.z = r;
        m.add(tp);
      }
      this.group.add(m);
      this.drawing = { m, wall: [Math.floor((P.x - P.nx * 0.2) / VS), Math.floor(P.y / VS), Math.floor(P.z / VS)], fallen: false, vy: 0 };
    }
  }

  // ---- sorgular
  _who(a) { return a && this.game.actors.includes(a) ? a : null; }
  // dunya noktasi (m) kulenin devrilme alaninda mi (botlar / uyari)
  inFallZone(x, z) {
    const T = this.tower;
    if (!T) return false;
    const X = x / VS, Z = z / VS, [a, b, c, d] = T.zone;
    return X > a && X < c && Z > b && Z < d;
  }
  // zincir ya da kule hareket halinde mi
  get running() { return !!this.chain && (this.chain.moving || (this.tower && this.tower.state === 'fall')); }
  // tehlike: kosan zincirin onundeki dominolarin dibi ya da devrilecek kulenin alani (botlar kacar)
  // y (m, istege bagli): ayak yuksekligi; kulenin boyundan yukarida (masa, kitaplik) ya da zincirin ustunde (yatak)
  // duran tehlikede degil
  dangerAt(x, z, y = -1e9) {
    if (!this.active || !this.running) return false;
    const fy = this.floorY;
    if ((this.tower.state === 'stand' || this.tower.state === 'fall') && y < fy + this.tower.height && this.inFallZone(x, z)) return true;
    if (this.tower.state === 'fall' || y > fy + 2.6) return false;
    for (const d of this.chain.list) {
      if (d.st !== 'fall' && d.st !== 'stand') continue;
      const dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz < 6.5) return true;
    }
    return false;
  }
  // botlar: zincir kuruluyken bu noktadaki biri zincirden zarar gorur mu (kulenin devrilme alani ya da ayakta
  // dominolarin dibi)
  hitZone(x, z, y = -1e9) {
    if (!this.active) return false;
    const fy = this.floorY;
    if (this.tower.state === 'stand' && y < fy + this.tower.height && this.inFallZone(x, z)) return true;
    if (y > fy + 2.6) return false;
    for (const d of this.chain.list) {
      if (d.st !== 'stand') continue;
      const dx = x - d.x, dz = z - d.z;
      if (dx * dx + dz * dz < 5) return true;
    }
    return false;
  }
  // kule ayaktayken bu nokta (ayak yuksekligi y) kulenin devrilecegi alanda mi
  towerZone(x, z, y = -1e9) {
    return this.active && this.tower.state === 'stand' && y < this.floorY + this.tower.height && this.inFallZone(x, z);
  }
  // kulenin devrilince gercekten ezecegi serit (kule genisligi + 1 m pay, boyu kadar): botlar bu seritteki rakip
  // icin zinciri tetikler (devrilme alani kacis icin daha genis)
  crushZone(x, z, y = -1e9) {
    const T = this.tower;
    if (!this.active || !T || T.state !== 'stand' || y >= this.floorY + T.height) return false;
    const [x0, , z0, x1, , z1] = T.box, X = x / VS, Z = z / VS, H = T.height / VS;
    if (T.dir[0] === 0) {
      if (X < x0 - 4 || X > x1 + 4) return false;
      return T.dir[1] < 0 ? Z > z0 - H - 2 && Z < z0 : Z > z1 && Z < z1 + H + 2;
    }
    if (Z < z0 - 4 || Z > z1 + 4) return false;
    return T.dir[0] < 0 ? X > x0 - H - 2 && X < x0 : X > x1 && X < x1 + H + 2;
  }
  // tehlikeden en kisa kacis yonu (birim [x, z]) ya da null: kulenin devrilme alaninin en yakin yan kenarina,
  // dominolarin dibinden devrilme duzlemine dik
  escapeDir(x, z) {
    const T = this.tower;
    if (T && (T.state === 'fall' || T.state === 'stand') && this.inFallZone(x, z)) {
      const [a, b, c, d] = T.zone, X = x / VS, Z = z / VS;
      if (T.dir[0] === 0) return X - a < c - X ? [-1, 0] : [1, 0];
      return Z - b < d - Z ? [0, -1] : [0, 1];
    }
    let best = null, bd = 1e9;
    for (const dm of this.chain.list) {
      if (dm.st !== 'fall' && dm.st !== 'stand') continue;
      const dx = x - dm.x, dz = z - dm.z, dd = dx * dx + dz * dz;
      if (dd < bd) { bd = dd; best = dm; }
    }
    if (!best) return null;
    const s = (x - best.x) * best.wx + (z - best.z) * best.wz;
    return s >= 0 ? [best.wx, best.wz] : [-best.wx, -best.wz];
  }
  // zinciri baslatmak icin vurulacak ilk ayakta domino (botlar): {i, x, y, z} ya da null
  firstStanding() {
    if (!this.active) return null;
    for (const d of this.chain.list) if (d.st === 'stand') { this.chain.center(d, _p); return { i: d.i, x: _p.x, y: _p.y, z: _p.z }; }
    return null;
  }
  // zincir kurulu mu (hepsi ayakta, kule duruyor)
  get armed() { return !!this.chain && this.chain.standing === this.chain.list.length && this.tower && this.tower.state === 'stand'; }

  // ---- olaylar
  // patlama / mermi (destruction.blast): merkez bir dominonun icindeyse (mermi, rayli tufek) o domino vurandan
  // uzaga devrilir; buyuk patlama yaricapindaki ayakta dominolari merkezden uzaga devirir
  onBlast(x, y, z, radius, source, power = 1000) {
    if (!this.active) return;
    const b = this.box, r = radius + 1.5;
    if (x < b[0] - r || x > b[2] + r || z < b[1] - r || z > b[3] + r || y > 4) return;
    const ch = this.chain;
    const i = ch.findAt(x, y, z, 0.2);
    if (i >= 0) {
      const d = ch.list[i];
      let s = this._waveDir(i);
      // ilk domino (zincirin tetigi) hep zincir yonune devrilir; obur dominolar vurandan uzaga
      if (!s) {
        s = 1;
        if (i > 0 && source && source.mover) {
          const p = source.mover.pos;
          const k = (d.x - p.x) * d.fx + (d.z - p.z) * d.fz;
          if (Math.abs(k) > 0.05) s = Math.sign(k);
        }
      }
      // mermi: itis birikir; esigin altindaysa domino yalniz sallanir
      let fall = true;
      if (d.st === 'stand' && radius < 0.9) {
        const now = this.game.time;
        d.shove = Math.max(0, (d.shove || 0) - (now - (d.shoveT || now)) * SHOVE_DECAY) + power / 100;
        d.shoveT = now;
        const need = i === 0 ? SHOVE_FIRST : SHOVE_MIN;
        if (d.shove < need) {
          fall = false;
          d.wobA = s * Math.min(0.09, 0.03 + 0.06 * d.shove / need); d.wobT = this.time;
          if (this.game.audio) { ch.center(d, _p); this.game.audio.play('dominoTick', _p.x, _p.y + 0.6, _p.z, 0.45); }
        }
      }
      if (fall) { d.shove = 0; this._knock(i, s, DOM.kick, source); }
    }
    if (radius >= 0.9) {
      for (const d of ch.list) {
        if (d.st !== 'stand') continue;
        ch.center(d, _p);
        const dist = Math.hypot(_p.x - x, _p.y - y, _p.z - z);
        if (dist > radius + 0.8) continue;
        const k = (_p.x - x) * d.fx + (_p.z - z) * d.fz;
        this._knock(d.i, this._waveDir(d.i) || (Math.abs(k) > 0.15 ? Math.sign(k) : 1), DOM.kick * (1 + 0.6 * (radius + 0.8 - dist)), source);
      }
    }
  }

  // i dominosuna dogru kosan bir dalga var mi: gerisinde (aradakiler ayakta) zincir yonune devrilen domino varsa +1,
  // onunde ters yone devrilen varsa -1, yoksa 0. Dalga gelirken vurulan domino dalganin yonune devrilir (karsilikli
  // devrilip zinciri kesmez: kalabalik savasta mermi yagmuru zinciri bolmesin)
  _waveDir(i) {
    const L = this.chain.list;
    for (let j = i - 1; j >= 0; j--) {
      const d = L[j];
      if (d.st === 'stand') continue;
      if (d.st === 'fall' && d.dir > 0) return 1;
      break;
    }
    for (let j = i + 1; j < L.length; j++) {
      const d = L[j];
      if (d.st === 'stand') continue;
      if (d.st === 'fall' && d.dir < 0) return -1;
      break;
    }
    return 0;
  }

  // zinciri baslat (olcum, testler): ilk domino zincir yonune devrilir
  trigger(by = null) { return this.active && this.armed && this._knock(0, 1, DOM.kick, by); }

  _knock(i, dir, w0, by) {
    const ch = this.chain;
    const wasArmed = ch.standing === ch.list.length;
    if (!ch.knock(i, dir, w0, by || null, this.game.time)) return false;
    this.stats.knocks++;
    if (wasArmed) {
      this.stats.chains++; this.runId++; this.runBy = by || null; this.warned = false;
      // kosunun sifirlamasi kuleyi de kurar: kosudan once baslamis onarim sayaci kuleyi dominolardan once kurmasin
      if (this.tower) this.tower.repairT = -1;
    }
    if (this.resetT < 0) this.resetT = RESET_TIME;
    if (by && this.game.logEvent) this.game.logEvent('domino ' + (by.name || '?') + ' #' + i);
    return true;
  }

  // ayakta kulenin kutusu dominolar icin kati: mermiyle delinmis kule de son dominoyu durdurur ve devrilir
  // (neredeyse tumu yikildiysa degil: domino yere yatar)
  _towerSolid(x, y, z) {
    const T = this.tower;
    if (!T || T.state !== 'stand') return false;
    const [x0, y0, z0, x1, y1, z1] = T.box, X = x / VS, Y = y / VS, Z = z / VS;
    if (X < x0 || X >= x1 || Y < y0 || Y >= y1 || Z < z0 || Z >= z1) return false;
    if (!(this.time - T.haveT < 0.25)) { T.have = this._towerHave(); T.haveT = this.time; }
    return T.have >= 40;
  }
  // kule kutusundaki kati voxel sayisi
  _towerHave() {
    const T = this.tower, w = this.game.world, [x0, y0, z0, x1, y1, z1] = T.box;
    let n = 0;
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) { let i = w.idx(x0, y, z); for (let x = x0; x < x1; x++, i++) if (w.mat[i]) n++; }
    return n;
  }

  // dusen dominonun ucu gercek bir voxele degdi: kuleyse kule devrilir (engel kalkar, domino yere duser)
  _onBlock(d, x, y, z) {
    const T = this.tower;
    if (!T || T.state !== 'stand') return false;
    const [x0, y0, z0, x1, y1, z1] = T.box;
    const X = Math.floor(x / VS), Y = Math.floor(y / VS), Z = Math.floor(z / VS);
    if (X < x0 - 1 || X > x1 || Y < y0 || Y > y1 || Z < z0 - 1 || Z > z1) return false;
    const w = this.game.world, idx = [];
    for (let yy = y0; yy < y1; yy++) for (let zz = z0; zz < z1; zz++) for (let xx = x0; xx < x1; xx++) { const i = w.idx(xx, yy, zz); if (w.mat[i]) idx.push(i); }
    if (idx.length < 40) return false;
    const by = this._who(d.by);
    T.by = by;
    const body = this.game.destruction.topple(idx, { pivot: T.pivot, dir: T.dir, w0: 0.45 + Math.min(0.5, d.w * 0.08), source: by, weaponId: 'domino' });
    if (!body) return false;
    T.state = 'fall'; T.body = body;
    body.onSettle = (b, sp) => this._towerLanded(b, sp);
    this.stats.topples++;
    const au = this.game.audio;
    if (au) { au.play('dominoClack', x, y, z, 1.4); au.play('blockCreak', x, y + 3, z, 1.2); }
    this.game.fx.impact(x, y, z, -d.fx * d.dir, 0, -d.fz * d.dir, M.BLOCK_Y, 1.4);
    if (this.game.logEvent) this.game.logEvent('tower ' + (by ? by.name : '-'));
    return true;
  }

  _towerLanded(body, speed) {
    const T = this.tower;
    if (!T || T.body !== body) return;
    T.state = 'down'; T.body = null;
    const p = body.group.position, au = this.game.audio;
    if (au) au.play('blockCrash', p.x, p.y, p.z, 1.5);
    this.game.fx.addShake(0.5, p.x, p.y, p.z);
    this._towerBurst(body, speed);
  }

  // yere carpan kule: bloklar seritin iki yanina sacilir (gorsel) ve sok dalgasi govdenin altinda kalmayani da
  // yaralar: kutusuna 1.0 / 1.8 / 2.5 m yakin olana 70 / 45 / 25 hasar ve yana itme (DOMINO, zinciri baslatana)
  _towerBurst(body, speed) {
    const T = this.tower, game = this.game, fx = game.fx, D = game.destruction;
    const fxd = T.dir[0], fzd = T.dir[1], wx = -fzd, wz = fxd;
    const [px, py, pz] = T.pivot;
    if (speed > 3) {
      const by = this._who(T.by);
      for (const a of game.actors) {
        if (!a.alive || body.hitActors.has(a)) continue;
        let dmg = 0;
        if (D._obbHits(body, a, 1.0)) dmg = 70;
        else if (D._obbHits(body, a, 1.8)) dmg = 45;
        else if (D._obbHits(body, a, 2.5)) dmg = 25;
        if (!dmg) continue;
        body.hitActors.add(a);
        const q = a.mover.pos, s = (q.x - px) * wx + (q.z - pz) * wz >= 0 ? 1 : -1;
        a.mover.impulse(wx * s * 6, 3.5, wz * s * 6);
        a.takeDamage(dmg, by, 'domino', _v.set(wx * s, 0.4, wz * s).normalize(), false);
        this.stats.hits++;
      }
    }
    // savrulan bloklar (instanced moloz): kulenin boyunca, iki yana, renkli
    const deb = fx.debris;
    if (!deb) return;
    const n = Math.max(8, Math.round(30 * (fx.dm || 1)));
    for (let k = 0; k < n; k++) {
      const u = 0.15 + Math.random() * 0.85, side = Math.random() < 0.5 ? -1 : 1;
      const x = px + fxd * u * T.height + wx * side * 0.6, z = pz + fzd * u * T.height + wz * side * 0.6;
      const y = py + 0.5 + Math.random() * 1.2;
      const sp = 2.5 + Math.random() * 5;
      const c = BLOCK_LIN[(Math.random() * 4) | 0], v = 0.8 + Math.random() * 0.3;
      deb.spawn(x, y, z, wx * side * sp + fxd * (Math.random() * 3 - 0.5), 2.5 + Math.random() * 4.5, wz * side * sp + fzd * (Math.random() * 3 - 0.5),
        0.3 + Math.random() * 0.3, c[0] * v, c[1] * v, c[2] * v, 4 + Math.random() * 3);
    }
  }

  // ---- guncelleme
  update(dt, camera) {
    if (!this.active) return;
    const game = this.game;
    this.time += dt;
    if (dt > 0) {
      const ch = this.chain;
      ch.update(dt, game.time);
      this._events();
      this._hitActors();
      this._reset(dt);
      this._towerTick(dt);
      this._decorTick(dt);
      this._warn(dt);
      this._ambience(dt);
    }
    this._placeDominoes();
    this._render(camera);
  }

  // aktor basina (game.js dongusu): ziplak yuzeyde sekme sesi ve tozu
  actorTick(a) {
    const ev = a.mover.events;
    if (!ev.bounced) return;
    const p = a.mover.pos, au = this.game.audio;
    if (au) au.play('boing', p.x, p.y, p.z, Math.min(1.4, 0.4 + ev.bounced / 10), a.isPlayer);
    if (ev.bounced > 6) this.game.fx.dustPuff(p.x, p.y + 0.1, p.z, 0.6);
  }

  _events() {
    const ch = this.chain, au = this.game.audio, fx = this.game.fx;
    for (const e of ch.events) {
      if (e.type === 'start') { if (au) au.play('dominoTick', e.x, e.y, e.z, 0.8); }
      else if (e.type === 'clack') {
        if (au) au.play('dominoClack', e.x, e.y, e.z, Math.min(1.3, 0.5 + e.w * 0.18));
        if (fx.pm > 0.3) fx.smoke.emit(e.x, e.y, e.z, 0, 0.3, 0, 0.6, 0.15, 0.5, [0.8, 0.76, 0.7, 0.35], [0.8, 0.78, 0.74, 0], -0.1, 2, 0, Math.random() * 6, 0.4);
      } else if (e.type === 'land') {
        if (au) au.play('dominoThud', e.x, e.y, e.z, 1);
        fx.dustPuff(e.x, Math.max(e.y - 0.6, this.game.arena.toy.G0 * VS + 0.1), e.z, 0.7);
      }
    }
    ch.events.length = 0;
  }

  // dusen domino altindakini yaralar ve devrilme yonunde iter (bir kez)
  _hitActors() {
    const ch = this.chain;
    for (const d of ch.list) {
      if (d.st !== 'fall' || d.w < DOM.crushW) continue;
      for (const a of this.game.actors) {
        if (!a.alive || d.hit.has(a)) continue;
        const p = a.mover.pos, h = a.mover.h;
        if (!ch.inside(d, p.x, p.y + 0.3, p.z, 0.25) && !ch.inside(d, p.x, p.y + h * 0.5, p.z, 0.25) && !ch.inside(d, p.x, p.y + h - 0.2, p.z, 0.25)) continue;
        d.hit.add(a);
        const Fx = d.fx * d.dir, Fz = d.fz * d.dir;
        a.mover.impulse(Fx * DOMINO_PUSH, 2, Fz * DOMINO_PUSH);
        a.takeDamage(DOMINO_DMG, this._who(d.by), 'domino', _v.set(Fx, -0.5, Fz).normalize(), false);
        this.stats.hits++;
        if (this.game.audio) this.game.audio.play('dominoClack', p.x, p.y + h, p.z, 1.2);
      }
    }
  }

  // yeniden dizilme: zincir basladiktan RESET_TIME sn sonra, zincir ve kule durunca. Yerinde biri duran domino
  // bekler. Hepsi ayaga kalkinca kule kurulur.
  _reset(dt) {
    const ch = this.chain, T = this.tower;
    if (this.resetT > 0) { this.resetT -= dt; if (this.resetT <= 0) this.resetPending = true; }
    if (this.resetPending && !ch.moving && T.state !== 'fall') {
      let waiting = 0;
      const au = this.game.audio;
      for (const d of ch.list) {
        if (d.st === 'stand' || d.st === 'rise') continue;
        if (this._standBlocked(d)) { waiting++; continue; }
        ch.startRise(d.i);
        ch.center(d, _p);
        if (au) au.play('tidy', _p.x, _p.y, _p.z, 0.5);
        this._sparkle(_p.x, _p.y, _p.z, 6);
      }
      // kule dominolarla birlikte toparlanir (yerinde biri duran domino kuleyi bekletmez)
      if (T.layer < 0 && this.towerRebuildT < 0 && T.state !== 'build' && this._towerDamaged()) this.towerRebuildT = 0.8;
      if (!waiting) {
        this.resetPending = false; this.resetT = -1;
        this.stats.resets++;
      }
    }
  }

  _standBlocked(d) {
    const ch = this.chain;
    for (const a of this.game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, h = a.mover.h;
      for (const k of [0.2, h * 0.5, h - 0.1]) if (ch.inside(d, p.x, p.y + k, p.z, 0.45, 0, 1)) return true;
    }
    return false;
  }

  _towerDamaged() {
    const T = this.tower, w = this.game.world, [x0, y0, z0] = T.box;
    let have = 0;
    for (let y = 0; y < T.ny; y++) for (let z = 0; z < T.nz; z++) for (let x = 0; x < T.nx; x++) {
      const m = T.snap[x + T.nx * (z + T.nz * y)];
      if (m && w.mat[w.idx(x0 + x, y0 + y, z0 + z)] === m) have++;
    }
    return have < T.count;
  }

  // kule: yikilmis ya da hasarliysa (zincir kosmadan, uzun sure) kendiliginden toparlanir; yeniden kurulum katman katman
  _towerTick(dt) {
    const T = this.tower, w = this.game.world;
    if (this.towerRebuildT > 0) {
      this.towerRebuildT -= dt;
      if (this.towerRebuildT <= 0) this._startRebuild();
    }
    // kule ayakta ama hasarli (oyuncular vurdu) ya da zincirsiz yikildi: RESET_TIME sn sonra kendiliginden toparlanir
    T.checkT -= dt;
    if (T.checkT <= 0) {
      T.checkT = 3;
      if ((T.state === 'stand' || T.state === 'down') && T.layer < 0 && T.repairT < 0 && this.resetT < 0 && !this.resetPending && this.towerRebuildT < 0 && this._towerDamaged()) T.repairT = RESET_TIME;
    }
    if (T.repairT > 0) {
      T.repairT -= dt;
      if (T.repairT <= 0) {
        T.repairT = -1;
        if (!this.running && T.layer < 0 && this.towerRebuildT < 0 && this._towerDamaged()) this.towerRebuildT = 0.1;
      }
    }
    if (T.layer >= 0) {
      T.layerT -= dt;
      if (T.layerT > 0) return;
      // kulenin yerinde biri varsa bekle
      const [x0, y0, z0, x1, y1, z1] = T.box;
      if (T.layer === 0) {
        for (const a of this.game.actors) {
          if (!a.alive) continue;
          const p = a.mover.pos;
          if (p.x > x0 * VS - 0.5 && p.x < x1 * VS + 0.5 && p.z > z0 * VS - 0.5 && p.z < z1 * VS + 0.5 && p.y < y1 * VS + 0.5) { T.layerT = 0.5; return; }
        }
      }
      // bir blok katmani (4 voxel) yaz
      const dep = [], ya = T.layer * 4, yb = Math.min(T.ny, ya + 4);
      for (let y = ya; y < yb; y++) for (let z = 0; z < T.nz; z++) for (let x = 0; x < T.nx; x++) {
        const m = T.snap[x + T.nx * (z + T.nz * y)];
        if (m) dep.push(x0 + x, y0 + y, z0 + z, m);
      }
      if (dep.length) w.depositMany(dep, dep.length);
      const cx = (x0 + x1) * 0.5 * VS, cy = (y0 + ya + 2) * VS, cz = (z0 + z1) * 0.5 * VS;
      this._sparkle(cx, cy, cz, 5);
      if (this.game.audio) this.game.audio.play('blockPop', cx, cy, cz, 0.9);
      T.layer++;
      T.layerT = 0.07;
      if (ya + 4 >= T.ny) { T.layer = -1; T.state = 'stand'; T.by = null; }
    }
  }

  _startRebuild() {
    const T = this.tower;
    this._clearTowerZone(true);
    T.state = 'build'; T.layer = 0; T.layerT = 0.05;
    if (this.game.audio) { const p = T.pivot; this.game.audio.play('tidy', p[0], p[1] + 3, p[2], 1.2); }
  }

  // devrilme alanina sacilan kule bloklarini topla (toz bulutu); kule kutusundaki her sey (kalan bloklar, yabanci
  // moloz) de kalkar: kule anlik goruntuden aynen yazilir
  _clearTowerZone(dust) {
    const T = this.tower, w = this.game.world;
    const [a, b, c, d] = T.zone, [x0, y0, z0, x1, y1, z1] = T.box, idx = [];
    const yTop = Math.min(w.sy - 1, T.box[4] + 8);
    for (let y = T.box[1]; y < yTop; y++) for (let z = Math.max(0, b); z < Math.min(w.sz, d); z++) for (let x = Math.max(0, a); x < Math.min(w.sx, c); x++) {
      const i = w.idx(x, y, z), m = w.mat[i];
      if (!m) continue;
      if (TOWER_MATS.has(m) || (x >= x0 && x < x1 && y >= y0 && y < y1 && z >= z0 && z < z1)) idx.push(i);
    }
    if (!idx.length) return;
    if (dust) {
      const fx = this.game.fx;
      for (let k = 0; k < idx.length; k += Math.max(1, (idx.length / 40) | 0)) {
        const i = idx[k], y = (i / w.sxz) | 0, r = i - y * w.sxz, z = (r / w.sx) | 0, x = r - z * w.sx;
        fx.smoke.emit((x + 0.5) * VS, (y + 0.5) * VS, (z + 0.5) * VS, 0, 0.6, 0, 0.9, 0.3, 0.9, [0.9, 0.88, 0.84, 0.4], [0.9, 0.9, 0.88, 0], -0.2, 1.5, 0, Math.random() * 6, 0.5);
      }
    }
    w.removeIndices(idx);
  }

  // mac basi: zincir dizili, kule saglam (menudeki bot savasindan kalan durum temizlenir)
  matchReset() {
    if (!this.active) return;
    const T = this.tower, ch = this.chain, w = this.game.world;
    if (T.body) { this.game.destruction.cancel(T.body); T.body = null; }
    ch.standAll();
    for (const d of ch.list) { d.shove = 0; d.wobA = 0; }
    ch.events.length = 0;
    this.resetT = -1; this.resetPending = false; this.towerRebuildT = -1; this.warnT = 0;
    T.repairT = -1; T.layer = -1; T.layerT = 0; T.by = null; T.checkT = 2; T.haveT = -1;
    if (T.state !== 'stand' || this._towerDamaged()) {
      this._clearTowerZone(false);
      const [x0, y0, z0] = T.box, dep = [];
      for (let y = 0; y < T.ny; y++) for (let z = 0; z < T.nz; z++) for (let x = 0; x < T.nx; x++) {
        const m = T.snap[x + T.nx * (z + T.nz * y)];
        if (m) dep.push(x0 + x, y0 + y, z0 + z, m);
      }
      w.depositMany(dep, dep.length);
    }
    T.state = 'stand';
    this.runId++; this.runBy = null; this.warned = false;
    this._mbPlayed = false;   // muzik kutusu her mac basinda
  }

  _sparkle(x, y, z, n) {
    const fx = this.game.fx;
    for (let i = 0; i < n * fx.pm; i++) {
      fx.add.emit(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.5 + Math.random() * 0.4, 0.06, 0.02,
        [3.2, 2.8, 1.6, 1], [1.2, 0.8, 0.3, 0], -1, 1.2, 0);
    }
  }

  // oyuncu kosan zincirin / devrilecek kulenin dibindeyse uyari
  _warn(dt) {
    const game = this.game, p = game.player;
    this.warnT -= dt;
    if (!game.hud || game.state !== 'playing' || !p.alive || this.warnT > 0 || !this.running) return;
    if (this.tower.state === 'stand' || this.tower.state === 'fall') {
      const q = p.mover.pos;
      if (q.y < this.floorY + this.tower.height && this.inFallZone(q.x, q.z)) { game.hud.subMsg(t('dominoRun'), 1.6); this.warnT = 3; }
    }
  }

  // duvar saati ve cizim: arkalarindaki duvar yikilirsa duser
  _decorTick(dt) {
    const w = this.game.world;
    for (const D of [this.clock, this.drawing]) {
      if (!D) continue;
      const o = D === this.clock ? D.g : D.m;
      if (!D.fallen) {
        D.checkT = (D.checkT || 0) - dt;
        if (D.checkT > 0) continue;
        D.checkT = 0.5;
        const [x, y, z] = D.wall;
        if (!w.get(x, y, z) && !w.get(x, y + 2, z) && !w.get(x, y - 2, z)) { D.fallen = true; D.vy = 0; }
        continue;
      }
      if (!o.visible) continue;
      D.vy -= 22 * dt;
      o.position.y += D.vy * dt;
      o.rotation.x += dt * 1.5;
      if (o.position.y < this.game.arena.toy.G0 * VS + 0.3) {
        o.visible = false;
        const p = o.position;
        this.game.fx.impact(p.x, p.y, p.z, 0, 1, 0, D === this.clock ? M.PLASTIC_R : M.TRIM, 2);
        if (this.game.audio) this.game.audio.play(D === this.clock ? 'imp_glass' : 'imp_cloth', p.x, p.y, p.z, 1.2);
      }
    }
  }

  // ses ortami: saat tik taki, pencerenin disinda kuslar, mac basinda muzik kutusu
  _ambience(dt) {
    const game = this.game, au = game.audio;
    if (!au) return;
    if (game.state === 'playing' && !this._mbPlayed) { this._mbPlayed = true; au.play('musicBox', 0, 0, 0, 0.7, true); }
    const C = this.clock;
    if (C && !C.fallen) {
      this.tickT -= dt;
      if (this.tickT <= 0) { this.tickT += 1; this._tock = !this._tock; au.play('clockTick', C.x + 0.3, C.y, C.z, this._tock ? 0.8 : 1); }
    }
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 4 + Math.random() * 7;
      const W = game.arena.toy.decor.window;
      au.play('chirp', W.x0 + Math.random() * (W.x1 - W.x0), W.y1 - 1, W.z - 2, 0.8);
    }
  }

  _render(camera) {
    if (!camera) return;
    const cp = camera.position, game = this.game;
    // huzme kartlari: eksenleri cevresinde kameraya doner
    if (this.beams) {
      this.beamMat.uniforms.uTime.value = this.time;
      this.beamMat.uniforms.uCam.value.copy(cp);
      for (const B of this.beams) {
        const mid = _v.copy(B.S).add(B.E).multiplyScalar(0.5);
        const axis = _v2.copy(B.E).sub(B.S);
        const len = axis.length(); axis.divideScalar(len);
        const wdir = _v3.copy(cp).sub(mid).cross(axis);
        if (wdir.lengthSq() < 1e-6) wdir.set(1, 0, 0);
        wdir.normalize();
        const n = _v4.crossVectors(wdir, axis);
        _m.makeBasis(wdir.multiplyScalar(B.width), axis.multiplyScalar(len), n).setPosition(mid);
        B.mesh.matrix.copy(_m);
        B.mesh.matrixWorldNeedsUpdate = true;
      }
    }
    if (this.motes) {
      const u = this.motes.material.uniforms;
      u.uTime.value = this.time;
      const h = game.renderer ? game.renderer.domElement.height : 800;
      u.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 75) / 2));
    }
    // saat: gercek saat
    const C = this.clock;
    if (C && !C.fallen) {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000, mi = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + mi / 60;
      C.sh.rotation.z = -s / 60 * Math.PI * 2;
      C.mh.rotation.z = -mi / 60 * Math.PI * 2;
      C.hh.rotation.z = -hr / 12 * Math.PI * 2;
    }
  }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
