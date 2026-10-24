// Ust duzey efekt cephesi: patlama, carpma, namlu alevi, enkaz, ray isini...
import * as THREE from 'three';
import { VS, FX } from '../config.js';
import { Particles } from './particles.js';
import { Debris } from './debris.js';
import { Beams } from './beams.js';
import { LightPool } from './lights.js';
import { MAT_COLOR, MAT_EMISSIVE, MAT_SOUND, linearRGB } from '../world/materials.js';

const MAT_LIN = [];
for (let i = 0; i < MAT_COLOR.length; i++) MAT_LIN.push(linearRGB(MAT_COLOR[i]));

const rnd = (a, b) => a + Math.random() * (b - a);
function randDir(out) {
  const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  out[0] = s * Math.cos(t); out[1] = u; out[2] = s * Math.sin(t);
  return out;
}
const _d = [0, 0, 0];
const K_SPARK0 = [6, 3.2, 1.2, 1], K_SPARK1 = [2, 0.5, 0.1, 0];
const K_FLASH0 = [4, 2.6, 1.4, 1], K_FLASH1 = [1, 0.4, 0.1, 0];
const T0 = [0, 0, 0, 0], T1 = [0, 0, 0, 0];

export class Effects {
  constructor(game, quality) {
    const scene = game.scene;
    this.game = game;
    this.pm = quality.particleMul;
    this.dm = quality.debrisMul;
    this.add = new Particles(scene, Math.floor(FX.maxParticles * this.pm), { additive: true, texture: 'glow', renderOrder: 12 });
    this.smoke = new Particles(scene, Math.floor(FX.maxSmoke * this.pm), { additive: false, texture: 'smoke', renderOrder: 11 });
    this.debris = new Debris(scene, game.world, Math.floor(FX.maxDebris * this.dm), { castShadow: quality.debrisShadow });
    this.glowDebris = new Debris(scene, game.world, 600, { glow: true });
    this.beams = new Beams(scene, 300);
    this.lights = new LightPool(scene, FX.lightPool);
    this.shake = 0;
  }

  update(dt) {
    this.add.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt);
    this.glowDebris.update(dt);
    this.beams.update(dt);
    this.lights.update(dt);
  }

  clear() {
    this.add.clear(); this.smoke.clear(); this.debris.clear(); this.glowDebris.clear(); this.beams.clear(); this.lights.clear();
  }

  addShake(amount, x, y, z) {
    const cam = this.game.camera.position;
    let k = 1;
    if (x !== undefined) { const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z); k = Math.max(0, 1 - d / 28); k *= k; }
    this.shake = Math.min(1.6, this.shake + amount * k);
  }

  // local: atan aktor kameranin sahibi -> alev gorus modelinde cizilir, burada sadece biraz kivilcim
  muzzle(x, y, z, dx, dy, dz, color, size = 1, local = false) {
    const c = new THREE.Color(color);
    if (!local) {
      const col = [c.r * 5, c.g * 5, c.b * 5, 1];
      this.add.emit(x, y, z, 0, 0, 0, 0.05, 0.2 * size, 0.34 * size, col, [c.r * 2, c.g * 2, c.b * 2, 0], 0, 0, 0, Math.random() * 6);
    }
    const off = local ? 0.6 : 0;
    for (let i = 0; i < 4; i++) {
      const s = rnd(4, 12);
      this.add.emit(x + dx * off, y + dy * off, z + dz * off, dx * s + rnd(-1.5, 1.5), dy * s + rnd(-1.5, 1.5), dz * s + rnd(-1.5, 1.5), rnd(0.05, 0.12), 0.025, 0.01, [c.r * 6, c.g * 4.5, c.b * 3, 1], [c.r * 2, c.g, 0, 0], 4, 3, 0.02);
    }
    this.lights.flash(x + dx * 0.5, y + dy * 0.5, z + dz * 0.5, color, 3.5 * size, 7, 0.06, 1);
  }

  // mermi carpmasi: kivilcim + toz + birkac enkaz
  impact(x, y, z, nx, ny, nz, mat, power = 1) {
    const snd = MAT_SOUND[mat] || 'stone';
    const metal = snd === 'metal';
    const lc = MAT_LIN[mat] || [0.5, 0.5, 0.5];
    const nSpark = Math.round((metal ? 9 : 4) * power * this.pm);
    for (let i = 0; i < nSpark; i++) {
      randDir(_d);
      const s = rnd(3, 11);
      const vx = (_d[0] + nx * 1.4) * s, vy = (_d[1] + ny * 1.4) * s + 1, vz = (_d[2] + nz * 1.4) * s;
      this.add.emit(x, y, z, vx, vy, vz, rnd(0.15, 0.45), 0.03, 0.012, K_SPARK0, K_SPARK1, 14, 1.5, 0.018);
    }
    const nDust = Math.round(3 * power * this.pm);
    for (let i = 0; i < nDust; i++) {
      randDir(_d);
      const s = rnd(0.4, 1.6);
      T0[0] = lc[0] * 0.9 + 0.08; T0[1] = lc[1] * 0.9 + 0.08; T0[2] = lc[2] * 0.9 + 0.08; T0[3] = 0.55;
      T1[0] = lc[0] * 0.6 + 0.05; T1[1] = lc[1] * 0.6 + 0.05; T1[2] = lc[2] * 0.6 + 0.05; T1[3] = 0;
      this.smoke.emit(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1, (_d[0] + nx) * s, (_d[1] + ny) * s + 0.3, (_d[2] + nz) * s,
        rnd(0.6, 1.4), 0.15, rnd(0.5, 0.9), T0, T1, -0.2, 2.2, 0, Math.random() * 6, rnd(-1, 1));
    }
    this.add.emit(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, 0, 0, 0, 0.06, 0.1, 0.3, K_FLASH0, K_FLASH1, 0, 0, 0);
  }

  // dunyadan kopan voxellerden enkaz kupu
  voxelDebris(world, list, mats, n, cx, cy, cz, force, maxCount = 220) {
    if (n <= 0) return;
    const cap = Math.max(1, Math.floor(maxCount * this.dm));
    const step = n > cap ? n / cap : 1;
    const sx = world.sx, sxz = world.sxz;
    for (let f = 0; f < n; f += step) {
      const k = Math.floor(f);
      const idx = list[k], m = mats[k];
      const yv = (idx / sxz) | 0; const rem = idx - yv * sxz; const zv = (rem / sx) | 0; const xv = rem - zv * sx;
      const x = (xv + 0.5) * VS, y = (yv + 0.5) * VS, z = (zv + 0.5) * VS;
      let dx = x - cx, dy = y - cy, dz = z - cz;
      const d = Math.hypot(dx, dy, dz) + 0.05;
      dx /= d; dy /= d; dz /= d;
      const sp = force * rnd(0.35, 1.0) / (0.5 + d * 0.5);
      const vx = dx * sp + rnd(-1, 1), vy = dy * sp + rnd(1, 3.5), vz = dz * sp + rnd(-1, 1);
      const lc = MAT_LIN[m] || [0.5, 0.5, 0.5];
      const v = rnd(0.75, 1.1);
      const size = VS * rnd(0.45, 0.95) * (step > 1 ? Math.min(1.6, Math.sqrt(step) * 0.8) : 1);
      if (MAT_EMISSIVE[m] > 0.5) {
        this.glowDebris.spawn(x, y, z, vx, vy, vz, size * 0.8, lc[0] * 5, lc[1] * 5, lc[2] * 5, rnd(1.0, 2.5));
      } else {
        this.debris.spawn(x, y, z, vx, vy, vz, size, lc[0] * v, lc[1] * v, lc[2] * v, rnd(3.5, 7));
      }
    }
  }

  // buyuk patlama: kucuk parlak cekirdek, yapili ates toplari, koyu duman, kivilcim, kor
  explosion(x, y, z, radius, color = 0xff7a1a, big = 1, nx = 0, ny = 1, nz = 0) {
    const pm = this.pm;
    const r = radius;
    // cekirdek parlama (cok kisa)
    this.add.emit(x, y, z, 0, 0, 0, 0.07, r * 0.25, r * 0.9, [5, 3.6, 2.2, 1], [1.2, 0.4, 0.08, 0], 0, 0, 0);
    // ates toplari: beyaz-sari -> turuncu -> koyu kirmizi
    const nFire = Math.round(18 * big * pm) + 4;
    for (let i = 0; i < nFire; i++) {
      randDir(_d);
      const s = rnd(1.5, 5.5) * r * 0.55;
      const hot = Math.random();
      this.add.emit(x + _d[0] * r * 0.15, y + _d[1] * r * 0.15, z + _d[2] * r * 0.15, _d[0] * s, _d[1] * s * 0.8 + 1.2, _d[2] * s,
        rnd(0.28, 0.6), r * rnd(0.16, 0.3), r * rnd(0.5, 0.85),
        [2.6 + hot * 1.4, 1.1 + hot * 0.7, 0.25 + hot * 0.2, 0.9], [0.5, 0.08, 0.01, 0], -1.5, 4.5, 0, Math.random() * 6, rnd(-2, 2));
    }
    // kivilcimlar
    const nSp = Math.round(46 * big * pm);
    for (let i = 0; i < nSp; i++) {
      randDir(_d);
      const s = rnd(6, 24);
      this.add.emit(x, y, z, _d[0] * s, _d[1] * s + 3, _d[2] * s, rnd(0.3, 1.0), 0.04, 0.015, [6, 3, 1.1, 1], [2, 0.4, 0.05, 0], 12, 1.2, 0.02);
    }
    // duman: once atesle aydinlanan, sonra koyu gri
    const nSm = Math.round(20 * big * pm) + 4;
    for (let i = 0; i < nSm; i++) {
      randDir(_d);
      const s = rnd(0.6, 3.2) * r * 0.4;
      const g = rnd(0.06, 0.12);
      this.smoke.emit(x + _d[0] * r * 0.3, y + _d[1] * r * 0.2, z + _d[2] * r * 0.3, _d[0] * s, Math.abs(_d[1]) * s + 1.0, _d[2] * s,
        rnd(2.2, 4.8), r * rnd(0.3, 0.5), r * rnd(1.0, 1.7), [g * 2.6 + 0.08, g * 1.6 + 0.03, g * 1.2, 0.82], [g * 1.5, g * 1.45, g * 1.45, 0], -0.45, 1.3, 0, Math.random() * 6, rnd(-0.5, 0.5));
    }
    // kor
    const nEm = Math.round(12 * big * pm);
    for (let i = 0; i < nEm; i++) {
      randDir(_d);
      const s = rnd(1, 5);
      this.add.emit(x, y, z, _d[0] * s, Math.abs(_d[1]) * s + 2, _d[2] * s, rnd(1.2, 2.6), 0.05, 0.025, [5, 1.8, 0.4, 1], [1.5, 0.25, 0.04, 0], 2.5, 0.6, 0);
    }
    // sok dalgasi halkasi (yere yakinsa)
    this.add.emit(x, y, z, 0, 0, 0, 0.18, r * 0.4, r * 2.6, [1.2, 0.8, 0.5, 0.35], [0.2, 0.1, 0.05, 0], 0, 0, 0);
    // isik yuzeyden uzakta dogar (yakin alanda ters kare yasasi yuzeyi beyaza patlatmasin)
    this.lights.flash(x + nx * 1.3, y + ny * 1.3 + 0.4, z + nz * 1.3, color, 30 * big, r * 5.5, 0.32, 3);
    this.addShake(0.5 * big * Math.min(1.5, r / 3), x, y, z);
  }

  plasmaHit(x, y, z, nx, ny, nz) {
    for (let i = 0; i < 10 * this.pm; i++) {
      randDir(_d);
      const s = rnd(2, 8);
      this.add.emit(x, y, z, (_d[0] + nx) * s, (_d[1] + ny) * s, (_d[2] + nz) * s, rnd(0.15, 0.4), 0.04, 0.01, [1, 5, 8, 1], [0.1, 1, 3, 0], 6, 2, 0.02);
    }
    this.add.emit(x, y, z, 0, 0, 0, 0.18, 0.3, 1.3, [2, 8, 12, 1], [0.2, 1, 3, 0], 0, 0, 0);
    this.lights.flash(x + nx * 0.7, y + ny * 0.7, z + nz * 0.7, 0x40e8ff, 7, 6, 0.16, 1);
  }

  rail(ax, ay, az, bx, by, bz, color = 0xb070ff) {
    const c = new THREE.Color(color);
    this.beams.add(ax, ay, az, bx, by, bz, [3, 3, 4], 1, 0.035, 0.45, 0.02);
    this.beams.add(ax, ay, az, bx, by, bz, [c.r * 5, c.g * 5, c.b * 5], 0.9, 0.22, 0.9, 0.5);
    // sarmal parcaciklar
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    const fx = dx / L, fy = dy / L, fz = dz / L;
    let ux = -fz, uy = 0, uz = fx;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-3) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = fy * uz - fz * uy, vy = fz * ux - fx * uz, vz = fx * uy - fy * ux;
    const n = Math.min(Math.floor(L * 6 * this.pm), 900);
    for (let i = 0; i < n; i++) {
      const t = i / 6;
      const a = t * 4.2;
      const r = 0.09;
      const ox = (ux * Math.cos(a) + vx * Math.sin(a)) * r, oy = (uy * Math.cos(a) + vy * Math.sin(a)) * r, oz = (uz * Math.cos(a) + vz * Math.sin(a)) * r;
      const px = ax + fx * t + ox, py = ay + fy * t + oy, pz = az + fz * t + oz;
      this.add.emit(px, py, pz, ox * 3, oy * 3 + 0.15, oz * 3, rnd(0.6, 1.1), 0.06, 0.12, [c.r * 4, c.g * 4, c.b * 5, 0.9], [c.r * 0.5, c.g * 0.2, c.b, 0], 0, 1.5, 0);
    }
    this.lights.flash(ax + fx * 2, ay + fy * 2, az + fz * 2, color, 8, 8, 0.2, 1);
  }

  tracer(ax, ay, az, bx, by, bz, color) {
    const c = new THREE.Color(color);
    this.beams.add(ax, ay, az, bx, by, bz, [c.r * 4, c.g * 4, c.b * 4], 0.75, 0.025, 0.06, 0.01);
  }

  // robot vurulmasi: kivilcim + yag
  robotHit(x, y, z, dx, dy, dz, color, power = 1) {
    for (let i = 0; i < 6 * power * this.pm; i++) {
      randDir(_d);
      const s = rnd(2, 9);
      this.add.emit(x, y, z, (_d[0] - dx) * s, (_d[1] - dy) * s + 2, (_d[2] - dz) * s, rnd(0.2, 0.5), 0.035, 0.01, [7, 4, 1.5, 1], [2, 0.6, 0.1, 0], 12, 1.5, 0.02);
    }
    const c = new THREE.Color(color);
    for (let i = 0; i < 2 * power; i++) {
      randDir(_d);
      this.smoke.emit(x, y, z, _d[0] * 0.6, _d[1] * 0.6 + 0.5, _d[2] * 0.6, rnd(0.5, 1.0), 0.12, 0.4, [0.05, 0.05, 0.06, 0.6], [0.02, 0.02, 0.02, 0], -0.3, 2, 0);
    }
    this.add.emit(x, y, z, 0, 0, 0, 0.08, 0.15, 0.4, [c.r * 6 + 2, c.g * 6 + 2, c.b * 6 + 2, 1], [c.r, c.g, c.b, 0], 0, 0, 0);
  }

  dustPuff(x, y, z, amount = 1) {
    for (let i = 0; i < 6 * amount * this.pm; i++) {
      const a = Math.random() * 6.28, s = rnd(0.8, 2.2);
      this.smoke.emit(x + Math.cos(a) * 0.2, y + 0.05, z + Math.sin(a) * 0.2, Math.cos(a) * s, rnd(0.1, 0.5), Math.sin(a) * s, rnd(0.5, 1.0), 0.15, 0.5, [0.32, 0.3, 0.28, 0.4], [0.2, 0.19, 0.18, 0], 0, 2.5, 0);
    }
  }

  padBurst(x, y, z) {
    for (let i = 0; i < 24 * this.pm; i++) {
      const a = Math.random() * 6.28, s = rnd(1, 4);
      this.add.emit(x + Math.cos(a) * 0.6, y + 0.1, z + Math.sin(a) * 0.6, Math.cos(a) * s * 0.3, rnd(4, 12), Math.sin(a) * s * 0.3, rnd(0.3, 0.7), 0.06, 0.02, [0.5, 6, 3, 1], [0.1, 2, 1, 0], 0, 2, 0.03);
    }
    this.lights.flash(x, y + 1.4, z, 0x14ffb4, 9, 8, 0.3, 1);
  }

  // kamp uyarisi: kirmizi tarama halkasi
  scanPulse(x, y, z) {
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      this.add.emit(x, y + 0.3, z, Math.cos(a) * 9, 0, Math.sin(a) * 9, 0.9, 0.18, 0.5, [6, 0.4, 0.3, 1], [1, 0, 0, 0], 0, 0.5, 0.02);
    }
    this.add.emit(x, y + 1, z, 0, 0, 0, 0.4, 1, 6, [3, 0.2, 0.2, 0.6], [0.5, 0, 0, 0], 0, 0, 0);
  }

  // olen robot: renkli parcalar + patlama
  robotGib(x, y, z, color, vx = 0, vy = 0, vz = 0) {
    const c = new THREE.Color(color);
    const parts = [[0.2, 0.2, 0.22], [0.18, 0.17, 0.2], [0.75, 0.78, 0.82]];
    for (let i = 0; i < 46 * this.dm + 10; i++) {
      randDir(_d);
      const s = rnd(3, 11);
      const pc = Math.random() < 0.3 ? [c.r, c.g, c.b] : parts[(Math.random() * parts.length) | 0];
      this.debris.spawn(x + _d[0] * 0.3, y + 0.9 + _d[1] * 0.6, z + _d[2] * 0.3, _d[0] * s + vx * 0.5, Math.abs(_d[1]) * s + 3 + vy * 0.3, _d[2] * s + vz * 0.5,
        rnd(0.06, 0.2), pc[0], pc[1], pc[2], rnd(4, 8));
    }
    for (let i = 0; i < 10; i++) {
      randDir(_d);
      const s = rnd(2, 7);
      this.glowDebris.spawn(x, y + 1, z, _d[0] * s, Math.abs(_d[1]) * s + 2, _d[2] * s, rnd(0.05, 0.1), c.r * 6, c.g * 6, c.b * 6, rnd(0.8, 1.8));
    }
    this.explosion(x, y + 1, z, 2.2, color, 0.7);
  }
}
