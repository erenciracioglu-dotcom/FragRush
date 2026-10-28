// Ay Ussu haritasi ortami ve kurallari:
//  - Gokyuzu: siyah, keskin yildizlar, soluk Samanyolu, kucuk beyaz Gunes; gokte yarisi aydinlik Dunya (uretilen
//    okyanus / kara / bulut / kutup buzu, atmosfer haresi, gece yuzunde sehir isiklari). Ortam haritasi ayni
//    gokten (alt yarida gri regolit yansimasi).
//  - Basincli hacimler (world/moon.js volumes): kabugunda disari acilan delik olunca hava kacar. Birkac saniye
//    boyunca icerideki aktorler, ogeler, enkaz ve duman en yakin delige dogru emilir; delikten gecen disari
//    firlatilir (bir kez vakum hasari, hizla carparsa carpma hasari). Delmeden sonraki 6 sn icinde bu yollardan
//    olenler kubbeyi delene yazilir (UZAYA FIRLATTIN!). Delik ~25 sn sonra kopukle kapanir, hacim yeniden basinclanir.
//  - Kapilardaki kuvvet alani zarlari (cizim), alarm (kirmizi yanip sonen isik + korna), buhar ve buz kristalleri.
//  - Vakum: hacimlerin disinda duman yukselmez (toz balistik duser), dinleyici disaridaysa sesler bogulur.
import * as THREE from 'three';
import { VS, GRAVITY, GRAVITY0 } from '../config.js';
import { M, MAT_SOUND } from '../world/materials.js';
import { t } from '../i18n.js';

// gunes / Dunya yonu (derece) ve isik ayarlari (game.js applyEnvironment)
export const MOON_ENV = {
  sunElev: 13, sunAzim: 236, earthElev: 33, earthAzim: 334, earthR: 0.085,
  sun: 0xfff4e8, sunIntensity: 4.2,
  hemiSky: 0x8aa6d8, hemiGround: 0x4a4744, hemi: 0.42,
  fog: 0x05060a, fogDensity: 0.0016, envIntensity: 0.55,
};
// ufuktaki alcak gri tepeler (environments.js createHills paleti)
export const MOON_HILLS = { near: 0x77746f, far: 0x4c4a47, rock: 0x5e5b57 };
export const SPACED_CREDIT = 6;        // s: delmeden sonra bu sure icinde olen delene yazilir
const VENT_TIME = 3.6;                 // s: hava kacisi (emme) suresi
const PATCH_TIME = 25;                 // s: kopuk yama
const VACUUM_DMG = 35;                 // delikten gecerken bir kez
const _v = new THREE.Vector3();

export function moonDirs() {
  const d = THREE.MathUtils.degToRad;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, d(90 - MOON_ENV.sunElev), d(MOON_ENV.sunAzim));
  const earth = new THREE.Vector3().setFromSphericalCoords(1, d(90 - MOON_ENV.earthElev), d(MOON_ENV.earthAzim));
  return { sun, earth };
}

// ---------------------------------------------------------------- gokyuzu
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
uniform vec3 uEarth;
uniform float uEarthR;
uniform float uEnv;     // ortam haritasi: alt yari gri zemin, parlak noktalar yumusak
varying vec3 vDir;
float mHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float mNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mHash(i), mHash(i + vec3(1, 0, 0)), f.x), mix(mHash(i + vec3(0, 1, 0)), mHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(mHash(i + vec3(0, 0, 1)), mHash(i + vec3(1, 0, 1)), f.x), mix(mHash(i + vec3(0, 1, 1)), mHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float mFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * mNoise(p); p = p * 2.07 + 7.3; a *= 0.5; } return s; }
// yildiz katmani: yonu hucrelere bol, her hucrede olasilikla bir yildiz
float stars(vec3 d, float scale, float dens, float size) {
  vec3 p = d * scale;
  vec3 i = floor(p);
  float h = mHash(i);
  if (h < 1.0 - dens) return 0.0;
  vec3 o = vec3(mHash(i + 1.7), mHash(i + 3.1), mHash(i + 5.3)) * 0.6 + 0.2;
  float r = length(p - i - o);
  return smoothstep(size, 0.0, r) * (0.4 + 0.6 * mHash(i + 9.1));
}
vec3 earth(vec3 d, out float cover) {
  cover = 0.0;
  vec3 E = normalize(uEarth);
  float ca = dot(d, E);
  float sr = sin(uEarthR);
  if (ca < cos(uEarthR * 1.12)) return vec3(0.0);
  vec3 rt = normalize(cross(E, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, E);
  vec2 q = vec2(dot(d, rt), dot(d, up)) / sr;
  float r2 = dot(q, q);
  vec3 S = normalize(uSun);
  if (r2 > 1.0) {
    // atmosfer haresi (yalniz aydinlik kenarda)
    float rr = sqrt(r2);
    vec3 n = normalize(q.x * rt + q.y * up);
    float lit = clamp(dot(n, S) * 1.4 + 0.25, 0.0, 1.0);
    float halo = exp(-(rr - 1.0) * 26.0) * lit;
    cover = halo * 0.6;
    return vec3(0.25, 0.5, 1.0) * halo * 0.9;
  }
  cover = 1.0;
  float z = sqrt(1.0 - r2);
  vec3 n = normalize(q.x * rt + q.y * up - z * E);
  float lit = dot(n, S);
  // yuzey: Dunya'nin kendi ekseni etrafinda yavas donus
  float a = uTime * 0.012;
  vec3 axis = normalize(vec3(0.2, 1.0, 0.1));
  vec3 rp = n * cos(a) + cross(axis, n) * sin(a) + axis * dot(axis, n) * (1.0 - cos(a));
  float land = mFbm(rp * 2.6 + 3.0);
  float lat = abs(dot(rp, axis));
  vec3 ocean = mix(vec3(0.01, 0.05, 0.16), vec3(0.03, 0.11, 0.3), mNoise(rp * 9.0));
  vec3 ground = mix(vec3(0.12, 0.2, 0.07), vec3(0.35, 0.28, 0.16), smoothstep(0.55, 0.7, mFbm(rp * 6.0 + 11.0)));
  float isLand = smoothstep(0.5, 0.53, land);
  vec3 col = mix(ocean, ground, isLand);
  col = mix(col, vec3(0.85, 0.9, 0.95), smoothstep(0.82, 0.9, lat));
  float cl = smoothstep(0.52, 0.72, mFbm(rp * 4.0 + vec3(uTime * 0.004, 0.0, 0.0) + 21.0));
  col = mix(col, vec3(0.92, 0.94, 0.97), cl * 0.85);
  float day = smoothstep(-0.06, 0.12, lit);
  vec3 c = col * (0.15 + 1.6 * max(lit, 0.0)) * day;
  // gece yuzu: sehir isiklari, ince yeryuzu isigi
  float city = step(0.86, mHash(floor(rp * 70.0))) * isLand * (1.0 - cl) * (1.0 - day);
  c += vec3(1.0, 0.65, 0.25) * city * 0.45 + col * 0.012 * (1.0 - day);
  // atmosfer kenari: mavi
  c += vec3(0.25, 0.5, 1.0) * pow(1.0 - z, 3.0) * clamp(lit + 0.3, 0.0, 1.0) * 0.8;
  return c;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = vec3(0.0006, 0.0008, 0.0014);
  // Samanyolu: buyuk bir cember boyunca soluk, puturlu bant ve daha sik yildiz
  vec3 mw = normalize(vec3(0.35, 0.62, -0.7));
  float band = exp(-pow(dot(d, mw) / 0.2, 2.0));
  float dust = mFbm(d * 6.0 + 2.0);
  col += vec3(0.05, 0.05, 0.065) * band * smoothstep(0.35, 0.8, dust) * (1.0 - uEnv * 0.6);
  // yildizlar: uc katman (az sayida parlak, cok sayida soluk); bantta daha sik
  float s = stars(d, 180.0, 0.006 + band * 0.012, 0.32) * 1.3 + stars(d, 320.0, 0.01 + band * 0.03, 0.3) * 0.5 + stars(d, 90.0, 0.0025, 0.28) * 2.6;
  vec3 sc = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), mHash(floor(d * 180.0) + 4.0));
  col += sc * s * (1.0 - uEnv * 0.85);
  // Gunes: kucuk, keskin, beyaz disk + ince korona (atmosfer yok)
  vec3 S = normalize(uSun);
  float sd = max(dot(d, S), 0.0);
  col += vec3(1.0, 0.97, 0.92) * (smoothstep(0.99985, 0.99992, sd) * 40.0 * (1.0 - uEnv * 0.9) + pow(sd, 900.0) * 3.0 + pow(sd, 60.0) * 0.06);
  // Dunya
  float cover;
  vec3 ec = earth(d, cover);
  col = mix(col, ec, clamp(cover, 0.0, 1.0)) + (cover < 1.0 ? ec * (1.0 - cover) : vec3(0.0));
  // ufkun alti: ortam haritasinda gri regolit (gunesle aydinlanan zeminin yansimasi), gokte siyah
  if (h < 0.0) col = mix(col, vec3(0.05, 0.048, 0.045) * uEnv + vec3(0.002), smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createMoonSky() {
  const { sun, earth } = moonDirs();
  const uniforms = { uTime: { value: 0 }, uSun: { value: sun }, uEarth: { value: earth }, uEarthR: { value: MOON_ENV.earthR }, uEnv: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'moonSky';
  mesh.visible = false;
  return { mesh, uniforms };
}

// gokyuzunden ortam haritasi (PMREM): metal ve cam yansimalari
export function createMoonEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = createMoonSky();
  sky.uniforms.uEnv.value = 1;
  sky.mesh.visible = true;
  sky.mesh.material.depthTest = true;
  s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose();
  sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- kuvvet alani zari
const MEMB_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const MEMB_FS = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uAlarm;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vec2 e = min(vUv, 1.0 - vUv);
  float edge = 1.0 - smoothstep(0.0, 0.06, min(e.x, e.y));
  float scan = 0.5 + 0.5 * sin(vW.y * 18.0 - uTime * 4.0);
  float hex = 0.5 + 0.5 * sin((vW.x + vW.z) * 9.0 + sin(vW.y * 7.0 + uTime) * 1.5);
  float flick = uAlarm > 0.5 ? 0.55 + 0.45 * step(0.5, fract(uTime * 3.0)) : 1.0;
  float a = (0.07 + 0.08 * scan * hex + edge * 0.5) * flick;
  vec3 c = mix(uColor, vec3(1.0, 0.18, 0.1), uAlarm) * (1.2 + edge * 2.5);
  gl_FragColor = vec4(c * a, a);
}`;

function createMembrane(door) {
  const geo = new THREE.PlaneGeometry(door.w, door.h);
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.35, 0.8, 1.3) }, uAlarm: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: MEMB_VS, fragmentShader: MEMB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(door.x, door.y, door.z);
  mesh.rotation.y = Math.atan2(door.nx, door.nz);
  mesh.renderOrder = 6;
  mesh.name = 'membrane';
  return { mesh, uniforms, door };
}

// ---------------------------------------------------------------- sistem
const rnd = (a, b) => a + Math.random() * (b - a);
const C_VAP0 = [0.85, 0.9, 0.95, 0.3], C_VAP1 = [0.72, 0.76, 0.82, 0];
const C_ICE0 = [2.2, 2.6, 3.2, 1], C_ICE1 = [0.5, 0.7, 1.0, 0];
const C_FOAM0 = [0.95, 0.86, 0.52, 0.75], C_FOAM1 = [0.85, 0.78, 0.55, 0];
const C_FOG0 = [0.78, 0.82, 0.88, 0.14], C_FOG1 = [0.74, 0.78, 0.84, 0];
const INF = 65535;
const FLOW_K = 1.4;                       // 1/s: govde akis hizina bu katsayiyla yaklasir (dururken delikte ~36 m/s2)
const FLOW_U0 = 20, FLOW_U1 = 6, FLOW_L = 5; // akis hizi (m/s): delikte U0+U1; U0 payi her L metrede e-katina iner
const LIFT_ACC = 13;                      // yatay emme ivmesi bunu asinca yerdeki govde havalanir (surtunme tutmaz)
const EJECT_KICK = 5;                     // m/s: delikten cikana disari ek itme
const IMPACT_V = 7, IMPACT_K = 6;         // hizla carpma: (bir karedeki hiz kaybi - 7) * 6 hasar
const BURST_R = 1.6, BURST_DELAY = 0.16;  // cam panel basinca dayanamaz: delik cevresindeki cam (m) kisa gecikmeyle patlar (govde gecebilsin)
const _dir = new THREE.Vector3();

export class MoonSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.vols = [];
    this.membranes = [];
    this.group = new THREE.Group();
    this.group.name = 'moon';
    game.scene.add(this.group);
    this.time = 0;
    this.listenerIn = null;
    this.beepT = 3;
    this.queue = null;       // sel doldurma kuyrugu (hacimler arasi paylasilan)
    this.mark = null;
    this._noBurst = false;
    this.stats = { breaches: 0, ejected: 0, patches: 0, bursts: 0, fieldMs: 0 };
  }

  // arena: world/moon.js generateMoon ciktisi
  setup(arena) {
    this.disable();
    const game = this.game, m = arena.moon;
    let maxN = 0;
    this.vols = m.volumes.map((v) => {
      const L = v.light >= 0 ? game.staticLights[v.light] || null : null;
      maxN = Math.max(maxN, v.nx * v.ny * v.nz);
      return {
        ...v, nxz: v.nx * v.nz, state: 'sealed', t: 0, ventTime: 2.6 + 1.2 * Math.min(1, v.interior / 50000),
        by: null, byT: -100, holes: [], vents: [], bursts: [], patchT: 0, dist: null, fieldDirty: false, alarmT: 0, fogAcc: 0,
        L, lightColor: L ? L.light.color.clone() : null,
      };
    });
    if (!this.queue || this.queue.length < maxN) { this.queue = new Int32Array(maxN); this.mark = new Uint8Array(maxN); }
    for (const d of m.doors) {
      const mb = createMembrane(d);
      mb.vols = d.vols.map((i) => this.vols[i]);
      this.membranes.push(mb);
      this.group.add(mb.mesh);
    }
    this.group.visible = true;
    this.listenerIn = null;
    this.stats = { breaches: 0, ejected: 0, patches: 0, bursts: 0, fieldMs: 0 };
    this.active = true;
  }

  disable() {
    for (const v of this.vols) this._alarmOff(v);
    this.active = false;
    for (const mb of this.membranes) { this.group.remove(mb.mesh); mb.mesh.geometry.dispose(); mb.mesh.material.dispose(); }
    this.membranes = [];
    this.vols = [];
    this.group.visible = false;
    const au = this.game.audio;
    if (au && au.setVacuum) au.setVacuum(false);
    if (au && au.stopBaseAmbience) au.stopBaseAmbience();
    this.listenerIn = null;
  }

  // ---- sorgular
  // dunya noktasi (m) hangi hacmin icinde (sinif 1): hacim ya da null
  volAt(x, y, z) {
    const X = Math.floor(x / VS), Y = Math.floor(y / VS), Z = Math.floor(z / VS);
    for (const v of this.vols) {
      const lx = X - v.x0, ly = Y - v.y0, lz = Z - v.z0;
      if (lx < 0 || ly < 0 || lz < 0 || lx >= v.nx || ly >= v.ny || lz >= v.nz) continue;
      if (v.cls[lx + v.nx * (lz + v.nz * ly)] === 1) return v;
    }
    return null;
  }
  // nokta basincli (hava var) mi: kapali ya da hala bosalan hacmin ici
  pressurized(x, y, z) { const v = this.volAt(x, y, z); return !!v && v.state !== 'vacuum'; }
  // vakum (parcaciklar, ses): hacimlerin disi ya da bosalmis hacim
  vacuum(x, y, z) { return !this.pressurized(x, y, z); }
  // bosalan bir hacmin hava akisindaki nokta: akis hizi (m/s, yoksa 0), out: akis yonu (botlar kacmak icin)
  flowAt(x, y, z, out) {
    if (!this.active) return 0;
    for (const v of this.vols) {
      if (v.state !== 'venting' || !v.dist) continue;
      const d = this._flow(v, x, y, z, out);
      if (d >= 0) return this._flowSpeed(v, d);
    }
    return 0;
  }
  // nokta (genelde aktorun ici) kapali (basincli) bir hacimde mi: o hacim, yoksa null
  sealedVolAt(x, y, z) { const v = this.volAt(x, y, z); return v && v.state === 'sealed' ? v : null; }

  // ---- delik algilama (destruction.blast / detach): kaldirilan voxellerden ice degen kati olanlardan dis
  // havaya (uretimde dis hava ya da kutunun kenari) kaldirilmis voxeller uzerinden yol var mi
  onRemoved(list, n, source) {
    if (!this.active || n <= 0) return;
    const w = this.game.world, sx = w.sx, sxz = w.sxz, mat = w.mat;
    for (const v of this.vols) {
      const found = [];
      let cand = 0;
      for (let k = 0; k < n && cand < 96; k++) {
        const i = list[k];
        if (mat[i]) continue;
        const y = (i / sxz) | 0, rem = i - y * sxz, z = (rem / sx) | 0, x = rem - z * sx;
        const lx = x - v.x0, ly = y - v.y0, lz = z - v.z0;
        if (lx < 1 || ly < 1 || lz < 1 || lx >= v.nx - 1 || ly >= v.ny - 1 || lz >= v.nz - 1) continue;
        const li = lx + v.nx * (lz + v.nz * ly);
        if (v.cls[li] !== 3) continue;
        cand++;
        if (found.some((h) => Math.abs(h[0] - x) + Math.abs(h[1] - y) + Math.abs(h[2] - z) < 3)) continue;
        if (this._leakFrom(v, li, mat)) found.push([x, y, z]);
      }
      if (found.length) this._breach(v, found, source);
    }
  }

  // li (hacim kutusunda, simdi bos ve ice degen) noktasindan dis havaya bos voxellerden gecen yol var mi
  _leakFrom(v, li0, mat) {
    const w = this.game.world, cls = v.cls, nx = v.nx, nxz = v.nxz;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    const st = [li0];
    seen.add(li0);
    let steps = 0;
    while (st.length && steps < 2500) {
      const li = st.pop();
      steps++;
      const ly = (li / nxz) | 0, rem = li - ly * nxz, lz = (rem / nx) | 0, lx = rem - lz * nx;
      if (lx === 0 || ly === 0 || lz === 0 || lx === nx - 1 || ly === v.ny - 1 || lz === v.nz - 1) return true;
      for (const d of [-1, 1, -nx, nx, -nxz, nxz]) {
        const n = li + d;
        if (seen.has(n)) continue;
        const c = cls[n];
        if (c === 2) {
          const ny = (n / nxz) | 0, r2 = n - ny * nxz, nz = (r2 / nx) | 0, nnx = r2 - nz * nx;
          if (!mat[(nnx + v.x0) + w.sx * ((nz + v.z0) + w.sz * (ny + v.y0))]) return true;
          continue;
        }
        if (c !== 0 && c !== 3) continue;      // ic hava, zar, baska hacim: gecilmez
        const ny = (n / nxz) | 0, r2 = n - ny * nxz, nz = (r2 / nx) | 0, nnx = r2 - nz * nx;
        if (mat[(nnx + v.x0) + w.sx * ((nz + v.z0) + w.sz * (ny + v.y0))]) continue;
        seen.add(n); st.push(n);
      }
    }
    return false;
  }

  _breach(v, found, source) {
    const game = this.game, now = game.time;
    for (const [x, y, z] of found) {
      const h = { li: (x - v.x0) + v.nx * ((z - v.z0) + v.nz * (y - v.y0)), x: (x + 0.5) * VS, y: (y + 0.5) * VS, z: (z + 0.5) * VS, ox: 0, oy: 0, oz: 0, t: now, acc: Math.random() };
      this._holeNormal(v, x - v.x0, y - v.y0, z - v.z0, h);
      v.holes.push(h);
      // cam panel: delik kisa gecikmeyle genisler (bir kez; patlamanin actigi delikler yeniden patlatmaz)
      if (!this._noBurst && v.state !== 'vacuum' && !v.bursts.some((b) => Math.hypot(b.h.x - h.x, b.h.y - h.y, b.h.z - h.z) < 2.2) &&
        this._glassNear(h.x, h.y, h.z, BURST_R) >= 4) v.bursts.push({ h, t: now + BURST_DELAY, src: source });
    }
    if (v.holes.length > 24) v.holes.splice(0, v.holes.length - 24);
    // agiz merkezi (dogrudan delinen nokta; patlayan panelin ortasi): yakindaki govde ona yonelir, kenara takilmaz
    if (!this._noBurst) { v.vents.push(v.holes[v.holes.length - 1]); if (v.vents.length > 8) v.vents.shift(); }
    v.fieldDirty = true;
    if (v.state === 'sealed') {
      v.state = 'venting'; v.t = 0; v.by = source; v.byT = now; v.patchT = 0; v.alarmT = 0;
      for (const mb of this.membranes) if (mb.vols.includes(v)) mb.uniforms.uAlarm.value = 1;
      const h = v.holes[v.holes.length - 1];
      if (game.audio) game.audio.play('airLeak', h.x, h.y, h.z, 1.4);
      game.fx.addShake(0.5, h.x, h.y, h.z);
      const p = game.player;
      if (game.hud && game.state === 'playing' && p.alive && this.volAt(p.mover.pos.x, p.mover.pos.y + 0.9, p.mover.pos.z) === v) game.hud.centerMsg(t('hullBreach'), 2.2);
      game.logEvent('breach ' + v.name + ' ' + (source ? source.name : '-'));
      this.stats.breaches++;
    } else if (v.state === 'vacuum') v.patchT = Math.min(v.patchT, PATCH_TIME - 6);
  }

  // deligin disa bakan normali: cevresindeki ic hava (1) ve dis hava (2) hucrelerinin dengesi
  _holeNormal(v, lx, ly, lz, h) {
    let nx = 0, ny = 0, nz = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = lx + dx, y = ly + dy, z = lz + dz;
      if (x < 0 || y < 0 || z < 0 || x >= v.nx || y >= v.ny || z >= v.nz) continue;
      const c = v.cls[x + v.nx * (z + v.nz * y)];
      const s = c === 1 ? -1 : c === 2 ? 1 : 0;
      if (s) { nx += dx * s; ny += dy * s; nz += dz * s; }
    }
    let l = Math.hypot(nx, ny, nz);
    if (l < 1e-3) { nx = h.x - v.c[0]; ny = 0; nz = h.z - v.c[2]; l = Math.hypot(nx, nz) || 1; }
    h.ox = nx / l; h.oy = ny / l; h.oz = nz / l;
  }

  _glassNear(x, y, z, r) {
    const w = this.game.world, R = r / VS, cx = x / VS, cy = y / VS, cz = z / VS;
    let n = 0;
    for (let Y = Math.floor(cy - R); Y <= cy + R; Y++) for (let Z = Math.floor(cz - R); Z <= cz + R; Z++) for (let X = Math.floor(cx - R); X <= cx + R; X++) {
      const dx = X + 0.5 - cx, dy = Y + 0.5 - cy, dz = Z + 0.5 - cz;
      if (dx * dx + dy * dy + dz * dz <= R * R && w.get(X, Y, Z) === M.GLASS) n++;
    }
    return n;
  }

  // cam panelin patlamasi: deligin cevresindeki cam voxelleri disari sacilir (govde gecebilecek kadar delik)
  _burst(v, b) {
    const game = this.game, w = game.world, h = b.h, R = BURST_R / VS;
    const cx = h.x / VS, cy = h.y / VS, cz = h.z / VS;
    const list = [];
    for (let Y = Math.floor(cy - R); Y <= cy + R; Y++) for (let Z = Math.floor(cz - R); Z <= cz + R; Z++) for (let X = Math.floor(cx - R); X <= cx + R; X++) {
      const dx = X + 0.5 - cx, dy = Y + 0.5 - cy, dz = Z + 0.5 - cz;
      if (dx * dx + dy * dy + dz * dz <= R * R * (0.8 + 0.4 * Math.random()) && w.get(X, Y, Z) === M.GLASS) list.push(w.idx(X, Y, Z));
    }
    if (!list.length) return;
    const idx = Int32Array.from(list), n = idx.length;
    const mats = new Uint8Array(n).fill(M.GLASS);
    w.removeIndices(idx);
    game.fx.voxelDebris(w, idx, mats, n, h.x - h.ox * 1.4, h.y - h.oy * 1.4, h.z - h.oz * 1.4, 8, 140);
    // patlayan panelin kenarinda dayanaksiz kalan parcalar kopar (butunluk denetimi)
    const r = Math.ceil(R) + 1;
    w.seedRegion(Math.floor(cx) - r, Math.floor(cy) - r, Math.floor(cz) - r, Math.floor(cx) + r, Math.floor(cy) + r, Math.floor(cz) + r);
    game.destruction.integrityPending = true;
    if (game.audio) game.audio.play('glassBurst', h.x, h.y, h.z, 1.3);
    game.fx.addShake(0.35, h.x, h.y, h.z);
    this.stats.bursts++;
    this._noBurst = true;
    this.onRemoved(idx, n, b.src);
    this._noBurst = false;
  }

  // ---- hava akisi: deliklerden ice dogru sel doldurma (ic hava ve kaldirilmis kabuk hucreleri). Akis yonu
  // mesafenin azaldigi yon; boylece govde mobilyanin etrafindan dolasarak delige gider.
  _buildField(v) {
    const t0 = performance.now();
    const n = v.nx * v.ny * v.nz;
    if (!v.dist) v.dist = new Uint16Array(n);
    const dist = v.dist, cls = v.cls, nx = v.nx, ny = v.ny, nz = v.nz, nxz = v.nxz;
    const w = this.game.world, mat = w.mat, sx = w.sx, sxz = w.sxz;
    dist.fill(INF);
    const q = this.queue;
    let qh = 0, qt = 0;
    for (const h of v.holes) {
      const li = h.li;
      const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
      if (dist[li] === INF && !mat[(lx + v.x0) + sx * (lz + v.z0) + sxz * (ly + v.y0)]) { dist[li] = 0; q[qt++] = li; }
    }
    while (qh < qt) {
      const li = q[qh++];
      const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
      if (lx === 0 || ly === 0 || lz === 0 || lx === nx - 1 || ly === ny - 1 || lz === nz - 1) continue;
      const d1 = dist[li] + 1, wi = (lx + v.x0) + sx * (lz + v.z0) + sxz * (ly + v.y0);
      let j, c;
      j = li - 1; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi - 1]) { dist[j] = d1; q[qt++] = j; } }
      j = li + 1; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi + 1]) { dist[j] = d1; q[qt++] = j; } }
      j = li - nx; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi - sx]) { dist[j] = d1; q[qt++] = j; } }
      j = li + nx; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi + sx]) { dist[j] = d1; q[qt++] = j; } }
      j = li - nxz; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi - sxz]) { dist[j] = d1; q[qt++] = j; } }
      j = li + nxz; if (dist[j] === INF) { c = cls[j]; if ((c === 1 || c === 3) && !mat[wi + sxz]) { dist[j] = d1; q[qt++] = j; } }
    }
    v.fieldCells = qt;
    this.stats.fieldMs = Math.max(this.stats.fieldMs, performance.now() - t0);
  }

  // noktada akis: deliklere yol mesafesi (voxel, alan disinda -1), out: akis yonu (birim)
  _flow(v, x, y, z, out) {
    const dist = v.dist;
    if (!dist) return -1;
    const X = Math.floor(x / VS) - v.x0, Y = Math.floor(y / VS) - v.y0, Z = Math.floor(z / VS) - v.z0;
    if (X < 2 || Y < 2 || Z < 2 || X >= v.nx - 2 || Y >= v.ny - 2 || Z >= v.nz - 2) return -1;
    const nx = v.nx, nxz = v.nxz, li = X + nx * Z + nxz * Y;
    const d0 = dist[li];
    if (d0 === INF) return -1;
    let gx = 0, gy = 0, gz = 0, a, b;
    for (let k = 1; k <= 2; k++) {
      a = dist[li - k]; b = dist[li + k]; gx += ((a === INF ? d0 : a) - (b === INF ? d0 : b)) / k;
      a = dist[li - k * nxz]; b = dist[li + k * nxz]; gy += ((a === INF ? d0 : a) - (b === INF ? d0 : b)) / k;
      a = dist[li - k * nx]; b = dist[li + k * nx]; gz += ((a === INF ? d0 : a) - (b === INF ? d0 : b)) / k;
    }
    let l = Math.hypot(gx, gy, gz);
    // agza yakin (2.5 m): agzin ortasina yonel (govde kenara takilmasin); agzi gectiyse disa
    if (d0 * VS < 2.5 && v.vents.length) {
      let best = null, bd = 1e9;
      for (const h of v.vents) { const dd = (h.x - x) ** 2 + (h.y - y) ** 2 + (h.z - z) ** 2; if (dd < bd) { bd = dd; best = h; } }
      if (bd < 9) {
        const dx = best.x - x, dy = best.y - y, dz = best.z - z;
        if (-(dx * best.ox + dy * best.oy + dz * best.oz) > -0.15) { out.set(best.ox, best.oy, best.oz); return d0; }
        const k = 1 - d0 * VS / 2.5, s = 1 / (Math.sqrt(bd) + 1e-6), g = l > 1e-4 ? (1 - k) / l : 0;
        gx = gx * g + dx * s * k; gy = gy * g + dy * s * k; gz = gz * g + dz * s * k;
        l = Math.hypot(gx, gy, gz);
      }
    }
    if (l > 1e-4) { out.set(gx / l, gy / l, gz / l); return d0; }
    // duz bolge: en yakin delige dogrudan
    let best = null, bd = 1e9;
    for (const h of v.holes) { const dd = (h.x - x) ** 2 + (h.y - y) ** 2 + (h.z - z) ** 2; if (dd < bd) { bd = dd; best = h; } }
    if (!best) return -1;
    if (bd < 0.01) out.set(best.ox, best.oy, best.oz);
    else { const s = 1 / Math.sqrt(bd); out.set((best.x - x) * s, (best.y - y) * s, (best.z - z) * s); }
    return d0;
  }

  // icerdeki basinc payi (bosalma boyunca 1 -> 0)
  _press(v) { const k = 1 - v.t / v.ventTime; return k <= 0 ? 0 : Math.pow(k, 0.6); }
  _flowSpeed(v, d) { return (FLOW_U0 * Math.exp(-d * VS / FLOW_L) + FLOW_U1) * this._press(v); }

  // ---- aktor basina (game.js, canliysa): carpma hasari, emme, delikten firlatma
  actorTick(a, dt) {
    if (!this.active) return;
    const game = this.game, m = a.mover, p = m.pos, vel = m.vel, now = game.time;
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    // hizla carpma (emilen / firlatilan; delmeden sonraki SPACED_CREDIT sn icinde)
    if (now - a.spaceT0 < SPACED_CREDIT) {
      const drop = (a.pvSpeed || 0) - sp;
      if (drop > IMPACT_V) {
        if (game.audio) game.audio.play('land', p.x, p.y, p.z, 1.6, a.isPlayer);
        game.fx.dustPuff(p.x, p.y, p.z, 1.2);
        this._spaceHit(a, (drop - IMPACT_V) * IMPACT_K, false);
        if (!a.alive) return;
      }
    }
    const cy = p.y + m.h * 0.5;
    for (const v of this.vols) {
      if (v.state !== 'venting' || !v.dist) continue;
      const d = this._flow(v, p.x, cy, p.z, _dir);
      if (d < 0) {
        // az once akistaydi, simdi dis havada: delikten firladi
        if (a.ventV === v && now - a.ventT < 0.4 && this._outside(v, p.x, cy, p.z)) this._eject(a, v);
        continue;
      }
      if (a.spaceT0 !== v.byT) { a.spaceT0 = v.byT; a.spaceBy = v.by; a.spaceEjected = false; }
      a.ventV = v; a.ventT = now;
      const U = this._flowSpeed(v, d);
      const along = vel.x * _dir.x + vel.y * _dir.y + vel.z * _dir.z;
      const acc = FLOW_K * Math.max(0, U - along);
      vel.x += _dir.x * acc * dt; vel.y += _dir.y * acc * dt; vel.z += _dir.z * acc * dt;
      // guclu akista yerdeki govde havalanir (surtunme tutmaz, akis tasir)
      if (m.onGround && acc * Math.hypot(_dir.x, _dir.z) > LIFT_ACC) { vel.y = Math.max(vel.y, 1.6); m.onGround = false; m.groundTime = 1; }
      if (a.isPlayer && game.hud && game.state === 'playing' && now - (this._warnT || -9) > 2.5) { this._warnT = now; game.hud.subMsg(t('ventWarn'), 1.6); }
      break;
    }
    a.pvSpeed = Math.hypot(vel.x, vel.y, vel.z);
  }

  // hacmin disinda (dis hava ya da kutu disi) mi
  _outside(v, x, y, z) {
    const X = Math.floor(x / VS) - v.x0, Y = Math.floor(y / VS) - v.y0, Z = Math.floor(z / VS) - v.z0;
    if (X < 0 || Y < 0 || Z < 0 || X >= v.nx || Y >= v.ny || Z >= v.nz) return true;
    return v.cls[X + v.nx * (Z + v.nz * Y)] === 2;
  }

  _eject(a, v) {
    if (a.spaceEjected) return;
    a.spaceEjected = true;
    const game = this.game, m = a.mover, p = m.pos;
    let best = v.holes[0], bd = 1e9;
    for (const h of v.holes) { const dd = (h.x - p.x) ** 2 + (h.y - p.y - 0.9) ** 2 + (h.z - p.z) ** 2; if (dd < bd) { bd = dd; best = h; } }
    const ox = best ? best.ox : 0, oy = best ? best.oy : 0, oz = best ? best.oz : 0;
    m.vel.x += ox * EJECT_KICK; m.vel.y += 2.2 + Math.max(0, oy) * EJECT_KICK; m.vel.z += oz * EJECT_KICK;
    m.onGround = false; m.groundTime = 1;
    a.pvSpeed = Math.hypot(m.vel.x, m.vel.y, m.vel.z);
    for (let i = 0; i < 14 * game.fx.pm; i++) {
      const s = rnd(2, 7);
      game.fx.smoke.emit(p.x, p.y + 0.9, p.z, m.vel.x * 0.4 + rnd(-1, 1) * s * 0.3, m.vel.y * 0.4 + rnd(-1, 1) * s * 0.3, m.vel.z * 0.4 + rnd(-1, 1) * s * 0.3, rnd(0.5, 1.0), 0.2, rnd(0.8, 1.4), C_VAP0, C_VAP1, 0.001, 1.6, 0, Math.random() * 6, 0);
    }
    if (game.audio) game.audio.play('whoosh', p.x, p.y + 1, p.z, 1.2, a.isPlayer);
    this.stats.ejected++;
    game.logEvent('spaced ' + a.name + ' ' + (v.by ? v.by.name : '-'));
    this._spaceHit(a, VACUUM_DMG, true);
  }

  // vakum / carpma hasari: oldururse kubbeyi delene yazilir (UZAYA FIRLATTIN). Kendi deldigi kubbede ya da
  // delen belli degilse saldirgan yok: kendini parcalama (-1).
  _spaceHit(a, dmg, vacuum) {
    const by = a.spaceBy;
    const credit = by && by !== a && this.game.actors.includes(by) ? by : null;
    a.takeDamage(dmg, credit, 'spaced', null, false, vacuum);
  }

  update(dt, camera) {
    if (!this.active) return;
    this.time += dt;
    for (const mb of this.membranes) mb.uniforms.uTime.value = this.time;
    if (dt > 0) {
      const now = this.game.time;
      for (const v of this.vols) {
        if (v.bursts.length) {
          for (let i = v.bursts.length - 1; i >= 0; i--) {
            const b = v.bursts[i];
            if (now >= b.t && !b.done) { b.done = true; this._burst(v, b); }
          }
        }
        if (v.state === 'venting') {
          v.t += dt;
          if (v.fieldDirty) { v.fieldDirty = false; this._buildField(v); }
          this._vent(v, dt);
          if (v.t >= v.ventTime) { v.state = 'vacuum'; v.t = 0; v.patchT = 0; this.game.logEvent('vacuum ' + v.name); }
        } else if (v.state === 'vacuum') {
          v.t += dt;
          v.patchT += dt;
          if (v.patchT >= PATCH_TIME) this._patch(v);
        }
        if (v.state !== 'sealed') this._alarm(v, dt);
      }
      this._items(dt);
      this._vacuumSmoke();
    }
    this._listener(camera, dt);
  }

  // bosalma: deliklerden buhar jeti ve buz kristali, icerde yogusma sisi; duman, enkaz ve ogeler emilir
  _vent(v, dt) {
    const fx = this.game.fx, pm = fx.pm, P = this._press(v);
    const nh = Math.min(v.holes.length, 8);
    if (nh && v.dist) {
      const per = (45 * pm * P + 3) / Math.sqrt(nh);
      for (let k = 0; k < nh; k++) {
        const h = v.holes[v.holes.length - 1 - k];
        h.acc += per * dt;
        while (h.acc >= 1) {
          h.acc -= 1;
          const s = rnd(5, 15) * (0.35 + 0.65 * P);
          const jx = h.ox + rnd(-0.45, 0.45), jy = h.oy + rnd(-0.45, 0.45), jz = h.oz + rnd(-0.45, 0.45);
          // jet: hiz yonunde uzayan ince buhar, disarida hizla genisleyip soner
          fx.smoke.emit(h.x + rnd(-0.2, 0.2), h.y + rnd(-0.2, 0.2), h.z + rnd(-0.2, 0.2), jx * s, jy * s, jz * s,
            rnd(0.45, 1.0), rnd(0.1, 0.2), rnd(0.6, 1.3), C_VAP0, C_VAP1, 0.001, 1.4, 0.03, Math.random() * 6, rnd(-1.5, 1.5));
          if (Math.random() < 0.6) fx.add.emit(h.x, h.y, h.z, jx * s * 1.1, jy * s * 1.1, jz * s * 1.1, rnd(0.6, 1.6), 0.03, 0.012, C_ICE0, C_ICE1, GRAVITY0, 0.1, 0.02);
        }
      }
      // yogusma: basinc dusunce icerde ince sis olusur, akisla deliklere suruklenir
      v.fogAcc += 12 * pm * P * dt;
      while (v.fogAcc >= 1) {
        v.fogAcc -= 1;
        const h = v.holes[(Math.random() * v.holes.length) | 0];
        const r = rnd(1.5, 7);
        const x = h.x - h.ox * r + rnd(-3, 3), y = h.y - h.oy * r + rnd(-1.2, 1.5), z = h.z - h.oz * r + rnd(-3, 3);
        if (this._flow(v, x, y, z, _dir) < 0) continue;
        fx.smoke.emit(x, y, z, _dir.x, _dir.y, _dir.z, rnd(1.0, 2.0), 0.3, rnd(1.2, 2.2), C_FOG0, C_FOG1, 0.001, 0.8, 0, Math.random() * 6, rnd(-0.6, 0.6));
      }
    }
    this._suck(v, fx.smoke, dt, 6, false);
    this._suck(v, fx.add, dt, 5, false);
    this._suck(v, fx.debris, dt, 3, true);
  }

  // parcacik / enkaz emme: hacmin kutusundaki ve akistaki her birini akis hizina dogru hizlandir
  _suck(v, S, dt, k, debris) {
    if (!v.dist || !S.count) return;
    const bx0 = v.x0 * VS, by0 = v.y0 * VS, bz0 = v.z0 * VS, bx1 = (v.x0 + v.nx) * VS, by1 = (v.y0 + v.ny) * VS, bz1 = (v.z0 + v.nz) * VS;
    const px = S.px, py = S.py, pz = S.pz, vx = S.vx, vy = S.vy, vz = S.vz;
    for (let i = 0; i < S.count; i++) {
      const x = px[i], y = py[i], z = pz[i];
      if (x < bx0 || x >= bx1 || y < by0 || y >= by1 || z < bz0 || z >= bz1) continue;
      const d = this._flow(v, x, y, z, _dir);
      if (d < 0) continue;
      const U = this._flowSpeed(v, d) * 1.3;
      const along = vx[i] * _dir.x + vy[i] * _dir.y + vz[i] * _dir.z;
      const acc = k * Math.max(0, U - along) * dt;
      vx[i] += _dir.x * acc; vy[i] += _dir.y * acc; vz[i] += _dir.z * acc;
      if (debris) S.rest[i] = 0;
    }
  }

  // ogeler: akistakiler suruklenir, delikten firlayan disarida duser; alinan oge kendi yerinde yeniden belirir
  _items(dt) {
    const game = this.game, w = game.world, items = game.items;
    if (!items) return;
    for (const it of items.list) {
      if (it.hidden) continue;
      if (!it.active) {
        if (it.moonMoved) { it.pos.copy(it.home); it.fallV = 0; it.moonMoved = false; it.mv = null; }
        continue;
      }
      let inF = false;
      for (const v of this.vols) {
        if (v.state !== 'venting' || !v.dist) continue;
        const d = this._flow(v, it.pos.x, it.pos.y + 0.35, it.pos.z, _dir);
        if (d < 0) continue;
        const U = this._flowSpeed(v, d);
        const mv = it.mv || (it.mv = { x: 0, y: 0, z: 0 });
        const along = mv.x * _dir.x + mv.y * _dir.y + mv.z * _dir.z;
        const acc = 2.5 * Math.max(0, U - along) * dt;
        mv.x += _dir.x * acc; mv.y += _dir.y * acc; mv.z += _dir.z * acc;
        inF = true;
        break;
      }
      const mv = it.mv;
      if (!mv) continue;
      it.moonMoved = true;
      const p = it.pos;
      mv.y -= GRAVITY * dt;
      let nx = p.x + mv.x * dt;
      if (w.solidAtWorld(nx, p.y + 0.3, p.z)) { mv.x *= -0.25; nx = p.x; }
      p.x = nx;
      let nz = p.z + mv.z * dt;
      if (w.solidAtWorld(p.x, p.y + 0.3, nz)) { mv.z *= -0.25; nz = p.z; }
      p.z = nz;
      let ny = p.y + mv.y * dt, ground = false;
      if (mv.y <= 0 && w.solidAtWorld(p.x, ny, p.z)) { ny = (Math.floor(ny / VS) + 1) * VS; mv.y = 0; mv.x *= 0.8; mv.z *= 0.8; ground = true; }
      else if (mv.y > 0 && w.solidAtWorld(p.x, ny + 0.6, p.z)) { mv.y = 0; ny = p.y; }
      p.y = Math.max(0.5, ny);
      it.fallV = 0;
      if (!inF && ground && Math.hypot(mv.x, mv.z) < 0.3) it.mv = null;
    }
  }

  // vakumda duman yukselmez, havada asili kalmaz: toz balistik duser ve cabuk biter
  _vacuumSmoke() {
    const s = this.game.fx.smoke;
    for (let i = 0; i < s.count; i++) {
      if (s.grav[i] > 0) continue;            // zaten dusuyor (ya da vakum icin uretildi)
      if (this.pressurized(s.px[i], s.py[i], s.pz[i])) continue;
      s.grav[i] = GRAVITY0;                    // gk ile haritanin yercekimi
      s.drag[i] = Math.min(s.drag[i], 0.3);
      s.ttl[i] = Math.min(s.ttl[i], s.life[i] + 1.3);
    }
  }

  // alarm: hacmin isigi kirmizi yanip soner, bosalirken (ve hemen sonra) korna
  _alarm(v, dt) {
    const L = v.L;
    if (L && L.on) {
      const on = (this.time * 1.7) % 1 < 0.5;
      L.light.color.setRGB(1, 0.1, 0.05);
      L.light.intensity = L.base * (on ? 1.6 : 0.3);
    }
    if (v.state === 'venting' || v.t < 6) {
      v.alarmT -= dt;
      if (v.alarmT <= 0) { v.alarmT = 1.3; const au = this.game.audio; if (au) au.play('alarm', v.c[0], v.c[1] + 1.5, v.c[2], 0.9); }
    }
  }

  _alarmOff(v) {
    const L = v.L;
    if (L && v.lightColor) { L.light.color.copy(v.lightColor); L.light.intensity = L.on ? L.base : 0; }
    for (const mb of this.membranes) if (mb.vols.includes(v)) mb.uniforms.uAlarm.value = mb.vols.some((u) => u !== v && u.state !== 'sealed') ? 1 : 0;
  }

  // kopuk yama: dis havaya kaldirilmis hucrelerle bagli (sizdiran) her kaldirilmis kabuk hucresi (3) kopukle
  // dolar, hacim yeniden basinclanir. Delikte biri duruyorsa beklenir.
  _patch(v) {
    const game = this.game, w = game.world, mat = w.mat, sx = w.sx, sxz = w.sxz;
    const nx = v.nx, ny = v.ny, nz = v.nz, nxz = v.nxz, cls = v.cls;
    const mark = this.mark, q = this.queue;
    mark.fill(0, 0, nx * ny * nz);
    let qt = 0;
    for (let ly = 0; ly < ny; ly++) for (let lz = 0; lz < nz; lz++) {
      let li = nxz * ly + nx * lz, wi = v.x0 + sx * (lz + v.z0) + sxz * (ly + v.y0);
      for (let lx = 0; lx < nx; lx++, li++, wi++) {
        const c = cls[li];
        if ((c !== 0 && c !== 3) || mat[wi]) continue;
        const edge = lx === 0 || ly === 0 || lz === 0 || lx === nx - 1 || ly === ny - 1 || lz === nz - 1;
        if (edge || (cls[li - 1] === 2 && !mat[wi - 1]) || (cls[li + 1] === 2 && !mat[wi + 1]) || (cls[li - nx] === 2 && !mat[wi - sx]) ||
          (cls[li + nx] === 2 && !mat[wi + sx]) || (cls[li - nxz] === 2 && !mat[wi - sxz]) || (cls[li + nxz] === 2 && !mat[wi + sxz])) { mark[li] = 1; q[qt++] = li; }
      }
    }
    let qh = 0;
    while (qh < qt) {
      const li = q[qh++];
      const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
      if (lx === 0 || ly === 0 || lz === 0 || lx === nx - 1 || ly === ny - 1 || lz === nz - 1) continue;
      const wi = (lx + v.x0) + sx * (lz + v.z0) + sxz * (ly + v.y0);
      for (let k = 0; k < 6; k++) {
        const dl = k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -nx : k === 3 ? nx : k === 4 ? -nxz : nxz;
        const dw = k === 0 ? -1 : k === 1 ? 1 : k === 2 ? -sx : k === 3 ? sx : k === 4 ? -sxz : sxz;
        const j = li + dl;
        if (mark[j]) continue;
        const c = cls[j];
        if ((c === 0 || c === 3) && !mat[wi + dw]) { mark[j] = 1; q[qt++] = j; }
      }
    }
    const plug = [];
    for (let k = 0; k < qt; k++) if (cls[q[k]] === 3) plug.push(q[k]);
    // delikte duran biri varsa bekle (kopugun icinde kalmasin)
    for (const a of game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, rr = a.mover.r;
      const X0 = Math.floor((p.x - rr) / VS) - v.x0, X1 = Math.floor((p.x + rr) / VS) - v.x0;
      const Y0 = Math.floor(p.y / VS) - v.y0, Y1 = Math.floor((p.y + a.mover.h) / VS) - v.y0;
      const Z0 = Math.floor((p.z - rr) / VS) - v.z0, Z1 = Math.floor((p.z + rr) / VS) - v.z0;
      for (const li of plug) {
        const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
        if (lx >= X0 && lx <= X1 && ly >= Y0 && ly <= Y1 && lz >= Z0 && lz <= Z1) { v.patchT = PATCH_TIME - 1; return; }
      }
    }
    if (plug.length) {
      const list = new Int32Array(plug.length * 4);
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < plug.length; k++) {
        const li = plug[k];
        const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
        list[k * 4] = lx + v.x0; list[k * 4 + 1] = ly + v.y0; list[k * 4 + 2] = lz + v.z0; list[k * 4 + 3] = M.FOAM;
        cx += lx + v.x0 + 0.5; cy += ly + v.y0 + 0.5; cz += lz + v.z0 + 0.5;
      }
      w.depositMany(list, list.length);
      const fx = game.fx, step = Math.max(1, Math.floor(plug.length / 50));
      for (let k = 0; k < plug.length; k += step) {
        const x = (list[k * 4] + 0.5) * VS, y = (list[k * 4 + 1] + 0.5) * VS, z = (list[k * 4 + 2] + 0.5) * VS;
        fx.smoke.emit(x, y, z, rnd(-0.6, 0.6), rnd(-0.2, 0.6), rnd(-0.6, 0.6), rnd(0.6, 1.2), 0.15, rnd(0.45, 0.8), C_FOAM0, C_FOAM1, 0.001, 2.5, 0, Math.random() * 6, 0);
      }
      const n = plug.length;
      if (game.audio) game.audio.play('foam', cx / n * VS, cy / n * VS, cz / n * VS, 1);
    }
    v.state = 'sealed'; v.t = 0; v.patchT = 0;
    v.holes.length = 0; v.vents.length = 0; v.bursts.length = 0;
    this._alarmOff(v);
    if (game.audio) game.audio.play('repress', v.c[0], v.c[1] + 1, v.c[2], 1);
    this.stats.patches++;
    game.logEvent('patch ' + v.name + ' ' + plug.length);
  }

  // dinleyici (kamera) vakumdaysa sesler bogulur; basincli hacimde havalandirma ugultusu ve ara ara bip
  _listener(camera, dt) {
    const au = this.game.audio;
    if (!au || !camera) return;
    const c = camera.position;
    const inside = this.pressurized(c.x, c.y, c.z);
    if (inside !== this.listenerIn) { this.listenerIn = inside; if (au.setVacuum) au.setVacuum(!inside); }
    if (au.setBaseAmbience) au.setBaseAmbience(inside ? 1 : 0);
    if (inside && dt > 0) {
      this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = rnd(2.2, 6); au.play('beep', c.x + rnd(-5, 5), c.y + rnd(-1, 1.5), c.z + rnd(-5, 5), 0.5); }
    }
  }
}
