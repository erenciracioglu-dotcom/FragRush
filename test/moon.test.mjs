// Ay Ussu testi (tarayicisiz): harita fizigi (ay yercekimi; ziplama ve roket ziplamasi yuksekligi; yumusak tavan;
// obur haritalarda fizik degismez), pedler canaga iner, gezinme agi (dogma noktalari bagli; kubbelere, kuleye ve
// canaga yol), hava kacagi kurallari (fx/moon.js MoonSystem, sahte oyun nesnesiyle): cama atis kubbeyi deler,
// cam panel patlar, icerdeki govde delige emilir ve firlar (vakum hasari, parcalama delene), bosalma biter,
// kopuk yama hacmi yeniden kapatir.
import * as THREE from 'three';
import * as CFG from '../src/config.js';
import { WORLD, VS, MOVE, GRAVITY0, setPhysics } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateMoon, MOON_LAYOUT, MOON_PHYS } from '../src/world/moon.js';
import { generateArena } from '../src/world/mapgen.js';
import { M } from '../src/world/materials.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
import { NavGrid } from '../src/game/nav.js';
import { MoonSystem } from '../src/fx/moon.js';

const seed = Number(process.argv[2] || 777);
const dt = 1 / 120;
const cmd = (o = {}) => ({ fwd: 0, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false, ...o });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

// ---------------------------------------------------------------- fizik: duz deneme dunyasinda ziplama yuksekligi
const flat = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
for (let y = 0; y < 8; y++) for (let z = 0; z < flat.sz; z++) { const o = flat.sx * (z + flat.sz * y); flat.mat.fill(M.STONE || 1, o, o + flat.sx); }
const apex = (vy0, jump = false) => {
  const m = new Mover(flat);
  m.reset(36, 8 * VS + 0.01, 36);
  for (let i = 0; i < 10; i++) m.simulate(dt, cmd());
  const y0 = m.pos.y;
  if (!jump) { m.vel.y = vy0; m.onGround = false; m.groundTime = 1; }
  let top = y0;
  for (let i = 0; i < 12 / dt; i++) {
    m.simulate(dt, cmd({ jump: jump && i < 2 }));
    top = Math.max(top, m.pos.y);
    if (i > 20 && m.onGround) break;
  }
  return top - y0;
};
setPhysics();
const jA = apex(0, true), rA = apex(11);
setPhysics(MOON_PHYS.gravity, MOON_PHYS.move);
const jM = apex(0, true), rM = apex(11);
check('ay yercekimi canli baglantida', CFG.GRAVITY === MOON_PHYS.gravity, `GRAVITY ${CFG.GRAVITY}`);
check('ziplama ~2.5-3 m (arenada ~1.25 m)', jM > 2.4 && jM < 3.1 && jA > 1.1 && jA < 1.4, `ay ${jM.toFixed(2)} m, arena ${jA.toFixed(2)} m`);
check('roket ziplamasi ~3 kat yukseğe', rM / rA > 2.6 && rM / rA < 3.1, `ay ${rM.toFixed(2)} m, arena ${rA.toFixed(2)} m, oran ${(rM / rA).toFixed(2)}`);
{
  flat.ceilY = 9;
  const top = apex(30);
  flat.ceilY = Infinity;
  check('yumusak tavan: tavanin ~5 m ustunde yukselis biter', top + 8 * VS < 9 + 5.6, `tepe ${(top + 8 * VS).toFixed(2)} m, tavan 9 m`);
}

// ---------------------------------------------------------------- harita, obur haritalarin fizigi
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
{
  const a = generateArena(w, seed);
  setPhysics(a.gravity, a.move);
  check('obur haritalarda fizik varsayilan', CFG.GRAVITY === GRAVITY0 && MOVE.jumpVel === 7.4 && MOVE.dashUp === 2.6 && MOVE.maxFallSpeed === 60, `G ${CFG.GRAVITY} jump ${MOVE.jumpVel}`);
}
const info = generateMoon(w, seed);
setPhysics(info.gravity, info.move);
w.ceilY = info.ceilY;
check('ay haritasi fizigi kuruldu', CFG.GRAVITY === 7.7 && MOVE.jumpVel === MOON_PHYS.move.jumpVel && w.ceilY === MOON_LAYOUT.ceil, `G ${CFG.GRAVITY}, tavan ${w.ceilY} m`);
check('basincli hacimler sizdirmiyor', info.moon.leaks.length === 0 && info.moon.volumes.length === 7, info.moon.leaks.join(','));

// ---------------------------------------------------------------- pedler: ay yercekiminde canaga iner
{
  const m = new Mover(w);
  info.pads.forEach((pd, i) => {
    m.reset(pd.x, pd.y + 0.02, pd.z);
    padLaunchVelocity(pd, m.vel);
    m.onGround = false; m.padLock = 0.5;
    let landed = false, t = 0;
    for (let k = 0; k < 8 / dt; k++) { m.simulate(dt, cmd()); t += dt; if (k > 20 && m.onGround) { landed = true; break; } }
    const d = Math.hypot(m.pos.x - pd.tx, m.pos.z - pd.tz), dy = m.pos.y - pd.ty;
    check(`ped ${i}: canaga iner`, landed && d < 1.5 && Math.abs(dy) < 0.6, `uzaklik ${d.toFixed(2)} m, dy ${dy.toFixed(2)}, ${t.toFixed(2)} sn`);
  });
}

// ---------------------------------------------------------------- gezinme agi
{
  const nav = new NavGrid(w);
  nav.jumpUp = info.navJump.up;
  nav.dropMax = info.navJump.drop;
  nav.buildAll();
  for (const p of info.pads) nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
  const G = MOON_LAYOUT.G0 * VS;
  const reach = (name, a, b) => {
    const s = nav.nearest(a[0], a[1] + 0.3, a[2]), g = nav.nearest(b[0], b[1] + 0.3, b[2]);
    const path = nav.findPath(s, g, 60000);
    const ok = !!path && path.length > 0 && path[path.length - 1].id === g;
    check(`gezinme agi: ${name}`, ok, ok ? `${path.length} adim` : `s=${s} g=${g} yol ${path ? path.length : 'yok'}`);
    return ok;
  };
  const [tx, tz] = MOON_LAYOUT.tower;
  const court = [(tx + 0.5) * VS + 7, G, (tz + 0.5) * VS + 7];
  const dish = [(tx + 0.5) * VS + 0.6, MOON_LAYOUT.dishY * VS, (tz + 0.5) * VS + 0.6];
  reach('avludan (ped) canaga', court, dish);
  reach('canaktan avluya', dish, court);
  for (const D of MOON_LAYOUT.domes) {
    const inside = [(D.x + 0.5) * VS + 1.5, G, (D.z + 0.5) * VS + 1.5];
    reach(`avludan ${D.name} kubbesine`, court, inside);
  }
  // dogma noktalari ana aga bagli (gidis-donus)
  let lone = 0;
  for (const s of info.spawns) {
    const a = nav.nearest(s.x, s.y + 0.3, s.z), b = nav.nearest(...court);
    const p1 = nav.findPath(a, b, 60000), p2 = nav.findPath(b, a, 60000);
    if (!p1 || !p1.length || p1[p1.length - 1].id !== b || !p2 || !p2.length || p2[p2.length - 1].id !== a) { lone++; console.log('  bagli degil', JSON.stringify(s)); }
  }
  check('dogma noktalari gezinme agina bagli (gidis-donus)', lone === 0, `${info.spawns.length} nokta, ${lone} bagli degil`);
  // ziplama kenarlari: ay yercekiminde yuksek basamaklar (kule sekileri) ziplanir
  let jumps = 0, high = 0;
  for (let c = 0; c < nav.ncell; c++) for (let k = 0; k < nav.cnt[c]; k++) for (let d = 0; d < 8; d++) {
    const e = (c * 6 + k) * 8 + d;
    if (nav.edge[e] < 0 || nav.etype[e] !== 2) continue;
    jumps++;
    const nx = (c % nav.gx) + [1, -1, 0, 0, 1, 1, -1, -1][d], nz = ((c / nav.gx) | 0) + [0, 0, 1, -1, 1, -1, 1, -1][d];
    const c2 = nx + nz * nav.gx;
    if (nav.ny[c2 * 6 + nav.edge[e]] - nav.ny[c * 6 + k] > 5) high++;
  }
  check('gezinme agi: dusuk yercekiminde yuksek ziplama kenarlari', high > 0, `${jumps} ziplama kenari, ${high} tanesi 1.25 m ustu`);
}

// ---------------------------------------------------------------- hava kacagi (sahte oyun)
const noop = () => {};
const P0 = { count: 0, emit: noop };
const fx = { pm: 1, smoke: P0, add: P0, debris: { count: 0 }, addShake: noop, voxelDebris: noop, dustPuff: noop };
const game = {
  world: w, time: 10, actors: [], fx, audio: null, hud: null, scene: new THREE.Scene(), staticLights: [], state: 'playing',
  destruction: { integrityPending: false }, items: { list: [] }, logEvent: noop, player: null,
};
const ms = new MoonSystem(game);
game.moonSys = ms;
ms.setup(info);
const vG = ms.vols.find((v) => v.name === 'greenhouse');
const D = MOON_LAYOUT.domes[0];
// kubbenin icinde hava hucresi (merkeze en yakin, tabandan ~1.5 m yukarida)
const center = (() => {
  const v = vG, Y = MOON_LAYOUT.G0 + 6 - v.y0;
  let best = null, bd = 1e9;
  for (let lz = 0; lz < v.nz; lz++) for (let lx = 0; lx < v.nx; lx++) {
    if (v.cls[lx + v.nx * (lz + v.nz * Y)] !== 1) continue;
    const d = Math.hypot(lx + v.x0 - D.x, lz + v.z0 - D.z);
    if (d < bd) { bd = d; best = [(lx + v.x0 + 0.5) * VS, (Y + v.y0 + 0.5) * VS, (lz + v.z0 + 0.5) * VS]; }
  }
  return best;
})();
check('hacimler kapali, kubbenin ici basincli, disi vakum', ms.vols.every((v) => v.state === 'sealed') && ms.pressurized(...center) && ms.vacuum(center[0], center[1], center[2] - 12),
  ms.vols.map((v) => v.name).join(','));

function actor(name, x, y, z, health = 100) {
  const a = {
    name, isPlayer: false, alive: true, health, armor: 0, protect: 0, mover: new Mover(w), hits: [], frags: 0,
    spaceT0: -100, spaceBy: null, spaceEjected: false, ventV: null, ventT: -100, pvSpeed: 0,
    takeDamage(dmg, by, wid, dir, head, pierce) { this.hits.push([Math.round(dmg), by ? by.name : null, wid, pierce]); this.health -= dmg; if (this.health <= 0) this.alive = false; },
  };
  a.mover.reset(x, y, z);
  game.actors.push(a);
  return a;
}
// kabukta iki kaburga arasinda cam (sera, guneybati, tabandan 1 m yukarida)
// (isin izleme: tek voxel kalinliktaki kabukta capraz kose gecisi kacmaz)
const glassAt = (phi, Y) => {
  const r0 = D.R - 2.5, h = {};
  const ox = (D.x + 0.5 + Math.cos(phi) * r0) * VS, oz = (D.z + 0.5 + Math.sin(phi) * r0) * VS;
  if (!w.raycast(ox, (Y + 0.5) * VS, oz, Math.cos(phi), 0, Math.sin(phi), 2, h)) return null;
  return h.mat === M.GLASS ? [h.x, h.y, h.z] : null;
};
const phi = Math.PI * 157.5 / 180;
const glass = glassAt(phi, MOON_LAYOUT.G0 + 4);
check('kabukta cam bulundu', !!glass, JSON.stringify(glass));
const shooter = actor('shooter', 4, 4, 4);
const r0 = 15.5;
const victim = actor('victim', (D.x + 0.5 + Math.cos(phi) * r0) * VS, MOON_LAYOUT.G0 * VS + 0.01, (D.z + 0.5 + Math.sin(phi) * r0) * VS, 30);
for (let i = 0; i < 10; i++) victim.mover.simulate(dt, cmd());
const gx = (glass[0] + 0.5) * VS, gy = (glass[1] + 0.5) * VS, gz = (glass[2] + 0.5) * VS;
const n = w.damageSphere(gx, gy, gz, 0.3, 160, { noise: 0 });
ms.onRemoved(w.removed, n, shooter);
check('cama tek atis kubbeyi deler', n > 0 && vG.state === 'venting' && vG.by === shooter && vG.holes.length >= 1 && vG.bursts.length === 1, `${n} voxel, ${vG.holes.length} delik, durum ${vG.state}`);
const glass0 = (() => { let c = 0; for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === M.GLASS) c++; return c; })();
const tick = (t) => {
  for (let i = 0; i < t / dt; i++) {
    game.time += dt;
    for (const a of game.actors) if (a.alive) { a.mover.simulate(dt, cmd()); ms.actorTick(a, dt); }
    ms.update(dt, null);
  }
};
tick(0.25);
const glass1 = (() => { let c = 0; for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === M.GLASS) c++; return c; })();
check('cam panel patlar (delik govde gececek kadar buyur)', glass0 - glass1 > 60 && ms.stats.bursts === 1, `${glass0 - glass1} cam voxeli patladi, ${vG.holes.length} delik`);
const _d = new THREE.Vector3();
const U = ms.flowAt(victim.mover.pos.x, victim.mover.pos.y + 0.9, victim.mover.pos.z, _d);
const toHole = new THREE.Vector3(gx - victim.mover.pos.x, gy - victim.mover.pos.y - 0.9, gz - victim.mover.pos.z).normalize();
check('akis delige dogru', U > 5 && _d.dot(toHole) > 0.6, `U ${U.toFixed(1)} m/s, yon ${_d.dot(toHole).toFixed(2)}`);
tick(3);
check('icerdeki govde delikten firlar, vakum hasari, parcalama delene', victim.spaceEjected && victim.hits.some((h) => h[2] === 'spaced' && h[1] === 'shooter' && h[3] === true) && !victim.alive,
  JSON.stringify(victim.hits) + ` konum (${victim.mover.pos.x.toFixed(1)}, ${victim.mover.pos.y.toFixed(1)}, ${victim.mover.pos.z.toFixed(1)})`);
tick(1.5);
check('bosalma biter: hacim vakum', vG.state === 'vacuum' && !ms.pressurized(...center), vG.state);
tick(26);
let foam = 0;
for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === M.FOAM) foam++;
check('~25 sn sonra kopuk yama, hacim yeniden basincli', vG.state === 'sealed' && foam > 60 && ms.pressurized(...center) && ms.stats.patches === 1, `durum ${vG.state}, ${foam} kopuk voxeli`);
// yamadan sonra: cama yeniden atis yine deler (yama kalici degil, mekanik tekrar kullanilir)
{
  const g2 = glassAt(phi - Math.PI * 30 / 180, MOON_LAYOUT.G0 + 10);
  const n2 = w.damageSphere((g2[0] + 0.5) * VS, (g2[1] + 0.5) * VS, (g2[2] + 0.5) * VS, 0.3, 160, { noise: 0 });
  ms.onRemoved(w.removed, n2, shooter);
  tick(0.1);
  check('yamali kubbe yeniden delinebilir', vG.state === 'venting', `${n2} voxel, durum ${vG.state}`);
}

// basibos tek mermi (darbe tufegi gucu) cami yalniz catlatir; ayni yere ikinci mermi deler
{
  const vC = ms.vols.find((v) => v.name === 'command'), DC = MOON_LAYOUT.domes[1];
  const ph = -Math.PI * 22.5 / 180, r0 = DC.R - 2.5, h = {};
  w.raycast((DC.x + 0.5 + Math.cos(ph) * r0) * VS, (MOON_LAYOUT.G0 + 9.5) * VS, (DC.z + 0.5 + Math.sin(ph) * r0) * VS, Math.cos(ph), 0, Math.sin(ph), 2, h);
  const cx = (h.x + 0.5) * VS, cy = (h.y + 0.5) * VS, cz = (h.z + 0.5) * VS;
  const n1 = w.damageSphere(cx, cy, cz, 0.32, 78, { noise: 0 });
  if (n1) ms.onRemoved(w.removed, n1, shooter);
  const st1 = vC.state;
  const n2 = w.damageSphere(cx, cy, cz, 0.32, 78, { noise: 0 });
  if (n2) ms.onRemoved(w.removed, n2, shooter);
  check('tek basibos mermi cami catlatir, delmez; ikinci mermi deler', h.mat === M.GLASS && n1 === 0 && st1 === 'sealed' && n2 > 0 && vC.state === 'venting', `${n1} / ${n2} voxel, durum ${st1} -> ${vC.state}`);
}

console.log(fails ? `\n${fails} test basarisiz` : '\ntum ay ussu testleri gecti');
process.exit(fails ? 1 : 0);
