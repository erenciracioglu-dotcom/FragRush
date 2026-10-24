// Quake tarzi hareket + voxel carpismasi (oyuncu ve botlar ortak kullanir).
import * as THREE from 'three';
import { VS, MOVE, GRAVITY } from '../config.js';

const EPS = 1e-4;
const STEPS = [VS, VS * 2, MOVE.stepHeight];

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
    this.events = { jumped: false, landed: false, dashed: false, slid: false, stepUp: 0 };
    this._wasCrouchCmd = false;
  }

  reset(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.crouching = false; this.h = MOVE.height;
    this.onGround = false; this.groundTime = 1; this.stepSmooth = 0;
    this.dashCd = 0; this.slideTime = 0; this.padLock = 0;
  }

  collides(x, y, z, h = this.h) {
    const r = this.r;
    return this.world.boxSolid(x - r, y, z - r, x + r, y + h, z + r);
  }

  get eyeHeight() { return this.crouching ? MOVE.crouchEye : MOVE.eye; }

  // cmd: {fwd, side, yaw, jump, crouch, dash}
  simulate(dt, cmd) {
    const ev = this.events;
    ev.jumped = ev.landed = ev.dashed = ev.slid = false; ev.stepUp = 0;
    const vel = this.vel, p = this.pos;
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.padLock = Math.max(0, this.padLock - dt);
    this.slideTime = Math.max(0, this.slideTime - dt);

    // gomulme kurtarma (moloz ustune dustuyse)
    if (this.collides(p.x, p.y, p.z)) {
      for (let k = 1; k <= 12; k++) { if (!this.collides(p.x, p.y + k * VS, p.z)) { p.y += k * VS; break; } }
    }

    // egilme / kayma
    const crouchEdge = cmd.crouch && !this._wasCrouchCmd;
    this._wasCrouchCmd = cmd.crouch;
    if (cmd.crouch) {
      if (!this.crouching) { this.crouching = true; this.h = MOVE.crouchHeight; if (!this.onGround) p.y += MOVE.height - MOVE.crouchHeight - 0.05; }
      const sp = Math.hypot(vel.x, vel.z);
      if (crouchEdge && this.onGround && sp > MOVE.runSpeed * 0.8) {
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
    const wishSpeed = wl > 1e-6 ? baseSpeed * this.speedMul : 0;

    // ziplama (basili tutunca otomatik tavsan ziplamasi)
    if (cmd.jump && (this.onGround || this.groundTime < 0.09) && vel.y <= 0.5 && this.padLock <= 0) {
      vel.y = MOVE.jumpVel;
      this.onGround = false; this.groundTime = 1;
      ev.jumped = true;
      if (this.crouching && this.slideTime > 0) this.slideTime = 0;
    }

    // surtunme
    if (this.onGround && !ev.jumped) {
      const sp = Math.hypot(vel.x, vel.z);
      if (sp > 1e-4) {
        const fr = this.slideTime > 0 ? 0.9 : MOVE.friction;
        const control = Math.max(sp, MOVE.stopSpeed);
        const ns = Math.max(0, sp - control * fr * dt) / sp;
        vel.x *= ns; vel.z *= ns;
      }
      this._accel(wx, wz, wishSpeed, this.slideTime > 0 ? 1.5 : MOVE.groundAccel, dt);
    } else {
      this._accel(wx, wz, wishSpeed, MOVE.airAccel, dt);
      this._airControl(wx, wz, wishSpeed, dt, cmd);
    }

    // atilma
    if (cmd.dash && this.dashCd <= 0) {
      let dx = wx, dz = wz;
      if (wl < 1e-6) { dx = -sy; dz = -cy; }
      const sp = Math.max(MOVE.dashSpeed, Math.hypot(vel.x, vel.z) * 1.05);
      vel.x = dx * sp; vel.z = dz * sp;
      vel.y = this.onGround ? Math.max(vel.y, MOVE.dashUp) : Math.max(vel.y, 1.2);
      this.dashCd = MOVE.dashCooldown;
      ev.dashed = true;
    }

    // yercekimi
    vel.y = Math.max(-MOVE.maxFallSpeed, vel.y - GRAVITY * dt);

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
