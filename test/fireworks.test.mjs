// Fisekhane testi (tarayicisiz):
//  - harita: uretim suresi, voxel sayisi, dunya kutusuna sigma, malzeme kimlikleri (93..106), ayni tohum ayni dunya,
//    sandiklar ve fitiller dunyada tam, havada kalan adacik yok, dogma noktalari gezinme agina bagli (gidis-donus),
//    catilar / kule merdiveni / ogeler ulasilabilir, pedler hedefe iner
//  - kurallar (fx/fireworks.js FireworksSystem + game/destruction.js, sahte oyun nesnesiyle): mermi esigi (100 hasar),
//    zincir sandiktan sandiga yayilir, fisekler firlar, zincirin oldurdugu tetikleyene yazilir ('chain'), kendi zinciri
//    kendini oldurur (selfKills), kredi zinciri sandik -> curuk fisek -> sandik -> fitil -> depo boyunca korunur,
//    fitil 2.5 m/sn, fitili onden kesmek kivilcimi durdurur, depo fitilin sonunda uyari + 1 sn sonra patlar,
//    roket patlamasi sandik ve fitil tutusturur, yenilenme sureleri (sandik 40-60 sn, depo 75-90 sn), icinde biri
//    dururken yenilenmez, mac basi sifirlama, konukta yanan fitil ev sahibi zamaniyla ilerler, bot sorgulari
//    (tehlike, kacis, kendi zincirini baslatan atis, rakibin yanindaki sandiga nisan)
//  - temel: cukurun ustunde yenilenen sandik, fitil ve kirmizi direk altindaki ilk zeminle gelir (havada kalmaz); cati
//    genis capta yikiksa catidaki sandik yenilenmez, kendi patlamasindan sonra (cati cevresi saglam) yenilenir
// usage: node test/fireworks.test.mjs [seed]
import * as THREE from 'three';
import { WORLD, VS, setPhysics } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateFireworks, FW_LAYOUT } from '../src/world/fireworks.js';
import { M, MAT_COUNT, INDESTRUCTIBLE } from '../src/world/materials.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';
import { Destruction } from '../src/game/destruction.js';
import { FireworksSystem, FW_RULES } from '../src/fx/fireworks.js';

const seed = Number(process.argv[2] || 1);
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const hashWorld = (w) => { let h = 2166136261; for (let i = 0; i < w.n; i++) h = Math.imul(h ^ w.mat[i], 16777619); return h >>> 0; };

// ---------------------------------------------------------------- harita
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const t0 = performance.now();
const info = generateFireworks(w, seed);
const tg = performance.now() - t0;
setPhysics(info.gravity, info.move);
{
  let solid = 0, top = 0, maxM = 0, bad = 0;
  for (let i = 0; i < w.n; i++) { const m = w.mat[i]; if (!m) continue; solid++; if (m > maxM) maxM = m; if (m >= MAT_COUNT) bad++; top = Math.max(top, (i / w.sxz) | 0); }
  check('uretim 3 sn altinda', tg < 3000, `${tg.toFixed(0)} ms`);
  check('voxel sayisi makul, dunya kutusuna sigiyor', solid > 300000 && solid < 4000000 && top < w.sy - 4, `${solid} voxel, en ust ${(top * VS).toFixed(1)} m`);
  check('malzeme kimlikleri: yeni malzemeler 93..106 (109-124 gok adalari), MAT_COUNT > 106', MAT_COUNT > 106 && M.FW_CRATE === 93 && M.CORD === 106 && maxM < MAT_COUNT && bad === 0, `en buyuk ${maxM}`);
  const used = new Set(); for (let i = 0; i < w.n; i++) if (w.mat[i] >= 93) used.add(w.mat[i]);
  check('yeni malzemeler dunyada kullaniliyor', used.size >= 12, [...used].sort((a, b) => a - b).join(','));
  const w2 = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const info2 = generateFireworks(w2, seed);
  check('ayni tohum ayni dunya (ev sahibi / konuk ayni haritayi kurar)', hashWorld(w) === hashWorld(w2) && JSON.stringify(info.crates) === JSON.stringify(info2.crates), hashWorld(w).toString(16));
  check('oyun ogeleri: sandiklar, uc fitil, iki depo, dogma, oge, isik, ped', info.crates.length >= 60 && info.fw.fuses.length === 3 && info.fw.depots.length === 2 && info.spawns.length >= 12 && info.items.length >= 6 && info.lights.length >= 6 && info.pads.length === 3 && info.env === 'fireworks',
    `${info.crates.length} sandik, fitil ${info.fw.fuses.map((f) => f.cells.length / 3).join('/')} hucre, ${info.spawns.length} dogma, ${info.items.length} oge, ${info.lights.length} isik`);
  let badC = 0, badF = 0;
  for (const c of info.crates) for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) if (w.mat[w.idx(c.x0 + x, c.y0 + y, c.z0 + z)] !== c.m) badC++;
  for (const f of info.fw.fuses) for (let i = 0; i < f.cells.length; i += 3) if (w.mat[w.idx(f.cells[i], f.cells[i + 1], f.cells[i + 2])] !== M.FUSE) badF++;
  check('sandik ve fitil voxelleri dunyada tam', badC === 0 && badF === 0, `${badC} sandik, ${badF} fitil hatasi`);
  w2.seedRegion(0, 0, 0, w2.sx - 1, w2.sy - 1, w2.sz - 1);
  const isl = w2.findIslands();
  check('havada kalan yapi yok (yapisal butunluk)', isl.length === 0, `${isl.length} adacik`);
}

// ---------------------------------------------------------------- gezinme, pedler
{
  const nav = new NavGrid(w);
  nav.buildAll();
  for (const p of info.pads) nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
  const hub = [144 * VS, FW_LAYOUT.G * VS, 200 * VS];
  const reach = (a, b) => { const s = nav.nearest(a[0], a[1] + 0.3, a[2]), g = nav.nearest(b[0], b[1] + 0.3, b[2]); if (s >= 0 && s === g) return true; const p = s >= 0 && g >= 0 ? nav.findPath(s, g, 80000) : null; return !!p && p.length > 0 && p[p.length - 1].id === g; };
  let lone = 0;
  for (const s of info.spawns) if (!reach([s.x, s.y, s.z], hub) || !reach(hub, [s.x, s.y, s.z])) { lone++; console.log('  bagli degil', s.x.toFixed(1), s.y.toFixed(2), s.z.toFixed(1)); }
  check('dogma noktalari gezinme agina bagli (gidis-donus)', lone === 0, `${info.spawns.length} nokta`);
  const V = (x, y, z) => [(x + 0.5) * VS, y * VS, (z + 0.5) * VS], L = FW_LAYOUT;
  const spots = { 'kuzey cati': V(170, L.ROOF, 40), 'bati cati': V(44, L.ROOF, 150), 'dogu cati': V(246, L.ROOF, 172), 'kule merdiveni': V(130, L.G + 36, 130) };
  for (const [n, p] of Object.entries(spots)) check(`gezinme: ${n} ulasilir (gidis-donus)`, reach(hub, p) && reach(p, hub));
  let far = 0; for (const it of info.items) if (!reach(hub, [it.x, it.y, it.z])) { far++; console.log('  oge ulasilmaz', it.type, it.x.toFixed(1), it.y.toFixed(2), it.z.toFixed(1)); }
  check('ogeler ulasilabilir', far === 0, `${info.items.length} oge`);
  const m = new Mover(w), cmd = { fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false };
  info.pads.forEach((pd, i) => {
    m.reset(pd.x, pd.y + 0.02, pd.z); padLaunchVelocity(pd, m.vel); m.onGround = false; m.padLock = 0.5;
    let landed = false, t = 0;
    for (let k = 0; k < 6 * 120; k++) { m.simulate(1 / 120, cmd); t += 1 / 120; if (k > 20 && m.onGround) { landed = true; break; } }
    const d = Math.hypot(m.pos.x - pd.tx, m.pos.z - pd.tz), dy = m.pos.y - pd.ty;
    check(`ped ${i}: hedefe iner`, landed && d < 1.5 && Math.abs(dy) < 0.6, `uzaklik ${d.toFixed(2)} m, dy ${dy.toFixed(2)}, ${t.toFixed(2)} sn`);
  });
}

// ---------------------------------------------------------------- kurallar: sahte oyun nesnesiyle FireworksSystem
const fx = { pm: 1, impact() {}, voxelDebris() {}, dustPuff() {}, addShake() {}, explosion() {}, smoke: { emit() {} }, add: { emit() {} }, lights: { flash() { return true; } } };
const msgs = [], sent = [];
const mkGame = (world, arena, auth, net = null) => {
  const g = {
    world, scene: new THREE.Scene(), voxelMaterial: new THREE.MeshBasicMaterial(), workers: { workers: [] }, fx, audio: null,
    hud: { centerMsg(s) { msgs.push(s); }, subMsg() {} }, camera: new THREE.PerspectiveCamera(), player: null,
    actors: [], time: 0, frame: 0, arena, state: 'playing', auth, net, iceSys: null, moonSys: null, toySys: null,
    events: [], logEvent(s) { this.events.push(s); }, netEmit(k, ev) { if (k === 'fwSys' && auth) sent.push(ev); },
  };
  g.destruction = new Destruction(g);
  g.fwSys = new FireworksSystem(g);
  g.fwSys.setup(arena);
  return g;
};
const game = mkGame(w, info, true), fw = game.fwSys;
const step = (sec, g = game) => { for (let k = 0, n = Math.max(1, Math.round(sec * 60)); k < n; k++) { g.time += 1 / 60; g.frame++; g.fwSys.update(1 / 60, g.camera); g.destruction.update(1 / 60); } };
let nid = 1;
const mkActor = (name, x, z, y = null, isPlayer = false) => {
  const m = new Mover(w);
  if (y === null) { const X = Math.floor(x / VS), Z = Math.floor(z / VS); y = 4; for (let yy = 90; yy > 1; yy--) if (w.solid(X, yy, Z)) { y = (yy + 1) * VS + 0.02; break; } }
  m.reset(x, y, z);
  const a = {
    id: nid++, name, mover: m, alive: true, health: 100, armor: 0, hurt: [], isPlayer,
    takeDamage(dmg, by, wid) { this.hurt.push([Math.round(dmg), by ? by.name : null, wid]); this.health -= dmg; if (this.health <= 0 && this.alive) { this.alive = false; this.death = [by ? by.name : null, wid]; } return dmg; },
    center(out) { const p = this.mover.pos; return out.set(p.x, p.y + this.mover.h * 0.55, p.z); },
    distanceTo(x, y, z) {
      const p = this.mover.pos, cx = Math.max(p.x - 0.4, Math.min(x, p.x + 0.4)), cy = Math.max(p.y, Math.min(y, p.y + this.mover.h)), cz = Math.max(p.z - 0.4, Math.min(z, p.z + 0.4));
      return Math.hypot(x - cx, y - cy, z - cz);
    },
  };
  game.actors.push(a);
  return a;
};
const reset = () => { fw.matchReset(); game.actors.length = 0; msgs.length = 0; sent.length = 0; };
const crateVox = (c) => { let n = 0; for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) if (w.mat[w.idx(c.x0 + x, c.y0 + y, c.z0 + z)] === c.m) n++; return n; };
const fuseOk = (f) => { let n = 0; for (let k = 0; k < f.n; k++) if (w.mat[f.idx[k]] === M.FUSE) n++; return n === f.n; };
check('kurallar: sabitler (sandik 100 can, fitil 2.5 m/sn, depo uyarisi 1 sn)', FW_RULES.CRATE_HP === 100 && Math.abs(FW_RULES.FUSE_V * VS - 2.5) < 1e-9 && FW_RULES.DEPOT_WARN === 1, JSON.stringify(FW_RULES.REGEN_CRATE) + ' ' + JSON.stringify(FW_RULES.REGEN_DEPOT));

// 1) mermi esigi, zincir, fisekler, kredi (A yerel oyuncu)
{
  const cl = fw.crates.slice(36, 44), c = cl[0];
  const cx = cl.reduce((s, o) => s + o.cx, 0) / 8, cz = cl.reduce((s, o) => s + o.cz, 0) / 8;
  check('guney avlu yigini: 8 sandik birbirine yakin', cl.every((o) => Math.hypot(o.cx - cx, o.cz - cz) < 2.5));
  const A = mkActor('A', cx - 12, cz - 10, null, true);
  const B = mkActor('B', cx, c.z0 * VS - 0.6), B2 = mkActor('B2', c.x0 * VS - 0.6, c.cz);
  const hx = c.cx, hy = c.cy, hz = c.z0 * VS - 0.05;
  fw.onBlast(hx, hy, hz, 0.1, A, 60);
  const st1 = c.st;
  fw.onBlast(hx, hy, hz, 0.1, A, 60);
  check('mermi esigi: 60 hasar tutusturmaz, ikincisi (toplam 120) tutusturur', st1 === 0 && c.st === 1 && c.by === A);
  const s0 = { ...fw.stats };
  step(5);
  const gone = cl.filter((o) => o.st === 2).length;
  check('zincir: yigindaki sandiklar birbirini patlatir', gone === 8, `${gone}/8, en uzun kuyruk ${fw.stats.maxQ}`);
  check('fisekler firlar; patlar ya da curuk duser', fw.stats.shells - s0.shells >= 16 && fw.stats.bursts + fw.stats.duds - s0.bursts - s0.duds >= 8, `${fw.stats.shells - s0.shells} fisek, ${fw.stats.bursts - s0.bursts} patlama, ${fw.stats.duds - s0.duds} curuk`);
  check('zincirin oldurdugu tetikleyene yazilir (silah: chain)', [B, B2].every((v) => !v.alive && v.death && v.death[0] === 'A' && v.death[1] === 'chain') && fw.stats.kills >= 2, JSON.stringify([B.death, B2.death]));
  check('ayni zincirin ikinci oldurmesinde yerel oyuncuya ZINCIRLEME x2 (tekini oyun verir)', msgs.length === 1 && /x2/.test(msgs[0]), JSON.stringify(msgs));
  check('patlayan sandiklar dunyadan silinir, yenilenme 40-60 sn', cl.every((o) => crateVox(o) === 0 && o.regen > 34 && o.regen <= 60));
}

// 2) kendi zinciri kendini oldurur
{
  reset();
  const c = fw.crates[44], k0 = fw.stats.kills, s0 = fw.stats.selfKills;
  const S = mkActor('S', c.cx, c.z0 * VS - 0.6, null, true);
  fw.onBlast(c.cx, c.cy, c.z0 * VS - 0.05, 0.1, S, 120);
  step(4);
  check('kendi zinciri: olum kendine yazilir (frag degil)', !S.alive && S.death[0] === 'S' && S.death[1] === 'chain' && fw.stats.selfKills === s0 + 1 && fw.stats.kills === k0, JSON.stringify(S.death));
}

// 3) fitil: kirmizi direge mermi yakar, 2.5 m/sn, onden kesilince soner (depo patlamaz)
{
  reset();
  const f = fw.fuses[2], d = fw.depots[f.depot], cuts0 = fw.stats.cuts, B = f.box;
  fw.onBlast(B[0] - 0.05, B[1] + 1, (B[2] + B[5]) / 2, 0.1, null, 30);
  const lit = f.st === 1 && f.s0 === 0;
  step(2);
  const v = (f.p - f.s0) * VS / 2;
  check('kirmizi direge mermi fitili bastan yakar; kivilcim 2.5 m/sn', lit && Math.abs(v - 2.5) < 0.1, `${v.toFixed(2)} m/sn`);
  const k = Math.floor(f.p) + 8;
  w.removeIndices([f.idx[k]]);
  step(2);
  check('fitil onden kesilince kivilcim orada soner, depo patlamaz', f.st === 2 && fw.stats.cuts === cuts0 + 1 && f.p < k && d.st === 0, `p ${f.p.toFixed(1)}, kesik ${k}`);
  step(1);
  check('yanan fitil hucreleri silinir (iz kalir), arkadaki saglam', w.mat[f.idx[2]] === 0 && w.mat[f.idx[f.n - 1]] === M.FUSE);
}

// 4) kredi zinciri: curuk fisek -> sandik; sandik -> fitil -> depo (tetikleyen bot A, kurban C depoda)
const G = FW_LAYOUT.G;
const freeSpot = (box, cx, cz) => {
  let best = null, bd = 1e9;
  for (let z = box[2] + 2; z < box[5] - 2; z++) for (let x = box[0] + 2; x < box[3] - 2; x++) {
    let ok = w.solid(x, G - 1, z);
    for (let y = G; y < G + 8 && ok; y++) for (let dz = -2; dz < 2 && ok; dz++) for (let dx = -2; dx < 2 && ok; dx++) if (w.get(x + dx, y, z + dz)) ok = false;
    const dd = Math.hypot(x * VS - cx, z * VS - cz);
    if (ok && dd < bd) { bd = dd; best = [x * VS, G * VS + 0.02, z * VS]; }
  }
  return best;
};
{
  reset();
  const A = mkActor('A', 20, 30);
  const id = fw._newChain(A), c = fw.crates[12];
  const s = fw._mkShell(c.cx, c.cy + 3, c.cz, 7); s.by = A; s.chain = id;
  fw._pop(s, c.x0 * VS - 0.7, c.cy, c.cz);
  check('curuk fisek yanindaki sandigi tutusturur; tetikleyen ve zincir korunur', c.st === 1 && c.by === A && c.chain === id);
  const f = fw.fuses[1], d = fw.depots[f.depot], c62 = fw.crates[62];
  const sp = freeSpot(d.box, d.c[0], d.c[2]) || [d.c[0], G * VS + 0.02, d.c[2]];
  const C = mkActor('C', sp[0], sp[2], sp[1]);
  fw.onBlast(c62.cx, c62.cy, c62.z0 * VS - 0.05, 0.1, A, 100);
  const ch = c62.chain;
  let tLit = -1, tWarn = -1, tBoom = -1;
  for (let k = 0; k < 60 * 60 && tBoom < 0; k++) {
    step(1 / 60);
    if (tLit < 0 && f.st === 1) tLit = game.time;
    if (tWarn < 0 && d.st === 1) tWarn = game.time;
    if (d.st === 2) tBoom = game.time;
  }
  const exp = (f.n - 1 - f.s0) / FW_RULES.FUSE_V;
  check('sandik patlamasi yanindaki fitili yakar (ayni tetikleyen, ayni zincir)', tLit > 0 && f.by === A && f.chain === ch, `s0 ${f.s0}, ${f.n} hucre`);
  check('kivilcim depoya varinca uyari, 1 sn sonra depo patlar', tWarn > 0 && tBoom > 0 && Math.abs(tWarn - tLit - exp) < 0.1 && Math.abs(tBoom - tWarn - 1) < 0.05, `fitil ${(tWarn - tLit).toFixed(2)} sn (beklenen ${exp.toFixed(2)}), uyari ${(tBoom - tWarn).toFixed(2)} sn`);
  check('depo patlamasi depodakini oldurur, tetikleyene yazilir; konuga zincir olayi', !C.alive && C.death && C.death[0] === 'A' && C.death[1] === 'chain' && d.by === A && sent.some((e) => e.k === 'ck' && e.a === A.id), `C merkezden ${Math.hypot(sp[0] - d.c[0], sp[2] - d.c[2]).toFixed(1)} m, ${JSON.stringify(C.hurt.slice(0, 2))}`);
  check('depo yikilir, yenilenme 75-90 sn', fw._depotDiff(d, 500) >= 500 && d.regen > 70 && d.regen <= 90, `${d.regen.toFixed(1)} sn`);
  step(91);
  check('depo 90 sn icinde anlik goruntuden aynen kurulur, fitili de', d.st === 0 && fw._depotDiff(d) === 0 && fuseOk(f) && f.st === 0, `fark ${fw._depotDiff(d)}`);
}

// 5) roket (destruction.blast kancasi) sandik ve fitil tutusturur; yenilenme ve yerinde duran
{
  reset();
  const R = mkActor('R', 10, 40);
  const cl = fw.crates.slice(52, 60), c0 = cl[0];
  game.destruction.blast(c0.cx, c0.cy, c0.z0 * VS - 0.8, 2.0, 600, R);
  const lit = cl.filter((o) => o.st === 1);
  check('roket patlamasi yakindaki sandiklari tutusturur (tetikleyen roketci)', lit.length >= 1 && lit.every((o) => o.by === R), `${lit.length} sandik`);
  const f = fw.fuses[0], k = f.n >> 1, P = f.pos;
  game.destruction.blast(P[k * 3], P[k * 3 + 1] + 0.3, P[k * 3 + 2], 2.0, 600, R);
  check('roket fitili ortasindan yakar (depoya en yakin hucreden)', f.st === 1 && f.s0 >= k && f.by === R, `s0 ${f.s0} / ${f.n}`);
  step(5);
  const Rg = mkActor('Rg', c0.cx, c0.cz, c0.y0 * VS + 0.02);
  step(61);
  const back = cl.filter((o) => o !== c0 && o.st === 0).length;
  check('sandiklar 40-60 sn sonra yerine gelir; yerinde biri dururken beklenir', c0.st === 2 && back >= 4, `${back}/7 geri, yenilenen ${fw.stats.regens}`);
  Rg.alive = false;
  step(1.5);
  check('yerindeki kalkinca sandik yerine konur', c0.st === 0 && crateVox(c0) === 48);
}

// 6) mac basi sifirlama
{
  fw.benchChain(null);
  step(3);
  const busy = fw.shells.length + fw.fizz.size;
  fw.matchReset();
  const bad = fw.crates.filter((c) => c.st !== 0 || crateVox(c) !== 48).length + fw.fuses.filter((f) => f.st !== 0 || !fuseOk(f)).length + fw.depots.filter((d) => d.st !== 0 || fw._depotDiff(d) !== 0).length;
  check('mac basi sifirlama: sandik, fitil, depo tam; ucan fisek ve cizirti yok', busy > 0 && bad === 0 && fw.shells.length === 0 && fw.fizz.size === 0, `${busy} etkin oge, ${bad} hata`);
}

// 7) konuk: ev sahibi durumu ve olaylari
{
  const w3 = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z), info3 = generateFireworks(w3, seed);
  let hostT = 0;
  const g2 = mkGame(w3, info3, false, { role: 'guest', myId: 77, hostNow: () => hostT }), fw2 = g2.fwSys;
  reset();
  fw._light(fw.fuses[0], 3, null, 0);
  fw2.applyNetState(fw.netState());
  hostT = game.time + 2;
  step(1 / 60, g2);
  check('konuk: yanan fitilin kivilcimi ev sahibi zamaniyla ilerler', fw2.fuses[0].st === 1 && Math.abs(fw2.fuses[0].p - 23) < 0.6, `p ${fw2.fuses[0].p.toFixed(2)}`);
  sent.length = 0;
  fw._launch(36.25, 30.5, 40.75, 4242, null, 0);
  const e = sent.find((v) => v.k === 'sh');
  fw2.onNetEvent(e);
  const hs = fw.shells[fw.shells.length - 1], gs = fw2.shells[fw2.shells.length - 1];
  for (let k = 0; k < 30; k++) { step(1 / 60); step(1 / 60, g2); }
  const dd = Math.hypot(hs.x - gs.x, hs.y - gs.y, hs.z - gs.z);
  check('konuk: fisek ayni tohumla ayni yolu izler', !!e && dd < 1e-3, `fark ${dd.toExponential(1)} m`);
  const m0 = msgs.length;
  fw2.onNetEvent({ k: 'ck', a: 77, n: 2 });
  fw2.onNetEvent({ k: 'ck', a: 5, n: 1 });
  check('konuk: kendi zincir oldurmesinde mesaj (baskasininkinde degil)', msgs.length === m0 + 1 && fw2.netStats.ck === 2 && fw2.netStats.sh === 1 && fw2.netStats.st === 1, msgs[msgs.length - 1]);
}

// 8) bot sorgulari
{
  reset();
  const ny = G * VS, cl = fw.crates.slice(44, 52), c = cl[0];
  fw._ignite(c, null, 0, 0, [5, 5]);
  check('bot: tutusmus sandigin yani tehlikeli, uzagi degil', fw.dangerAt(c.cx + 1.5, ny, c.cz) && !fw.dangerAt(c.cx + 12, ny, c.cz));
  const st = fw.botSteer({ mover: { pos: new THREE.Vector3(c.cx, ny, c.z0 * VS - 1.2) }, target: null, mode: 'roam' }, 0, 1);
  check('bot: tutusmus sandiktan kacar', !!st && st[2] === true && st[1] < 0, JSON.stringify(st && st.map((v) => +(+v).toFixed(2))));
  reset();
  const dir = new THREE.Vector3(0, 0, 1), eye = new THREE.Vector3(c.cx, c.cy, c.z0 * VS - 2.5), b2 = { mover: { pos: new THREE.Vector3(eye.x, ny, eye.z) } };
  const near = fw.shotUnsafe(b2, eye, dir, { id: 'rifle' });
  eye.z = c.z0 * VS - 14; b2.mover.pos.z = eye.z;
  const far = fw.shotUnsafe(b2, eye, dir, { id: 'rifle' });
  check('bot: 4.5 m icindeki sandiga ates etmez, uzaktan eder', near === true && far === false);
  const E = mkActor('E', c.cx, c.z0 * VS - 1.5);
  const bp = new THREE.Vector3(c.cx, ny, c.z0 * VS - 14);
  const bb = { mover: { pos: bp }, mem: new Map([[E, { visible: true, t: game.time }]]), eye(o) { return o.set(bp.x, bp.y + 1.6, bp.z); }, skill: { breach: 1, reaction: 0.3 }, weapons: { ammo: [50, 0, 0, 0, 0] }, mapAim: null, fwCd: 0 };
  const rnd0 = Math.random; Math.random = () => 0.1;
  try { fw.botThink(bb, game.time); } finally { Math.random = rnd0; }
  const ma = bb.mapAim;
  check('bot: rakibin dibindeki sandiga nisan alir (mapAim)', !!ma && ma.w === 0 && Math.hypot(ma.x - E.mover.pos.x, ma.z - E.mover.pos.z) < 3.2 && ma.ok(), ma ? `${ma.x.toFixed(1)}, ${ma.z.toFixed(1)}` : 'yok');
}

// ---------------------------------------------------------------- temel: cukurun / yikik catinin ustunde havada sandik ve fitil kalmaz
{
  reset();
  const G = FW_LAYOUT.G;
  const dig = (x0, x1, y0, y1, z0, z1) => {           // kirilabilir voxelleri sil, geri koymak icin listesini dondur
    const rem = [], back = [];
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const i = w.idx(x, y, z), m = w.mat[i]; if (m && !INDESTRUCTIBLE[m]) { rem.push(i); back.push(x, y, z, m); } }
    if (rem.length) w.removeIndices(rem);
    return back;
  };
  const holes = (x0, x1, y0, y1, z0, z1) => { let n = 0; for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!w.mat[w.idx(x, y, z)]) n++; return n; };
  // 1) yerdeki sandik: altindaki ve 0.75 m cevresindeki zemin anakayaya kadar oyulur; yenilenince temeli ilk haliyle gelir
  const c = fw.crates.find((o) => !o.on.length && o.y0 === G);
  dig(c.x0 - 3, c.x0 + 6, 2, c.y0 - 1, c.z0 - 3, c.z0 + 6);
  fw._clearCrate(c); c.st = 2; c.regen = 0.01;
  const h0 = holes(c.x0 - 3, c.x0 + 6, 2, c.y0 - 1, c.z0 - 3, c.z0 + 6);
  step(0.2);
  const h1 = holes(c.x0 - 3, c.x0 + 6, 2, c.y0 - 1, c.z0 - 3, c.z0 + 6);
  check('cukurun ustunde yenilenen sandik havada kalmaz: alti ve cevresi ilk haliyle dolar', h0 > 300 && c.st === 0 && crateVox(c) === 48 && h1 === 0, 'cukur ' + h0 + ' voxel, sonra bos ' + h1 + ', durum ' + c.st);
  // 2) fitil: ortasindaki 6 hucre ve altlari oyulur; yenilenen fitil altindaki zeminle gelir
  const f = fw.fuses[1], k0 = f.n >> 1;
  for (let k = k0 - 3; k < k0 + 3; k++) { const i = f.idx[k], y = (i / w.sxz) | 0, r = i - y * w.sxz, z = (r / w.sx) | 0, x = r - z * w.sx; dig(x, x, 2, y, z, z); }
  const under = () => Array.from(f.idx.slice(k0 - 3, k0 + 3)).filter((i) => !w.mat[i - w.sxz]).length;
  const fg0 = under();
  f.st = 2; f.regen = 0.01;
  step(0.2);
  const fg1 = under();
  check('cukurun ustunde yenilenen fitil havada kalmaz', fg0 === 6 && f.st === 0 && fuseOk(f) && fg1 === 0, 'once alti bos ' + fg0 + '/6, sonra ' + fg1 + '/6, durum ' + f.st);
  // 3) kirmizi direk: tabani oyulmus direk temeliyle yenilenir
  const P = info.fw.fuses[1].post, pa = P[0], pb = P[1], pc = P[2], pd = P[3], pg = P[5];
  dig(pa - 1, pd, 2, pb + 9, pc - 1, pg);
  f.st = 2; f.regen = 0.01;
  step(0.2);
  const ph = holes(pa, pd - 1, 2, pb - 1, pc, pg - 1);
  check('kirmizi direk tabaniyla yenilenir (havada kalmaz)', f.st === 0 && ph === 0 && w.mat[w.idx(pa, pb, pc)] === M.FUSE_POST, 'taban bos ' + ph);
  // 4) catidaki sandik: cati genis capta yikiksa yenilenmez (yamasi havada kalirdi); cati onarilinca yenilenir
  reset();
  const rc = fw.crates.find((o) => o.y0 === FW_LAYOUT.ROOF);
  const back = dig(rc.x0 - 14, rc.x0 + 17, rc.y0 - 6, rc.y0 - 1, rc.z0 - 14, rc.z0 + 17);
  fw._clearCrate(rc); rc.st = 2; rc.regen = 0.01;
  step(1.5);
  const waited = rc.st === 2 && crateVox(rc) === 0;
  fw.matchReset();
  const mr = rc.st === 2 && crateVox(rc) === 0;
  w.depositMany(back, back.length);
  step(1.5);
  check('yikik catidaki sandik yenilenmez (mac basinda da), cati yerindeyse yenilenir', back.length > 4000 && waited && mr && rc.st === 0 && crateVox(rc) === 48, 'cati ' + back.length / 4 + ' voxel, bekledi ' + waited + ', mac basi ' + mr + ', durum ' + rc.st);
  // 5) ayni sandik kendi patlamasindan sonra (cati cevresi saglam) yenilenir: yamasi catiya bagli
  reset();
  fw._ignite(rc, null, 0, 0, [0.05, 0.05]);
  step(3);                                             // yanindaki iki cati sandigi da zincirle patlar
  const lit = fw.crates.filter((o) => o.y0 === FW_LAYOUT.ROOF).every((o) => o.st === 2);
  fw.shells.length = 0;                                // havadaki curuk fisekler yeni sandigi yeniden yakmasin
  rc.regen = 0.01;
  step(1.2);
  check('catidaki sandik kendi patlamasindan sonra yenilenir (yamasi catiya bagli)', lit && rc.st === 0 && crateVox(rc) === 48, 'patladi ' + lit + ', durum ' + rc.st);
  reset();
}

console.log(fails ? `\n${fails} FAIL` : '\nhepsi OK');
process.exit(fails ? 1 : 0);
