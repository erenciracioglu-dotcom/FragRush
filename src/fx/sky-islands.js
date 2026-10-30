// Gok adalari sistemi (harita 'sky', world/sky.js): kristal cani ve catlak kademeleri (%75/%50/%25), 2.5 sn kirilma
// uyarisi, adanin tek govde olarak bulutlara dusmesi, ~45 sn sonra uretim anlik goruntusunden geri yukselmesi; bulut
// altinda olum ve parcalama (ADAYI DUSURDUN / BULUTLARA GONDERDIN, kendin dusersen -1); kendi gogu, bulut denizi,
// sellale ve golet, yel degirmeni kanatlari, toz zerreleri, sesler. Kurallar yalniz yetkili bilgisayarda (tek kisilik
// ya da ev sahibi: game.auth); konuk ayni gorselleri netState / onNetEvent'ten, kendi (esitlenmis) voxellerinden kurar.
// Dusen ada destruction.js govdesi degil: worker'da meshlenir, her makinede ayni zaman egrisiyle (baslangic: ev
// sahibi zamani) yerel oynatilir; boylece konukta 30 Hz konum akisi ve buyuk dogus mesaji gerekmez.
import * as THREE from 'three';
import { VS, GRAVITY } from '../config.js';
import { paletteForWorker, linearRGB, MAT_COLOR } from '../world/materials.js';
import { voxelUniforms } from '../world/voxelMaterial.js';
import { meshVoxels, setPalette } from '../world/mesher.js';
import { buildGeometry } from '../world/chunkManager.js';
import { ITEM_TYPES } from '../game/items.js';
import { t } from '../i18n.js';
import { CLOUD_Y, KILL_Y } from '../world/sky.js';
import '../audio/sky-sfx.js';

export const SKY_ENV = { sunElev: 14, sunAzim: 232, sun: 0xffc48a, sunIntensity: 3.0, fog: 0xe6b8a2, fogDensity: 0.0045, hemiSky: 0x9fb4e8, hemiGround: 0xf2cdb4, hemi: 0.6, envIntensity: 0.85 };
// uyari (s), donus (dusus anindan s), yukselis (s), bulutlara itilen icin parcalama penceresi (s), catlak kademeleri;
// yenilenme (grow): ayaktaki adanin ve basamak taslarinin oyulan hucreleri delay sn sonra kenarlarindan katman katman
// geri buyur (tick sn'de bir; ada basina n, toplam all voxel; bir turda en cok scan eksik hucreye bakilir)
export const SKY_RULES = { warn: 2.5, ret: 45, rise: 4, credit: 4, stages: [0.75, 0.5, 0.25], grow: { delay: 2, tick: 0.3, n: 900, all: 2700, scan: 24000 } };
export const PH = { UP: 0, WARN: 1, FALL: 2, GONE: 3, RISE: 4 };
export function skyDirs() {
  const d = THREE.MathUtils.degToRad;
  return { sun: new THREE.Vector3().setFromSphericalCoords(1, d(90 - SKY_ENV.sunElev), d(SKY_ENV.sunAzim)) };
}
// patlama yaricapina gore kristal hasari: roket (r >= 2), plazma, ray, mermi / sacma
export const crystalK = (r) => (r >= 2 ? 0.46 : r >= 0.7 ? 0.085 : r >= 0.5 ? 0.12 : 0.095);
const rnd = (v) => Math.round(v * 100) / 100;
let palReady = false;

const NOISE = `
float sHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float sNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1, 0, 0)), f.x), mix(sHash(i + vec3(0, 1, 0)), sHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0, 0, 1)), sHash(i + vec3(1, 0, 1)), f.x), mix(sHash(i + vec3(0, 1, 1)), sHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float sFbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sNoise(p); p = p * 2.03 + 5.1; a *= 0.5; } return s; }`;

// ---------------------------------------------------------------- gun batimi gogu (ufkun alti: bulut denizi rengi)
const SKY_VS = 'varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = 'uniform float uTime; uniform vec3 uSun; uniform float uEnv; varying vec3 vDir;' + NOISE + `
void main() {
  vec3 d = normalize(vDir); float h = d.y, sd = max(dot(d, uSun), 0.0);
  vec3 col = mix(vec3(1.0, 0.64, 0.42), vec3(0.45, 0.55, 0.85), smoothstep(0.0, 0.3, h));
  col = mix(col, vec3(0.13, 0.25, 0.58), smoothstep(0.25, 0.9, h));
  col += vec3(1.0, 0.5, 0.22) * pow(sd, 5.0) * 0.7 * (1.0 - smoothstep(0.0, 0.6, h));
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.1) * 0.8 + vec2(uTime * 0.003, uTime * 0.001);
    float c = smoothstep(0.55, 0.85, sFbm(vec3(cp, 2.0)));
    col = mix(col, mix(vec3(1.0, 0.72, 0.62), vec3(1.0, 0.9, 0.8), sd), c * 0.55 * smoothstep(0.02, 0.25, h));
  }
  col += vec3(1.0, 0.86, 0.62) * (pow(sd, 1500.0) * 40.0 + pow(sd, 60.0) * 0.6);
  vec3 sea = mix(vec3(0.92, 0.74, 0.7), vec3(1.0, 0.86, 0.74), sd) * (uEnv > 0.5 ? 1.1 : 1.0);
  col = mix(col, sea, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function createIslandSky() {
  const uniforms = { uTime: { value: 0 }, uSun: { value: skyDirs().sun }, uEnv: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1000; mesh.name = 'skyIslandsSky'; mesh.visible = false;
  return { mesh, uniforms };
}
// ortam haritasi: ayni gok, alt yarim kure parlak bulut (adalarin alt yuzune sicak dolgu isigi)
export function createIslandEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer), s = new THREE.Scene(), sky = createIslandSky();
  sky.uniforms.uEnv.value = 1; sky.mesh.visible = true; sky.mesh.material.depthTest = true; s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose(); sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- bulut denizi (opak, kameranin altinda kayar; ufukta sise karisir)
const CLOUD_VS = 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const CLOUD_FS = 'uniform float uTime; uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFog; varying vec3 vW;' + NOISE + `
void main() {
  vec2 p = vW.xz * 0.045 + vec2(uTime * 0.02, uTime * 0.006);
  float c = sFbm(vec3(p, uTime * 0.03)), c2 = sFbm(vec3(p * 2.7 + 3.0, uTime * 0.05));
  float k = smoothstep(0.25, 0.85, c * 0.75 + c2 * 0.35);
  vec3 col = mix(vec3(0.62, 0.52, 0.62), vec3(1.0, 0.86, 0.74), k);
  vec3 v = vW - uCam; v.y = 0.0;
  float sd = max(dot(normalize(v + vec3(1e-4)), normalize(vec3(uSun.x, 0.0, uSun.z))), 0.0);
  col += vec3(0.5, 0.3, 0.12) * pow(sd, 4.0) * 0.5 * k;
  col = mix(col, uFog, 1.0 - exp(-length(vW.xz - uCam.xz) * 0.006));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
// sellale (asagi akan seritler) ve golet yuzeyi
const UV_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FALL_FS = 'uniform float uTime; varying vec2 vUv;' + NOISE + `
void main() {
  float x = vUv.x, y = vUv.y;
  float st = sNoise(vec3(x * 9.0, y * 3.0 + uTime * 2.6, 1.0)) * 0.6 + sNoise(vec3(x * 23.0, y * 7.0 + uTime * 4.0, 3.0)) * 0.4;
  float a = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x) * (0.45 + 0.5 * st) * smoothstep(0.0, 0.08, y);
  gl_FragColor = vec4(mix(vec3(0.55, 0.75, 0.9), vec3(1.0), st), a);
  #include <colorspace_fragment>
}`;
const POND_FS = 'uniform float uTime; varying vec2 vUv;' + NOISE + `
void main() {
  vec2 p = vUv * 6.0;
  float w = sNoise(vec3(p, uTime * 0.6)) * 0.5 + sNoise(vec3(p * 2.3, uTime * 0.9 + 4.0)) * 0.5;
  gl_FragColor = vec4(mix(vec3(0.16, 0.42, 0.55), vec3(0.75, 0.88, 0.95), smoothstep(0.55, 0.85, w)), 0.8);
  #include <colorspace_fragment>
}`;

// dusen / yukselen ada: voxel malzemesiyle tek mesh, pivot (agirlik merkezi) cevresinde hareket eder
class IslandBody {
  constructor(game, geo, pivot) {
    this.game = game; this.geo = geo; this.pivot = pivot;
    this.group = new THREE.Group(); this.group.position.copy(pivot);
    const mesh = new THREE.Mesh(geo, game.voxelMaterial);
    mesh.position.set(-pivot.x, -pivot.y, -pivot.z); mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh); game.scene.add(this.group);
  }
  dispose(keepGeo = false) { this.game.scene.remove(this.group); if (!keepGeo) this.geo.dispose(); }
}

export class SkySystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.isles = [];
    this.stats = SkySystem.freshStats();
    this.group = new THREE.Group(); this.group.name = 'skyIslands'; this.group.visible = false;
    if (game.scene) game.scene.add(this.group);
    this.sky = createIslandSky();
    if (game.scene) game.scene.add(this.sky.mesh);
    this.cloudU = { uTime: { value: 0 }, uSun: { value: skyDirs().sun }, uCam: { value: new THREE.Vector3() }, uFog: { value: new THREE.Vector3(0.97, 0.78, 0.68) } };
    const cg = new THREE.PlaneGeometry(1400, 1400, 1, 1); cg.rotateX(-Math.PI / 2);
    this.clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, fog: false }));
    this.clouds.frustumCulled = false; this.clouds.name = 'cloudSea';
    this.group.add(this.clouds);
    this.vis = [];            // haritaya ozel gorseller (golet, sellale, kanatlar): harita degisince atilir
    this._v = new THREE.Vector3(); this._ax = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.time = 0; this.moteT = 0; this.ambN = 0;
    this._jobs = [];          // worker'daki ada meshleri (yanit gecikirse ana is parcaciginda yapilir)
    this.regions = [];        // yenilenme bolgeleri (adalar + basamak taslari)
    this._dirty = [];         // dunyada degisen kutular (yenilenme taramasi icin)
    this._grT = 0; this._growing = false;
  }
  static freshStats() { return { hits: 0, stages: 0, drops: 0, rises: 0, island: 0, clouds: 0, self: 0, pushed: 0, grown: 0 }; }
  // ev sahibi zamani (konukta tahmini): dusus / yukselis egrileri buna gore
  now() { const n = this.game.net; return n && n.role === 'guest' ? n.hostNow() : this.game.time; }
  get auth() { return this.game.auth !== false; }

  // arena: world/sky.js generateSky ciktisi
  setup(arena) {
    this.disable();
    const game = this.game, w = game.world, S = arena.sky;
    if (!palReady) { setPalette(paletteForWorker()); palReady = true; }
    this.def = S; this.time = 0; this.stats = SkySystem.freshStats();
    // sabit sutunlar: basamak taslari her zaman, adalarin cekirdegi kristal saglamken (voxelWorld.findIslands)
    w.anchorLo = new Uint8Array(w.sxz).fill(255); w.anchorHi = new Uint8Array(w.sxz);
    for (const r of S.rocks) for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) {
      const c = x + w.sx * z; w.anchorLo[c] = Math.min(w.anchorLo[c], r.lo); w.anchorHi[c] = Math.max(w.anchorHi[c], r.hi);
    }
    this.isles = S.isles.map((d) => {
      const isl = { def: d, id: d.id, phase: PH.UP, hp: d.hp, maxHp: d.hp, stage: 0, t0: 0, dropT: -1e9, by: null, byName: '', lastBy: null, hitT: -9,
        body: null, rise: null, riseGeo: null, pending: false, linger: 0, fall: null, items: [], att: [], warned: false, fxT: 0 };
      const idx = this._collect(isl);
      isl.snap = w.extractIsland(idx);
      isl.top = (isl.snap.minY + isl.snap.ny) * VS;
      this._anchor(isl, true);
      return isl;
    });
    // yenilenme: her ada kendi anlik goruntusuyle, her tas kutusunun anlik goruntusuyle; degisen kutular izlenir
    this.regions = this.isles.map((isl) => (isl.reg = this._region(isl.snap, isl, isl.def.core)));
    for (const r of S.rocks) this.regions.push(this._rockRegion(w, r));
    this._dirty.length = 0; this._grT = SKY_RULES.grow.tick;
    if (this._hookW !== w) {
      this._hookW = w;
      w.onChange((x0, y0, z0, x1, y1, z1) => { if (this.active && this.auth && !this._growing && this.game.world === w) this._dirty.push(x0, y0, z0, x1, y1, z1); });
    }
    this.allSpawns = arena.spawns.slice();
    arena.items.forEach((it, k) => { if (it.isle >= 0 && this.isles[it.isle]) this.isles[it.isle].items.push(k); });
    this.pads = arena.pads;
    for (const p of this.pads) { p.r0 = p.radius; p._na = undefined; p._edge = null; }
    this.lights = game.staticLights ? game.staticLights.slice(0, this.isles.length) : [];
    this._navReady = false;
    // yikim: bulut altina dusen parca moloz birakmaz (bulutlar yutar); harita kapaninca geri alinir
    const D = game.destruction;
    if (D) {
      const proto = Object.getPrototypeOf(D);
      D.settle = (b) => { const p = b.group.position; if (p.y - (b.halfY || 0) < CLOUD_Y + 0.6) { this._puff(p.x, p.z, 0.7); return; } return proto.settle.call(D, b); };
    }
    if (game.renderer) { this._buildVisuals(S); this._applyEnv(); }
    this.group.visible = true;
    this.active = true;
    this._refresh();
  }

  disable() {
    const game = this.game, w = game.world;
    for (const isl of this.isles) { if (isl.body) isl.body.dispose(); if (isl.rise) isl.rise.dispose(true); if (isl.riseGeo) isl.riseGeo.dispose(); }
    this.isles = []; this.regions = []; this._dirty.length = 0;
    for (const j of this._jobs) j.done = true;
    this._jobs = [];
    if (w) { w.anchorLo = null; w.anchorHi = null; }
    const D = game.destruction;
    if (D && Object.prototype.hasOwnProperty.call(D, 'settle')) delete D.settle;
    for (const o of this.vis) { if (o.parent) o.parent.remove(o); o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); }); }
    this.vis = []; this.falls = null; this.pond = null; this.mill = null;
    if (this.sky) this.sky.mesh.visible = false;
    this.group.visible = false;
    const au = game.audio;
    if (au && this.active) { if (au.stopWindAmbience) au.stopWindAmbience(); if (au.stopSkyAmbience) au.stopSkyAmbience(); }
    this.active = false;
  }

  // ada cekirdegi sutunlari: bagli (kristal saglam) / serbest
  _anchor(isl, on) {
    const w = this.game.world, c = isl.def.core;
    if (!w.anchorLo) return;
    for (let z = c.cz - c.r; z <= c.cz + c.r; z++) for (let x = c.cx - c.r; x <= c.cx + c.r; x++) {
      if ((x - c.cx) * (x - c.cx) + (z - c.cz) * (z - c.cz) > c.r * c.r) continue;
      const k = x + w.sx * z;
      w.anchorLo[k] = on ? c.lo : 255; w.anchorHi[k] = on ? c.hi : 0;
    }
  }

  // adanin su anki voxelleri: cekirdekten 6-komsu dolasma, adanin bolge kutusu icinde
  _collect(isl) {
    const w = this.game.world, d = isl.def, b = d.box, c = d.core, sx = w.sx, sxz = w.sxz, mat = w.mat, mark = w.mark;
    const y0 = Math.max(1, d.y0), id = ++w.markCounter, out = [];
    let st = this._st || (this._st = new Int32Array(1 << 18)), sp = 0;
    const push = (i) => {
      if (mat[i] === 0 || mark[i] === id) return;
      mark[i] = id;
      if (sp >= st.length) { const n = new Int32Array(st.length * 2); n.set(st); st = this._st = n; }
      st[sp++] = i;
    };
    for (let z = c.cz - c.r; z <= c.cz + c.r; z++) for (let x = c.cx - c.r; x <= c.cx + c.r; x++) {
      if ((x - c.cx) * (x - c.cx) + (z - c.cz) * (z - c.cz) > c.r * c.r) continue;
      for (let y = c.lo; y <= c.hi; y++) push(x + sx * z + sxz * y);
    }
    while (sp > 0) {
      const i = st[--sp]; out.push(i);
      const y = (i / sxz) | 0, rem = i - y * sxz, z = (rem / sx) | 0, x = rem - z * sx;
      if (x > b[0]) push(i - 1); if (x < b[2] - 1) push(i + 1);
      if (z > b[1]) push(i - sx); if (z < b[3] - 1) push(i + sx);
      if (y > y0) push(i - sxz); if (y < w.sy - 1) push(i + sxz);
    }
    return Int32Array.from(out);
  }

  // uretim anlik goruntusunu dunyaya yaz (geri kurulum): bos olmayan hucreler, hasarsiz
  _writeSnap(isl, sn = isl.snap) {
    const w = this.game.world, { minX, minY, minZ, nx, ny, nz, mats } = sn;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      let li = nx * (z + nz * y), i = w.idx(minX, minY + y, minZ + z);
      for (let x = 0; x < nx; x++, li++, i++) { const m = mats[li]; if (m) { w.mat[i] = m; w.dmg[i] = 0; } }
    }
    w.markRegionDirty(minX - 1, minY - 1, minZ - 1, minX + nx, minY + ny, minZ + nz);
    this._growing = true;     // eksik hucre degil: yenilenme taramasina girmez
    try { w._notify(minX, minY, minZ, minX + nx - 1, minY + ny - 1, minZ + nz - 1); } finally { this._growing = false; }
  }
  // dunyadaki ada anlik goruntuyle ne kadar ayni (test): [ayni, toplam]
  snapMatch(i) {
    const isl = this.isles[i], w = this.game.world, { minX, minY, minZ, nx, ny, nz, mats } = isl.snap;
    let same = 0, n = 0;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const m = mats[x + nx * (z + nz * y)];
      if (m) { n++; if (w.mat[w.idx(minX + x, minY + y, minZ + z)] === m) same++; }
    }
    return [same, n];
  }

  // adayi meshle: buyukler worker'da (ana is parcacigi takilmasin), worker yoksa (test) hemen
  _mesh(ex, cb) {
    const { nx, ny, nz } = ex, W = this.game.workers, done = (r) => { const g = buildGeometry(r); g.computeBoundingSphere(); cb(g); };
    const sync = () => { const [pm, pd] = this._pad(ex); done(meshVoxels(pm, pd, nx, ny, nz, ex.minX, ex.minY, ex.minZ, VS)); };
    if (!(W && W.workers && W.workers.length)) { sync(); return; }
    // worker yaniti 0.5 oyun saniyesinde gelmezse (sayfa adim adim surulurken olay dongusu bloklu: test / simulasyon)
    // ana is parcaciginda meshlenir, gec gelen yanit atilir (tamponlar worker'a gectigi icin yeniden doldurulur)
    const job = { t: this.game.time, done: false, sync }, [pm, pd] = this._pad(ex);
    this._jobs.push(job);
    W.submit({ nx, ny, nz, ox: ex.minX, oy: ex.minY, oz: ex.minZ, mats: pm, dmgs: pd }, (r) => { if (!job.done) { job.done = true; done(r); } }, true);
  }
  _pad(ex) {
    const { nx, ny, nz } = ex, px = nx + 2, pz = nz + 2, pm = new Uint8Array(px * pz * (ny + 2)), pd = new Uint8Array(pm.length);
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const s = nx * (z + nz * y), d = 1 + px * ((z + 1) + pz * (y + 1));
      pm.set(ex.mats.subarray(s, s + nx), d); pd.set(ex.dmgs.subarray(s, s + nx), d);
    }
    return [pm, pd];
  }

  // ---------------------------------------------------------------- evreler
  _setPhase(isl, ph, t0) { isl.phase = ph; isl.t0 = t0; isl.warned = false; this._refresh(); }
  // ada durumlari degisince: pedler (kalkis adasi ayakta / uyarida, hedef ayakta), dogma noktalari (ayakta adalar)
  _refresh() {
    const up = (i) => !!this.isles[i] && this.isles[i].phase === PH.UP;
    for (const p of this.pads || []) {
      const f = this.isles[p.from], on = !!f && (f.phase === PH.UP || f.phase === PH.WARN) && up(p.to) && this._padLand(p);
      p.radius = on ? p.r0 : 0;
      this._navPad(p, on);
    }
    this._spawns();
  }
  // ped inis yeri: hedefte ve cevresinde zemin var mi (roketler inis yerini delebilir; deliginse ped kapali, yoksa
  // ucan herkes adayi asip bulutlara duserdi). Ada geri gelince (anlik goruntu) zemin de doner
  _padLand(p) {
    const w = this.game.world;
    let n = 0;
    for (const [ox, oz] of [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
      for (let y = p.ty + 0.6; y > p.ty - 1.6; y -= VS) if (w.solidAtWorld(p.tx + ox, y, p.tz + oz)) { n++; break; }
    }
    return n >= 5;
  }
  // dogma noktalari: ayakta adalarda ve alti delinmemis (roketler adayi delebilir; delikteki noktada dogan bulutlara
  // duserdi). Ada durumu degisince ve yarim saniyede bir yenilenir (game.pickSpawn arena.spawns'tan secer)
  _spawns() {
    const a = this.game.arena, w = this.game.world;
    if (!a || !this.allSpawns) return;
    const up = this.allSpawns.filter((x) => !!this.isles[x.isle] && this.isles[x.isle].phase === PH.UP);
    const ok = [];
    for (const s of up) { const f = this._standAt(s, w); if (f) ok.push(f); }
    a.spawns = ok.length ? ok : up.length ? up : this.allSpawns;
  }
  // dogma noktasi: alti 4 m icinde doluysa kendisi; zemini patlamissa ayni adada ~5 m icinde kenarda olmayan, govdeye
  // yer olan en yakin duruş yeri (bulunamazsa null: o nokta kullanilmaz; zeminsiz noktada doganlar buluta dusuyordu)
  _standAt(s, w) {
    for (let y = s.y - 0.1; y > s.y - 4; y -= VS) if (w.solidAtWorld(s.x, y, s.z)) return s;
    const isl = this.isles[s.isle], P = { x: 0, z: 0 };
    for (const r of [0.75, 1.5, 2.25, 3, 4, 5]) for (let k = 0; k < 12; k++) {
      const x = s.x + Math.cos(k * Math.PI / 6) * r, z = s.z + Math.sin(k * Math.PI / 6) * r;
      P.x = x; P.z = z;
      if (!this._inBox(isl, P)) continue;
      for (let y = s.y + 2; y > s.y - 4; y -= VS) {
        if (!w.solidAtWorld(x, y - 0.1, z)) continue;
        if (w.boxSolid(x - 0.35, y + 0.05, z - 0.35, x + 0.35, y + 1.8, z + 0.35)) break;
        let edge = false;
        for (const [ox, oz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) if (!w.solidAtWorld(x + ox, y - 0.1, z + oz) && !w.solidAtWorld(x + ox, y - 0.35, z + oz)) { edge = true; break; }
        if (!edge) return { x, y, z, yaw: s.yaw, isle: s.isle };
        break;
      }
    }
    return null;
  }
  // botlarin gezinme agindaki ped kenari: kapali ped yolu bulmada kullanilmaz (yalniz yetkili tarafta)
  _navPad(p, on) {
    const nav = this.game.nav;
    if (!nav || !this._navReady || !this.auth) return;
    if (p._na === undefined) {
      p._na = nav.nearest(p.x, p.y + 0.3, p.z);
      const nb = nav.nearest(p.tx, p.ty + 0.3, p.tz), l = nav.pads.get(p._na);
      p._edge = l ? l.find((e) => e.to === nb) || null : null;
    }
    if (!p._edge) return;
    let l = nav.pads.get(p._na);
    if (!l) { l = []; nav.pads.set(p._na, l); }
    const k = l.indexOf(p._edge);
    if (on && k < 0) l.push(p._edge); else if (!on && k >= 0) l.splice(k, 1);
  }

  // ---------------------------------------------------------------- kurallar (yetkili taraf)
  // destruction.blast'tan: kristale yakin her patlama / mermi hasar verir (kristalin dikey eksenine uzaklik)
  onBlast(x, y, z, radius, power, source) {
    if (!this.active || !this.auth) return;
    const k = crystalK(radius), rail = radius >= 0.5 && radius < 0.7, fr = this.game.frame;
    for (const isl of this.isles) {
      if (isl.phase !== PH.UP) continue;
      const c = isl.def.crystal, u = Math.max(0, Math.min(1, (y - c.y0) / (c.y1 - c.y0)));
      const dy = y < c.y0 ? c.y0 - y : y > c.y1 ? y - c.y1 : 0;
      const dh = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r * (0.35 + 0.65 * u));
      const d = Math.hypot(dh, dy), reach = radius * 1.2 + 0.4;
      if (d >= reach) continue;
      let dmg = power * k * (1 - d / reach);
      if (rail) {   // ray yolu boyunca ~0.32 m'de bir patlama cagirir: ayni kare + ayni atici en cok 110
        if (isl.railF !== fr || isl.railBy !== source) { isl.railF = fr; isl.railBy = source; isl.railSum = 0; }
        dmg = Math.min(dmg, 110 - isl.railSum); isl.railSum += Math.max(0, dmg);
      }
      this.damage(isl, dmg, source);
    }
  }
  damage(isl, dmg, source) {
    if (!(dmg > 0.01) || isl.phase !== PH.UP) return;
    isl.hp = Math.max(0, isl.hp - dmg); isl.hitT = this.now(); this.stats.hits++;
    if (source) isl.lastBy = source;
    while (isl.stage < 3 && isl.hp <= isl.maxHp * SKY_RULES.stages[isl.stage]) {
      isl.stage++; this.stats.stages++;
      this._stageFx(isl);
      this._emit({ k: 'st', i: isl.id, s: isl.stage });
    }
    if (isl.hp <= 0) this._warn(isl, source || isl.lastBy || null);
  }
  // kristali hemen kir (olcum / test): uyari baslar
  forceBreak(i, by = null) { const isl = this.isles[i]; if (isl && isl.phase === PH.UP) { isl.hp = 0; isl.stage = 3; this._warn(isl, by); } }
  _warn(isl, by) {
    isl.by = by; isl.byName = by ? by.name : '';
    this._setPhase(isl, PH.WARN, this.now());
    this._emit({ k: 'w', i: isl.id, n: isl.byName });
    this._warnFx(isl);
  }
  _emit(e) { if (this.game.netEmit) this.game.netEmit('skySys', e); }

  _rules() {
    const now = this.now(), R = SKY_RULES;
    for (const isl of this.isles) {
      if (isl.phase === PH.WARN && !isl.pending && now - isl.t0 >= R.warn) this._beginDrop(isl);
      else if (isl.phase === PH.FALL && isl.fall && now - isl.t0 >= isl.fall.dur) this._setPhase(isl, PH.GONE, now);
      else if (isl.phase === PH.GONE && now - isl.dropT >= R.ret - R.rise) {
        this._setPhase(isl, PH.RISE, now);
        this._emit({ k: 'r', i: isl.id, t: rnd(now) });
        this._startRise(isl); this._riseFx(isl);
      } else if (isl.phase === PH.RISE && now - isl.t0 >= R.rise) this._finishRise(isl);
      if (isl.phase === PH.GONE && !isl.riseGeo && !isl.meshing) { isl.meshing = true; this._mesh(isl.snap, (g) => { isl.meshing = false; if (this.isles[isl.id] === isl) isl.riseGeo = g; else g.dispose(); }); }
    }
  }

  // uyari bitti: adanin voxellerini topla, meshle (worker); mesh gelince voxeller kalkar ve govde duser
  _beginDrop(isl) {
    isl.pending = true;
    const idx = this._collect(isl);
    if (!idx.length) { this._drop(isl, idx, null, null, this.now()); return; }
    const ex = this.game.world.extractIsland(idx);
    this._mesh(ex, (geo) => {
      if (!this.active || this.isles[isl.id] !== isl || isl.phase !== PH.WARN) { geo.dispose(); return; }
      this._drop(isl, idx, ex, geo, this.now());
    });
  }
  // konuk: ev sahibi dusurdu; ayni adayi kendi dunyasindan cikarip ayni egriyle oynatir (voxeller de yerelde kalkar)
  _guestDrop(isl, t0) {
    if (isl.pending || isl.phase === PH.FALL || isl.phase === PH.GONE) return;
    isl.pending = true;
    const idx = this._collect(isl);
    const ex = idx.length ? this.game.world.extractIsland(idx) : null;
    if (!ex || !this.game.scene) { this._drop(isl, idx, null, null, t0); return; }
    this._mesh(ex, (geo) => { if (!this.active || this.isles[isl.id] !== isl) { geo.dispose(); return; } this._drop(isl, idx, ex, geo, t0); });
  }
  _drop(isl, idx, ex, geo, t0) {
    const game = this.game, w = game.world;
    isl.pending = false;
    if (idx.length) w.removeIndices(idx);
    this._anchor(isl, false);
    if (isl.reg) isl.reg.miss.clear();
    if (isl.body) isl.body.dispose();
    isl.body = null;
    if (geo && game.scene) { isl.body = new IslandBody(game, geo, new THREE.Vector3(ex.com[0], ex.com[1], ex.com[2])); this._attachTo(isl, isl.body); }
    else this._detach(isl, false);
    isl.fall = this._fallCurve(isl, t0, ex ? (ex.minY + ex.ny) * VS : isl.top);
    isl.dropT = t0; isl.splashed = false;
    this._setPhase(isl, PH.FALL, t0);
    this._dropFx(isl);
    if (!this.auth) return;
    this.stats.drops++;
    // ustundekiler (ve ustunde ucanlar) adayla duser: bulut altinda olurlerse kristali kirana yazilir
    const b = isl.def.box;
    for (const a of game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, X = p.x / VS, Z = p.z / VS;
      if (X >= b[0] && X < b[2] && Z >= b[1] && Z < b[3] && p.y > isl.def.y0 * VS - 1) a.skyRide = { i: isl.id, by: isl.by, t: game.time, d: a.deaths };
    }
    this._itemsGone(isl);
    // komsu koprunun yarisi gibi kalanlar: yapisal butunluk yeniden denetlenir (bagli degilse duser)
    if (idx.length) { w.seedRegion(b[0] - 1, Math.max(1, isl.def.y0 - 1), b[1] - 1, b[2], w.sy - 1, b[3]); if (game.destruction) game.destruction.integrityPending = true; }
    this._emit({ k: 'd', i: isl.id, t: rnd(t0) });
    if (game.hud && isl.byName) game.hud.subMsg(t('skyDrop', isl.byName), 2.2);
    if (game.logEvent) game.logEvent('island ' + isl.def.name + ' ' + (isl.byName || '-'));
  }
  // serbest dusus (ada zemini bulut yuzeyine inene dek), sonra bulutun icinde yavaslayarak batar
  _fallCurve(isl, t0, top) {
    const D = Math.max(0.5, isl.def.top - (CLOUD_Y - 0.4)), tc = Math.sqrt(2 * D / GRAVITY), a = isl.id * 1.7 + Math.floor(t0 * 10) * 0.37;
    const f = { t0, D, tc, vc: GRAVITY * tc, k: 1.8, vs: 3, ax: Math.cos(a), az: Math.sin(a), dur: 0 };
    let tt = tc;
    while (tt < tc + 12 && top + this._dy(f, tt) > CLOUD_Y - 1.2) tt += 0.05;
    f.dur = tt + 0.1;
    return f;
  }
  _dy(f, tt) {
    if (tt <= f.tc) return -0.5 * GRAVITY * tt * tt;
    const s = tt - f.tc;
    return -f.D - f.vc * (1 - Math.exp(-f.k * s)) / f.k - f.vs * s;
  }

  // yukselis gorseli: uretim anlik goruntusunden govde (geometri bir kez meshlenir, sonra yeniden kullanilir)
  _startRise(isl) {
    if (!this.game.scene) return;
    const go = (geo) => {
      isl.riseGeo = geo;
      if (!this.active || this.isles[isl.id] !== isl || isl.phase !== PH.RISE) return;
      if (isl.rise) isl.rise.dispose(true);
      const c = isl.snap.com;
      isl.rise = new IslandBody(this.game, geo, new THREE.Vector3(c[0], c[1], c[2]));
      this._attachTo(isl, isl.rise);
    };
    if (isl.riseGeo) go(isl.riseGeo);
    else if (!isl.meshing) { isl.meshing = true; this._mesh(isl.snap, (g) => { isl.meshing = false; go(g); }); }
  }
  // yukselis bitti: anlik goruntu dunyaya yazilir; hacmin icinde kalan yukari itilir; kristal tam canla doner
  _finishRise(isl) {
    this._writeSnap(isl);
    this._anchor(isl, true);
    this._liftActors();
    this._restore(isl);
    this._emit({ k: 'b', i: isl.id });
    this.stats.rises++;
  }
  // kati voxelin icinde kalan canli aktor yukari itilir (yukselen ada: herkes; yenilenen zemin: yalniz ayaginin altina
  // hucre dolanlar, en cok 3 m)
  _liftActors(list = this.game.actors, max = 120) {
    const w = this.game.world;
    for (const a of list) {
      if (!a.alive) continue;
      const p = a.mover.pos;
      let k = 0;
      while (k < max && w.boxSolid(p.x - 0.34, p.y + 0.02, p.z - 0.34, p.x + 0.34, p.y + a.mover.h, p.z + 0.34)) { p.y += VS; k++; }
      if (k) { a.mover.vel.y = Math.max(0, a.mover.vel.y); this.stats.pushed++; }
    }
  }
  _restore(isl) {
    if (isl.reg) isl.reg.miss.clear();
    isl.hp = isl.maxHp; isl.stage = 0; isl.by = null; isl.byName = ''; isl.lastBy = null; isl.linger = 0.001;
    this._anchor(isl, true);
    this._setPhase(isl, PH.UP, this.now());
    this._itemsBack(isl);
  }

  // ogeler (yalniz yetkili taraf; konuga ogeler satiri gider): dusen adaninkiler kaybolur, ada donunce yeniden dogar
  _itemsGone(isl) {
    const L = this.auth && this.game.items ? this.game.items.list : null;
    if (L) for (const k of isl.items) { const it = L[k]; if (!it) continue; it.skyT = it.active ? 0.8 : it.timer; it.active = false; it.mesh.visible = false; it.timer = 1e9; }
  }
  _itemsBack(isl) {
    const L = this.auth && this.game.items ? this.game.items.list : null;
    if (L) for (const k of isl.items) { const it = L[k]; if (!it || it.skyT === undefined) continue; it.timer = Math.max(0.5, it.skyT); it.skyT = undefined; it.pos.copy(it.home); it.fallV = 0; }
  }
  // bosluga (bulutlara) dusen oge: kaybolur, suresi dolunca ilk yerinde yeniden belirir
  _itemsVoid() {
    const L = this.game.items ? this.game.items.list : null;
    if (L) for (const it of L) if (it.active && !it.hidden && it.pos.y < CLOUD_Y) { it.active = false; it.mesh.visible = false; it.timer = ITEM_TYPES[it.type].respawn; it.pos.copy(it.home); it.fallV = 0; }
  }

  // mac basi: dusmus adalar yerinde, kristaller tam (menudeki bot savasindan kalan durum temizlenir)
  matchReset() {
    if (!this.active || !this.auth) return;
    const L = this.game.items ? this.game.items.list : [];
    for (const it of L) it.skyT = undefined;
    for (const isl of this.isles) {
      if (isl.phase !== PH.UP) {
        if (isl.body) { isl.body.dispose(); isl.body = null; }
        if (isl.rise) { isl.rise.dispose(true); isl.rise = null; }
        isl.pending = false;
        this._writeSnap(isl);
        this._restore(isl);
        this._reattach(isl);
        this._emit({ k: 'b', i: isl.id });
      } else { isl.hp = isl.maxHp; isl.stage = 0; isl.lastBy = null; this._writeSnap(isl); isl.reg.miss.clear(); }
    }
    // basamak taslari da tam; icinde kalan yukari
    for (const reg of this.regions) if (!reg.isl) { this._writeSnap(null, reg); reg.miss.clear(); }
    this._dirty.length = 0;
    this._liftActors();
  }

  // adaya bagli gorseller (golet yuzeyi, kanatlar): govdeyle birlikte duser / yukselir
  _attachTo(isl, body) {
    for (const a of isl.att) { body.group.add(a.obj); a.obj.position.copy(a.pos).sub(body.pivot); a.obj.quaternion.copy(a.quat); a.obj.visible = true; }
  }
  _detach(isl, visible) { for (const a of isl.att) { this.group.add(a.obj); a.obj.position.copy(a.pos); a.obj.quaternion.copy(a.quat); a.obj.visible = visible; } }
  _reattach(isl) { this._detach(isl, true); }

  // ---------------------------------------------------------------- yenilenme (yetkili taraf): oyulan ada / tas geri buyur
  // bolge: anlik goruntu kutusu + eksik hucreler (indeks -> son oyulma zamani; Map sirasi bakilma sirasi)
  _region(sn, isl, core) {
    return { minX: sn.minX, minY: sn.minY, minZ: sn.minZ, nx: sn.nx, ny: sn.ny, nz: sn.nz, mats: sn.mats, isl, core, miss: new Map() };
  }
  _rockRegion(w, r) {
    const minX = r.x0, minY = Math.max(1, r.lo - 2), minZ = r.z0, nx = r.x1 - r.x0, ny = r.hi + 2 - minY, nz = r.z1 - r.z0;
    const mats = new Uint8Array(nx * ny * nz);
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) mats[x + nx * (z + nz * y)] = w.mat[w.idx(minX + x, minY + y, minZ + z)];
    return this._region({ minX, minY, minZ, nx, ny, nz, mats }, null, { box: true, lo: r.lo });
  }
  // komsusu olmadan da buyuyebilen tohum hucresi: adanin cekirdek tabani (iki kat ve alti) / tasin taban katlari; ada
  // butunuyle silinse de buradan yeniden buyur
  _seed(reg, x, y, z) {
    const c = reg.core;
    if (!c || y > c.lo + 1) return false;
    return c.box || (x - c.cx) * (x - c.cx) + (z - c.cz) * (z - c.cz) <= c.r * c.r;
  }
  // degisen kutular: ayaktaki adanin / tasin anlik goruntusunde dolu olup simdi bos hucreler eksiklere (sona, zamaniyla:
  // ayni yere yeni atis bekleme suresini yeniden baslatir). Tur basina ~150 bin hucrelik kutu; fazlasi sonraki turlara
  _scanDirty(now) {
    const D = this._dirty, w = this.game.world, mat = w.mat, sx = w.sx, sxz = w.sxz;
    let k = 0, vol = 0;
    for (; k < D.length && vol < 150000; k += 6) {
      vol += (D[k + 3] - D[k] + 1) * (D[k + 4] - D[k + 1] + 1) * (D[k + 5] - D[k + 2] + 1);
      for (const reg of this.regions) {
        if (reg.isl && reg.isl.phase !== PH.UP) continue;
        const x0 = Math.max(D[k], reg.minX), y0 = Math.max(D[k + 1], reg.minY), z0 = Math.max(D[k + 2], reg.minZ);
        const x1 = Math.min(D[k + 3], reg.minX + reg.nx - 1), y1 = Math.min(D[k + 4], reg.minY + reg.ny - 1), z1 = Math.min(D[k + 5], reg.minZ + reg.nz - 1);
        if (x0 > x1 || y0 > y1 || z0 > z1) continue;
        const nx = reg.nx, nz = reg.nz, mats = reg.mats, miss = reg.miss;
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          let li = (x0 - reg.minX) + nx * ((z - reg.minZ) + nz * (y - reg.minY)), i = x0 + sx * z + sxz * y;
          for (let x = x0; x <= x1; x++, li++, i++) if (mats[li] && !mat[i]) { miss.delete(i); miss.set(i, now); }
        }
      }
    }
    if (k >= D.length) D.length = 0; else D.splice(0, k);
  }
  // yenilenme adimi: eksik hucrelerden (en az delay sn once oyulmus) komsusu dolu olan ya da tohum olan bu adimda dolar;
  // bu adimda dolanlar komsularini ancak sonraki adimda acar (kenardan katman katman). Icinde biri duran hucre beklenir,
  // yalniz ayak hizasindaki (basamak) dolar ve o kisi yukari itilir. Kucuk kutular halinde yazilir: gezinme agi ve
  // chunk'lar yalniz degisen yerde yenilenir, konuga olagan voxel farki gider. Donus: dolan voxel sayisi
  _regrow() {
    const game = this.game, w = game.world, mat = w.mat, sx = w.sx, sz = w.sz, sy = w.sy, sxz = w.sxz, G = SKY_RULES.grow, now = this.now();
    if (this._dirty.length) this._scanDirty(now);
    const A = this._abox || (this._abox = []), AA = this._aact || (this._aact = []), L = this._alift || (this._alift = new Set());
    A.length = 0; AA.length = 0; L.clear();
    for (const a of game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, r = (a.mover.r || 0.34) + 0.05, h = a.mover.h || 1.8;
      AA.push(a);
      A.push(Math.floor((p.x - r) / VS), Math.floor((p.y - 0.05) / VS), Math.floor((p.z - r) / VS), Math.floor((p.x + r) / VS), Math.floor((p.y + h + 0.05) / VS), Math.floor((p.z + r) / VS), Math.floor((p.y + 0.3) / VS));
    }
    const dep = this._gdep || (this._gdep = []);
    dep.length = 0;
    let left = G.all, scan = G.scan;
    for (const reg of this.regions) {
      if (!reg.miss.size || left <= 0 || scan <= 0) continue;
      if (reg.isl && reg.isl.phase !== PH.UP) continue;
      // tarama kaldigi yerden devam eder (sona gelince basa sarar): her tur ayni bastaki hucrelere bakilip kenarlar unutulmaz
      let n = Math.min(G.n, left), look = Math.min(scan, reg.miss.size), it = reg.it || (reg.it = reg.miss.entries()), wrapped = false;
      while (look > 0 && n > 0) {
        let e = it.next();
        if (e.done) { if (wrapped) break; wrapped = true; it = reg.it = reg.miss.entries(); e = it.next(); if (e.done) break; }
        look--; scan--;
        const i = e.value[0];
        if (mat[i]) { reg.miss.delete(i); continue; }
        if (now - e.value[1] < G.delay) continue;
        const y = (i / sxz) | 0, rem = i - y * sxz, z = (rem / sx) | 0, x = rem - z * sx;
        const nb = (x > 0 && mat[i - 1]) || (x < sx - 1 && mat[i + 1]) || (z > 0 && mat[i - sx]) || (z < sz - 1 && mat[i + sx]) || (y > 0 && mat[i - sxz]) || (y < sy - 1 && mat[i + sxz]);
        if (!nb && !this._seed(reg, x, y, z)) continue;
        let blocked = false;
        for (let k = 0; k < A.length; k += 7) {
          if (x < A[k] || x > A[k + 3] || y < A[k + 1] || y > A[k + 4] || z < A[k + 2] || z > A[k + 5]) continue;
          if (y > A[k + 6]) { blocked = true; break; }
          L.add(AA[k / 7]);
        }
        if (blocked) continue;
        dep.push(x, y, z, reg.mats[(x - reg.minX) + reg.nx * ((z - reg.minZ) + reg.nz * (y - reg.minY))]);
        reg.miss.delete(i);
        n--; left--;
      }
    }
    if (!dep.length) return 0;
    const bins = this._gbins || (this._gbins = new Map());
    bins.clear();
    for (let k = 0; k < dep.length; k += 4) {
      const key = (dep[k] >> 3) + 64 * (dep[k + 2] >> 3) + 4096 * (dep[k + 1] >> 4);
      let b = bins.get(key);
      if (!b) { b = []; bins.set(key, b); }
      b.push(dep[k], dep[k + 1], dep[k + 2], dep[k + 3]);
    }
    this._growing = true;
    try { for (const b of bins.values()) w.depositMany(b, b.length); } finally { this._growing = false; }
    if (L.size) this._liftActors(L, 12);
    const cnt = dep.length / 4;
    this.stats.grown += cnt;
    return cnt;
  }
  // ada / tas anlik goruntusunun eksik hucre sayisi (test, olcum)
  missing() { return this.regions.map((r) => r.miss.size); }

  // ---------------------------------------------------------------- aktor (yetkili taraf, game.js dongusu): bulut altinda olum
  actorTick(a) {
    const r = a.skyRide, now = this.game.time;
    if (r && (r.d !== a.deaths || now - r.t > 8 || (a.mover.onGround && now - r.t > 0.6 && !this._inBox(this.isles[r.i], a.mover.pos)))) a.skyRide = null;
    if (a.mover.pos.y < KILL_Y) this._cloudDeath(a);
  }
  _inBox(isl, p) { const b = isl ? isl.def.box : null, X = p.x / VS, Z = p.z / VS; return !!b && X >= b[0] && X < b[2] && Z >= b[1] && Z < b[3]; }
  // adayla dusen: kristali kirana (ADA); itilen / vurulan: son 4 sn'de vurana (BULUT); yoksa kendi (-1)
  _cloudDeath(a) {
    const game = this.game, r = a.skyRide, now = game.time, k = a.lastAttacker;
    const pusher = k && k !== a && now - a.lastAttackTime < SKY_RULES.credit && game.actors.includes(k) ? k : null;
    let killer = pusher, w = 'clouds';
    if (r && r.d === a.deaths) {
      w = 'island';
      if (r.by === a) killer = null;
      else if (r.by && game.actors.includes(r.by)) killer = r.by;
      else if (pusher) w = 'clouds';
    }
    a.skyRide = null;
    this.stats[killer ? w : 'self']++;
    const p = a.mover.pos;
    this._puff(p.x, p.z, 0.6);
    this._emit({ k: 'p', x: rnd(p.x), z: rnd(p.z) });
    a.health = 0;
    a.die(killer, w, false);
  }

  // ---------------------------------------------------------------- ag (net/protocol.js MAP_NET_SYSTEMS)
  netState() {
    if (!this.active) return null;
    return { p: this.isles.map((s) => s.phase), h: this.isles.map((s) => Math.round(s.hp / s.maxHp * 20) * 5), t: this.isles.map((s) => rnd(s.t0)), d: this.isles.map((s) => rnd(s.dropT)) };
  }
  applyNetState(s) {
    if (!this.active || !s || !s.p) return;
    s.p.forEach((ph, i) => {
      const isl = this.isles[i];
      if (!isl) return;
      const hp = isl.maxHp * (s.h[i] / 100);
      if (hp < isl.hp - 1) isl.hitT = this.now();
      isl.hp = hp;
      if (ph === PH.UP) isl.stage = SKY_RULES.stages.filter((f) => hp <= isl.maxHp * f + 1).length;
      if (ph !== isl.phase) this._remote(isl, ph, s.t[i], s.d[i]);
    });
  }
  // konuk: ev sahibinin evresine gec (olay kacirildiysa ya da gec katilinca da)
  _remote(isl, ph, t0, dropT) {
    if (ph === PH.WARN) { this._setPhase(isl, PH.WARN, t0); this._warnFx(isl); }
    else if (ph === PH.FALL) this._guestDrop(isl, t0);
    else if (ph === PH.GONE) { if (isl.phase !== PH.FALL) this._guestDrop(isl, dropT); isl.dropT = dropT; this._setPhase(isl, PH.GONE, t0); }
    else if (ph === PH.RISE) { isl.dropT = dropT; this._setPhase(isl, PH.RISE, t0); this._startRise(isl); this._riseFx(isl); }
    else if (ph === PH.UP) {
      if (isl.body) { isl.body.dispose(); isl.body = null; }
      isl.pending = false;
      this._restore(isl);
      if (!isl.rise) this._reattach(isl);
    }
  }
  onNetEvent(e) {
    if (!this.active || !e) return;
    const isl = this.isles[e.i];
    if (e.k === 'p') { this._puff(e.x, e.z, 0.6); return; }
    if (!isl) return;
    if (e.k === 'st') { isl.stage = Math.max(isl.stage, e.s); this._stageFx(isl); }
    else if (e.k === 'w') { isl.byName = e.n || ''; if (isl.phase !== PH.WARN) { this._setPhase(isl, PH.WARN, this.now()); this._warnFx(isl); } }
    else if (e.k === 'd') { this._guestDrop(isl, e.t); if (isl.byName && this.game.hud) this.game.hud.subMsg(t('skyDrop', isl.byName), 2.2); }
    else if (e.k === 'r') { if (isl.phase !== PH.RISE) { isl.dropT = e.t - SKY_RULES.ret + SKY_RULES.rise; this._setPhase(isl, PH.RISE, e.t); this._startRise(isl); this._riseFx(isl); } }
    else if (e.k === 'b') { if (isl.phase !== PH.UP) this._remote(isl, PH.UP, this.now(), isl.dropT); }
  }

  // ---------------------------------------------------------------- her kare (her makinede): kurallar yetkili tarafta, gorsel her yerde
  update(dt, camera) {
    if (!this.active) return;
    const game = this.game, now = this.now();
    this.time += dt;
    if (!this._navReady && this.auth && game.nav && game.state !== 'loading') { this._navReady = true; for (const p of this.pads) this._navPad(p, p.radius > 0); }
    if (this._jobs.length) {
      for (const j of this._jobs) if (!j.done && game.time - j.t > 0.5) { j.done = true; j.sync(); }
      this._jobs = this._jobs.filter((j) => !j.done);
    }
    if (dt > 0 && this.auth) {
      this._rules(); this._itemsVoid();
      if ((this._grT -= dt) <= 0) { this._grT = SKY_RULES.grow.tick; this._regrow(); }
    }
    // pedler (inis yeri delindi mi) ve dogma noktalari yarim saniyede bir; pedler konukta da (kendi tahmini icin)
    if (dt > 0 && (this._spT = (this._spT || 0) - dt) <= 0) { this._spT = 0.5; this._refresh(); }
    for (const isl of this.isles) this._isleVisual(isl, now, dt);
    if (game.renderer && camera) this._view(dt, camera);
  }

  _isleVisual(isl, now, dt) {
    const ph = isl.phase, c = isl.def.crystal, mp = voxelUniforms.uMatP.value[c.mat];
    // kristal: cani azaldikca soner ve titrer, vurulunca parlar, uyarida cakar; catlak kademesi desenin kesirli kismi
    let e = 0.25;
    if (ph === PH.UP) {
      const hit = now - isl.hitT;
      e = 0.9 * (0.65 + 0.35 * isl.hp / isl.maxHp) * (hit >= 0 && hit < 0.2 ? 1.6 - hit * 3 : 1);
      if (isl.stage >= 2) e *= 0.72 + 0.28 * Math.sin(this.time * (11 + isl.stage * 7) + isl.id * 2.1);
    } else if (ph === PH.WARN) e = 0.3 + 1.0 * Math.abs(Math.sin(this.time * 22));
    else if (ph === PH.RISE) e = 0.25 + 0.65 * Math.min(1, (now - isl.t0) / SKY_RULES.rise);
    if (mp) { mp.z = e; mp.w = 74 + Math.min(3, isl.stage) * 0.1; }
    const L = this.lights[isl.id];
    if (L) L.light.intensity = L.base * (ph === PH.UP || ph === PH.WARN ? e / 0.9 : 0);
    // uyari: alt yuzden toz ve cakil, gicirti
    if (ph === PH.WARN && dt > 0) { isl.fxT -= dt; if (isl.fxT <= 0) { isl.fxT = 0.22; this._crumble(isl, 4); } }
    // dusen govde
    if (isl.body && isl.fall) {
      const f = isl.fall, tt = Math.max(0, now - f.t0), g = isl.body.group, pv = isl.body.pivot;
      g.position.set(pv.x, pv.y + this._dy(f, tt), pv.z);
      this._q.setFromAxisAngle(this._ax.set(f.ax, 0, f.az), Math.min(0.4, 0.07 * tt * tt));
      g.quaternion.copy(this._q);
      if (!isl.splashed && tt >= f.tc) { isl.splashed = true; this._splashFx(isl); }
      if (tt > f.dur + 0.3 || ph === PH.GONE || ph === PH.UP || ph === PH.RISE) { this._detach(isl, false); isl.body.dispose(); isl.body = null; }
    }
    // yukselen govde; ada dunyaya yazilinca chunk meshleri hazir olana dek biraz daha gorunur kalir
    if (isl.rise) {
      const g = isl.rise.group, pv = isl.rise.pivot;
      if (ph === PH.RISE) {
        const u = Math.min(1, Math.max(0, (now - isl.t0) / SKY_RULES.rise)), H = isl.top - CLOUD_Y + 2.5, k = 1 - Math.pow(1 - u, 3);
        g.position.set(pv.x, pv.y - H * (1 - k), pv.z);
        const wob = 0.05 * (1 - u) * Math.sin(this.time * 2.3 + isl.id);
        g.rotation.set(wob, 0, -wob * 0.7);
      } else if (ph === PH.UP) {
        g.position.copy(pv); g.rotation.set(0, 0, 0);
        isl.linger += dt;
        const w = this.game.world, cc = isl.def.core, here = w.mat[w.idx(cc.cx, cc.hi, cc.cz)] !== 0;
        const pend = this.game.chunks ? this.game.chunks.pendingCount() : 0;
        if ((here && isl.linger > 0.15 && (pend === 0 || isl.linger > 1.5)) || isl.linger > 5) { isl.rise.dispose(true); isl.rise = null; this._reattach(isl); }
      } else { isl.rise.dispose(true); isl.rise = null; }
    }
  }

  // oyuncunun bastigi ada (ayakta ya da uyarida)
  isleUnder(p) {
    const X = p.x / VS, Z = p.z / VS;
    for (const isl of this.isles) {
      const b = isl.def.box;
      if ((isl.phase === PH.UP || isl.phase === PH.WARN) && X >= b[0] && X < b[2] && Z >= b[1] && Z < b[3] && p.y > isl.def.top - 3) return isl;
    }
    return null;
  }

  // kamera, gok, bulutlar, zerreler, yerel oyuncunun sarsintisi / uyarisi, sesler
  _view(dt, camera) {
    const game = this.game, cp = camera.position, st = game.state;
    // menu yorungesi game.attractCamera'da ('sky' ayari: genis, butun adalar gorunur; ustune yazilabilir)
    const inMatch = st === 'playing' || (st === 'paused' && game.actors.includes(game.player));
    this.sky.mesh.position.copy(cp); this.sky.uniforms.uTime.value = this.time;
    this.clouds.position.set(Math.round(cp.x / 8) * 8, CLOUD_Y, Math.round(cp.z / 8) * 8);
    this.cloudU.uTime.value = this.time; this.cloudU.uCam.value.copy(cp);
    const garden = this.isles[1], gup = !!garden && garden.phase === PH.UP, fx = game.fx;
    if (this.falls) { this.falls.visible = gup; this.falls.material.uniforms.uTime.value = this.time; }
    if (this.pond) this.pond.material.uniforms.uTime.value = this.time;
    if (this.mill) this.mill.rotation.x += dt * 0.9;
    this.moteT -= dt;
    if (this.moteT <= 0 && fx && fx.add) {
      this.moteT = 0.12;
      for (let i = 0; i < 2; i++) fx.add.emit(cp.x + (Math.random() - 0.5) * 24, cp.y - 2 + Math.random() * 8, cp.z + (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 0.3, 0.05 + Math.random() * 0.1, (Math.random() - 0.5) * 0.3, 4 + Math.random() * 2, 0.03, 0.03, MOTE0, MOTE1, 0, 0.2, 0);
    }
    if (gup && this.falls && fx && Math.random() < dt * 8) {
      const F = this.def.falls;
      fx.smoke.emit(F.x + (Math.random() - 0.5) * 1.2, CLOUD_Y + 0.4, F.z - 0.4 - Math.random(), (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, -0.3, 2 + Math.random(), 0.6, 1.8, MIST0, MIST1, -0.05, 0.6, 0, Math.random() * 6, 0.2);
    }
    // yerel oyuncu: bastigi ada uyaridaysa sarsinti ve uyari yazisi
    const pl = game.player, alive = !!pl && pl.alive && st === 'playing';
    const mine = alive ? this.isleUnder(pl.mover.pos) : null;
    if (mine && mine.phase === PH.WARN) {
      fx.shake = Math.max(fx.shake, 0.32 + 0.12 * Math.sin(this.time * 31));
      if (!mine.warned) { mine.warned = true; if (game.hud) game.hud.centerMsg(t('skyWarn'), 2.4); }
    } else if (mine && mine.stage >= 2 && dt > 0) fx.shake = Math.max(fx.shake, 0.03 * mine.stage);
    // sesler: yukseklik / bosluk ruzgari, en yakin kristalin ugultusu, sellale
    const au = game.audio;
    if (!au || !au.setSkyHum || (this.ambN = this.ambN + 1) % 6 !== 0) return;
    if (dt <= 0) { au.setWindAmbience(0); au.setSkyHum(0); au.setFallsAmbience(0); return; }
    au.setWindAmbience(Math.min(1, Math.max(0.2, 0.25 + (cp.y - 9) / 18 + (alive && !mine ? 0.35 : 0))));
    let best = null, bd = 26;
    for (const isl of this.isles) {
      if (isl.phase !== PH.UP && isl.phase !== PH.WARN) continue;
      const c = isl.def.crystal, d = Math.hypot(cp.x - c.x, cp.y - (c.y0 + c.y1) / 2, cp.z - c.z);
      if (d < bd) { bd = d; best = isl; }
    }
    if (best) au.setSkyHum(Math.min(1, (1 - bd / 26) * 1.3), 150 + 230 * (1 - best.hp / best.maxHp) + (best.phase === PH.WARN ? 120 : 0));
    else au.setSkyHum(0);
    const F = this.def.falls;
    au.setFallsAmbience(gup && F ? Math.max(0, 1 - Math.hypot(cp.x - F.x, cp.y - 6, cp.z - F.z) / 28) : 0);
  }

  // ---------------------------------------------------------------- efektler (ev sahibinde dogrudan, konukta olaylardan)
  _crumble(isl, n) {
    const fx = this.game.fx, d = isl.def;
    if (!fx || !fx.smoke) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = Math.random() * d.r * 0.6, x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r;
      const y = d.tip + 0.5 + Math.random() * (d.top - d.tip) * 0.4;
      fx.smoke.emit(x, y, z, 0, -0.8, 0, 1.6 + Math.random(), 0.3, 1.1, DUST0, DUST1, 0.4, 0.6, 0, Math.random() * 6, 0.3);
      if (fx.debris) fx.debris.spawn(x, y, z, Math.random() - 0.5, -1 - Math.random() * 2, Math.random() - 0.5, 0.1 + Math.random() * 0.1, ROCK[0], ROCK[1], ROCK[2], 3);
    }
  }
  _stageFx(isl) {
    const game = this.game, c = isl.def.crystal, y = (c.y0 + c.y1) / 2, fx = game.fx, pl = game.player;
    if (game.audio) game.audio.play('crystalCrack', c.x, y, c.z, 1 + isl.stage * 0.15);
    if (fx && fx.lights) fx.lights.flash(c.x, y, c.z, 0xbfefff, 9, 12, 0.25, 2);
    this._crumble(isl, 10 + isl.stage * 4);
    if (pl && pl.alive && game.state === 'playing' && this.isleUnder(pl.mover.pos) === isl) {
      if (fx) fx.addShake(0.45 + isl.stage * 0.12);
      if (game.hud) game.hud.subMsg(t('skyCrack'), 1.6);
    } else if (fx) fx.addShake(0.3, c.x, y, c.z);
  }
  _warnFx(isl) {
    const game = this.game, d = isl.def;
    if (game.audio) { game.audio.play('islandRumble', d.x, d.top - 1, d.z, 1.3); game.audio.play('crystalCrack', d.crystal.x, d.crystal.y1, d.crystal.z, 1.4); }
    isl.fxT = 0;
  }
  _dropFx(isl) {
    const game = this.game, fx = game.fx, c = isl.def.crystal, y = (c.y0 + c.y1) / 2;
    if (game.audio) game.audio.play('crystalShatter', c.x, y, c.z, 1.5);
    if (!fx || !fx.glowDebris) return;
    const lc = linearRGB(MAT_COLOR[c.mat]);
    for (let i = 0; i < 46 * (fx.dm || 1); i++) {
      const a = Math.random() * 6.28, s = 2 + Math.random() * 6;
      fx.glowDebris.spawn(c.x + Math.cos(a) * 0.4, y + (Math.random() - 0.5) * 2, c.z + Math.sin(a) * 0.4, Math.cos(a) * s, -1 + Math.random() * 4, Math.sin(a) * s, 0.12 + Math.random() * 0.14, lc[0] * 4, lc[1] * 4, lc[2] * 4, 1.5 + Math.random());
    }
    if (fx.lights) fx.lights.flash(c.x, y, c.z, 0xcff4ff, 18, 22, 0.5, 3);
    fx.addShake(0.6, c.x, y, c.z);
  }
  // ada bulut denizine gomuldu: vuuus, bulut halkasi
  _splashFx(isl) {
    const game = this.game, fx = game.fx, d = isl.def;
    if (game.audio) game.audio.play('cloudWhoosh', d.x, CLOUD_Y + 1, d.z, 1.6);
    if (!fx || !fx.smoke) return;
    for (let i = 0; i < 38 * (fx.pm || 1); i++) {
      const a = Math.random() * 6.28, r = d.r * (0.7 + Math.random() * 0.5), s = 2 + Math.random() * 4;
      fx.smoke.emit(d.x + Math.cos(a) * r, CLOUD_Y + 0.3, d.z + Math.sin(a) * r, Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, 2.5 + Math.random() * 2, 1.5, 4.5, CLOUD0, CLOUD1, -0.3, 0.8, 0, Math.random() * 6, 0.2);
    }
    fx.addShake(0.5, d.x, CLOUD_Y, d.z);
  }
  _riseFx(isl) {
    const game = this.game, fx = game.fx, d = isl.def;
    if (game.audio) game.audio.play('islandRise', d.x, CLOUD_Y + 2, d.z, 1.4);
    if (fx && fx.smoke) for (let i = 0; i < 24 * (fx.pm || 1); i++) {
      const a = Math.random() * 6.28, r = d.r * Math.random();
      fx.smoke.emit(d.x + Math.cos(a) * r, CLOUD_Y + 0.2, d.z + Math.sin(a) * r, 0, 1 + Math.random() * 2, 0, 3 + Math.random() * 2, 1.2, 3.5, CLOUD0, CLOUD1, -0.1, 0.5, 0, Math.random() * 6, 0.2);
    }
    if (game.hud && game.state === 'playing') game.hud.subMsg(t('skyRise'), 2);
  }
  // bulut denizine dalan mermi (game/projectiles.js): kucuk puf; yetkili taraf konuga da yollar
  get sinkY() { return CLOUD_Y - 0.6; }
  projectileSink(x, z) { this._puff(x, z, 0.3); if (this.auth && this.game.net) this._emit({ k: 'p', x: rnd(x), z: rnd(z) }); }
  _puff(x, z, s) {
    const game = this.game, fx = game.fx;
    if (game.audio) game.audio.play('cloudPoof', x, CLOUD_Y, z, s);
    if (fx && fx.smoke) for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28;
      fx.smoke.emit(x + Math.cos(a) * 0.5, CLOUD_Y + 0.2, z + Math.sin(a) * 0.5, Math.cos(a) * 1.5, 1 + Math.random(), Math.sin(a) * 1.5, 1.6, 0.6 * s + 0.3, 2 * s + 0.5, CLOUD0, CLOUD1, -0.2, 0.8, 0, Math.random() * 6, 0.2);
    }
  }

  // ---------------------------------------------------------------- kurulum: golet yuzeyi, sellale, yel degirmeni kanatlari, ortam
  _buildVisuals(S) {
    const P = S.pond, F = S.falls, Mi = S.mill;
    if (P) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(P.r, 32), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: UV_VS, fragmentShader: POND_FS, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(P.x, P.y, P.z); m.renderOrder = 2; m.name = 'pond';
      this.group.add(m); this.vis.push(m); this.pond = m; this._att(P.isle, m);
    }
    if (F) {
      const h = F.y - CLOUD_Y + 0.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(F.w, h, 1, 1), new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: UV_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(F.x, F.y - h / 2, F.z - 0.06); m.renderOrder = 3; m.name = 'waterfall';
      this.group.add(m); this.vis.push(m); this.falls = m;
    }
    if (Mi) {
      const grp = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x5b3f26, roughness: 0.85 });
      const sail = new THREE.MeshStandardMaterial({ color: 0xece0c8, roughness: 0.95, side: THREE.DoubleSide });
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 12), wood); hub.rotation.z = Math.PI / 2; grp.add(hub);
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group(); arm.rotation.x = k * Math.PI / 2;
        const spar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.1, 0.14), wood); spar.position.y = 2.1; arm.add(spar);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.1, 0.85), sail); cloth.position.set(0.05, 2.4, 0.5); arm.add(cloth);
        grp.add(arm);
      }
      grp.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      grp.position.set(Mi.x + 0.3, Mi.y, Mi.z); grp.name = 'windmillSails';
      this.group.add(grp); this.vis.push(grp); this.mill = grp; this._att(Mi.isle, grp);
    }
  }
  _att(i, obj) { const isl = this.isles[i]; if (isl) isl.att.push({ obj, pos: obj.position.clone(), quat: obj.quaternion.clone() }); }

  // gok, gunes, sis, ortam isigi (game.applyEnvironment varsayilan arena dalindan sonra)
  _applyEnv() {
    const g = this.game, scene = g.scene, E = SKY_ENV;
    if (!this._env) this._env = createIslandEnvironment(g.renderer);
    scene.background = null; scene.environment = this._env; scene.environmentIntensity = E.envIntensity;
    if (g.sky) g.sky.mesh.visible = false;
    this.sky.mesh.visible = true;
    g.sunDir.copy(skyDirs().sun); g.sun.color.set(E.sun); g.sun.intensity = E.sunIntensity;
    scene.fog.color.set(E.fog); scene.fog.density = E.fogDensity;
    g.hemi.color.set(E.hemiSky); g.hemi.groundColor.set(E.hemiGround); g.hemi.intensity = E.hemi;
    if (g.hills) g.hills.visible = false;
    g.sun.position.copy(g.center).addScaledVector(g.sunDir, 90); g.sun.target.position.copy(g.center);
    g.viewmodel.scene.environment = scene.environment;
    for (const P of [g.fx.add, g.fx.smoke]) { P.uniforms.uFogDensity.value = scene.fog.density; P.uniforms.uFogColor.value.copy(scene.fog.color).convertSRGBToLinear(); }
  }
}

const MOTE0 = [1.6, 1.25, 0.8, 0.5], MOTE1 = [1.0, 0.7, 0.45, 0];
const MIST0 = [0.95, 0.93, 0.95, 0.35], MIST1 = [1.0, 0.95, 0.92, 0];
const DUST0 = [0.62, 0.48, 0.36, 0.5], DUST1 = [0.7, 0.6, 0.5, 0];
const CLOUD0 = [1.0, 0.9, 0.85, 0.7], CLOUD1 = [1.0, 0.92, 0.88, 0];
const ROCK = linearRGB(0xb98a5e);
