// Isin / iz efektleri (rayli tufek isini, mermi izleri). Instanced, kameraya donuk seritler.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 iA;
attribute vec3 iB;
attribute vec4 iCol;
attribute float iWidth;
varying vec4 vCol;
varying vec2 vUv;
varying float vDepth;
void main() {
  vec3 A = (modelViewMatrix * vec4(iA, 1.0)).xyz;
  vec3 B = (modelViewMatrix * vec4(iB, 1.0)).xyz;
  vec3 P = mix(A, B, position.x);
  vec3 dir = B - A;
  float L = length(dir);
  dir = L > 1e-5 ? dir / L : vec3(1.0, 0.0, 0.0);
  vec3 side = cross(dir, normalize(P + vec3(0.0, 0.0, 1e-4)));
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(0.0, 1.0, 0.0);
  P += side * position.y * iWidth;
  vUv = vec2(position.x, position.y + 0.5);
  vCol = iCol;
  vDepth = -P.z;
  gl_Position = projectionMatrix * vec4(P, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uFogDensity;
varying vec4 vCol;
varying vec2 vUv;
varying float vDepth;
void main() {
  float x = abs(vUv.y * 2.0 - 1.0);
  float a = (1.0 - x);
  a = a * a * (0.6 + 0.4 * (1.0 - x));
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  gl_FragColor = vec4(vCol.rgb * (1.0 - fogF), vCol.a * a);
}`;

export class Beams {
  constructor(scene, max = 256) {
    this.max = max; this.count = 0;
    this.items = [];
    this.aA = new Float32Array(max * 3);
    this.aB = new Float32Array(max * 3);
    this.aC = new Float32Array(max * 4);
    this.aW = new Float32Array(max);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (arr, n) => { const a = new THREE.InstancedBufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.attA = mk(this.aA, 3); this.attB = mk(this.aB, 3); this.attC = mk(this.aC, 4); this.attW = mk(this.aW, 1);
    geo.setAttribute('iA', this.attA); geo.setAttribute('iB', this.attB); geo.setAttribute('iCol', this.attC); geo.setAttribute('iWidth', this.attW);
    geo.instanceCount = 0;
    this.geo = geo;
    this.uniforms = { uFogDensity: { value: scene.fog ? scene.fog.density : 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    scene.add(this.mesh);
  }

  // color: [r,g,b] lineer HDR; widthEnd: zamanla genisleme
  add(ax, ay, az, bx, by, bz, color, alpha, width, ttl, widthEnd = width) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ ax, ay, az, bx, by, bz, color, alpha, width, widthEnd, ttl, t: 0 });
  }

  update(dt) {
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.t += dt;
      if (it.t < it.ttl) items[w++] = it;
    }
    items.length = w;
    for (let i = 0; i < w; i++) {
      const it = items[i];
      const k = 1 - it.t / it.ttl;
      const i3 = i * 3, i4 = i * 4;
      this.aA[i3] = it.ax; this.aA[i3 + 1] = it.ay; this.aA[i3 + 2] = it.az;
      this.aB[i3] = it.bx; this.aB[i3 + 1] = it.by; this.aB[i3 + 2] = it.bz;
      this.aC[i4] = it.color[0]; this.aC[i4 + 1] = it.color[1]; this.aC[i4 + 2] = it.color[2];
      this.aC[i4 + 3] = it.alpha * k * k;
      this.aW[i] = it.width + (it.widthEnd - it.width) * (1 - k);
    }
    this.geo.instanceCount = w;
    if (w > 0) {
      for (const a of [this.attA, this.attB, this.attC, this.attW]) { a.clearUpdateRanges(); a.addUpdateRange(0, w * a.itemSize); a.needsUpdate = true; }
    }
  }

  clear() { this.items.length = 0; this.geo.instanceCount = 0; }
}
