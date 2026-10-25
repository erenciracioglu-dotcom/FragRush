// Oyuncu ve botlarin ortak tabani: can/zirh, hasar, isabet hacimleri, dogma.
import * as THREE from 'three';
import { PLAYER, MOVE, DOOMSDAY, WATER } from '../config.js';
import { Mover } from './mover.js';
import { WeaponState } from './weapons.js';

const _v = new THREE.Vector3();

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  if (t0 >= 0) return t0;
  const t1 = tca + thc;
  return t1 >= 0 ? 0 : -1;
}

export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < minX || ox > maxX) return -1; }
  else { let a = (minX - ox) / dx, b = (maxX - ox) / dx; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dy) < 1e-9) { if (oy < minY || oy > maxY) return -1; }
  else { let a = (minY - oy) / dy, b = (maxY - oy) / dy; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < minZ || oz > maxZ) return -1; }
  else { let a = (minZ - oz) / dz, b = (maxZ - oz) / dz; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (tmax < Math.max(0, tmin)) return -1;
  return Math.max(0, tmin);
}

export class Actor {
  constructor(game, id, name, color, isPlayer) {
    this.game = game;
    this.id = id; this.name = name; this.color = color; this.isPlayer = isPlayer;
    this.mover = new Mover(game.world);
    this.weapons = new WeaponState();
    this.health = 0; this.armor = 0; this.alive = false;
    this.frags = 0; this.deaths = 0; this.streak = 0;
    this.yaw = 0; this.pitch = 0;
    this.quad = 0; this.protect = 0;
    this.respawnTimer = 0;
    this.lastAttacker = null; this.lastHurtTime = -100;
    this.lastFireTime = -100;
    this.decayTimer = 0;
    this.killer = null;
    // nefes: gozler su altindayken azalir, bitince bogulma hasari (her saniye artar)
    this.air = WATER.air;
    this.underT = 0;
    this.drownT = 0;
    this.drownDmg = 0;
  }

  // gozler su altinda: ates edilemez, nefes azalir
  get submerged() { return this.mover.eyesUnder; }

  get pos() { return this.mover.pos; }
  eye(out) { const p = this.mover.pos; return out.set(p.x, p.y + this.mover.eyeHeight - this.mover.stepSmooth * 0.0, p.z); }
  center(out) { const p = this.mover.pos; return out.set(p.x, p.y + this.mover.h * 0.55, p.z); }
  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  spawn(sp) {
    this.mover.reset(sp.x, sp.y + 0.02, sp.z);
    this.yaw = sp.yaw || 0; this.pitch = 0;
    this.health = PLAYER.spawnHealth; this.armor = PLAYER.spawnArmor;
    this.alive = true;
    this.protect = PLAYER.spawnProtect;
    this.quad = 0;
    this.weapons.reset();
    this.weapons.current = this.isPlayer ? 3 : this.weapons.bestAvailable();
    this.streak = 0;
    this.lastAttacker = null;
    this.air = WATER.air; this.underT = 0; this.drownT = 0; this.drownDmg = 0;
  }

  // isin - aktor kesisimi: {t, head} ya da null
  rayHit(o, d, maxT) {
    if (!this.alive) return null;
    const p = this.mover.pos, h = this.mover.h;
    const hs = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, p.x, p.y + h - 0.24, p.z, 0.27);
    const hb = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, p.x - 0.4, p.y, p.z - 0.4, p.x + 0.4, p.y + h - 0.44, p.z + 0.4);
    let t = -1, head = false;
    if (hs >= 0 && (hb < 0 || hs <= hb + 0.05)) { t = hs; head = true; }
    else if (hb >= 0) { t = hb; }
    if (t < 0 || t > maxT) return null;
    return { t, head };
  }

  // nokta ile vucut kutusu arasi en yakin mesafe
  distanceTo(x, y, z) {
    const p = this.mover.pos;
    const cx = Math.max(p.x - 0.4, Math.min(x, p.x + 0.4));
    const cy = Math.max(p.y, Math.min(y, p.y + this.mover.h));
    const cz = Math.max(p.z - 0.4, Math.min(z, p.z + 0.4));
    return Math.hypot(x - cx, y - cy, z - cz);
  }

  takeDamage(dmg, attacker, weaponId, dir, head, pierceArmor = false) {
    if (!this.alive || dmg <= 0) return 0;
    if (this.protect > 0 && attacker !== this) return 0;
    if (attacker === this) dmg *= PLAYER.selfDamageScale;
    if (attacker && attacker !== this && attacker.quad > 0 && weaponId !== 'crush') dmg *= 1; // quad carpani silahta uygulanir
    dmg = Math.round(dmg);
    const absorbed = pierceArmor ? 0 : Math.min(this.armor, Math.ceil(dmg * 0.66));
    this.armor -= absorbed;
    const real = dmg - absorbed;
    this.health -= real;
    if (attacker && attacker !== this) this.lastAttacker = attacker;
    this.lastHurtTime = this.game.time;
    this.game.onDamage(this, attacker, dmg, dir, head, weaponId);
    if (this.health <= 0) this.die(attacker, weaponId, head);
    return dmg;
  }

  die(attacker, weaponId, head) {
    if (!this.alive) return;
    this.alive = false;
    this.health = Math.min(this.health, 0);
    this.deaths++;
    this.killer = attacker;
    this.respawnTimer = PLAYER.respawnDelay;
    this.game.onKill(this, attacker, weaponId, head);
  }

  give(type) {
    switch (type) {
      case 'health': if (this.health >= PLAYER.maxHealth) return false; this.health = Math.min(PLAYER.maxHealth, this.health + 25); return true;
      case 'mega': if (this.health >= PLAYER.overHealth) return false; this.health = Math.min(PLAYER.overHealth, this.health + 100); return true;
      case 'armor': if (this.armor >= PLAYER.maxArmor) return false; this.armor = Math.min(PLAYER.maxArmor, this.armor + 50); return true;
      case 'ammo': {
        let any = false;
        const W = this.game.WEAPONS;
        for (let i = 0; i < W.length; i++) if (this.weapons.ammo[i] < W[i].ammoMax) { this.weapons.ammo[i] = Math.min(W[i].ammoMax, this.weapons.ammo[i] + W[i].ammoPickup); any = true; }
        return any;
      }
      case 'quad': this.quad = DOOMSDAY.time; return true;
      default: return false;
    }
  }

  // Q3 gibi: 100 ustu can/zirh yavasca erir
  tickStats(dt) {
    this.protect = Math.max(0, this.protect - dt);
    this.quad = Math.max(0, this.quad - dt);
    this.tickAir(dt);
    if (!this.alive) return;
    this.decayTimer += dt;
    if (this.decayTimer >= 1) {
      this.decayTimer -= 1;
      if (this.health > PLAYER.maxHealth) this.health--;
      if (this.armor > PLAYER.maxHealth) this.armor--;
    }
  }

  // Quake gibi: su ustune cikinca nefes hemen dolar; nefes bitince bogulma hasari zirhi delip gecer
  // ve olum kendini parcalama sayilir (saldirgan yok)
  tickAir(dt) {
    if (this.mover.eyesUnder) {
      this.underT += dt;
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownT -= dt;
        if (this.drownT <= 0) {
          this.drownT = 1;
          this.drownDmg = this.drownDmg ? Math.min(WATER.drownMax, this.drownDmg + WATER.drownStep) : WATER.drownFirst;
          if (this.game.onDrown) this.game.onDrown(this, this.drownDmg);
          this.takeDamage(this.drownDmg, null, 'drown', null, false, true);
        }
      }
    } else {
      if (this.underT > 0 && this.game.onSurface) this.game.onSurface(this, this.underT);
      this.underT = 0; this.air = WATER.air; this.drownT = 0; this.drownDmg = 0;
    }
  }
}
