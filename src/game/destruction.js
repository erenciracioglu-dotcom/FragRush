// Yikim yoneticisi: patlama/delme -> enkaz, yapisal butunluk -> kopan parcalar dusup carpar, moloz birakir.
import * as THREE from 'three';
import { VS, GRAVITY, CS, ICE } from '../config.js';
import { meshVoxels } from '../world/mesher.js';
import { buildGeometry } from '../world/chunkManager.js';
import { M, MAT_SOUND, MAT_TOUGH } from '../world/materials.js';

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();

class FallingBody {
  constructor(mgr, isl, geo, source) {
    this.mgr = mgr;
    this.isl = isl;
    this.source = source;
    const com = isl.com;
    this.group = new THREE.Group();
    this.group.position.set(com[0], com[1], com[2]);
    const mesh = new THREE.Mesh(geo, mgr.game.voxelMaterial);
    mesh.position.set(-com[0], -com[1], -com[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    this.mesh = mesh;
    mgr.game.scene.add(this.group);
    this.vel = new THREE.Vector3();
    this.ang = new THREE.Vector3();
    this.life = 0;
    this.hitActors = new Set();
    // ornek noktalar: alt yuzey voxelleri + uclar
    const { nx, ny, nz, mats, minX, minY, minZ } = isl;
    const cand = [];
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const li = x + nx * (z + nz * y);
      if (!mats[li]) continue;
      const below = y === 0 || !mats[li - nx * nz];
      const edge = x === 0 || z === 0 || x === nx - 1 || z === nz - 1 || y === ny - 1;
      if (below || edge) cand.push(x, y, z);
    }
    const nc = cand.length / 3;
    const maxS = 56;
    const step = Math.max(1, nc / maxS);
    const s = [];
    for (let f = 0; f < nc; f += step) {
      const k = Math.floor(f) * 3;
      s.push((cand[k] + minX + 0.5) * VS - com[0], (cand[k + 1] + minY + 0.1) * VS - com[1], (cand[k + 2] + minZ + 0.5) * VS - com[2]);
    }
    this.samples = new Float32Array(s);
    // kaba yaricap
    this.radius = Math.max(nx, ny, nz) * VS * 0.5;
    this.halfY = ny * VS * 0.5;
  }

  update(dt) {
    const g = this.group;
    this.life += dt;
    this.vel.y -= GRAVITY * dt;
    const prevPos = this._pp || (this._pp = new THREE.Vector3());
    const prevQ = this._pq || (this._pq = new THREE.Quaternion());
    prevPos.copy(g.position); prevQ.copy(g.quaternion);
    g.position.addScaledVector(this.vel, dt);
    const al = this.ang.length();
    if (al > 1e-4) { _q.setFromAxisAngle(_v.copy(this.ang).divideScalar(al), al * dt); g.quaternion.premultiply(_q); }
    // carpma kontrolu
    const w = this.mgr.world;
    const S = this.samples;
    let hit = false;
    for (let i = 0; i < S.length; i += 3) {
      _v.set(S[i], S[i + 1], S[i + 2]).applyQuaternion(g.quaternion).add(g.position);
      if (w.solidAtWorld(_v.x, _v.y, _v.z)) { hit = true; break; }
    }
    // aktorleri ez (sarkit hemen saplanir: kafa hizasindan dusen sarkit henuz hizlanmamis olur)
    if (this.vel.y < (this.icicle ? -0.6 : -3)) this.mgr.crushCheck(this);
    if (hit || this.life > 8 || g.position.y < -5) {
      // son gecerli konuma geri al; yerlesme (moloz birakma) yonetici tarafindan kare butcesiyle yapilir
      g.position.copy(prevPos); g.quaternion.copy(prevQ);
      return false;
    }
    return true;
  }

  dispose() {
    this.mgr.game.scene.remove(this.group);
    this.mesh.geometry.dispose();
  }
}

export class Destruction {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.bodies = [];
    this.settleQueue = [];
    this._syncFrame = -1; this._syncMs = 0;
    this.integrityPending = false;
    this.waiting = 0;
    this.lastSource = null;
    this.lastBlast = new THREE.Vector3();
    this.lastForce = 0;
    this.deposit = new Int32Array(4 * 200000);
    this.stats = { removed: 0, bodies: 0, collapses: 0 };
  }

  reset() {
    for (const b of this.bodies) b.dispose();
    this.bodies.length = 0;
    for (const b of this.settleQueue) b.dispose();
    this.settleQueue.length = 0;
    this.integrityPending = false; this.waiting = 0;
    this.world.seedCount = 0;
  }

  // patlama: voxel hasari + enkaz. Donus: kaldirilan voxel sayisi
  blast(x, y, z, radius, power, source = null, force = 9, debrisMax = 240, noise = 0.5) {
    const w = this.world;
    const n = w.damageSphere(x, y, z, radius, power, { noise });
    if (n > 0) {
      this.game.fx.voxelDebris(w, w.removed, w.removedMat, n, x, y, z, force, debrisMax);
      this.integrityPending = true;
      this.lastSource = source; this.lastBlast.set(x, y, z); this.lastForce = force;
      this.stats.removed += n;
      // buz golu: kirilan gol buzu kimin (suya dusene parcalama), yeniden donacak voxeller
      const ice = this.game.iceSys;
      if (ice && ice.active) ice.onBlast(w.removed, w.removedMat, n, source, x, y, z);
    }
    return n;
  }

  // mermi carpmasi: yuzeyin biraz icinde kucuk hasar
  chip(hit, radius, power, source = null) {
    const x = (hit.x + 0.5) * VS - hit.nx * VS * 0.2, y = (hit.y + 0.5) * VS - hit.ny * VS * 0.2, z = (hit.z + 0.5) * VS - hit.nz * VS * 0.2;
    return this.blast(x, y, z, radius, power, source, 3.5, 14, 0.6);
  }

  update(dt) {
    if (this.integrityPending && this.waiting === 0) {
      this.integrityPending = false;
      const islands = this.world.findIslands();
      for (const isl of islands) this.detach(isl);
    }
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (!b.update(dt)) { this.bodies.splice(i, 1); this.settleQueue.push(b); }
    }
    // yere oturan parcalar: kare basina ~2.5 ms butce (cok sayida parca ayni anda dusunce takilma olmasin).
    // Sirada bekleyen parca son konumunda gorunur kalir.
    if (this.settleQueue.length) {
      const t0 = performance.now();
      let first = true;
      while (this.settleQueue.length && (first || performance.now() - t0 < 2.5)) {
        first = false;
        const b = this.settleQueue.shift();
        this.settle(b);
        b.dispose();
      }
    }
  }

  detach(indices) {
    const w = this.world;
    const n = indices.length;
    // sarkit: kopan parca cogunlukla sarkitsa (ucu vuruldu ya da sacagi yikildi) dikey duser, altindakine
    // saplanir (vurana parcalama), yere carpinca tuz buz olur
    let ic = 0;
    for (let k = 0; k < n; k++) if (w.mat[indices[k]] === M.ICICLE) ic++;
    const icicle = n <= 400 && ic >= 2 && ic >= n * 0.6;
    if (n <= 30 && !icicle) {
      const mats = new Uint8Array(n);
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < n; k++) {
        const i = indices[k]; mats[k] = w.mat[i];
        const y = (i / w.sxz) | 0; const rem = i - y * w.sxz; const z = (rem / w.sx) | 0; const x = rem - z * w.sx;
        cx += x; cy += y; cz += z;
      }
      w.removeIndices(indices);
      this.game.fx.voxelDebris(w, indices, mats, n, cx / n * VS, cy / n * VS + 0.3, cz / n * VS, 2, 60);
      return;
    }
    const isl = w.extractIsland(indices);
    const source = this.lastSource;
    const vol = (isl.nx + 2) * (isl.ny + 2) * (isl.nz + 2);
    const pmats = new Uint8Array(vol), pdmgs = new Uint8Array(vol);
    // padli kopya
    const px = isl.nx + 2, pz = isl.nz + 2;
    for (let y = 0; y < isl.ny; y++) for (let z = 0; z < isl.nz; z++) {
      const src = isl.nx * (z + isl.nz * y);
      const dst = 1 + px * ((z + 1) + pz * (y + 1));
      pmats.set(isl.mats.subarray(src, src + isl.nx), dst);
      pdmgs.set(isl.dmgs.subarray(src, src + isl.nx), dst);
    }
    const make = (r) => {
      const geo = buildGeometry(r);
      geo.computeBoundingSphere();
      const body = new FallingBody(this, isl, geo, source);
      const c = isl.com;
      if (icicle) {
        // sarkit: neredeyse dik duser, hafif yalpa
        body.icicle = true;
        body.vel.set((Math.random() - 0.5) * 0.3, -0.4, (Math.random() - 0.5) * 0.3);
        body.ang.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
        this.game.audio && this.game.audio.play('icicleSnap', c[0], c[1], c[2], Math.min(1.3, 0.5 + isl.count / 30));
      } else {
        // ilk hiz: patlamadan disari + rastgele donus
        const dx = c[0] - this.lastBlast.x, dy = c[1] - this.lastBlast.y, dz = c[2] - this.lastBlast.z;
        const d = Math.hypot(dx, dy, dz) + 0.5;
        const k = Math.min(6, this.lastForce * 1.4 / Math.sqrt(isl.count) * 6) / d;
        body.vel.set(dx * k, Math.max(0, dy * k * 0.5), dz * k);
        const spin = 1.6 / Math.pow(isl.count, 0.18);
        body.ang.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin * 0.4, (Math.random() - 0.5) * spin);
        this.game.audio && this.game.audio.play('creak', c[0], c[1], c[2], Math.min(1, isl.count / 2000) + 0.3);
      }
      this.bodies.push(body);
      this.stats.bodies++;
      w.removeIndices(indices);
    };
    // kucuk parcalar ana is parcaciginda (kare basina ~2 ms butce), digerleri worker'da meshlenir.
    // Worker yanit verene kadar voxeller dunyada durur, sonra parca kopar (gorunur bir bosluk olmaz).
    // Sarkit her zaman hemen kopar (kucuk; gecikirse altindaki kacmis olur).
    const fr = this.game.frame;
    if (this._syncFrame !== fr) { this._syncFrame = fr; this._syncMs = 0; }
    const noWorkers = !this.game.workers.workers.length;
    if (noWorkers || icicle || (vol < 12000 && this._syncMs < 2)) {
      const t0 = performance.now();
      make(meshVoxels(pmats, pdmgs, isl.nx, isl.ny, isl.nz, isl.minX, isl.minY, isl.minZ, VS));
      this._syncMs += performance.now() - t0;
    } else {
      this.waiting++;
      this.game.workers.submit({ nx: isl.nx, ny: isl.ny, nz: isl.nz, ox: isl.minX, oy: isl.minY, oz: isl.minZ, mats: pmats, dmgs: pdmgs }, (r) => {
        this.waiting--;
        make(r);
      }, true);
    }
  }

  crushCheck(body) {
    const g = body.group.position;
    const sp = -body.vel.y;
    const isl = body.isl;
    // sarkit ince: yatayda yalniz kendi genisligi + govde yaricapi
    const reach = body.icicle ? Math.max(isl.nx, isl.nz) * VS * 0.5 + 0.34 : body.radius * 0.85 + 0.3;
    for (const a of this.game.actors) {
      if (!a.alive || body.hitActors.has(a)) continue;
      const p = a.mover.pos;
      const dx = p.x - g.x, dz = p.z - g.z;
      const horiz = Math.hypot(dx, dz);
      if (horiz > reach) continue;
      const bottom = g.y - body.halfY;
      if (bottom > p.y + a.mover.h + 0.2 || g.y + body.halfY < p.y) continue;
      body.hitActors.add(a);
      if (body.icicle) {
        // sarkit saplandi: hasar boyuyla orantili (zirh normal emer)
        const dmg = Math.min(ICE.icicleMax, ICE.icicleMin + isl.count * ICE.icicleK);
        a.takeDamage(dmg, body.source, 'icicle', _v.set(dx * 0.2, -1, dz * 0.2).normalize(), false);
        const fx = this.game.fx;
        fx.impact(p.x, p.y + a.mover.h, p.z, 0, 1, 0, M.ICICLE, 1.5);
        continue;
      }
      // ezilme
      const dmg = Math.min(400, 8 + isl.count * 0.012 * sp);
      a.takeDamage(dmg, body.source, 'crush', _v.set(dx, 0.3, dz).normalize(), false);
    }
  }

  settle(body) {
    const w = this.world;
    const isl = body.isl;
    const g = body.group;
    const { nx, ny, nz, mats, minX, minY, minZ, com } = isl;
    const q = g.quaternion, p = g.position;
    const speed = body.vel.length();
    const small = isl.count < 260;
    const dep = this.deposit;
    let dn = 0;
    const debrisList = [], debrisMat = [];
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    const shatterFrac = small ? 1 : Math.min(0.5, 0.12 + speed * 0.012);
    // donusu matrise cevir (voxel basina quaternion cagrisi yerine 9 carpma)
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qz * qw), r02 = 2 * (qx * qz + qy * qw);
    const r10 = 2 * (qx * qy + qz * qw), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qx * qw);
    const r20 = 2 * (qx * qz - qy * qw), r21 = 2 * (qy * qz + qx * qw), r22 = 1 - 2 * (qx * qx + qy * qy);
    const inv = 1 / VS, px0 = p.x, py0 = p.y, pz0 = p.z;
    for (let y = 0; y < ny; y++) {
      const ly = (y + minY + 0.5) * VS - com[1];
      for (let z = 0; z < nz; z++) {
        const lz = (z + minZ + 0.5) * VS - com[2];
        const rowBase = nx * (z + nz * y);
        for (let x = 0; x < nx; x++) {
          const m = mats[rowBase + x];
          if (!m) continue;
          const lx = (x + minX + 0.5) * VS - com[0];
          const vx = Math.floor((r00 * lx + r01 * ly + r02 * lz + px0) * inv);
          const vy = Math.floor((r10 * lx + r11 * ly + r12 * lz + py0) * inv);
          const vz = Math.floor((r20 * lx + r21 * ly + r22 * lz + pz0) * inv);
          if (Math.random() < shatterFrac) {
            if (debrisList.length < 2000) { debrisList.push(w.inBounds(vx, vy, vz) ? w.idx(vx, Math.max(0, vy), vz) : 0); debrisMat.push(m); }
            continue;
          }
          if (dn + 4 <= dep.length) { dep[dn++] = vx; dep[dn++] = vy; dep[dn++] = vz; dep[dn++] = m; }
          if (vx < x0) x0 = vx; if (vx > x1) x1 = vx; if (vy < y0) y0 = vy; if (vy > y1) y1 = vy; if (vz < z0) z0 = vz; if (vz > z1) z1 = vz;
        }
      }
    }
    const box = w.depositMany(dep, dn);
    if (box) {
      // biraz hasarli gorunsun
      for (let k = 0; k < dn; k += 4) {
        const vx = dep[k], vy = dep[k + 1], vz = dep[k + 2];
        if (!w.inBounds(vx, vy, vz)) continue;
        const i = w.idx(vx, vy, vz);
        if (w.mat[i]) w.dmg[i] = Math.min(254, (MAT_TOUGH[w.mat[i]] * (0.35 + Math.random() * 0.4)) | 0);
      }
      w.seedRegion(box[0], box[1], box[2], box[3], box[4], box[5]);
      this.integrityPending = true;
    }
    const fx = this.game.fx;
    if (debrisList.length) {
      fx.voxelDebris(w, debrisList, debrisMat, debrisList.length, p.x, p.y - body.halfY, p.z, 3 + speed * 0.25, 260);
    }
    if (body.icicle) {
      // sarkit yere carpti: buz kirintisi + ince kirag bulutu, cam gibi sesle tuz buz
      const by = p.y - body.halfY;
      fx.impact(p.x, by + 0.05, p.z, 0, 1, 0, M.ICICLE, 1.4);
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.28;
        fx.smoke.emit(p.x, by + 0.1, p.z, Math.cos(a) * 1.2, 0.3 + Math.random() * 0.4, Math.sin(a) * 1.2, 0.8 + Math.random() * 0.6, 0.12, 0.6,
          [0.75, 0.82, 0.88, 0.5], [0.8, 0.85, 0.9, 0], -0.1, 2.2, 0, Math.random() * 6, 0.5);
      }
      if (this.game.audio) this.game.audio.play('iceShatter', p.x, by, p.z, Math.min(1.3, 0.6 + isl.count / 25));
      this.stats.collapses++;
      return;
    }
    // toz bulutu
    const r = Math.max(1, body.radius);
    const nDust = Math.min(40, 6 + isl.count / 120);
    for (let i = 0; i < nDust; i++) {
      const a = Math.random() * 6.28, rr = Math.random() * r;
      const g2 = 0.22 + Math.random() * 0.1;
      fx.smoke.emit(p.x + Math.cos(a) * rr, p.y - body.halfY + 0.3, p.z + Math.sin(a) * rr, Math.cos(a) * 2.5, 0.6 + Math.random(), Math.sin(a) * 2.5,
        2 + Math.random() * 2.5, r * 0.4, r * 1.3, [g2, g2 * 0.95, g2 * 0.88, 0.6], [g2, g2, g2, 0], -0.3, 1.2, 0, Math.random() * 6, 0.3);
    }
    fx.addShake(Math.min(1, isl.count / 3000) * 0.6, p.x, p.y, p.z);
    this.stats.collapses++;
    // yere carpma sesi + yakindakilere hasar
    const audio = this.game.audio;
    if (audio) audio.play('crumble', p.x, p.y, p.z, Math.min(1.4, 0.4 + isl.count / 2500));
    if (speed > 6 && isl.count > 150) {
      for (const a of this.game.actors) {
        if (!a.alive || body.hitActors.has(a)) continue;
        const ap = a.mover.pos;
        const d = Math.hypot(ap.x - p.x, ap.z - p.z);
        if (d < body.radius + 0.6 && ap.y < p.y + body.halfY && ap.y + 2 > p.y - body.halfY - 0.5) {
          a.takeDamage(Math.min(300, isl.count * 0.008 * speed), body.source, 'crush', _v.set(ap.x - p.x, 0.5, ap.z - p.z).normalize(), false);
        }
      }
    }
  }
}
