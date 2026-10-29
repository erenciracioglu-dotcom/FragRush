// Ag mesaj bicimleri (ikili). Konum int16 (1 cm; dunya 72 x 24 x 72 m sigar), hiz int16 (1 cm/s), yon u16.
//   Guvenilmez kanal:  U_INPUT (konuk -> ev sahibi, son 3 komut yedekli)   U_SNAP (ev sahibi -> konuk, 30 Hz)
//   Guvenilir kanal:   R_JSON (olaylar, katilim, atis)                      R_VOX (voksel farklari / tam chunk'lar)
import { Mover } from '../game/mover.js';

export const U_INPUT = 1, U_SNAP = 2, U_BODY = 3, R_JSON = 10, R_VOX = 11;
export const VOX_DIFF = 0, VOX_FULL = 1, VOX_BODY = 2;

const TAU = Math.PI * 2;
export const q16 = (v, s) => Math.max(-32768, Math.min(32767, Math.round(v * s)));
export const angleToU16 = (a) => { a = ((a % TAU) + TAU) % TAU; return Math.min(65535, Math.round(a / TAU * 65536)); };
export const u16ToAngle = (u) => u / 65536 * TAU;

// ---- girdi: [U_INPUT][n] n x { seq u32, dt f32, fwd i8, side i8, yaw f32, pitch f32, flags u8, weapon u8 } ----
const CMD_BYTES = 20;
export function encodeInput(cmds, weapon) {
  const n = Math.min(3, cmds.length);
  const buf = new ArrayBuffer(2 + n * CMD_BYTES), dv = new DataView(buf);
  dv.setUint8(0, U_INPUT); dv.setUint8(1, n);
  for (let i = 0; i < n; i++) {
    const c = cmds[cmds.length - n + i], o = 2 + i * CMD_BYTES;
    dv.setUint32(o, c.seq, true); dv.setFloat32(o + 4, c.dt, true);
    dv.setInt8(o + 8, Math.max(-1, Math.min(1, Math.round(c.fwd)))); dv.setInt8(o + 9, Math.max(-1, Math.min(1, Math.round(c.side))));
    dv.setFloat32(o + 10, c.yaw, true); dv.setFloat32(o + 14, c.pitch || 0, true);
    dv.setUint8(o + 18, (c.jump ? 1 : 0) | (c.crouch ? 2 : 0) | (c.dash ? 4 : 0));
    dv.setUint8(o + 19, weapon);
  }
  return buf;
}
export function decodeInput(buf) {
  const dv = new DataView(buf), n = dv.getUint8(1), out = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * CMD_BYTES, fl = dv.getUint8(o + 18);
    out.push({ seq: dv.getUint32(o, true), dt: dv.getFloat32(o + 4, true), fwd: dv.getInt8(o + 8), side: dv.getInt8(o + 9), yaw: dv.getFloat32(o + 10, true), pitch: dv.getFloat32(o + 14, true), jump: !!(fl & 1), crouch: !!(fl & 2), dash: !!(fl & 4), weapon: dv.getUint8(o + 19) });
  }
  return out;
}

// ---- anlik goruntu ----
// baslik: [U_SNAP][seq u16][hostTime f32][matchTime f32][ack u32][n u8] ; konuga ozel blok: Mover durumu 17 x f32,
// health i16, armor i16, flags u8 (1 canli, 2 koruma), silah u8, cephane 5 x u8, quad u8 (x10), protect u8 (x50), respawn u8 (x10)
// aktor: id u8, flags u8, x y z i16, vx vy vz i16, yaw u16, pitch i16, health u8, silah u8, frags i16, deaths i16
export const ACTOR_BYTES = 24;
const HEAD = 16, SELF_BYTES = Mover.STATE_LEN * 4 + 4 + 1 + 1 + 5 + 3 + 2;
export const AF = { ALIVE: 1, CROUCH: 2, GROUND: 4, FIRE: 8, QUAD: 16, PROTECT: 32, HUMAN: 64 };

// actors: [{id, flags, x,y,z, vx,vy,vz, yaw, pitch, health, weapon, frags, deaths}] ; self: {state:Float64Array, health, armor, alive, protect, weapon, ammo[5], quad, protectT, respawn} ya da null
export function encodeSnapshot(seq, hostTime, matchTime, ack, actors, self) {
  const buf = new ArrayBuffer(HEAD + (self ? SELF_BYTES : 0) + actors.length * ACTOR_BYTES), dv = new DataView(buf);
  dv.setUint8(0, U_SNAP); dv.setUint16(1, seq & 0xffff, true); dv.setFloat32(3, hostTime, true); dv.setFloat32(7, matchTime, true);
  dv.setUint32(11, ack >>> 0, true); dv.setUint8(15, actors.length);
  let o = HEAD;
  if (self) {
    for (let i = 0; i < Mover.STATE_LEN; i++) { dv.setFloat32(o, self.state[i], true); o += 4; }
    dv.setInt16(o, Math.round(self.health), true); o += 2; dv.setInt16(o, Math.round(self.armor), true); o += 2;
    dv.setUint8(o++, (self.alive ? 1 : 0) | (self.protectT > 0 ? 2 : 0)); dv.setUint8(o++, self.weapon);
    for (let i = 0; i < 5; i++) dv.setUint8(o++, Math.min(255, self.ammo[i]));
    dv.setUint8(o++, Math.min(255, Math.round(self.quad * 10))); dv.setUint8(o++, Math.min(255, Math.round(self.protectT * 50))); dv.setUint8(o++, Math.min(255, Math.round(Math.max(0, self.respawn) * 10)));
    dv.setUint16(o, angleToU16(self.yaw || 0), true); o += 2;    // dogma yonu (yeniden dogunca konuk bu yone bakar)
  }
  for (const a of actors) {
    dv.setUint8(o, a.id); dv.setUint8(o + 1, a.flags);
    dv.setInt16(o + 2, q16(a.x, 100), true); dv.setInt16(o + 4, q16(a.y, 100), true); dv.setInt16(o + 6, q16(a.z, 100), true);
    dv.setInt16(o + 8, q16(a.vx, 100), true); dv.setInt16(o + 10, q16(a.vy, 100), true); dv.setInt16(o + 12, q16(a.vz, 100), true);
    dv.setUint16(o + 14, angleToU16(a.yaw), true); dv.setInt16(o + 16, q16(a.pitch, 10000), true);
    dv.setUint8(o + 18, Math.max(0, Math.min(255, Math.ceil(a.health)))); dv.setUint8(o + 19, a.weapon);
    dv.setInt16(o + 20, Math.max(-32768, Math.min(32767, a.frags)), true); dv.setInt16(o + 22, Math.min(32767, a.deaths), true);
    o += ACTOR_BYTES;
  }
  return buf;
}
export function decodeSnapshot(buf, hasSelf) {
  const dv = new DataView(buf);
  const out = { seq: dv.getUint16(1, true), hostTime: dv.getFloat32(3, true), matchTime: dv.getFloat32(7, true), ack: dv.getUint32(11, true), actors: [], self: null };
  const n = dv.getUint8(15);
  let o = HEAD;
  if (hasSelf) {
    const st = new Float64Array(Mover.STATE_LEN);
    for (let i = 0; i < Mover.STATE_LEN; i++) { st[i] = dv.getFloat32(o, true); o += 4; }
    const health = dv.getInt16(o, true); o += 2; const armor = dv.getInt16(o, true); o += 2;
    const fl = dv.getUint8(o++), weapon = dv.getUint8(o++), ammo = [];
    for (let i = 0; i < 5; i++) ammo.push(dv.getUint8(o++));
    const quad = dv.getUint8(o++) / 10, protectT = dv.getUint8(o++) / 50, respawn = dv.getUint8(o++) / 10;
    const yaw = u16ToAngle(dv.getUint16(o, true)); o += 2;
    out.self = { state: st, health, armor, alive: !!(fl & 1), weapon, ammo, quad, protectT, respawn, yaw };
  }
  for (let i = 0; i < n; i++) {
    out.actors.push({
      id: dv.getUint8(o), flags: dv.getUint8(o + 1),
      x: dv.getInt16(o + 2, true) / 100, y: dv.getInt16(o + 4, true) / 100, z: dv.getInt16(o + 6, true) / 100,
      vx: dv.getInt16(o + 8, true) / 100, vy: dv.getInt16(o + 10, true) / 100, vz: dv.getInt16(o + 12, true) / 100,
      yaw: u16ToAngle(dv.getUint16(o + 14, true)), pitch: dv.getInt16(o + 16, true) / 10000,
      health: dv.getUint8(o + 18), weapon: dv.getUint8(o + 19), frags: dv.getInt16(o + 20, true), deaths: dv.getInt16(o + 22, true),
    });
    o += ACTOR_BYTES;
  }
  return out;
}

// ---- guvenilir JSON ----
const enc = new TextEncoder(), dec = new TextDecoder();
export function encodeJson(obj) {
  const body = enc.encode(JSON.stringify(obj));
  const out = new Uint8Array(1 + body.length); out[0] = R_JSON; out.set(body, 1);
  return out.buffer;
}
export function decodeJson(buf) { return JSON.parse(dec.decode(new Uint8Array(buf, 1))); }

// ---- voksel parcalari: [R_VOX][kind u8][transfer u16][part u8][nParts u8][bytes] ----
export const VOX_HEAD = 6;
export function encodeVoxParts(kind, transfer, parts) {
  return parts.map((p, i) => {
    const out = new Uint8Array(VOX_HEAD + p.length);
    out[0] = R_VOX; out[1] = kind; out[2] = transfer & 255; out[3] = (transfer >> 8) & 255; out[4] = i; out[5] = parts.length;
    out.set(p, VOX_HEAD);
    return out.buffer;
  });
}
export function decodeVoxPart(buf) {
  const v = new Uint8Array(buf);
  return { kind: v[1], transfer: v[2] | (v[3] << 8), part: v[4], nParts: v[5], data: v.subarray(VOX_HEAD) };
}
// konuk tarafi: parcalari birlestirir; tamamlaninca {kind, bytes} dondurur
export class VoxAssembler {
  constructor() { this.t = new Map(); }
  add(msg) {
    let e = this.t.get(msg.transfer);
    if (!e) { e = { kind: msg.kind, n: msg.nParts, parts: new Array(msg.nParts), got: 0 }; this.t.set(msg.transfer, e); }
    if (!e.parts[msg.part]) { e.parts[msg.part] = msg.data; e.got++; }
    if (e.got < e.n) return null;
    this.t.delete(msg.transfer);
    let len = 0; for (const p of e.parts) len += p.length;
    const bytes = new Uint8Array(len); let o = 0;
    for (const p of e.parts) { bytes.set(p, o); o += p.length; }
    return { kind: e.kind, bytes };
  }
}

// ---- dusen govdeler ----
// dogus yuku (deflate'ten once): [id u16][minX minY minZ nx ny nz: 6 x u16][com 3 x f32][mats nx*ny*nz][dmgs ...]
export function encodeBodySpawn(id, isl) {
  const n = isl.nx * isl.ny * isl.nz, out = new Uint8Array(26 + n * 2), dv = new DataView(out.buffer);
  dv.setUint16(0, id, true);
  dv.setUint16(2, isl.minX, true); dv.setUint16(4, isl.minY, true); dv.setUint16(6, isl.minZ, true);
  dv.setUint16(8, isl.nx, true); dv.setUint16(10, isl.ny, true); dv.setUint16(12, isl.nz, true);
  dv.setFloat32(14, isl.com[0], true); dv.setFloat32(18, isl.com[1], true); dv.setFloat32(22, isl.com[2], true);
  out.set(isl.mats, 26); out.set(isl.dmgs, 26 + n);
  return out;
}
export function decodeBodySpawn(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const nx = dv.getUint16(8, true), ny = dv.getUint16(10, true), nz = dv.getUint16(12, true), n = nx * ny * nz;
  return { id: dv.getUint16(0, true), minX: dv.getUint16(2, true), minY: dv.getUint16(4, true), minZ: dv.getUint16(6, true), nx, ny, nz,
    com: [dv.getFloat32(14, true), dv.getFloat32(18, true), dv.getFloat32(22, true)], mats: u8.subarray(26, 26 + n), dmgs: u8.subarray(26 + n, 26 + 2 * n) };
}
// 30 Hz konum + donus: [U_BODY][n u8] n x { id u16, x y z i16 (cm), qx qy qz qw i16 (/32767) }
export function encodeBodies(list) {
  const n = Math.min(120, list.length), buf = new ArrayBuffer(2 + n * 16), dv = new DataView(buf);
  dv.setUint8(0, U_BODY); dv.setUint8(1, n);
  for (let i = 0; i < n; i++) {
    const b = list[i], o = 2 + i * 16;
    dv.setUint16(o, b.id, true); dv.setInt16(o + 2, q16(b.x, 100), true); dv.setInt16(o + 4, q16(b.y, 100), true); dv.setInt16(o + 6, q16(b.z, 100), true);
    dv.setInt16(o + 8, q16(b.qx, 32767), true); dv.setInt16(o + 10, q16(b.qy, 32767), true); dv.setInt16(o + 12, q16(b.qz, 32767), true); dv.setInt16(o + 14, q16(b.qw, 32767), true);
  }
  return buf;
}
export function decodeBodies(buf) {
  const dv = new DataView(buf), n = dv.getUint8(1), out = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * 16;
    out.push({ id: dv.getUint16(o, true), x: dv.getInt16(o + 2, true) / 100, y: dv.getInt16(o + 4, true) / 100, z: dv.getInt16(o + 6, true) / 100,
      qx: dv.getInt16(o + 8, true) / 32767, qy: dv.getInt16(o + 10, true) / 32767, qz: dv.getInt16(o + 12, true) / 32767, qw: dv.getInt16(o + 14, true) / 32767 });
  }
  return out;
}
