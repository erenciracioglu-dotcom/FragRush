// Buz Golu haritasi: kis ortami (water.js Sky ayarlari, sis, tepeler) ve gol kurallari.
//  - Gol buzu ince: kirilinca altindaki su buz gibidir; icinde kalan her yarim saniye can kaybeder (zirhi deler)
//  - Buzu kiran parcalamayi alir: kirilan buzdan suya dusen ICE.credit sn icinde donar / bogulursa kirana yazilir
//  - Buz tavan: altinda kalan Bosluk'u basili tutarak buzu kirar (ICE.pushTime), ya da delik arar
//  - Kirik buz kenarlarindan iceri yeniden donar: once yuzey kati, sonra alt kat
//  - Kar yagisi (GPU noktalari, kameranin cevresindeki kutuda; cati, agac ve kule altinda yok: ustten
//    gorunus en yuksek kati voxel haritasi), baca dumani, ruzgar ugultusu, uzakta buz catirtisi
import * as THREE from 'three';
import { VS, ICE } from '../config.js';
import { M } from '../world/materials.js';
import { t } from '../i18n.js';

// alcak kis gunesi, ince bulut ortusu, puslu ufuk (water.js Sky parametreleri)
export const FROZEN_SKY = {
  sunElevation: 13, sunAzimuth: 200, cloudCover: 0.6, cloudDarkness: 0.18, haze: 0.75,
  fogDensity: 0.0035, sunIntensity: 15, exposure: 1.05,
};

// buz deliklerindeki su: ruzgarsiz, koyu, cok berrak soguk su
export const FROZEN_WATER = {
  preset: 'lake',
  params: {
    windSpeed: 1.2, windDirection: 40, fetch: 25, choppiness: 0.25, spread: 1.4, detailScale: 0.35,
    waterColor: [0.002, 0.012, 0.024], absorption: [0.5, 0.11, 0.06], turbidity: 0.035,
    sssColor: [0.01, 0.05, 0.07], sss: 0.35, edgeSoftness: 0.05,
    whitecaps: 0, shoreFoam: 0.05, shoreFoamWidth: 0.2, flowFoam: 0, foamScale: 1.5,
    caustics: 0.3, causticScale: 1.2,
  },
};

// game.js applyEnvironment: sis yogunlugu, gunes carpani, kar yansimasi (yarim kure isigi: alttan beyaz)
export const FROZEN_ENV = {
  fogDensity: 0.0105, envIntensity: 1.0, sunScale: 1.0,
  hemi: 0.32, hemiSky: 0xbcd0f0, hemiGround: 0xeef2f7,
};
// uzak karli daglar (environments.js createHills paleti)
export const FROZEN_HILLS = { near: 0xd3dde6, far: 0x93a5ba, rock: 0x7f878f };

// ---------------------------------------------------------------- kar yagisi
const SNOW_VS = /* glsl */`
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec2 uWind;
uniform sampler2D uTop;
uniform vec2 uTopInv;
uniform float uTopScale;
uniform float uSize;
uniform float uScale;
attribute float aW;
varying float vA;
varying float vD;
void main() {
  // tohum (0..1)^3 -> kutu; dusus + ruzgar + salinim, kameranin cevresindeki kutuya sarilir
  float sp = 0.75 + 0.55 * aW;
  float t = uTime;
  vec3 p = position * uBox;
  p += vec3(uWind.x * t + sin(t * 0.7 + aW * 31.0) * 0.35, -sp * t, uWind.y * t + cos(t * 0.6 + position.x * 17.0) * 0.35);
  vec3 o = uCam - uBox * 0.5;
  p = o + mod(p - o, uBox);
  // cati / agac / kule altinda kar yok
  float top = texture2D(uTop, p.xz * uTopInv).r * uTopScale;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  float edge = 1.0 - smoothstep(uBox.x * 0.36, uBox.x * 0.5, length(p.xz - uCam.xz));
  vA = step(top, p.y) * smoothstep(0.25, 1.0, d) * edge;
  gl_PointSize = clamp(uSize * (0.55 + 0.9 * aW) * uScale / max(d, 0.1), 1.0, 12.0);
  vD = d;
}`;

const SNOW_FS = /* glsl */`
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
varying float vA;
varying float vD;
void main() {
  if (vA < 0.01) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c) * 4.0;
  if (r > 1.0) discard;
  float a = 1.0 - r;
  a *= a * vA * 0.85;
  float f = 1.0 - exp(-uFogDensity * uFogDensity * vD * vD);
  gl_FragColor = vec4(mix(uColor, uFogColor, f), a * (1.0 - f * 0.6));
}`;

const BOX = [36, 20, 36];

function createSnowfall(count) {
  const pos = new Float32Array(count * 3), w = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random();
    w[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
  const uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(...BOX) },
    uWind: { value: new THREE.Vector2(0.55, 0.25) },
    uTop: { value: null }, uTopInv: { value: new THREE.Vector2(1, 1) }, uTopScale: { value: 255 * VS },
    uSize: { value: 0.03 }, uScale: { value: 800 },
    uColor: { value: new THREE.Color(1, 1, 1) }, uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) }, uFogDensity: { value: 0.01 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 9;
  points.name = 'snowfall';
  points.visible = false;
  return { points, uniforms };
}

// ---------------------------------------------------------------- sistem
const rnd = (a, b) => a + Math.random() * (b - a);
const C_SMOKE0 = [0.42, 0.42, 0.44, 0.42], C_SMOKE1 = [0.62, 0.63, 0.66, 0];
const C_FROST0 = [0.8, 0.86, 0.92, 0.5], C_FROST1 = [0.85, 0.9, 0.95, 0];
const C_EMBER0 = [5, 1.6, 0.3, 1], C_EMBER1 = [1.2, 0.2, 0.02, 0];
const _dep = new Int32Array(4);
const REFREEZE_SCAN = 6000;   // donma turunda en cok bakilan voxel

export class IceSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.level = 0;
    this.queue = new Set();          // yeniden donacak bos buz voxelleri (indeks)
    this.breakT = null;              // kolon basina son buz kirilma zamani
    this.breakBy = null;             // ... ve kiran aktor
    this.chimneys = [];
    this.freezeT = 0; this.smokeT = 0; this.boomT = 6; this.topT = 0; this.ambN = 0;
    this.topDirty = [];
    this.time = 0;
    const q = game.quality ? game.quality() : { particleMul: 1 };
    const snow = createSnowfall(Math.round(5600 * Math.max(0.45, Math.min(1.1, q.particleMul))));
    this.snow = snow;
    game.scene.add(snow.points);
    this.topTex = null;
    this.hintT = -100;
  }

  // arena: frozen.js generateFrozen ciktisi (ice, chimneys)
  setup(arena) {
    this.disable();
    const def = arena.ice, w = this.game.world;
    this.def = def;
    this.level = def.level;
    this.y0 = def.y0; this.noFreeze = def.noFreeze; this.cols = def.cols;
    const n = w.sx * w.sz;
    if (!this.breakT || this.breakT.length !== n) { this.breakT = new Float32Array(n); this.breakBy = new Array(n); }
    this.breakT.fill(-1e9); this.breakBy.fill(null);
    this.queue.clear();
    // su seviyesindeki gol buzu yuzer: kopan buz parcasi dibe dusmez (voxelWorld.findIslands)
    w.floatMat = M.ICE; w.floatY0 = def.level - 1; w.floatY1 = def.level;
    this.chimneys = arena.chimneys || [];
    this.buildTop();
    if (this._hooked !== w) {
      this._hooked = w;
      w.onChange((x0, y0, z0, x1, y1, z1) => { if (this.active) this.topDirty.push(x0, z0, x1, z1); });
    }
    this.snow.points.visible = true;
    this.freezeT = 0; this.smokeT = 0; this.boomT = rnd(4, 9); this.topT = 0;
    this.active = true;
  }

  disable() {
    this.active = false;
    const w = this.game.world;
    if (w) { w.floatMat = 0; w.floatY1 = -1; }
    if (this.snow) this.snow.points.visible = false;
    this.queue.clear();
    this.topDirty.length = 0;
    const au = this.game.audio;
    if (au && au.stopWindAmbience) au.stopWindAmbience();
  }

  // ---- ustten gorunus: kolonun en ustteki kati voxelinin bir ustu (voxel), R8 doku
  buildTop() {
    const w = this.game.world, sx = w.sx, sz = w.sz;
    if (!this.topData || this.topData.length !== sx * sz) {
      this.topData = new Uint8Array(sx * sz);
      if (this.topTex) this.topTex.dispose();
      this.topTex = new THREE.DataTexture(this.topData, sx, sz, THREE.RedFormat, THREE.UnsignedByteType);
      this.topTex.magFilter = THREE.NearestFilter; this.topTex.minFilter = THREE.NearestFilter;
      this.topTex.wrapS = this.topTex.wrapT = THREE.ClampToEdgeWrapping;
      const u = this.snow.uniforms;
      u.uTop.value = this.topTex;
      u.uTopInv.value.set(1 / (sx * VS), 1 / (sz * VS));
    }
    this._topRect(0, 0, sx - 1, sz - 1);
    this.topTex.needsUpdate = true;
  }

  _topRect(x0, z0, x1, z1) {
    const w = this.game.world, sx = w.sx, sxz = w.sxz, mat = w.mat, top = this.topData;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(sx - 1, x1); z1 = Math.min(w.sz - 1, z1);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const c = x + sx * z;
      let y = w.sy - 1;
      while (y > 0 && !mat[c + sxz * y]) y--;
      top[c] = Math.min(255, y + 1);
    }
  }

  // ---- patlama / mermi gol buzunu kirdi (destruction.blast): kimin kirdigi + yeniden donma sirasi
  onBlast(removed, mats, n, source, bx, by, bz) {
    const w = this.game.world, sxz = w.sxz, now = this.game.time, L = this.level;
    let nIce = 0;
    for (let k = 0; k < n; k++) {
      if (mats[k] !== M.ICE) continue;
      const i = removed[k];
      const y = (i / sxz) | 0, c = i - y * sxz;
      const y0 = this.y0[c];
      if (y0 < 0 || y > L || y < y0) continue;   // gol / dere buzu degil (oturmus buz kirintisi vb.)
      nIce++;
      this.breakT[c] = now; this.breakBy[c] = source;
      if (!this.noFreeze[c]) this.queue.add(i);
    }
    if (!nIce) return;
    const fx = this.game.fx, pm = fx.pm;
    // kirag bulutu ve catlama sesi (buyuk kirilmada sert, kucukte ince)
    const nf = Math.min(8, Math.round((1 + nIce / 12) * pm));
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * 6.28, r = Math.random() * Math.min(2, 0.2 + nIce * 0.01);
      fx.smoke.emit(bx + Math.cos(a) * r, L * VS + 0.3, bz + Math.sin(a) * r, Math.cos(a) * 0.8, rnd(0.2, 0.7), Math.sin(a) * 0.8, rnd(0.8, 1.6), 0.2, rnd(0.8, 1.6), C_FROST0, C_FROST1, -0.05, 1.6, 0, Math.random() * 6, rnd(-0.4, 0.4));
    }
    const au = this.game.audio;
    if (au && !this._quiet) au.play(nIce > 40 ? 'iceCrack' : 'imp_ice', bx, L * VS + 0.2, bz, Math.min(1.4, 0.5 + nIce / 120));
  }

  // ---- aktor basina (game.js update, canliysa): soguk su, suya giris (parcalama kimin), buz tavan
  actorTick(a, dt) {
    const m = a.mover, p = m.pos, game = this.game;
    const wet = m.inWater && m.waterDepth > ICE.coldDepth;
    if (wet && !a.iceWet) {
      this._onEnter(a);
      a.coldTick = 0.35;
      if (a.isPlayer && game.hud) game.hud.subMsg(t('freezing'), 1.4);
    }
    a.iceWet = wet;
    if (wet) {
      a.cold = Math.min(1, a.cold + dt * 0.9);
      a.coldOut = 0;
      a.coldTick -= dt;
      if (a.coldTick <= 0) {
        a.coldTick = ICE.coldTick;
        a.coldDmg = a.coldDmg ? Math.min(ICE.coldMax, a.coldDmg + ICE.coldStep) : ICE.coldFirst;
        const by = a.health - a.coldDmg <= 0 ? this.credit(a) : null;
        a.takeDamage(a.coldDmg, by, 'cold', null, false, true);
        if (!a.alive) return;
      }
    } else {
      a.cold = Math.max(0, a.cold - dt * 0.35);
      a.coldOut = (a.coldOut || 0) + dt;
      if (a.coldOut > 1.5) a.coldDmg = 0;
    }
    // buz tavan: yuzerken basin hemen ustu gol buzu
    if (m.swimming && m.eyesUnder) {
      const w = game.world, inv = 1 / VS;
      const X = Math.floor(p.x * inv), Z = Math.floor(p.z * inv), hy = p.y + m.h;
      const ceil = w.get(X, Math.floor((hy + 0.06) * inv), Z) === M.ICE || w.get(X, Math.floor((hy + 0.3) * inv), Z) === M.ICE;
      if (ceil) {
        a.underIceT += dt;
        const up = !!(a.cmd && a.cmd.jump);
        a.pushT = up ? a.pushT + dt : Math.max(0, a.pushT - dt * 0.5);
        if (up && a.pushT >= ICE.pushTime * 0.5 && a.pushT - dt < ICE.pushTime * 0.5 && game.audio) game.audio.play('imp_ice', p.x, hy, p.z, 0.9, a.isPlayer);
        if (a.pushT >= ICE.pushTime) { a.pushT = 0; this.breakFromBelow(a); }
        if (a.isPlayer && a.underIceT > 0.6 && game.time - this.hintT > 6 && game.hud) { this.hintT = game.time; game.hud.centerMsg(t('underIce'), 2.2); }
      } else { a.underIceT = 0; a.pushT = Math.max(0, a.pushT - dt); }
    } else { a.underIceT = 0; a.pushT = 0; }
  }

  // buz altindan Bosluk'la: basin ustundeki buzu kir (aktor sudan cikabilsin diye ~1.3 m delik)
  breakFromBelow(a) {
    const p = a.mover.pos, game = this.game, L = this.level;
    const y = L * VS;
    this._quiet = true;   // catlama sesi asagida (oyuncuya yerel)
    game.destruction.blast(p.x, y, p.z, 0.8, 220, a, 3, 40, 0);
    this._quiet = false;
    a.mover.impulse(0, 2.5, 0);
    game.fx.bubbles(p.x, y - 0.3, p.z, 2);
    game.fx.splash(p.x, game.world.waterY, p.z, 0.8);
    if (game.waterSys.active) game.waterSys.ripple(p.x, p.z, 0.6, 0.05);
    if (game.audio) game.audio.play('iceCrack', p.x, y, p.z, 1.1, a.isPlayer);
  }

  // suya girdi: ayaginin altindaki buzu son ICE.creditFall sn icinde kim kirdiysa (ya da son 4 sn icinde
  // kim vurup ittiyse) donarsa / bogulursa parcalama onun
  _onEnter(a) {
    const p = a.mover.pos, now = this.game.time, w = this.game.world, sx = w.sx;
    const cx = Math.floor(p.x / VS), cz = Math.floor(p.z / VS);
    let best = null, bt = -1e9;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= sx || z >= w.sz) continue;
      const c = x + sx * z, b = this.breakT[c];
      if (b > bt && now - b < ICE.creditFall) { bt = b; best = this.breakBy[c]; }
    }
    if ((!best || best === a) && a.lastAttacker && a.lastAttacker !== a && now - a.lastAttackTime < 4) best = a.lastAttacker;
    a.iceBy = best; a.iceByT = now;
  }

  // soguk / bogulma olumunde parcalamayi alacak aktor (yoksa null: kendini parcalama)
  credit(a) {
    const k = a.iceBy;
    if (!k || k === a || this.game.time - a.iceByT > ICE.credit || !this.game.actors.includes(k)) return null;
    return k;
  }

  // ---- yeniden donma: kenarindan iceri, once yuzey kati (alt kat ustu donunce)
  _refreeze() {
    if (!this.queue.size) return;
    const game = this.game, w = game.world, mat = w.mat, sx = w.sx, sxz = w.sxz, L = this.level;
    const add = [], wait = [];
    let seen = 0;
    for (const i of this.queue) {
      if (++seen > REFREEZE_SCAN) break;
      if (mat[i]) { this.queue.delete(i); continue; }
      const y = (i / sxz) | 0;
      const nb = (mat[i - 1] ? 1 : 0) + (mat[i + 1] ? 1 : 0) + (mat[i - sx] ? 1 : 0) + (mat[i + sx] ? 1 : 0);
      const top = y === L;
      if (!nb || (!top && !mat[i + sxz]) || Math.random() > (top ? ICE.refreezeTop : ICE.refreezeLow) * (0.55 + nb * 0.25)) { wait.push(i); continue; }
      add.push(i);
    }
    // sira cok uzunsa bu tur donmayanlar sona: ilk REFREEZE_SCAN voxel hep ic kisimdan olup kenarlar hic
    // bakilmadan kalmasin
    if (this.queue.size > REFREEZE_SCAN) for (const i of wait) { this.queue.delete(i); this.queue.add(i); }
    if (!add.length) return;
    const fx = game.fx, cam = game.camera.position;
    let glints = 0;
    for (const i of add) {
      const y = (i / sxz) | 0, c = i - y * sxz, z = (c / sx) | 0, x = c - z * sx;
      if (this._occupied(x, y, z)) continue;
      _dep[0] = x; _dep[1] = y; _dep[2] = z; _dep[3] = M.ICE;
      w.depositMany(_dep, 4);
      this.queue.delete(i);
      // donan yerde kucuk parilti (kameraya yakinsa)
      const wx = (x + 0.5) * VS, wz = (z + 0.5) * VS;
      if (glints < 6 && (wx - cam.x) * (wx - cam.x) + (wz - cam.z) * (wz - cam.z) < 400 && Math.random() < 0.35) {
        glints++;
        fx.add.emit(wx, (y + 1) * VS + 0.02, wz, 0, rnd(0.05, 0.2), 0, rnd(0.25, 0.5), 0.05, 0.01, [2.2, 2.6, 3.2, 1], [0.4, 0.6, 0.9, 0], 0, 0.5, 0);
      }
    }
  }

  // voxel bir aktorun govdesiyle kesisiyor mu (icine buz dondurulmaz)
  _occupied(x, y, z) {
    const x0 = x * VS, y0 = y * VS, z0 = z * VS;
    for (const a of this.game.actors) {
      if (!a.alive) continue;
      const p = a.mover.pos, r = a.mover.r + 0.05;
      if (x0 + VS < p.x - r || x0 > p.x + r || z0 + VS < p.z - r || z0 > p.z + r) continue;
      if (y0 + VS < p.y - 0.05 || y0 > p.y + a.mover.h + 0.05) continue;
      return true;
    }
    return false;
  }

  update(dt, camera) {
    if (!this.active) return;
    const game = this.game, fx = game.fx, c = camera.position;
    this.time += dt;
    // kar: zaman, kamera, sis
    const u = this.snow.uniforms, fog = game.scene.fog;
    u.uTime.value = this.time;
    u.uCam.value.copy(c);
    u.uFogDensity.value = fog.density;
    u.uFogColor.value.copy(fog.color);
    u.uColor.value.copy(fog.color).multiplyScalar(1.35).addScalar(0.05);
    const h = game.renderer.domElement.height;
    u.uScale.value = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    // ortam sesi: ruzgar (yuksekte guclu, su altinda ve durakladiginda yok)
    const au = game.audio;
    if (au && au.setWindAmbience) {
      if (dt <= 0 || game.waterSys.underwater) au.setWindAmbience(0);
      else if ((this.ambN = this.ambN + 1) % 6 === 0) au.setWindAmbience(0.45 + 0.55 * THREE.MathUtils.smoothstep(c.y, 6, 17));
    }
    if (dt <= 0) return;
    // ustten gorunus (kar maskesi): degisen kolonlar en sik 0.3 sn'de bir
    this.topT -= dt;
    if (this.topDirty.length && this.topT <= 0) {
      this.topT = 0.3;
      const D = this.topDirty;
      for (let i = 0; i < D.length; i += 4) this._topRect(D[i], D[i + 1], D[i + 2], D[i + 3]);
      D.length = 0;
      this.topTex.needsUpdate = true;
    }
    // yeniden donma
    this.freezeT -= dt;
    if (this.freezeT <= 0) { this.freezeT = ICE.refreezeTick; this._refreeze(); }
    // baca dumani (+ seyrek kivilcim)
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.14 / Math.max(0.4, fx.pm);
      for (const ch of this.chimneys) {
        const dx = ch[0] - c.x, dz = ch[2] - c.z;
        if (dx * dx + dz * dz > 4900) continue;
        fx.smoke.emit(ch[0] + rnd(-0.08, 0.08), ch[1] + 0.15, ch[2] + rnd(-0.08, 0.08), rnd(0.15, 0.45), rnd(0.7, 1.2), rnd(0.0, 0.25), rnd(4.5, 7), 0.3, rnd(2.2, 3.2), C_SMOKE0, C_SMOKE1, -0.08, 0.25, 0, Math.random() * 6, rnd(-0.3, 0.3));
        if (Math.random() < 0.06) fx.add.emit(ch[0], ch[1] + 0.1, ch[2], rnd(-0.2, 0.3), rnd(1.2, 2.2), rnd(-0.2, 0.3), rnd(0.6, 1.2), 0.03, 0.01, C_EMBER0, C_EMBER1, -0.3, 0.4, 0);
      }
    }
    // uzakta buz catirtisi: golun kameraya yakin bir yerinde (buz golunun "sarkisi")
    this.boomT -= dt;
    if (this.boomT <= 0) {
      this.boomT = rnd(7, 17);
      const cols = this.cols, sx = game.world.sx;
      if (cols.length && au) for (let k = 0; k < 10; k++) {
        const col = cols[(Math.random() * cols.length) | 0];
        const x = (col % sx + 0.5) * VS, z = (((col / sx) | 0) + 0.5) * VS;
        const d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
        if (d2 > 2500 || d2 < 36) continue;
        au.play('iceBoom', x, this.level * VS, z, rnd(0.6, 1.1));
        break;
      }
    }
  }
}
