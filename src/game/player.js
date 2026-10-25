// Oyuncu: girdi -> hareket, silah, kamera efektleri.
import * as THREE from 'three';
import { MOVE } from '../config.js';
import { Actor } from './actor.js';
import { WEAPONS } from './weapons.js';
import { fire } from './combat.js';
import { t } from '../i18n.js';

const _eye = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muz = new THREE.Vector3();

export class Player extends Actor {
  constructor(game) {
    super(game, 0, t('you'), 0xff7a1a, true);
    this.zoom = false;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.roll = 0;
    this.bobT = 0;
    this.landDip = 0;
    this.fovKick = 0;
    this.mdx = 0; this.mdy = 0;
    this.deathCam = new THREE.Vector3();
    this.deathT = 0;
    this.stepAcc = 0;
  }

  spawn(sp) {
    super.spawn(sp);
    this.recoil = 0; this.landDip = 0; this.fovKick = 0; this.deathT = 0;
    this.zoom = false;
  }

  update(dt, input, settings) {
    const [mx, my] = input.consumeMouse();
    this.mdx = mx; this.mdy = my;
    const W = this.weapons.def;
    const zoomMul = this.zoom && W.zoom ? 1 / W.zoom : 1;
    const sens = (settings.sensitivity || 1) * 0.0021 * zoomMul;
    this.yaw -= mx * sens;
    this.pitch -= my * sens * (settings.invert ? -1 : 1);
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    if (!this.alive) { this.deathT += dt; return; }

    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const side = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    // Ctrl kullanilmaz: Chrome'da Ctrl+W sekmeyi kapatir. C: egil / kay, suda dal.
    const cmd = {
      fwd, side, yaw: this.yaw, pitch: this.pitch,
      jump: input.down('Space'),
      crouch: input.down('KeyC'),
      dash: input.pressed('ShiftLeft') || input.pressed('ShiftRight'),
    };
    const m = this.mover;
    m.simulate(dt, cmd);
    const ev = m.events;
    const audio = this.game.audio;
    const p = m.pos;
    if (ev.jumped && audio) audio.play('jump', p.x, p.y, p.z, 1, true);
    if (ev.dashed) { this.fovKick = 9; if (audio) audio.play('dash', p.x, p.y, p.z, 1, true); }
    if (ev.slid && audio) audio.play('slide', p.x, p.y, p.z, 1, true);
    if (ev.landed && m.landSpeed > 4) {
      this.landDip = Math.min(0.22, m.landSpeed * 0.012);
      if (audio) audio.play('land', p.x, p.y, p.z, Math.min(1.5, m.landSpeed / 10), true);
      if (m.landSpeed > 12) this.game.fx.dustPuff(p.x, p.y, p.z, 1);
    }
    // ayak sesleri (suda su sesi)
    const hs = Math.hypot(m.vel.x, m.vel.z);
    if (m.swimming) {
      this.stepAcc += (hs + Math.abs(m.vel.y)) * dt;
      if (this.stepAcc > 1.6) { this.stepAcc = 0; if (audio) audio.play(m.eyesUnder ? 'swimUnder' : 'swim', p.x, p.y, p.z, 0.7, true); }
    } else if (m.onGround && hs > 2 && !m.crouching) {
      this.stepAcc += hs * dt;
      if (this.stepAcc > 2.3) { this.stepAcc = 0; if (audio) audio.play(m.inWater ? 'wade' : 'step', p.x, p.y, p.z, 0.6 + hs / 20, true); }
    }

    // silah secimi
    const ws = this.weapons;
    for (let i = 0; i < WEAPONS.length; i++) if (input.pressed('Digit' + (i + 1)) || input.pressed('Numpad' + (i + 1))) if (ws.select(i) && audio) audio.play('switch', p.x, p.y, p.z, 1, true);
    const wh = input.consumeWheel();
    if (wh) { if (ws.cycle(wh > 0 ? 1 : -1) && audio) audio.play('switch', p.x, p.y, p.z, 1, true); }
    if (input.pressed('KeyQ')) { if (ws.select(ws.previous) && audio) audio.play('switch', p.x, p.y, p.z, 1, true); }
    ws.update(dt);
    const under = m.eyesUnder;
    this.zoom = input.mouseDown(2) && !!ws.def.zoom && ws.pending < 0 && !under;

    // ates (gozler su altindayken silah calismaz)
    if (under) {
      if (input.mouseHit(0)) {
        if (audio) audio.play('empty', p.x, p.y, p.z, 1, true);
        if (this.game.hud) this.game.hud.subMsg(t('noFireWater'), 1.2);
      }
    } else if (input.mouseDown(0)) {
      if (ws.canFire()) {
        const W2 = ws.def;
        this.game.camera.updateMatrixWorld();
        this.eye(_eye);
        this.aimDir(_dir);
        this.game.viewmodel.muzzleWorld(this.game.camera, _muz);
        fire(this.game, this, _eye, _dir, _muz);
        this.game.viewmodel.fireKick(W2);
        this.recoil += W2.recoil;
        this.recoilYaw += (Math.random() - 0.5) * W2.recoil * 0.6;
        this.game.fx.addShake(W2.shake);
      } else if (input.mouseHit(0) && ws.ammo[ws.current] <= 0) {
        if (audio) audio.play('empty', p.x, p.y, p.z, 1, true);
        ws.cycle(1);
      }
    }
    // gercek nisan geri tepmesi (gorsel + kucuk kalici)
    this.pitch += this.recoil * dt * 8 * 0.0;
    this.recoil *= Math.exp(-dt * 9);
    this.recoilYaw *= Math.exp(-dt * 9);
    this.landDip *= Math.exp(-dt * 7);
    this.fovKick *= Math.exp(-dt * 5);
    // egilme yon kaymasi
    this.roll += ((-side * 0.012) - this.roll) * Math.min(1, dt * 8);
    this.bobT += dt * hs * 1.25;
  }

  updateCamera(cam, dt, settings, shake) {
    const m = this.mover;
    if (!this.alive) {
      // olum kamerasi: yukselip katile bak
      const k = Math.min(1, this.deathT * 1.5);
      cam.position.set(m.pos.x, m.pos.y + 0.4 + k * 2.2, m.pos.z);
      const killer = this.killer && this.killer !== this && this.killer.alive ? this.killer : null;
      if (killer) {
        const kp = killer.mover.pos;
        const dx = kp.x - cam.position.x, dy = kp.y + 1.2 - cam.position.y, dz = kp.z - cam.position.z;
        const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
        this.yaw += angDiff(ty, this.yaw) * Math.min(1, dt * 3);
        this.pitch += (tp - this.pitch) * Math.min(1, dt * 3);
      }
      cam.rotation.set(this.pitch, this.yaw, 0.15 * k);
      this.game.setFov((settings.fov || 100));
      return;
    }
    const hs = Math.hypot(m.vel.x, m.vel.z);
    const bob = m.onGround ? Math.sin(this.bobT * 1.0) * Math.min(1, hs / 9) * 0.035 : 0;
    const eyeY = m.pos.y + m.eyeHeight - m.stepSmooth - this.landDip + Math.abs(bob) * 0.6;
    cam.position.set(m.pos.x, eyeY, m.pos.z);
    const sx = (Math.random() - 0.5) * shake * 0.03, sy = (Math.random() - 0.5) * shake * 0.03;
    cam.rotation.set(this.pitch + this.recoil + sy, this.yaw + this.recoilYaw + sx, this.roll + bob * 0.08);
    let fov = (settings.fov || 100) + this.fovKick + Math.min(8, Math.max(0, hs - 10) * 0.6);
    if (this.zoom) fov = fov / this.weapons.def.zoom;
    this.game.setFov(fov);
  }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
