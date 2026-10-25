// Roket ve plazma mermileri.
import * as THREE from 'three';
import { VS, DOOMSDAY } from '../config.js';
import { splashDamage } from './combat.js';

const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
const _dir = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 0, 1);
// sabit / yeniden kullanilan renk dizileri (kare basina cop uretmesin)
const C_FIRE0 = [10, 5, 1.6, 1], C_FIRE1 = [3, 0.8, 0.1, 0];
const C_PL0 = [0.8, 3.5, 5, 0.9], C_PL1 = [0.2, 1, 2, 0];
const C_SP0 = [0.5, 3, 5, 1], C_SP1 = [0.1, 0.5, 1, 0];
const S0 = [0, 0, 0, 0], S1 = [0, 0, 0, 0];
const _neg = new THREE.Vector3();

function makeRocketMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8d96a1, metalness: 0.7, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.6, roughness: 0.5 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 3.5, 1) });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.42, 10), metal);
  body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 10), dark);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -0.29;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.3) }));
  band.rotation.x = Math.PI / 2; band.position.z = -0.12;
  const ex = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glow);
  ex.position.z = 0.22; ex.scale.set(1, 1, 1.8);
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.11, 0.12), dark);
    fin.position.z = 0.16;
    const a = i * Math.PI / 2;
    fin.position.x = Math.cos(a) * 0.08; fin.position.y = Math.sin(a) * 0.08;
    fin.rotation.z = a;
    g.add(fin);
  }
  g.add(body, nose, band, ex);
  for (const c of g.children) c.castShadow = true;
  return g;
}

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rocketPool = [];
    const MAXP = 160;
    this.plasmaMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 6, 9) }), MAXP);
    this.plasmaMesh.count = 0;
    this.plasmaMesh.frustumCulled = false;
    this.plasmaMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    game.scene.add(this.plasmaMesh);
    this.maxPlasma = MAXP;
  }

  // shader on derlemesi icin havuza hazir roket modelleri koy (ilk atista model/malzeme olusturma takilmasi olmasin)
  prewarm(n = 6) {
    while (this.rocketPool.length < n) this.rocketPool.push(makeRocketMesh());
    return this.rocketPool;
  }

  clear() {
    for (const p of this.list) this._release(p);
    this.list.length = 0;
    this.plasmaMesh.count = 0;
  }

  spawn(W, owner, origin, dir, quad, muzzle) {
    const p = {
      W, owner, quad, life: 0,
      pos: origin.clone().addScaledVector(dir, 0.25),
      vel: dir.clone().multiplyScalar(W.speed),
      vis: new THREE.Vector3().subVectors(muzzle, origin),
      mesh: null, light: null, trailT: 0,
    };
    if (W.id === 'rocket') {
      let m = this.rocketPool.pop();
      if (!m) m = makeRocketMesh();
      this.game.scene.add(m);
      p.mesh = m;
      p.lightObj = m;
      p.light = this.game.fx.lights.attach(m, 0xff8a3a, 5, 8, 2);
    } else if (W.id === 'plasma') {
      if (Math.random() < 0.25) { p.lightObj = new THREE.Vector3().copy(p.pos); p.light = this.game.fx.lights.attach(p.lightObj, 0x40e8ff, 3, 5, 1); }
    }
    // namlu duvara dayaliysa hemen patlat
    const w = this.game.world;
    if (w.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 0.3, _hit)) {
      const x = origin.x + dir.x * _hit.dist, y = origin.y + dir.y * _hit.dist, z = origin.z + dir.z * _hit.dist;
      this.explode(p, x, y, z, _hit.nx, _hit.ny, _hit.nz, null);
      this._release(p);
      return;
    }
    this.list.push(p);
  }

  _release(p) {
    if (p.mesh) { this.game.scene.remove(p.mesh); this.rocketPool.push(p.mesh); p.mesh = null; }
    // isik yuvasi bu arada bir patlamaya verilmis olabilir: yalniz hala bizimse birak
    if (p.light && p.light.follow === p.lightObj) this.game.fx.lights.release(p.light);
    p.light = null;
  }

  update(dt) {
    const game = this.game, w = game.world, fx = game.fx;
    let pc = 0;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      if (p.life > 7) { this._release(p); list.splice(i, 1); continue; }
      const sp = p.vel.length();
      const step = sp * dt;
      _dir.copy(p.vel).divideScalar(sp);
      let bestT = step + p.W.radius, hitActor = null;
      let wHit = w.raycast(p.pos.x, p.pos.y, p.pos.z, _dir.x, _dir.y, _dir.z, bestT, _hit);
      if (wHit) bestT = _hit.dist;
      for (const a of game.actors) {
        if (!a.alive || a === p.owner) continue;
        const r = a.rayHit(p.pos, _dir, bestT);
        if (r) { bestT = r.t; hitActor = a; wHit = false; }
      }
      if (wHit || hitActor) {
        const x = p.pos.x + _dir.x * bestT, y = p.pos.y + _dir.y * bestT, z = p.pos.z + _dir.z * bestT;
        this.explode(p, x, y, z, wHit ? _hit.nx : -_dir.x, wHit ? _hit.ny : -_dir.y, wHit ? _hit.nz : -_dir.z, hitActor);
        this._release(p); list.splice(i, 1);
        continue;
      }
      const py0 = p.pos.y;
      p.pos.addScaledVector(p.vel, dt);
      p.vis.multiplyScalar(Math.exp(-dt * 10));
      // su yuzeyini gecti: sicrama + halka
      const L = w.waterY;
      const under = p.pos.y < L;
      if ((py0 >= L) !== under && game.waterSys.active) {
        const k = (L - py0) / (p.pos.y - py0 || 1e-6) - 1;   // gecis noktasi: bu karenin hareketi boyunca
        const sx = p.pos.x + p.vel.x * dt * k, sz = p.pos.z + p.vel.z * dt * k;
        fx.splash(sx, L, sz, p.W.id === 'rocket' ? 0.7 : 0.25);
        game.waterSys.ripple(sx, sz, 0.35, p.W.id === 'rocket' ? 0.06 : 0.025);
      }
      const vx = p.pos.x + p.vis.x, vy = p.pos.y + p.vis.y, vz = p.pos.z + p.vis.z;
      if (p.W.id === 'rocket') {
        p.mesh.position.set(vx, vy, vz);
        _q.setFromUnitVectors(_up, _neg.copy(_dir).negate());
        p.mesh.quaternion.copy(_q);
        // duman izi + alev (su altinda kabarcik izi)
        p.trailT += dt;
        if (under) { while (p.trailT > 0.03) { p.trailT -= 0.03; fx.bubbles(vx - _dir.x * 0.3, vy - _dir.y * 0.3, vz - _dir.z * 0.3, 0.12); } }
        while (!under && p.trailT > 0.012) {
          p.trailT -= 0.012;
          const g = 0.16 + Math.random() * 0.08;
          S0[0] = g; S0[1] = g; S0[2] = g * 1.02; S0[3] = 0.5;
          S1[0] = g * 1.4; S1[1] = g * 1.4; S1[2] = g * 1.4; S1[3] = 0;
          fx.smoke.emit(vx - _dir.x * 0.3, vy - _dir.y * 0.3, vz - _dir.z * 0.3, (Math.random() - 0.5) * 0.6, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6,
            1.4 + Math.random() * 1.2, 0.12, 0.7 + Math.random() * 0.4, S0, S1, -0.25, 1.0, 0, Math.random() * 6, (Math.random() - 0.5));
        }
        if (!under) fx.add.emit(vx - _dir.x * 0.26, vy - _dir.y * 0.26, vz - _dir.z * 0.26, -_dir.x * 4, -_dir.y * 4, -_dir.z * 4, 0.05, 0.22, 0.08, C_FIRE0, C_FIRE1, 0, 0, 0);
      } else {
        if (pc < this.maxPlasma) {
          _m.makeTranslation(vx, vy, vz);
          this.plasmaMesh.setMatrixAt(pc++, _m);
        }
        fx.add.emit(vx, vy, vz, 0, 0, 0, 0.035, 0.42, 0.3, C_PL0, C_PL1, 0, 0, 0);
        if (Math.random() < 0.5) fx.add.emit(vx, vy, vz, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.25, 0.05, 0.01, C_SP0, C_SP1, 0, 1, 0);
        if (p.light && p.light.follow === p.lightObj) p.lightObj.copy(p.pos);
      }
    }
    this.plasmaMesh.count = pc;
    if (pc) this.plasmaMesh.instanceMatrix.needsUpdate = true;
  }

  explode(p, x, y, z, nx, ny, nz, direct) {
    const game = this.game, W = p.W, quad = p.quad;
    _dir.copy(p.vel).normalize();
    if (direct) {
      direct.takeDamage(quad > 1 ? DOOMSDAY.lethal : W.damage, p.owner, W.id, _dir, false);
      direct.mover.impulse(_dir.x * W.knock * 0.5, 2, _dir.z * W.knock * 0.5);
      game.fx.robotHit(x, y, z, _dir.x, _dir.y, _dir.z, direct.color, 1.5);
    }
    // patlama merkezi yuzeyden biraz disarida (hasar), voxel oyma biraz iceride
    const ox = x + nx * 0.15, oy = y + ny * 0.15, oz = z + nz * 0.15;
    splashDamage(game, ox, oy, oz, W, p.owner, quad, direct);
    const qm = quad > 1 ? 1.45 : 1;
    // su altinda: ates topu yerine water.js patlamasi (kubbe, su sutunu, flas, gaz kabarcigi)
    const ws = game.waterSys;
    const deep = ws.active && ws.isWater(ox, oy, oz) && oy < game.world.waterY - 0.45;
    if (W.id === 'rocket') {
      const dm = quad > 1 ? DOOMSDAY.rocketScale : 1;
      game.destruction.blast(x - nx * 0.2, y - ny * 0.2, z - nz * 0.2, W.voxR * dm, W.voxP * (quad > 1 ? 2 : 1), p.owner, 10 * (quad > 1 ? 2.5 : 1), quad > 1 ? 900 : 320);
      const wet = ws.active && ws.explode(ox, oy, oz, quad > 1 ? 2.6 : 1);
      if (!deep) game.fx.explosion(ox, oy, oz, 3.0 * (quad > 1 ? 2.4 : 1), quad > 1 ? 0xff5a2a : 0xff7a1a, quad > 1 ? 1.6 : 1, nx, ny, nz);
      else { game.fx.bubbles(ox, oy, oz, 4); game.fx.addShake(0.4 * (quad > 1 ? 2 : 1), ox, oy, oz); }
      if (game.audio) {
        game.audio.play('explosion', ox, oy, oz, (quad > 1 ? 1.8 : 1) * (deep ? 0.6 : 1));
        if (wet) game.audio.play('splash', ox, game.world.waterY, oz, 1.5);
      }
    } else {
      game.destruction.blast(x - nx * 0.1, y - ny * 0.1, z - nz * 0.1, W.voxR * qm, W.voxP * qm, p.owner, 5, 40);
      if (!deep) game.fx.plasmaHit(ox, oy, oz, nx, ny, nz); else game.fx.bubbles(ox, oy, oz, 0.8);
      if (game.audio) game.audio.play('plasmaHit', ox, oy, oz, deep ? 0.5 : 1);
    }
    game.noise(p.owner, { x: ox, y: oy, z: oz }, 30);
  }
}
