// Fisekhane haritasi ortami ve kurallari (world/fireworks.js uretir; sistem game.fwSys):
//  - Gok: lacivert gece, yildizlar, ay, ufukta sehir isimasi; uzakta ara ara acilan suslu fisekler (golgelendiricide;
//    zamanlamasi JS'te de hesaplanir: uzak gumbur sesi). Isik: ay (soguk, golgeli), fener zincirleri, atolye lambalari.
//  - Fisek sandiklari (out.crates kutu listesi; voxel taranmaz): mermi hasari birikince (100) ya da yakinda patlama olunca
//    tutusur, 0.3-0.8 sn cizirdar ve patlar (merkezde 100 hasar, 3.5 m). Yaricaptaki sandiklar 0.2-0.6 sn gecikmeyle
//    tutusur (dalga dalga). Her patlama 3-6 fisek atar (15-25 m/s koni): 8-15 m'de sakayik / krizantem / sogut acilir;
//    yaklasik %30'u curuk: geri duser, carptigi yerde kucuk patlama, 2 m'deki sandigi tutusturur.
//  - Barut fitili: kirmizi diregi (ya da fitilin basini) vur ya da yakininda patlama olsun: kivilcim 2.5 m/s ilerler,
//    gectigi fitil yanip kaybolur; onundeki fitil kopuksa orada soner. Sonunda depo 1 sn cizirdar, 7.5 m'lik patlama.
//  - Parcalama: her tutusma tetikleyeni tasir (sandik -> fisek -> sandik -> fitil -> depo); zincirin oldurdugu herkes
//    baslatana yazilir (ZINCIRLEME! / ZINCIRLEME xN!, coklu parcalama mesajinin yerine). Kendi zincirinde olen -1.
//  - Yenilenme: sandik 40-60 sn sonra (yerinde / ustunde kimse yokken), depo ve fitil 75-90 sn sonra anlik goruntuden.
//  - Ag: kurallar yalniz yetkili makinede (game.auth); konuga olaylar (game.netEmit 'fwSys') ve fitil durumu (netState);
//    konuk gorseli ve sesi kendisi cizer (fisekler tohumdan ayni parametrelerle).
import * as THREE from 'three';
import { VS } from '../config.js';
import { M, INDESTRUCTIBLE } from '../world/materials.js';
import { mulberry32 } from '../world/mapgen.js';
import { t } from '../i18n.js';
import { installFireworksSfx } from '../audio/fireworksSfx.js';

// ay ve isik ayarlari (game.js applyEnvironment)
export const FW_ENV = {
  moonElev: 38, moonAzim: 205,
  moon: 0xb4c6ff, moonIntensity: 2.3,
  hemiSky: 0x5068b8, hemiGround: 0x3c2a20, hemi: 1.45,
  fog: 0x141d40, fogDensity: 0.0058, envIntensity: 0.75,
};
export const FW_HILLS = { near: 0x080a12, far: 0x151c3a, rock: 0x0d1018 };

const CRATE_HP = 100, CRATE_R = 3.5, CRATE_DMG = 110, CRATE_VR = 1.6, CRATE_VP = 260;
const FIZZ0 = [0.3, 0.8], FIZZ1 = [0.12, 0.3], SPREAD = [0.2, 0.6];
const SHELL_N = [3, 6], SHELL_V = [15, 25], SHELL_G = 9.8, BURST_H = [8, 15], DUD_P = 0.3, MAX_SHELLS = 40;
const DUD_R = 2.0, DUD_DMG = 45, DUD_DR = 2.2, BURST_DMG = 30, BURST_R = 3;
const FUSE_V = 10;                                   // kivilcim: hucre / sn (2.5 m/s)
const DEPOT_WARN = 1.0, DEPOT_R = 7.5, DEPOT_DMG = 220, DEPOT_VR = 6.0, DEPOT_VP = 1000;
const REGEN_CRATE = [40, 60], REGEN_DEPOT = [75, 90];
// temel: yenilenen sandigin altindaki ve 1 m cevresindeki zemin (4 m derine kadar) ile fitil hucresinin altindaki zemin
// (6 m) cukura gitmisse ilk haliyle geri yazilir; sandik ve fitil havada kalmaz
const CRATE_FR = 4, CRATE_FND = 16, FUSE_FND = 24;
const fndSkip = (m) => isCrateMat(m) || m === M.FUSE || m === M.FUSE_POST;
const BOOMS_PER_FRAME = 4, MAX_LIGHTS = 5;
export const FW_RULES = { CRATE_HP, CRATE_R, CRATE_DMG, FUSE_V, DEPOT_R, DEPOT_DMG, DEPOT_WARN, REGEN_CRATE, REGEN_DEPOT, MAX_SHELLS, SHELL_G, DUD_P, BOOMS_PER_FRAME, MAX_LIGHTS };

// renkler: kirmizi, yesil, mavi, altin, mor, beyaz (lineer HDR) ve isik renkleri; sogut hep altin
const COLS = [[6, 0.45, 0.3], [0.5, 5.5, 0.9], [0.55, 1.3, 7], [6, 3.4, 0.8], [3.8, 0.6, 6.2], [5, 5, 5.4]];
const LCOLS = [0xff3020, 0x30ff60, 0x4878ff, 0xffb030, 0xb040ff, 0xfff4e8];
const GOLD = [5.2, 2.7, 0.6];
const K_TR0 = [5, 2.6, 0.8, 1], K_TR1 = [1.2, 0.3, 0.05, 0], K_DUD0 = [1.6, 0.9, 0.5, 0.8];
const K_SP0 = [7, 4.5, 1.6, 1], K_SP1 = [2.5, 0.8, 0.1, 0];
const T0 = [0, 0, 0, 0], T1 = [0, 0, 0, 0];
const _v = new THREE.Vector3(), _c = new THREE.Vector3(), _p = { x: 0, y: 0, z: 0 };
const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
const isCrateMat = (m) => m === M.FW_CRATE || m === M.FW_CRATE_Y;
const rnd = (a, b) => a + Math.random() * (b - a);
const r2 = (v) => Math.round(v * 100) / 100;

// fisek parametreleri tohumdan: ev sahibi ve konuk ayni fisegi ayni yerde acar
export function shellParams(seed) {
  const r = mulberry32(seed);
  const sp = SHELL_V[0] + r() * (SHELL_V[1] - SHELL_V[0]);
  const a = r() * Math.PI * 2, tilt = r() * 0.36;
  const vy = Math.cos(tilt) * sp, vh = Math.sin(tilt) * sp;
  const maxH = vy * vy / (2 * SHELL_G);
  const hb = Math.min(BURST_H[0] + r() * (BURST_H[1] - BURST_H[0]), maxH * 0.93);
  const tb = (vy - Math.sqrt(Math.max(0, vy * vy - 2 * SHELL_G * hb))) / SHELL_G;
  return { vx: Math.cos(a) * vh, vy, vz: Math.sin(a) * vh, tb, hb, pat: (r() * 3) | 0, col: (r() * 6) | 0, dud: r() < DUD_P, crackle: r() < 0.35 };
}

export function fwDirs() {
  const dg = THREE.MathUtils.degToRad;
  return { moon: new THREE.Vector3().setFromSphericalCoords(1, dg(90 - FW_ENV.moonElev), dg(FW_ENV.moonAzim)) };
}

// ---------------------------------------------------------------- gece goku / ortam haritasi
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */`
uniform float uTime;
uniform vec3 uMoon;
uniform float uEnv;     // 1: ortam haritasi (yildiz ve fisekler sonuk)
varying vec3 vDir;
float fHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(vec3(i, 1.0)), fHash(vec3(i + vec2(1.0, 0.0), 1.0)), f.x), mix(fHash(vec3(i + vec2(0.0, 1.0), 1.0)), fHash(vec3(i + 1.0, 1.0)), f.x), f.y);
}
vec3 fPal(float h) {
  return h < 0.17 ? vec3(1.0, 0.12, 0.08) : h < 0.34 ? vec3(0.15, 1.0, 0.25) : h < 0.5 ? vec3(0.2, 0.4, 1.0) : h < 0.67 ? vec3(1.0, 0.62, 0.15) : h < 0.84 ? vec3(0.75, 0.2, 1.0) : vec3(1.0);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.0035, 0.006, 0.02), mid = vec3(0.012, 0.018, 0.05), hor = vec3(0.045, 0.045, 0.085);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, h));
  col = mix(col, zen, smoothstep(0.15, 0.7, h));
  // sehir isimasi: guneyde genis, batida dar; sicak turuncu, ufka yapisik
  float az = atan(d.x, d.z);
  float city = 0.55 * pow(max(cos(az - 0.35), 0.0), 2.0) + 0.3 * pow(max(cos(az + 1.9), 0.0), 3.0) + 0.08;
  col += vec3(0.30, 0.13, 0.05) * city * exp(-max(h, 0.0) * 9.0) * (1.0 + 0.3 * fNoise(vec2(az * 6.0, 0.5)));
  if (h > 0.0) {
    // yildizlar (titresir) ve soluk samanyolu bandi
    vec3 p = d * 260.0;
    float s = fHash(floor(p));
    if (s > 0.9965) {
      vec3 f = fract(p) - 0.5;
      float tw = 0.6 + 0.4 * sin(uTime * (1.5 + s * 9.0) + s * 40.0);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.32, 0.0, length(f)) * tw * (1.0 - uEnv * 0.8) * smoothstep(0.02, 0.15, h) * 1.4;
    }
    float band = exp(-pow(dot(d, normalize(vec3(0.6, 0.35, -0.72))) * 4.0, 2.0));
    col += vec3(0.03, 0.035, 0.06) * band * fNoise(d.xz * 20.0 + d.y * 7.0) * smoothstep(0.05, 0.4, h);
    // ay
    float md = max(dot(d, uMoon), 0.0);
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99955, 0.99975, md) * (0.9 + 0.1 * fNoise(d.xy * 900.0)) * 2.2;
    col += vec3(0.12, 0.15, 0.25) * pow(md, 60.0) * 0.8;
    // uzak suslu fisekler: 3 yuva, her biri kendi periyoduyla gokte bir yerde acilir (sarkan isik halkasi + cekirdek)
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float per = 4.6 + fi * 1.9;
      float tt = uTime + fi * 2.7;
      float cyc = floor(tt / per);
      float lt = tt - cyc * per;
      if (lt > 2.6) continue;
      float ha = fHash(vec3(cyc, fi, 1.7)), he = fHash(vec3(cyc, fi, 2.9)), hc = fHash(vec3(cyc, fi, 4.3));
      vec3 cd = normalize(vec3(sin(ha * 6.2831853), (0.07 + he * 0.2) * 1.4, cos(ha * 6.2831853)));
      if (dot(d, cd) < 0.9) continue;
      vec3 tx = normalize(cross(vec3(0.0, 1.0, 0.0), cd)), ty = cross(cd, tx);
      vec2 q = vec2(dot(d, tx), dot(d, ty) + 0.006 * lt * lt);
      float r = 0.05 * (1.0 - exp(-lt * 3.0));
      float rr = length(q), th = atan(q.y, q.x);
      float ray = pow(0.5 + 0.5 * cos(th * 22.0 + hc * 40.0), 5.0);
      float ring = exp(-pow((rr - r) / (0.003 + 0.006 * lt), 2.0));
      float fade = (1.0 - smoothstep(0.4, 2.6, lt)) * smoothstep(0.0, 0.04, lt);
      col += fPal(hc) * (ring * (0.15 + ray) * 1.6 + exp(-rr * rr / 0.0003) * exp(-lt * 7.0) * 2.0) * fade * (1.0 - uEnv * 0.7);
    }
  }
  col = mix(col, vec3(0.006, 0.007, 0.013), smoothstep(-0.01, -0.12, h));   // ufkun alti karanlik ova (tepe halkasi bosluklari parlamasin)
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createFwSky() {
  const uniforms = { uTime: { value: 0 }, uMoon: { value: fwDirs().moon }, uEnv: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'fwSky';
  mesh.visible = false;
  return { mesh, uniforms };
}

// gece gokunden ortam haritasi (PMREM): metal ve kagidin soguk yansimalari
export function createFwEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = createFwSky();
  sky.uniforms.uEnv.value = 1;
  sky.mesh.visible = true;
  sky.mesh.material.depthTest = true;
  s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose();
  sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}

// gok golgelendiricisindeki hash'in JS kopyasi (uzak fisek sesinin yonu)
const fract = (v) => v - Math.floor(v);
function skyHash(x, y, z) {
  x = fract(x * 0.1031); y = fract(y * 0.1030); z = fract(z * 0.0973);
  const d = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}

// ---------------------------------------------------------------- sistem
export class FireworksSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.crates = []; this.fuses = []; this.depots = [];
    this.shells = []; this.queue = []; this.crackles = []; this.fizz = new Map();
    this.chains = new Map(); this.chainId = 0;
    this.lightEnds = []; this.time = 0; this.warnT = 0;
    this.skyCyc = [-1, -1, -1]; this.skySnd = []; this.cricketT = 2; this.checkT = 2;
    this.stats = this._zeroStats(); this.netStats = this._zeroNet();
    installFireworksSfx();
  }

  _zeroStats() { return { lit: 0, crates: 0, shells: 0, bursts: 0, duds: 0, fuses: 0, cuts: 0, depots: 0, regens: 0, kills: 0, selfKills: 0, chains: 0, maxQ: 0, botAims: 0 }; }
  // konukta gelen ag olaylari ve durum guncellemeleri (testler)
  _zeroNet() { return { fz: 0, bx: 0, sh: 0, dd: 0, dw: 0, dx: 0, rg: 0, ck: 0, st: 0 }; }
  get auth() { return this.game.auth !== false; }
  // ev sahibinin zamani (konukta tahmin): fitil kivilcimi konukta bununla ilerler
  now() { const n = this.game.net; return n && n.role === 'guest' ? n.hostNow() : this.game.time; }
  _who(a) { return a && this.game.actors.includes(a) ? a : null; }

  // arena: world/fireworks.js generateFireworks ciktisi
  setup(arena) {
    this.disable();
    const w = this.game.world, fw = arena.fw;
    this.G = fw.G;
    this.crates = arena.crates.map((c, i) => this._mkCrate(w, c, i));
    // ust uste sandiklar: alttakiler yerinde degilse ustteki yenilenmez (havada kalmasin)
    for (const c of this.crates) c.on = this.crates.filter((o) => o !== c && o.y0 + 3 === c.y0 && o.x0 < c.x0 + 4 && o.x0 + 4 > c.x0 && o.z0 < c.z0 + 4 && o.z0 + 4 > c.z0).map((o) => o.i);
    this.fuses = fw.fuses.map((f, i) => this._mkFuse(w, f, i));
    this.depots = fw.depots.map((d, i) => this._mkDepot(w, d, i));
    this.lightEnds.length = 0; this.skySnd.length = 0; this.skyCyc = [-1, -1, -1];
    this.time = 0; this.warnT = 0; this.checkT = 2; this.cricketT = 2;
    this.stats = this._zeroStats(); this.netStats = this._zeroNet();
    this.active = true;
  }

  disable() {
    this.crates = []; this.fuses = []; this.depots = [];
    this.shells.length = 0; this.queue.length = 0; this.crackles.length = 0; this.fizz.clear(); this.chains.clear();
    this.active = false;
  }

  _mkCrate(w, c, i) {
    // destek katmani (paletin / rafin / zeminin satiri): yenilenmede sandikla birlikte yerine konur
    const sup = new Uint8Array(16);
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) { const m = w.get(c.x0 + x, c.y0 - 1, c.z0 + z); sup[x + 4 * z] = isCrateMat(m) ? 0 : m; }
    const W = 4 + 2 * CRATE_FR, fnd = new Uint8Array(W * W * CRATE_FND);
    for (let zz = 0; zz < W; zz++) for (let xx = 0; xx < W; xx++) for (let d = 1; d <= CRATE_FND && c.y0 - d > 0; d++) {
      const m = w.get(c.x0 - CRATE_FR + xx, c.y0 - d, c.z0 - CRATE_FR + zz);
      fnd[(zz * W + xx) * CRATE_FND + d - 1] = fndSkip(m) ? 0 : m;
    }
    return { fnd, i, x0: c.x0, y0: c.y0, z0: c.z0, m: c.m, cx: (c.x0 + 2) * VS, cy: (c.y0 + 1.5) * VS, cz: (c.z0 + 2) * VS, st: 0, t: 0, hp: CRATE_HP, by: null, chain: 0, regen: -1, sup, on: [] };
  }

  _mkFuse(w, f, i) {
    const n = f.cells.length / 3, idx = new Int32Array(n), pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const x = f.cells[k * 3], y = f.cells[k * 3 + 1], z = f.cells[k * 3 + 2];
      idx[k] = w.idx(x, y, z); pos[k * 3] = (x + 0.5) * VS; pos[k * 3 + 1] = (y + 0.5) * VS; pos[k * 3 + 2] = (z + 0.5) * VS;
    }
    const [a, b, c, d, e, g] = f.post, post = [];
    for (let y = b; y <= e; y++) for (let z = c; z < g; z++) for (let x = a; x < d; x++) post.push(x, y, z, w.get(x, y, z));
    // temel sutunlari: fitil hucreleri ve kirmizi diregin taban hucreleri (altlarindaki ilk zemin)
    const base = Array.from(idx);
    for (let z = c; z < g; z++) for (let x = a; x < d; x++) base.push(w.idx(x, b, z));
    const fnd = new Uint8Array(base.length * FUSE_FND);
    base.forEach((bi, k) => { for (let dd = 1; dd <= FUSE_FND; dd++) { const j = bi - dd * w.sxz; if (j < w.sxz) break; const m = w.mat[j]; fnd[k * FUSE_FND + dd - 1] = fndSkip(m) ? 0 : m; } });
    return { i, n, idx, pos, base: Int32Array.from(base), fnd, depot: f.depot, box: [a * VS, b * VS, c * VS, d * VS, (e + 1) * VS, g * VS], post, st: 0, s0: 0, t0: 0, p: 0, by: null, chain: 0, regen: -1, burn: [], fxT: 0, sndT: 0 };
  }

  _mkDepot(w, d, i) {
    const [bx0, , bz0, bx1, , bz1] = d.box;
    const r = [Math.max(1, bx0 - 10), 2, Math.max(1, bz0 - 10), Math.min(w.sx - 1, bx1 + 10), this.G + 18, Math.min(w.sz - 1, bz1 + 10)];
    const nx = r[3] - r[0], ny = r[4] - r[1], nz = r[5] - r[2], snap = new Uint8Array(nx * ny * nz);
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) snap[x + nx * (z + nz * y)] = w.mat[w.idx(r[0] + x, r[1] + y, r[2] + z)];
    return { i, box: d.box, c: d.c, r, nx, ny, nz, snap, st: 0, t: 0, by: null, chain: 0, regen: -1, warnUntil: -1, checkT: 6 + i * 3 };
  }

  // mac basi: sandiklar, fitiller ve depolar tam; ucan fisekler ve cizirdayan sandiklar temizlenir
  matchReset() {
    if (!this.active) return;
    this.shells.length = 0; this.queue.length = 0; this.crackles.length = 0; this.fizz.clear();
    if (!this.auth) return;
    for (const d of this.depots) this._restoreDepot(d, true);
    for (const f of this.fuses) this._restoreFuse(f, true);
    for (const c of this.crates) this._restoreCrate(c, true);
  }

  // olcum (&chain): her sey yerinde, sonra uc fitil ve her ~9 sandiktan biri birden: bastan sona en buyuk zincir
  benchChain(by = null) {
    if (!this.active || !this.auth) return;
    this.matchReset();
    for (const f of this.fuses) this._light(f, 0, by, 0);
    for (let i = 0; i < this.crates.length; i += 9) this._ignite(this.crates[i], by, 0, rnd(0, 1.5), FIZZ0);
  }

  _newChain(by) {
    const id = ++this.chainId;
    this.chains.set(id, { by, kills: 0, t: this.time });
    this.stats.chains++;
    if (this.chains.size > 40) for (const [k, ch] of this.chains) if (this.time - ch.t > 120) this.chains.delete(k);
    return id;
  }

  // ---------------------------------------------------------------- yardimcilar
  _boxDist(c, x, y, z) {
    const ax = c.x0 * VS, ay = c.y0 * VS, az = c.z0 * VS, bx = ax + 1, by = ay + 0.75, bz = az + 1;
    const dx = x < ax ? ax - x : x > bx ? x - bx : 0, dy = y < ay ? ay - y : y > by ? y - by : 0, dz = z < az ? az - z : z > bz ? z - bz : 0;
    return Math.hypot(dx, dy, dz);
  }
  _postDist(f, x, y, z) {
    const [ax, ay, az, bx, by, bz] = f.box;
    const dx = x < ax ? ax - x : x > bx ? x - bx : 0, dy = y < ay ? ay - y : y > by ? y - by : 0, dz = z < az ? az - z : z > bz ? z - bz : 0;
    return Math.hypot(dx, dy, dz);
  }
  _crateAtVoxel(x, y, z) {
    for (const c of this.crates) if (x >= c.x0 && x < c.x0 + 4 && y >= c.y0 && y < c.y0 + 3 && z >= c.z0 && z < c.z0 + 4) return c;
    return null;
  }
  // canli bir aktorun kutusu bu kutuyla (m) kesisiyor mu: yenilenme icinde / ustunde biri varken yazmaz
  _occupied(x0, y0, z0, x1, y1, z1) {
    for (const a of this.game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, h = a.mover.h || 1.8;
      if (p.x + 0.4 > x0 && p.x - 0.4 < x1 && p.z + 0.4 > z0 && p.z - 0.4 < z1 && p.y + h + 0.1 > y0 && p.y - 0.1 < y1) return true;
    }
    return false;
  }
  // fitil kivilcimi (kesirli hucre indeksi) -> dunya konumu
  _fusePos(f, p, out) {
    const k = Math.max(0, Math.min(f.n - 1, Math.floor(p))), k2 = Math.min(f.n - 1, k + 1), u = Math.max(0, Math.min(1, p - k)), P = f.pos;
    out.x = P[k * 3] + (P[k2 * 3] - P[k * 3]) * u; out.y = P[k * 3 + 1] + (P[k2 * 3 + 1] - P[k * 3 + 1]) * u; out.z = P[k * 3 + 2] + (P[k2 * 3 + 2] - P[k * 3 + 2]) * u;
    return out;
  }
  // depo tehlikede mi: uyari surerken ya da ona kosan yanik fitilin kalan suresi az
  _depotHot(d, within = 10) {
    if (d.st === 1 || d.warnUntil > this.time) return true;
    if (d.st !== 0) return false;
    for (const f of this.fuses) if (f.depot === d.i && f.st === 1 && (f.n - 1 - f.p) / FUSE_V < within) return true;
    return false;
  }

  // ---------------------------------------------------------------- kurallar (yalniz yetkili makinede)
  // destruction.blast'tan: mermi / plazma isabeti carptigi sandiga hasar verir (100'de tutusur), kirmizi direk ya da
  // fitilin basi fitili yakar; patlama (yaricap >= 1 m) yaricap + 1 m icindeki sandiklari tutusturur, fitili yakar
  onBlast(x, y, z, radius, source, power = 1000) {
    if (!this.active || !this.auth) return;
    const by = this._who(source);
    if (radius >= 1.0) {
      if (this._own) return;
      for (const c of this.crates) if (c.st === 0 && this._boxDist(c, x, y, z) < radius + 1.0) this._ignite(c, by, 0, rnd(SPREAD[0], SPREAD[1]), FIZZ1);
      this._fuseNear(x, y, z, radius + 0.5, by, 0);
      return;
    }
    for (const c of this.crates) {
      if (c.st !== 0 || this._boxDist(c, x, y, z) > radius + 0.3) continue;
      c.hp -= power;
      if (c.hp <= 0) this._ignite(c, by, 0, 0, FIZZ0);
      break;
    }
    for (const f of this.fuses) {
      if (f.st !== 0) continue;
      const P = f.pos;
      if (this._postDist(f, x, y, z) < radius + 0.3 || Math.hypot(P[0] - x, P[1] - y, P[2] - z) < 0.75) for (let k = 0; k < 4; k++) if (this._light(f, k, by, 0)) break;
    }
  }

  // sandigi tutustur: delay sonra cizirdamaya baslar, fizz araligindaki sure sonra patlar
  _ignite(c, by, chain, delay, fizz) {
    if (!c || c.st !== 0) return false;
    const fz = rnd(fizz[0], fizz[1]);
    c.st = 1; c.by = by; c.chain = chain || this._newChain(by); c.t = delay + fz;
    this.fizz.set(c.i, { from: this.time + delay, until: this.time + c.t, snd: 0 });
    this.stats.lit++;
    this.game.netEmit('fwSys', { k: 'fz', c: c.i, w: r2(delay), d: r2(c.t) });
    return true;
  }

  // fitili k. hucreden depoya dogru yak (hucre yoksa kopuk: yanmaz)
  _light(f, k, by, chain) {
    if (f.st !== 0 || k >= f.n || this.game.world.mat[f.idx[k]] !== M.FUSE) return false;
    f.st = 1; f.s0 = k; f.p = k; f.t0 = this.now(); f.by = by; f.chain = chain || this._newChain(by); f.burn.length = 0;
    this.stats.fuses++;
    const P = f.pos;
    if (this.game.audio) this.game.audio.play('fwLight', P[k * 3], P[k * 3 + 1], P[k * 3 + 2], 1);
    if (this.game.logEvent) this.game.logEvent('fuse#' + f.i + ' ' + (by ? by.name : '-') + ' @' + k);
    return true;
  }

  // noktanin R icindeki en ileri (depoya en yakin) saglam fitil hucresinden yak; direge yakinsa bastan
  _fuseNear(x, y, z, R, by, chain) {
    const w = this.game.world, R2 = R * R;
    for (const f of this.fuses) {
      if (f.st !== 0) continue;
      let best = -1;
      const P = f.pos;
      for (let k = f.n - 1; k >= 0; k--) {
        const dx = P[k * 3] - x, dy = P[k * 3 + 1] - y, dz = P[k * 3 + 2] - z;
        if (dx * dx + dy * dy + dz * dz <= R2 && w.mat[f.idx[k]] === M.FUSE) { best = k; break; }
      }
      if (best < 0 && this._postDist(f, x, y, z) < R) for (let k = 0; k < 4 && best < 0; k++) if (w.mat[f.idx[k]] === M.FUSE) best = k;
      if (best >= 0) this._light(f, best, by, chain);
    }
  }

  // zincirin hasari: merkezde dmg0, R'de 0; arada duvar varsa losK kati (siper); hepsi 'chain', tetikleyene yazilir
  _hurt(x, y, z, R, dmg0, by, chain, knock, losK = 0.35) {
    const game = this.game;
    for (const a of game.actors) {
      if (!a.alive) continue;
      const d = a.distanceTo(x, y, z);
      if (d > R) continue;
      const k = 1 - d / R;
      a.center(_c);
      let dmg = dmg0 * k;
      if (!game.world.lineOfSight(x, y, z, _c.x, _c.y, _c.z, _hit)) dmg *= losK;
      _v.set(_c.x - x, _c.y - y + 0.4, _c.z - z);
      const l = _v.length() || 1; _v.divideScalar(l);
      a.mover.impulse(_v.x * knock * k, _v.y * knock * k + 1.2 * k, _v.z * knock * k);
      if (dmg < 1) continue;
      a.takeDamage(dmg, by, 'chain', _v, false);
      if (!a.alive) this._onChainKill(a, by, chain);
    }
  }

  // zincir oldurdu: baslatana sayilir. Tek oldurmede ZINCIRLEME! mesajini oyunun kendisi verir (killnames KILLER_MSG);
  // ayni zincirin ikinci oldurmesinden sonra ZINCIRLEME xN! (coklu parcalama mesajinin ustune). Uzak oyuncuya olay.
  _onChainKill(victim, by, chain) {
    if (!by || by === victim) { if (by) this.stats.selfKills++; return; }
    this.stats.kills++;
    const ch = this.chains.get(chain), n = ch ? ++ch.kills : 1, game = this.game;
    if (game.logEvent) game.logEvent('chainkill ' + by.name + '>' + victim.name + ' x' + n);
    if (by.isPlayer) { if (n >= 2 && game.hud && game.state === 'playing') game.hud.centerMsg(t('chainKillN', n), 2.0); }
    else game.netEmit('fwSys', { k: 'ck', a: by.id, n });
  }

  _tickCrates(dt) {
    for (const c of this.crates) {
      if (c.st !== 1) continue;
      c.t -= dt;
      if (c.t <= 0) { c.st = 3; this.queue.push(c); }
    }
    if (this.queue.length > this.stats.maxQ) this.stats.maxQ = this.queue.length;
    // kare basina en cok BOOMS_PER_FRAME patlama (gerisi siradaki karelere)
    for (let k = 0; k < BOOMS_PER_FRAME && this.queue.length; k++) this._explodeCrate(this.queue.shift());
    // baska yoldan yok olan sandik (cati coktu, govdeyle dustu): yenilenmeye
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 2;
      const w = this.game.world;
      for (const c of this.crates) {
        if (c.st !== 0) continue;
        let n = 0;
        for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) { let i = w.idx(c.x0, c.y0 + y, c.z0 + z); for (let x = 0; x < 4; x++, i++) if (isCrateMat(w.mat[i])) n++; }
        if (n < 24) { c.st = 2; c.regen = rnd(REGEN_CRATE[0], REGEN_CRATE[1]); this._clearCrate(c); }
      }
    }
  }

  _clearCrate(c) {
    const w = this.game.world, idx = [];
    for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) { const i = w.idx(c.x0 + x, c.y0 + y, c.z0 + z); if (isCrateMat(w.mat[i])) idx.push(i); }
    if (idx.length) w.removeIndices(idx);
  }

  _explodeCrate(c) {
    const game = this.game, by = this._who(c.by);
    c.st = 2; c.regen = rnd(REGEN_CRATE[0], REGEN_CRATE[1]); c.hp = CRATE_HP;
    this.fizz.delete(c.i);
    this.stats.crates++;
    this._own = true;
    try { game.destruction.blast(c.cx, c.cy, c.cz, CRATE_VR, CRATE_VP, by, 9, 140); } finally { this._own = false; }
    this._clearCrate(c);
    this._hurt(c.cx, c.cy, c.cz, CRATE_R, CRATE_DMG, by, c.chain, 6);
    for (const o of this.crates) if (o.st === 0 && Math.hypot(o.cx - c.cx, o.cy - c.cy, o.cz - c.cz) < CRATE_R) this._ignite(o, by, c.chain, rnd(SPREAD[0], SPREAD[1]), FIZZ1);
    this._fuseNear(c.cx, c.cy, c.cz, 2.2, by, c.chain);
    const n = SHELL_N[0] + ((Math.random() * (SHELL_N[1] - SHELL_N[0] + 1)) | 0);
    for (let k = 0; k < n; k++) this._launch(c.cx, c.cy + 0.45, c.cz, (Math.random() * 2147483647) | 0, by, c.chain, k);
    this._boomFx(c.cx, c.cy, c.cz, 2.4, 0.8);
    if (game.audio) game.audio.play('fwCrate', c.cx, c.cy, c.cz, 1.1);
    game.netEmit('fwSys', { k: 'bx', c: c.i });
  }

  _launch(x, y, z, seed, by, chain, k = 0) {
    if (this.shells.length >= MAX_SHELLS) return;
    const s = this._mkShell(x, y, z, seed);
    s.by = by; s.chain = chain;
    this.shells.push(s);
    this.stats.shells++;
    if (k < 2 && this.game.audio) this.game.audio.play('fwWhistle', x, y + 1, z, 0.8);
    this.game.netEmit('fwSys', { k: 'sh', p: [r2(x), r2(y), r2(z)], s: seed });
  }

  _mkShell(x, y, z, seed) {
    const P = shellParams(seed);
    return { x, y, z, vx: P.vx, vy: P.vy, vz: P.vz, t: 0, tb: P.tb, pat: P.pat, col: P.col, dud: P.dud, crackle: P.crackle, seed, by: null, chain: 0, tr: 0 };
  }

  // curuk fisek yere / bir yere carpti (ya da yukselirken tavana): kucuk patlama, 2 m'deki sandigi tutusturur
  _pop(s, x, y, z) {
    const game = this.game, by = this._who(s.by);
    this.stats.duds++;
    this._own = true;
    try { game.destruction.blast(x, y, z, 1.0, 200, by, 6, 60); } finally { this._own = false; }
    this._hurt(x, y, z, DUD_DR, DUD_DMG, by, s.chain, 5);
    for (const c of this.crates) if (c.st === 0 && this._boxDist(c, x, y, z) < DUD_R) this._ignite(c, by, s.chain, rnd(0.05, 0.25), FIZZ1);
    this._fuseNear(x, y, z, 1.5, by, s.chain);
    this._popFx(x, y, z, s.col);
    game.netEmit('fwSys', { k: 'dd', p: [r2(x), r2(y), r2(z)], c: s.col });
  }

  _tickFuses(dt) {
    const w = this.game.world;
    for (const f of this.fuses) {
      if (f.st !== 1) continue;
      const p1 = Math.min(f.n - 1, f.p + FUSE_V * dt);
      // gecilen her hucre: onundeki hucre yoksa (vuruldu, koptu) kivilcim orada soner; arkasindaki yanip kaybolur
      for (let k = Math.floor(f.p) + 1; k <= Math.floor(p1); k++) {
        if (w.mat[f.idx[k]] !== M.FUSE) { this._fuseOut(f, k); break; }
        f.burn.push(f.idx[k - 1]);
      }
      if (f.st !== 1) continue;
      f.p = p1;
      if (f.p >= f.n - 1) { this._fuseEnd(f); continue; }
      if (f.burn.length >= 3) { w.removeIndices(f.burn); f.burn.length = 0; }
    }
  }

  _fuseOut(f, k) {
    const w = this.game.world;
    if (f.burn.length) { w.removeIndices(f.burn); f.burn.length = 0; }
    f.st = 2; f.regen = rnd(REGEN_DEPOT[0], REGEN_DEPOT[1]);
    this.stats.cuts++;
    const P = f.pos, j = Math.max(0, k - 1) * 3;
    this._sparkBurst(P[j], P[j + 1], P[j + 2], 10);
    if (this.game.logEvent) this.game.logEvent('fusecut#' + f.i + ' @' + k);
  }

  _fuseEnd(f) {
    const w = this.game.world;
    f.burn.push(f.idx[f.n - 2], f.idx[f.n - 1]);
    w.removeIndices(f.burn.filter((i) => w.mat[i] === M.FUSE)); f.burn.length = 0;
    f.st = 2; f.regen = rnd(REGEN_DEPOT[0], REGEN_DEPOT[1]);
    const d = this.depots[f.depot];
    if (!d || d.st !== 0) return;
    d.st = 1; d.t = DEPOT_WARN; d.by = f.by; d.chain = f.chain; d.warnUntil = this.time + DEPOT_WARN; d.door = f.n - 1; d.doorF = f.i;
    const P = f.pos, j = (f.n - 1) * 3;
    if (this.game.audio) this.game.audio.play('fwWarn', P[j], P[j + 1] + 1, P[j + 2], 1.3);
    this.game.netEmit('fwSys', { k: 'dw', d: d.i, f: f.i });
  }

  _tickDepots(dt) {
    for (const d of this.depots) {
      if (d.st === 1) { d.t -= dt; if (d.t <= 0) this._explodeDepot(d); continue; }
      // vurulup oyulan (patlamamis) depo: 90 sn sonra anlik goruntuden onarilir
      if (d.st !== 0 || d.regen > 0) continue;
      d.checkT -= dt;
      if (d.checkT > 0) continue;
      d.checkT = 8;
      if (this._depotDiff(d, 40) >= 40) { d.st = 2; d.regen = REGEN_DEPOT[1]; }
    }
  }

  _explodeDepot(d) {
    const game = this.game, by = this._who(d.by), [x, y, z] = d.c;
    d.st = 2; d.regen = rnd(REGEN_DEPOT[0], REGEN_DEPOT[1]); d.warnUntil = -1;
    this.stats.depots++;
    this._own = true;
    try { game.destruction.blast(x, y, z, DEPOT_VR, DEPOT_VP, by, 14, 420); } finally { this._own = false; }
    this._hurt(x, y + 0.5, z, DEPOT_R, DEPOT_DMG, by, d.chain, 16, 0.55);
    for (const c of this.crates) if (c.st === 0 && Math.hypot(c.cx - x, c.cy - y, c.cz - z) < DEPOT_R + 1) this._ignite(c, by, d.chain, rnd(0.1, 0.4), FIZZ1);
    for (let k = 0; k < 7; k++) this._launch(x + rnd(-2.5, 2.5), y + 1.2, z + rnd(-2.5, 2.5), (Math.random() * 2147483647) | 0, by, d.chain, k);
    this._depotFx(x, y, z);
    if (game.audio) game.audio.play('fwDepot', x, y, z, 1.4);
    game.netEmit('fwSys', { k: 'dx', d: d.i });
    if (game.logEvent) game.logEvent('depot#' + d.i + ' ' + (by ? by.name : '-'));
  }

  // depo binasinda (zeminle) anlik goruntuden farkli voxel sayisi (en cok cap'e kadar sayar)
  _depotDiff(d, cap = Infinity) {
    const w = this.game.world, [x0, y0, z0] = d.r, [bx0, , bz0, bx1, by1, bz1] = d.box;
    let n = 0;
    for (let y = this.G - 1; y < by1 + 3 && n < cap; y++) for (let z = bz0; z < bz1 && n < cap; z++) for (let x = bx0; x < bx1; x++) {
      if (w.mat[w.idx(x, y, z)] !== d.snap[(x - x0) + d.nx * ((z - z0) + d.nz * (y - y0))]) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- yenilenme
  _tickRegen(dt) {
    for (const c of this.crates) {
      if (c.st !== 2 || c.regen < 0) continue;
      c.regen -= dt;
      if (c.regen <= 0 && !this._restoreCrate(c, false)) c.regen = 1;
    }
    for (const f of this.fuses) {
      if (f.st !== 2 || f.regen < 0) continue;
      f.regen -= dt;
      if (f.regen > 0) continue;
      const d = this.depots[f.depot];
      // deposu yikiksa depoyla birlikte kurulur
      if ((d && d.st === 2) || !this._restoreFuse(f, false)) f.regen = 1;
    }
    for (const d of this.depots) {
      if (d.st !== 2 || d.regen < 0) continue;
      d.regen -= dt;
      if (d.regen > 0) continue;
      if (!this._restoreDepot(d, false)) { d.regen = 1; continue; }
      for (const f of this.fuses) if (f.depot === d.i && f.st === 2 && !this._restoreFuse(f, false)) f.regen = 1;
    }
  }

  _restoreCrate(c, force) {
    const w = this.game.world;
    if (!force) {
      for (const j of c.on) if (this.crates[j].st !== 0) return false;
      if (this._occupied(c.x0 * VS - 0.05, c.y0 * VS - 0.05, c.z0 * VS - 0.05, (c.x0 + 4) * VS + 0.05, (c.y0 + 3) * VS + 1.9, (c.z0 + 4) * VS + 0.05)) return false;
    }
    const rem = [], dep = [];
    if (!c.on.length) {
      // yerdeki sandik: altindaki ve cevresindeki cukur ilk haliyle (icinde biri varsa sonra)
      const R = CRATE_FR, W = 4 + 2 * R, boxes = [];
      if (!force) for (const a of this.game.actors) {
        if (!a.alive) continue;
        const p = a.mover.pos, h = a.mover.h || 1.8;
        boxes.push(Math.floor((p.x - 0.45) / VS), Math.floor((p.y - 0.15) / VS), Math.floor((p.z - 0.45) / VS), Math.floor((p.x + 0.45) / VS), Math.floor((p.y + h + 0.15) / VS), Math.floor((p.z + 0.45) / VS));
      }
      const inA = (X, Y, Z) => { for (let b = 0; b < boxes.length; b += 6) if (X >= boxes[b] && X <= boxes[b + 3] && Y >= boxes[b + 1] && Y <= boxes[b + 4] && Z >= boxes[b + 2] && Z <= boxes[b + 5]) return true; return false; };
      for (let zz = 0; zz < W; zz++) for (let xx = 0; xx < W; xx++) {
        const X = c.x0 - R + xx, Z = c.z0 - R + zz;
        if (X < 0 || Z < 0 || X >= w.sx || Z >= w.sz) continue;
        const foot = xx >= R && xx < R + 4 && zz >= R && zz < R + 4;
        let started = false;
        for (let d = 1; d <= CRATE_FND && c.y0 - d > 0; d++) {
          const want = c.fnd[(zz * W + xx) * CRATE_FND + d - 1];
          if (!want) { if (started) break; continue; }
          started = true;
          if (w.get(X, c.y0 - d, Z)) break;
          if (boxes.length && inA(X, c.y0 - d, Z)) { if (foot) return false; continue; }   // sandigin altinda biri: sonra; cevrede: o hucre atlanir
          dep.push(X, c.y0 - d, Z, want);
        }
      }
    }
    for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
      const X = c.x0 + x, Y = c.y0 + y, Z = c.z0 + z, i = w.idx(X, Y, Z), m = w.mat[i];
      if (m === c.m) continue;
      if (m) rem.push(i);
      dep.push(X, Y, Z, c.m);
    }
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) { const s = c.sup[x + 4 * z]; if (s && !w.get(c.x0 + x, c.y0 - 1, c.z0 + z)) dep.push(c.x0 + x, c.y0 - 1, c.z0 + z, s); }
    // cati gibi yuksek destek cevresiyle yikilmissa sandik (ve altina yazilacak parca) havada kalirdi: bekler (mac basinda
    // da: yoksa sayilir, sonra yenilenmeyi dener)
    if (!this._grounded(c, dep)) {
      if (force) { this._clearCrate(c); c.st = 2; c.regen = 1; this.fizz.delete(c.i); }
      return false;
    }
    if (rem.length) w.removeIndices(rem);
    if (dep.length) w.depositMany(dep, dep.length);
    const was = c.st;
    c.st = 0; c.hp = CRATE_HP; c.by = null; c.chain = 0; c.regen = -1;
    this.fizz.delete(c.i);
    if (!force && was === 2) {
      this.stats.regens++;
      this._puff(c.cx, c.cy, c.cz, 0.8);
      this.game.netEmit('fwSys', { k: 'rg', p: [r2(c.cx), r2(c.cy), r2(c.cz)], r: 0.8 });
    }
    return true;
  }

  // yenilenecek sandik (yazilacak voxellerle birlikte) yere bagli mi: alt katmanindan once asagi giden arama anakayaya /
  // yikilmaz malzemeye iner ya da 3000 voxeli asar (buyuk yapiya bagli). voxelWorld.findIslands ile ayni olcut.
  _grounded(c, dep) {
    const w = this.game.world, sx = w.sx, sz = w.sz, sxz = w.sxz, mat = w.mat, plan = new Set(), seen = new Set(), st = [];
    for (let k = 0; k < dep.length; k += 4) plan.add(w.idx(dep[k], dep[k + 1], dep[k + 2]));
    const go = (j) => { if (!seen.has(j) && (mat[j] || plan.has(j))) { seen.add(j); st.push(j); } };
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) go(w.idx(c.x0 + x, c.y0, c.z0 + z));
    while (st.length) {
      const i = st.pop(), y = (i / sxz) | 0;
      if (y === 0 || INDESTRUCTIBLE[mat[i]] || seen.size > 3000) return true;
      const r = i - y * sxz, z = (r / sx) | 0, x = r - z * sx;
      if (y < w.sy - 1) go(i + sxz);
      if (x > 0) go(i - 1);
      if (x < sx - 1) go(i + 1);
      if (z > 0) go(i - sx);
      if (z < sz - 1) go(i + sx);
      go(i - sxz);                                     // en son: once asagi bakilir
    }
    return false;
  }

  // fitil (ve kirmizi diregi) yeniden: icinde biri duran hucre beklenir; araya oturmus moloz kalkar
  _restoreFuse(f, force) {
    const w = this.game.world, rem = [], dep = [], sx = w.sx, sxz = w.sxz;
    let blocked = false;
    const put = (i, m) => {
      const cur = w.mat[i];
      if (cur === m) return;
      const y = (i / sxz) | 0, r = i - y * sxz, z = (r / sx) | 0, x = r - z * sx;
      if (!force && this._occupied(x * VS, y * VS, z * VS, (x + 1) * VS, (y + 1) * VS, (z + 1) * VS)) { blocked = true; return; }
      if (cur) rem.push(i);
      dep.push(x, y, z, m);
    };
    for (let k = 0; k < f.n; k++) put(f.idx[k], M.FUSE);
    for (let k = 0; k < f.base.length; k++) {
      let started = false;
      for (let d = 1; d <= FUSE_FND; d++) {
        const i = f.base[k] - d * sxz, want = f.fnd[k * FUSE_FND + d - 1];
        if (i < sxz) break;
        if (!want) { if (started) break; continue; }
        started = true;
        if (w.mat[i]) break;
        put(i, want);
      }
    }
    for (let k = 0; k < f.post.length; k += 4) if (f.post[k + 3]) put(w.idx(f.post[k], f.post[k + 1], f.post[k + 2]), f.post[k + 3]);
    if (rem.length) w.removeIndices(rem);
    if (dep.length) w.depositMany(dep, dep.length);
    if (blocked) return false;
    const was = f.st;
    f.st = 0; f.p = 0; f.s0 = 0; f.by = null; f.chain = 0; f.regen = -1; f.burn.length = 0;
    if (!force && was === 2 && dep.length) {
      const [ax, ay, az, bx, , bz] = f.box;
      this._puff((ax + bx) / 2, ay + 1, (az + bz) / 2, 0.8);
      this.game.netEmit('fwSys', { k: 'rg', p: [r2((ax + bx) / 2), r2(ay + 1), r2((az + bz) / 2)], r: 0.8 });
    }
    return true;
  }

  // depo bolgesi anlik goruntuden: yikilan bina, krater, ustune dusen moloz; aktorun icinde oldugu hucreye yazmaz
  _restoreDepot(d, force) {
    const w = this.game.world, [x0, y0, z0] = d.r, rem = [], dep = [], boxes = [];
    if (!force) for (const a of this.game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, h = a.mover.h || 1.8;
      boxes.push(Math.floor((p.x - 0.45) / VS), Math.floor((p.y - 0.15) / VS), Math.floor((p.z - 0.45) / VS), Math.floor((p.x + 0.45) / VS), Math.floor((p.y + h + 0.15) / VS), Math.floor((p.z + 0.45) / VS));
    }
    let blocked = false;
    for (let y = 0; y < d.ny; y++) for (let z = 0; z < d.nz; z++) {
      let i = w.idx(x0, y0 + y, z0 + z), s = d.nx * (z + d.nz * y);
      for (let x = 0; x < d.nx; x++, i++, s++) {
        const m = w.mat[i], want = d.snap[s];
        if (m === want) continue;
        const X = x0 + x, Y = y0 + y, Z = z0 + z;
        if (want) {
          let hit = false;
          for (let b = 0; b < boxes.length; b += 6) if (X >= boxes[b] && X <= boxes[b + 3] && Y >= boxes[b + 1] && Y <= boxes[b + 4] && Z >= boxes[b + 2] && Z <= boxes[b + 5]) { hit = true; break; }
          if (hit) { blocked = true; continue; }
          dep.push(X, Y, Z, want);
        }
        if (m) rem.push(i);
      }
    }
    if (rem.length) w.removeIndices(rem);
    if (dep.length) w.depositMany(dep, dep.length);
    if (blocked) return false;
    const was = d.st;
    d.st = 0; d.regen = -1; d.by = null; d.chain = 0; d.warnUntil = -1; d.checkT = 8;
    if (!force && was === 2 && dep.length) {
      this.stats.regens++;
      const [cx, cy, cz] = d.c;
      this._puff(cx, cy, cz, 4);
      this.game.netEmit('fwSys', { k: 'rg', p: [r2(cx), r2(cy), r2(cz)], r: 4 });
    }
    return true;
  }

  // ---------------------------------------------------------------- guncelleme (game.js; konukta da: gorsel / ses)
  update(dt, camera) {
    if (!this.active) return;
    this.time += dt;
    if (dt <= 0) return;
    if (this.auth) {
      this._tickCrates(dt);
      this._tickFuses(dt);
      this._tickDepots(dt);
      this._tickRegen(dt);
    } else this._tickGuest();
    this._tickShells(dt);
    this._tickFx(dt);
    this._warn(dt);
    this._ambience(dt);
  }

  _tickShells(dt) {
    const w = this.game.world, auth = this.auth;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const px = s.x, py = s.y, pz = s.z;
      s.t += dt; s.vy -= SHELL_G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      this._trail(s, dt);
      if (!s.dud && s.t >= s.tb) { this.shells.splice(i, 1); this._burst(s); continue; }
      // ilk 0.15 sn carpma yok (ust uste sandiklarin arasindan cikar); sonra bu karenin yolunda voxel varsa patlar
      if (s.t > 0.15) {
        const dx = s.x - px, dy = s.y - py, dz = s.z - pz, L = Math.hypot(dx, dy, dz);
        if (L > 1e-5 && w.raycast(px, py, pz, dx / L, dy / L, dz / L, L, _hit)) {
          this.shells.splice(i, 1);
          const k = Math.max(0, _hit.dist - 0.1);
          if (auth) this._pop(s, px + dx / L * k, py + dy / L * k, pz + dz / L * k);
          continue;
        }
      }
      if (s.t > 9 || s.y < -2) this.shells.splice(i, 1);
    }
  }

  _burst(s) {
    this.stats.bursts++;
    if (this.auth) this._hurt(s.x, s.y, s.z, BURST_R, BURST_DMG, this._who(s.by), s.chain, 3, 0.2);
    this._burstFx(s);
  }

  // konuk: yanan fitilin kivilcimi ev sahibinin zamaniyla ilerler
  _tickGuest() {
    const now = this.now();
    for (const f of this.fuses) if (f.st === 1) f.p = Math.min(f.n - 1, f.s0 + Math.max(0, now - f.t0) * FUSE_V);
  }

  // ---------------------------------------------------------------- ag (net/host.js, net/guest.js)
  // ev sahibi: voxel disi durum (yanan fitiller: baslangic hucresi + ev sahibi zamani; depo durumlari). Seyrek degisir.
  netState() {
    if (!this.active) return null;
    return { f: this.fuses.map((f) => (f.st === 1 ? [1, f.s0, r2(f.t0)] : [f.st])), d: this.depots.map((d) => d.st) };
  }

  applyNetState(s) {
    if (!this.active || !s || !Array.isArray(s.f)) return;
    this.netStats.st++;
    s.f.forEach((e, i) => {
      const f = this.fuses[i];
      if (!f || !Array.isArray(e)) return;
      const st = e[0] | 0;
      if (st === 1 && (f.st !== 1 || f.s0 !== e[1] || Math.abs(f.t0 - e[2]) > 0.02)) {
        const fresh = f.st !== 1;
        f.s0 = e[1] | 0; f.t0 = +e[2]; f.p = f.s0;
        if (fresh && this.game.audio) { const j = f.s0 * 3; this.game.audio.play('fwLight', f.pos[j], f.pos[j + 1], f.pos[j + 2], 1); }
      }
      f.st = st;
    });
    if (Array.isArray(s.d)) s.d.forEach((st, i) => { const d = this.depots[i]; if (d) d.st = st | 0; });
  }

  // konuk: ev sahibinin olaylari (sandik cizirtisi / patlamasi, fisek atisi, curuk carpmasi, depo, yenilenme, zincir)
  onNetEvent(e) {
    if (!this.active || !e) return;
    const game = this.game, au = game.audio, ns = this.netStats;
    if (ns[e.k] !== undefined) ns[e.k]++;
    if (e.k === 'fz') {
      const c = this.crates[e.c];
      if (c) this.fizz.set(c.i, { from: this.time + (+e.w || 0), until: this.time + (+e.d || 0.5), snd: 0 });
    } else if (e.k === 'bx') {
      const c = this.crates[e.c];
      if (!c) return;
      this.fizz.delete(c.i);
      this._boomFx(c.cx, c.cy, c.cz, 2.4, 0.8);
      if (au) au.play('fwCrate', c.cx, c.cy, c.cz, 1.1);
    } else if (e.k === 'sh') {
      if (!Array.isArray(e.p) || this.shells.length >= MAX_SHELLS + 10) return;
      this.shells.push(this._mkShell(+e.p[0], +e.p[1], +e.p[2], e.s | 0));
      if (au && !(this._whT > this.time)) { this._whT = this.time + 0.06; au.play('fwWhistle', +e.p[0], +e.p[1] + 1, +e.p[2], 0.8); }
    } else if (e.k === 'dd') {
      if (!Array.isArray(e.p)) return;
      const [x, y, z] = e.p;
      for (let i = this.shells.length - 1; i >= 0; i--) { const s = this.shells[i]; if (Math.hypot(s.x - x, s.y - y, s.z - z) < 4) { this.shells.splice(i, 1); break; } }
      this._popFx(x, y, z, e.c | 0);
    } else if (e.k === 'dw') {
      const d = this.depots[e.d], f = this.fuses[e.f];
      if (d) { d.st = 1; d.warnUntil = this.time + DEPOT_WARN; d.doorF = e.f; }
      if (f && au) { const j = (f.n - 1) * 3; au.play('fwWarn', f.pos[j], f.pos[j + 1] + 1, f.pos[j + 2], 1.3); }
    } else if (e.k === 'dx') {
      const d = this.depots[e.d];
      if (!d) return;
      d.st = 2; d.warnUntil = -1;
      this._depotFx(d.c[0], d.c[1], d.c[2]);
      if (au) au.play('fwDepot', d.c[0], d.c[1], d.c[2], 1.4);
    } else if (e.k === 'rg') {
      if (Array.isArray(e.p)) this._puff(+e.p[0], +e.p[1], +e.p[2], +e.r || 1);
    } else if (e.k === 'ck') {
      const net = game.net;
      if (net && e.a === net.myId && e.n >= 2 && game.hud && game.state === 'playing') game.hud.centerMsg(t('chainKillN', e.n), 2.0);
    }
  }

  // ---------------------------------------------------------------- gorsel ve ses (her makinede)
  // fisek isiklari fx/lights.js havuzundan; ayni anda en cok MAX_LIGHTS (fitil kivilcimlari ayrica, fitil basina bir)
  _flash(x, y, z, hex, intensity, dist, ttl, prio = 2) {
    const now = this.time, L = this.lightEnds;
    while (L.length && L[0] < now) L.shift();
    if (L.length >= MAX_LIGHTS) return;
    if (this.game.fx.lights.flash(x, y, z, hex, intensity, dist, ttl, prio)) { L.push(now + ttl); L.sort((a, b) => a - b); }
  }

  // sandik patlamasi: parlak cekirdek, ates toplari, renkli yildizlar (kagidin icindekiler), duman
  _boomFx(x, y, z, r, big) {
    const fx = this.game.fx, pm = fx.pm, d = _dir;
    fx.add.emit(x, y, z, 0, 0, 0, 0.07, r * 0.25, r * 0.9, [5, 3.6, 2.2, 1], [1.2, 0.4, 0.08, 0], 0, 0, 0);
    const nF = Math.round(14 * big * pm) + 3;
    for (let i = 0; i < nF; i++) {
      rdir(d); const s = rnd(1.5, 5) * r * 0.55, hot = Math.random();
      fx.add.emit(x + d[0] * r * 0.15, y + d[1] * r * 0.15, z + d[2] * r * 0.15, d[0] * s, d[1] * s * 0.8 + 1.2, d[2] * s, rnd(0.25, 0.55), r * rnd(0.15, 0.28), r * rnd(0.45, 0.8),
        [2.6 + hot * 1.4, 1.1 + hot * 0.7, 0.25 + hot * 0.2, 0.9], [0.5, 0.08, 0.01, 0], -1.5, 4.5, 0, Math.random() * 6, rnd(-2, 2));
    }
    const nS = Math.round(44 * big * pm) + 4;
    for (let i = 0; i < nS; i++) {
      rdir(d); const s = rnd(5, 14), c = COLS[(Math.random() * 6) | 0];
      T0[0] = c[0]; T0[1] = c[1]; T0[2] = c[2]; T0[3] = 1; T1[0] = c[0] * 0.2; T1[1] = c[1] * 0.2; T1[2] = c[2] * 0.2; T1[3] = 0;
      fx.add.emit(x, y, z, d[0] * s, Math.abs(d[1]) * s + 2, d[2] * s, rnd(0.4, 1.0), 0.08, 0.03, T0, T1, 9, 1.0, 0.02);
    }
    const nSm = Math.round(12 * big * pm) + 3;
    for (let i = 0; i < nSm; i++) {
      rdir(d); const s = rnd(0.6, 2.8) * r * 0.4, g = rnd(0.06, 0.11);
      fx.smoke.emit(x + d[0] * r * 0.3, y + d[1] * r * 0.2, z + d[2] * r * 0.3, d[0] * s, Math.abs(d[1]) * s + 1.0, d[2] * s,
        rnd(2, 4), r * rnd(0.3, 0.5), r * rnd(1.0, 1.6), [g * 2.6 + 0.08, g * 1.6 + 0.04, g * 1.4, 0.8], [g * 1.5, g * 1.45, g * 1.5, 0], -0.45, 1.3, 0, Math.random() * 6, rnd(-0.5, 0.5));
    }
    this._flash(x, y + 0.8, z, 0xff9a40, 26 * big, r * 5, 0.3, 3);
    fx.addShake(0.4 * big, x, y, z);
  }

  // curuk fisek carpmasi: kucuk patlama, fisegin renginde kivilcim
  _popFx(x, y, z, col) {
    const fx = this.game.fx, pm = fx.pm, d = _dir, c = COLS[col % 6] || COLS[3];
    fx.add.emit(x, y, z, 0, 0, 0, 0.08, 0.2, 1.4, [5, 3.4, 2, 1], [1, 0.3, 0.05, 0], 0, 0, 0);
    T0[0] = c[0]; T0[1] = c[1]; T0[2] = c[2]; T0[3] = 1; T1[0] = c[0] * 0.2; T1[1] = c[1] * 0.2; T1[2] = c[2] * 0.2; T1[3] = 0;
    for (let i = 0; i < 20 * pm + 4; i++) { rdir(d); const s = rnd(3, 9); fx.add.emit(x, y, z, d[0] * s, Math.abs(d[1]) * s + 1, d[2] * s, rnd(0.3, 0.7), 0.06, 0.02, T0, T1, 9, 1.2, 0.02); }
    for (let i = 0; i < 4 * pm + 2; i++) { rdir(d); fx.smoke.emit(x, y + 0.2, z, d[0] * 0.8, Math.abs(d[1]) + 0.4, d[2] * 0.8, rnd(1.2, 2.2), 0.3, 1.1, [0.2, 0.17, 0.16, 0.6], [0.12, 0.12, 0.13, 0], -0.3, 1.4, 0, Math.random() * 6, rnd(-0.5, 0.5)); }
    this._flash(x, y + 0.4, z, LCOLS[col % 6] || 0xffb030, 12, 9, 0.2, 2);
    fx.addShake(0.15, x, y, z);
    if (this.game.audio) this.game.audio.play('fwPop', x, y, z, 1);
  }

  // depo patlamasi: dev ates topu (fx.explosion), yukselen duman sutunu, renkli yildiz yagmuru
  _depotFx(x, y, z) {
    const fx = this.game.fx, pm = fx.pm, d = _dir;
    fx.explosion(x, y + 1, z, 6.5, 0xffa040, 2.2);
    for (let i = 0; i < 26 * pm + 6; i++) {
      const g = rnd(0.05, 0.1);
      fx.smoke.emit(x + rnd(-3, 3), y + rnd(0, 3), z + rnd(-3, 3), rnd(-1, 1), rnd(3, 7), rnd(-1, 1), rnd(4, 7), 2, 6, [g * 3 + 0.1, g * 2 + 0.05, g * 1.5, 0.8], [g, g, g * 1.1, 0], -0.8, 0.8, 0, Math.random() * 6, rnd(-0.3, 0.3));
    }
    for (let i = 0; i < 120 * pm + 10; i++) {
      rdir(d); const s = rnd(8, 22), c = COLS[(Math.random() * 6) | 0];
      T0[0] = c[0]; T0[1] = c[1]; T0[2] = c[2]; T0[3] = 1; T1[0] = c[0] * 0.15; T1[1] = c[1] * 0.15; T1[2] = c[2] * 0.15; T1[3] = 0;
      fx.add.emit(x, y + 1, z, d[0] * s, Math.abs(d[1]) * s + 4, d[2] * s, rnd(0.8, 1.8), 0.12, 0.04, T0, T1, 9, 0.6, 0.03);
    }
    fx.addShake(1.2, x, y, z);
  }

  // fisek acildi: sakayik (0), krizantem (1, izli), sogut (2, altin, sarkar); cekirdek parlamasi, flasla aydinlanan duman
  _burstFx(s) {
    const fx = this.game.fx, pm = fx.pm, x = s.x, y = s.y, z = s.z;
    const c = s.pat === 2 ? GOLD : COLS[s.col];
    const n = Math.round((s.pat === 2 ? 64 : 84) * pm) + 8;
    const sp0 = s.pat === 0 ? 8 : s.pat === 1 ? 10.5 : 6.5, ttl0 = s.pat === 2 ? 2.5 : s.pat === 1 ? 1.5 : 1.25;
    T0[0] = c[0]; T0[1] = c[1]; T0[2] = c[2]; T0[3] = 1; T1[0] = c[0] * 0.12; T1[1] = c[1] * 0.12; T1[2] = c[2] * 0.12; T1[3] = 0;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.2832, r = Math.sqrt(1 - u * u), sp = sp0 * (0.88 + Math.random() * 0.24);
      fx.add.emit(x, y, z, r * Math.cos(th) * sp, u * sp, r * Math.sin(th) * sp, ttl0 * (0.85 + Math.random() * 0.3), s.pat === 2 ? 0.12 : 0.15, 0.05, T0, T1,
        s.pat === 2 ? 4.2 : 2.6, s.pat === 2 ? 1.7 : 1.15, s.pat === 1 ? 0.035 : s.pat === 2 ? 0.025 : 0);
    }
    fx.add.emit(x, y, z, 0, 0, 0, 0.14, 0.8, 4.2, [c[0] * 0.6 + 2, c[1] * 0.6 + 2, c[2] * 0.6 + 2, 1], [c[0] * 0.2, c[1] * 0.2, c[2] * 0.2, 0], 0, 0, 0);
    for (let i = 0; i < 4 * pm + 2; i++) {
      fx.smoke.emit(x + rnd(-1.5, 1.5), y + rnd(-1, 1), z + rnd(-1.5, 1.5), rnd(-0.4, 0.4), rnd(-0.2, 0.3), rnd(-0.4, 0.4), rnd(2.5, 4), 1.2, 3.5,
        [c[0] * 0.03 + 0.05, c[1] * 0.03 + 0.05, c[2] * 0.03 + 0.06, 0.32], [0.03, 0.03, 0.04, 0], -0.05, 0.6, 0, Math.random() * 6, rnd(-0.3, 0.3));
    }
    this._flash(x, y, z, s.pat === 2 ? 0xffb040 : LCOLS[s.col], 45, 44, 0.7, 2);
    if (s.crackle) this.crackles.push({ x, y, z, r: sp0 * 0.9, t0: this.time + ttl0 * 0.55, t1: this.time + ttl0 * 1.1, snd: 0 });
    if (this.game.audio) this.game.audio.play('fwBurst', x, y, z, 1);
  }

  // yukselen fisegin izi (curuk dusus: soluk, dumanli)
  _trail(s, dt) {
    const fx = this.game.fx;
    s.tr += dt * 60 * fx.pm;
    while (s.tr >= 1) {
      s.tr -= 1;
      fx.add.emit(s.x, s.y, s.z, -s.vx * 0.08 + rnd(-0.3, 0.3), -s.vy * 0.08 + rnd(-0.3, 0.3), -s.vz * 0.08 + rnd(-0.3, 0.3), rnd(0.25, 0.5), 0.09, 0.02, s.dud && s.vy < 0 ? K_DUD0 : K_TR0, K_TR1, 3, 1.5, 0);
    }
  }

  _sparkBurst(x, y, z, n) {
    const fx = this.game.fx, d = _dir;
    for (let i = 0; i < n * fx.pm + 2; i++) { rdir(d); const s = rnd(1.5, 5); fx.add.emit(x, y, z, d[0] * s, Math.abs(d[1]) * s + 1, d[2] * s, rnd(0.2, 0.5), 0.05, 0.015, K_SP0, K_SP1, 9, 0.8, 0.02); }
  }

  // yenilenme: kucuk duman bulutu + parilti
  _puff(x, y, z, r) {
    const fx = this.game.fx, pm = fx.pm;
    for (let i = 0; i < 8 * r * pm + 3; i++) {
      fx.smoke.emit(x + rnd(-r, r) * 0.6, y + rnd(-0.2, r * 0.5), z + rnd(-r, r) * 0.6, rnd(-0.5, 0.5), rnd(0.3, 1.0), rnd(-0.5, 0.5), rnd(1.0, 1.8), 0.4, 1.4, [0.5, 0.5, 0.56, 0.45], [0.36, 0.36, 0.42, 0], -0.2, 1.2, 0, Math.random() * 6, rnd(-0.5, 0.5));
    }
    for (let i = 0; i < 6 * pm + 2; i++) fx.add.emit(x + rnd(-r, r) * 0.5, y + rnd(0, r * 0.5), z + rnd(-r, r) * 0.5, rnd(-0.6, 0.6), rnd(0.8, 2), rnd(-0.6, 0.6), rnd(0.4, 0.8), 0.06, 0.02, [3.2, 2.8, 1.6, 1], [1.2, 0.8, 0.3, 0], -1, 1.2, 0);
    if (this.game.audio) this.game.audio.play('fwRegen', x, y, z, 0.7);
  }

  // cizirdayan sandiklar, yanan fitiller, depo uyarisi, simli fisek catirtisi
  _tickFx(dt) {
    const fx = this.game.fx, pm = fx.pm, au = this.game.audio, now = this.time;
    for (const [i, z] of this.fizz) {
      if (now > z.until + 0.3) { this.fizz.delete(i); continue; }
      if (now < z.from) continue;
      const c = this.crates[i];
      for (let k = 55 * pm * dt; k > 0; k -= 1) if (k >= 1 || Math.random() < k) fx.add.emit(c.cx + rnd(-0.35, 0.35), c.cy + 0.4, c.cz + rnd(-0.35, 0.35), rnd(-2, 2), rnd(3, 6.5), rnd(-2, 2), rnd(0.3, 0.6), 0.06, 0.02, K_SP0, K_SP1, 9, 0.5, 0.02);
      if (Math.random() < dt * 7) fx.smoke.emit(c.cx, c.cy + 0.5, c.cz, rnd(-0.3, 0.3), rnd(0.6, 1.2), rnd(-0.3, 0.3), rnd(1, 1.8), 0.2, 0.8, [0.4, 0.36, 0.34, 0.4], [0.25, 0.25, 0.26, 0], -0.3, 1, 0, Math.random() * 6, 0.3);
      z.snd -= dt;
      if (z.snd <= 0) { z.snd = 0.2; if (au) au.play('fwFizz', c.cx, c.cy, c.cz, 1); }
    }
    for (const f of this.fuses) {
      if (f.st !== 1) continue;
      this._fusePos(f, f.p, _p);
      // kivilcim basi: her kare parlak cekirdek (uzaktan da gorunsun) + sicrayan kivilcimlar
      fx.add.emit(_p.x, _p.y + 0.08, _p.z, 0, 0.4, 0, 0.06, 0.24, 0.1, K_SP0, K_SP1, 0, 0.6, 0.02);
      for (let k = 70 * pm * dt; k > 0; k -= 1) if (k >= 1 || Math.random() < k) fx.add.emit(_p.x, _p.y + 0.05, _p.z, rnd(-1.6, 1.6), rnd(0.8, 3.4), rnd(-1.6, 1.6), rnd(0.2, 0.45), 0.065, 0.015, K_SP0, K_SP1, 9, 0.6, 0.02);
      if (Math.random() < dt * 8) fx.smoke.emit(_p.x, _p.y + 0.1, _p.z, rnd(-0.2, 0.2), rnd(0.4, 0.8), rnd(-0.2, 0.2), rnd(0.8, 1.4), 0.08, 0.4, [0.35, 0.33, 0.32, 0.35], [0.2, 0.2, 0.2, 0], -0.2, 1, 0, Math.random() * 6, 0);
      f.fxT -= dt;
      if (f.fxT <= 0) { f.fxT = 0.09; fx.lights.flash(_p.x, _p.y + 0.35, _p.z, 0xffa040, 5, 5, 0.12, 1); }
      f.sndT -= dt;
      if (f.sndT <= 0 && au) { f.sndT = 0.22; au.play('fwFizz', _p.x, _p.y, _p.z, 0.9); }
    }
    for (const d of this.depots) {
      if (!(d.st === 1 || d.warnUntil > now)) continue;
      const f = this.fuses[d.doorF];
      if (!f) continue;
      const j = (f.n - 1) * 3, x = f.pos[j], y = f.pos[j + 1], z = f.pos[j + 2];
      for (let k = 90 * pm * dt; k > 0; k -= 1) if (k >= 1 || Math.random() < k) fx.add.emit(x, y + 0.3, z, rnd(-3, 3), rnd(2, 7), rnd(-3, 3), rnd(0.3, 0.7), 0.07, 0.02, K_SP0, K_SP1, 9, 0.5, 0.02);
      if (Math.random() < dt * 14) fx.lights.flash(x, y + 1.2, z, Math.random() < 0.5 ? 0xff3a20 : 0xffa040, 10, 10, 0.08, 1);
    }
    for (let i = this.crackles.length - 1; i >= 0; i--) {
      const c = this.crackles[i];
      if (now > c.t1) { this.crackles.splice(i, 1); continue; }
      if (now < c.t0) continue;
      if (!c.snd) { c.snd = 1; if (au) au.play('fwCrackle', c.x, c.y, c.z, 1); }
      for (let k = 70 * pm * dt; k > 0; k -= 1) {
        if (k < 1 && Math.random() >= k) continue;
        rdir(_dir);
        const r = c.r * Math.cbrt(Math.random());
        fx.add.emit(c.x + _dir[0] * r, c.y + _dir[1] * r - (now - c.t0) * 1.5, c.z + _dir[2] * r, 0, -0.5, 0, rnd(0.05, 0.12), 0.12, 0.25, [7, 7, 6.5, 1], [2, 2, 1.5, 0], 0, 0, 0);
      }
    }
  }

  // yerel oyuncu patlamak uzere olan deponun yakinindaysa uyari (konukta da: cogaltilan fitil durumundan)
  _warn(dt) {
    const game = this.game, p = game.player;
    this.warnT -= dt;
    if (!game.hud || game.state !== 'playing' || !p || !p.alive || this.warnT > 0) return;
    const q = p.mover.pos;
    for (const d of this.depots) {
      if (!this._depotHot(d, 8)) continue;
      if (Math.hypot(q.x - d.c[0], q.z - d.c[2]) < DEPOT_R + 3.5) { game.hud.subMsg(t('fwDepotWarn'), 1.6); this.warnT = 2.4; return; }
    }
  }

  // uzak suslu fisekler (gokteki ile ayni zamanlama, ses isiktan sonra) ve gece circirleri
  _ambience(dt) {
    const game = this.game, au = game.audio;
    if (!au) return;
    const T = game.time;
    for (let i = 0; i < 3; i++) {
      const cyc = Math.floor((T + i * 2.7) / (4.6 + i * 1.9));
      if (this.skyCyc[i] === cyc) continue;
      if (this.skyCyc[i] >= 0) this.skySnd.push({ t: this.time + 0.8 + Math.random() * 0.9, a: skyHash(cyc, i, 1.7) * Math.PI * 2 });
      this.skyCyc[i] = cyc;
    }
    const cp = game.camera.position;
    for (let i = this.skySnd.length - 1; i >= 0; i--) {
      const s = this.skySnd[i];
      if (this.time < s.t) continue;
      this.skySnd.splice(i, 1);
      au.play('fwDistant', cp.x + Math.sin(s.a) * 35, cp.y + 12, cp.z + Math.cos(s.a) * 35, 1.4);
    }
    this.cricketT -= dt;
    if (this.cricketT <= 0) {
      this.cricketT = 0.7 + Math.random() * 1.8;
      const a = Math.random() * 6.28, r = 6 + Math.random() * 12;
      au.play('cricket', cp.x + Math.cos(a) * r, 1.6, cp.z + Math.sin(a) * r, 0.8 + Math.random() * 0.4);
    }
  }

  // ---------------------------------------------------------------- botlar (bot.js cagirir; yalniz yetkili makinede)
  // tehlike: yanik fitilin hedef deposu (10.5 m) ya da tutusmus sandik (4.2 m)
  dangerAt(x, y, z) {
    for (const d of this.depots) if (this._depotHot(d) && Math.hypot(x - d.c[0], z - d.c[2]) < DEPOT_R + 3) return true;
    for (const c of this.crates) if ((c.st === 1 || c.st === 3) && Math.hypot(x - c.cx, z - c.cz) < CRATE_R + 0.7 && Math.abs(c.cy - y - 0.9) < 3) return true;
    return false;
  }

  // hedef sandik ve 3.5 m icindeki komsulari bota 4.5 m'den yakin degil; yakinda dolu bir depo da yok
  _clusterSafe(c, p) {
    for (const o of this.crates) {
      if (o.st === 2 || Math.hypot(o.cx - c.cx, o.cy - c.cy, o.cz - c.cz) > CRATE_R + 0.5) continue;
      if (Math.hypot(o.cx - p.x, o.cy - p.y - 0.9, o.cz - p.z) < 4.5) return false;
    }
    for (const d of this.depots) if (d.st === 0 && Math.hypot(d.c[0] - p.x, d.c[2] - p.z) < DEPOT_R + 3 && Math.hypot(d.c[0] - c.cx, d.c[2] - c.cz) < 16) return false;
    return true;
  }

  // gorulen bir rakip saglam bir sandigin 3 m yakinindaysa ve sandik gorus hattindaysa rakip yerine sandiga nisan (bot.mapAim)
  botThink(b, now) {
    if (b.mapAim && (now > b.mapAim.until || !b.mapAim.ok())) b.mapAim = null;
    if (b.mapAim || now < (b.fwCd || 0)) return;
    const p = b.mover.pos;
    if (this.dangerAt(p.x, p.y, p.z)) return;
    let best = null, bs = -1e9;
    for (const [a, rec] of b.mem) {
      if (!a.alive || !rec.visible || now - rec.t > 0.35) continue;
      const q = a.mover.pos;
      for (const c of this.crates) {
        if (c.st !== 0) continue;
        const dE = Math.hypot(c.cx - q.x, c.cy - q.y - 0.9, c.cz - q.z);
        if (dE > 3.0) continue;
        const dS = Math.hypot(c.cx - p.x, c.cy - p.y - 0.9, c.cz - p.z);
        if (dS < 4.5 || dS > 45) continue;
        const sc = (3.2 - dE) * 2 + (a.isPlayer ? 0.5 : 0) - dS * 0.03;
        if (sc > bs && this._clusterSafe(c, p)) { bs = sc; best = c; }
      }
    }
    if (!best) return;
    b.fwCd = now + 1.0;
    b.eye(_c);
    const dx = best.cx - _c.x, dy = best.cy - _c.y, dz = best.cz - _c.z, d = Math.hypot(dx, dy, dz);
    if (!this.game.world.raycast(_c.x, _c.y, _c.z, dx / d, dy / d, dz / d, d + 0.6, _hit) || !isCrateMat(_hit.mat) || this._crateAtVoxel(_hit.x, _hit.y, _hit.z) !== best) return;
    if (Math.random() > 0.3 + b.skill.breach * 0.6) { b.fwCd = now + 4; return; }
    const ws = b.weapons, has = (i) => ws.ammo[i] > 0;
    const w = d > 10 && has(4) ? 4 : has(0) ? 0 : has(2) ? 2 : has(4) ? 4 : -1;
    if (w < 0) return;
    const ok = () => best.st === 0 && Math.hypot(best.cx - p.x, best.cy - p.y - 0.9, best.cz - p.z) > 4.2;
    b.mapAim = { x: best.cx, y: best.cy, z: best.cz, w, until: now + 2.4, cone: w === 4 ? 0.03 : 0.05, ok };
    b.fwCd = now + 7;
    b.reactT = b.skill.reaction * 0.6;
    this.stats.botAims++;
  }

  // kacis: yanan fitilin deposundan ve tutusmus sandiktan uzaga; tehlikeye yurume; rakip yakinken sandigin dibinde durma
  botSteer(b, mx, mz) {
    const p = b.mover.pos;
    let fx = 0, fz = 0, flee = false;
    for (const d of this.depots) {
      if (!this._depotHot(d)) continue;
      const dx = p.x - d.c[0], dz = p.z - d.c[2], dd = Math.hypot(dx, dz);
      if (dd < DEPOT_R + 3) { fx += dx / (dd + 0.1) * 2; fz += dz / (dd + 0.1) * 2; flee = true; }
    }
    for (const c of this.crates) {
      if (c.st !== 1 && c.st !== 3) continue;
      const dx = p.x - c.cx, dz = p.z - c.cz, dd = Math.hypot(dx, dz);
      if (dd < CRATE_R + 0.7 && Math.abs(c.cy - p.y - 0.9) < 3) { fx += dx / (dd + 0.1); fz += dz / (dd + 0.1); flee = true; }
    }
    if (flee) { const l = Math.hypot(fx, fz) || 1; return [fx / l, fz / l, true]; }
    if ((mx || mz) && this.dangerAt(p.x + mx * 1.8, p.y, p.z + mz * 1.8)) return [0, 0, false];
    if (b.target && b.mode === 'engage') {
      let ax = 0, az = 0;
      for (const c of this.crates) {
        if (c.st !== 0) continue;
        const dx = p.x - c.cx, dz = p.z - c.cz, dd = Math.hypot(dx, dz);
        if (dd < 2.6 && Math.abs(c.cy - p.y - 0.5) < 1.5) { ax += dx / (dd + 0.1) * (2.6 - dd); az += dz / (dd + 0.1) * (2.6 - dd); }
      }
      if (ax || az) { const l = Math.hypot(ax, az); return [mx * 0.4 + ax / l, mz * 0.4 + az / l, false]; }
    }
    return null;
  }

  // atis kendi zincirini baslatir mi: 4.5 m icindeki sandiga isabet ya da roket / plazma patlamasi bize yakin sandigin dibinde
  shotUnsafe(b, e, d, W) {
    if (!this.game.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, 60, _hit)) return false;
    const p = b.mover.pos;
    if (isCrateMat(_hit.mat)) {
      if (_hit.dist < 4.5) return true;
      const c = this._crateAtVoxel(_hit.x, _hit.y, _hit.z);
      if (c && !this._clusterSafe(c, p)) return true;
    }
    if (W.id === 'rocket' || W.id === 'plasma') {
      const hx = e.x + d.x * _hit.dist, hy = e.y + d.y * _hit.dist, hz = e.z + d.z * _hit.dist, R = W.id === 'rocket' ? 3.5 : 0.6;
      for (const c of this.crates) if (c.st === 0 && this._boxDist(c, hx, hy, hz) < R && Math.hypot(c.cx - p.x, c.cy - p.y - 0.9, c.cz - p.z) < 5.5) return true;
    }
    return false;
  }
}

const _dir = [0, 0, 0];
function rdir(out) {
  const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  out[0] = s * Math.cos(th); out[1] = u; out[2] = s * Math.sin(th);
  return out;
}
