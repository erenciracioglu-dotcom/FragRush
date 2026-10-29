// Asama 0 olcumu: yapay agda (netsim) konugun kendi hareketi. Ev sahibi yetkili Mover; konuk Predictor.
// Komutlar konuktan ev sahibine (gecikme/2 + oynama, kayip %, her pakette son 3 komut), anlik goruntu 30 Hz geri gelir.
// Olcut: duzeltme sayisi ve buyuklugu. usage: node test/net.predict.mjs [gecikmeMs=150] [oynamaMs=20] [kayip%=2]
import { WORLD, VS, setPhysics, GRAVITY0 } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { LEVELS } from '../src/world/levels.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { Predictor } from '../src/net/prediction.js';

const RTT = Number(process.argv[2] ?? 150) / 1000, JIT = Number(process.argv[3] ?? 20) / 1000, LOSS = Number(process.argv[4] ?? 2) / 100;

// deterministik rastgele (testin kendisi icin; oyun kodunda Math.random yok)
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

function scenario(name, map, mk) {
  const world = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const arena = LEVELS[map].generate(world, 777);
  setPhysics(arena.gravity, arena.move);
  world.ceilY = arena.ceilY ?? Infinity; world.waterY = arena.water ? arena.water.y : -Infinity;
  const host = new Mover(world), guestM = new Mover(world);
  const sp = arena.spawns[0];
  host.reset(sp.x, sp.y + 0.02, sp.z); guestM.reset(sp.x, sp.y + 0.02, sp.z);
  const pred = new Predictor(guestM);
  const R = rng(99);
  const up = [], down = [];           // {at, data}
  let acked = 0, hostLast = null, hostSeq = 0;
  const seen = new Set();
  const dt = 1 / 60, T = 12;
  const hostBuf = [];                 // ev sahibinin henuz islemedigi komutlar
  let nextSnap = 0, ext = mk.external || [], extIdx = 0, extErrs = [];
  let pos0 = null;

  for (let f = 0, t = 0; t < T; f++, t = f * dt) {
    // --- konuk karesi
    const cmd = mk.cmd(t, f);
    const sent = pred.step(dt, cmd);
    if (pos0 === null) pos0 = true;
    // son 3 komut yedek
    const pk = pred.pending.slice(-3).map((e) => ({ seq: e.seq, dt: e.dt, cmd: e.cmd }));
    if (R() >= LOSS) up.push({ at: t + RTT / 2 + (R() - 0.5) * JIT * 2, pk });
    // --- ev sahibi: gelen paketler
    up.sort((a, b) => a.at - b.at);
    while (up.length && up[0].at <= t) {
      const u = up.shift();
      for (const e of u.pk) if (e.seq > hostSeq && !seen.has(e.seq)) { seen.add(e.seq); hostBuf.push(e); }
    }
    hostBuf.sort((a, b) => a.seq - b.seq);
    while (hostBuf.length) {
      const e = hostBuf[0];
      if (e.seq > hostSeq + 1) break;           // bosluk: bekle (yedek komutlar doldurur)
      hostBuf.shift();
      if (e.seq <= hostSeq) continue;
      host.simulate(e.dt, e.cmd); hostSeq = e.seq; hostLast = e;
    }
    // dis kuvvetler (patlama itmesi, ped): yalniz ev sahibinde uygulanir, konuga snapshot ile gelir
    while (extIdx < ext.length && ext[extIdx].t <= t) { ext[extIdx].fn(host); extIdx++; extErrs.push(t); }
    // anlik goruntu 30 Hz
    if (t >= nextSnap) {
      nextSnap += 1 / 30;
      if (R() >= LOSS) down.push({ at: t + RTT / 2 + (R() - 0.5) * JIT * 2, state: host.getState(), ack: hostSeq });
    }
    down.sort((a, b) => a.at - b.at);
    let lastDown = null;
    while (down.length && down[0].at <= t) lastDown = down.shift();   // en yenisi (sirasiz gelenler elenir)
    if (lastDown && lastDown.ack >= acked) { acked = lastDown.ack; pred.reconcile(lastDown.state, lastDown.ack); }
    pred.decay(dt);
  }
  const s = pred.stats;
  const gp = guestM.pos, hp = host.pos;
  console.log(`${name.padEnd(34)} duzeltme ${String(s.corrections).padStart(3)}/${s.n} (kucuk ${s.small}, >25cm ${s.big}, isinlanma ${s.snaps})  en buyuk ${(s.maxErr * 100).toFixed(1)} cm  ort ${(s.sumErr / Math.max(1, s.n) * 100).toFixed(2)} cm  son fark ${(Math.hypot(gp.x - hp.x, gp.y - hp.y, gp.z - hp.z) * 100).toFixed(1)} cm  dis olay ${extErrs.length}`);
  return s;
}

const run = (t, yaw0 = 0) => ({ fwd: 1, side: 0, yaw: yaw0 + Math.sin(t * 0.7) * 0.6, pitch: 0, jump: false, crouch: false, dash: false });
const bhop = (t) => ({ fwd: 1, side: Math.floor(t * 1.6) % 2 ? 1 : -1, yaw: Math.sin(t * 0.9) * 1.2, pitch: 0, jump: true, crouch: false, dash: false });
const slide = (t) => ({ fwd: 1, side: 0, yaw: 0.4, pitch: 0, jump: false, crouch: t > 1 && Math.floor(t) % 3 === 1, dash: Math.floor(t * 2) % 5 === 0 && (t * 2) % 1 < 0.02 });

console.log(`Ag: gidis-donus ${RTT * 1000} ms, oynama +-${JIT * 1000} ms, kayip %${LOSS * 100}`);
scenario('duz kosu (arena)', 'arena', { cmd: (t) => run(t) });
scenario('tavsan ziplamasi (arena)', 'arena', { cmd: (t) => bhop(t) });
scenario('roket ziplamasi (arena)', 'arena', { cmd: (t) => run(t), external: [1.0, 3.5, 6.0, 8.5].map((t) => ({ t, fn: (m) => m.impulse(3, 9, 2) })) });
scenario('egilme/kayma/atilma (arena)', 'arena', { cmd: (t) => slide(t) });
scenario('ziplama pedi (arena)', 'arena', { cmd: (t) => run(t), external: [1.5, 5].map((t) => ({ t, fn: (m) => { const pd = { x: 0, y: 0, z: 0, tx: m.pos.x + 8, ty: m.pos.y, tz: m.pos.z + 3, apex: 3 }; pd.y = m.pos.y; padLaunchVelocity(pd, m.vel); m.onGround = false; m.groundTime = 1; m.padLock = 0.5; } })) });
scenario('buz golu: kayma (frozen)', 'frozen', { cmd: (t) => bhop(t) });
scenario('ay yercekimi (moon)', 'moon', { cmd: (t) => bhop(t) });
scenario('trambolin / zipla (toyroom)', 'toyroom', { cmd: (t) => bhop(t) });
setPhysics(GRAVITY0, null);
