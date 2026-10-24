// Dinamik nokta isik havuzu. Isik sayisi sabit kalir -> shader yeniden derlenmez (takilma yok).
import * as THREE from 'three';

export class LightPool {
  constructor(scene, n) {
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.slots.push({ light: l, t: 0, ttl: 0, i0: 0, follow: null, prio: 0, active: false });
    }
  }

  // kisa parlama
  flash(x, y, z, color, intensity, distance, ttl, prio = 1) {
    const s = this._pick(prio);
    if (!s) return null;
    s.light.position.set(x, y, z);
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.intensity = intensity;
    s.i0 = intensity; s.t = 0; s.ttl = ttl; s.follow = null; s.prio = prio; s.active = true;
    return s;
  }

  // nesneyi izleyen isik (roket, plazma). release() ile birak.
  attach(obj, color, intensity, distance, prio = 2) {
    const s = this._pick(prio);
    if (!s) return null;
    s.light.color.setHex(color);
    s.light.distance = distance;
    s.light.intensity = intensity;
    s.i0 = intensity; s.t = 0; s.ttl = 1e9; s.follow = obj; s.prio = prio; s.active = true;
    s.light.position.copy(obj.position || obj);
    return s;
  }

  release(s) { if (s) { s.follow = null; s.active = false; s.light.intensity = 0; } }

  _pick(prio) {
    let best = null, bestScore = 1e9;
    for (const s of this.slots) {
      if (!s.active) return s;
      // dusuk oncelikli ve bitmeye yakin olani sec
      const score = s.prio * 10 + (s.ttl > 1e8 ? 50 : (1 - s.t / s.ttl));
      if (score < bestScore && s.prio <= prio) { bestScore = score; best = s; }
    }
    return best;
  }

  update(dt) {
    for (const s of this.slots) {
      if (!s.active) continue;
      if (s.follow) {
        const p = s.follow.position || s.follow;
        s.light.position.copy(p);
        continue;
      }
      s.t += dt;
      if (s.t >= s.ttl) { s.active = false; s.light.intensity = 0; continue; }
      const k = 1 - s.t / s.ttl;
      s.light.intensity = s.i0 * k * k;
    }
  }

  clear() { for (const s of this.slots) { s.active = false; s.follow = null; s.light.intensity = 0; } }
}
