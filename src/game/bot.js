// Bot yapay zekasi: algi, hedef secimi, A* ile gezinme, siper patlatma, nisan + atis.
import * as THREE from 'three';
import { VS, MOVE, GRAVITY } from '../config.js';
import { Actor } from './actor.js';
import { BotModel } from './botModel.js';
import { WEAPONS } from './weapons.js';
import { fire } from './combat.js';
import { EDGE_JUMP, EDGE_PAD } from './nav.js';

// speed: kosu hizi carpani, head: rayli tufekle kafaya nisan.
// Eren'in geri bildirimi: eski "Caylak" ona gore zor/cok zor -> eski 4 seviye aynen korunup yukari kaydirildi,
// altina 3 yeni kolay seviye eklendi (eski Caylak = Zor, eski Normal = Cok Zor, eski Zor = Usta, eski Kabus = Kabus).
export const SKILLS = [
  { name: 'Acemi', reaction: 1.0, aimErr: 0.3, turn: 2.2, cone: 0.24, strafe: 0.12, breach: 0.08, dodge: 0.0, lead: 0.1, burst: 0.3, speed: 0.7, head: false },
  { name: 'Çaylak', reaction: 0.82, aimErr: 0.23, turn: 2.7, cone: 0.21, strafe: 0.22, breach: 0.14, dodge: 0.03, lead: 0.2, burst: 0.4, speed: 0.78, head: false },
  { name: 'Normal', reaction: 0.66, aimErr: 0.17, turn: 3.3, cone: 0.18, strafe: 0.33, breach: 0.22, dodge: 0.07, lead: 0.3, burst: 0.48, speed: 0.88, head: false },
  { name: 'Zor', reaction: 0.55, aimErr: 0.13, turn: 4.0, cone: 0.16, strafe: 0.45, breach: 0.3, dodge: 0.12, lead: 0.4, burst: 0.55, speed: 1, head: false },
  { name: 'Çok Zor', reaction: 0.34, aimErr: 0.075, turn: 7.0, cone: 0.11, strafe: 0.75, breach: 0.55, dodge: 0.3, lead: 0.75, burst: 0.75, speed: 1, head: false },
  { name: 'Usta', reaction: 0.22, aimErr: 0.045, turn: 10.5, cone: 0.075, strafe: 0.9, breach: 0.8, dodge: 0.5, lead: 0.92, burst: 0.9, speed: 1, head: true },
  { name: 'Kâbus', reaction: 0.14, aimErr: 0.026, turn: 16, cone: 0.055, strafe: 1.0, breach: 0.95, dodge: 0.7, lead: 1.0, burst: 1.0, speed: 1, head: true },
];
export const DEFAULT_SKILL = 2;

// Bot isimleri iki dilde de ayni. Ilk 3'u aile: her macta (bot sayisi yetiyorsa) mutlaka bulunur.
export const BOT_DEFS = [
  ['Papa Eren', 0xff4040], ['Eray the Kid', 0x40ff80], ['Mama Aigul', 0xff40dc],
  ['Rusty Rex', 0xff9a40], ['Turbo Tina', 0x40b8ff], ['Bolt Betty', 0xffd640], ['Sparky Sam', 0x40fff0],
  ['Piston Pete', 0xa860ff], ['Gearbox Gus', 0xc0ff40], ['Lucky Lola', 0xff7aa8], ['Dynamite Dave', 0x8090ff],
];
export const FAMILY_COUNT = 3;

const _eye = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }

export class Bot extends Actor {
  constructor(game, id, name, color, skillLevel) {
    super(game, id, name, color, false);
    this.model = new BotModel(color);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    this.setSkill(skillLevel);
    this.mem = new Map();
    this.target = null;
    this.mode = 'roam';
    this.path = null; this.pathI = 0; this.goal = null; this.goalItem = null; this.repathT = 0;
    this.thinkT = Math.random() * 0.2;
    this.errX = 0; this.errY = 0; this.errTX = 0; this.errTY = 0; this.errT = 0;
    this.reactT = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.jumpT = 1; this.dashT = 2 + Math.random() * 2;
    this.stuckT = 0; this.progressT = 0; this.lastPos = new THREE.Vector3();
    this.detourT = 0; this.detourX = 0; this.detourZ = 0;
    this.breachT = 0;
    this.switchCd = 0;
    this.aimDelta = 1;
    this.firing = false;
    this.favorite = [1, 2, 3, 4][(Math.random() * 4) | 0];
    this.cmd = { fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false };
    this.shore = null; this.shoreT = 0;
    this.burstT = 0; this.pauseT = 0;
    this.dt = 0.016;
  }

  setSkill(level) {
    this.skillLevel = Math.max(0, Math.min(SKILLS.length - 1, level | 0));
    this.skill = SKILLS[this.skillLevel];
    this.mover.speedMul = this.skill.speed;
  }

  spawn(sp) {
    super.spawn(sp);
    this.mem.clear(); this.target = null; this.mode = 'roam'; this.path = null; this.goal = null; this.goalItem = null;
    this.stuckT = 0; this.breachT = 0; this.lastPos.copy(this.mover.pos);
    this.model.root.visible = true;
    this.model.root.position.copy(this.mover.pos);
  }

  memory(a) {
    let r = this.mem.get(a);
    if (!r) { r = { x: 0, y: 0, z: 0, vx: 0, vz: 0, t: -100, visible: false }; this.mem.set(a, r); }
    return r;
  }

  hear(a, pos) {
    if (!a || a === this || !a.alive) return;
    const r = this.memory(a);
    if (r.visible) return;
    const err = 2.5;
    r.x = pos.x + (Math.random() - 0.5) * err; r.y = a.mover.pos.y; r.z = pos.z + (Math.random() - 0.5) * err;
    r.t = this.game.time;
  }

  update(dt) {
    this.dt = dt;
    if (!this.alive) { this.model.root.visible = false; return; }
    this.switchCd = Math.max(0, this.switchCd - dt);
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.09 + Math.random() * 0.05; this.think(); }
    this.steer(dt);
    this.aim(dt);
    this.mover.simulate(dt, this.cmd);
    this.weapons.update(dt);
    this.tryFire(dt);
    const m = this.mover;
    const r = this.model.root;
    r.visible = !(this.game.benchFirstPerson && this.game.spectate === this);
    r.position.set(m.pos.x, m.pos.y - m.stepSmooth, m.pos.z);
    this.model.update({ dt, yaw: this.yaw, pitch: this.pitch, vx: m.vel.x, vz: m.vel.z, vy: m.vel.y, onGround: m.onGround, crouch: m.crouching, protect: this.protect, firing: this.firing });
    this.firing = false;
  }

  think() {
    const game = this.game, now = game.time, w = game.world;
    this.eye(_eye);
    let bestVis = null, bestScore = -1e9;
    const fwdx = -Math.sin(this.yaw), fwdz = -Math.cos(this.yaw);
    for (const a of game.actors) {
      if (a === this || !a.alive) continue;
      a.center(_c);
      const dx = _c.x - _eye.x, dy = _c.y - _eye.y, dz = _c.z - _eye.z;
      const hd = Math.hypot(dx, dz);
      const dist = Math.hypot(hd, dy);
      const rec = this.memory(a);
      if (dist > 75) { rec.visible = false; continue; }
      const dot = (dx * fwdx + dz * fwdz) / (hd + 1e-5);
      if (dot < -0.25 && dist > 6 && a !== this.target) { rec.visible = false; continue; }
      const vis = w.lineOfSight(_eye.x, _eye.y, _eye.z, _c.x, _c.y, _c.z, _hit) ||
        w.lineOfSight(_eye.x, _eye.y, _eye.z, a.mover.pos.x, a.mover.pos.y + a.mover.h - 0.2, a.mover.pos.z, _hit);
      if (vis) {
        rec.x = a.mover.pos.x; rec.y = a.mover.pos.y; rec.z = a.mover.pos.z;
        rec.vx = a.mover.vel.x; rec.vz = a.mover.vel.z; rec.t = now; rec.visible = true;
        let score = -dist;
        if (a.isPlayer) score += game.playerBias;
        if (a === this.target) score += 8;
        if (a === this.lastAttacker && now - this.lastHurtTime < 3) score += 14;
        if (a.health < 50) score += 4;
        if (score > bestScore) { bestScore = score; bestVis = a; }
      } else rec.visible = false;
    }
    // vurulunca saldirgani sezgiyle bil
    if (this.lastAttacker && this.lastAttacker.alive && now - this.lastHurtTime < 0.3) {
      const r = this.memory(this.lastAttacker);
      if (!r.visible) { const p = this.lastAttacker.mover.pos; r.x = p.x + (Math.random() - 0.5) * 3; r.y = p.y; r.z = p.z + (Math.random() - 0.5) * 3; r.t = now; }
    }
    const prevMode = this.mode;
    if (bestVis) {
      if (this.target !== bestVis || prevMode !== 'engage') this.reactT = this.skill.reaction * (0.7 + Math.random() * 0.6);
      this.target = bestVis; this.mode = 'engage';
      this.breachT = 0;
    } else {
      let best = null, bt = -1e9;
      for (const [a, rec] of this.mem) {
        if (!a.alive) continue;
        if (now - rec.t < 8 && rec.t > bt) { bt = rec.t; best = a; }
      }
      if (best) { this.target = best; this.mode = 'hunt'; } else { this.target = null; this.mode = 'roam'; }
    }
    // dusuk can: saglik ara
    if (this.health < 40 && this.mode !== 'roam') {
      const it = game.items.nearest(this.mover.pos, ['health', 'mega'], 22);
      if (it && Math.random() < 0.5) { this.mode = 'retreat'; this.goalItem = it; }
    }
    // siper patlatma karari
    if (this.mode === 'hunt' && this.target) {
      const rec = this.memory(this.target);
      const d = Math.hypot(rec.x - this.mover.pos.x, rec.z - this.mover.pos.z);
      if (now - rec.t < 4.5 && d < 34 && this.breachT <= 0 && Math.random() < this.skill.breach * 0.35) this.breachT = 1.2 + Math.random() * 2.2;
    }
    if (this.breachT > 0) this.breachT -= 0.1;
    this.chooseWeapon();
    this.planMovement();
  }

  targetDist() {
    if (!this.target) return 25;
    const r = this.mode === 'engage' ? this.target.mover.pos : this.memory(this.target);
    return Math.hypot(r.x - this.mover.pos.x, (r.y - this.mover.pos.y) * 0.5, r.z - this.mover.pos.z);
  }

  chooseWeapon() {
    if (this.switchCd > 0) return;
    const ws = this.weapons;
    const has = (i) => ws.ammo[i] > 0;
    const d = this.targetDist();
    let pick = ws.current;
    if (this.breachT > 0) pick = has(3) && d > 5 ? 3 : has(4) ? 4 : has(2) ? 2 : 0;
    else if (this.mode === 'roam') pick = has(this.favorite) ? this.favorite : ws.bestAvailable();
    else if (d < 6.5) pick = has(1) ? 1 : has(2) ? 2 : 0;
    else if (d < 20) pick = (this.favorite === 2 && has(2)) ? 2 : has(3) && d > 5 ? 3 : has(2) ? 2 : 0;
    else pick = (this.favorite === 4 && has(4)) ? 4 : has(4) && Math.random() < 0.45 ? 4 : has(0) ? 0 : has(2) ? 2 : ws.bestAvailable();
    if (!has(pick)) pick = ws.bestAvailable();
    if (pick !== ws.current && ws.pending < 0) { ws.select(pick); this.switchCd = 0.9 + Math.random() * 0.8; }
  }

  preferredRange() {
    const id = this.weapons.def.id;
    return id === 'shotgun' ? 4 : id === 'rocket' ? 11 : id === 'plasma' ? 10 : id === 'rail' ? 26 : 15;
  }

  planMovement() {
    const game = this.game, nav = game.nav, p = this.mover.pos;
    this.repathT -= 0.1;
    let goal = null, goalKey = '';
    if (this.mode === 'engage') {
      // dogrudan gorus varken yerel manevra; cok uzaksa yaklas
      const d = this.targetDist();
      if (d > this.preferredRange() + 14) { const t = this.target.mover.pos; goal = t; goalKey = 'chase'; }
      else { this.path = null; return; }
    } else if (this.mode === 'hunt') {
      const rec = this.memory(this.target);
      goal = rec; goalKey = 'hunt';
    } else if (this.mode === 'retreat' && this.goalItem && this.goalItem.active) {
      goal = this.goalItem.pos; goalKey = 'item';
    } else {
      // dolasma: aktif oge ya da rastgele nokta
      if (!this.goalItem || !this.goalItem.active || !this.path || this.pathI >= (this.path ? this.path.length : 0)) {
        const it = game.items.pickFor(this);
        this.goalItem = it;
        if (!it) {
          if (!this.goal || !this.path || this.pathI >= this.path.length) {
            const n = nav.randomNode();
            if (n >= 0) this.goal = nav.nodePos(n, { x: 0, y: 0, z: 0 });
            this.repathT = 0;
          }
        } else this.repathT = Math.min(this.repathT, 0);
      }
      goal = this.goalItem ? this.goalItem.pos : this.goal; goalKey = 'roam';
    }
    if (!goal) return;
    const moved = !this.goal || Math.hypot(goal.x - this.goal.x, goal.z - this.goal.z) > 3 || this.goalKey !== goalKey;
    if (moved || this.repathT <= 0 || !this.path) {
      const s = nav.nearest(p.x, p.y + 0.2, p.z);
      const g = nav.nearest(goal.x, goal.y + 0.3, goal.z);
      this.path = nav.findPath(s, g, 4500);
      this.pathI = 0;
      this.goal = { x: goal.x, y: goal.y, z: goal.z };
      this.goalKey = goalKey;
      this.repathT = 1.5 + Math.random();
    }
  }

  steer(dt) {
    const p = this.mover.pos, m = this.mover, sk = this.skill;
    if (m.swimming) { this._swimOut(dt); return; }
    this.shore = null;
    let mx = 0, mz = 0, jump = false, dash = false;
    if (this.mode === 'engage' && this.target && !this.path) {
      const t = this.target.mover.pos;
      let dx = t.x - p.x, dz = t.z - p.z;
      const dist = Math.hypot(dx, dz) + 1e-4;
      dx /= dist; dz /= dist;
      const pref = this.preferredRange();
      const radial = dist > pref + 3 ? 1 : dist < pref - 3 ? -0.8 : 0;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.35 + Math.random() * 1.1; }
      const tx = -dz * this.strafeDir, tz = dx * this.strafeDir;
      mx = dx * radial + tx * sk.strafe; mz = dz * radial + tz * sk.strafe;
      // duvara dogru gidiyorsa yonu cevir
      if (this._blocked(mx, mz)) { this.strafeDir *= -1; mx = dx * radial - tx * sk.strafe; mz = dz * radial - tz * sk.strafe; }
      this.jumpT -= dt;
      if (this.jumpT <= 0) { this.jumpT = 0.6 + Math.random() * 2.2; if (Math.random() < sk.dodge) jump = true; }
      this.dashT -= dt;
      if (this.dashT <= 0) { this.dashT = 1.8 + Math.random() * 3; if (Math.random() < sk.dodge * 0.8) dash = true; }
      // tehlikeli roket yakindaysa kac
      for (const pr of this.game.projectiles.list) {
        if (pr.owner === this || pr.W.id !== 'rocket') continue;
        const ddx = pr.pos.x - p.x, ddz = pr.pos.z - p.z;
        if (ddx * ddx + ddz * ddz < 25 && Math.random() < sk.dodge * 0.2) { jump = true; dash = Math.random() < 0.5; }
      }
    } else if (this.path && this.pathI < this.path.length) {
      let wp = this.path[this.pathI];
      let dx = wp.x - p.x, dz = wp.z - p.z;
      let dist = Math.hypot(dx, dz);
      const dyw = wp.y - p.y;
      if ((dist < 0.6 && Math.abs(dyw) < 1.4) || (wp.type === EDGE_PAD && !m.onGround && dist < 2.0)) {
        this.pathI++;
        if (this.pathI < this.path.length) { wp = this.path[this.pathI]; dx = wp.x - p.x; dz = wp.z - p.z; dist = Math.hypot(dx, dz); }
      }
      if (dist > 1e-3) { mx = dx / dist; mz = dz / dist; }
      if (m.onGround && ((wp.type === EDGE_JUMP && dist < 1.7) || (wp.y - p.y > 0.55 && dist < 1.4))) jump = true;
      if (wp.type === EDGE_PAD && !m.onGround) { mx *= 0.3; mz *= 0.3; }
      // av modunda arada ziplayip hizlan
      if (this.mode === 'hunt' && m.onGround && dist > 3 && Math.random() < 0.01 * this.skill.dodge) jump = true;
    } else if (this.mode === 'hunt' && this.target) {
      const r = this.memory(this.target);
      const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.5) { mx = dx / d; mz = dz / d; }
    }
    // takilma tespiti
    this.progressT += dt;
    if (this.progressT > 0.5) {
      const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
      const wanted = Math.hypot(mx, mz) > 0.3;
      if (wanted && moved < 0.35) this.stuckT += this.progressT; else this.stuckT = Math.max(0, this.stuckT - this.progressT * 2);
      this.lastPos.copy(p); this.progressT = 0;
    }
    if (this.stuckT > 0.5 && m.onGround) jump = true;
    if (this.stuckT > 1.4 && this.detourT <= 0) {
      const a = Math.random() * Math.PI * 2;
      this.detourX = Math.cos(a); this.detourZ = Math.sin(a); this.detourT = 0.7;
      this.repathT = 0;
    }
    if (this.stuckT > 2.6 && this.weapons.ammo[2] > 0) this.stuckBlast = true;
    if (this.stuckT > 5) { this.stuckT = 0; this.path = null; this.goal = null; this.goalItem = null; }
    if (this.detourT > 0) { this.detourT -= dt; mx = this.detourX; mz = this.detourZ; }
    // lav korumasi: yalniz istenen yona degil, govdenin hizina da bakar (9.6 m/s'de kayma ~1 m; kiyi
    // egiminden asagi kosan bot havalanip lava ucuyordu). Zemin izlenir: basamak, inis, ucurumdan dusus.
    //  - hiz lava goturuyorsa fren: hizin tersine iste (yerde ~200 m/s2, havada ~17 m/s2)
    //  - istenen yon lava goturuyorsa yan yonleri dene, olmazsa dur
    //  - ziplama / atilma: inis yeri lavsa yapma (ziplayan bot ~6 m, atilan ~6 m gider)
    if (this.game.lavaSys.active) {
      const v = m.vel, s = Math.hypot(v.x, v.z);
      const ws = MOVE.runSpeed * m.speedMul;
      if (m.padLock > 0) this.padFlightT = 1.8;
      this.padFlightT = m.onGround ? 0 : Math.max(0, (this.padFlightT || 0) - dt);
      let brake = false;
      if (!m.onGround) {
        // havada: inis lavdaysa fren. Darbeyle firlatildiysa ilk anlarda sersem (lava itme oyunun parcasi),
        // ped ucusunda yorungeye karisma.
        if (s > 0.5 && this.padFlightT <= 0 && this.game.time - this.lastHurtTime > 0.45 &&
          this._trajLava(p.x, p.y, p.z, v.x, v.y, v.z, 0.3)) brake = true;
      } else if (s > 0.8 && this._runLava(p.x, p.y, p.z, v.x / s, v.z / s, 0.45 + s * 0.1, s)) brake = true;
      if (brake) {
        mx = -v.x / Math.max(s, 1e-3); mz = -v.z / Math.max(s, 1e-3);
        jump = false; dash = false;
        this.detourT = 0;
      } else if (mx !== 0 || mz !== 0) {
        const l = Math.hypot(mx, mz), ux = mx / l, uz = mz / l;
        const look = 0.7 + Math.max(s, ws * 0.5) * 0.09, rs = Math.max(s, ws * 0.6);
        if (this._runLava(p.x, p.y, p.z, ux, uz, look, rs)) {
          let found = false;
          for (const [ax, az] of [[-uz, ux], [uz, -ux], [-ux, -uz]]) {
            if (!this._runLava(p.x, p.y, p.z, ax, az, look, rs)) { mx = ax * l; mz = az * l; found = true; break; }
          }
          if (!found) { mx = 0; mz = 0; }
          jump = false; dash = false;
          this.detourT = 0;
        }
      }
      if (jump && m.onGround) {
        const l = Math.hypot(mx, mz) || 1;
        if (this._trajLava(p.x, p.y, p.z, v.x, MOVE.jumpVel, v.z, 0.4) ||
          this._trajLava(p.x, p.y, p.z, mx / l * ws, MOVE.jumpVel, mz / l * ws, 0.4)) jump = false;
      }
      if (dash) {
        let dx = mx, dz = mz, l = Math.hypot(dx, dz);
        if (l < 1e-6) { dx = -Math.sin(this.yaw); dz = -Math.cos(this.yaw); l = 1; }
        // ziplarken atilma: ~17.5 m/s yatay + ziplama hizi (en uzun ucus)
        const sp = Math.max(MOVE.dashSpeed, s * 1.05);
        const vy0 = jump ? MOVE.jumpVel : m.onGround ? MOVE.dashUp : 1.2;
        if (this._trajLava(p.x, p.y, p.z, dx / l * sp, vy0, dz / l * sp, 1.2)) dash = false;
      }
    }
    // yuze gore ileri/yan
    const fy = this.yaw;
    const fx = -Math.sin(fy), fz = -Math.cos(fy), rx = Math.cos(fy), rz = -Math.sin(fy);
    this.cmd.fwd = mx * fx + mz * fz;
    this.cmd.side = mx * rx + mz * rz;
    this.cmd.yaw = fy;
    this.cmd.jump = jump;
    this.cmd.dash = dash;
    this.cmd.crouch = false;
    this.moveDirX = mx; this.moveDirZ = mz;
  }

  _blocked(mx, mz) {
    const l = Math.hypot(mx, mz);
    if (l < 1e-3) return false;
    const p = this.mover.pos, w = this.game.world;
    const ax = p.x + mx / l * 0.9, az = p.z + mz / l * 0.9;
    if (w.solidAtWorld(ax, p.y + 0.8, az) || w.solidAtWorld(ax, p.y + 1.5, az)) return true;
    // lava dogru yurume
    if (this.game.lavaSys.active && this._runLava(p.x, p.y, p.z, mx / l, mz / l, 1.3, MOVE.runSpeed * this.mover.speedMul * 0.6)) return true;
    // derin suya bilerek girme (yuzerken ates edemez, bogulabilir)
    if (w.waterY > -1e9 && !this.mover.swimming) {
      const bx = p.x + mx / l * 1.3, bz = p.z + mz / l * 1.3;
      let ground = -1e9;
      for (let y = p.y + 0.3, k = 0; k < 20; k++, y -= 0.25) if (w.solidAtWorld(bx, y, bz)) { ground = y; break; }
      if (w.waterY - ground > 0.9) return true;
    }
    return false;
  }

  // (x,y,z)'den (ux,uz) yonunde dist metre yerde kosulursa lava girer mi. Zemin izlenir: adim yuksekligi kadar
  // cikar, ~0.7 m'ye kadar iner; zemin daha cok dusuyorsa o noktadan speed hiziyla dusus yorungesine bakar.
  // Duvar ya da alcak tavan o yonde ilerlemeyi keser (lav degil).
  _runLava(x, y, z, ux, uz, dist, speed, depth = 0) {
    const ls = this.game.lavaSys, w = this.game.world;
    const n = Math.max(1, Math.ceil(dist / VS)), st = dist / n;
    for (let i = 1; i <= n; i++) {
      const px = x + ux * st * i, pz = z + uz * st * i;
      const X = Math.floor(px / VS), Z = Math.floor(pz / VS);
      // en yuksek cikilabilir zemin voxeli: ustu y + adim yuksekligini gecmeyen
      const top = Math.floor((y + MOVE.stepHeight) / VS) - 1, bot = Math.floor((y - 0.7) / VS);
      let gy = -1;
      for (let vy = top; vy >= bot; vy--) if (w.solid(X, vy, Z)) { gy = vy + 1; break; }
      // ucurum / krater kenari: dusus, inince egimden kayma da (en cok iki kademe)
      if (gy < 0) return this._trajLava(px, y, pz, ux * speed, 0, uz * speed, depth < 2 ? 0.3 : 0, depth + 1);
      if (w.solid(X, gy, Z) || w.solid(X, gy + 2, Z) || w.solid(X, gy + 5, Z)) return false;
      y = gy * VS;
      if (y <= ls.level + 0.08 && ls.isLava(px, Math.min(y + 0.05, ls.level - 0.05), pz)) return true;
    }
    return false;
  }

  // (x,y,z)'den (vx,vy,vz) hiziyla serbest ucus: lava duserse true. Duvara carparsa onunde dikey duser.
  // margin > 0: inis noktasindan hiz yonunde margin + kayma kadar zemin de taranir.
  _trajLava(x, y, z, vx, vy, vz, margin = 0, depth = 0) {
    const ls = this.game.lavaSys, w = this.game.world;
    const sh = Math.hypot(vx, vz);
    for (let t = 0; t < 2.2;) {
      const dt = Math.min(0.035, 0.22 / Math.max(1, sh, Math.abs(vy)));
      t += dt;
      vy = Math.max(-MOVE.maxFallSpeed, vy - GRAVITY * dt);
      const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
      if (ny <= ls.level + 0.08 && ls.isLava(nx, Math.min(ny + 0.05, ls.level - 0.05), nz)) return true;
      if (w.solidAtWorld(nx, ny, nz)) {
        const ty = (Math.floor(ny / VS) + 1) * VS;
        if (vy > 0 || ty > y + 1e-3) {
          // duvar / tavan: yatay hiz biter, buradan asagi dusus
          for (let yy = y; yy > ls.level - 0.3; yy -= VS) if (w.solidAtWorld(x, yy, z)) return false;
          return ls.isLava(x, ls.level - 0.05, z);
        }
        if (margin > 0 && sh > 0.5) return this._runLava(nx, ty, nz, vx / sh, vz / sh, margin + sh * 0.06, sh, depth);
        return false;
      }
      x = nx; y = ny; z = nz;
    }
    return false;
  }

  // suya dustu: en yakin kiyi dugumune yuz, yuzeyde kal (Bosluk), kiyiya tirman
  _swimOut(dt) {
    const p = this.mover.pos, nav = this.game.nav;
    this.shoreT -= dt;
    if (!this.shore || this.shoreT <= 0) {
      this.shoreT = 1;
      const wy = this.game.world.waterY;
      let id = nav.nearestShore(p.x, p.z, wy - 1.0, wy + 0.95, 16);
      if (id < 0) id = nav.nearest(p.x, wy, p.z, 16);
      this.shore = id >= 0 ? nav.nodePos(id, { x: 0, y: 0, z: 0 }) : null;
      this.path = null;
    }
    let mx = 0, mz = 0;
    // buz golu: basin ustu buz tavansa yerinde kalip yukari it (fx/ice.js buzu alttan kirar); yuzerek
    // kiyiya gitmeye calisirsa her seferinde yeni tavanin altina girer
    if (this.shore && !(this.underIceT > 0 && this.mover.eyesUnder)) {
      const dx = this.shore.x - p.x, dz = this.shore.z - p.z, d = Math.hypot(dx, dz) || 1;
      mx = dx / d; mz = dz / d;
    }
    const fy = this.yaw;
    const fx = -Math.sin(fy), fz = -Math.cos(fy), rx = Math.cos(fy), rz = -Math.sin(fy);
    const c = this.cmd;
    c.fwd = mx * fx + mz * fz; c.side = mx * rx + mz * rz; c.yaw = fy; c.pitch = 0;
    c.jump = true; c.crouch = false; c.dash = false;
    this.moveDirX = mx; this.moveDirZ = mz;
  }

  aim(dt) {
    const sk = this.skill, p = this.mover.pos;
    this.eye(_eye);
    let tx, ty, tz, has = false, precise = false;
    if (this.mode === 'engage' && this.target) {
      const t = this.target, tp = t.mover.pos;
      const W = this.weapons.def;
      tx = tp.x; ty = tp.y + t.mover.h * (W.id === 'rail' && sk.head ? 0.82 : 0.55); tz = tp.z;
      if (W.type === 'projectile') {
        const d = Math.hypot(tx - _eye.x, ty - _eye.y, tz - _eye.z);
        const tt = d / W.speed * sk.lead;
        tx += t.mover.vel.x * tt; tz += t.mover.vel.z * tt;
        if (W.id === 'rocket' && t.mover.onGround) ty = tp.y + 0.15;
      }
      has = true; precise = true;
    } else if (this.target && (this.breachT > 0 || this.mode === 'hunt')) {
      const r = this.memory(this.target);
      tx = r.x; ty = r.y + 1.0; tz = r.z; has = true;
    }
    if (!has) {
      // yuruyus yonune bak
      if (this.path && this.pathI < this.path.length) {
        const k = Math.min(this.path.length - 1, this.pathI + 2);
        const wp = this.path[k];
        tx = wp.x; ty = wp.y + 1.5; tz = wp.z; has = true;
      } else if (Math.abs(this.moveDirX || 0) + Math.abs(this.moveDirZ || 0) > 0.1) {
        tx = p.x + this.moveDirX * 5; ty = _eye.y; tz = p.z + this.moveDirZ * 5; has = true;
      }
    }
    if (this.mover.swimming && this.shore) {
      // yuzerken kiyiya bak (ileri yuzup kiyiya tirmanabilsin)
      tx = this.shore.x; ty = _eye.y; tz = this.shore.z; has = true; precise = false;
    }
    if (this.stuckBlast) {
      // onumuzdeki engeli plazmayla oy
      tx = p.x + (this.moveDirX || -Math.sin(this.yaw)) * 2; ty = p.y + 0.9; tz = p.z + (this.moveDirZ || -Math.cos(this.yaw)) * 2; has = true;
    }
    if (!has) return;
    this.errT -= dt;
    if (this.errT <= 0) {
      this.errT = 0.22 + Math.random() * 0.4;
      const tvel = this.target ? Math.hypot(this.target.mover.vel.x, this.target.mover.vel.z) : 0;
      const k = sk.aimErr * (1 + tvel * 0.04) * (precise ? 1 : 0.5);
      this.errTX = gauss() * k; this.errTY = gauss() * k * 0.55;
    }
    this.errX += (this.errTX - this.errX) * Math.min(1, dt * 5);
    this.errY += (this.errTY - this.errY) * Math.min(1, dt * 5);
    const dx = tx - _eye.x, dy = ty - _eye.y, dz = tz - _eye.z;
    const dyaw = Math.atan2(-dx, -dz) + this.errX;
    const dpitch = Math.atan2(dy, Math.hypot(dx, dz)) + this.errY;
    const ay = angDiff(dyaw, this.yaw), ap = dpitch - this.pitch;
    const maxT = sk.turn * dt;
    const sy = Math.max(-maxT, Math.min(maxT, ay * Math.min(1, dt * 12)));
    const sp = Math.max(-maxT, Math.min(maxT, ap * Math.min(1, dt * 12)));
    this.yaw += sy; this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + sp));
    // gercek hedefe gore sapma (ates karari)
    const ty0 = Math.atan2(-dx, -dz), tp0 = Math.atan2(dy, Math.hypot(dx, dz));
    this.aimDelta = Math.hypot(angDiff(ty0, this.yaw), tp0 - this.pitch);
  }

  tryFire(dt) {
    const ws = this.weapons, game = this.game;
    if (!ws.canFire() || this.mover.eyesUnder) return;
    const W = ws.def;
    let ok = false;
    if (this.stuckBlast) {
      if (ws.current !== 2) { if (ws.pending < 0) ws.select(2); return; }
      ok = true; this.stuckBlast = false; this.stuckT = 1.0;
    } else if (this.mode === 'engage' && this.target) {
      if (this.reactT > 0) { this.reactT -= dt; return; }
      const cone = this.skill.cone * (W.id === 'rail' ? 0.45 : W.id === 'shotgun' ? 1.6 : 1);
      if (this.aimDelta > cone + 0.02) return;
      // patlama: dibimize atma
      if (W.id === 'rocket' && this.targetDist() < 3.5) return;
      // ara ara atesi kes (insan gibi)
      this.burstT -= dt;
      if (this.pauseT > 0) { this.pauseT -= dt; return; }
      if (this.burstT <= 0) { this.burstT = 0.6 + Math.random() * 1.6; if (Math.random() > this.skill.burst) { this.pauseT = 0.25 + Math.random() * 0.5; return; } }
      ok = true;
    } else if (this.breachT > 0 && this.target) {
      if (!(W.id === 'rocket' || W.id === 'rail' || W.id === 'plasma')) return;
      if (this.aimDelta > 0.12) return;
      ok = true;
    }
    if (!ok) return;
    this.eye(_eye);
    this.aimDir(_dir);
    // kendi dibine roket atma
    if (W.id === 'rocket' && game.world.raycast(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, 2.6, _hit)) return;
    // atis efektleri modelin namlu ucundan; model gizliyse (birinci sahis izleme) gozun onunden
    const m = this.mover;
    if (this.model.root.visible) this.model.muzzle(_muz, m.pos.x, m.pos.y - m.stepSmooth, m.pos.z, this.yaw, this.pitch);
    else {
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      _muz.set(_eye.x + _dir.x * 0.55 + rx * 0.12, _eye.y - 0.25 + _dir.y * 0.55, _eye.z + _dir.z * 0.55 + rz * 0.12);
    }
    fire(game, this, _eye, _dir, _muz);
    this.firing = true;
  }

  onHurt() { this.model.hit(); }
}
