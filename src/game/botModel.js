// Robot bot modeli + prosedurel animasyon (yurume, havada, nisan, vurulma parlamasi).
// Modelin onu -z: oyunun ileri yonu (yaw=0'da -z) ile ayni; silah, vizor, gogus plakasi, diz kapaklari
// ve ayak burunlari bu yone bakar. Kollar iki kemikli IK ile silahi tutar, ates yonu ile govde hep ayni.
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

// kol boylari (omuz -> dirsek, dirsek -> el ortasi) ve silahtaki tutma noktalari (silah uzayinda)
const UA = 0.31, FA = 0.31;
const GRIP = new THREE.Vector3(0, -0.075, 0.1); // sag el: kabza
const FORE = new THREE.Vector3(-0.03, -0.07, -0.08); // sol el: on kundak
// dirseklerin bakacagi yon (govde uzayinda): sag dirsek asagi-disari, sol dirsek asagi
const POLE_R = new THREE.Vector3(0.6, -1, 0.25).normalize();
const POLE_L = new THREE.Vector3(-0.35, -1, 0).normalize();
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _f = new THREE.Vector3();
const _m = new THREE.Matrix4();

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
      part(B(0.13, 0.1, 0.06), jointMat, 0, -0.02, -0.08, knee); // diz kapagi onde
      // ayak bilegi: ayak tabani hep yere paralel (comelince burun topraga gomulmesin)
      const ankle = new THREE.Group(); ankle.position.set(0, -0.41, 0); knee.add(ankle);
      const foot = part(B(0.14, 0.07, 0.25), jointMat, 0, -0.02, -0.04, ankle);
      legs.push({ thigh, knee, ankle, foot });
    }
    this.legs = legs;
    // ust govde (YXZ: once nisan yonune don, egim o yonun ekseninde)
    const torso = new THREE.Group(); torso.position.y = 1.0; torso.rotation.order = 'YXZ'; root.add(torso); this.torso = torso;
    part(B(0.46, 0.5, 0.3), bodyMat, 0, 0.27, 0, torso);
    part(B(0.38, 0.22, 0.05), this.accent, 0, 0.33, -0.16, torso);
    // sirt cantasi: tek dikey isik (iki dikey serit arkadan "goz" gibi okunuyordu)
    part(B(0.3, 0.36, 0.14), jointMat, 0, 0.27, 0.2, torso);
    part(B(0.05, 0.28, 0.02), this.glow, 0, 0.27, 0.28, torso);
    part(B(0.3, 0.02, 0.31), this.glow, 0, 0.06, 0, torso);
    // bas
    const head = new THREE.Group(); head.position.set(0, 0.6, 0); torso.add(head); this.head = head;
    part(B(0.26, 0.24, 0.27), bodyMat, 0, 0.1, 0, head);
    part(B(0.23, 0.065, 0.04), this.glow, 0, 0.12, -0.135, head);
    part(B(0.02, 0.16, 0.02), lightMat, 0.09, 0.28, 0.06, head);
    part(B(0.04, 0.04, 0.04), this.glow, 0.09, 0.37, 0.06, head);
    // kollar + silah
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.3, 0.44, 0); torso.add(sh);
      // omuz zirhi govdede sabit (kolla donunce kanat gibi yukari kalkiyordu)
      part(B(0.16, 0.15, 0.2), this.accent, s * 0.3, 0.46, 0, torso);
      part(B(0.1, 0.3, 0.1), lightMat, 0, -0.16, 0, sh);
      const el = new THREE.Group(); el.position.set(0, -UA, 0); sh.add(el);
      part(B(0.09, 0.3, 0.09), bodyMat, 0, -0.14, 0, el);
      part(B(0.1, 0.08, 0.11), jointMat, 0, -FA, 0, el); // el
      arms.push({ sh, el });
    }
    this.arms = arms;
    const gun = new THREE.Group(); gun.position.set(0.1, 0.22, -0.3); torso.add(gun); this.gun = gun;
    part(B(0.09, 0.11, 0.5), jointMat, 0, 0, 0, gun);
    part(B(0.05, 0.05, 0.2), lightMat, 0, 0.01, -0.33, gun);
    part(B(0.092, 0.015, 0.3), this.glow, 0, 0.06, 0, gun);
    this.phase = Math.random() * 6;
    this.flash = 0;
    this.kick = 0;
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
    // bacaklar: +x donusu uylugu one (-z) kaldirir; diz -x ile geriye kirilir (onu -z olan bacak)
    if (st.onGround) {
      for (let i = 0; i < 2; i++) {
        const o = i === 0 ? 0 : Math.PI;
        const L = this.legs[i];
        L.thigh.rotation.x = Math.sin(ph + o) * 0.75 * runAmt + (st.crouch ? 0.9 : 0);
        L.knee.rotation.x = -(Math.max(0, Math.sin(ph + o + 1.4)) * 1.1 * runAmt + (st.crouch ? 1.7 : 0.05));
        L.ankle.rotation.x = -(L.thigh.rotation.x + L.knee.rotation.x);
      }
      const bob = Math.abs(Math.sin(ph)) * 0.05 * runAmt;
      this.hips.position.y = 0.92 + bob - (st.crouch ? 0.3 : 0);
      this.torso.position.y = 1.0 + bob - (st.crouch ? 0.32 : 0);
    } else {
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i];
        const t = (st.vy > 0 ? 0.6 : 0.25) + (i ? -0.25 : 0.1);
        L.thigh.rotation.x += (t - L.thigh.rotation.x) * Math.min(1, dt * 8);
        L.knee.rotation.x += (-(st.vy > 0 ? 1.3 : 0.5) - L.knee.rotation.x) * Math.min(1, dt * 8);
        L.ankle.rotation.x = -(L.thigh.rotation.x + L.knee.rotation.x) * 0.6;
      }
      this.hips.position.y = 0.92; this.torso.position.y = 1.0;
    }
    // govde egimi: nisan yonundeki hiz bileseni kadar one (geri giderken arkaya)
    const fwd = -(st.vx * Math.sin(st.yaw) + st.vz * Math.cos(st.yaw));
    const lean = -Math.max(-0.1, Math.min(0.1, fwd * 0.0075));
    this.torso.rotation.x = lean;
    this.torso.rotation.z = 0;
    // nisan: bas ve silah egimden bagimsiz gercek nisan acisinda; atiste kisa geri tepme
    const p = st.pitch;
    if (st.firing) this.kick = 1;
    this.kick = Math.max(0, this.kick - dt * 8);
    this.head.rotation.x = p * 0.6 - lean;
    this.gun.rotation.x = p - lean + this.kick * 0.12;
    this.gun.position.set(0.1, 0.22 + Math.sin(p) * 0.18, -0.3 + this.kick * 0.05);
    this.gun.updateMatrix();
    // eller silahta: sag el kabzada, sol el on kundakta
    reach(this.arms[1], _t.copy(GRIP).applyMatrix4(this.gun.matrix), POLE_R);
    reach(this.arms[0], _t.copy(FORE).applyMatrix4(this.gun.matrix), POLE_L);
    // vurulma parlamasi / dogma korumasi
    this.flash = Math.max(0, this.flash - dt * 5);
    const prot = st.protect > 0 ? 0.6 + Math.sin(performance.now() * 0.03) * 0.4 : 0;
    const e = Math.max(this.flash, prot);
    this.accent.emissive.setRGB(e * 1.7, e * 1.5, e * 1.3);
    const gk = 1 + this.flash * 2;
    this.glow.color.copy(this.baseGlow).multiplyScalar(gk);
  }

  hit() { this.flash = 1; }

  // namlu ucu (dunya uzayi), son pozun govde yuksekligi/egimiyle: atis efektleri silahin ucundan ciksin.
  // silahin dunya donusu Ry(yaw)*Rx(pitch) (govde egimi silahta geri alinir), konumu Ry(yaw)*Rx(egim)*G
  muzzle(out, x, y, z, yaw, pitch) {
    const l = this.torso.rotation.x, cl = Math.cos(l), sl = Math.sin(l);
    const gy = 0.22 + Math.sin(pitch) * 0.18;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const lx = 0.1;
    const ly = gy * cl + 0.3 * sl + 0.01 * cp + 0.45 * sp;
    const lz = gy * sl - 0.3 * cl + 0.01 * sp - 0.45 * cp;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    return out.set(x + lx * cy + lz * sy, y + this.torso.position.y + ly, z - lx * sy + lz * cy);
  }
}

// iki kemikli IK (govde uzayinda): omuzdan T'ye uzan, dirsek pole yonune kirilsin.
// Omuz grubunun yerel -y'si ust kol, yerel x'i dirsek mentesesi; dirsek grubu yerel x etrafinda doner.
function reach(A, T, pole) {
  const S = A.sh.position;
  _d.subVectors(T, S);
  const dist = Math.min(UA + FA - 1e-3, Math.max(Math.abs(UA - FA) + 1e-3, _d.length()));
  _d.normalize();
  const x = (UA * UA - FA * FA + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, UA * UA - x * x));
  _u.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _e.copy(S).addScaledVector(_d, x).addScaledVector(_u, h); // dirsek
  _by.subVectors(S, _e).normalize();
  _bx.crossVectors(_u, _d).normalize();
  _bz.crossVectors(_bx, _by);
  _m.makeBasis(_bx, _by, _bz);
  A.sh.quaternion.setFromRotationMatrix(_m);
  // on kol yonu (dirsekten ulasilan el noktasina), omuz uzayinda
  _f.copy(S).addScaledVector(_d, dist).sub(_e).normalize();
  A.el.rotation.set(Math.atan2(-_f.dot(_bz), -_f.dot(_by)), 0, 0);
}

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
