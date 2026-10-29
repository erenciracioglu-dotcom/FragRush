// Kenara tirmanma testi (tarayicisiz): Bosluk + ileri ile 1.8 m'ye kadar kenar, daha yuksek duvar degil, krater cikisi,
// Bosluk basili degilken eski davranis (basamak 0.62 m), ayni girdiyle iki Mover ayni sonucu verir (ag tahmini icin).
import { WORLD, VS, FLOOR_Y, MOVE } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { Mover } from '../src/game/mover.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const dt = 1 / 250, F = FLOOR_Y * VS;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, jump: false, crouch: false, dash: false, ...o });

function flat() {
  const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  for (let y = 0; y < FLOOR_Y; y++) for (let z = 60; z < 200; z++) for (let x = 60; x < 200; x++) w.set(x, y, z, 2);
  return w;
}
function run(m, secs, c) { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) m.simulate(dt, typeof c === 'function' ? c(i * dt) : c); }

// duvar: z = 100..103 voxel, yuksekligi H metre; oyuncu z=110'dan -z yonune (yaw 0) kosar
function wallTest(H, jump, crouchless = true) {
  const w = flat();
  const vh = Math.round(H / VS);
  for (let y = FLOOR_Y; y < FLOOR_Y + vh; y++) for (let z = 100; z < 112; z++) for (let x = 90; x < 130; x++) w.set(x, y, z, 2);
  const m = new Mover(w);
  m.reset(110 * VS, F + 0.02, 118 * VS);
  run(m, 0.3, cmd());
  let top = false, maxY = 0, minZ = 1e9;
  for (let i = 0; i < 3 * 250 && !top; i++) {
    m.simulate(dt, cmd({ fwd: 1, jump }));
    const zv = m.pos.z / VS; minZ = Math.min(minZ, zv); maxY = Math.max(maxY, m.pos.y - F);
    if (m.onGround && zv >= 100 && zv < 112 && m.pos.y - F >= H - 0.05) top = true;
  }
  return { top, y: maxY, z: minZ };
}
for (const H of [0.5, 1.0, 1.4, 1.8]) {
  const r = wallTest(H, true);
  ok(r.top, `Bosluk + ileri: ${H} m duvarin ustune cikti (en yuksek +${r.y.toFixed(2)})`);
}
{
  const r = wallTest(2.4, true);
  ok(!r.top && r.y < 1.5, `2.4 m duvara cikamaz (en yuksek +${r.y.toFixed(2)})`);
}
{
  const r = wallTest(1.4, false);
  ok(!r.top, `Bosluk basili degilken 1.4 m duvar asilmaz (en yuksek +${r.y.toFixed(2)})`);
  const r2 = wallTest(0.5, false);
  ok(r2.top, `Bosluk basili degilken 0.5 m basamak eskisi gibi cikilir (en yuksek +${r2.y.toFixed(2)})`);
}
// krater: yari kure yaricap 4.5 m, derinlik 3 m; dipten +x yonune Bosluk + ileri
for (const depth of [3.0, 4.0]) {
  const w = flat();
  const cx = 130, cz = 130, R = 4.5 / VS;
  for (let y = FLOOR_Y - Math.ceil(depth / VS); y < FLOOR_Y; y++) for (let z = cz - 30; z <= cz + 30; z++) for (let x = cx - 30; x <= cx + 30; x++) {
    const dx = (x - cx) * VS, dz = (z - cz) * VS, u = (FLOOR_Y - y) * VS;           // u: yuzeyin altindaki derinlik (0..depth)
    const rr = 1.2 + 3.3 * Math.sqrt(Math.max(0, 1 - (u / depth) ** 2));                    // kase: yuzeyde 4.5 m yaricap, dipte 0
    if (u < depth && Math.hypot(dx, dz) < rr) w.set(x, y, z, 0);
  }
  const m = new Mover(w);
  m.reset(cx * VS, F - depth + 0.3, cz * VS);
  run(m, 0.5, cmd());
  const y0 = m.pos.y;
  let t = 0, out = false;
  // +x: yaw -90 derece. Yonu koruyarak Bosluk + ileri
  for (; t < 8 && !out; t += dt) { m.simulate(dt, cmd({ fwd: 1, jump: true, yaw: -Math.PI / 2 })); if (m.pos.y > F - 0.1 && m.onGround) out = true; }
  ok(out, `krater dibinden (${(F - y0).toFixed(1)} m derin) Bosluk + ileri ile cikildi (${t.toFixed(1)} sn, x ${(m.pos.x / VS).toFixed(0)}, y +${(m.pos.y - F).toFixed(2)})`);
  // eski davranis: Bosluk basili degil, yalniz ileri
  const m2 = new Mover(w); m2.reset(cx * VS, F - depth + 0.3, cz * VS); run(m2, 0.5, cmd());
  let out2 = false; for (let tt = 0; tt < 8 && !out2; tt += dt) { m2.simulate(dt, cmd({ fwd: 1, yaw: -Math.PI / 2 })); if (m2.pos.y > F - 0.1 && m2.onGround) out2 = true; }
  console.log('bilgi: yalniz ileri (Bosluk yok) ile cikis ' + (out2 ? 'oldu' : 'olmadi'));
}
// deterministik: ayni girdi, iki Mover (ag tahmini ve yeniden oynatma icin)
{
  const w = flat();
  for (let y = FLOOR_Y; y < FLOOR_Y + 6; y++) for (let z = 100; z < 104; z++) for (let x = 90; x < 130; x++) w.set(x, y, z, 2);
  const a = new Mover(w), b = new Mover(w);
  a.reset(110 * VS, F + 0.02, 108 * VS); b.reset(110 * VS, F + 0.02, 108 * VS);
  for (let i = 0; i < 600; i++) { const c = cmd({ fwd: 1, jump: true, yaw: 0.01 * Math.sin(i / 50) }); a.simulate(1 / 60, c); b.simulate(1 / 60, c); }
  const sa = new Float64Array(Mover.STATE_LEN), sb = new Float64Array(Mover.STATE_LEN); a.getState(sa); b.getState(sb);
  ok(sa.every((v, i) => v === sb[i]), 'ayni girdiyle iki Mover birebir ayni durumda (tirmanma dahil)');
  const c = new Mover(w); c.reset(0, 0, 0); c.setState(sa); const sc = new Float64Array(Mover.STATE_LEN); c.getState(sc);
  ok(sa.every((v, i) => v === sc[i]), 'durum kaydet / yukle gidis-donus');
}
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
