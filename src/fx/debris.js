// Enkaz kupleri: instanced, basit fizik, voxel dunyaya carpma, sekme, durup kuculerek kaybolma.
import * as THREE from 'three';
import { VS, GRAVITY } from '../config.js';

export class Debris {
  constructor(scene, world, max, { castShadow = true, glow = false } = {}) {
    this.world = world; this.max = max; this.count = 0;
    const F = () => new Float32Array(max);
    this.px = F(); this.py = F(); this.pz = F();
    this.vx = F(); this.vy = F(); this.vz = F();
    this.ax = F(); this.ay = F(); this.az = F();
    this.wx = F(); this.wy = F(); this.wz = F();
    this.size = F(); this.life = F(); this.ttl = F(); this.rest = F();
    this.cr = F(); this.cg = F(); this.cb = F();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = glow
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.05 });
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = castShadow && !glow;
    mesh.receiveShadow = !glow;
    this.mesh = mesh;
    scene.add(mesh);
  }

  spawn(x, y, z, vx, vy, vz, size, r, g, b, ttl = 4) {
    if (this.count >= this.max) {
      // en eskiyi degistir: rastgele bir tanesinin uzerine yaz
      const i = (Math.random() * this.max) | 0;
      this._set(i, x, y, z, vx, vy, vz, size, r, g, b, ttl);
      return;
    }
    this._set(this.count++, x, y, z, vx, vy, vz, size, r, g, b, ttl);
  }

  _set(i, x, y, z, vx, vy, vz, size, r, g, b, ttl) {
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.ax[i] = Math.random() * 6.28; this.ay[i] = Math.random() * 6.28; this.az[i] = Math.random() * 6.28;
    const sp = 6 + Math.hypot(vx, vy, vz) * 1.2;
    this.wx[i] = (Math.random() - 0.5) * sp; this.wy[i] = (Math.random() - 0.5) * sp; this.wz[i] = (Math.random() - 0.5) * sp;
    this.size[i] = size; this.life[i] = 0; this.ttl[i] = ttl * (0.7 + Math.random() * 0.6); this.rest[i] = 0;
    this.cr[i] = r; this.cg[i] = g; this.cb[i] = b;
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    const A = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.ax, this.ay, this.az, this.wx, this.wy, this.wz, this.size, this.life, this.ttl, this.rest, this.cr, this.cg, this.cb];
    for (const a of A) a[i] = a[j];
  }

  update(dt) {
    const w = this.world, inv = 1 / VS;
    const solid = (x, y, z) => w.solid(Math.floor(x * inv), Math.floor(y * inv), Math.floor(z * inv));
    const lavaMask = w.lavaMask, lavaY = w.lavaY;
    let i = 0;
    while (i < this.count) {
      let l = this.life[i] + dt;
      const ttl = this.ttl[i];
      if (l >= ttl) { this._kill(i); continue; }
      this.life[i] = l;
      const hs = this.size[i] * 0.5;
      let x = this.px[i], y = this.py[i], z = this.pz[i];
      let vx = this.vx[i], vy = this.vy[i] - GRAVITY * dt, vz = this.vz[i];
      // icine gomulduyse (dunya degisti) yok et
      if (solid(x, y, z) && solid(x, y + VS, z)) { this._kill(i); continue; }
      let nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      // lava dusen parca erir (kucuk kor)
      if (lavaMask && ny < lavaY) {
        const X = Math.floor(nx * inv), Z = Math.floor(nz * inv);
        if (X >= 0 && Z >= 0 && X < w.sx && Z < w.sz && lavaMask[X + w.sx * Z] && !solid(nx, ny, nz)) {
          if (this.onLava) this.onLava(nx, lavaY, nz);
          this._kill(i); continue;
        }
      }
      let ground = false;
      if (solid(x, ny - hs, z)) {
        if (vy < 0) {
          ny = (Math.floor((ny - hs) * inv) + 1) * VS + hs;
          if (vy < -1.5) { vy = -vy * 0.28; } else { vy = 0; }
          vx *= 0.72; vz *= 0.72;
          this.wx[i] *= 0.6; this.wy[i] *= 0.6; this.wz[i] *= 0.6;
          ground = true;
        } else { vy = -vy * 0.2; ny = y; }
      }
      if (solid(nx + Math.sign(vx) * hs, ny, z)) { vx = -vx * 0.3; nx = x; }
      if (solid(nx, ny, nz + Math.sign(vz) * hs)) { vz = -vz * 0.3; nz = z; }
      this.px[i] = nx; this.py[i] = ny; this.pz[i] = nz;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      if (ground && Math.abs(vx) + Math.abs(vz) < 0.4 && vy === 0) {
        this.rest[i] += dt;
        this.wx[i] *= 0.5; this.wy[i] *= 0.5; this.wz[i] *= 0.5;
        // dinlenince kalan omru kisalt
        if (this.rest[i] > 0.6 && ttl - l > 2.5) this.ttl[i] = l + 2.5;
      }
      this.ax[i] += this.wx[i] * dt; this.ay[i] += this.wy[i] * dt; this.az[i] += this.wz[i] * dt;
      i++;
    }
    // matrisler
    const n = this.count;
    const M = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array;
    for (let k = 0; k < n; k++) {
      const t = this.life[k], ttl = this.ttl[k];
      const remain = ttl - t;
      let s = this.size[k];
      if (remain < 0.6) s *= Math.max(0, remain / 0.6);
      const a = Math.cos(this.ax[k]), b = Math.sin(this.ax[k]);
      const c = Math.cos(this.ay[k]), d = Math.sin(this.ay[k]);
      const e = Math.cos(this.az[k]), f = Math.sin(this.az[k]);
      const ae = a * e, af = a * f, be = b * e, bf = b * f;
      const o = k * 16;
      M[o] = c * e * s; M[o + 1] = (af + be * d) * s; M[o + 2] = (bf - ae * d) * s; M[o + 3] = 0;
      M[o + 4] = -c * f * s; M[o + 5] = (ae - bf * d) * s; M[o + 6] = (be + af * d) * s; M[o + 7] = 0;
      M[o + 8] = d * s; M[o + 9] = -b * c * s; M[o + 10] = a * c * s; M[o + 11] = 0;
      M[o + 12] = this.px[k]; M[o + 13] = this.py[k]; M[o + 14] = this.pz[k]; M[o + 15] = 1;
      const o3 = k * 3;
      C[o3] = this.cr[k]; C[o3 + 1] = this.cg[k]; C[o3 + 2] = this.cb[k];
    }
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, n * 16); this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.clearUpdateRanges(); this.mesh.instanceColor.addUpdateRange(0, n * 3); this.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear() { this.count = 0; this.mesh.count = 0; }
}
