// water.js (src/vendor) ile Three.js arasi kopru: su yuzeyi, su ici gorunumu, lense sicrayan su,
// gokyuzu kup haritasindan Three.js arka plani ve ortam isigi.
// water.js ham WebGL2 cagrilari yapar; her kullanimdan sonra renderer.resetState() ile Three'nin durum
// onbellegi sifirlanir. Gecisler postprocessing EffectComposer zincirine girer (post.js).
import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { Water, Sky, WaterGLSL, bindMedium, bindLens, bindEnvironment, createProgram, createDataTexture } from '../vendor/water.js';

// FragRush kalitesi -> water.js kalitesi
const WATER_Q = { ultra: 'high', high: 'medium', medium: 'low', low: 'low' };

const FS_VS = /* glsl */ `
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Kamera su altindayken (ya da su cizgisindeyken) su altindaki sahne: kirilan gunes + kostik,
// sonra kameradan noktaya kadar su icinden gecis. Su yuzeyinin kendi pikselleri (alttan bakis)
// water.js tarafindan zaten cizildi: suyun derinligi sahneninkinden yakin olan pikseller atlanir.
const MEDIUM_FS = /* glsl */ `
precision highp float;
precision highp int;
${WaterGLSL.environment}
${WaterGLSL.medium}
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uColor;
uniform sampler2D uDepth;        // su dahil
uniform sampler2D uSceneDepth;   // yalniz sahne (su cizilmeden once)
uniform mat4 uInvViewProj;
void main() {
  vec3 c = texture(uColor, vUv).rgb;
  float d = texture(uDepth, vUv).r;
  float ds = texture(uSceneDepth, vUv).r;
  if (d < ds - 1.0e-7 || d >= 1.0) { fragColor = vec4(c, 1.0); return; }   // su yuzeyi ya da gokyuzu
  vec4 p = uInvViewProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 wp = p.xyz / p.w;
  float below = uMedLevel - wp.y;
  {
    if (below > 0.0) c = underwaterSun(c, wp, below) + 0.25 * flashIrradiance(wp);
    vec3 V = wp - uMedCam;
    float dist = length(V);
    vec3 dir = V / max(dist, 1.0e-6);
    vec3 sg = waterNearSGrad(gl_FragCoord.xy * uNearGrid.zw);
    float sd = uNearInfo.x < 1.5 ? -1.0e4 : sg.x / max(length(sg.yz), 1.0e-7);
    if (sd < 0.75) {
      float t0 = uNearInfo.x > 1.5 ? uMedFwd.w / max(dot(dir, uMedFwd.xyz), 1.0e-3) : 0.0;
      float dw = max(dist - t0, 0.0);
      vec3 wat = waterSegment(c, max(-sg.x, 0.0), dir, dw) + flashGlow(uMedCam + dir * t0, dir, dw);
      c = mix(wat, c, smoothstep(-0.75, 0.75, sd));
    }
  }
  fragColor = vec4(c, 1.0);
}`;

// Lense sicrayan su + su cizgisinde ince koyu cizgi (silah modeli de dahil, en son HDR gecisi)
const LENS_FS = /* glsl */ `
precision highp float;
precision highp int;
${WaterGLSL.near}
${WaterGLSL.lens}
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uColor;
vec3 tap(vec2 uv) { return min(textureLod(uColor, uv, 0.0).rgb, vec3(24.0)); }
void main() {
  WaterLens L = waterLens(vUv);
  vec2 uv = vUv + L.offset;
  vec3 c;
  if (L.blur.x > 0.0) {
    vec2 b = L.blur * 0.5;
    vec3 h = vec3(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      float w = float((2 - abs(i)) * (2 - abs(j)));
      h += w * tap(uv + vec2(float(i), float(j)) * b);
    }
    c = h / 16.0;
  } else c = textureLod(uColor, uv, 0.0).rgb;
  if (uNearInfo.x > 1.5) {
    vec3 sg = waterNearSGrad(uv);
    float gn = max(length(sg.yz), 1.0e-7);
    float sd = sg.x / gn;
    if (abs(sd) < 3.0) {
      vec2 nrm = sg.yz / gn * uNearGrid.zw;
      vec3 air = tap(uv + nrm * (4.0 - sd));
      vec3 wat = tap(uv - nrm * (4.0 + sd));
      c = mix(wat, air, smoothstep(-0.8, 0.8, sd));
    }
    c *= 1.0 - 0.45 * exp(-sd * sd / 1.2) * vec3(1.0, 0.9, 0.78);
  }
  c = c * L.shade + L.glint * 0.35;
  fragColor = vec4(c, 1.0);
}`;

function glTex(renderer, tex) { return renderer.properties.get(tex).__webglTexture; }
function glFbo(renderer, rt) { return renderer.properties.get(rt).__webglFramebuffer; }

// ---------------------------------------------------------------- gecisler
class WaterSurfacePass extends Pass {
  constructor(sys, composer) {
    super('WaterSurfacePass');
    this.sys = sys; this.composer = composer;
    this.needsSwap = false;
    this.needsDepthTexture = true;
    this.depthTexture = null;
  }
  setDepthTexture(t) { this.depthTexture = t; }
  render(renderer, inputBuffer) {
    const sys = this.sys;
    if (!sys.active || !this.depthTexture) return;
    const gl = renderer.getContext();
    renderer.setRenderTarget(inputBuffer);
    const w = inputBuffer.width, h = inputBuffer.height;
    const dst = glFbo(renderer, inputBuffer);
    const drt = this.composer.depthRenderTarget;
    const depthTex = glTex(renderer, this.depthTexture);
    if (!dst || !drt || !depthTex) return;
    // 1) once AO gibi gecisler tamponu degistirdiyse: sahne derinligini (su olmadan) geri koy
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, glFbo(renderer, drt));
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    // 2) kirilma icin sahne renginin yarim cozunurluklu kopyasi
    const cp = sys._copyTarget(w >> 1, h >> 1);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dst);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, cp.fbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, cp.w, cp.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    // 3) su yuzeyi + patlama spreyi / kabarcik, ayni tampona derinlik testiyle
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst);
    gl.viewport(0, 0, w, h);
    sys.water.render(sys.cam, { sceneColor: cp.tex, sceneDepth: depthTex, width: w, height: h });
    sys.water.renderEffects(sys.cam);
    renderer.resetState();
  }
}

class WaterFullscreenPass extends Pass {
  constructor(sys, name, fs, sceneDepth = false) {
    super(name);
    this.sys = sys;
    this.fs = fs;
    this.prog = null;
    this.enabled = false;
    this.needsDepthTexture = sceneDepth;
    this.sceneDepth = null;
  }
  setDepthTexture(t) { this.sceneDepth = t; }
  render(renderer, inputBuffer, outputBuffer) {
    const sys = this.sys, gl = renderer.getContext();
    if (!this.prog) this.prog = createProgram(gl, FS_VS, this.fs);
    renderer.setRenderTarget(outputBuffer);
    const w = outputBuffer.width, h = outputBuffer.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, glFbo(renderer, outputBuffer));
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    const p = this.prog, u = p.u;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTex(renderer, inputBuffer.texture));
    gl.uniform1i(u.uColor, 0);
    if (u.uDepth) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glTex(renderer, inputBuffer.depthTexture));
      gl.uniform1i(u.uDepth, 1);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, glTex(renderer, this.sceneDepth));
      gl.uniform1i(u.uSceneDepth, 3);
      gl.uniformMatrix4fv(u.uInvViewProj, false, sys._ivp);
      bindEnvironment(gl, u, sys.water.env, 2);
    }
    bindMedium(gl, u, sys.water, 13, { width: w, height: h });
    if (u.uLensMap) bindLens(gl, u, sys.water, 12);
    gl.bindVertexArray(sys._vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    renderer.resetState();
  }
  dispose() {
    if (this.prog) this.sys.gl.deleteProgram(this.prog.program);
    this.prog = null;
  }
}

// ---------------------------------------------------------------- sistem
export class WaterSystem {
  constructor(game) {
    this.game = game;
    this.renderer = game.renderer;
    this.gl = this.renderer.getContext();
    this.water = null;
    this.sky = null;
    this.active = false;
    this.def = null;
    this.level = -1e9;
    this.cam = { view: new Float32Array(16), projection: new Float32Array(16), position: [0, 0, 0] };
    this._ivp = new Float32Array(16);
    this._m4 = new THREE.Matrix4();
    this._vao = this.gl.createVertexArray();
    this._copy = null;
    this.passes = null;
    this.underwater = false;
  }

  // def: { y (m), flow, depth, water: {preset, params}, sky: {...}, worldSize: [x, z] }
  setup(def, quality) {
    const gl = this.gl;
    const wq = WATER_Q[quality] || 'low';
    const same = this.water && this.wq === wq && this.def && this.def.water === def.water;
    if (!same) {
      if (this.water) this.water.dispose();
      this.water = new Water(gl, {
        preset: def.water.preset, params: def.water.params, quality: wq,
        shape: { type: 'rect', center: [def.worldSize[0] / 2, def.worldSize[1] / 2], size: def.worldSize },
        level: def.y, explosions: true, ripples: { size: 26, resolution: wq === 'low' ? 192 : 256 },
      });
      this.wq = wq;
    }
    this.def = def;
    this.level = this.water.level = def.y;
    if (this._flowTex) gl.deleteTexture(this._flowTex);
    if (this._depthTex) gl.deleteTexture(this._depthTex);
    this._flowTex = this._depthTex = null;
    if (def.flow) {
      const f = def.flow;
      this._flowTex = createDataTexture(gl, f.data, f.width, f.height, 4);
      this.water.setFlowMap({ texture: this._flowTex, rect: f.rect, data: f.data, width: f.width, height: f.height, channels: 4 });
    } else this.water.setFlowMap(null);
    if (def.depth) {
      const d = def.depth;
      this._depthTex = createDataTexture(gl, d.data, d.width, d.height, 1);
      this.water.setDepthMap({ texture: this._depthTex, rect: d.rect, data: d.data, width: d.width, height: d.height });
    } else this.water.setDepthMap(null);
    if (!this.sky) this.sky = new Sky(gl, { size: 256 });
    this.sky.set(def.sky);
    this.sky.applyTo(this.water);
    this.active = true;
    this.renderer.resetState();
  }

  disable() {
    this.active = false;
    this.underwater = false;
    if (this.passes) for (const p of [this.passes.medium, this.passes.lens]) p.enabled = false;
  }

  setQuality(quality) {
    if (!this.def) return;
    const wasActive = this.active;
    this.setup(this.def, quality);
    if (!wasActive) this.disable();
  }

  // post.js zincirine eklenecek gecisler (kompozitor her yeniden kuruldugunda yenilenir)
  createPasses(composer) {
    this.passes = {
      surface: new WaterSurfacePass(this, composer),
      medium: new WaterFullscreenPass(this, 'WaterMediumPass', MEDIUM_FS, true),
      lens: new WaterFullscreenPass(this, 'WaterLensPass', LENS_FS),
    };
    return this.passes;
  }

  _copyTarget(w, h) {
    const gl = this.gl;
    w = Math.max(1, w); h = Math.max(1, h);
    if (this._copy && this._copy.w === w && this._copy.h === h) return this._copy;
    if (this._copy) { gl.deleteTexture(this._copy.tex); gl.deleteFramebuffer(this._copy.fbo); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    this._copy = { tex, fbo, w, h };
    return this._copy;
  }

  // her karede, kamera guncellendikten sonra (cizimden once)
  update(dt, camera) {
    if (!this.active) return;
    const c = this.cam;
    c.view.set(camera.matrixWorldInverse.elements);
    c.projection.set(camera.projectionMatrix.elements);
    c.position[0] = camera.position.x; c.position[1] = camera.position.y; c.position[2] = camera.position.z;
    this._ivp.set(this._m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert().elements);
    this.water.update(dt);
    const med = this.water.updateNear(c);
    this.renderer.resetState();
    this.underwater = med.height < 0;
    if (this.passes) {
      this.passes.medium.enabled = med.mode !== 'air';
      this.passes.lens.enabled = med.mode === 'straddle' || this.water.lens.active;
    }
    return med;
  }

  get medium() { return this.water ? this.water.medium : null; }

  // (x, y, z) noktasinda su var mi (seviyenin altindaki her bos voxel sudur)
  isWater(x, y, z) {
    if (!this.active || y >= this.level) return false;
    return !this.game.world.solidAtWorld(x, y, z);
  }

  // patlama: yuzeye yakinsa ya da su altindaysa su sutunu, halkalar, flas, kabarcik
  explode(x, y, z, scale = 1) {
    if (!this.active) return false;
    const depth = this.level - y;
    if (depth < -0.9 * scale) return false;
    // patlama noktasinin ustunde su yuzeyi var mi
    if (!this.isWater(x, Math.min(y, this.level) - 0.05, z) && !this.isWater(x, this.level - 0.12, z)) return false;
    this.water.explode(x, z, { radius: 2.6 * scale, height: 7 * scale, depth: Math.max(0, depth) });
    this.renderer.resetState();
    return true;
  }

  ripple(x, z, radius = 0.4, strength = 0.04) {
    if (this.active) this.water.addRipple(x, z, radius, strength);
  }

  // ---- gokyuzu kup haritasi -> Three.js CubeTexture (arka plan + PMREM ortam)
  // water.js kup haritasi GL duzeninde; Three ise yuklenen kup dokulari X ekseninde aynalayarak okur.
  // Bu yuzden veriler aynalanmis yonlerden kopyalanir. Arka plana gunes diski eklenir.
  skyCubes() {
    const gl = this.gl, sky = this.sky, S = sky.size;
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const src = [];
    for (let f = 0; f < 6; f++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, sky.envMap, 0);
      const buf = new Float32Array(S * S * 4);
      gl.readPixels(0, 0, S, S, gl.RGBA, gl.FLOAT, buf);
      src.push(buf);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    this.renderer.resetState();
    const scale = sky.envScale;
    const sd = sky.sunDirection, sc = sky.sunColor;
    const cosIn = Math.cos(0.5 * Math.PI / 180), cosOut = Math.cos(0.75 * Math.PI / 180);
    const bg = [], env = [];
    const dir = [0, 0, 0];
    const H = THREE.DataUtils.toHalfFloat;
    let hr = 0, hg = 0, hb = 0, hn = 0;
    for (let f = 0; f < 6; f++) {
      const B = new Uint16Array(S * S * 4), E = new Uint16Array(S * S * 4);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        faceDir(f, (i + 0.5) / S * 2 - 1, (j + 0.5) / S * 2 - 1, dir);
        // Three bu texeli (-x, y, z) yonu icin okur: oradaki gokyuzunu koy
        const mx = -dir[0], my = dir[1], mz = dir[2];
        const [sf, si, sj] = dirToTexel(mx, my, mz, S);
        const so = (sj * S + si) * 4, o = (j * S + i) * 4;
        const s = src[sf];
        const r = s[so] * scale, g = s[so + 1] * scale, b = s[so + 2] * scale, a = s[so + 3];
        const cs = mx * sd[0] + my * sd[1] + mz * sd[2];
        const disc = cs > cosOut ? Math.min(1, (cs - cosOut) / (cosIn - cosOut)) * a * 900 : 0;
        B[o] = H(r + sc[0] * disc); B[o + 1] = H(g + sc[1] * disc); B[o + 2] = H(b + sc[2] * disc); B[o + 3] = H(1);
        E[o] = H(r); E[o + 1] = H(g); E[o + 2] = H(b); E[o + 3] = H(1);
        if (my > 0.02 && my < 0.12) { hr += r; hg += g; hb += b; hn++; }
      }
      bg.push(B); env.push(E);
    }
    const mk = (faces) => {
      const t = new THREE.CubeTexture(faces.map((d) => new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.HalfFloatType)));
      t.format = THREE.RGBAFormat; t.type = THREE.HalfFloatType;
      t.colorSpace = THREE.LinearSRGBColorSpace;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    return {
      background: mk(bg), env: mk(env),
      horizon: [hr / Math.max(1, hn), hg / Math.max(1, hn), hb / Math.max(1, hn)],
      sunDirection: sd.slice(), sunColor: sc.slice(), ambient: sky.ambient.slice(),
    };
  }
}

// water.js SKY_FS ile ayni yuz duzeni
function faceDir(f, cx, cy, out) {
  let x, y, z;
  if (f === 0) { x = 1; y = -cy; z = -cx; }
  else if (f === 1) { x = -1; y = -cy; z = cx; }
  else if (f === 2) { x = cx; y = 1; z = cy; }
  else if (f === 3) { x = cx; y = -1; z = -cy; }
  else if (f === 4) { x = cx; y = -cy; z = 1; }
  else { x = -cx; y = -cy; z = -1; }
  const l = Math.hypot(x, y, z);
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}

function dirToTexel(x, y, z, S) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let f, cx, cy;
  if (ax >= ay && ax >= az) {
    if (x > 0) { f = 0; cx = -z / ax; cy = -y / ax; } else { f = 1; cx = z / ax; cy = -y / ax; }
  } else if (ay >= az) {
    if (y > 0) { f = 2; cx = x / ay; cy = z / ay; } else { f = 3; cx = x / ay; cy = -z / ay; }
  } else if (z > 0) { f = 4; cx = x / az; cy = -y / az; } else { f = 5; cx = -x / az; cy = -y / az; }
  const i = Math.min(S - 1, Math.max(0, Math.floor((cx + 1) / 2 * S)));
  const j = Math.min(S - 1, Math.max(0, Math.floor((cy + 1) / 2 * S)));
  return [f, i, j];
}
