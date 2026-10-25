// Su fizigi testi (tarayicisiz): derede yavaslama, golde batma / yuzeyde kalma / dalis, kiyiya cikis.
import { WORLD, VS, MOVE, WATER } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateMeadow, MEADOW_WATER_Y } from '../src/world/meadow.js';
import { Mover } from '../src/game/mover.js';

const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateMeadow(w, 777);
w.waterY = info.water.y;
const WY = w.waterY;
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
const run = (m, secs, c, each) => { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { m.simulate(dt, typeof c === 'function' ? c(i * dt, m) : c); if (each) each(i * dt, m); } };
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

// en derin gol noktasi ve dere yatagi
let deep = null, dd = 0, creek = null;
for (let z = 20; z < w.sz - 20; z++) for (let x = 20; x < w.sx - 20; x++) {
  let y = MEADOW_WATER_Y; while (y > 1 && !w.mat[w.idx(x, y - 1, z)]) y--;
  const depth = (MEADOW_WATER_Y - y) * VS;
  // ustu acik olsun (kopru/iskele altinda olmasin)
  let open = true; for (let k = MEADOW_WATER_Y; k < 90 && open; k++) if (w.mat[w.idx(x, k, z)]) open = false;
  if (!open) continue;
  if (depth > dd) { dd = depth; deep = [x, z, y]; }
  if (!creek && Math.abs(depth - 0.5) < 1e-6 && x > 60 && x < 100 && z > 120 && z < 160) creek = [x, z, y];
}
console.log('en derin nokta', deep, 'derinlik', dd.toFixed(2), 'm; dere', creek);

const m = new Mover(w);
// 1) siglikta yurume hizi: duz bir deneme dunyasinda suyu yapay olarak yukselt
{
  const flat = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  for (let y = 0; y < 20; y++) for (let z = 0; z < flat.sz; z++) { const o = flat.sx * (z + flat.sz * y); flat.mat.fill(26, o, o + flat.sx); }
  const fm = new Mover(flat);
  const speedAt = (depth) => {
    flat.waterY = depth > 0 ? 20 * VS + depth : -Infinity;
    fm.reset(36, 20 * VS + 0.01, 10);
    let v = 0; run(fm, 1.2, cmd({ fwd: 1, yaw: Math.PI }), (t, mm) => { v = Math.max(v, Math.hypot(mm.vel.x, mm.vel.z)); });
    return v;
  };
  const dry = speedAt(0), wet = speedAt(0.5), deeper = speedAt(0.9);
  check('kuruda kosu hizi', Math.abs(dry - MOVE.runSpeed) < 0.3, `${dry.toFixed(2)} m/s`);
  check('0.5 m suda (dere) yavas', wet < MOVE.runSpeed * 0.7 && wet > 3.5, `${wet.toFixed(2)} m/s`);
  check('0.9 m suda daha yavas', deeper < wet, `${deeper.toFixed(2)} m/s`);
}
const m2 = m;
m.reset((creek[0] + 0.5) * VS, creek[2] * VS + 0.01, (creek[1] + 0.5) * VS);
run(m, 0.3, cmd());
check('derede: ayak suda, yuzmuyor, gozler disarida', m.inWater && !m.swimming && !m.eyesUnder, `derinlik ${m.waterDepth.toFixed(2)}`);
m.crouching = false;
run(m, 0.3, cmd({ crouch: true }));
check('derede egilince de gozler disarida', !m.eyesUnder, `goz ${(m.pos.y + m.eyeHeight - WY).toFixed(2)} m ustte`);

// 2) golde: yuzeye birak, tus yokken batar
const gx = (deep[0] + 0.5) * VS, gz = (deep[1] + 0.5) * VS;
m.reset(gx, WY - 1.4, gz);
run(m, 0.2, cmd());
check('golde yuzuyor', m.swimming);
const y0 = m.pos.y;
run(m, 2.0, cmd());
const sink = (y0 - m.pos.y) / 2.0;
check('tus yokken yavasca batar', sink > 0.1 && sink < 0.9, `${sink.toFixed(2)} m/s`);
check('bir sure sonra gozler su altinda', m.eyesUnder);

// 3) Bosluk: yuzeye cikar ve basi suyun ustunde kalir
let tUp = -1;
run(m, 5, cmd({ jump: true }), (t, mm) => { if (tUp < 0 && !mm.eyesUnder) tUp = t; });
const eyeAbove = m.pos.y + m.eyeHeight - WY;
check('Bosluk ile yuzeye cikar', tUp >= 0, `${tUp.toFixed(2)} s`);
check('yuzeyde gozler suyun ustunde', eyeAbove > 0.05 && eyeAbove < 0.4 && m.swimming, `goz ${eyeAbove.toFixed(2)} m ustte`);
// dalgalanma: Bosluk basiliyken gozler hep ustte mi
let under = 0; run(m, 3, cmd({ jump: true }), (t, mm) => { if (mm.eyesUnder) under++; });
check('Bosluk basiliyken gozler suya girmiyor', under === 0, `${under} kare`);

// 4) C ile dalis dibe iner
run(m, 3, cmd({ crouch: true }));
const bed = deep[2] * VS;
check('C ile dibe dalar', m.pos.y - bed < 0.3, `ayak ${m.pos.y.toFixed(2)}, dip ${bed.toFixed(2)}`);

// 5) bakis yonunde yuzme hizi
m.reset(gx, WY - 1.4, gz);
let sw = 0;
run(m, 2, cmd({ fwd: 1, jump: true, yaw: 0 }), (t, mm) => { if (mm.swimming) sw = Math.max(sw, Math.hypot(mm.vel.x, mm.vel.z)); });
check('yuzme hizi kosudan yavas', sw > 3 && sw <= WATER.swimSpeed + 0.1, `${sw.toFixed(2)} m/s`);

// 6) yuksekten suya dusus: cabuk yavaslar, dibe carpmadan duzelir
m.reset(gx, WY + 7, gz);
let minY = 1e9, splash = 0;
run(m, 3, cmd({ jump: true }), (t, mm) => { minY = Math.min(minY, mm.pos.y); if (mm.events.splash) splash = mm.events.splash; });
check('suya dusunce sicrama olayi', splash > 5, `hiz ${splash.toFixed(1)}`);
check('dalis derinligi sinirli', WY - minY < 3.6, `${(WY - minY).toFixed(2)} m`);

// 7) kiyiya yuzup cikabilme: dort yonde de kiyiya ulas ve suyun disina cik
let outN = 0;
for (let k = 0; k < 8; k++) {
  const yaw = k / 8 * Math.PI * 2;
  m.reset(gx, WY - 1.4, gz);
  let out = false;
  run(m, 14, (t, mm) => cmd({ fwd: 1, jump: true, yaw }), (t, mm) => { if (!mm.inWater && mm.pos.y >= WY) out = true; });
  if (out) outN++;
  else console.log('   yon', (yaw * 180 / Math.PI).toFixed(0), 'cikamadi: konum', m.pos.x.toFixed(1), m.pos.y.toFixed(2), m.pos.z.toFixed(1));
}
check('golden kiyiya cikis (8 yon)', outN >= 6, `${outN}/8`);
console.log(fails ? `${fails} HATA` : 'tum su testleri gecti');
process.exitCode = fails ? 1 : 0;
