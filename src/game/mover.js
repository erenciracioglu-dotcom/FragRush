// Quake tarzi hareket + voxel carpismasi (oyuncu ve botlar ortak kullanir).
import * as THREE from 'three';
import { VS, MOVE, GRAVITY, WATER, ICE } from '../config.js';
import { SLIPPERY } from '../world/materials.js';

const EPS = 1e-4;
const STEPS = [VS, VS * 2, MOVE.stepHeight];
const CORNERS = [[1, 1], [-1, 1], [1, -1], [-1, -1]];

export class Mover {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.r = MOVE.radius;
    this.h = MOVE.height;
    this.crouching = false;
    this.onGround = false;
    this.groundTime = 1;
    this.stepSmooth = 0;
    this.landSpeed = 0;
    this.dashCd = 0;
    this.slideTime = 0;
    this.padLock = 0;
    this.speedMul = 1;
    this.events = { jumped: false, landed: false, dashed: false, slid: false, stepUp: 0, splash: 0, waterJump: false };
    this._wasCrouchCmd = false;
    // su durumu (dunyanin su seviyesine gore): ayak derinligi, yuzme, gozler su altinda
    this.waterDepth = 0;
    this.inWater = false;
    this.swimming = false;
    this.eyesUnder = false;
    this.waterJumpT = 0;
    // ayagin altindaki malzeme (havadayken 0): buzda kayma, kar / buz ayak sesi
    this.groundMat = 0;
  }

  reset(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.crouching = false; this.h = MOVE.height;
    this.onGround = false; this.groundTime = 1; this.stepSmooth = 0;
    this.dashCd = 0; this.slideTime = 0; this.padLock = 0;
    this.waterJumpT = 0;
    this._water();
  }

  // su durumunu konuma gore guncelle (su seviyesinin altindaki her bos voxel sudur)
  _water() {
    const wy = this.world.waterY ?? -Infinity;
    const p = this.pos;
    const d = wy - p.y;
    this.waterDepth = d;
    this.inWater = d > 0.02;
    this.swimming = d > WATER.swimDepth && this.waterJumpT <= 0;
    this.eyesUnder = wy > p.y + this.eyeHeight;
    return wy;
  }

  collides(x, y, z, h = this.h) {
    const r = this.r;
    return this.world.boxSolid(x - r, y, z - r, x + r, y + h, z + r);
  }

  // ayagin altindaki voxelin malzemesi: once govde ortasi, bossa (kenarda duruyorsa) koseler
  _groundMat() {
    const w = this.world, p = this.pos, inv = 1 / VS;
    const y = Math.floor((p.y - 0.05) * inv);
    let m = w.get(Math.floor(p.x * inv), y, Math.floor(p.z * inv));
    if (m) return m;
    const r = this.r * 0.9;
    for (const [dx, dz] of CORNERS) {
      m = w.get(Math.floor((p.x + dx * r) * inv), y, Math.floor((p.z + dz * r) * inv));
      if (m) return m;
    }
    return 0;
  }

  get eyeHeight() { return this.crouching ? MOVE.crouchEye : MOVE.eye; }

  // cmd: {fwd, side, yaw, pitch?, jump, crouch, dash}
  simulate(dt, cmd) {
    const ev = this.events;
    ev.jumped = ev.landed = ev.dashed = ev.slid = false; ev.stepUp = 0;
    ev.splash = 0; ev.waterJump = false;
    const vel = this.vel, p = this.pos;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.padLock = Math.max(0, this.padLock - dt);
    this.slideTime = Math.max(0, this.slideTime - dt);
    this.waterJumpT = Math.max(0, this.waterJumpT - dt);

    // gomulme kurtarma (moloz ustune dustuyse)
    if (this.collides(p.x, p.y, p.z)) {
      for (let k = 1; k <= 12; k++) { if (!this.collides(p.x, p.y + k * VS, p.z)) { p.y += k * VS; break; } }
    }

    // derin su: yuzme (ayri fizik)
    const wasIn = this.inWater, vy0 = vel.y;
    const wy = this._water();
    if (this.swimming) {
      this._swim(dt, cmd, wy);
      this._water();
      if (!wasIn && this.inWater && vy0 < -2.5) ev.splash = -vy0;
      return;
    }
    // siglik: batan orana gore yavaslama
    const sub = this.inWater ? Math.min(1, this.waterDepth / MOVE.height) : 0;
    const wade = this.inWater ? Math.max(WATER.wadeMin, 1 - sub * WATER.wadeSlow) : 1;
    if (this.inWater) { const k = Math.exp(-dt * sub * 3); vel.x *= k; vel.z *= k; }

    // egilme / kayma
    const crouchEdge = cmd.crouch && !this._wasCrouchCmd;
    this._wasCrouchCmd = cmd.crouch;
    if (cmd.crouch) {
      if (!this.crouching) { this.crouching = true; this.h = MOVE.crouchHeight; if (!this.onGround) p.y += MOVE.height - MOVE.crouchHeight - 0.05; }
      const sp = Math.hypot(vel.x, vel.z);
      if (crouchEdge && this.onGround && sp > MOVE.runSpeed * 0.8 && this.waterDepth < 0.15) {
        const boost = Math.min(17, sp * 1.18) / sp;
        vel.x *= boost; vel.z *= boost;
        this.slideTime = 0.85; ev.slid = true;
      }
    } else {
      this.slideTime = 0;
      if (this.crouching) {
        if (this.onGround) {
          if (!this.collides(p.x, p.y, p.z, MOVE.height)) { this.crouching = false; this.h = MOVE.height; this.stepSmooth -= MOVE.eye - MOVE.crouchEye; }
        } else {
          // havada: ayaklari asagi uzat
          const dy = MOVE.height - MOVE.crouchHeight;
          if (!this.collides(p.x, p.y - dy, p.z, MOVE.height)) { p.y -= dy; this.crouching = false; this.h = MOVE.height; }
          else if (!this.collides(p.x, p.y, p.z, MOVE.height)) { this.crouching = false; this.h = MOVE.height; }
        }
      }
    }

    // istenen yon
    const sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);
    let wx = -sy * cmd.fwd + cy * cmd.side;
    let wz = -cy * cmd.fwd - sy * cmd.side;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-6) { wx /= wl; wz /= wl; }
    const baseSpeed = this.crouching && this.slideTime <= 0 ? MOVE.crouchSpeed : MOVE.runSpeed;
    const wishSpeed = wl > 1e-6 ? baseSpeed * this.speedMul * wade : 0;

    // ziplama (basili tutunca otomatik tavsan ziplamasi)
    if (cmd.jump && (this.onGround || this.groundTime < 0.09) && vel.y <= 0.5 && this.padLock <= 0) {
      vel.y = MOVE.jumpVel * (1 - 0.35 * sub);
      this.onGround = false; this.groundTime = 1;
      ev.jumped = true;
      if (this.crouching && this.slideTime > 0) this.slideTime = 0;
    }

    // surtunme (gol buzunda cok az: kosan kayarak durur, donusler genis)
    this.groundMat = this.onGround ? this._groundMat() : 0;
    if (this.onGround && !ev.jumped) {
      const slip = SLIPPERY[this.groundMat] === 1;
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 1e-4) {
        const fr = this.slideTime > 0 ? (slip ? ICE.slideFriction : 0.9) : (slip ? ICE.friction : MOVE.friction);
        const control = Math.max(sp, MOVE.stopSpeed);
        const ns = Math.max(0, sp - control * fr * dt) / sp;
        vel.x *= ns; vel.z *= ns;
      }
      this._accel(wx, wz, wishSpeed, this.slideTime > 0 ? 1.5 : slip ? ICE.accel : MOVE.groundAccel, dt);
    } else {
      this._accel(wx, wz, wishSpeed, MOVE.airAccel, dt);
      this._airControl(wx, wz, wishSpeed, dt, cmd);
    }

    // atilma (suda daha kisa)
    if (cmd.dash && this.dashCd <= 0) {
      let dx = wx, dz = wz;
      if (wl < 1e-6) { dx = -sy; dz = -cy; }
      const sp = Math.max(MOVE.dashSpeed * wade, Math.hypot(vel.x, vel.z) * 1.05);
      vel.x = dx * sp; vel.z = dz * sp;
      vel.y = this.onGround ? Math.max(vel.y, MOVE.dashUp * wade) : Math.max(vel.y, 1.2);
      this.dashCd = MOVE.dashCooldown;
      ev.dashed = true;
    }

    // yercekimi
    vel.y = Math.max(-MOVE.maxFallSpeed, vel.y - GRAVITY * dt);
    // yumusak tavan (ay ussu: dusuk yercekiminde roket ziplamasi dunyanin 24 m'lik kutusunun cok ustune atar):
    // world.ceilY'nin ustunde yercekimi 4 m icinde 5 katina cikar, 5 m ustunde yukselis biter
    const ceil = this.world.ceilY;
    if (p.y > ceil) {
      vel.y -= GRAVITY * 4 * Math.min(1, (p.y - ceil) / 4) * dt;
      if (p.y > ceil + 5 && vel.y > 0) vel.y = 0;
    }

    // carpismali hareket (alt adimlar)
    const wasGround = this.onGround || this.groundTime < 0.2;
    const prevGround = this.onGround;
    this.onGround = false;
    const dist = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const n = Math.min(16, Math.max(1, Math.ceil(dist / (VS * 0.45))));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      const canStep = wasGround || this.onGround;
      this._moveX(vel.x * sdt, canStep);
      this._moveZ(vel.z * sdt, canStep);
      this._moveY(vel.y * sdt, prevGround);
    }

    // merdiven inerken yere yapis
    if (!this.onGround && prevGround && vel.y <= 0 && !ev.jumped && !ev.dashed) {
      for (let d = VS * 0.5; d <= MOVE.stepHeight + 1e-3; d += VS * 0.5) {
        if (this.collides(p.x, p.y - d, p.z)) {
          const top = (Math.floor((p.y - d) / VS) + 1) * VS + EPS;
          if (top <= p.y + 1e-3) { this.stepSmooth += p.y - top; p.y = top; this.onGround = true; vel.y = 0; }
          break;
        }
      }
    }

    if (this.onGround) this.groundTime = 0; else this.groundTime += dt;
    // kamera basamak yumusatmasi
    this.stepSmooth *= Math.exp(-dt * 16);
    if (Math.abs(this.stepSmooth) < 1e-4) this.stepSmooth = 0;
    this._water();
    if (!wasIn && this.inWater && vy0 < -2.5) ev.splash = -vy0;
  }

  // Quake tarzi yuzme: bakilan yone yuzulur, Bosluk yukari (yuzeyde basi suyun ustunde tutar),
  // C asagi; hic tus yoksa yavasca batilir. Kaldirma batan oranla artar, su direnci hizi keser.
  _swim(dt, cmd, wy) {
    const vel = this.vel, p = this.pos;
    this._wasCrouchCmd = cmd.crouch;
    this.slideTime = 0;
    if (this.crouching && !this.collides(p.x, p.y, p.z, MOVE.height)) { this.crouching = false; this.h = MOVE.height; }
    const sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);
    const pitch = cmd.pitch || 0, cp = Math.cos(pitch), spt = Math.sin(pitch);
    let wx = -sy * cp * cmd.fwd + cy * cmd.side;
    let wz = -cy * cp * cmd.fwd - sy * cmd.side;
    let wv = spt * cmd.fwd;
    const wl = Math.hypot(wx, wv, wz);
    if (wl > 1) { wx /= wl; wv /= wl; wz /= wl; }
    const S = WATER.swimSpeed * this.speedMul;
    const frac = Math.max(0, Math.min(1, (wy - p.y) / this.h));
    const k = 1 - Math.exp(-dt * WATER.swimAccel);
    vel.x += (wx * S - vel.x) * k;
    vel.z += (wz * S - vel.z) * k;
    let ay = -GRAVITY + GRAVITY * WATER.buoyancy * frac;
    let kick = (wv * S - vel.y) * WATER.dragY;
    if (kick > 0) { const t = Math.max(0, Math.min(1, (frac - 0.62) / 0.33)); kick *= t * t * (3 - 2 * t); }
    ay += kick;
    if (cmd.jump) ay += GRAVITY * WATER.thrustUp;
    if (cmd.crouch) ay -= GRAVITY * WATER.thrustDown;
    vel.y += ay * dt;
    const sp = Math.hypot(vel.x, vel.y, vel.z);
    if (sp > 1e-3) { const q = 1 / (1 + WATER.dragQ * sp * dt); vel.x *= q; vel.y *= q; vel.z *= q; }
    // kiyiya dogru yuzerken yuzeye yakinsa sudan cik (gidilmek istenen yatay yon: botlar kiyiya yuzerken
    // dusmana bakabilir, oyuncu yan yan da yuzebilir)
    const hl = Math.hypot(wx, wz);
    if (hl > 0.3) this._waterJump(wy, wx / hl, wz / hl);

    const prevGround = this.onGround;
    this.onGround = false;
    const dist = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const n = Math.min(16, Math.max(1, Math.ceil(dist / (VS * 0.45))));
    const sdt = dt / n;
    // yuzerken sig dibe ve basamaklara cikilabilir (yoksa kiyi sigliginda govde dibe takilir)
    for (let i = 0; i < n; i++) {
      this._moveX(vel.x * sdt, true);
      this._moveZ(vel.z * sdt, true);
      this._moveY(vel.y * sdt, true);
    }
    if (this.onGround) this.groundTime = 0; else this.groundTime += dt;
    this.stepSmooth *= Math.exp(-dt * 16);
    if (Math.abs(this.stepSmooth) < 1e-4) this.stepSmooth = 0;
  }

  // Quake'in "water jump"u: yuzeye yakin yuzerken onumuzde kiyi varsa ve ustu bossa ustune firla
  _waterJump(wy, fx, fz) {
    const p = this.pos, w = this.world;
    if (this.waterJumpT > 0 || p.y + this.eyeHeight < wy - 0.7) return false;
    const reach = this.r + 0.35;
    const ax = p.x + fx * reach, az = p.z + fz * reach;
    // onde kiyi: bel hizasinda, su yuzeyinin hemen altinda ya da ustunde (yeniden donan buzun once ust
    // kati donar: kenar suyun ustunde ince bir raf olabilir)
    if (!w.solidAtWorld(ax, p.y + 0.9, az) && !w.solidAtWorld(ax, wy - 0.1, az) && !w.solidAtWorld(ax, wy + 0.1, az)) return false;
    // inilecek yer: govdenin bir boy ilerisindeki kolonda tirmanilabilir yukseklikteki en ust kati voxelin
    // ustu (yukaridan asagi aranir: altinda su olan buz kenari da kiyi sayilir)
    const lx = p.x + fx * (this.r * 2 + 0.15), lz = p.z + fz * (this.r * 2 + 0.15);
    const vx = Math.floor(lx / VS), vz = Math.floor(lz / VS);
    let top = -1;
    const yLo = Math.floor((p.y + 0.5) / VS);
    for (let y = Math.floor((wy + WATER.ledge + 1e-3) / VS) - 1; y >= yLo; y--) {
      if (w.solid(vx, y, vz)) { top = (y + 1) * VS; break; }
    }
    if (top < 0 || top > wy + WATER.ledge + 1e-3) return false;
    if (this.collides(lx, top + EPS, lz, MOVE.height)) return false;
    this.vel.y = Math.sqrt(2 * GRAVITY * Math.max(0.2, top - p.y + 0.3));
    this.vel.x = fx * 3.2; this.vel.z = fz * 3.2;
    this.waterJumpT = 0.7;
    this.swimming = false;
    this.events.waterJump = true;
    return true;
  }

  _accel(wx, wz, wishSpeed, accel, dt) {
    if (wishSpeed <= 0) return;
    const vel = this.vel;
    const cur = vel.x * wx + vel.z * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    let acc = accel * dt * wishSpeed;
    if (acc > add) acc = add;
    vel.x += acc * wx; vel.z += acc * wz;
  }

  _airControl(wx, wz, wishSpeed, dt, cmd) {
    if (cmd.side !== 0 || cmd.fwd === 0 || wishSpeed <= 0) return;
    const vel = this.vel;
    const sp = Math.hypot(vel.x, vel.z);
    if (sp < 0.5) return;
    let vx = vel.x / sp, vz = vel.z / sp;
    const dot = vx * wx + vz * wz;
    if (dot <= 0) return;
    const k = 32 * (MOVE.airControl / 100) * dot * dot * dt;
    vx = vx * sp + wx * k; vz = vz * sp + wz * k;
    const l = Math.hypot(vx, vz);
    vel.x = vx / l * sp; vel.z = vz / l * sp;
  }

  _moveX(dx, canStep) {
    if (dx === 0) return;
    const p = this.pos;
    const nx = p.x + dx;
    if (!this.collides(nx, p.y, p.z)) { p.x = nx; return; }
    if (canStep && this._tryStep(nx, p.z)) { p.x = nx; return; }
    const r = this.r;
    if (dx > 0) p.x = Math.max(p.x, Math.floor((nx + r) / VS) * VS - r - EPS);
    else p.x = Math.min(p.x, (Math.floor((nx - r) / VS) + 1) * VS + r + EPS);
    this.vel.x = 0;
  }

  _moveZ(dz, canStep) {
    if (dz === 0) return;
    const p = this.pos;
    const nz = p.z + dz;
    if (!this.collides(p.x, p.y, nz)) { p.z = nz; return; }
    if (canStep && this._tryStep(p.x, nz)) { p.z = nz; return; }
    const r = this.r;
    if (dz > 0) p.z = Math.max(p.z, Math.floor((nz + r) / VS) * VS - r - EPS);
    else p.z = Math.min(p.z, (Math.floor((nz - r) / VS) + 1) * VS + r + EPS);
    this.vel.z = 0;
  }

  _tryStep(nx, nz) {
    const p = this.pos;
    if (this.vel.y > 1.5) return false; // yukselirken basamak cikma, ziplama tasisin
    for (let k = 0; k < STEPS.length; k++) {
      const s = STEPS[k];
      if (!this.collides(p.x, p.y + s, p.z) && !this.collides(nx, p.y + s, nz)) {
        // basamagin ustune otur
        let y = p.y + s;
        const top = Math.floor(y / VS) * VS + EPS;
        if (top < y && !this.collides(nx, top, nz)) y = top;
        this.stepSmooth += y - p.y;
        this.events.stepUp += y - p.y;
        p.y = y;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
        return true;
      }
    }
    return false;
  }

  _moveY(dy, prevGround) {
    if (dy === 0) return;
    const p = this.pos;
    const ny = p.y + dy;
    if (!this.collides(p.x, ny, p.z)) { p.y = ny; return; }
    if (dy < 0) {
      const contact = (Math.floor(ny / VS) + 1) * VS + EPS;
      p.y = Math.min(p.y, contact);
      if (!prevGround && !this.onGround) { this.landSpeed = -this.vel.y; this.events.landed = true; }
      this.onGround = true;
      this.vel.y = 0;
    } else {
      const contact = Math.floor((ny + this.h) / VS) * VS - this.h - EPS;
      p.y = Math.max(p.y, Math.min(contact, ny));
      this.vel.y = 0;
    }
  }

  // ani itme (patlama, ziplama pedi)
  impulse(x, y, z) {
    this.vel.x += x; this.vel.y += y; this.vel.z += z;
    if (y > 0.5) { this.onGround = false; this.groundTime = 1; }
  }
}

export function padLaunchVelocity(pad, out) {
  const g = GRAVITY;
  const apexY = Math.max(pad.y, pad.ty) + pad.apex;
  const vy = Math.sqrt(2 * g * (apexY - pad.y));
  const T = vy / g + Math.sqrt(2 * Math.max(0.01, apexY - pad.ty) / g);
  out.set((pad.tx - pad.x) / T, vy, (pad.tz - pad.z) / T);
  return out;
}
