// Konuk tarafi tahmin + uzlastirma. Konuk kendi oyuncusunu yerelde simule eder (gecikme hissedilmesin); ev sahibi
// ayni komutlari ayni dt ile kosturup yetkili durumu ve islenen son komut sira numarasini geri gonderir.
// Konuk o duruma doner, onaylanmamis komutlari yeniden oynatir, aradaki gorsel farki kisa surede eritir.
import { Mover } from '../game/mover.js';

export class Predictor {
  // post(mover, live): her simulate'ten sonra (ped gibi komut disi etkiler); live=false yeniden oynatmada (efektsiz)
  constructor(mover, post = null) {
    this.mover = mover; this.post = post;
    this.seq = 0;
    this.pending = [];            // {seq, dt, cmd}
    this.offset = { x: 0, y: 0, z: 0 };   // gorsel fark: kamera = konum + offset, zamanla 0'a gider
    this.stats = { n: 0, corrections: 0, small: 0, big: 0, snaps: 0, maxErr: 0, sumErr: 0 };
    this._st = new Float64Array(Mover.STATE_LEN);
    this.smoothTime = 0.1;        // s
    this.snapDist = 3;            // m: bundan buyuk farkta (isinlanma, dogma) yumusatma yok
  }

  // yerel kare: komutu sirala, simule et. Donus: gonderilecek komut {seq, dt, ...cmd}
  step(dt, cmd) {
    const c = { fwd: cmd.fwd, side: cmd.side, yaw: cmd.yaw, pitch: cmd.pitch || 0, jump: !!cmd.jump, crouch: !!cmd.crouch, dash: !!cmd.dash };
    const seq = ++this.seq;
    this.pending.push({ seq, dt, cmd: c });
    if (this.pending.length > 240) this.pending.shift();
    this.mover.simulate(dt, c);
    if (this.post) this.post(this.mover, true);
    return { seq, dt, ...c };
  }

  // ev sahibinden yetkili durum: state (Mover.getState) ve ack (ev sahibinin islediği son seq)
  reconcile(state, ack) {
    this.lastAck = ack;
    const m = this.mover, p = m.pos;
    const px = p.x, py = p.y, pz = p.z;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    m.setState(state);
    for (const e of this.pending) { m.simulate(e.dt, e.cmd); if (this.post) this.post(m, false); }
    const dx = px - p.x, dy = py - p.y, dz = pz - p.z;
    const err = Math.hypot(dx, dy, dz);
    const s = this.stats;
    s.n++; s.sumErr += err;
    if (err > s.maxErr) s.maxErr = err;
    if (err > 0.01) {
      s.corrections++;
      if (err > 0.25) s.big++; else s.small++;
      if (err > this.snapDist) { this.offset.x = this.offset.y = this.offset.z = 0; s.snaps++; }
      else { this.offset.x += dx; this.offset.y += dy; this.offset.z += dz; }
    }
    return err;
  }

  // gorsel farki erit (her karede)
  decay(dt) {
    const k = Math.exp(-dt / (this.smoothTime / 3));
    this.offset.x *= k; this.offset.y *= k; this.offset.z *= k;
    if (Math.abs(this.offset.x) + Math.abs(this.offset.y) + Math.abs(this.offset.z) < 1e-4) this.offset.x = this.offset.y = this.offset.z = 0;
  }

  reset() { this.pending.length = 0; this.offset.x = this.offset.y = this.offset.z = 0; }
}
