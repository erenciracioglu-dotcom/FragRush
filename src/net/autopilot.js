// Otomatik pilot (yalniz testler: ?autopilot). Yerel oyuncunun girdisini uretir: dolasir, duvara carpinca doner,
// gordugu en yakin aktore nisan alip ates eder. Konukta ag yolundan gonderilen girdiler boylece gercek oyuncu gibi akar.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };

export class Autopilot {
  constructor(game) {
    this.game = game; this.yaw = 0; this.pitch = 0; this.turn = 0; this.turnT = 0; this.strafe = 1; this.strafeT = 0;
    this.dashT = 2; this.wT = 3; this.stuck = 0; this.last = null; this.init = false;
  }

  step(dt, p) {
    const g = this.game, m = p.mover, pos = m.pos;
    if (!this.init) { this.yaw = p.yaw; this.init = true; }
    const ex = pos.x, ey = pos.y + 1.6, ez = pos.z;
    // hedef: gorus hatti acik en yakin canli aktor
    let best = null, bd = 45;
    for (const a of g.actors) {
      if (a === p || !a.alive) continue;
      const q = a.mover.pos, d = Math.hypot(q.x - ex, q.y - pos.y, q.z - ez);
      if (d < bd && g.world.lineOfSight(ex, ey, ez, q.x, q.y + 1.1, q.z, _hit)) { best = a; bd = d; }
    }
    let fwd = 1, side = 0, fire = false;
    if (best) {
      const q = best.mover.pos, dx = q.x - ex, dy = q.y + 1.1 - ey, dz = q.z - ez;
      const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
      this.yaw += clamp(angDiff(ty, this.yaw), -9 * dt, 9 * dt);
      this.pitch += clamp(tp - this.pitch, -6 * dt, 6 * dt);
      const err = Math.abs(angDiff(ty, this.yaw)) + Math.abs(tp - this.pitch);
      fire = err < 0.12;
      this.strafeT -= dt; if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.6 + Math.random(); }
      side = this.strafe; fwd = bd > 9 ? 1 : bd < 4 ? -1 : 0;
    } else {
      this.turnT -= dt; if (this.turnT <= 0) { this.turnT = 1 + Math.random() * 2.5; this.turn = (Math.random() - 0.5) * 2.2; }
      this.yaw += this.turn * dt; this.pitch += (0 - this.pitch) * Math.min(1, dt * 3);
      // oniunde duvar varsa don
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      if (g.world.raycast(ex, pos.y + 0.6, ez, fx, 0, fz, 2.2, _hit)) { this.turn = (Math.random() < 0.5 ? -1 : 1) * 2.6; this.turnT = 0.5; }
    }
    // takilma: yerinde kaliyorsa ziplayip yon degistir
    const moved = this.last ? Math.hypot(pos.x - this.last.x, pos.z - this.last.z) : 1;
    this.last = { x: pos.x, z: pos.z };
    this.stuck = moved < 0.4 * dt ? this.stuck + dt : 0;
    const jump = this.stuck > 0.5 || Math.random() < dt * 0.4;
    if (this.stuck > 0.8) { this.yaw += 1.8; this.stuck = 0; }
    this.dashT -= dt; const dash = this.dashT <= 0; if (dash) this.dashT = 3 + Math.random() * 3;
    // silah: aralikla degistir
    this.wT -= dt;
    if (this.wT <= 0) { this.wT = 3 + Math.random() * 3; const ws = p.weapons; const i = (Math.random() * 5) | 0; if (ws.has[i] && ws.ammo[i] > 0) ws.select(i); }
    return { yaw: this.yaw, pitch: this.pitch, fwd, side, jump, dash, fire };
  }
}
