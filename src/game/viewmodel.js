// Birinci sahis silah modelleri (ayri sahne + kamera; duvara gomulmez).
import * as THREE from 'three';

const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.75, roughness: 0.42 });
const steel = new THREE.MeshStandardMaterial({ color: 0x8b939d, metalness: 0.8, roughness: 0.36 });
const grip = new THREE.MeshStandardMaterial({ color: 0x17181c, metalness: 0.2, roughness: 0.75 });
const paint = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.48 });
const glowMat = (c, k = 2.4) => { const col = new THREE.Color(c); return new THREE.MeshBasicMaterial({ color: new THREE.Color(col.r * k, col.g * k, col.b * k) }); };

function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function cyl(r, len, mat, x = 0, y = 0, z = 0, seg = 14) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; }

function buildPulse() {
  const g = new THREE.Group();
  const acc = paint(0xd2691e);
  g.add(box(0.07, 0.09, 0.34, gunmetal, 0, 0, 0));
  g.add(box(0.072, 0.03, 0.2, acc, 0, 0.05, -0.02));
  g.add(box(0.04, 0.11, 0.06, grip, 0, -0.09, 0.08));
  g.add(box(0.05, 0.05, 0.12, grip, 0, -0.03, 0.2));
  const barrels = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    barrels.add(cyl(0.012, 0.3, steel, Math.cos(a) * 0.022, Math.sin(a) * 0.022, 0));
  }
  barrels.add(cyl(0.03, 0.03, gunmetal, 0, 0, -0.1));
  barrels.add(cyl(0.03, 0.03, gunmetal, 0, 0, 0.08));
  barrels.position.set(0, 0.005, -0.3);
  g.add(barrels);
  g.add(box(0.074, 0.006, 0.14, glowMat(0xff8a2a, 2.2), 0, 0.066, -0.02));
  g.add(box(0.02, 0.025, 0.05, gunmetal, 0, 0.07, 0.06));
  g.userData.spin = barrels;
  g.userData.muzzle = new THREE.Vector3(0, 0.005, -0.47);
  return g;
}

function buildShotgun() {
  const g = new THREE.Group();
  const wood = paint(0x6e4526);
  g.add(box(0.08, 0.08, 0.3, gunmetal, 0, 0, 0));
  g.add(cyl(0.022, 0.42, steel, -0.022, 0.012, -0.32));
  g.add(cyl(0.022, 0.42, steel, 0.022, 0.012, -0.32));
  g.add(box(0.07, 0.05, 0.16, wood, 0, -0.035, -0.26));
  g.add(box(0.045, 0.12, 0.06, grip, 0, -0.09, 0.07));
  g.add(box(0.06, 0.07, 0.16, wood, 0, -0.03, 0.22));
  g.add(box(0.082, 0.005, 0.22, glowMat(0xffc060, 2.2), 0, 0.044, 0.0));
  g.userData.pump = g.children[3];
  g.userData.muzzle = new THREE.Vector3(0, 0.012, -0.55);
  return g;
}

function buildPlasma() {
  const g = new THREE.Group();
  const shell = paint(0x3a4a5c);
  g.add(box(0.08, 0.1, 0.32, shell, 0, 0, 0));
  g.add(box(0.04, 0.11, 0.06, grip, 0, -0.1, 0.07));
  const coils = new THREE.Group();
  const gm = glowMat(0x40e8ff, 3);
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 20), gm);
    t.position.z = -0.2 - i * 0.05;
    coils.add(t);
  }
  coils.add(cyl(0.022, 0.24, steel, 0, 0, -0.27));
  g.add(coils);
  g.add(box(0.03, 0.03, 0.2, glowMat(0x40e8ff, 1.6), 0, 0.06, 0.0));
  g.userData.coils = coils;
  g.userData.muzzle = new THREE.Vector3(0, 0, -0.42);
  return g;
}

function buildRocket() {
  const g = new THREE.Group();
  const acc = paint(0xb8501c);
  g.add(cyl(0.065, 0.62, gunmetal, 0, 0.02, -0.12, 18));
  g.add(cyl(0.072, 0.06, acc, 0, 0.02, -0.4, 18));
  g.add(cyl(0.072, 0.05, acc, 0, 0.02, 0.15, 18));
  g.add(box(0.06, 0.09, 0.2, grip, 0, -0.07, 0.0));
  g.add(box(0.045, 0.12, 0.05, grip, 0, -0.12, 0.06));
  g.add(box(0.03, 0.05, 0.1, gunmetal, 0.07, 0.07, -0.05));
  g.add(box(0.012, 0.012, 0.3, glowMat(0xff7a1a, 2.6), 0, 0.09, -0.12));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 12), paint(0x444b55));
  tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.02, -0.46);
  g.add(tip);
  g.userData.tip = tip;
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.5);
  return g;
}

function buildRail() {
  const g = new THREE.Group();
  const shell = paint(0x2a2440);
  g.add(box(0.07, 0.09, 0.3, shell, 0, 0, 0.04));
  g.add(box(0.016, 0.03, 0.62, steel, -0.03, 0.01, -0.36));
  g.add(box(0.016, 0.03, 0.62, steel, 0.03, 0.01, -0.36));
  const gm = glowMat(0xb070ff, 3);
  const coils = new THREE.Group();
  for (let i = 0; i < 6; i++) coils.add(box(0.05, 0.006, 0.012, gm, 0, 0.01, -0.12 - i * 0.08));
  g.add(coils);
  g.add(box(0.045, 0.12, 0.06, grip, 0, -0.09, 0.1));
  g.add(cyl(0.02, 0.14, gunmetal, 0, 0.07, 0.0));
  g.add(cyl(0.022, 0.01, glowMat(0xb070ff, 1.8), 0, 0.07, 0.072));
  g.userData.coils = coils;
  g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.68);
  return g;
}

export class ViewModel {
  constructor(envMap, sunDir) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.7;
    this.camera = new THREE.PerspectiveCamera(62, 1.6, 0.01, 10);
    const sun = new THREE.DirectionalLight(0xffd2a6, 2.6);
    sun.position.copy(sunDir).multiplyScalar(10);
    this.sunLocal = sunDir.clone();
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x8890d0, 0x3a2a22, 0.6));
    this.flash = new THREE.PointLight(0xffa040, 0, 2.5, 2);
    this.flash.position.set(0.2, -0.1, -0.7);
    this.scene.add(this.flash);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    // namlu alevi: gorus modeli sahnesinde (dunya derinligiyle cakismaz)
    const fc = document.createElement('canvas'); fc.width = fc.height = 64;
    const g2 = fc.getContext('2d');
    const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,230,180,0.8)'); grd.addColorStop(1, 'rgba(255,160,60,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 64, 64);
    // yildiz kollari
    g2.globalCompositeOperation = 'lighter'; g2.fillStyle = 'rgba(255,220,160,0.6)';
    for (let k = 0; k < 4; k++) { g2.save(); g2.translate(32, 32); g2.rotate(k * Math.PI / 4); g2.fillRect(-30, -1.5, 60, 3); g2.restore(); }
    const ft = new THREE.CanvasTexture(fc);
    this.flashMat = new THREE.SpriteMaterial({ map: ft, color: new THREE.Color(2.2, 1.8, 1.3), blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
    this.flashSprite = new THREE.Sprite(this.flashMat);
    this.flashSprite.visible = false;
    this.flashSprite.renderOrder = 10;
    this.scene.add(this.flashSprite);
    this._mz = new THREE.Vector3();
    this.models = [buildPulse(), buildShotgun(), buildPlasma(), buildRocket(), buildRail()];
    for (const m of this.models) { m.visible = false; this.root.add(m); }
    this.current = -1;
    this.base = new THREE.Vector3(0.2, -0.2, -0.42);
    this.kick = 0; this.kickRot = 0; this.spin = 0; this.spinV = 0;
    this.swayX = 0; this.swayY = 0;
    this.bobT = 0; this.bobAmt = 0;
    this.lower = 0;
    this.land = 0;
    this.flashT = 0;
    this.zoom = 0;
    this.time = 0;
  }

  setWeapon(i) {
    if (i === this.current) return;
    for (let k = 0; k < this.models.length; k++) this.models[k].visible = k === i;
    this.current = i;
  }

  fireKick(W) {
    this.kick = Math.min(0.14, this.kick + W.kick);
    this.kickRot = Math.min(0.5, this.kickRot + W.kick * 2.2);
    this.spinV = 40;
    this.flashT = 0.06;
    this.flash.color.setHex(W.color);
    const c = new THREE.Color(W.color);
    this.flashMat.color.setRGB(1.2 + c.r * 1.4, 1.0 + c.g * 1.2, 0.8 + c.b * 1.2);
    this.flashSize = W.id === 'shotgun' ? 0.24 : W.id === 'rocket' ? 0.22 : W.id === 'rail' ? 0.16 : 0.15;
    this.flashMat.rotation = Math.random() * Math.PI;
  }

  // st: {weapon, switching(0..1), speed, onGround, mdx, mdy, landed, zoom, firing, dt}
  update(dt, st, mainCam) {
    this.time += dt;
    this.setWeapon(st.weapon);
    const m = this.models[this.current];
    this.kick *= Math.exp(-dt * 14);
    this.kickRot *= Math.exp(-dt * 12);
    this.spinV *= Math.exp(-dt * 3);
    this.spin += this.spinV * dt;
    // fare sallantisi
    this.swayX += (-st.mdx * 0.0009 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (st.mdy * 0.0009 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.05, Math.min(0.05, this.swayX));
    this.swayY = Math.max(-0.05, Math.min(0.05, this.swayY));
    // yurume salinimi
    const spd = st.onGround ? Math.min(1, st.speed / 9) : 0;
    this.bobAmt += (spd - this.bobAmt) * Math.min(1, dt * 8);
    this.bobT += dt * (6 + st.speed * 0.55);
    if (st.landed) this.land = Math.min(0.08, this.land + st.landed * 0.006);
    this.land *= Math.exp(-dt * 9);
    this.lower += ((st.switching > 0 ? 1 : 0) - this.lower) * Math.min(1, dt * 18);
    this.zoom += ((st.zoom ? 1 : 0) - this.zoom) * Math.min(1, dt * 12);
    const bx = Math.sin(this.bobT) * 0.012 * this.bobAmt;
    const by = -Math.abs(Math.cos(this.bobT)) * 0.012 * this.bobAmt;
    const breathe = Math.sin(this.time * 1.6) * 0.0025;
    const zx = this.zoom;
    const px = this.base.x * (1 - zx * 0.9) + bx + this.swayX;
    const py = this.base.y * (1 - zx * 0.35) + by + breathe - this.lower * 0.25 - this.land + this.swayY;
    const pz = this.base.z + this.kick + zx * 0.06;
    this.root.position.set(px, py, pz);
    this.root.rotation.set(this.kickRot * 0.3 + this.lower * -0.6 + this.swayY * 2, this.swayX * 2.5, bx * 2 + this.swayX * 1.5);
    if (m) {
      if (m.userData.spin) m.userData.spin.rotation.z = this.spin;
      if (m.userData.coils) {
        const pulse = 1 + Math.sin(this.time * 8) * 0.06 + this.kick * 3;
        m.userData.coils.scale.set(pulse, pulse, 1);
      }
      if (m.userData.pump) m.userData.pump.position.z = -0.26 + Math.min(0.06, this.kick * 1.2);
      if (m.userData.tip) m.userData.tip.visible = st.ammo > 0;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    this.flash.intensity = this.flashT > 0 ? 6 : 0;
    const fs = this.flashSprite;
    fs.visible = this.flashT > 0 && !!m;
    if (fs.visible) {
      this.root.updateMatrixWorld(true);
      fs.position.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld);
      const k = this.flashT / 0.06;
      fs.scale.setScalar((this.flashSize || 0.15) * (0.7 + 0.5 * k));
      this.flashMat.opacity = k;
    }
    // gunes yonunu kamera uzayina tasi (isik dunya ile tutarli olsun)
    if (mainCam) {
      const q = this._q || (this._q = new THREE.Quaternion());
      this.sun.position.copy(this.sunLocal).applyQuaternion(q.copy(mainCam.quaternion).invert()).multiplyScalar(10);
    }
  }

  // namlu ucunun dunya konumu (ana kamera ile hizali)
  muzzleWorld(mainCam, out) {
    const m = this.models[this.current];
    if (!m) return out.copy(mainCam.position);
    const T = this._tmp || (this._tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() });
    this.root.updateMatrixWorld(true);
    const local = T.a.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld); // gorus kamerasi uzayi
    const depth = -local.z;
    local.applyMatrix4(this.camera.projectionMatrix); // NDC
    const v = T.b.set(local.x, local.y, 0.5).unproject(mainCam).sub(mainCam.position).normalize();
    const fwd = T.c.set(0, 0, -1).applyQuaternion(mainCam.quaternion);
    const dist = Math.max(0.25, depth) / Math.max(0.2, v.dot(fwd));
    return out.copy(mainCam.position).addScaledVector(v, dist);
  }

  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
