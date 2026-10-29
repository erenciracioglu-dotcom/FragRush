// Oyuncak odasi domino zinciri (saf mantik, THREE yok: node testleri dogrudan kullanir).
// Dev dominolar (H x W x T = 2 x 1 x 0.3 m) devrilme yonundeki alt kenarlari cevresinde doner (ince levha
// fizigi: agirlik merkezi pivotun gerisindeyken geri ceker, onune gecince hizlanir). Ust kenari bir sonrakine
// degince onu tetikler (hiz aktarimi); sonra ondekine yaslanir ve onun acisini izler: zincir bitince kiremit gibi
// yatar. Sonuncu yere ya da onundeki kuleye (dunyadaki kati voxel) carpar.
// Dunya: world.mat (gercek voxeller: engel / zemin), world.extra (sanal hucreler: ayakta ve yatan dominolarin
// carpisma kutusu; gezinme agi ve isin izleme gorur, mesher gormez).
import { VS, GRAVITY } from '../config.js';

export const DOM = {
  H: 2.0, W: 1.0, T: 0.3,
  kick: 2.6,          // rad/s: vurulan dominonun ilk acisal hizi
  transfer: 0.8,      // carpismada ondekine aktarilan acisal hiz orani (dalga ~7 m/s)
  push: 1.2,          // rad/s^2: one yaslanan dominonun ondekine ek itisi
  crushW: 1.1,        // rad/s: bundan hizli devrilen domino altindakini yaralar
  riseTime: 0.55,     // s: yeniden dikilme
  margin: 0.06,       // m: sanal hucre kaplamasi payi
};

const HALF_PI = Math.PI / 2;
const FACE_B = [DOM.H * 0.98, DOM.H * 0.66, DOM.H * 0.33], FACE_A = [-DOM.W * 0.4, 0, DOM.W * 0.4];

export class DominoChain {
  // defs: [{x, y, z, fx, fz}] taban ortasi (m) ve zincir yonu (birim, yatay; i -> i+1)
  constructor(world, defs) {
    this.world = world;
    this.list = defs.map((d, i) => {
      const l = Math.hypot(d.fx, d.fz) || 1;
      const fx = d.fx / l, fz = d.fz / l;
      return {
        i, x: d.x, y: d.y, z: d.z, fx, fz, wx: -fz, wz: fx,
        st: 'stand', dir: 1, phi: 0, w: 0, lean: -1, by: null, byT: -100, hit: new Set(), cells: [],
        riseT: 0, rise0: 0, contact: false, landed: false,
      };
    });
    this.events = [];          // {type: 'start'|'clack'|'land'|'block', i, k?, x, y, z, w}
    this.onBlock = null;       // (d, x, y, z) => true: dusen dominonun ucu bir engele (kuleye) degdi; true donerse engel kalkti
    this.isBlock = null;       // (x, y, z) => true: voxel disi ek engel (ayakta kulenin kutusu: delinmis kule de durdurur)
  }

  // ---- geometri
  // pivot (devrilme yonundeki alt kenarin ortasi) ve ileri yon
  pivot(d, out) { out.x = d.x + d.fx * d.dir * DOM.T * 0.5; out.y = d.y; out.z = d.z + d.fz * d.dir * DOM.T * 0.5; return out; }
  // yerel (a: genislik, b: yukari, c: ileri; c in [-T, 0]) -> dunya
  point(d, a, b, c, out, phi = d.phi) {
    const s = Math.sin(phi), co = Math.cos(phi);
    const Fx = d.fx * d.dir, Fz = d.fz * d.dir;
    const px = d.x + Fx * DOM.T * 0.5, pz = d.z + Fz * DOM.T * 0.5;
    out.x = px + d.wx * a + Fx * (b * s + c * co);
    out.y = d.y + b * co - c * s;
    out.z = pz + d.wz * a + Fz * (b * s + c * co);
    return out;
  }
  // dunya -> yerel; pad: kutuyu genislet. Icindeyse true.
  inside(d, x, y, z, pad = 0, phi = d.phi, dir = d.dir) {
    const Fx = d.fx * dir, Fz = d.fz * dir;
    const vx = x - (d.x + Fx * DOM.T * 0.5), vy = y - d.y, vz = z - (d.z + Fz * DOM.T * 0.5);
    const s = Math.sin(phi), co = Math.cos(phi);
    const vf = vx * Fx + vz * Fz;
    const a = vx * d.wx + vz * d.wz;
    const b = vy * co + vf * s;
    const c = vf * co - vy * s;
    return Math.abs(a) <= DOM.W * 0.5 + pad && b >= -pad && b <= DOM.H + pad && c >= -DOM.T - pad && c <= pad;
  }
  center(d, out) { return this.point(d, 0, DOM.H * 0.5, -DOM.T * 0.5, out); }

  // ---- sanal hucreler
  rasterize(d) {
    const w = this.world;
    if (!w.extra) return;
    const e = DOM.margin;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const p = { x: 0, y: 0, z: 0 };
    for (const a of [-DOM.W / 2 - e, DOM.W / 2 + e]) for (const b of [-e, DOM.H + e]) for (const c of [-DOM.T - e, e]) {
      this.point(d, a, b, c, p);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    const X0 = Math.max(0, Math.floor(x0 / VS)), X1 = Math.min(w.sx - 1, Math.floor(x1 / VS));
    const Y0 = Math.max(0, Math.floor(y0 / VS)), Y1 = Math.min(w.sy - 1, Math.floor(y1 / VS));
    const Z0 = Math.max(0, Math.floor(z0 / VS)), Z1 = Math.min(w.sz - 1, Math.floor(z1 / VS));
    const cells = d.cells;
    for (let Y = Y0; Y <= Y1; Y++) for (let Z = Z0; Z <= Z1; Z++) for (let X = X0; X <= X1; X++) {
      if (!this.inside(d, (X + 0.5) * VS, (Y + 0.5) * VS, (Z + 0.5) * VS, e)) continue;
      const i = X + w.sx * (Z + w.sz * Y);
      if (w.mat[i]) continue;          // gercek voxelin icine (zemin) yazma
      if (w.extra[i] < 255) w.extra[i]++;
      cells.push(i);
    }
    if (cells.length) w._notify(X0, Y0, Z0, X1, Y1, Z1);
  }
  clear(d) {
    const w = this.world;
    if (!w.extra || !d.cells.length) { d.cells.length = 0; return; }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1, y1 = -1, z1 = -1;
    for (const i of d.cells) {
      if (w.extra[i] > 0) w.extra[i]--;
      const y = (i / w.sxz) | 0, r = i - y * w.sxz, z = (r / w.sx) | 0, x = r - z * w.sx;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    d.cells.length = 0;
    w._notify(x0, y0, z0, x1, y1, z1);
  }

  // ---- sorgular
  // noktayi iceren (pay kadar genisletilmis) ayakta / yatan domino (en yakini) ya da -1
  findAt(x, y, z, pad = 0.18) {
    let best = -1, bd = 1e9;
    const c = { x: 0, y: 0, z: 0 };
    for (const d of this.list) {
      if (d.st === 'rise') continue;
      if (!this.inside(d, x, y, z, pad)) continue;
      this.center(d, c);
      const dd = (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2;
      if (dd < bd) { bd = dd; best = d.i; }
    }
    return best;
  }
  get standing() { let n = 0; for (const d of this.list) if (d.st === 'stand') n++; return n; }
  get moving() { for (const d of this.list) if (d.st === 'fall' || d.st === 'lean' || d.st === 'rise') return true; return false; }

  // ---- olaylar
  // dir: +1 zincir yonu, -1 ters. Devrilmeye yeni basladiysa true.
  knock(i, dir, w0, by, now) {
    const d = this.list[i];
    if (!d) return false;
    if (d.st === 'fall' && d.dir === dir) { d.w = Math.max(d.w, w0); return false; }
    if (d.st !== 'stand') return false;
    this.clear(d);
    d.st = 'fall'; d.dir = dir >= 0 ? 1 : -1; d.phi = 0; d.w = w0; d.lean = -1; d.contact = false; d.landed = false;
    d.by = by; d.byT = now; d.hit.clear();
    const c = this.center(d, { x: 0, y: 0, z: 0 });
    this.events.push({ type: 'start', i, x: c.x, y: c.y, z: c.z, w: w0 });
    return true;
  }

  // i dominosu k dominosuna (ayni yone devrilen / yatan) yaslaninca alabilecegi en buyuk aci
  _leanLimit(d, k) {
    const Fx = d.fx * d.dir, Fz = d.fz * d.dir;
    const pdx = (k.x + k.fx * k.dir * DOM.T * 0.5) - (d.x + Fx * DOM.T * 0.5);
    const pdz = (k.z + k.fz * k.dir * DOM.T * 0.5) - (d.z + Fz * DOM.T * 0.5);
    const dd = pdx * Fx + pdz * Fz;               // pivotlar arasi, d'nin ileri yonunde
    const dy = k.y - d.y;
    const H = DOM.H, T = DOM.T, ps = Math.sin(k.phi), pc = Math.cos(k.phi);
    // k'nin arka yuzu: B = (dd - T cos psi, dy + T sin psi) + u (sin psi, cos psi); d'nin ust on kosesi C = (H sin phi, H cos phi)
    const dist = (phi) => (H * Math.sin(phi) - dd + T * pc) * (-pc) + (H * Math.cos(phi) - dy - T * ps) * ps;
    if (dist(0) <= 0) return 0;
    if (dist(HALF_PI) > 0) return HALF_PI;
    let lo = 0, hi = HALF_PI;
    for (let it = 0; it < 22; it++) { const m = (lo + hi) * 0.5; if (dist(m) > 0) lo = m; else hi = m; }
    return lo;
  }

  // dusen dominonun on yuzu gercek bir voxele (zemin, engel, kule) degiyor mu: degen nokta ya da null
  _blocked(d, phi) {
    const w = this.world, p = { x: 0, y: 0, z: 0 }, ob = this.isBlock;
    for (const b of FACE_B) for (const a of FACE_A) {
      this.point(d, a, b, 0.02, p, phi);
      const X = Math.floor(p.x / VS), Y = Math.floor(p.y / VS), Z = Math.floor(p.z / VS);
      if (Y < 0 || (w.inBounds(X, Y, Z) && w.mat[X + w.sx * (Z + w.sz * Y)]) || (ob && ob(p.x, p.y, p.z))) return p;
    }
    return null;
  }

  update(dt, now) {
    const L = this.list, n = L.length, K = 3 * GRAVITY / (2 * (DOM.H * DOM.H + DOM.T * DOM.T));
    const tmp = { x: 0, y: 0, z: 0 };
    for (const d of L) {
      if (d.st === 'rise') {
        d.riseT += dt;
        const u = Math.min(1, d.riseT / DOM.riseTime);
        const e = u * u * (3 - 2 * u);
        d.phi = d.rise0 * (1 - e);
        if (u >= 1) { d.phi = 0; d.st = 'stand'; d.dir = 1; d.w = 0; this.rasterize(d); }
        continue;
      }
      if (d.st !== 'fall') continue;
      // serbest donus (alt kenar cevresinde)
      const phi0 = d.phi;
      d.w += K * (DOM.H * Math.sin(d.phi) - DOM.T * Math.cos(d.phi)) * dt;
      d.phi += d.w * dt;
      if (d.phi < 0) { d.phi = 0; d.w = 0; d.st = 'stand'; d.dir = 1; this.rasterize(d); continue; }   // yeterince itilmedi: geri oturdu
      const k = L[d.i + d.dir];
      if (k && k.st === 'stand') {
        // ondekine degdi mi: ust kenarin ileri uzanimi >= aradaki bosluk
        const Fx = d.fx * d.dir, Fz = d.fz * d.dir;
        const gap = (k.x - (d.x + Fx * DOM.T * 0.5)) * Fx + (k.z - (d.z + Fz * DOM.T * 0.5)) * Fz - DOM.T * 0.5;
        const lat = Math.abs((k.x - d.x) * d.wx + (k.z - d.z) * d.wz);
        if (lat < DOM.W && DOM.H * Math.sin(d.phi) >= gap) {
          this.knock(k.i, d.dir, d.w * DOM.transfer, d.by, now);
          k.byT = d.byT;
          this.point(d, 0, DOM.H, 0, tmp);
          this.events.push({ type: 'clack', i: d.i, k: k.i, x: tmp.x, y: tmp.y, z: tmp.z, w: d.w });
          d.contact = true;
        }
      }
      if (k && (k.st === 'fall' || k.st === 'lean' || k.st === 'rest') && k.dir === d.dir) {
        const lim = this._leanLimit(d, k);
        if (d.phi >= lim) {
          d.phi = Math.max(phi0, lim); d.st = 'lean'; d.lean = k.i;
          d.w = 0;
          continue;
        }
      } else if (k && k.st !== 'stand') {
        // ters yone devrilen / kalkan komsu: engel, dur
        d.st = 'rest'; d.w = 0; this.rasterize(d); continue;
      }
      // on yuz gercek bir voxele degdi: kule (engeli kaldirabilir) ya da zemin / esya: dur
      const hit = this._blocked(d, d.phi);
      if (hit) {
        if (this.onBlock && this.onBlock(d, hit.x, hit.y, hit.z)) continue;
        d.phi = phi0; d.st = 'rest'; d.w = 0;
        this.events.push({ type: 'land', i: d.i, x: hit.x, y: hit.y, z: hit.z, w: 1 });
        this.rasterize(d);
        continue;
      }
      if (d.phi >= HALF_PI) {
        d.phi = HALF_PI; d.st = 'rest'; d.w = 0;
        this.point(d, 0, DOM.H * 0.7, 0, tmp);
        this.events.push({ type: 'land', i: d.i, x: tmp.x, y: tmp.y, z: tmp.z, w: 1 });
        this.rasterize(d);
      }
    }
    // yaslananlar: ondekinin acisini izle, ondekini it; ondeki durunca dur
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < n; j++) {
        const d = L[pass ? n - 1 - j : j];
        if (d.st !== 'lean') continue;
        const k = L[d.lean];
        if (!k || k.dir !== d.dir || k.st === 'stand' || k.st === 'rise') { d.st = 'fall'; d.lean = -1; continue; }
        d.phi = Math.max(d.phi, this._leanLimit(d, k));
        if (k.st === 'fall') k.w += DOM.push * dt;
        else if (k.st === 'rest') { d.st = 'rest'; this.rasterize(d); }
      }
    }
  }

  // yeniden dikilme (zincir bittikten sonra); blocked(d): dikilecegi yerde biri varsa true (bekler)
  startRise(i) {
    const d = this.list[i];
    if (!d || d.st === 'stand' || d.st === 'rise' || d.st === 'fall') return false;
    this.clear(d);
    d.st = 'rise'; d.rise0 = d.phi; d.riseT = 0; d.lean = -1; d.by = null; d.hit.clear();
    return true;
  }

  // tum zincir ilk durumda (testler, harita kurulumu)
  standAll() {
    for (const d of this.list) { this.clear(d); d.st = 'stand'; d.dir = 1; d.phi = 0; d.w = 0; d.lean = -1; d.by = null; d.hit.clear(); this.rasterize(d); }
  }
  clearAll() { for (const d of this.list) this.clear(d); }
}
