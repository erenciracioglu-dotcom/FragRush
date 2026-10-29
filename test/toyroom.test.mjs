// Oyuncak Odasi testi (tarayicisiz):
//  - fizik: ziplak yuzey (silte) seker, sekmeler sonumlenir (inis hizinin ~0.8'i), Bosluk basiliyken ek itis en cok
//    BOUNCE.max; ziplak olmayan zeminde sekme yok; obur haritalarda fizik varsayilan
//  - harita: uretim suresi, voxel sayisi, dunya kutusuna (24 m) sigma, malzeme kimlikleri, dogma noktalari ve ogeler,
//    dominolar gercek voxellerle cakismiyor, blok kule 160 bin voxel siniri altinda
//  - gezinme agi: kitaplik raflari, cetvel kopru, gardirop tepesi (KIYAMET), yatak, masa, pervaz, kale; dogma
//    noktalari bagli (gidis-donus); pedler hedefe iner
//  - domino zinciri (game/domino.js): ilk tas kuleye kadar kosar, tetikleyen herkese yazilir
//  - kurallar (fx/toyroom.js ToySystem + game/destruction.js, sahte oyun nesnesiyle): ilk dominoya mermi -> zincir ->
//    kule menteseyle devrilir; devrilme alanindaki aktor ezilir (DOMINO, vurana); dusen domino yanindakini yaralar;
//    ortadaki domino vurandan uzaga devrilir (ters zincir kuleye ulasmaz); roket patlamasi dominolari merkezden uzaga
//    devirir; 45 sn sonra dominolar kalkar (yerinde biri varsa bekler), kule anlik goruntuden aynen kurulur;
//    dev domino agir (tek mermi sallar, ucuncu devirir); mac basi sifirlama (devrik zincir, yikik kule, dusen govde);
//    delinmis kule de son dominoyla devrilir; oyulan kulenin onarim sayaci kosu baslayinca iptal (kule dominolarla
//    birlikte kurulur); botlar icin tehlike sorgulari (devrilme alani, ezme seridi, kacis yonu)
// usage: node test/toyroom.test.mjs [seed]
import * as THREE from 'three';
import * as CFG from '../src/config.js';
import { WORLD, VS, MOVE, BOUNCE, GRAVITY0, setPhysics } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateToyroom, TOY_LAYOUT } from '../src/world/toyroom.js';
import { generateArena } from '../src/world/mapgen.js';
import { M, MAT_COUNT, BOUNCY } from '../src/world/materials.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';
import { DominoChain, DOM } from '../src/game/domino.js';
import { Destruction } from '../src/game/destruction.js';
import { ToySystem, RESET_TIME } from '../src/fx/toyroom.js';

const seed = Number(process.argv[2] || 777);
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

// ---------------------------------------------------------------- fizik: ziplak yuzey
{
  setPhysics();
  const flat = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const fill = (m0, m1) => { for (let y = 0; y < 8; y++) for (let z = 0; z < flat.sz; z++) { const o = flat.sx * (z + flat.sz * y); flat.mat.fill(y === 7 ? m1 : m0, o, o + flat.sx); } };
  const drop = (h, jump = false, n = 8) => {
    const m = new Mover(flat);
    m.reset(36, 8 * VS + h, 36);
    const tops = [], speeds = [];
    let up = false, top = -1, last = 0;
    for (let k = 0; k < n / dt; k++) {
      const vy = m.vel.y;
      m.simulate(dt, cmd({ jump }));
      if (m.events.bounced) speeds.push([-vy, m.events.bounced]);
      if (m.vel.y > 0) { up = true; top = Math.max(top, m.pos.y); } else if (up) { tops.push(top - 8 * VS); up = false; top = -1; }
      last = m.pos.y;
    }
    return { tops, speeds, last };
  };
  fill(M.STONE || 1, M.MATTRESS);
  check('silte ziplak, parke ve beton degil', BOUNCY[M.MATTRESS] === 1 && BOUNCY[M.PILLOW] === 1 && BOUNCY[M.RUBBER] === 1 && !BOUNCY[M.PARQUET] && !BOUNCY[M.STONE || 1]);
  const a = drop(5);
  const r = a.speeds.length ? a.speeds[0][1] / a.speeds[0][0] : 0;
  check('5 m\'den dusus silteden seker (cikis hizi inisin 0.75-0.85\'i)', a.speeds.length >= 2 && r > 0.74 && r < 0.86, `ilk ${a.speeds[0] ? a.speeds[0].map((v) => v.toFixed(2)).join(' -> ') : '-'} m/s, oran ${r.toFixed(2)}`);
  check('sekmeler sonumlenir, sonunda durur', a.tops.length >= 3 && a.tops.every((t, i) => i === 0 || t < a.tops[i - 1]) && Math.abs(a.last - 8 * VS) < 0.05, a.tops.slice(0, 6).map((v) => v.toFixed(2)).join(' -> ') + ' m');
  const b = drop(5, true);
  check('inerken Bosluk basili: ek itis, hiz en cok BOUNCE.max', b.tops[0] > a.tops[0] && b.speeds.every(([, v]) => v <= BOUNCE.max + 1e-6), `ilk tepe ${b.tops[0].toFixed(2)} m (basmadan ${a.tops[0].toFixed(2)}), en hizli ${Math.max(...b.speeds.map(([, v]) => v)).toFixed(1)} m/s`);
  const c = drop(0.3);
  check('alcaktan (yavas) inis sekmez', c.speeds.length === 0);
  fill(M.STONE || 1, M.PARQUET);
  const d = drop(5);
  check('parkeye dusus sekmez', d.speeds.length === 0 && d.tops.length === 0);
  const w0 = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const ar = generateArena(w0, seed);
  setPhysics(ar.gravity, ar.move);
  check('obur haritalarda fizik varsayilan', CFG.GRAVITY === GRAVITY0 && MOVE.jumpVel === 7.4, `G ${CFG.GRAVITY} jump ${MOVE.jumpVel}`);
}

// ---------------------------------------------------------------- harita
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
let t0 = performance.now();
const info = generateToyroom(w, seed);
setPhysics(info.gravity, info.move);
const tGen = performance.now() - t0;
let solid = 0, maxMat = 0, topY = 0;
for (let i = 0; i < w.mat.length; i++) { const m = w.mat[i]; if (m) { solid++; maxMat = Math.max(maxMat, m); topY = Math.max(topY, (i / w.sxz) | 0); } }
check('uretim hizli', tGen < 400, `${tGen.toFixed(0)} ms, kati voxel ${solid}`);
check('malzeme kimlikleri MAT_COUNT altinda', maxMat < MAT_COUNT, `en buyuk ${maxMat}, MAT_COUNT ${MAT_COUNT}`);
check('harita 24 m yukseklige sigar', topY < WORLD.Y && topY * VS <= 24, `en yuksek voxel y ${topY} (${(topY * VS).toFixed(2)} m)`);
check('ortam: oyuncak odasi', info.env === 'toyroom' && !!info.quadWhere && info.items.some((i) => i.type === 'quad'));
const standOk = (p) => {
  const X = Math.floor(p.x / VS), Y = Math.round(p.y / VS), Z = Math.floor(p.z / VS);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!w.solid(X + dx, Y - 1, Z + dz)) return false;
    for (let k = 0; k < 7; k++) if (w.solid(X + dx, Y + k, Z + dz)) return false;
  }
  return true;
};
const badSp = info.spawns.filter((s) => !standOk(s));
check('dogma noktalari duz ve bos', info.spawns.length >= 12 && badSp.length === 0, `${info.spawns.length} nokta ` + badSp.map((s) => `(${s.x.toFixed(1)},${s.y.toFixed(2)},${s.z.toFixed(1)})`).join(' '));
check('ogeler (KIYAMET, mega, zirh, can, cephane)', ['quad', 'mega', 'armor', 'health', 'ammo'].every((t) => info.items.some((i) => i.type === t)), info.items.map((i) => i.type).join(','));
{
  const T = info.toy.tower, [x0, y0, z0, x1, y1, z1] = T.box;
  let n = 0;
  for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (w.mat[w.idx(x, y, z)]) n++;
  check('blok kule 160 bin voxel siniri altinda (devrilebilir)', n > 500 && n < 160000, `${n} voxel, boy ${T.height.toFixed(2)} m`);
}
// dominolar: gercek voxellerle cakisma yok
w.extra = new Uint8Array(w.mat.length);
w.extraMat = M.DOMINO;
{
  const chain = new DominoChain(w, info.toy.chain);
  let overlap = 0;
  for (const d of chain.list) {
    for (let Y = TOY_LAYOUT.G0; Y < TOY_LAYOUT.G0 + 9; Y++) for (let Z = Math.floor((d.z - 1.2) / VS); Z <= Math.floor((d.z + 1.2) / VS); Z++) for (let X = Math.floor((d.x - 1.2) / VS); X <= Math.floor((d.x + 1.2) / VS); X++) {
      if (chain.inside(d, (X + 0.5) * VS, (Y + 0.5) * VS, (Z + 0.5) * VS, 0) && w.mat[X + w.sx * (Z + w.sz * Y)]) overlap++;
    }
  }
  check('dominolar (15-25) gercek voxellerle cakismiyor', chain.list.length >= 15 && chain.list.length <= 25 && overlap === 0, `${chain.list.length} domino, ${overlap} voxel`);
  // pure zincir: ilk tas -> kule
  const [x0, y0, z0, x1, y1, z1] = info.toy.tower.box;
  let hit = null, tHit = -1, now = 0;
  chain.onBlock = (d, x, y, z) => {
    const X = Math.floor(x / VS), Y = Math.floor(y / VS), Z = Math.floor(z / VS);
    if (X >= x0 - 1 && X <= x1 && Y >= y0 && Y <= y1 && Z >= z0 - 1 && Z <= z1 && hit === null) { hit = d.i; tHit = now; }
    return false;
  };
  chain.standAll();
  chain.knock(0, 1, DOM.kick, 'p1', 0);
  for (let k = 0; k < 8 / dt; k++) { now += dt; chain.update(dt, now); }
  check('domino: tum dizi devrilir', chain.list.every((d) => d.st !== 'stand'));
  check('domino: son tas kuleye carpar (dalga 2-6 sn)', hit === chain.list.length - 1 && tHit > 2 && tHit < 6, `carpan ${hit}, ${tHit.toFixed(2)} sn`);
  check('domino: tetikleyen herkese yazilir', chain.list.every((d) => d.by === 'p1'));
  chain.clearAll();
}

// ---------------------------------------------------------------- gezinme agi (dominolar ayakta)
{
  const chain = new DominoChain(w, info.toy.chain);
  chain.standAll();
  const nav = new NavGrid(w);
  nav.jumpUp = info.navJump ? info.navJump.up : 5;
  nav.dropMax = info.navJump ? info.navJump.drop : 48;
  nav.buildAll();
  for (const p of info.pads) nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
  const V = (x, y, z) => [(x + 0.5) * VS, y * VS, (z + 0.5) * VS];
  const L = TOY_LAYOUT;
  const hub = V(128, L.RUGY, 150);
  const reach = (name, a, b) => {
    const s = nav.nearest(a[0], a[1] + 0.3, a[2]), g = nav.nearest(b[0], b[1] + 0.3, b[2]);
    const path = s >= 0 && g >= 0 ? nav.findPath(s, g, 80000) : null;
    const ok = !!path && path.length > 0 && path[path.length - 1].id === g;
    check(`gezinme: ${name}`, ok, ok ? `${path.length} adim` : `s=${s} g=${g} yol ${path ? path.length : 'yok'}`);
  };
  const spots = {
    'kitaplik 1. raf': V(196, L.SHELF.floors[1], 16), 'kitaplik 3. raf': V(196, L.SHELF.floors[3], 16),
    'kitaplik tepesi': V(192, L.SHELF.top, 12), 'cetvel kopru': V(222, L.WARD.top + 1, 10),
    'gardirop tepesi (KIYAMET)': V(256, L.WARD.top, 17), 'yatak ustu': V(230, L.BED.top, 120),
    'masa': V(16, L.DESK.top, 132), 'pencere pervazi': V(128, L.WIN.sill, 7), 'kale suru': V(14, L.CASTLE.wall, 250),
  };
  for (const [n, p] of Object.entries(spots)) reach(`haliden ${n}`, hub, p);
  for (const n of ['gardirop tepesi (KIYAMET)', 'kitaplik tepesi', 'yatak ustu', 'kale suru', 'masa']) reach(`${n} -> hali`, spots[n], hub);
  let lone = 0;
  for (const s of info.spawns) {
    const a = nav.nearest(s.x, s.y + 0.3, s.z), b = nav.nearest(hub[0], hub[1] + 0.3, hub[2]);
    const p1 = nav.findPath(a, b, 80000), p2 = nav.findPath(b, a, 80000);
    if (!p1 || !p1.length || p1[p1.length - 1].id !== b || !p2 || !p2.length || p2[p2.length - 1].id !== a) { lone++; console.log('  bagli degil', JSON.stringify(s)); }
  }
  check('dogma noktalari gezinme agina bagli (gidis-donus)', lone === 0, `${info.spawns.length} nokta, ${lone} bagli degil`);
  chain.clearAll();
}

// ---------------------------------------------------------------- pedler
{
  const m = new Mover(w);
  info.pads.forEach((pd, i) => {
    m.reset(pd.x, pd.y + 0.02, pd.z);
    padLaunchVelocity(pd, m.vel);
    m.onGround = false; m.padLock = 0.5;
    let landed = false, t = 0;
    for (let k = 0; k < 6 / dt; k++) { m.simulate(dt, cmd()); t += dt; if (k > 20 && m.onGround) { landed = true; break; } }
    const d = Math.hypot(m.pos.x - pd.tx, m.pos.z - pd.tz), dy = m.pos.y - pd.ty;
    check(`ped ${i}: hedefe iner`, landed && d < 1.5 && Math.abs(dy) < 0.6, `uzaklik ${d.toFixed(2)} m, dy ${dy.toFixed(2)}, ${t.toFixed(2)} sn`);
  });
}

// ---------------------------------------------------------------- kurallar: sahte oyun nesnesiyle ToySystem
const fx = { pm: 1, impact() {}, voxelDebris() {}, dustPuff() {}, addShake() {}, smoke: { emit() {} }, add: { emit() {} } };
const game = {
  world: w, scene: new THREE.Scene(), voxelMaterial: new THREE.MeshBasicMaterial(), workers: { workers: [] }, fx, audio: null, hud: null,
  actors: [], time: 0, frame: 0, arena: info, state: 'playing', iceSys: null, moonSys: null, events: [], logEvent(s) { this.events.push(s); },
};
game.destruction = new Destruction(game);
const ts = game.toySys = new ToySystem(game);
ts.setup(info);
const step = (sec) => { for (let k = 0; k < Math.round(sec * 60); k++) { game.time += 1 / 60; game.frame++; ts.update(1 / 60, null); game.destruction.update(1 / 60); } };
const mkActor = (name, x, z, y = null) => {
  const m = new Mover(w);
  if (y === null) { const X = Math.floor(x / VS), Z = Math.floor(z / VS); y = 4; for (let yy = 90; yy > 1; yy--) if (w.solid(X, yy, Z)) { y = (yy + 1) * VS + 0.02; break; } }
  m.reset(x, y, z);
  const a = {
    name, mover: m, alive: true, health: 100, armor: 0, hurt: [],
    takeDamage(dmg, by, wid) { this.hurt.push([Math.round(dmg), by ? by.name : null, wid]); this.health -= dmg; if (this.health <= 0 && this.alive) { this.alive = false; this.death = [by ? by.name : null, wid]; } return dmg; },
  };
  game.actors.push(a);
  return a;
};
{
  const T = ts.tower, ch = ts.chain;
  let cells = 0; for (const d of ch.list) cells += d.cells.length;
  check('kurulum: zincir ayakta, kule duruyor, sanal hucreler dunyada', ts.armed && cells > 0 && w.extra.some((v) => v > 0), `${ch.list.length} domino, ${cells} hucre`);
  // vuran A: zincirin onunde (kule tarafinda), yaninda dursun: ilk domino yine de zincir yonune devrilmeli
  const d0 = ch.list[0];
  const A = mkActor('A', d0.x + d0.fx * 2 + d0.wx * 3, d0.z + d0.fz * 2 + d0.wz * 3);
  // B: kulenin devrilecegi yerde (kulenin onunde, boyunun yarisi kadar); C: 10. dominonun hemen yaninda, devrildigi yerde
  const L = T.height * 0.5, cx = (T.box[0] + T.box[3]) * 0.5 * VS, cz = T.dir[1] < 0 ? T.box[2] * VS - L : T.box[5] * VS + L;
  const B = mkActor('B', cx, cz);
  // C: 10. ile 11. dominonun arasinda (10. domino onun ustune devrilir)
  const d10 = ch.list[10], d11 = ch.list[11];
  const C = mkActor('C', (d10.x + d11.x) / 2, (d10.z + d11.z) / 2);
  check('tehlike sorgulari: B kulenin devrilme alaninda, A degil', ts.towerZone(B.mover.pos.x, B.mover.pos.z, B.mover.pos.y) && ts.hitZone(B.mover.pos.x, B.mover.pos.z, B.mover.pos.y) && !ts.towerZone(A.mover.pos.x, A.mover.pos.z, A.mover.pos.y));
  {
    const e = ts.escapeDir(B.mover.pos.x, B.mover.pos.z);
    let k = 0, x = B.mover.pos.x, z = B.mover.pos.z;
    while (e && ts.inFallZone(x, z) && k < 40) { x += e[0] * 0.25; z += e[1] * 0.25; k++; }
    check('kacis yonu devrilme alanindan en cok ~4 m\'de cikarir', !!e && !ts.inFallZone(x, z) && k * 0.25 <= 4.5, e ? `${(k * 0.25).toFixed(2)} m` : 'yon yok');
  }
  // ilk dominoya darbe tufegi mermisi (destruction.chip ile ayni: yuzeyin biraz icinde kucuk patlama, guc 78)
  const c0 = ch.center(d0, { x: 0, y: 0, z: 0 });
  game.destruction.blast(c0.x, c0.y + 0.3, c0.z, 0.32, 78, A);
  check('mermi ilk dominoyu zincir yonune devirir', d0.st === 'fall' && d0.dir === 1 && d0.by === A && !ts.armed);
  let tTop = -1, tDown = -1;
  for (let k = 0; k < 12 * 60; k++) {
    step(1 / 60);
    if (tTop < 0 && T.state === 'fall') tTop = game.time;
    if (tDown < 0 && T.state === 'down') { tDown = game.time; break; }
  }
  check('dalga kuleye ulasir, kule menteseyle devrilir', tTop > 0 && tDown > tTop && ts.stats.topples === 1, `devrilme ${tTop.toFixed(2)} sn, yere ${tDown.toFixed(2)} sn`);
  check('devrilme alanindaki B ezildi: DOMINO, parcalama vurana (A)', !B.alive && B.death && B.death[0] === 'A' && B.death[1] === 'domino', JSON.stringify(B.hurt));
  check('dusen domino yanindaki C\'yi yaraladi (DOMINO, A)', C.hurt.some(([dmg, by, wid]) => by === 'A' && wid === 'domino' && dmg >= 30), JSON.stringify(C.hurt));
  check('kule yere yatti (devrilme yonunde, uzunlamasina)', (() => { let n = 0; const [x0, , z0, x1] = T.box; const fy = TOY_LAYOUT.G0; for (let k = 4; k < Math.round(T.height / VS) - 4; k++) { const z = T.dir[1] < 0 ? z0 - k : T.box[5] + k; for (let x = x0; x < x1; x++) for (let y = fy; y < fy + 12; y++) if (w.get(x, y, z)) { n++; } } return n > 300; })());
  C.alive = false;
  // 45 sn sonra: dominolar kalkar; biri yerinde duruyorsa bekler (kule beklemez)
  const blocker = mkActor('D', ch.list[5].x, ch.list[5].z);
  blocker.mover.reset(ch.list[5].x + ch.list[5].fx * 0.1, blocker.mover.pos.y, ch.list[5].z + ch.list[5].fz * 0.1);
  step(RESET_TIME - (game.time - 0) + 2);
  check('45 sn sonra dominolar kalkiyor, yerinde biri duran bekliyor', ch.list.filter((d) => d.st === 'stand' || d.st === 'rise').length >= ch.list.length - 1 && ch.list[5].st !== 'stand' && ch.list[5].st !== 'rise', `ayakta ${ch.standing}, 5: ${ch.list[5].st}`);
  step(3);
  check('kule dominoyu beklemeden anlik goruntuden aynen kuruldu', T.state === 'stand' && !ts._towerDamaged(), `kule ${T.state}`);
  blocker.alive = false;
  step(2);
  check('engel kalkinca son domino da dikilir, zincir yeniden kurulu', ch.standing === ch.list.length && ts.armed, `sifirlama ${ts.stats.resets}`);
  // ortadaki domino kule tarafindan vurulursa vurandan uzaga (geri) devrilir: ters zincir kuleye ulasmaz
  const dm = ch.list[12];
  const E = mkActor('E', dm.x + dm.fx * 4, dm.z + dm.fz * 4);
  const cm = ch.center(dm, { x: 0, y: 0, z: 0 });
  // dev domino agir: tek darbe mermisi yalniz sallar, uc mermi devirir
  game.destruction.blast(cm.x, cm.y + 0.3, cm.z, 0.32, 78, E);
  step(0.1);
  check('tek mermi ortadaki dominoyu yalniz sallar', dm.st === 'stand' && ts.armed && dm.wobA < 0, `itis ${dm.shove.toFixed(2)}`);
  game.destruction.blast(cm.x, cm.y + 0.3, cm.z, 0.32, 78, E);
  game.destruction.blast(cm.x, cm.y + 0.3, cm.z, 0.32, 78, E);
  check('ucuncu mermide ortadaki domino vurandan uzaga devrilir', dm.st === 'fall' && dm.dir === -1);
  step(8);
  check('ters zincir basa kosar, kule ayakta kalir', ch.list[0].st !== 'stand' && ch.list[ch.list.length - 1].st === 'stand' && T.state === 'stand', `ayakta ${ch.standing}`);
  step(RESET_TIME + 3);
  check('ters zincirden sonra da yeniden dizilir', ch.standing === ch.list.length && ts.armed);
  // roket: zincirin ortasina yakin patlama, yaricapindaki dominolari merkezden uzaga devirir
  const d6 = ch.list[6], d7 = ch.list[7];
  const mx = (d6.x + d7.x) / 2 + d6.wx * 0.6, mz = (d6.z + d7.z) / 2 + d6.wz * 0.6;
  game.destruction.blast(mx, TOY_LAYOUT.G0 * VS + 0.6, mz, 2.2, 140, A);
  const knocked = ch.list.filter((d) => d.st !== 'stand');
  check('roket patlamasi yakindaki dominolari merkezden uzaga devirir', ch.list[6].st === 'fall' && ch.list[7].st === 'fall' && ch.list[6].dir === -1 && ch.list[7].dir === 1, `devrilen ${knocked.map((d) => d.i + (d.dir > 0 ? '+' : '-')).join(' ')}`);
  for (const a of game.actors) a.alive = false;
  step(10);
  check('roket zinciri kuleye ulasir (on taraf)', ts.stats.topples === 2, `devrilme ${ts.stats.topples}`);
  check('olay gunlugu: domino ve kule', game.events.some((e) => e.startsWith('domino A')) && game.events.some((e) => e.startsWith('tower A')));
  // mac basi: menudeki savastan kalan devrik zincir ve yikik kule aninda toparlanir (dusen govde iptal)
  step(0.5);
  ts.matchReset();
  check('mac basi sifirlama: zincir dizili, kule saglam, sayaclar sifir', ts.armed && !ts._towerDamaged() && ts.resetT < 0 && !ts.resetPending && !T.body && !game.destruction.bodies.length, `kule ${T.state}, ayakta ${ch.standing}`);
  // ezme seridi (botlar bunu bekler): kulenin onu iceride; 3 m yani devrilme alaninda ama seritte degil
  const S1 = mkActor('S1', cx, cz), S2 = mkActor('S2', cx + 3, cz);
  check('ezme seridi: kulenin onu iceride, 3 m yani disarida (kacis alani daha genis)', ts.crushZone(S1.mover.pos.x, S1.mover.pos.z, S1.mover.pos.y) && !ts.crushZone(S2.mover.pos.x, S2.mover.pos.z, S2.mover.pos.y) && ts.towerZone(S2.mover.pos.x, S2.mover.pos.z, S2.mover.pos.y));
  S1.alive = false; S2.alive = false;
  // delinmis kule: son dominonun dustugu yerde kulenin altinda boydan boya 1 m'lik yarik; domino kutuya degince
  // kule yine devrilir (yarikten gecip yere yatmaz)
  {
    const last = ch.list[ch.list.length - 1], [x0, y0, z0, x1, , z1] = T.box, cxv = Math.round(last.x / VS), idx = [];
    for (let y = y0; y < y0 + 9; y++) for (let z = z0; z < z1; z++) for (let x = Math.max(x0, cxv - 2); x < Math.min(x1, cxv + 2); x++) { const i = w.idx(x, y, z); if (w.mat[i]) idx.push(i); }
    w.removeIndices(idx);
    const t0 = ts.stats.topples;
    ts._knock(last.i, 1, DOM.kick, A);
    let fell = false;
    for (let k = 0; k < 3 * 60 && !fell; k++) { step(1 / 60); if (T.state === 'fall' || T.state === 'down') fell = true; }
    check('delinmis kule de son dominoyla devrilir', fell && ts.stats.topples === t0 + 1, `yarik ${idx.length} voxel, kule ${T.state}, son domino ${last.st} ${last.phi.toFixed(2)}`);
  }
  // vurulup oyulan kulenin onarim sayaci kosu baslayinca iptal: kule yere yatan dominolardan once kurulmaz,
  // kosunun sifirlamasinda dominolarla birlikte kurulur
  {
    step(3);
    ts.matchReset();
    const [x0, y0, z0, x1] = T.box, idx = [], ym = y0 + Math.round(T.ny / 2);
    for (let y = ym; y < ym + 2; y++) for (let x = x0 + 2; x < Math.min(x1, x0 + 5); x++) { const i = w.idx(x, y, z0); if (w.mat[i]) idx.push(i); }
    w.removeIndices(idx);
    step(3.5);
    const waited = T.repairT > 0;
    ts.trigger(A);
    let early = -1;
    for (let k = 0; k < (RESET_TIME - 1) * 60; k++) { step(1 / 60); if (early < 0 && T.state === 'build') early = +game.time.toFixed(1); }
    check('kosu baslayinca kulenin onarim sayaci iptal (kule dominolardan once kurulmaz)', idx.length > 0 && waited && T.repairT < 0 && early < 0 && T.state === 'down', `oyuk ${idx.length} voxel, sayac kuruldu ${waited}, erken kurulum ${early}, kule ${T.state}`);
    step(5);
    check('kosunun sifirlamasinda kule ve dominolar birlikte toparlanir', T.state === 'stand' && !ts._towerDamaged() && ch.standing === ch.list.length && ts.armed, `kule ${T.state}, ayakta ${ch.standing}`);
  }
}

console.log(fails ? `\n${fails} test basarisiz` : '\ntum testler gecti');
process.exit(fails ? 1 : 0);
