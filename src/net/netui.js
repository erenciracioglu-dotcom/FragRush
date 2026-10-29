// Ag arayuzu yardimcilari: uzak insanlarin basinda ad etiketi, veri hizi olcer (F3 satiri).
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };

export class NameTags {
  constructor() { this.el = document.getElementById('tags'); this.map = new Map(); }

  // actors: etiketi olacak (canli, insan) aktorler; kamera onu goruyorsa ve aradan duvar yoksa ad gosterilir
  update(camera, world, actors) {
    if (!this.el) return;
    const w = window.innerWidth, h = window.innerHeight, cp = camera.position;
    const seen = new Set();
    for (const a of actors) {
      const p = a.mover.pos, hh = a.mover.h;
      _v.set(p.x, p.y + hh + 0.45, p.z);
      const d = _v.distanceTo(cp);
      if (d > 70) continue;
      if (!world.lineOfSight(cp.x, cp.y, cp.z, p.x, p.y + hh * 0.7, p.z, _hit)) continue;
      _v.project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) continue;
      let e = this.map.get(a);
      if (!e) {
        const div = document.createElement('div'); div.className = 'tag'; div.textContent = a.name;
        div.style.color = '#' + a.color.toString(16).padStart(6, '0');
        this.el.appendChild(div); e = { div, name: a.name }; this.map.set(a, e);
      }
      if (e.name !== a.name) { e.name = a.name; e.div.textContent = a.name; }
      e.div.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
      e.div.style.opacity = String(Math.max(0.35, 1 - d / 80));
      seen.add(a);
    }
    for (const [a, e] of this.map) if (!seen.has(a)) { e.div.remove(); this.map.delete(a); }
  }

  clear() { for (const e of this.map.values()) e.div.remove(); this.map.clear(); }
}

// saniyede bir gelen / giden KB/s ve ortalama / tepe degerleri
export class RateMeter {
  constructor() { this.t = 0; this.pi = 0; this.po = 0; this.inKB = 0; this.outKB = 0; this.n = 0; this.sumIn = 0; this.sumOut = 0; this.peakIn = 0; this.peakOut = 0; this.connT = 0; }
  tick(dt, links) {
    this.t += dt; this.connT += dt;
    if (this.connT > 5) { this.connT = 0; for (const l of links) if (l.open) l.refreshConnType(); }
    if (this.t < 1) return;
    let bi = 0, bo = 0;
    for (const l of links) { bi += l.bytesIn; bo += l.bytesOut; }
    this.inKB = Math.max(0, bi - this.pi) / 1024 / this.t; this.outKB = Math.max(0, bo - this.po) / 1024 / this.t;
    this.pi = bi; this.po = bo; this.t = 0;
    this.n++; this.sumIn += this.inKB; this.sumOut += this.outKB;
    this.peakIn = Math.max(this.peakIn, this.inKB); this.peakOut = Math.max(this.peakOut, this.outKB);
  }
  avgIn() { return this.n ? this.sumIn / this.n : 0; }
  avgOut() { return this.n ? this.sumOut / this.n : 0; }
}
