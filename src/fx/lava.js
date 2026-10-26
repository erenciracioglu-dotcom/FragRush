// Volkan haritasi ortami: akan lav yuzeyi (kendi golgelendiricisi), lav kenarindan yukselen korlar,
// lav kabarciklari, fumarol dumani, havada suzulen kor ve kul, karanlik gokyuzu (kul bulutlari, ufukta
// patlayan volkan) ve bu gokyuzunden uretilen ortam haritasi.
// Lav: harita uretecinin maskesindeki ve lav seviyesinin altindaki her bos voxel (world.isLava).
import * as THREE from 'three';
import { VS } from '../config.js';
import { voxelUniforms } from '../world/voxelMaterial.js';

// isik / sis / gokyuzu ayarlari (game.js applyEnvironment)
export const VOLCANO_ENV = {
  fog: 0x1d1217, fogDensity: 0.0098,
  key: 0xff7a3c, keyIntensity: 2.8,        // ufuktaki patlamanin turuncu isigi (golge atar)
  keyElev: 26, keyAzim: 52,                // derece
  hemiSky: 0x6068b0, hemiGround: 0x5c2410, hemi: 1.5,
  envIntensity: 1.0,
  lavaGlow: 13,                            // voxellere vuran lav isigi (voxelMaterial)
};
// uzak tepeler (environments.js createHills paleti)
export const VOLCANO_HILLS = { near: 0x18120f, far: 0x2a1c22, rock: 0x241d1b };

const NOISE_GLSL = /* glsl */`
float lvHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 lvHash2(vec2 p) { return vec2(lvHash(p), lvHash(p + 17.13)); }
float lvNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lvHash(i), lvHash(i + vec2(1, 0)), f.x), mix(lvHash(i + vec2(0, 1)), lvHash(i + vec2(1, 1)), f.x), f.y);
}
float lvFbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * lvNoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

// ---------------------------------------------------------------- lav yuzeyi
const LAVA_VS = /* glsl */`
varying vec3 vW;
varying float vDepth;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const LAVA_FS = /* glsl */`
uniform float uTime;
uniform sampler2D uTex;      // RG akis, B sicaklik (kiyiya uzaklik), A lav
uniform vec2 uInv;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying vec3 vW;
varying float vDepth;
${NOISE_GLSL}
// hucresel gurultu: x = en yakin hucre merkezine uzaklik, y = iki hucre arasindaki sinira uzaklik
vec2 lvCells(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = lvHash2(n + g);
    o = 0.5 + 0.42 * sin(uTime * 0.35 + 6.2831 * o);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
// erimis lav: kabuk plakalari arasinda akkor catlaklar + kaynayan sicak bolgeler
float lvMolten(vec2 uv, float heat) {
  vec2 c = lvCells(uv * 1.35);
  float crack = 1.0 - smoothstep(0.03, 0.22 + 0.18 * heat, c.y);
  float hot = smoothstep(0.36, 0.7, lvFbm(uv * 0.55 + vec2(uTime * 0.03, -uTime * 0.02)));
  float plate = lvFbm(uv * 2.6) * 0.45;
  return clamp(max(crack, hot * (0.6 + 0.4 * heat)) + plate * heat * 0.55, 0.0, 1.0);
}
void main() {
  vec2 p = vW.xz;
  vec4 T = texture2D(uTex, p * uInv);
  vec2 flow = (T.rg - 0.5) * 2.0;
  float heat = T.b;
  // akis haritasi: iki evreli tasima (desen akis yonunde kayar, kopma olmadan)
  float t = uTime * 0.16;
  float ph0 = fract(t), ph1 = fract(t + 0.5);
  float w0 = 1.0 - abs(2.0 * ph0 - 1.0);
  vec2 off = flow * 3.2;
  float m0 = lvMolten(p - off * ph0, heat);
  float m1 = lvMolten(p - off * ph1 + vec2(3.7, 1.3), heat);
  float m = mix(m1, m0, w0);
  // kiyida soguyan koyu kabuk, ortada parlak akinti
  float edge = smoothstep(0.0, 0.55, heat);
  m *= 0.35 + 0.65 * edge;
  m = clamp(m + 0.25 * (1.0 - edge) * (lvNoise(p * 3.0 + uTime * 0.4) - 0.5), 0.0, 1.0);
  float pulse = 0.85 + 0.15 * sin(uTime * 1.1 + lvNoise(p * 0.3) * 6.2831);
  vec3 crust = vec3(0.09, 0.02, 0.01) * (0.6 + 0.8 * lvFbm(p * 4.0));
  vec3 molten = mix(vec3(1.8, 0.28, 0.03), vec3(3.6, 1.2, 0.2), smoothstep(0.62, 1.0, m));
  vec3 col = mix(crust, molten * pulse, smoothstep(0.06, 0.6, m));
  // kenara cok yakin ince sicak kizillik (kayaya degdigi cizgi)
  col += vec3(1.4, 0.22, 0.03) * (1.0 - smoothstep(0.0, 0.12, heat)) * 0.6;
  // sis: isik saldigi icin sisi kismen deler
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  col = mix(col, uFogColor, fogF * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- karanlik gokyuzu
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */`
uniform float uTime;
uniform vec2 uVolc;     // uzak volkanin yatay yonu (birim)
uniform vec3 uMoonDir;
uniform float uBoost;   // ortam haritasinda parlak noktalari yumusat
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.0045, 0.0045, 0.012);
  vec3 mid = vec3(0.02, 0.009, 0.02);
  vec3 hor = vec3(0.12, 0.028, 0.012);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zen, smoothstep(0.18, 0.75, h));
  vec2 dh = normalize(d.xz + 1e-5);
  float az = dot(dh, uVolc);
  float ang = acos(clamp(az, -1.0, 1.0));
  // volkan yonunde ufuk parlamasi
  float glow = pow(max(az, 0.0), 6.0);
  col += vec3(0.55, 0.11, 0.018) * glow * exp(-max(h, 0.0) * 7.0) * 1.3;
  col += vec3(0.08, 0.02, 0.01) * exp(-abs(h) * 14.0);
  // bulutlar: koyu kul, alttan turuncu aydinlanan
  if (h > -0.02) {
    vec2 uv = d.xz / (max(h, 0.0) + 0.16) * 1.3 + vec2(uTime * 0.006, uTime * 0.003);
    float c = lvFbm(uv);
    c = smoothstep(0.38, 0.8, c) * (1.0 - smoothstep(0.65, 1.0, h));
    vec3 cloud = vec3(0.016, 0.012, 0.016) + vec3(0.32, 0.07, 0.015) * glow * (1.0 - smoothstep(0.0, 0.45, h)) * 1.4
      + vec3(0.06, 0.016, 0.01) * (1.0 - smoothstep(0.0, 0.3, h));
    col = mix(col, cloud, c * 0.85);
    // ay: soluk, kul arkasinda
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.55, 0.6, 0.75) * (smoothstep(0.99975, 0.9999, md) * 1.6 + pow(md, 80.0) * 0.05) * (1.0 - c * 0.9) * uBoost;
  }
  // uzak volkan: ice bukuk yamacli koni, kucuk duz krater, yamaclarda akan dort lav damari, krater
  // agzindan ruzgarla egilerek yukselen ve alttan akkor aydinlanan duman sutunu; onunde alcak sirtlar
  float sa = sign(dh.x * uVolc.y - dh.y * uVolc.x) * ang;   // isaretli aci (volkan merkezine gore)
  float halfW = 0.42, peak = 0.21;
  float u = ang / halfW;
  float prof = min(peak * pow(clamp(1.0 - u, 0.0, 1.0), 1.35), peak * 0.92);
  prof += 0.004 * (lvNoise(vec2(ang * 60.0, 3.0)) - 0.5);
  float ridge = 0.025 + 0.03 * lvFbm(vec2(atan(d.z, d.x) * 2.2 + 4.0, 1.7));
  if (h < max(prof, ridge)) {
    vec3 rock = vec3(0.011, 0.007, 0.008) + vec3(0.05, 0.012, 0.004) * glow;
    if (prof > ridge) {
      float hn = clamp(h / (peak * 0.92), 0.0, 1.0);
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float s0 = (fi - 1.5) * 0.11 + 0.02 * sin(fi * 4.1);
        float c = s0 * (1.0 - hn) * 1.6 + 0.01 * sin(h * 80.0 + fi * 2.3);
        float wd = 0.004 + 0.008 * (1.0 - hn);
        float st = 1.0 - smoothstep(wd * 0.4, wd, abs(sa - c));
        float fade = smoothstep(0.08, 0.55, hn) * (0.55 + 0.45 * lvNoise(vec2(h * 50.0 - uTime * 0.3, fi * 7.0)));
        rock += vec3(5.0, 0.9, 0.1) * st * fade * uBoost;
      }
      // krater agzi: tepede parlak serit
      rock += vec3(6.0, 1.6, 0.22) * smoothstep(prof - 0.012, prof, h) * (1.0 - smoothstep(0.02, 0.07, ang)) * uBoost;
    }
    col = rock;
  } else if (abs(sa) < 0.6 && h > peak * 0.85 && h < 0.8) {
    float ph = h - peak * 0.9;
    float cx = ph * 0.45;                              // ruzgar: yukseldikce yana kayar
    float wdt = 0.03 + max(ph, 0.0) * 0.42;
    float n = lvFbm(vec2((sa - cx) * 9.0, ph * 9.0 - uTime * 0.04));
    float dist = abs(sa - cx) / wdt + (n - 0.5) * 0.7;
    float plume = (1.0 - smoothstep(0.55, 1.0, dist)) * smoothstep(0.8, 0.4, h) * smoothstep(-0.02, 0.01, ph);
    vec3 pc = mix(vec3(1.5, 0.34, 0.05), vec3(0.03, 0.02, 0.022), smoothstep(0.0, 0.09, ph)) * (0.55 + 0.6 * n);
    col = mix(col, pc, plume * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createVolcanoSky() {
  const az = THREE.MathUtils.degToRad(VOLCANO_ENV.keyAzim);
  const uniforms = {
    uTime: { value: 0 },
    uVolc: { value: new THREE.Vector2(Math.sin(az), Math.cos(az)) },
    uMoonDir: { value: new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), az + Math.PI * 0.85) },
    uBoost: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'volcanoSky';
  mesh.visible = false;
  return { mesh, uniforms };
}

// gokyuzunden ortam haritasi (PMREM): obsidyenin ve metalin yansimalari
export function createVolcanoEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = createVolcanoSky();
  sky.uniforms.uBoost.value = 0.35;
  sky.mesh.visible = true;
  sky.mesh.material.depthTest = true;
  s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose();
  sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}

// gunes yonu (anahtar isik): volkanin ufuktaki parlamasi
export function volcanoKeyDir(out = new THREE.Vector3()) {
  return out.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - VOLCANO_ENV.keyElev), THREE.MathUtils.degToRad(VOLCANO_ENV.keyAzim));
}

// ---------------------------------------------------------------- sistem
const rnd = (a, b) => a + Math.random() * (b - a);
const E0 = [6, 1.7, 0.28, 1], E1 = [1.4, 0.18, 0.02, 0];
const B0 = [5, 1.2, 0.15, 1], B1 = [1.2, 0.12, 0.01, 0];
const S0 = [0.13, 0.09, 0.08, 0.28], S1 = [0.05, 0.045, 0.045, 0];
const V0 = [0.34, 0.32, 0.31, 0.32], V1 = [0.18, 0.17, 0.17, 0];
const A0 = [0.36, 0.34, 0.34, 0.6], A1 = [0.26, 0.25, 0.25, 0];
const F0 = [4, 1.1, 0.18, 1], F1 = [1, 0.08, 0.0, 0];

export class LavaSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.level = -1e9;
    this.mesh = null;
    this.tex = null;
    this.glowTex = null;
    this.points = null;
    this.vents = [];
    this.mask = null;
    this.sx = 0; this.sz = 0;
    this.popT = 0; this.ventT = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTex: { value: null },
        uInv: { value: new THREE.Vector2(1, 1) },
        uFogColor: { value: new THREE.Color(0) },
        uFogDensity: { value: 0 },
      },
      vertexShader: LAVA_VS, fragmentShader: LAVA_FS,
    });
  }

  // def: volcano.js lavaData() ciktisi
  setup(def) {
    this.disable();
    const world = this.game.world;
    this.def = def;
    this.level = def.y;
    this.mask = def.mask;
    this.sx = def.width; this.sz = def.height;
    this.points = def.points;
    this.vents = this.game.arena.vents || [];
    // yuzey: maskeyi kaplayan dikdortgenler (lav seviyesinde, kiyi altinda kalan kisimlari derinlik testi gizler)
    const geo = maskGeometry(def.mask, def.width, def.height, def.y);
    if (this.mesh) { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'lava';
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.game.scene.add(this.mesh);
    // akis / sicaklik dokusu ve voxellere vuran isik haritasi
    if (this.tex) this.tex.dispose();
    this.tex = new THREE.DataTexture(def.tex.data, def.tex.width, def.tex.height, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    if (this.glowTex) this.glowTex.dispose();
    this.glowTex = new THREE.DataTexture(def.glow.data, def.glow.width, def.glow.height, THREE.RedFormat);
    this.glowTex.magFilter = THREE.LinearFilter; this.glowTex.minFilter = THREE.LinearFilter;
    this.glowTex.needsUpdate = true;
    const u = this.material.uniforms;
    u.uTex.value = this.tex;
    u.uInv.value.set(1 / def.size[0], 1 / def.size[1]);
    voxelUniforms.uLavaOn.value = 1;
    voxelUniforms.uLavaY.value = def.y;
    voxelUniforms.uLavaGlowI.value = VOLCANO_ENV.lavaGlow;
    voxelUniforms.uLavaInv.value.set(1 / def.size[0], 1 / def.size[1]);
    voxelUniforms.uLavaGlow.value = this.glowTex;
    world.lavaY = def.y;
    world.lavaMask = def.mask;
    this.active = true;
  }

  disable() {
    this.active = false;
    if (this.game.audio && this.game.audio.stopLavaAmbience) this.game.audio.stopLavaAmbience();
    this.level = -1e9;
    if (this.mesh) this.mesh.visible = false;
    voxelUniforms.uLavaOn.value = 0;
    const w = this.game.world;
    if (w) { w.lavaY = -Infinity; w.lavaMask = null; }
  }

  // (x,z) kolonu lav maskesinde mi (metre)
  inMask(x, z) {
    if (!this.mask) return false;
    const X = Math.floor(x / VS), Z = Math.floor(z / VS);
    if (X < 0 || Z < 0 || X >= this.sx || Z >= this.sz) return false;
    return this.mask[X + this.sx * Z] === 1;
  }

  // (x,y,z) noktasinda lav var mi: seviyenin altinda, maskede ve bos voxel
  isLava(x, y, z) {
    if (!this.active || y >= this.level) return false;
    if (!this.inMask(x, z)) return false;
    return !this.game.world.solidAtWorld(x, y, z);
  }

  // ayaklari lavda mi: ayak seviyesi lav yuzeyinin hemen ustunden asagida ve altindaki voxel lav
  actorInLava(m) {
    if (!this.active) return false;
    const p = m.pos;
    if (p.y > this.level + 0.08) return false;
    // ayagin hemen ustundeki nokta: yatakta duran aktorun ayak hizasi lavin icinde kalir
    return this.isLava(p.x, Math.min(p.y + 0.05, this.level - 0.05), p.z);
  }

  // dogru parcasi lav yuzeyini kesiyor mu: kesisim parametresi (0..len) ya da -1
  cross(ox, oy, oz, dx, dy, dz, len) {
    if (!this.active || Math.abs(dy) < 1e-4) return -1;
    const t = (this.level - oy) / dy;
    if (t <= 0.02 || t >= len) return -1;
    const x = ox + dx * t, z = oz + dz * t;
    return this.isLava(x, this.level - 0.05, z) ? t : -1;
  }

  update(dt, camera) {
    if (!this.active) return;
    const game = this.game, fx = game.fx;
    const time = game.time;
    this.material.uniforms.uTime.value = time;
    const fog = game.scene.fog;
    this.material.uniforms.uFogDensity.value = fog.density;
    this.material.uniforms.uFogColor.value.copy(fog.color);   // Three rengi zaten lineer calisma uzayinda tutar
    // ortam ugultusu: durakladiginda sus, yoksa 6 karede bir yakinligi guncelle
    const au = game.audio;
    if (au && au.setLavaAmbience) {
      if (dt <= 0) au.setLavaAmbience(0);
      else if ((this.ambN = (this.ambN || 0) + 1) % 6 === 0) au.setLavaAmbience(this.ambience(camera.position));
    }
    if (dt <= 0) return;
    const c = camera.position, pm = fx.pm;
    const L = this.level, pts = this.points, n = pts.length / 2;
    // lavdan yukselen korlar (kameraya yakin noktalardan)
    let emit = 38 * pm * dt;
    for (let k = 0; k < 12 && emit > 0; k++) {
      if (emit < 1 && Math.random() > emit) break;
      emit -= 1;
      const i = (Math.random() * n) | 0;
      const x = pts[i * 2] + rnd(-0.2, 0.2), z = pts[i * 2 + 1] + rnd(-0.2, 0.2);
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) > 1600) continue;
      fx.add.emit(x, L + 0.04, z, rnd(-0.25, 0.25), rnd(0.7, 2.2), rnd(-0.25, 0.25), rnd(1.2, 2.8), 0.035, 0.012, E0, E1, -0.25, 0.5, 0.015);
    }
    // lavin ustunde ince duman
    if (Math.random() < 3.5 * pm * dt) {
      const i = (Math.random() * n) | 0;
      const x = pts[i * 2], z = pts[i * 2 + 1];
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < 2500) {
        fx.smoke.emit(x, L + 0.3, z, rnd(-0.2, 0.2), rnd(0.5, 1.1), rnd(-0.2, 0.2), rnd(3, 5), 0.5, 2.4, S0, S1, -0.05, 0.25, 0, Math.random() * 6, rnd(-0.3, 0.3));
      }
    }
    // kabarcik patlamasi: turuncu damlalar + kucuk isik + ses
    this.popT -= dt;
    if (this.popT <= 0) {
      this.popT = rnd(0.25, 0.7);
      for (let tries = 0; tries < 6; tries++) {
        const i = (Math.random() * n) | 0;
        const x = pts[i * 2], z = pts[i * 2 + 1];
        const d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
        if (d2 > 900) continue;
        this.bubble(x, z, rnd(0.5, 1));
        break;
      }
    }
    // fumarol dumani
    this.ventT -= dt;
    if (this.ventT <= 0) {
      this.ventT = 0.12 / Math.max(0.3, pm);
      for (const v of this.vents) {
        if ((v[0] - c.x) * (v[0] - c.x) + (v[2] - c.z) * (v[2] - c.z) > 2500) continue;
        fx.smoke.emit(v[0] + rnd(-0.1, 0.1), v[1] + 0.2, v[2] + rnd(-0.1, 0.1), rnd(-0.15, 0.25), rnd(1.4, 2.4), rnd(-0.15, 0.2), rnd(3, 5), 0.35, 2.2, V0, V1, -0.1, 0.3, 0, Math.random() * 6, rnd(-0.4, 0.4));
        if (Math.random() < 0.3) fx.add.emit(v[0], v[1] + 0.1, v[2], rnd(-0.3, 0.3), rnd(1.5, 3), rnd(-0.3, 0.3), rnd(0.6, 1.4), 0.03, 0.01, E0, E1, -0.4, 0.4, 0.01);
      }
    }
    // havada suzulen korlar ve dusen kul (kamera cevresinde)
    let em = 9 * pm * dt;
    while (em > 0) {
      if (em < 1 && Math.random() > em) break;
      em -= 1;
      const x = c.x + rnd(-16, 16), z = c.z + rnd(-16, 16), y = c.y + rnd(-2, 7);
      fx.add.emit(x, y, z, rnd(0.2, 0.7), rnd(0.1, 0.6), rnd(-0.2, 0.4), rnd(2.5, 5), 0.028, 0.012, F0, F1, -0.05, 0.1, 0);
    }
    let ash = 22 * pm * dt;
    while (ash > 0) {
      if (ash < 1 && Math.random() > ash) break;
      ash -= 1;
      const x = c.x + rnd(-15, 15), z = c.z + rnd(-15, 15), y = c.y + rnd(4, 9);
      fx.smoke.emit(x, y, z, rnd(0.25, 0.6), rnd(-0.85, -0.45), rnd(0.0, 0.35), rnd(6, 9), 0.035, 0.03, A0, A1, 0, 0, 0, Math.random() * 6, rnd(-2, 2));
    }
  }

  // kameranin cevresindeki lav miktari -> 0..1 (ortam sesi): golet kiyisinda ~1, dere kenarinda ~0.3
  ambience(c) {
    const pts = this.points, n = pts.length / 2;
    let s = 0;
    for (let i = 0; i < n; i += 2) {
      const dx = pts[i * 2] - c.x, dz = pts[i * 2 + 1] - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 900) s += 1 / (1 + d2 * 0.04);
    }
    const dy = Math.max(0, c.y - this.level - 1.5);
    return Math.min(1, s / 40) * Math.exp(-dy * 0.06);
  }

  // lav kabarcigi (x,z metre): damlalar, duman, kisa isik, ses
  bubble(x, z, k = 1) {
    const game = this.game, fx = game.fx, L = this.level;
    const nb = Math.round((5 + 6 * k) * fx.pm) + 2;
    for (let i = 0; i < nb; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.3, 1.2) * k;
      fx.add.emit(x, L + 0.05, z, Math.cos(a) * s, rnd(1.6, 3.6) * k, Math.sin(a) * s, rnd(0.4, 0.85), 0.05 * k + 0.02, 0.02, B0, B1, 9, 0.2, 0.01);
    }
    fx.smoke.emit(x, L + 0.2, z, 0, rnd(0.4, 0.8), 0, rnd(1.5, 2.5), 0.2, 0.9 * k, S0, S1, -0.1, 0.4, 0, Math.random() * 6, 0);
    fx.lights.flash(x, L + 0.5, z, 0xff6a1e, 2.5 * k, 4, 0.35, 0);
    if (game.audio) game.audio.play('lavaPop', x, L, z, 0.55 * k);
  }

  // lav yuzeyine carpma (mermi, roket, dusen aktor): sicrayan lav + kor + duman
  splash(x, z, power = 1) {
    const game = this.game, fx = game.fx, L = this.level;
    const k = Math.sqrt(power);
    const n = Math.round((10 + 26 * power) * fx.pm) + 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(0.5, 2.6) * k;
      fx.add.emit(x + Math.cos(a) * 0.1, L + 0.05, z + Math.sin(a) * 0.1, Math.cos(a) * s, rnd(2.5, 6.5) * k, Math.sin(a) * s, rnd(0.5, 1.1), 0.06 * k + 0.02, 0.025, B0, B1, 12, 0.3, 0.012);
    }
    for (let i = 0; i < Math.round(4 * power * fx.pm) + 1; i++) {
      fx.smoke.emit(x + rnd(-0.3, 0.3), L + 0.2, z + rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(0.8, 1.8), rnd(-0.4, 0.4), rnd(1.8, 3.2), 0.3 * k, 1.6 * k, S0, S1, -0.2, 0.5, 0, Math.random() * 6, rnd(-0.5, 0.5));
    }
    fx.lights.flash(x, L + 0.8, z, 0xff5a14, 6 * k, 6 * k, 0.4, 1);
  }

  // aktor lava dustu: alev, kara duman, kor
  burn(x, y, z) {
    const fx = this.game.fx, L = this.level;
    this.splash(x, z, 1.6);
    for (let i = 0; i < Math.round(26 * fx.pm) + 6; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0, 0.35);
      fx.add.emit(x + Math.cos(a) * r, L + rnd(0.1, 1.2), z + Math.sin(a) * r, rnd(-0.4, 0.4), rnd(1.5, 4), rnd(-0.4, 0.4), rnd(0.4, 0.9), rnd(0.2, 0.35), rnd(0.5, 0.8), [3.2, 1.2, 0.25, 0.9], [0.5, 0.06, 0.01, 0], -1.5, 2, 0, Math.random() * 6, rnd(-2, 2));
    }
    for (let i = 0; i < Math.round(10 * fx.pm) + 3; i++) {
      fx.smoke.emit(x + rnd(-0.3, 0.3), L + rnd(0.4, 1.5), z + rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(1.2, 2.4), rnd(-0.3, 0.3), rnd(2.5, 4.5), 0.4, 2.2, [0.05, 0.04, 0.04, 0.7], [0.03, 0.03, 0.03, 0], -0.3, 0.6, 0, Math.random() * 6, rnd(-0.5, 0.5));
    }
    fx.lights.flash(x, L + 1.2, z, 0xff6a1e, 14, 9, 0.6, 2);
    fx.addShake(0.15, x, y, z);
  }
}

// maskeyi kaplayan dikdortgenler (aç gozlu birlestirme) -> lav seviyesinde yatay duzlem parcalari
function maskGeometry(mask, sx, sz, y) {
  const used = new Uint8Array(sx * sz);
  const pos = [], idx = [];
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const c = x + sx * z;
    if (!mask[c] || used[c]) continue;
    let w = 1;
    while (x + w < sx && mask[c + w] && !used[c + w]) w++;
    let h = 1;
    outer: while (z + h < sz) {
      for (let k = 0; k < w; k++) { const j = x + k + sx * (z + h); if (!mask[j] || used[j]) break outer; }
      h++;
    }
    for (let zz = 0; zz < h; zz++) for (let k = 0; k < w; k++) used[x + k + sx * (z + zz)] = 1;
    const x0 = x * VS, x1 = (x + w) * VS, z0 = z * VS, z1 = (z + h) * VS;
    const v = pos.length / 3;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
