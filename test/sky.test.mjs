// Gok Adalari testi (tarayicisiz):
//  - harita: uretim suresi, 24 m'ye sigma, malzeme kimlikleri, KIYAMET kulede, dogma noktalari / ogeler / isiklar / pedler
//  - baglama: baslangicta hicbir ada dusmez (her voxel tohum olsa da); ada kenarindan kopan parca yine duser; ada < 160 bin
//  - gezinme: dogma noktalari agda ve birbirine bagli (kopru, kemer, pedler); pedler hedefe iner
//  - kurallar (fx/sky-islands.js, sahte oyun nesnesiyle): kristal hasari (roket / mermi / uzak), %75/%50/%25 kademeleri,
//    kirilinca 2.5 sn uyari, ada duser, ustundeki ADA parcalamasiyla olur (kirana), itilen BULUT (vurana), kendi dusen
//    -1, kendi adasini dusuren -1; 45 sn sonra ada anlik goruntuyle aynen doner, gezinme dugumleri geri gelir; dusen
//    adanin dogma noktalari / pedleri / ogeleri kapanir, donunce acilir; konuk kopyasi netState + olaylarla ayni evrede
//  - yenilenme: roket / KIYAMET cukuru ve neredeyse silinen ada kenarindan (cekirdek tabanindan) geri buyur, cukurdaki
//    aktor yukari itilir, basamak tasi da buyur, dusen adada buyume yok, mac basi her sey tam; KIYAMET burada 2 kat oyar
// usage: node test/sky.test.mjs [seed]
import * as THREE from 'three';
import { WORLD, VS, setPhysics } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateSky, CLOUD_Y, KILL_Y } from '../src/world/sky.js';
import { M, MAT_COUNT } from '../src/world/materials.js';
import { NavGrid } from '../src/game/nav.js';
import { Destruction } from '../src/game/destruction.js';
import { Actor } from '../src/game/actor.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { SkySystem, PH, SKY_RULES } from '../src/fx/sky-islands.js';

const seed = Number(process.argv[2] || 777);
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
setPhysics();

// ---------------------------------------------------------------- harita
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
let T0 = performance.now();
const info = generateSky(w, seed);
const tGen = performance.now() - T0;
let solid = 0, maxMat = 0, topY = 0;
for (let i = 0; i < w.mat.length; i++) { const m = w.mat[i]; if (!m) continue; solid++; if (m > maxMat) maxMat = m; const y = (i / w.sxz) | 0; if (y > topY) topY = y; }
check('uretim hizli', tGen < 1500, tGen.toFixed(0) + ' ms, ' + solid + ' voxel');
check('malzeme kimlikleri MAT_COUNT altinda', maxMat < MAT_COUNT && MAT_COUNT === 125, 'en buyuk ' + maxMat + ', MAT_COUNT ' + MAT_COUNT);
check('harita 24 m yukseklige sigar', topY < WORLD.Y, 'en yuksek y ' + topY + ' (' + (topY * VS).toFixed(2) + ' m)');
check('ortam ve KIYAMET', info.env === 'sky' && info.quadWhere === 'quadWhereSky' && info.items.some((i) => i.type === 'quad' && i.y > 19), JSON.stringify(info.items.find((i) => i.type === 'quad')));
check('16 dogma noktasi, hepsi bir adada', info.spawns.length === 16 && info.spawns.every((s) => s.isle >= 0), info.spawns.length + ' / ' + info.spawns.map((s) => s.isle).join(''));
check('isiklar <= 10, ilk 6 kristal', info.lights.length <= 10 && info.lights.length >= 6, info.lights.length + '');
check('7 ped, 14 oge', info.pads.length === 7 && info.items.length === 14, info.pads.length + ' / ' + info.items.length);
check('6 ada, bulut denizi ve olum cizgisi', info.sky.isles.length === 6 && CLOUD_Y > KILL_Y && info.sky.isles.every((d) => d.crystal.y0 > CLOUD_Y), info.sky.isles.map((d) => d.crystal.y0.toFixed(2)).join(' '));
const standOk = (p) => { const x = Math.floor(p.x / VS), y = Math.round(p.y / VS), z = Math.floor(p.z / VS); if (!w.get(x, y - 1, z)) return false; for (let k = 0; k < 7; k++) if (w.get(x, y + k, z)) return false; return true; };
check('dogma noktalari ve ogeler zeminde, ustu bos', info.spawns.every(standOk) && info.items.every(standOk));

// ---------------------------------------------------------------- sahte oyun + sistem
const events = [], kills = [];
const stub = () => {};
const fx = { pm: 1, dm: 1, shake: 0, impact: stub, voxelDebris: stub, dustPuff: stub, addShake: stub, robotGib: stub, smoke: { emit: stub }, add: { emit: stub }, debris: { spawn: stub }, glowDebris: { spawn: stub }, lights: { flash: stub } };
const makeGame = (world, arena) => {
  const g = { world, scene: new THREE.Scene(), voxelMaterial: new THREE.MeshBasicMaterial(), workers: { workers: [] }, fx, audio: null, hud: null, actors: [], time: 0, frame: 0,
    arena, state: 'playing', auth: true, net: null, center: new THREE.Vector3(36, 0, 36), logEvent: stub, onDamage: stub,
    netEmit(s, e) { if (s === 'skySys') events.push(JSON.parse(JSON.stringify(e))); },
    onKill(v, k, wid) { kills.push({ v: v.name, k: k ? k.name : null, w: wid }); if (k && k !== v) k.frags++; else v.frags--; } };
  g.destruction = new Destruction(g);
  g.nav = new NavGrid(world);
  return g;
};
const game = makeGame(w, info);
const sys = game.skySys = new SkySystem(game);
T0 = performance.now(); sys.setup(info); const tSetup = performance.now() - T0;
game.nav.buildAll();
for (const p of info.pads) game.nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
game.items = { list: info.items.map((d) => ({ type: d.type, pos: new THREE.Vector3(d.x, d.y, d.z), home: new THREE.Vector3(d.x, d.y, d.z), active: true, timer: 0, mesh: { visible: true }, hidden: false, fallV: 0 })) };
const counts = sys.isles.map((s) => s.snap.count);
check('ada voxel sayilari 160 bin altinda, ana ada 40-100 bin', counts.every((n) => n > 4000 && n < 160000) && counts[0] > 40000 && counts[0] < 100000, counts.join(' ') + ', kurulum ' + tSetup.toFixed(0) + ' ms');

// ---------------------------------------------------------------- baglama: baslangicta hicbir ada dusmez
{
  for (const d of info.sky.isles) { const b = d.box; w.seedRegion(b[0], Math.max(1, d.y0), b[1], b[2] - 1, w.sy - 1, b[3] - 1); }
  for (const r of info.sky.rocks) w.seedRegion(r.x0, r.lo - 2, r.z0, r.x1 - 1, r.hi + 1, r.z1 - 1);
  const n = w.seedCount;
  T0 = performance.now(); const isl = w.findIslands(); const tf = performance.now() - T0;
  check('baslangicta hicbir ada / tas / kopru kopmaz', isl.length === 0, n + ' tohum, ' + isl.length + ' kopan, ' + tf.toFixed(0) + ' ms');
}
// ---------------------------------------------------------------- ada kenarindan kopan parca duser (ayri dunya)
{
  const w2 = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const i2 = generateSky(w2, seed), g2 = makeGame(w2, i2), s2 = new SkySystem(g2);
  s2.setup(i2);
  const cut = [];
  for (let y = 18; y < 46; y++) for (let z = 18; z < 66; z++) for (let x = 163; x < 165; x++) { const i = w2.idx(x, y, z); if (w2.mat[i]) cut.push(i); }
  w2.removeIndices(cut); w2.seedRegion(161, 18, 18, 166, 46, 66);
  const isl = w2.findIslands();
  let n = 0, east = true;
  for (const L of isl) for (const i of L) { n++; const rem = i % w2.sxz, x = rem % w2.sx; if (x < 165) east = false; }
  check('ada kenarindan kesilen serit kopar (yalniz kesigin disi)', isl.length >= 1 && n > 50 && east, isl.length + ' parca, ' + n + ' voxel');
  s2.disable();
  check('sistem kapaninca baglama kalkar', w2.anchorLo === null);
}
// ---------------------------------------------------------------- gezinme: dogma noktalari agda ve birbirine bagli
{
  const nav = game.nav, ids = info.spawns.map((s) => nav.nearest(s.x, s.y + 0.2, s.z));
  check('her dogma noktasinin yakininda gezinme dugumu', ids.every((id) => id >= 0), ids.filter((id) => id < 0).length + ' eksik');
  const bad = [];
  for (let k = 1; k < ids.length; k++) { const p = nav.findPath(ids[0], ids[k], 30000), q = nav.findPath(ids[k], ids[0], 30000); if (!p || p.partial || !q || q.partial) bad.push(k + ':' + info.spawns[k].isle); }
  check('dogma noktalari gidis-donus bagli (kopru / kemer / ped)', bad.length === 0, bad.join(' '));
}
// ---------------------------------------------------------------- pedler hedefe iner (dekor ucus koridorunu kesmez)
{
  const res = [];
  for (const p of info.pads) {
    const m = new Mover(w);
    m.reset(p.x, p.y + 0.02, p.z);
    padLaunchVelocity(p, m.vel); m.onGround = false; m.groundTime = 1; m.padLock = 0.5;
    let land = null;
    for (let k = 0; k < 600 && !land; k++) { m.simulate(1 / 120, cmd()); if (m.onGround && k > 10) land = m.pos.clone(); if (m.pos.y < 0) break; }
    const d = land ? Math.hypot(land.x - p.tx, land.z - p.tz) : 99;
    res.push(d.toFixed(1) + (land ? '@' + (land.y - p.ty).toFixed(1) : '!'));
    p._ok = land && d < 2.2 && Math.abs(land.y - p.ty) < 0.7;
  }
  check('7 ped de hedefine iner', info.pads.every((p) => p._ok), res.join(' '));
}

// ---------------------------------------------------------------- kurallar: kristal, uyari, dusus, parcalama, donus (+ konuk kopyasi)
const wG = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z), infoG = generateSky(wG, seed), gG = makeGame(wG, infoG);
gG.auth = false; gG.net = { role: 'guest', hostNow: () => game.time };
const sG = new SkySystem(gG); sG.setup(infoG);
const actor = (id, name, isle) => { const a = new Actor(game, id, name, 0xffffff, false); a.spawn(info.spawns.find((s) => s.isle === isle)); game.actors.push(a); return a; };
let maxStep = 0, ev0 = 0;
const step = (sec, f = null) => {
  for (let k = 0; k < Math.round(sec * 60); k++) {
    const dt = 1 / 60, t1 = performance.now();
    game.time += dt; game.frame++;
    sys.update(dt, null); game.destruction.update(dt); game.nav.update();
    for (const a of game.actors) if (a.alive) { a.tickStats(dt); a.mover.simulate(dt, cmd()); sys.actorTick(a); }
    maxStep = Math.max(maxStep, performance.now() - t1);
    while (ev0 < events.length) sG.onNetEvent(events[ev0++]);
    if (game.frame % 6 === 0) sG.applyNetState(sys.netState());
    gG.time += dt; sG.update(dt, null);
    if (f && f()) return true;
  }
  return false;
};
const navNodes = (b) => { let n = 0; const nav = game.nav; for (let cz = Math.floor(b[1] / 4); cz < Math.ceil(b[3] / 4); cz++) for (let cx = Math.floor(b[0] / 4); cx < Math.ceil(b[2] / 4); cx++) n += nav.cnt[cx + cz * nav.gx]; return n; };
const A = actor(1, 'A', 0), V = actor(2, 'V', 1), P = actor(3, 'P', 4), S = actor(4, 'S', 2), B = actor(5, 'B', 3);
step(1);
check('aktorler adalarinda duruyor (kimse dusmedi)', game.actors.every((a) => a.alive && a.mover.onGround) && kills.length === 0, game.actors.map((a) => a.name + ':' + a.mover.pos.y.toFixed(1)).join(' '));
const G = sys.isles[1], c = G.def.crystal, cy = (c.y0 + c.y1) / 2, nav0 = navNodes(G.def.box);
let hp = G.hp; sys.onBlast(c.x + c.r * 0.5, cy, c.z, 0.32, 78, A);
check('mermi kristale ~7 hasar', hp - G.hp > 4 && hp - G.hp < 11, (hp - G.hp).toFixed(1));
hp = G.hp; sys.onBlast(c.x + 7, cy, c.z, 2.5, 430, A);
check('7 m uzaktaki roket kristale dokunmaz', G.hp === hp);
hp = G.hp; sys.onBlast(c.x, cy, c.z, 2.5, 430, A);
check('dogrudan roket ~200 hasar', hp - G.hp > 170 && hp - G.hp < 230, (hp - G.hp).toFixed(0));
let n = 1; while (G.phase === PH.UP && n < 20) { sys.onBlast(c.x, cy, c.z, 2.5, 430, A); n++; }
const st = events.filter((e) => e.k === 'st' && e.i === 1).map((e) => e.s).join('');
check('%75 / %50 / %25 kademeleri sirayla, sonra kirilma uyarisi', st === '123' && G.phase === PH.WARN && events.some((e) => e.k === 'w' && e.i === 1 && e.n === 'A'), 'kademeler ' + st + ', roket ' + n + ', evre ' + G.phase);
check('uyari sirasinda ada yerinde, hala dogma yeri yok', step(SKY_RULES.warn - 0.2, () => G.phase !== PH.WARN) === false && sys.snapMatch(1)[0] === sys.snapMatch(1)[1] && !game.arena.spawns.some((s) => s.isle === 1));
step(1, () => G.phase === PH.FALL);
check('uyari bitince ada duser (voxeller kalkar, konukta da)', G.phase === PH.FALL && sys.snapMatch(1)[0] < 50 && sG.isles[1].phase === PH.FALL && sG.snapMatch(1)[0] < 50, sys.snapMatch(1)[0] + ' / ' + sG.snapMatch(1)[0]);
check('ustundeki adayla dusuyor', !!V.skyRide && V.skyRide.by === A);
const pd = info.pads.filter((p) => p.from === 1 || p.to === 1), it1 = sys.isles[1].items.map((k) => game.items.list[k]);
check('dusen adanin pedleri ve ogeleri kapali', pd.length > 0 && pd.every((p) => p.radius === 0) && it1.every((it) => !it.active && it.timer > 1e8), pd.length + ' ped, ' + it1.length + ' oge');
step(4, () => !V.alive);
check('adayla dusen bulutlarda olur, ADA kristali kirana', kills.some((k) => k.v === 'V' && k.k === 'A' && k.w === 'island'), JSON.stringify(kills));
P.takeDamage(5, A, 'pulse', null, false); P.mover.pos.set(1.2, 12.5, 36); P.mover.onGround = false;
S.mover.pos.set(70.8, 16, 36); S.mover.onGround = false;
step(3, () => !P.alive && !S.alive);
check('vurulup bosluga dusen BULUT vurana', kills.some((k) => k.v === 'P' && k.k === 'A' && k.w === 'clouds'));
check('kendi dusen -1', kills.some((k) => k.v === 'S' && k.k === null && k.w === 'clouds') && S.frags === -1);
const Vi = sys.isles[3], vc = Vi.def.crystal;
for (let k = 0; k < 12 && Vi.phase === PH.UP; k++) sys.onBlast(vc.x, (vc.y0 + vc.y1) / 2, vc.z, 2.5, 430, B);
step(6, () => !B.alive);
check('kendi adasini dusuren -1 (ADA)', kills.some((k) => k.v === 'B' && k.k === null && k.w === 'island') && B.frags === -1, JSON.stringify(kills.slice(-1)));
check('GONE evresi: dusen adalarin dogma noktalari yok', [1, 3].every((i) => !game.arena.spawns.some((s) => s.isle === i)) && game.arena.spawns.length > 0, game.arena.spawns.length + ' dogma');
const backAt = G.dropT + SKY_RULES.ret + 0.5;
step(Math.max(0.1, backAt - game.time), () => G.phase === PH.UP);
step(1);
const [same, tot] = sys.snapMatch(1);
check('45 sn sonra ada aynen geri gelir (anlik goruntu)', G.phase === PH.UP && same === tot && G.hp === G.maxHp, same + ' / ' + tot + ', ' + (G.dropT + SKY_RULES.ret - game.time + 1).toFixed(1) + ' sn');
check('gezinme dugumleri geri geldi', navNodes(G.def.box) === nav0, navNodes(G.def.box) + ' / ' + nav0);
check('donen adanin pedleri, ogeleri, dogma noktalari acik', pd.every((p) => p.radius > 0) && it1.every((it) => it.timer < 2) && game.arena.spawns.some((s) => s.isle === 1));
check('konuk kopyasi ayni evrede', sG.isles.map((s) => s.phase).join('') === sys.isles.map((s) => s.phase).join(''), sG.isles.map((s) => s.phase).join('') + ' / ' + sys.isles.map((s) => s.phase).join(''));
check('ana adim surekli hizli', maxStep < 40, 'en kotu adim ' + maxStep.toFixed(1) + ' ms (worker yok: mesh ana is parcaciginda)');
// siradan dovus: ana adanin zeminine roketler -> en cok kucuk parcalar kopar, ada yerinde
{
  for (let k = 0; k < 14; k++) game.destruction.blast(28 + k * 1.1, 12.8, 31 + (k % 3), 2.5, 430, A, 10, 320);
  for (let k = 0; k < 30; k++) { game.time += 1 / 60; game.frame++; game.destruction.update(1 / 60); }
  let big = 0; for (const b of [...game.destruction.bodies, ...game.destruction.settleQueue]) big = Math.max(big, b.isl.count);
  check('roket yagmuru adayi dusurmez (yalniz kucuk parcalar)', big < 3000 && sys.isles[0].phase === PH.UP && sys.snapMatch(0)[0] > 70000, 'en buyuk parca ' + big);
}
// olcum: ana adanin cikarilmasi ve yeniden yazilmasi
{
  const M0 = sys.isles[0];
  let t1 = performance.now(); const idx = sys._collect(M0); const ex = w.extractIsland(idx); const tc = performance.now() - t1;
  t1 = performance.now(); sys._writeSnap(M0); const tw = performance.now() - t1;
  t1 = performance.now(); let nu = 0; while (game.nav.dirtyCells.size) { game.nav.update(); nu++; } const tn = performance.now() - t1;
  check('ana ada: toplama+cikarma, yeniden yazma ve gezinme guncellemesi hizli', tc < 30 && tw < 15 && tn < 20, ex.count + ' voxel: toplama ' + tc.toFixed(1) + ' ms, yazma ' + tw.toFixed(1) + ' ms, gezinme ' + tn.toFixed(1) + ' ms / ' + nu);
}
// ---------------------------------------------------------------- yenilenme: oyulan ada / tas kenarlarindan geri buyur
{
  const pct = (i) => { const r = sys.snapMatch(i); return r[0] / r[1]; };
  let tMax = 0;
  const g0 = sys._regrow.bind(sys);
  sys._regrow = () => { const t1 = performance.now(); const r = g0(); tMax = Math.max(tMax, performance.now() - t1); return r; };
  // dusmus adalar donsun, hepsi ayakta
  step(60, () => sys.isles.every((x) => x.phase === PH.UP));
  step(0.5);
  check('KIYAMET bu haritada 2 kat oyar (12.5 m degil 5 m: tek atista adayi silerdi)', info.doomVox === 2 && sys.isles.every((x) => x.phase === PH.UP), 'doomVox ' + info.doomVox);
  // roket cukuru: 2 sn bekler, sonra kenarindan katman katman dolar
  const W2 = sys.isles[2], c2 = W2.def.crystal;
  game.destruction.blast(c2.x + 2, W2.def.top + 0.1, c2.z, 2.5, 430, A, 10, 320);
  const p0 = pct(2);
  step(1.5);
  const p1 = pct(2), t0 = game.time;
  const okR = step(8, () => pct(2) > 0.995);
  check('roket cukuru 2 sn bekler, sonra kenarindan dolar', p0 < 0.99 && Math.abs(p1 - p0) < 0.002 && okR, (p0 * 100).toFixed(1) + '% -> ' + (pct(2) * 100).toFixed(1) + '%, ' + (game.time - t0 + 1.5).toFixed(1) + ' sn');
  // KIYAMET boyu (5 m) her adaya: hepsi ayakta kalir ve 25 sn icinde tam doner
  for (const I of sys.isles) { const c = I.def.crystal; game.destruction.blast(c.x + 3, I.def.top + 0.2, c.z, 5, 860, null, 25, 900); }
  const pk = sys.isles.map((x, i) => pct(i)), t1 = game.time;
  const okK = step(25, () => sys.isles.every((x, i) => pct(i) > 0.995));
  check('KIYAMET cukurlari (her adada bir) 25 sn icinde kapanir, ada dusmez', okK && pk.every((v) => v < 0.95) && sys.isles.every((x) => x.phase === PH.UP), pk.map((v) => (v * 100).toFixed(0) + '%').join(' ') + ' -> ' + (game.time - t1).toFixed(1) + ' sn');
  const tK = tMax;
  // neredeyse butunuyle silinen ada (eski 12.5 m'lik KIYAMET): kristal sagken cekirdek tabanindan yeniden buyur
  const Q = sys.isles[5], cq = Q.def.crystal;
  game.destruction.blast(cq.x + 3, Q.def.top + 0.2, cq.z, 12.5, 860, null, 25, 900);
  const pq = pct(5), t2 = game.time;
  const okQ = step(30, () => pct(5) > 0.995);
  check('neredeyse silinen ada 30 sn icinde yeniden buyur', pq < 0.05 && Q.phase === PH.UP && okQ, (pq * 100).toFixed(1) + '% -> ' + (pct(5) * 100).toFixed(1) + '%, ' + (game.time - t2).toFixed(1) + ' sn');
  // cukurdaki aktor (yel degirmeni adasinin kalin yeri): zemin dolarken yukari itilir, gomulmez
  const Wm = sys.isles[2], cw = Wm.def.crystal, ax = cw.x + 2.5, az = cw.z + 1;
  A.mover.pos.set(ax, Wm.def.top + 0.05, az); A.mover.vel.set(0, 0, 0);
  step(0.5);
  const ay = A.mover.pos.y;
  game.destruction.blast(ax, ay - 0.4, az, 3.0, 2000, null, 10, 320);
  step(1.5);
  const dip = A.mover.pos.y;
  step(15, () => sys.regions[2].miss.size === 0 && pct(2) > 0.995);
  const p = A.mover.pos, buried = w.boxSolid(p.x - 0.3, p.y + 0.05, p.z - 0.3, p.x + 0.3, p.y + 1.7, p.z + 0.3);
  check('cukurdaki aktor zemin dolarken yukari itilir (gomulmez)', A.alive && dip < ay - 1 && p.y > ay - 0.3 && !buried && pct(2) > 0.995, 'zemin ' + ay.toFixed(2) + ', dip ' + dip.toFixed(2) + ', sonra ' + p.y.toFixed(2));
  // basamak tasi
  const R0 = info.sky.rocks[0], rg = sys.regions[sys.isles.length];
  game.destruction.blast((R0.x0 + R0.x1) / 2 * VS, (R0.hi + 1) * VS, (R0.z0 + R0.z1) / 2 * VS, 2.5, 430, null, 10, 320);
  step(0.4);
  const rm = rg.miss.size;
  const okT = step(8, () => rg.miss.size === 0);
  check('basamak tasi da geri buyur', rm > 50 && okT, rm + ' eksik');
  check('yenilenme adimi kisa (roket / ayni anda 6 KIYAMET cukuru)', tK < 12, 'en kotu ' + tK.toFixed(2) + ' ms (neredeyse silinen ada dahil ' + tMax.toFixed(2) + ' ms)');
  // dusen adada yenilenme yok (donunce anlik goruntuyle gelir); mac basi her ada ve tas tam
  sys.forceBreak(4, A);
  step(12, () => sys.isles[4].phase === PH.GONE);
  const pg = pct(4);
  step(3);
  check('dusen adanin yerinde yenilenme olmaz', sys.isles[4].phase === PH.GONE && pg < 0.01 && pct(4) < 0.01 && sys.regions[4].miss.size === 0, (pct(4) * 100).toFixed(1) + '%');
  game.destruction.blast(36, 13.1, 33, 2.5, 430, A, 10, 320);
  game.destruction.blast((R0.x0 + R0.x1) / 2 * VS, (R0.hi + 1) * VS, (R0.z0 + R0.z1) / 2 * VS, 2.5, 430, null, 10, 320);
  sys.matchReset();
  const pr = sys.isles.map((x, i) => pct(i));
  step(0.4);
  check('mac basi: butun adalar ve taslar tam', pr.every((v) => v === 1) && sys.isles.every((x) => x.phase === PH.UP) && rg.miss.size === 0, pr.map((v) => (v * 100).toFixed(1)).join(' '));
  sys._regrow = g0;
}

console.log(fails ? fails + ' HATA' : 'hepsi gecti');
process.exit(fails ? 1 : 0);
