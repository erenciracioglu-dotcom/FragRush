// Buz Golu testi (tarayicisiz): kulenin sarmal merdiveni ve pedler, gezinme agi (buz ustu, balik deligi,
// adaya ve gozetleme yerine yol), kaygan buz (durma mesafesi), buz kurallari (fx/ice.js IceSystem, sahte
// oyun nesnesiyle): kirilan buzun kaydi, soguk su hasari ve parcalamanin buzu kirana yazilmasi, buz tavan
// (altindan kirma), yeniden donma (balik deligi acik kalir, aktorun icine donmaz), kopan buzun yuzmesi.
import * as THREE from 'three';
import { WORLD, VS, ICE, MOVE } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateFrozen, FROZEN_WATER_Y, FROZEN_LAYOUT } from '../src/world/frozen.js';
import { M } from '../src/world/materials.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';
import { IceSystem } from '../src/fx/ice.js';

const seed = Number(process.argv[2] || 777);
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateFrozen(w, seed);
w.waterY = info.water.y;
const WL = FROZEN_WATER_Y, TOP = FROZEN_LAYOUT.iceTop, [CX, CZ] = FROZEN_LAYOUT.center, NEST = FROZEN_LAYOUT.nest;
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const m = new Mover(w);

// ---------------------------------------------------------------- kule: sarmal merdiven, pedler
{
  const [r0, r1] = FROZEN_LAYOUT.spiral;
  const R = (r0 + r1) / 2 * VS, ox = (CX + 0.5) * VS, oz = (CZ + 0.5) * VS;
  let sx = 0, sz = 0, y = 0;
  for (let a0 = -Math.PI + 0.12; a0 < 0; a0 += 0.15) {
    sx = ox + Math.cos(a0) * R; sz = oz + Math.sin(a0) * R;
    y = (NEST - 2) * VS;
    for (let k = 0; k < 80; k++) { if (w.solidAtWorld(sx, y - 0.01, sz) && !m.collides(sx, y, sz)) break; y -= VS; }
    if (w.get(Math.floor(sx / VS), Math.floor((y - 0.01) / VS), Math.floor(sz / VS)) === M.ICE_BRICK) break;
  }
  m.reset(sx, y + 0.02, sz);
  let maxY = m.pos.y;
  for (let i = 0; i < 12 / dt; i++) {
    const p = m.pos, a = Math.atan2(p.z - oz, p.x - ox), r = Math.hypot(p.x - ox, p.z - oz);
    let tx = -Math.sin(a), tz = Math.cos(a);
    tx += Math.cos(a) * (R - r) * 1.5; tz += Math.sin(a) * (R - r) * 1.5;
    m.simulate(dt, cmd({ fwd: 1, yaw: Math.atan2(-tx, -tz) }));
    maxY = Math.max(maxY, m.pos.y);
    if (m.pos.y >= NEST * VS - 0.05) break;
  }
  check('buz kulesi: sarmal merdivenle gozetleme yerine', maxY >= NEST * VS - 0.05, `azami ${maxY.toFixed(2)} m, tepe ${(NEST * VS).toFixed(2)} m, baslangic ${y.toFixed(2)} m`);
}
info.pads.forEach((pd, i) => {
  m.reset(pd.x, pd.y + 0.02, pd.z);
  padLaunchVelocity(pd, m.vel);
  m.onGround = false; m.padLock = 0.5;
  let landed = false;
  for (let k = 0; k < 4 / dt; k++) { m.simulate(dt, cmd()); if (k > 20 && m.onGround) { landed = true; break; } }
  const d = Math.hypot(m.pos.x - pd.tx, m.pos.z - pd.tz), dy = m.pos.y - pd.ty;
  check(`ped ${i}: gozetleme yerine iner`, landed && d < 1.5 && Math.abs(dy) < 0.6, `uzaklik ${d.toFixed(2)} m, dy ${dy.toFixed(2)}`);
});

// ---------------------------------------------------------------- gezinme agi
{
  const nav = new NavGrid(w);
  nav.buildAll();
  for (const p of info.pads) nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
  const pos = { x: 0, y: 0, z: 0 };
  let onIce = 0, inHole = 0, under = 0, total = 0;
  const [hx, hz] = FROZEN_LAYOUT.hole;
  for (let c = 0; c < nav.ncell; c++) for (let k = 0; k < nav.cnt[c]; k++) {
    total++;
    nav.nodePos(c * 6 + k, pos);
    const X = Math.floor(pos.x / VS), Y = Math.round(pos.y / VS), Z = Math.floor(pos.z / VS);
    if (Y === TOP && w.get(X, Y - 1, Z) === M.ICE) onIce++;
    if (X >= hx - 2 && X < hx + 2 && Z >= hz - 2 && Z < hz + 2) inHole++;
    if (pos.y < info.water.y - 1.0) under++;
  }
  check('gezinme agi: buzun ustunde yurunur', onIce > 300, `${onIce} / ${total} dugum buzda`);
  check('gezinme agi: balik deliginde dugum yok', inHole === 0, `${inHole}`);
  check('gezinme agi: derin suda dugum yok', under === 0, `${under}`);
  const reach = (name, a, b) => {
    const s = nav.nearest(a[0], a[1] + 0.3, a[2]), g = nav.nearest(b[0], b[1] + 0.3, b[2]);
    const path = nav.findPath(s, g, 60000);
    const ok = !!path && path.length > 0 && path[path.length - 1].id === g;
    check(`gezinme agi: ${name}`, ok, ok ? `${path.length} adim` : `s=${s} g=${g} yol ${path ? path.length : 'yok'}`);
  };
  // zemin (m): kolonun en ustteki kati voxelinin ustu
  const gy = (xm, zm) => { const X = Math.floor(xm / VS), Z = Math.floor(zm / VS); let y = w.sy - 1; while (y > 0 && !w.get(X, y, Z)) y--; return (y + 1) * VS; };
  const shore = [36.1, gy(36.1, 60), 60];
  const court = [(CX + 0.5) * VS + 4.9, FROZEN_LAYOUT.plat * VS, (CZ + 0.5) * VS];
  const nest = [(CX + 0.5) * VS + 2.2, NEST * VS, (CZ + 0.5) * VS + 1.7];
  reach('guney kiyisindan kopruden avluya', shore, court);
  reach('avludan kopruden kiyiya', court, shore);
  reach('kiyidan (ped) gozetleme yerine', shore, nest);
  reach('gozetleme yerinden kiyiya', nest, shore);
  // dogma noktalari ana aga bagli (ucurum sekisinde, kapali kuyuda dogulmaz)
  let lone = 0;
  for (const s of info.spawns) {
    const a = nav.nearest(s.x, s.y + 0.3, s.z), b = nav.nearest(...shore);
    const p1 = nav.findPath(a, b, 60000), p2 = nav.findPath(b, a, 60000);
    if (!p1 || !p1.length || p1[p1.length - 1].id !== b || !p2 || !p2.length || p2[p2.length - 1].id !== a) { lone++; console.log('  bagli degil', JSON.stringify(s)); }
  }
  check('dogma noktalari gezinme agina bagli (gidis-donus)', lone === 0, `${info.spawns.length} nokta, ${lone} bagli degil`);
}

// ---------------------------------------------------------------- kaygan buz: duz deneme dunyasi
{
  const stopDist = (mat) => {
    const flat = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
    for (let y = 0; y < 20; y++) for (let z = 0; z < flat.sz; z++) { const o = flat.sx * (z + flat.sz * y); flat.mat.fill(y === 19 ? mat : M.DIRT, o, o + flat.sx); }
    const fm = new Mover(flat);
    fm.reset(36, 20 * VS + 0.01, 60);
    let t80 = -1;
    for (let i = 0; i < 3 / dt; i++) {
      fm.simulate(dt, cmd({ fwd: 1, yaw: 0 }));
      if (t80 < 0 && Math.hypot(fm.vel.x, fm.vel.z) > MOVE.runSpeed * 0.8) t80 = i * dt;
    }
    const v0 = Math.hypot(fm.vel.x, fm.vel.z), z0 = fm.pos.z;
    let t = 0;
    while (Math.hypot(fm.vel.x, fm.vel.z) > 0.1 && t < 15) { fm.simulate(dt, cmd({ yaw: 0 })); t += dt; }
    return { d: Math.abs(fm.pos.z - z0), v0, t80, t, gm: fm.groundMat };
  };
  const ice = stopDist(M.ICE), snow = stopDist(M.SNOW);
  check('kaygan buz: kar ustunde cabuk durur', snow.d < 2.2, `${snow.d.toFixed(2)} m, ${snow.t.toFixed(2)} sn`);
  check('kaygan buz: buzda uzun kayar (karin 3 katindan fazla)', ice.d > snow.d * 3 && ice.gm === M.ICE, `${ice.d.toFixed(2)} m, ${ice.t.toFixed(2)} sn`);
  check('kaygan buz: tam hiza ulasilir ama gec', ice.v0 > MOVE.runSpeed * 0.95 && ice.t80 > snow.t80 * 2, `buz ${ice.t80.toFixed(2)} sn, kar ${snow.t80.toFixed(2)} sn (hizin %80'i)`);
}

// ---------------------------------------------------------------- buz kurallari (sahte oyun)
const noop = () => {};
const fx = { pm: 1, smoke: { emit: noop }, add: { emit: noop }, bubbles: noop, splash: noop, impact: noop };
const game = {
  world: w, time: 10, actors: [], fx, audio: null, hud: null, scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(), renderer: { domElement: { height: 720 } },
  waterSys: { active: false, underwater: false, ripple: noop },
};
const ice = new IceSystem(game);
game.iceSys = ice;
game.destruction = { blast: (x, y, z, r, power, source) => { const n = w.damageSphere(x, y, z, r, power, { noise: 0 }); if (n) ice.onBlast(w.removed, w.removedMat, n, source, x, y, z); return n; } };
ice.setup(info);
check('buz sistemi kuruldu', ice.active && w.floatMat === M.ICE && ice.cols.length > 1000, `${ice.cols.length} buz kolonu`);

function actor(name, x, y, z) {
  const a = {
    name, mover: new Mover(w), health: 100, armor: 0, alive: true, isPlayer: false, cmd: cmd(),
    lastAttacker: null, lastAttackTime: -1e9, iceWet: false, cold: 0, coldTick: 0, coldDmg: 0, coldOut: 0,
    underIceT: 0, pushT: 0, iceBy: null, iceByT: -1e9, hits: [],
    takeDamage(d, by, wid) { if (!this.alive) return 0; this.hits.push([d, by ? by.name : null, wid]); this.health -= d; if (this.health <= 0) { this.alive = false; this.killer = by; this.killWeapon = wid; } return d; },
  };
  a.mover.reset(x, y, z);
  game.actors.push(a);
  return a;
}
// aktoru (ve buz sistemini) ilerlet
function run(a, secs, c = cmd(), until = null) {
  for (let i = 0; i < secs / dt; i++) {
    game.time += dt;
    a.cmd = c;
    a.mover.simulate(dt, c);
    if (a.alive) ice.actorTick(a, dt);
    if (until && until(a)) return true;
  }
  return false;
}
const iceAt = (X, Z) => { let n = 0; for (let y = WL - 1; y <= WL; y++) if (w.get(X, y, Z) === M.ICE) n++; return n; };
const groundBelow = (X, Z) => { let y = WL - 2; while (y > 1 && !w.get(X, y, Z)) y--; return y; };
// acik gokyuzu altinda, en az minDepth voxel derin su ustunde, iki katli gol buzu (5x5)
function findIce(minDepth, avoid = []) {
  const cols = ice.cols, sx = w.sx;
  for (let k = 0; k < cols.length; k += 7) {
    const c = cols[k], X = c % sx, Z = (c / sx) | 0;
    if (avoid.some(([ax, az]) => Math.hypot(ax - X, az - Z) < 20)) continue;
    if (Math.hypot(X - CX, Z - CZ) < 52) continue;
    let ok = true;
    for (let dz = -3; dz <= 3 && ok; dz++) for (let dx = -3; dx <= 3 && ok; dx++) {
      const x = X + dx, z = Z + dz;
      if (iceAt(x, z) !== 2 || WL - 1 - groundBelow(x, z) < minDepth) ok = false;
      for (let y = TOP; y < TOP + 16 && ok; y++) if (w.get(x, y, z)) ok = false;
    }
    if (ok) return [X, Z];
  }
  return null;
}

// 1) buzu kiran parcalamayi alir: V buzda durur, B altini kirar, V suya duser ve donarak olur
{
  const spot = findIce(6);
  check('derin gol buzu bulundu', !!spot, JSON.stringify(spot));
  const [X, Z] = spot;
  const px = (X + 0.5) * VS, pz = (Z + 0.5) * VS;
  const B = actor('B', px + 30, 20, pz);
  B.alive = true; B.mover.reset(1, 30, 1);
  const V = actor('V', px, TOP * VS + 0.02, pz);
  run(V, 0.3);
  check('buz ustunde durulur (suya batmaz)', V.mover.onGround && !V.mover.inWater && V.mover.groundMat === M.ICE, `y ${V.mover.pos.y.toFixed(2)}`);
  const t0 = game.time;
  const n = game.destruction.blast(px, TOP * VS - 0.15, pz, 1.2, 400, B);
  const c = X + w.sx * Z;
  check('kirilan buz kaydedilir (kim, ne zaman)', n > 20 && ice.breakBy[c] === B && Math.abs(ice.breakT[c] - t0) < 1e-6 && ice.queue.size > 20, `${n} voxel, sira ${ice.queue.size}`);
  const fell = run(V, 2, cmd(), (a) => a.iceWet);
  check('kirik buzdan suya duser', fell && V.iceBy === B, `iceBy ${V.iceBy && V.iceBy.name}`);
  run(V, 12, cmd(), (a) => !a.alive);
  const dmg = V.hits.filter((h) => h[2] === 'cold').map((h) => h[0]);
  const rising = dmg.length >= 4 && dmg[0] === ICE.coldFirst && dmg[1] === ICE.coldFirst + ICE.coldStep && Math.max(...dmg) <= ICE.coldMax;
  check('soguk su: yarim saniyede bir artan hasar', rising, dmg.join(','));
  check('donan aktorun parcalamasi buzu kirana', !V.alive && V.killer === B && V.killWeapon === 'cold', `olen ${!V.alive}, olduren ${V.killer && V.killer.name}, ${V.killWeapon}`);
  // 2) eski delige kendi dusen: parcalama yok (kendini parcalama)
  game.time += ICE.creditFall + 1;
  const W2 = actor('W', px + 0.2, TOP * VS + 0.6, pz - 0.2);
  run(W2, 2, cmd(), (a) => a.iceWet);
  run(W2, 12, cmd(), (a) => !a.alive);
  check('eski delige kendi dusen: parcalama kimsenin degil', !W2.alive && W2.killer === null && W2.iceBy === null, `olduren ${W2.killer && W2.killer.name}`);
  // 3) yeniden donma: delik kenarlarindan kapanir
  game.actors.length = 0; game.actors.push(B);
  let ticks = 0;
  while (ice.queue.size && ticks < 2000) { ice._refreeze(); ticks++; }
  let open = 0;
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) if (iceAt(X + dx, Z + dz) !== 2) open++;
  check('kirik buz yeniden donar', ice.queue.size === 0 && open === 0, `${ticks} adim (${(ticks * ICE.refreezeTick).toFixed(0)} sn), acik ${open}`);
}

// 3b) delikten buzun ustune cikis (su atlayisi): kenara dogru yuzen buzun ustune firlar; yuzu donuk
// (geri geri yuzen: kiyiya yuzerken dusmana bakan bot) da cikar
{
  for (const [name, yaw, fwd] of [['kenara bakarak', -Math.PI / 2, 1], ['sirti donuk, geri geri', Math.PI / 2, -1]]) {
    const spot = findIce(6);
    const [X, Z] = spot;
    game.destruction.blast((X + 0.5) * VS, TOP * VS - 0.1, (Z + 0.5) * VS, 1.2, 400, null);
    const S = actor('S', (X + 0.5) * VS, info.water.y - 1.45, (Z + 0.5) * VS);
    S.health = 1000;
    const out = run(S, 4, cmd({ fwd, yaw, jump: true }), (a) => a.mover.onGround && !a.mover.inWater && a.mover.pos.y > TOP * VS - 0.05);
    check(`delikten buzun ustune cikilir (${name})`, out, `konum ${S.mover.pos.x.toFixed(2)} ${S.mover.pos.y.toFixed(2)} ${S.mover.pos.z.toFixed(2)}, ${(S.hits.length * ICE.coldTick).toFixed(1)} sn sogukta`);
    S.alive = false;
    game.actors.length = 0;
    let t = 0; while (ice.queue.size && t < 2000) { ice._refreeze(); t++; }
  }
}

// 4) buz tavan: altinda yuzen Bosluk'u basili tutar, buz kirilir, yuzeye cikar
{
  const spot = findIce(9);
  check('cok derin gol buzu bulundu', !!spot, JSON.stringify(spot));
  const [X, Z] = spot;
  const px = (X + 0.5) * VS, pz = (Z + 0.5) * VS;
  const U = actor('U', px, (WL - 1) * VS - MOVE.height - 0.15, pz);
  U.health = 1000;
  const before = iceAt(X, Z);
  const pushed = run(U, 1.5, cmd({ jump: true }), (a) => iceAt(X, Z) < before || iceAt(Math.floor(a.mover.pos.x / VS), Math.floor(a.mover.pos.z / VS)) < 2);
  const pushT = game.time;
  const out = run(U, 4, cmd({ jump: true }), (a) => !a.mover.eyesUnder);
  check('buz tavan: Bosluk ile altindan kirilir', pushed && U.underIceT >= 0, `kirildi ${pushed}`);
  check('buz tavan: kirdiktan sonra yuzeye cikar', out, `${(game.time - pushT).toFixed(2)} sn, goz ${U.mover.eyesUnder ? 'su altinda' : 'ustte'}`);
  game.actors.length = 0;
}

// 5) balik deligi donmaz, aktorun icine buz donmaz
{
  const [hx, hz] = FROZEN_LAYOUT.hole;
  game.destruction.blast((hx + 0.5) * VS, TOP * VS - 0.1, (hz + 0.5) * VS, 1.4, 400, null);
  const spot = findIce(6, [[hx, hz]]);
  const [X, Z] = spot;
  game.destruction.blast((X + 0.5) * VS, TOP * VS - 0.1, (Z + 0.5) * VS, 1.2, 400, null);
  const S = actor('S', (X + 0.5) * VS, (WL - 2) * VS, (Z + 0.5) * VS);
  let ticks = 0;
  while (ice.queue.size && ticks < 1500) { ice._refreeze(); ticks++; }
  let holeOpen = 0, inside = 0;
  for (let z = hz - 2; z < hz + 2; z++) for (let x = hx - 2; x < hx + 2; x++) if (iceAt(x, z) === 0) holeOpen++;
  const p = S.mover.pos, r = S.mover.r;
  for (let z = Math.floor((p.z - r) / VS); z <= Math.floor((p.z + r) / VS); z++) for (let x = Math.floor((p.x - r) / VS); x <= Math.floor((p.x + r) / VS); x++) inside += iceAt(x, z);
  check('balik deligi acik kalir', holeOpen === 16, `${holeOpen}/16 kolon acik`);
  check('aktorun govdesine buz donmaz', inside === 0 && ice.queue.size > 0, `govdede ${inside} buz voxeli, sirada ${ice.queue.size}`);
  S.alive = false;
  ticks = 0;
  while (ice.queue.size && ticks < 1500) { ice._refreeze(); ticks++; }
  check('aktor gidince orasi da donar', ice.queue.size === 0, `${ticks} adim`);
}

// 6) kopan buz parcasi yuzer (dibe batmaz): cevresi kesilen buz disk bir ada olarak ayrilmaz
{
  const spot = findIce(6);
  const [X, Z] = spot;
  w.seedCount = 0;
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    w.damageSphere((X + 0.5 + Math.cos(a) * 9) * VS, TOP * VS - 0.25, (Z + 0.5 + Math.sin(a) * 9) * VS, 0.45, 400, { noise: 0 });
  }
  let disc = 0;
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) disc += iceAt(X + dx, Z + dz);
  const seeds = w.seeds.slice(0, w.seedCount), sc = w.seedCount;
  const isl = w.findIslands();
  const iceIsl = isl.filter((ix) => ix.some((i) => w.mat[i] === M.ICE));
  // karsilastirma: yuzme kapali iken ayni disk ada olarak ayrilmali (test anlamli mi)
  w.seeds.set(seeds); w.seedCount = sc;
  const fm = w.floatMat; w.floatMat = 0;
  const isl2 = w.findIslands().filter((ix) => ix.some((i) => w.mat[i] === M.ICE));
  w.floatMat = fm;
  check('kopan buz yuzer', disc > 200 && iceIsl.length === 0 && isl2.length > 0, `disk ${disc} voxel, ada ${iceIsl.length} (yuzmesiz ${isl2.length})`);
}

console.log(fails ? `${fails} HATA` : 'tum buz golu testleri gecti');
process.exitCode = fails ? 1 : 0;
