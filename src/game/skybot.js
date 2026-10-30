// Gok adalari bot davranisi (game/bot.js'ten cagrilir, yalniz harita 'sky'):
//  - bosluk lav gibi: kosu / ziplama / atilmanin inisi bulut altindaysa yapilmaz; hiz bosluga goturuyorsa fren (havada
//    da; darbeyle firlatilinca ilk anlarda sersem: bosluga itmek oyunun parcasi)
//  - tahliye: bastigi ada kirilma uyarisindaysa gezinme agi uzerinden en yakin ayakta adaya (kopru, kemer ya da ped)
//  - kristal: rakibin bulundugu adanin kristali gorus hattindaysa ve kristal zayifsa ya da elinde roket / ray varsa
//    kristale ates eder (kendi adasininkine asla)
import * as THREE from 'three';
import { VS, MOVE, GRAVITY } from '../config.js';
import { KILL_Y, BRIDGES, bridgeY } from '../world/sky.js';
import { PH } from '../fx/sky-islands.js';
import { EDGE_JUMP, EDGE_DROP } from './nav.js';

const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
const _e = new THREE.Vector3();

// (x,y,z)'den (ux,uz) yonunde dist metre kosulursa bulut altina dusulur mu; zemin izlenir (adim kadar cikar, ~0.7 m
// iner; daha cok dusuyorsa o noktadan dusus yorungesine bakar). Duvar / korkuluk ilerlemeyi keser (bosluk degil).
export function voidRun(w, x, y, z, ux, uz, dist, speed, depth = 0) {
  const n = Math.max(1, Math.ceil(dist / VS)), st = dist / n;
  for (let i = 1; i <= n; i++) {
    const px = x + ux * st * i, pz = z + uz * st * i, X = Math.floor(px / VS), Z = Math.floor(pz / VS);
    const top = Math.floor((y + MOVE.stepHeight) / VS) - 1, bot = Math.max(0, Math.floor((y - 0.7) / VS));
    let gy = -1;
    for (let vy = top; vy >= bot; vy--) if (w.solid(X, vy, Z)) { gy = vy + 1; break; }
    if (gy < 0) return voidTraj(w, px, y, pz, ux * speed, 0, uz * speed, depth < 2 ? 0.3 : 0, depth + 1);
    if (w.solid(X, gy, Z) || w.solid(X, gy + 2, Z) || w.solid(X, gy + 5, Z)) return false;
    y = gy * VS;
  }
  return false;
}
// (x,y,z)'den (vx,vy,vz) hiziyla serbest ucus: bulut altina inerse true. margin > 0: inis yerinden kayma da taranir
export function voidTraj(w, x, y, z, vx, vy, vz, margin = 0, depth = 0) {
  const sh = Math.hypot(vx, vz);
  for (let t = 0; t < 2.4;) {
    const dt = Math.min(0.035, 0.22 / Math.max(1, sh, Math.abs(vy)));
    t += dt;
    vy = Math.max(-MOVE.maxFallSpeed, vy - GRAVITY * dt);
    const nx = x + vx * dt, ny = y + vy * dt, nz = z + vz * dt;
    if (ny < KILL_Y + 0.4) return true;
    if (sh > 0.5) {
      // govdenin onu (merkezden ~0.4 m once) duvara / kenarin yan yuzune degiyor: yatay hiz biter, buradan dusus;
      // ~2 m icinde zemin yoksa bosluk (merkez noktasi kenarin ustunden gecip "indi" sanmasin)
      const fx = nx + vx / sh * 0.4, fz = nz + vz / sh * 0.4;
      if (w.solidAtWorld(fx, ny + 0.3, fz) || w.solidAtWorld(fx, ny + 1.2, fz)) {
        for (let yy = ny; yy > Math.max(KILL_Y, ny - 2); yy -= VS) if (w.solidAtWorld(nx, yy, nz)) return false;
        return true;
      }
    }
    if (nx < 0 || nz < 0 || nx >= w.sx * VS || nz >= w.sz * VS) {
      // dunya siniri (gorunmez duvar): onunde dikey dusus
      for (let yy = y; yy > KILL_Y; yy -= VS) if (w.solidAtWorld(x, yy, z)) return false;
      return true;
    }
    if (w.solidAtWorld(nx, ny, nz)) {
      const ty = (Math.floor(ny / VS) + 1) * VS;
      if (vy > 0 || ty > y + 1e-3) {
        // duvar / tavan: yatay hiz biter, buradan asagi dusus; zemin ~2 m icinde yoksa bosluk (adanin yan / alt
        // yuzunden kayip duser; altta kristal ya da daha alcak bir ada parcasi olsa da guvenli inis sayilmaz)
        for (let yy = y; yy > Math.max(KILL_Y, y - 2); yy -= VS) if (w.solidAtWorld(x, yy, z)) return false;
        return true;
      }
      if (margin > 0 && sh > 0.5 && depth < 4) return voidRun(w, nx, ty, nz, vx / sh, vz / sh, margin + sh * 0.06, sh, depth + 1);
      return false;
    }
    x = nx; y = ny; z = nz;
  }
  return false;
}
// _blocked icin: bu yonde yurumek bosluga goturur mu
export function voidAhead(bot, ux, uz) {
  const p = bot.mover.pos;
  return voidRun(bot.game.world, p.x, p.y, p.z, ux, uz, 1.3, MOVE.runSpeed * bot.mover.speedMul * 0.6);
}

// adadan cikis noktalari: koprulerin komsu adaya kalan yarisi (ada kutusunun 4 voxel disi) ve baska ayakta adaya
// atan pedler
function exitsOf(game, sky, isl) {
  const out = [], b = isl.def.box, i = isl.id;
  for (const B of BRIDGES) {
    if (B.i0 !== i && B.i1 !== i) continue;
    const o = B.i0 === i ? B.i1 : B.i0;
    if (sky.isles[o].phase !== PH.UP) continue;
    const s = B.i0 === i ? (B.axis === 'z' ? b[3] : b[2]) + 4 : (B.axis === 'z' ? b[1] : b[0]) - 4;
    const y = bridgeY(B, (s - B.s0) / (B.s1 - B.s0)) + 1;
    out.push({ x: (B.axis === 'z' ? B.a + 4 : s) * VS, y: y * VS, z: (B.axis === 'z' ? s : B.a + 4) * VS });
  }
  for (const pd of game.arena.pads || []) {
    if (pd.from === i && pd.to !== i && sky.isles[pd.to] && sky.isles[pd.to].phase === PH.UP) out.push({ x: pd.x, y: pd.y, z: pd.z });
  }
  return out;
}

// gozden kristale gorus: isinin ilk carptigi sey kristalse nisan noktasi (yoksa null)
const _us = [0.55, 0.3, 0.8];
function crystalSight(w, ex, ey, ez, isl, maxD, out) {
  const c = isl.def.crystal;
  for (const u of _us) {
    const x = c.x, y = c.y0 + (c.y1 - c.y0) * u, z = c.z;
    const dx = x - ex, dy = y - ey, dz = z - ez, d = Math.hypot(dx, dy, dz);
    if (d > maxD || d < 3) continue;
    if (!w.raycast(ex, ey, ez, dx / d, dy / d, dz / d, d + 1, _hit) || _hit.mat !== c.mat) continue;
    out.x = x; out.y = y; out.z = z; out.d = d; out.i = isl.id;
    return out;
  }
  return null;
}

// kristali goren yakin bir durus noktasi (gezinme dugumu): botun ~14 m cevresinde, o adanin disinda (ayakta baska
// bir ada, kopru yarisi ya da bulut tasi). Yakindan uzaga halka halka, en cok 36 isin
function vantage(bot, sky, isl) {
  const g = bot.game, nav = g.nav, w = g.world, p = bot.mover.pos, c = isl.def.crystal;
  const CELL = Math.round(w.sx / nav.gx), L = Math.round(nav.ny.length / nav.ncell);
  const cx0 = Math.floor(p.x / (CELL * VS)), cz0 = Math.floor(p.z / (CELL * VS));
  const q = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0, d: 0, i: 0 };
  let rays = 0;
  for (let r = 1; r <= 14; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || ((dx + dz) & 1)) continue;
      const cx = cx0 + dx, cz = cz0 + dz;
      if (cx < 0 || cz < 0 || cx >= nav.gx || cz >= nav.gz) continue;
      const cell = cx + cz * nav.gx;
      for (let k = 0; k < nav.cnt[cell]; k++) {
        nav.nodePos(cell * L + k, q);
        if (Math.hypot(q.x - c.x, q.z - c.z) > 30) continue;
        const u = sky.isleUnder(q);
        if (u === isl || (u && u.phase !== PH.UP)) continue;
        if (!u && !g.world.solidAtWorld(q.x, q.y - 0.1, q.z)) continue;
        if (++rays > 36) return null;
        if (crystalSight(w, q.x, q.y + 1.6, q.z, isl, 34, at)) return { x: q.x, y: q.y, z: q.z };
      }
    }
  }
  return null;
}

const _cnt = new Float32Array(16);
function sight(bot, isl, out) { bot.eye(_e); return crystalSight(bot.game.world, _e.x, _e.y, _e.z, isl, 46, out); }
function hold(bot, pos) { bot.mode = 'retreat'; bot.goalItem = { active: true, pos: { x: pos.x, y: pos.y, z: pos.z }, sky: true }; }

// think() icinden (her ~0.1 sn): tahliye, kristal saldirisi karari / suresi, durus noktasina yurume
export function skyThink(bot, now) {
  const g = bot.game, sky = g.skySys, p = bot.mover.pos;
  if (bot.skyD !== bot.deaths) { bot.skyD = bot.deaths; bot.skyT = 0; bot.skyGo = null; bot.skyEvac = null; bot.skyCd = now + 2 + Math.random() * 6; }
  const own = sky.isleUnder(p);
  bot.skyIsle = own ? own.id : -1;
  // bastigi ada kirilma uyarisinda: en yakin cikisa (kopru yarisi / ped) kos
  if (own && own.phase === PH.WARN) {
    if (!bot.skyEvac || bot.skyEvac.i !== own.id) {
      let best = null, bd = 1e9;
      for (const e of exitsOf(g, sky, own)) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      bot.skyEvac = { i: own.id, pos: best };
    }
    bot.skyT = 0; bot.skyGo = null;
    if (bot.skyEvac.pos) hold(bot, bot.skyEvac.pos);
    return;
  }
  bot.skyEvac = null;
  // suren saldiri: kristal hala ayakta ve gorunur mu; yakindan vurulursa birak (once kendini koru)
  if (bot.skyT > 0) {
    bot.skyT -= 0.1;
    const isl = sky.isles[bot.skyAt.i];
    if (isl.phase !== PH.UP || bot.skyIsle === isl.id || (bot.mode === 'engage' && now - bot.lastHurtTime < 0.5 && bot.targetDist() < 12) ||
      !sight(bot, isl, bot.skyAt)) { bot.skyT = 0; bot.skyCd = now + 3 + Math.random() * 3; return; }
    if (bot.mode !== 'engage') hold(bot, p);
    return;
  }
  // durus noktasina yuruyor: kristal gorununce saldir
  if (bot.skyGo) {
    const isl = sky.isles[bot.skyGo.i];
    if (bot.mode === 'engage' || now > bot.skyGo.until || isl.phase !== PH.UP) bot.skyGo = null;
    else if (sight(bot, isl, bot.skyAt || (bot.skyAt = {}))) { bot.skyGo = null; start(bot, now); return; }
    else { hold(bot, bot.skyGo.pos); return; }
  }
  if (now < (bot.skyCd || 0)) return;
  bot.skyCd = now + 0.7 + Math.random() * 0.7;
  // rakiplerin bulundugu (son 3 sn'de goruldugu) ayakta adalar; zayif kristal daha cekici
  _cnt.fill(0);
  for (const [a, rec] of bot.mem) {
    if (!a.alive || now - rec.t > 3) continue;
    const isl = sky.isleUnder(rec);
    if (!isl || isl.phase !== PH.UP || isl.id === bot.skyIsle) continue;
    _cnt[isl.id] += a.isPlayer ? 1.3 : 1;
  }
  let best = null, bs = 0;
  for (const isl of sky.isles) {
    if (!_cnt[isl.id]) continue;
    const s = _cnt[isl.id] * (1.7 - isl.hp / isl.maxHp);
    if (s > bs) { bs = s; best = isl; }
  }
  if (!best) return;
  const ws = bot.weapons, heavy = ws.ammo[3] > 0 || ws.ammo[4] > 0, weak = best.hp < best.maxHp * 0.3;
  if (!heavy && !weak) return;
  if (Math.random() > 0.3 + bot.skill.breach * 0.5 + (weak ? 0.25 : 0)) { bot.skyCd = now + 3 + Math.random() * 4; return; }
  if (sight(bot, best, bot.skyAt || (bot.skyAt = {}))) { start(bot, now); return; }
  // gorunmuyorsa ara sira yakin bir durus noktasina git (catisma yokken)
  if (bot.mode !== 'engage' && heavy && Math.random() < 0.45) {
    const v = vantage(bot, sky, best);
    if (v) { bot.skyGo = { i: best.id, pos: v, until: now + 9 }; hold(bot, v); return; }
  }
  bot.skyCd = now + 4 + Math.random() * 5;
}
function start(bot, now) {
  bot.skyT = 3.5 + Math.random() * 2.5;
  bot.reactT = bot.skill.reaction * 0.8;
  bot.skyCd = now + 9 + Math.random() * 9;
  if (bot.mode !== 'engage') hold(bot, bot.mover.pos);
}

// chooseWeapon icin: kristale en iyi silah (roket, ray; kristal zayifsa obur silahlar)
export function skyWeapon(ws) {
  const has = (i) => ws.ammo[i] > 0;
  return has(3) ? 3 : has(4) ? 4 : has(0) ? 0 : has(2) ? 2 : ws.bestAvailable();
}

// tryFire icin: kristale nisan oturunca ates (tepki suresi sonra)
export function skyFire(bot, dt) {
  if (bot.reactT > 0) { bot.reactT -= dt; return false; }
  return bot.aimDelta <= 0.05 && bot.weapons.pending < 0;
}

// steer() sonunda: bosluk korumasi (lav korumasinin esi; zemin izlenir, hiz da denetlenir) ve tahliyede atilma
//  - hiz bosluga goturuyorsa fren (havada da; darbeyle firlatilinca ilk anlarda sersem, ped ucusuna karisma)
//  - istenen yon bosluga goturuyorsa yan yonler, olmazsa dur
//  - ziplama / atilma: inis yeri bulut altindaysa yapma
const _o = { mx: 0, mz: 0, jump: false, dash: false };
export function skySteer(bot, dt, mx, mz, jump, dash) {
  const g = bot.game, w = g.world, m = bot.mover, p = m.pos, v = m.vel, sk = bot.skill;
  const s = Math.hypot(v.x, v.z), ws = MOVE.runSpeed * m.speedMul;
  if (bot.skyEvac && bot.skyEvac.pos && m.onGround && (mx || mz) && Math.random() < (0.25 + sk.dodge) * dt * 3) dash = true;
  if (m.padLock > 0) bot.padFlightT = 1.8;
  if (m.onGround && bot.padFlightT > 0 && m.padLock <= 0) bot.padLandT = 0.45;
  bot.padFlightT = m.onGround ? 0 : Math.max(0, (bot.padFlightT || 0) - dt);
  // ped inisi: ucusun hizi (20+ m/s) adanin karsi kenarindan kaydirmasin; once fren
  if (m.onGround && bot.padLandT > 0) {
    bot.padLandT -= dt;
    if (s > 1.5) { _o.mx = -v.x / s; _o.mz = -v.z / s; _o.jump = false; _o.dash = false; bot.skyGuard = 5; return _o; }
  }
  // ped ucusu: yorungeye karisma (havada yon girdisi ucusu metrelerce saptirir, hedef adayi iskalatir)
  if (!m.onGround && bot.padFlightT > 0) { _o.mx = 0; _o.mz = 0; _o.jump = false; _o.dash = false; bot.skyGuard = 3; return _o; }
  let brake = false;
  if (!m.onGround) {
    if (s > 0.5 && bot.padFlightT <= 0 && g.time - bot.lastHurtTime > 0.45 && voidTraj(w, p.x, p.y, p.z, v.x, v.y, v.z, 0.3)) {
      // simdiki yorunge bosluga: fren inisi kurtariyorsa fren; kurtarmiyorsa ileri (bosluk ustunden atlarken fren botu
      // bosluga dusurur), o da kurtarmiyorsa girdi yok (hizini koru)
      const q = MOVE.airAccel * ws * 0.45, kb = Math.max(0, s - q) / s, kf = s >= ws ? 1 : Math.min(ws, s + q) / s;
      if (!voidTraj(w, p.x, p.y, p.z, v.x * kb, v.y, v.z * kb, 0.3)) brake = true;
      else {
        const fw = kf > 1 && !voidTraj(w, p.x, p.y, p.z, v.x * kf, v.y, v.z * kf, 0.3);
        _o.mx = fw ? v.x / s : 0; _o.mz = fw ? v.z / s : 0; _o.jump = false; _o.dash = false; bot.skyGuard = fw ? 6 : 7; return _o;
      }
    }
  } else if (s > 0.8 && voidRun(w, p.x, p.y, p.z, v.x / s, v.z / s, 0.45 + s * 0.1, s)) brake = true;
  if (brake) {
    mx = -v.x / Math.max(s, 1e-3); mz = -v.z / Math.max(s, 1e-3);
    jump = false; dash = false; bot.detourT = 0;
    bot.skyGuard = 2;
  } else if (!m.onGround && (mx !== 0 || mz !== 0) && bot.padFlightT <= 0 && g.time - bot.lastHurtTime > 0.45 &&
    (voidTraj(w, p.x, p.y, p.z, v.x + mx / Math.hypot(mx, mz) * MOVE.airAccel * ws * 0.45, v.y, v.z + mz / Math.hypot(mx, mz) * MOVE.airAccel * ws * 0.45, 0.3) ||
     voidTraj(w, p.x, p.y, p.z, mx / Math.hypot(mx, mz) * Math.max(s, ws * 0.5), v.y, mz / Math.hypot(mx, mz) * Math.max(s, ws * 0.5), 0.3))) {
    // havada: girdi yonunde hizlanmak ya da hizi o yone cevirmek (havada yon kontrolu) inisi bosluga tasiyorsa girdi
    // yok (yerinde ziplayip havada kenara kayma)
    mx = 0; mz = 0; bot.skyGuard = 4;
  } else if (mx !== 0 || mz !== 0) {
    bot.skyGuard = 0;
    const l = Math.hypot(mx, mz), ux = mx / l, uz = mz / l;
    const look = 0.7 + Math.max(s, ws * 0.5) * 0.09, rs = Math.max(s, ws * 0.6);
    if (voidRun(w, p.x, p.y, p.z, ux, uz, look, rs)) {
      let found = false;
      for (const [ax, az] of [[-uz, ux], [uz, -ux], [-ux, -uz]]) {
        if (!voidRun(w, p.x, p.y, p.z, ax, az, look, rs)) { mx = ax * l; mz = az * l; found = true; break; }
      }
      if (!found) { mx = 0; mz = 0; }
      jump = false; dash = false; bot.detourT = 0; bot.skyGuard = 1;
    }
  }
  // gezinme disi ziplama / atilma (catisma kacamagi, takilma) bosluga ~2.5 m'den yakinken yapilmaz; gezinme ziplamasi
  // (EDGE_JUMP / basamak) ve atilmanin yorunge denetimi asagida
  if ((jump || dash) && m.onGround) {
    const wp = bot.path && bot.pathI < bot.path.length ? bot.path[bot.pathI] : null;
    const navJ = !!wp && (wp.type === EDGE_JUMP || wp.y - p.y > 0.55);
    if ((dash || !navJ) && nearVoid(w, p, 2.5, ws)) { if (!navJ) jump = false; dash = false; }
  }
  if (jump && m.onGround) {
    const l = Math.hypot(mx, mz) || 1;
    if (voidTraj(w, p.x, p.y, p.z, v.x, MOVE.jumpVel, v.z, 0.4) || voidTraj(w, p.x, p.y, p.z, mx / l * ws, MOVE.jumpVel, mz / l * ws, 0.4)) jump = false;
  }
  if (dash) {
    let dx = mx, dz = mz, l = Math.hypot(dx, dz);
    if (l < 1e-6) { dx = -Math.sin(bot.yaw); dz = -Math.cos(bot.yaw); l = 1; }
    const sp = Math.max(MOVE.dashSpeed, s * 1.05), vy0 = jump ? MOVE.jumpVel : m.onGround ? MOVE.dashUp : 1.2;
    if (voidTraj(w, p.x, p.y, p.z, dx / l * sp, vy0, dz / l * sp, 1.2)) dash = false;
  }
  _o.mx = mx; _o.mz = mz; _o.jump = jump; _o.dash = dash;
  return _o;
}

// kenar kilidi (bot.update'te mover.simulate'in iki yaninda; yalniz botlar, yetkili taraf): yerden kalktigi adimda
// (yurume, ziplama ya da atilma; gercek hizla) inisi bulut altindaysa bot o adimi geri alir ve kenarda durur (ziplama /
// atilma tahmini skySteer'de yapiliyor; bu, tahminin kacirdigini yakalar). Ped, tirmanma, ada surusu ve darbe haric:
// zemini yok olan (krater, dusen ada) ya da itilen bot duser, bosluga itmek oyunun parcasi
const _pv = { x: 0, y: 0, z: 0, g: false };
export function skyPre(bot) { const p = bot.mover.pos; _pv.x = p.x; _pv.y = p.y; _pv.z = p.z; _pv.g = bot.mover.onGround; }
export function skyPost(bot) {
  const m = bot.mover, g = bot.game;
  if (!_pv.g || m.onGround || !bot.alive) return;
  bot.skyTkT = g.time;
  if (m.padLock > 0 || m.waterJumpT > 0 || bot.skyRide || g.time - bot.lastHurtTime < 0.6) { bot.skyTk = m.padLock > 0 ? 'ped' : m.waterJumpT > 0 ? 'tirman' : bot.skyRide ? 'surus' : 'darbe'; return; }
  if (!m.collides(_pv.x, _pv.y - 0.06, _pv.z, 0.05)) { bot.skyTk = 'zeminyok'; return; }
  const p = m.pos, v = m.vel;
  const jd = m.events.jumped || m.events.dashed, mg = jd ? 1.0 : 0.3;   // ziplama / atilma: inis kenara cok yakinsa da riskli
  let bad = voidTraj(g.world, p.x, p.y, p.z, v.x, v.y, v.z, mg);
  if (!bad && !jd) {
    // yururken kenardan inis: gezinme yolu asagi inmiyorsa (EDGE_DROP) en cok ~1.5 m'lik basamak; daha derin dusus
    // (adanin yan / alt yuzu, kristal, alcak bir cikinti) istenmeden yapilmaz
    const wp = bot.path && bot.pathI < bot.path.length ? bot.path[bot.pathI] : null;
    if (!(wp && wp.type === EDGE_DROP)) {
      const s = Math.hypot(v.x, v.z) || 1, ax = p.x + v.x / s * 0.4, az = p.z + v.z / s * 0.4;
      bad = true;
      for (let yy = p.y - 0.05; yy > p.y - 1.5; yy -= VS) if (g.world.solidAtWorld(p.x, yy, p.z) || g.world.solidAtWorld(ax, yy, az)) { bad = false; break; }
    }
  }
  if (!bad) { bot.skyTk = 'guvenli'; return; }
  bot.skyTk = 'geri';
  p.x = _pv.x; p.y = _pv.y; p.z = _pv.z; v.x = 0; v.z = 0; if (v.y > 0) v.y = 0;
  m.onGround = true;
  bot.skyEdgeN = (bot.skyEdgeN || 0) + 1;
}

// (x,z) cevresinde 8 yonde R metre icinde bosluga inen kenar var mi
function nearVoid(w, p, R, ws) {
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (voidRun(w, p.x, p.y, p.z, Math.cos(a), Math.sin(a), R, ws * 0.6)) return true; }
  return false;
}

// botun ~3 m icinde bosluga inen kenar var mi (0.25 sn onbellekli). Kenardayken roket yakina atilmaz: kendi patlamasi
// (sahibine 1.35 kat itme) botu bosluga iter
export function skyEdge(bot) {
  const t = bot.game.time;
  if (bot._edgeT === undefined || t - bot._edgeT > 0.25) { bot._edgeT = t; bot._edgeV = nearVoid(bot.game.world, bot.mover.pos, 3, MOVE.runSpeed * bot.mover.speedMul); }
  return bot._edgeV;
}
