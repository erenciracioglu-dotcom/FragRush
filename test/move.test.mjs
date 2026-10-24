// Hareket fizigi testi (tarayicisiz): kosu hizi, ziplama, merdiven, sarmal merdiven, atilma, kayma
import { WORLD, VS, FLOOR_Y, MOVE } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateArena } from '../src/world/mapgen.js';
import { Mover } from '../src/game/mover.js';

const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
generateArena(w, 4242);
const dt = 1 / 250;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, jump: false, crouch: false, dash: false, ...o });
function run(m, secs, c, every = null) { const n = Math.round(secs / dt); let maxY = -1e9; for (let i = 0; i < n; i++) { m.simulate(dt, typeof c === 'function' ? c(i * dt) : c); maxY = Math.max(maxY, m.pos.y); if (every) every(i * dt, m); } return maxY; }
const F = FLOOR_Y * VS;
// acik alan bul: kule ile kale arasi kopru alti degil, pedler disinda
function place(m, x, z, y = F + 0.02) { let k = 0; while (m.collides(x, y, z) && k++ < 40) y += VS; m.reset(x, y, z); run(m, 0.5, cmd()); return m.pos.y; }

let m = new Mover(w);
// 1) kosu hizi (dogu-bati kosusu, x yonunde): kule cevresi acik alan
const y0 = place(m, 36 + 9.5, 36 - 12);
let vmax = 0; run(m, 1.0, cmd({ fwd: 1, yaw: Math.PI }), (t, mm) => { vmax = Math.max(vmax, Math.hypot(mm.vel.x, mm.vel.z)); });
console.log('azami kosu hizi', vmax.toFixed(2));
console.log('zemin y', y0.toFixed(3), 'beklenen', F, ' kosu hizi', Math.hypot(m.vel.x, m.vel.z).toFixed(2), 'beklenen ~', MOVE.runSpeed, 'konum', m.pos.x.toFixed(2), m.pos.z.toFixed(2));
// 2) ziplama yuksekligi
place(m, 36 + 9.5, 36 - 12);
const base = m.pos.y;
const top = run(m, 1.2, (t) => cmd({ jump: t < 0.05 }));
console.log('ziplama yuksekligi', (top - base).toFixed(3), 'beklenen', (MOVE.jumpVel ** 2 / (2 * 22)).toFixed(3));
// 3) kale merdiveni (rot 0): x 114.. (u=-30), z 241..246, +x yonunde
const sx = 114 * VS + 0.36, sz = 243.5 * VS;
place(m, sx, sz, F + VS + 0.02);
const yb = m.pos.y;
let stuck = 0, last = m.pos.x;
run(m, 3, cmd({ fwd: 1, yaw: -Math.PI / 2 }), (t, mm) => { if (Math.abs(mm.pos.x - last) < 1e-5) stuck++; last = mm.pos.x; });
console.log('kale merdiveni: baslangic y', yb.toFixed(2), 'son y', m.pos.y.toFixed(2), 'beklenen ust kat', (FLOOR_Y + 22) * VS, 'son x', m.pos.x.toFixed(2), 'takilma kare', stuck);
// 4) sarmal merdiven: kule merkezi (36,36), egriye teget yuru
place(m, 36 - 1.6, 36 - 0.8, F + VS + 0.02);
const ys = m.pos.y;
let maxH = -1;
run(m, 6, (t) => {
  const p = m.pos; const ang = Math.atan2(p.z - 36, p.x - 36);
  const rad = Math.hypot(p.z - 36, p.x - 36);
  // saat yonunun tersine (aci artar) teget yon + yaricap duzeltmesi (1.5 m)
  let tx = -Math.sin(ang), tz = Math.cos(ang);
  const corr = (1.5 - rad) * 2;
  tx += Math.cos(ang) * corr; tz += Math.sin(ang) * corr;
  // yaw: ileri = (-sin yaw, -cos yaw)
  const yaw = Math.atan2(-tx, -tz);
  // yaricapi koru
  return cmd({ fwd: 1, yaw });
}, (t, mm) => { maxH = Math.max(maxH, mm.pos.y); });
console.log('sarmal: baslangic', ys.toFixed(2), 'azami y', maxH.toFixed(2), 'hedef', (FLOOR_Y + 22) * VS, 'son', m.pos.x.toFixed(2), m.pos.y.toFixed(2), m.pos.z.toFixed(2));
// 5) atilma
place(m, 36 + 9.5, 36 - 12);
run(m, 0.02, cmd({ dash: true, fwd: 1, yaw: Math.PI }));
console.log('atilma hizi', Math.hypot(m.vel.x, m.vel.z).toFixed(2));
// 6) kayma
place(m, 36 + 9.5, 36 - 18);
run(m, 1.0, cmd({ fwd: 1, yaw: Math.PI }));
run(m, 0.05, cmd({ fwd: 1, yaw: Math.PI, crouch: true }));
const s0 = Math.hypot(m.vel.x, m.vel.z);
run(m, 0.5, cmd({ fwd: 1, yaw: Math.PI, crouch: true }));
console.log('kayma: baslangic hiz', s0.toFixed(2), '0.5sn sonra', Math.hypot(m.vel.x, m.vel.z).toFixed(2), 'egik', m.crouching);
// 7) tavsan ziplamasi + yan tus (strafe jump) hiz kazanci
place(m, 27, 45, F + 0.02);
run(m, 0.6, cmd({ fwd: 1, yaw: Math.PI }));
let yaw = Math.PI;
run(m, 3, (t) => { yaw += 0.6 * dt * (Math.floor(t / 0.65) % 2 ? -1 : 1); return cmd({ fwd: 1, side: Math.floor(t / 0.65) % 2 ? -1 : 1, yaw, jump: true }); });
console.log('strafe-jump 3sn sonra hiz', Math.hypot(m.vel.x, m.vel.z).toFixed(2));
