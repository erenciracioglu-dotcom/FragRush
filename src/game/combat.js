// Atis mantigi (oyuncu ve botlar): anlik isabet, rayli tufek, mermi firlatma.
import * as THREE from 'three';
import { VS, DOOMSDAY } from '../config.js';
import { WEAPONS } from './weapons.js';
import { M } from '../world/materials.js';

const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
const _d = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();

export function spreadDir(dir, spread, out) {
  if (spread <= 0) return out.copy(dir);
  // koni icinde rastgele yon
  let ux = -dir.z, uy = 0, uz = dir.x;
  let l = Math.hypot(ux, uz);
  if (l < 1e-4) { ux = 1; uz = 0; l = 1; }
  ux /= l; uz /= l;
  const vx = dir.y * uz - dir.z * uy, vy = dir.z * ux - dir.x * uz, vz = dir.x * uy - dir.y * ux;
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  out.set(dir.x + ux * ca + vx * sa, dir.y + uy * ca + vy * sa, dir.z + uz * ca + vz * sa).normalize();
  return out;
}

// actor: atan; origin: goz; dir: nisan; muzzle: gorsel namlu noktasi
export function fire(game, actor, origin, dir, muzzle) {
  const ws = actor.weapons;
  const W = ws.def;
  ws.consume();
  actor.lastFireTime = game.time;
  const quad = actor.quad > 0 ? 3 : 1;
  const fx = game.fx;
  if (W.type === 'hitscan') {
    const spread = W.pellets > 1 ? W.spread : Math.min(W.spreadMax, W.spread + ws.heat);
    if (W.spreadPerShot) ws.heat += W.spreadPerShot;
    let soundHit = 0;
    for (let p = 0; p < W.pellets; p++) {
      spreadDir(dir, spread, _d);
      soundHit += traceBullet(game, actor, origin, _d, W, quad, muzzle, p === 0 || Math.random() < 0.3);
    }
  } else if (W.type === 'projectile') {
    game.projectiles.spawn(W, actor, origin, dir, quad, muzzle);
  } else if (W.type === 'rail') {
    railShot(game, actor, origin, dir, W, quad, muzzle);
  }
  const viewer = game.state === 'playing' ? game.player : (game.benchFirstPerson ? game.spectate : null);
  fx.muzzle(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, W.color, W.id === 'shotgun' ? 1.6 : W.id === 'rocket' ? 1.3 : 1, actor === viewer);
  if (game.audio) game.audio.play(W.sound, muzzle.x, muzzle.y, muzzle.z, quad > 1 ? 1.25 : 1, actor.isPlayer);
  game.noise(actor, origin, W.id === 'pulse' || W.id === 'plasma' ? 26 : 40);
}

function traceBullet(game, shooter, o, d, W, quad, muzzle, tracer) {
  const w = game.world;
  const wHit = w.raycast(o.x, o.y, o.z, d.x, d.y, d.z, W.range, _hit);
  const wd0 = wHit ? _hit.dist : W.range;
  // lav yuzeyi mermiyi durdurur
  const lt = game.lavaSys.cross(o.x, o.y, o.z, d.x, d.y, d.z, wd0);
  const wd = lt >= 0 ? lt : wd0;
  let best = null, bestT = wd, bestHead = false;
  for (const a of game.actors) {
    if (a === shooter || !a.alive) continue;
    const r = a.rayHit(o, d, bestT);
    if (r) { best = a; bestT = r.t; bestHead = r.head; }
  }
  const ex = o.x + d.x * bestT, ey = o.y + d.y * bestT, ez = o.z + d.z * bestT;
  if (tracer) waterCross(game, o, d, bestT);
  if (best) {
    const dmg = quad > 1 ? DOOMSDAY.lethal : W.damage * (bestHead ? W.headMul : 1);
    best.takeDamage(dmg, shooter, W.id, d, bestHead);
    if (W.knock) best.mover.impulse(d.x * W.knock * 0.35, Math.max(0, d.y) * W.knock * 0.2 + 0.15 * W.knock, d.z * W.knock * 0.35);
    game.fx.robotHit(ex, ey, ez, d.x, d.y, d.z, best.color, W.pellets > 1 ? 0.5 : 1);
  } else if (lt >= 0) {
    game.fx.impact(ex, ey + 0.02, ez, 0, 1, 0, M.MAGMA, W.pellets > 1 ? 0.4 : 0.8);
  } else if (wHit) {
    game.destruction.chip(_hit, W.voxR, W.voxP * (quad > 1 ? 2 : 1), shooter);
    game.fx.impact(ex - d.x * 0.02, ey - d.y * 0.02, ez - d.z * 0.02, _hit.nx, _hit.ny, _hit.nz, _hit.mat, W.pellets > 1 ? 0.45 : 1);
    if (game.audio && Math.random() < (W.pellets > 1 ? 0.25 : 0.8)) game.audio.impact(_hit.mat, ex, ey, ez);
  }
  if (tracer) game.fx.tracer(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez, W.tracer);
  return best ? 1 : 0;
}

function railShot(game, shooter, o, d, W, quad, muzzle) {
  const w = game.world;
  const step = VS * 0.5;
  let solidLen = 0, end = W.range, lastCarve = -10;
  const maxX = w.sx * VS, maxZ = w.sz * VS, maxY = w.sy * VS;
  let firstWall = -1;
  for (let t = 0.2; t < W.range; t += step) {
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    if (px < 0 || pz < 0 || px >= maxX || pz >= maxZ || py >= maxY) { end = t; break; }
    if (py < 0) { end = t; break; }
    if (w.solidAtWorld(px, py, pz)) {
      if (firstWall < 0) firstWall = t;
      solidLen += step;
      if (t - lastCarve > 0.32) {
        game.destruction.blast(px, py, pz, W.voxR, W.voxP * (quad > 1 ? 2 : 1), shooter, 4, 6, 0.3);
        lastCarve = t;
      }
      if (solidLen > W.pierce) { end = t; break; }
    }
  }
  // yol uzerindeki tum aktorler
  for (const a of game.actors) {
    if (a === shooter || !a.alive) continue;
    const r = a.rayHit(o, d, end);
    if (!r) continue;
    const hx = o.x + d.x * r.t, hy = o.y + d.y * r.t, hz = o.z + d.z * r.t;
    // duvar arkasindaki hedefe biraz daha az hasar
    const behindWall = firstWall >= 0 && firstWall < r.t;
    const dmg = quad > 1 ? DOOMSDAY.lethal : W.damage * (r.head ? W.headMul : 1) * (behindWall ? 0.8 : 1);
    a.takeDamage(dmg, shooter, W.id, d, r.head);
    a.mover.impulse(d.x * W.knock, 1.5, d.z * W.knock);
    game.fx.robotHit(hx, hy, hz, d.x, d.y, d.z, a.color, 1.5);
  }
  const ex = o.x + d.x * end, ey = o.y + d.y * end, ez = o.z + d.z * end;
  waterCross(game, o, d, end, 0.6);
  const lt = game.lavaSys.cross(o.x, o.y, o.z, d.x, d.y, d.z, end);
  if (lt >= 0) game.lavaSys.splash(o.x + d.x * lt, o.z + d.z * lt, 0.5);
  game.fx.rail(muzzle.x, muzzle.y, muzzle.z, ex, ey, ez, W.color);
  if (firstWall >= 0) {
    const fx0 = o.x + d.x * firstWall, fy0 = o.y + d.y * firstWall, fz0 = o.z + d.z * firstWall;
    game.fx.impact(fx0, fy0, fz0, -d.x, -d.y, -d.z, 2, 1.5);
  }
}

// mermi yolu su yuzeyini kesiyorsa orada kucuk sicrama + halka
function waterCross(game, o, d, len, power = 0.22) {
  const ws = game.waterSys;
  if (!ws || !ws.active || Math.abs(d.y) < 1e-4) return;
  const L = game.world.waterY;
  const t = (L - o.y) / d.y;
  if (t <= 0.05 || t >= len) return;
  const x = o.x + d.x * t, z = o.z + d.z * t;
  if (!ws.isWater(x, L - 0.1, z)) return;
  game.fx.splash(x, L, z, power);
  ws.ripple(x, z, 0.25, 0.02);
}

// patlama hasari (roket, plazma). Q3 tarzi: dogrudan vurulan disarida, sicrama hasari mesafeyle azalir.
export function splashDamage(game, x, y, z, W, owner, quad, direct) {
  // KIYAMET roketi: 5 kat yaricap; sahibi kendi patlamasindan hasar almaz (itme yine var)
  const doom = quad > 1 && W.id === 'rocket';
  const R = W.splashR * (doom ? DOOMSDAY.rocketScale : 1);
  for (const a of game.actors) {
    if (!a.alive || a === direct) continue;
    const dist = a.distanceTo(x, y, z);
    if (dist > R) continue;
    const k = 1 - dist / R;
    let dmg = quad > 1 && a === owner ? 0 : W.splashDamage * k * quad * (doom ? 2 : 1);
    a.center(_t1);
    // siper: patlama ile hedef arasinda duvar varsa hasar azalir
    if (!game.world.lineOfSight(x, y, z, _t1.x, _t1.y, _t1.z, _hit)) dmg *= 0.3;
    _t2.set(_t1.x - x, _t1.y - y + 0.4, _t1.z - z);
    const l = _t2.length() || 1;
    _t2.divideScalar(l);
    const kb = W.knock * k * (a === owner ? 1.35 : 1.0);
    a.mover.impulse(_t2.x * kb, _t2.y * kb + (a === owner ? 1.5 : 0.8) * k, _t2.z * kb);
    if (dmg >= 1) a.takeDamage(dmg, owner, W.id, _t2, false);
  }
}

export { WEAPONS };
