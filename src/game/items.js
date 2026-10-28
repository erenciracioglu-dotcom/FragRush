// Toplanabilir ogeler: can, mega can, zirh, cephane, KIYAMET (x3 hasar).
import * as THREE from 'three';
import { VS } from '../config.js';
import { t } from '../i18n.js';

export const ITEM_TYPES = {
  health: { respawn: 20, color: 0x3bff6a, label: '+25 CAN', value: 1 },
  mega: { respawn: 35, color: 0x3b9dff, label: 'MEGA CAN', value: 3 },
  armor: { respawn: 25, color: 0xffd23b, label: '+50 ZIRH', value: 2 },
  ammo: { respawn: 16, color: 0xff8a2a, label: 'CEPHANE', value: 1 },
  quad: { respawn: 75, initial: 30, color: 0xff3bf0, label: 'KIYAMET MODU', value: 5 },
};

const glow = (hex, k) => { const c = new THREE.Color(hex); return new THREE.MeshBasicMaterial({ color: new THREE.Color(c.r * k, c.g * k, c.b * k) }); };

function makeMesh(type) {
  const T = ITEM_TYPES[type];
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.7, roughness: 0.42 });
  if (type === 'health') {
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.13), glow(T.color, 3)));
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), glow(T.color, 3)));
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 })));
  } else if (type === 'mega') {
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), glow(T.color, 2.5)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.03, 8, 32), glow(0xffffff, 3));
    ring.rotation.x = Math.PI / 2; spin.add(ring);
  } else if (type === 'armor') {
    const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: T.color, metalness: 0.7, roughness: 0.4, emissive: new THREE.Color(T.color).multiplyScalar(0.6) }));
    sh.scale.set(1, 1.2, 0.45); spin.add(sh);
    const e = new THREE.Mesh(new THREE.OctahedronGeometry(0.33, 0), glow(T.color, 2)); e.scale.set(1, 1.2, 0.2); spin.add(e);
  } else if (type === 'ammo') {
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a3f2a, metalness: 0.5, roughness: 0.6 })));
    spin.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.31), glow(T.color, 4)));
    for (let i = -1; i <= 1; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8), metal); b.position.set(i * 0.12, 0.2, 0); spin.add(b); }
  } else if (type === 'quad') {
    spin.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), glow(T.color, 4)));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(T.color).multiplyScalar(1.2), wireframe: true }));
    spin.add(shell);
  }
  // zemin halkasi
  const base = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 32), glow(T.color, 2.2));
  base.rotation.x = -Math.PI / 2; base.position.y = -0.62;
  g.add(base);
  for (const c of spin.children) c.castShadow = true;
  g.userData.spin = spin;
  g.userData.base = base;
  return g;
}

export class Items {
  constructor(game, defs) {
    this.game = game;
    this.list = defs.map((d) => {
      const T = ITEM_TYPES[d.type];
      const mesh = makeMesh(d.type);
      game.scene.add(mesh);
      // cache: kardan adamin icinde sakli; kar kirilip yeri bosalana kadar gorunmez, alinamaz, botlar bilmez
      const it = { type: d.type, pos: new THREE.Vector3(d.x, d.y, d.z), home: new THREE.Vector3(d.x, d.y, d.z), active: !T.initial, timer: T.initial || 0, mesh, phase: Math.random() * 6, fallV: 0, noBots: !!d.noBots, cache: !!d.cache, hidden: false, checkT: 0 };
      it.hidden = it.cache && this.buried(it);
      mesh.position.set(d.x, d.y + 0.65, d.z);
      mesh.visible = it.active && !it.hidden;
      return it;
    });
  }

  // sakli esyanin yeri hala kar (kati voxel) mi
  buried(it) { return this.game.world.solidAtWorld(it.pos.x, it.pos.y + 0.3, it.pos.z); }

  dispose() {
    for (const it of this.list) {
      this.game.scene.remove(it.mesh);
      it.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.list = [];
  }

  reset() {
    for (const it of this.list) {
      const T = ITEM_TYPES[it.type]; it.active = !T.initial; it.timer = T.initial || 0;
      if (it.cache) { it.pos.copy(it.home); it.fallV = 0; it.hidden = this.buried(it); }
      it.mesh.visible = it.active && !it.hidden;
    }
  }

  update(dt) {
    const game = this.game, w = game.world, tm = game.time;
    for (const it of this.list) {
      if (it.hidden) {
        // kar kirildi mi (kare basina degil, 0.15 sn'de bir)
        it.checkT -= dt;
        if (it.checkT > 0) continue;
        it.checkT = 0.15;
        if (this.buried(it)) continue;
        it.hidden = false;
        it.mesh.visible = it.active;
        game.fx.padBurst(it.pos.x, it.pos.y, it.pos.z);
        if (game.audio) game.audio.play('reveal', it.pos.x, it.pos.y + 0.5, it.pos.z, 1);
        if (game.onCacheReveal) game.onCacheReveal(it);
        continue;
      }
      if (!it.active) {
        it.timer -= dt;
        if (it.timer <= 0) {
          it.active = true; it.mesh.visible = true;
          if (it.type === 'quad') { game.announce(t('quadSpawn'), t(game.arena.quadWhere || 'quadWhere')); if (game.audio) game.audio.play('quadSpawn', it.pos.x, it.pos.y, it.pos.z, 1, true); }
          game.fx.padBurst(it.pos.x, it.pos.y, it.pos.z);
        }
        continue;
      }
      // zemin yok olduysa dus
      const below = w.solidAtWorld(it.pos.x, it.pos.y - 0.05, it.pos.z);
      if (!below) {
        it.fallV += 22 * dt;
        it.pos.y -= it.fallV * dt;
        // lava dustu: yanar; suresi dolunca ilk yerinde yeniden belirir
        if (game.lavaSys && game.lavaSys.isLava(it.pos.x, it.pos.y, it.pos.z)) {
          game.lavaSys.splash(it.pos.x, it.pos.z, 0.6);
          it.active = false; it.mesh.visible = false; it.timer = ITEM_TYPES[it.type].respawn;
          it.pos.copy(it.home); it.fallV = 0;
          continue;
        }
        if (it.pos.y < 0.5) it.pos.y = 0.5;
        if (w.solidAtWorld(it.pos.x, it.pos.y - 0.05, it.pos.z)) { it.pos.y = (Math.floor((it.pos.y - 0.05) / VS) + 1) * VS; it.fallV = 0; }
      } else if (w.solidAtWorld(it.pos.x, it.pos.y + 0.1, it.pos.z)) {
        // moloz ustune geldiyse yukari cik
        it.pos.y += VS;
      }
      const sp = it.mesh.userData.spin;
      sp.rotation.y = tm * 1.6 + it.phase;
      sp.position.y = Math.sin(tm * 2.4 + it.phase) * 0.08;
      it.mesh.position.set(it.pos.x, it.pos.y + 0.65, it.pos.z);
      // toplama
      for (const a of game.actors) {
        if (!a.alive) continue;
        const p = a.mover.pos;
        if (Math.abs(p.x - it.pos.x) < 0.75 && Math.abs(p.z - it.pos.z) < 0.75 && p.y < it.pos.y + 1.2 && p.y + a.mover.h > it.pos.y) {
          if (a.give(it.type)) {
            it.active = false; it.mesh.visible = false;
            it.timer = ITEM_TYPES[it.type].respawn;
            game.onPickup(a, it);
            break;
          }
        }
      }
    }
  }

  nearest(pos, types, maxDist) {
    let best = null, bd = maxDist;
    for (const it of this.list) {
      if (!it.active || it.hidden || it.noBots || !types.includes(it.type)) continue;
      const d = Math.hypot(it.pos.x - pos.x, it.pos.y - pos.y, it.pos.z - pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // bot icin degerli hedef sec
  pickFor(bot) {
    const p = bot.mover.pos;
    let best = null, bs = 0;
    for (const it of this.list) {
      if (!it.active || it.hidden || it.noBots) continue;
      const d = Math.hypot(it.pos.x - p.x, (it.pos.y - p.y) * 2, it.pos.z - p.z);
      let v = ITEM_TYPES[it.type].value;
      if (it.type === 'health' && bot.health >= 100) v = 0;
      if (it.type === 'mega' && bot.health >= 180) v = 0.2;
      if (it.type === 'armor' && bot.armor >= 140) v = 0;
      if (it.type === 'health' && bot.health < 60) v = 3;
      if (it.type === 'ammo') { const low = bot.weapons.ammo.some((a, i) => a < bot.game.WEAPONS[i].ammoStart * 0.5); v = low ? 2 : 0.3; }
      const s = v * 30 / (d + 8) + Math.random() * 0.3;
      if (s > bs) { bs = s; best = it; }
    }
    return bs > 0.6 ? best : null;
  }
}
