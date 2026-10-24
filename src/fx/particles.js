// CPU benzetimli, GPU'da instanced billboard parcaciklar (kivilcim, ates, duman, toz, parlama).
import * as THREE from 'three';

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

function makeSmokeTexture() {
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  // basit deger gurultusu katmanlari
  const rnd = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = rnd(xi, yi), b = rnd(xi + 1, yi), cc = rnd(xi, yi + 1), d = rnd(xi + 1, yi + 1);
    return a + (b - a) * u + (cc - a) * v + (a - b - cc + d) * u * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    let n = 0, a = 0.5, f = 4;
    for (let o = 0; o < 4; o++) { n += a * noise(x / S * f, y / S * f); a *= 0.5; f *= 2; }
    const fall = Math.max(0, 1 - r);
    const alpha = Math.max(0, Math.min(1, (fall * fall * (0.55 + n * 0.9)) * 1.3 - 0.1));
    const i = (y * S + x) * 4;
    const sh = 200 + n * 55;
    img.data[i] = sh; img.data[i + 1] = sh; img.data[i + 2] = sh; img.data[i + 3] = alpha * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec4 iCol;
attribute vec3 iSize;
varying vec4 vCol;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 corner = position.xy;
  vUv = position.xy + 0.5;
  float size = iSize.x;
  if (iSize.y > 0.0) {
    vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float l = length(d);
    vec2 dir = l > 1e-4 ? d / l : vec2(1.0, 0.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size + l * iSize.y;
    mv.xy += dir * corner.x * len + perp * corner.y * size;
  } else {
    float c = cos(iSize.z), s = sin(iSize.z);
    mv.xy += mat2(c, s, -s, c) * corner * size;
  }
  vCol = iCol;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
uniform float uFogDensity;
uniform vec3 uFogColor;
uniform float uAdditive;
varying vec4 vCol;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec4 t = texture2D(map, vUv);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  float a = vCol.a * t.a;
  if (a < 0.003) discard;
  vec3 col = vCol.rgb * t.rgb;
  if (uAdditive > 0.5) { col *= (1.0 - fogF); }
  else { col = mix(col, uFogColor, fogF * 0.85); }
  // yakin kamera solmasi: kameranin dibindeki parlak parcaciklar ekrani beyaza boyamasin
  a *= smoothstep(0.35, 2.2, vDepth);
  gl_FragColor = vec4(col, a);
}`;

export class Particles {
  constructor(scene, max, { additive = true, texture = 'glow', renderOrder = 10 } = {}) {
    this.max = max; this.count = 0;
    const F = (n = max) => new Float32Array(n);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.life = F(); this.ttl = F();
    this.s0 = F(); this.s1 = F();
    this.grav = F(); this.drag = F(); this.stretch = F(); this.rot = F(); this.rotV = F();
    this.c0 = F(max * 4); this.c1 = F(max * 4);
    this.aPos = new Float32Array(max * 3);
    this.aVel = new Float32Array(max * 3);
    this.aCol = new Float32Array(max * 4);
    this.aSize = new Float32Array(max * 3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.attrPos = mk(this.aPos, 3); this.attrVel = mk(this.aVel, 3); this.attrCol = mk(this.aCol, 4); this.attrSize = mk(this.aSize, 3);
    geo.setAttribute('iPos', this.attrPos);
    geo.setAttribute('iVel', this.attrVel);
    geo.setAttribute('iCol', this.attrCol);
    geo.setAttribute('iSize', this.attrSize);
    geo.instanceCount = 0;
    this.geo = geo;
    const tex = texture === 'smoke' ? makeSmokeTexture() : makeGlowTexture();
    this.uniforms = {
      map: { value: tex },
      uFogDensity: { value: scene.fog ? scene.fog.density : 0 },
      uFogColor: { value: scene.fog ? scene.fog.color.clone().convertSRGBToLinear() : new THREE.Color(0) },
      uAdditive: { value: additive ? 1 : 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);
  }

  // c0/c1: [r,g,b,a] (lineer, HDR olabilir)
  emit(x, y, z, vx, vy, vz, ttl, s0, s1, c0, c1, grav = 0, drag = 0, stretch = 0, rot = 0, rotV = 0) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = 0; this.ttl[i] = ttl;
    this.s0[i] = s0; this.s1[i] = s1;
    this.grav[i] = grav; this.drag[i] = drag; this.stretch[i] = stretch;
    this.rot[i] = rot; this.rotV[i] = rotV;
    const o = i * 4;
    this.c0[o] = c0[0]; this.c0[o + 1] = c0[1]; this.c0[o + 2] = c0[2]; this.c0[o + 3] = c0[3];
    this.c1[o] = c1[0]; this.c1[o + 1] = c1[1]; this.c1[o + 2] = c1[2]; this.c1[o + 3] = c1[3];
    return i;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
    this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
    this.life[i] = this.life[j]; this.ttl[i] = this.ttl[j];
    this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.stretch[i] = this.stretch[j];
    this.rot[i] = this.rot[j]; this.rotV[i] = this.rotV[j];
    for (let k = 0; k < 4; k++) { this.c0[i * 4 + k] = this.c0[j * 4 + k]; this.c1[i * 4 + k] = this.c1[j * 4 + k]; }
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      const l = this.life[i] + dt;
      if (l >= this.ttl[i]) { this._kill(i); continue; }
      this.life[i] = l;
      const d = this.drag[i];
      if (d > 0) { const f = Math.exp(-d * dt); this.vx[i] *= f; this.vy[i] *= f; this.vz[i] *= f; }
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.rotV[i] * dt;
      i++;
    }
    const n = this.count;
    const P = this.aPos, V = this.aVel, C = this.aCol, S = this.aSize;
    for (let k = 0; k < n; k++) {
      const t = this.life[k] / this.ttl[k];
      const k3 = k * 3, k4 = k * 4;
      P[k3] = this.px[k]; P[k3 + 1] = this.py[k]; P[k3 + 2] = this.pz[k];
      const st = this.stretch[k];
      if (st > 0) { V[k3] = this.vx[k]; V[k3 + 1] = this.vy[k]; V[k3 + 2] = this.vz[k]; }
      const c0 = this.c0, c1 = this.c1;
      C[k4] = c0[k4] + (c1[k4] - c0[k4]) * t;
      C[k4 + 1] = c0[k4 + 1] + (c1[k4 + 1] - c0[k4 + 1]) * t;
      C[k4 + 2] = c0[k4 + 2] + (c1[k4 + 2] - c0[k4 + 2]) * t;
      // alfa: hizli giris, yumusak cikis
      const fadeIn = Math.min(1, t * 12);
      C[k4 + 3] = (c0[k4 + 3] + (c1[k4 + 3] - c0[k4 + 3]) * t) * fadeIn;
      S[k3] = this.s0[k] + (this.s1[k] - this.s0[k]) * (1 - (1 - t) * (1 - t));
      S[k3 + 1] = st; S[k3 + 2] = this.rot[k];
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      this.attrPos.clearUpdateRanges(); this.attrPos.addUpdateRange(0, n * 3); this.attrPos.needsUpdate = true;
      this.attrVel.clearUpdateRanges(); this.attrVel.addUpdateRange(0, n * 3); this.attrVel.needsUpdate = true;
      this.attrCol.clearUpdateRanges(); this.attrCol.addUpdateRange(0, n * 4); this.attrCol.needsUpdate = true;
      this.attrSize.clearUpdateRanges(); this.attrSize.addUpdateRange(0, n * 3); this.attrSize.needsUpdate = true;
    }
  }

  clear() { this.count = 0; this.geo.instanceCount = 0; }
}
