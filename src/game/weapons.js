// Silah tanimlari + envanter durumu.
// vox: duvara etki (yaricap m, guc tough-birimi). Hasarlar Q3 ruhunda.

export const WEAPONS = [
  {
    id: 'pulse', key: 1, name: 'Darbe Tüfeği', short: 'DARBE', type: 'hitscan',
    rate: 11, damage: 8, headMul: 1.75, pellets: 1, spread: 0.010, spreadMax: 0.032, spreadPerShot: 0.0035, range: 220,
    ammoMax: 250, ammoStart: 140, ammoPickup: 60,
    voxR: 0.32, voxP: 78, knock: 0.6,
    tracer: 0xffc070, recoil: 0.0065, kick: 0.012, shake: 0.02, sound: 'pulse', color: 0xffb050,
  },
  {
    id: 'shotgun', key: 2, name: 'Saçmalı', short: 'SAÇMA', type: 'hitscan',
    rate: 1.05, damage: 7, headMul: 1.3, pellets: 14, spread: 0.07, range: 70,
    ammoMax: 40, ammoStart: 18, ammoPickup: 10,
    voxR: 0.36, voxP: 96, knock: 2.2,
    tracer: 0xffe0a0, recoil: 0.045, kick: 0.06, shake: 0.12, sound: 'shotgun', color: 0xffd080,
  },
  {
    id: 'plasma', key: 3, name: 'Plazma', short: 'PLAZMA', type: 'projectile',
    rate: 9.5, damage: 16, splashDamage: 12, splashR: 1.1, speed: 62, gravity: 0, radius: 0.12,
    ammoMax: 200, ammoStart: 90, ammoPickup: 50,
    voxR: 0.85, voxP: 165, knock: 1.2,
    recoil: 0.004, kick: 0.008, shake: 0.015, sound: 'plasma', color: 0x40e8ff,
  },
  {
    id: 'rocket', key: 4, name: 'Roketatar', short: 'ROKET', type: 'projectile',
    rate: 1.2, damage: 100, splashDamage: 100, splashR: 4.2, speed: 30, gravity: 0, radius: 0.18,
    ammoMax: 50, ammoStart: 12, ammoPickup: 8,
    voxR: 2.5, voxP: 430, knock: 11,
    recoil: 0.03, kick: 0.05, shake: 0.1, sound: 'rocket', color: 0xff7a1a,
  },
  {
    id: 'rail', key: 5, name: 'Raylı Tüfek', short: 'RAY', type: 'rail',
    rate: 0.72, damage: 100, headMul: 1.5, range: 260, pierce: 14,
    ammoMax: 30, ammoStart: 8, ammoPickup: 6,
    voxR: 0.55, voxP: 300, knock: 4,
    recoil: 0.05, kick: 0.07, shake: 0.08, sound: 'rail', color: 0xb070ff, zoom: 2.4,
  },
];

export class WeaponState {
  constructor() {
    this.ammo = WEAPONS.map(() => 0);
    this.has = WEAPONS.map(() => false);
    this.current = 0;
    this.previous = 0;
    this.pending = -1;
    this.switchT = 0;        // silah degisim zamanlayicisi (indir/kaldir)
    this.cooldown = 0;
    this.heat = 0;            // ardisik atisla artan sacilma
    this.fired = false;
  }
  reset() {
    for (let i = 0; i < WEAPONS.length; i++) { this.has[i] = true; this.ammo[i] = WEAPONS[i].ammoStart; }
    this.current = 0; this.previous = 3; this.pending = -1; this.switchT = 0; this.cooldown = 0; this.heat = 0;
  }
  select(i) {
    if (i < 0 || i >= WEAPONS.length || !this.has[i]) return false;
    if (i === this.current && this.pending < 0) return false;
    if (i === this.pending) return false;
    this.pending = i;
    this.switchT = 0.16;
    return true;
  }
  cycle(dir) {
    let i = this.pending >= 0 ? this.pending : this.current;
    for (let k = 0; k < WEAPONS.length; k++) {
      i = (i + dir + WEAPONS.length) % WEAPONS.length;
      if (this.has[i] && this.ammo[i] > 0) return this.select(i);
    }
    return false;
  }
  bestAvailable() {
    const order = [3, 4, 2, 0, 1];
    for (const i of order) if (this.has[i] && this.ammo[i] > 0) return i;
    return 0;
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.heat = Math.max(0, this.heat - dt * 1.6);
    if (this.pending >= 0) {
      this.switchT -= dt;
      if (this.switchT <= 0) {
        if (this.pending !== this.current) this.previous = this.current;
        this.current = this.pending; this.pending = -1;
        this.switchT = 0; this.cooldown = Math.max(this.cooldown, 0.12);
        return true;
      }
    }
    return false;
  }
  get def() { return WEAPONS[this.current]; }
  canFire() { return this.pending < 0 && this.cooldown <= 0 && this.ammo[this.current] > 0; }
  consume() {
    const W = WEAPONS[this.current];
    this.ammo[this.current]--;
    this.cooldown += 1 / W.rate;
    if (this.cooldown < 0) this.cooldown = 1 / W.rate;
  }
}
