// Robot bot modeli + prosedurel animasyon (yurume, havada, nisan, vurulma parlamasi).
import * as THREE from 'three';

// not: dusuk puruzluluklu metal, alcak gunesle bembeyaz parlama yapiyordu -> daha mat
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d3139, metalness: 0.6, roughness: 0.5 });
const jointMat = new THREE.MeshStandardMaterial({ color: 0x15171b, metalness: 0.5, roughness: 0.62 });
const lightMat = new THREE.MeshStandardMaterial({ color: 0x8a929c, metalness: 0.6, roughness: 0.46 });

function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class BotModel {
  constructor(color) {
    const c = new THREE.Color(color);
    this.accent = new THREE.MeshStandardMaterial({ color: c, metalness: 0.4, roughness: 0.45, emissive: c.clone().multiplyScalar(0.0) });
    this.glow = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(6) });
    this.baseGlow = c.clone().multiplyScalar(6);
    const root = new THREE.Group();
    this.root = root;
    // alt govde
    const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips); this.hips = hips;
    part(B(0.34, 0.14, 0.22), bodyMat, 0, 0, 0, hips);
    const legs = [];
    for (const s of [-1, 1]) {
      const thigh = new THREE.Group(); thigh.position.set(s * 0.1, -0.02, 0); hips.add(thigh);
      part(B(0.14, 0.42, 0.16), bodyMat, 0, -0.2, 0, thigh);
      part(B(0.15, 0.08, 0.17), this.accent, 0, -0.06, 0, thigh);
      const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); thigh.add(knee);
      part(B(0.12, 0.42, 0.13), lightMat, 0, -0.2, 0.0, knee);
      part(B(0.13, 0.1, 0.06), jointMat, 0, -0.02, 0.08, knee);
      const foot = part(B(0.14, 0.07, 0.25), jointMat, 0, -0.43, -0.04, knee);
      legs.push({ thigh, knee, foot });
    }
    this.legs = legs;
    // ust govde
    const torso = new THREE.Group(); torso.position.y = 1.0; root.add(torso); this.torso = torso;
    part(B(0.46, 0.5, 0.3), bodyMat, 0, 0.27, 0, torso);
    part(B(0.38, 0.22, 0.05), this.accent, 0, 0.33, -0.16, torso);
    part(B(0.3, 0.36, 0.14), jointMat, 0, 0.27, 0.2, torso);
    part(B(0.04, 0.26, 0.02), this.glow, -0.08, 0.27, 0.28, torso);
    part(B(0.04, 0.26, 0.02), this.glow, 0.08, 0.27, 0.28, torso);
    part(B(0.3, 0.02, 0.31), this.glow, 0, 0.06, 0, torso);
    // bas
    const head = new THREE.Group(); head.position.set(0, 0.6, 0); torso.add(head); this.head = head;
    part(B(0.26, 0.24, 0.27), bodyMat, 0, 0.1, 0, head);
    part(B(0.23, 0.065, 0.03), this.glow, 0, 0.12, -0.14, head);
    part(B(0.02, 0.16, 0.02), lightMat, 0.09, 0.28, 0.06, head);
    part(B(0.04, 0.04, 0.04), this.glow, 0.09, 0.37, 0.06, head);
    // kollar + silah
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.3, 0.44, 0); torso.add(sh);
      part(B(0.16, 0.15, 0.2), this.accent, 0, 0.02, 0, sh);
      part(B(0.1, 0.3, 0.1), lightMat, 0, -0.16, 0, sh);
      const el = new THREE.Group(); el.position.set(0, -0.31, 0); sh.add(el);
      part(B(0.09, 0.28, 0.09), bodyMat, 0, -0.13, 0, el);
      arms.push({ sh, el });
    }
    this.arms = arms;
    const gun = new THREE.Group(); gun.position.set(0.1, 0.22, -0.3); torso.add(gun); this.gun = gun;
    part(B(0.09, 0.11, 0.5), jointMat, 0, 0, 0, gun);
    part(B(0.05, 0.05, 0.2), lightMat, 0, 0.01, -0.33, gun);
    part(B(0.092, 0.015, 0.3), this.glow, 0, 0.06, 0, gun);
    this.phase = Math.random() * 6;
    this.flash = 0;
    this.lowerYaw = 0;
  }

  // st: {yaw, pitch, vx, vz, onGround, vy, crouch, protect, dt, firing}
  update(st) {
    const dt = st.dt;
    const sp = Math.hypot(st.vx, st.vz);
    const r = this.root;
    r.rotation.y = 0;
    // hareket yonu: alt govde hareket yonune, ust govde nisana
    let moveYaw = st.yaw;
    let back = false;
    if (sp > 0.6) {
      moveYaw = Math.atan2(-st.vx, -st.vz);
      let d = angDiff(moveYaw, st.yaw);
      if (Math.abs(d) > Math.PI * 0.6) { moveYaw += Math.PI; back = true; d = angDiff(moveYaw, st.yaw); }
      d = Math.max(-1.1, Math.min(1.1, d));
      moveYaw = st.yaw + d;
    }
    this.lowerYaw += angDiff(moveYaw, this.lowerYaw) * Math.min(1, dt * 10);
    this.hips.rotation.y = this.lowerYaw;
    this.torso.rotation.y = st.yaw;
    const runAmt = Math.min(1, sp / 8);
    this.phase += dt * (3 + sp * 1.3) * (back ? -1 : 1);
    const ph = this.phase;
    if (st.onGround) {
      for (let i = 0; i < 2; i++) {
        const o = i === 0 ? 0 : Math.PI;
        const L = this.legs[i];
        L.thigh.rotation.x = Math.sin(ph + o) * 0.75 * runAmt - (st.crouch ? 0.9 : 0);
        L.knee.rotation.x = Math.max(0, Math.sin(ph + o + 1.4)) * 1.1 * runAmt + (st.crouch ? 1.6 : 0.05);
      }
      const bob = Math.abs(Math.sin(ph)) * 0.05 * runAmt;
      this.hips.position.y = 0.92 + bob - (st.crouch ? 0.3 : 0);
      this.torso.position.y = 1.0 + bob - (st.crouch ? 0.32 : 0);
    } else {
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i];
        const t = st.vy > 0 ? -0.6 : -0.25;
        L.thigh.rotation.x += ((t + (i ? 0.25 : -0.1)) - L.thigh.rotation.x) * Math.min(1, dt * 8);
        L.knee.rotation.x += ((st.vy > 0 ? 1.3 : 0.5) - L.knee.rotation.x) * Math.min(1, dt * 8);
      }
      this.hips.position.y = 0.92; this.torso.position.y = 1.0;
    }
    // govde egimi (ivme)
    this.torso.rotation.x = -Math.min(0.25, sp * 0.015) * (back ? -1 : 1) * 0.5;
    this.torso.rotation.z = 0;
    // nisan
    const p = st.pitch;
    this.head.rotation.x = p * 0.6;
    this.gun.rotation.x = p;
    this.gun.position.y = 0.22 + Math.sin(p) * 0.18;
    for (let i = 0; i < 2; i++) {
      const A = this.arms[i];
      A.sh.rotation.x = -1.25 + p * 0.9 + (st.firing ? -0.08 : 0);
      A.sh.rotation.z = i === 0 ? 0.35 : -0.15;
      A.el.rotation.x = -0.35;
    }
    // vurulma parlamasi / dogma korumasi
    this.flash = Math.max(0, this.flash - dt * 5);
    const prot = st.protect > 0 ? 0.6 + Math.sin(performance.now() * 0.03) * 0.4 : 0;
    const e = Math.max(this.flash, prot);
    this.accent.emissive.setRGB(e * 1.7, e * 1.5, e * 1.3);
    const gk = 1 + this.flash * 2;
    this.glow.color.copy(this.baseGlow).multiplyScalar(gk);
  }

  hit() { this.flash = 1; }
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
