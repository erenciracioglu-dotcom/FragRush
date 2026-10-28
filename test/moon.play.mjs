// Ay Ussu oyun ici testi (gercek Chrome, ?test kipi, oyun dongusu elle):
//  - ay yercekimi ve harita fizigi acik
//  - kubbenin camina tek atis (plazma gucunde): delik, cam panelin patlamasi, hava kacagi (alarm, HAVA KACAGI mesaji)
//  - icerdeki bot delige emilir, delikten firlar, vakum hasari; olurse parcalama delen oyuncunun (UZAYA FIRLATTIN)
//  - kubbenin obur ucunda yerde duran aktor kapilmaz (akis uzakta zayif)
//  - bosalma biter (vakum), ~25 sn sonra delik kopukle kapanir, hacim yeniden basinclanir (sizinti yok)
//  - kendi deldigi kubbede uzaya savrulan: kendini parcalama (-1)
//  - vakumda duman yukselmez (balistik duser)
//  - bot camin ardindaki rakibi gorur, agir silah secer, ates eder ve kubbeyi deler
// usage: node test/moon.play.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const PORT = 8823;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=moon&bots=5&q=low&lang=tr`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  await page.evaluate(() => {
    window.__enkaz.play();
    const g = window.__enkaz.game;
    for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; }
    g.player.protect = 0;
    window.__T = { kills: [], msgs: [], subs: [], feeds: [] };
    const ok = g.onKill.bind(g);
    g.onKill = (v, k, wid, head) => { window.__T.kills.push([v.name, k ? k.name : null, wid]); return ok(v, k, wid, head); };
    const cm = g.hud.centerMsg.bind(g.hud);
    g.hud.centerMsg = (txt, d) => { window.__T.msgs.push(txt); return cm(txt, d); };
    const sm = g.hud.subMsg.bind(g.hud);
    g.hud.subMsg = (txt, d) => { window.__T.subs.push(txt); return sm(txt, d); };
    const VS = 0.25;
    // yardimcilar: kubbe kabugunda (iki kaburga arasinda) cam voxel, icerde bos zemin
    window.__H = {
      glassAt(D, phi, Y) {
        // isin izleme (tek voxel kalinliktaki kabukta capraz kose gecisi kacmaz)
        const w = g.world, r0 = D.R - 2.5, h = {};
        const ox = (D.x + 0.5 + Math.cos(phi) * r0) * VS, oz = (D.z + 0.5 + Math.sin(phi) * r0) * VS;
        if (!w.raycast(ox, (Y + 0.5) * VS, oz, Math.cos(phi), 0, Math.sin(phi), 2, h)) return null;
        return h.mat === 51 ? [h.x, h.y, h.z] : null;
      },
      floorNear(D, phi, r0) {
        const w = g.world;
        const cand = [];
        for (let dr = -6; dr <= 6; dr++) for (let da = -12; da <= 12; da++) cand.push([Math.abs(dr) + Math.abs(da) * 0.7, r0 + dr, phi + da * 0.03]);
        cand.sort((a, b) => a[0] - b[0]);
        for (const [, r, a] of cand) {
          const X = Math.floor(D.x + 0.5 + Math.cos(a) * r), Z = Math.floor(D.z + 0.5 + Math.sin(a) * r);
          let ok = true;
          for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2 && ok; dx++) {
            if (!w.get(X + dx, 13, Z + dz)) ok = false;
            for (let y = 14; y < 23 && ok; y++) if (w.get(X + dx, y, Z + dz)) ok = false;
          }
          if (ok) return [(X + 0.5) * VS, 14 * VS + 0.02, (Z + 0.5) * VS];
        }
        return null;
      },
      groundAt(x, z) {
        const w = g.world, X = Math.floor(x / VS), Z = Math.floor(z / VS);
        for (let y = 90; y > 1; y--) if (w.get(X, y, Z)) return (y + 1) * VS + 0.02;
        return 4;
      },
      // hacmin icinden (sinif 1, bos) dis havaya (2) ya da kutunun kenarina bos voxellerden yol var mi
      leaks(v) {
        const w = g.world, mat = w.mat, sx = w.sx, sxz = w.sxz, nx = v.nx, ny = v.ny, nz = v.nz, nxz = nx * nz, cls = v.cls;
        const seen = new Uint8Array(nx * ny * nz), q = [];
        const wi = (li) => { const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx; return (lx + v.x0) + sx * (lz + v.z0) + sxz * (ly + v.y0); };
        for (let li = 0; li < cls.length; li++) if (cls[li] === 1 && !mat[wi(li)]) { seen[li] = 1; q.push(li); }
        while (q.length) {
          const li = q.pop();
          const ly = (li / nxz) | 0, r = li - ly * nxz, lz = (r / nx) | 0, lx = r - lz * nx;
          if (lx === 0 || ly === 0 || lz === 0 || lx === nx - 1 || ly === ny - 1 || lz === nz - 1) return true;
          for (const d of [-1, 1, -nx, nx, -nxz, nxz]) {
            const j = li + d;
            if (seen[j]) continue;
            const c = cls[j];
            if (c === 4 || c === 5 || mat[wi(j)]) continue;
            if (c === 2) return true;
            seen[j] = 1; q.push(j);
          }
        }
        return false;
      },
    };
    g.bots.forEach((b, i) => { b.mover.reset(4 + i * 2, 4, 4); b.protect = 0; b.health = 100; b.armor = 0; });
  });
  await page.evaluate(() => __enkaz.step(30));
  const r0 = await page.evaluate(() => {
    const g = __enkaz.game, ms = g.moonSys;
    return { state: g.state, active: ms.active, vols: ms.vols.map((v) => v.name + ':' + v.state), membranes: ms.membranes.length, grav: g.fx.add.gk };
  });
  check('mac basladi, ay sistemi acik (7 hacim, kapilarda zar)', r0.state === 'playing' && r0.active && r0.vols.length === 7 && r0.vols.every((s) => s.endsWith('sealed')) && r0.membranes >= 10, JSON.stringify(r0));
  check('parcaciklar ay yercekiminde (gk ~0.35)', Math.abs(r0.grav - 7.7 / 22) < 0.01, String(r0.grav));

  // 1) seranin camina oyuncudan tek kucuk atis; icerde bot delige yakin, karsi ucta baska bot yerde
  const r1 = await page.evaluate(() => {
    const g = __enkaz.game, ms = g.moonSys, H = window.__H, VS = 0.25;
    const D = { x: 72, z: 104, R: 28 };
    const phi = Math.PI * 157.5 / 180;
    const gl = H.glassAt(D, phi, 23);
    const victim = g.bots[0], far = g.bots[1];
    const pv = H.floorNear(D, phi, 19), pf = H.floorNear(D, phi + Math.PI, 23);
    victim.mover.reset(pv[0], pv[1], pv[2]); victim.health = 30; victim.armor = 0;
    far.mover.reset(pf[0], pf[1], pf[2]); far.health = 100; far.armor = 0;
    const ox = D.x + 0.5 + Math.cos(phi) * 50, oz = D.z + 0.5 + Math.sin(phi) * 50;
    g.player.mover.reset(ox * VS, H.groundAt(ox * VS, oz * VS), oz * VS);
    __enkaz.step(10);
    window.__farStart = { x: far.mover.pos.x, z: far.mover.pos.z };
    const vG = ms.vols[0];
    const gx = (gl[0] + 0.5) * VS, gy = (gl[1] + 0.5) * VS, gz = (gl[2] + 0.5) * VS;
    const n = g.destruction.blast(gx, gy, gz, 0.3, 160, g.player);
    window.__victim = victim; window.__far = far;
    return { gl, pv, pf, removed: n, state: vG.state, holes: vG.holes.length, by: vG.by ? vG.by.name : null, ventTime: vG.ventTime };
  });
  check('cama tek atis (plazma gucunde) kubbeyi deler (bosalma basladi, delen oyuncu)', r1.removed > 0 && r1.state === 'venting' && r1.by === 'SEN', JSON.stringify(r1));
  const tr = [];
  let r1b = null;
  for (let i = 0; i < 36; i++) {
    const s = await page.evaluate(() => {
      const ms0 = __enkaz.step(1);
      const g = __enkaz.game, b = window.__victim, v = g.moonSys.vols[0], p = b.mover.pos;
      return { t: +v.t.toFixed(2), st: v.state, alive: b.alive, hp: b.health, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), sp: +Math.hypot(b.mover.vel.x, b.mover.vel.y, b.mover.vel.z).toFixed(1), ej: b.spaceEjected, ms: +ms0.toFixed(1), bursts: g.moonSys.stats.bursts, holes: v.holes.length };
    });
    tr.push(s);
    for (let k = 0; k < 4; k++) await page.evaluate(() => __enkaz.step(1));
    if (!s.alive && i > 3) { r1b = s; break; }
  }
  const last = tr[tr.length - 1];
  console.log('     iz:', tr.filter((_, i) => i % 3 === 0).map((s) => `t${s.t} (${s.x},${s.y},${s.z}) v${s.sp} hp${s.hp}${s.ej ? ' EJ' : ''} ${s.ms}ms`).join(' | '));
  check('cam panel patladi (delik buyudu)', tr.some((s) => s.bursts >= 1), `bursts ${last.bursts}, holes ${last.holes}`);
  const r1c = await page.evaluate(() => ({ kills: window.__T.kills.slice(), msgs: window.__T.msgs.slice(), frags: __enkaz.game.player.frags, stats: { ...__enkaz.game.moonSys.stats }, ev: (__enkaz.game.events || []).slice(-8) }));
  const k1 = r1c.kills.find((k) => k[0] === 'Papa Eren' || k[2] === 'spaced');
  check('bot delige emildi ve delikten firladi', tr.some((s) => s.ej), JSON.stringify(r1c.stats));
  check('uzaya savrulan bot oldu, parcalama delen oyuncunun', !!k1 && k1[1] === 'SEN' && k1[2] === 'spaced' && r1c.frags === 1, JSON.stringify(r1c.kills) + ' frag ' + r1c.frags);
  check('UZAYA FIRLATTIN mesaji', r1c.msgs.some((m) => /UZAYA/.test(m)), r1c.msgs.join(' | '));
  console.log('     olaylar:', r1c.ev.join(' / '));

  // bosalma bitene kadar: karsi uctaki yerdeki bot kapilmaz
  const r2 = await page.evaluate(() => {
    const g = __enkaz.game, v = g.moonSys.vols[0], far = window.__far;
    let n = 0, worst = 0;
    while (v.state === 'venting' && n < 600) { const ms = __enkaz.step(1); worst = Math.max(worst, ms); n++; }
    const p = far.mover.pos, s = window.__farStart;
    return { state: v.state, frames: n, moved: Math.hypot(p.x - s.x, p.z - s.z), farAlive: far.alive, worst, fieldMs: g.moonSys.stats.fieldMs, cells: v.fieldCells };
  });
  check('bosalma ~4 sn surer, sonra hacim vakum', r2.state === 'vacuum' && r2.frames < 300, JSON.stringify(r2));
  check('kubbenin obur ucunda yerde duran bot kapilmadi', r2.farAlive && r2.moved < 2.5, `kayma ${r2.moved.toFixed(2)} m`);
  check('akis alani hizli kuruluyor', r2.fieldMs < 12, `${r2.fieldMs.toFixed(2)} ms, ${r2.cells} hucre`);

  // vakumda duman: yukselmez, balistik duser
  const r3 = await page.evaluate(() => {
    const g = __enkaz.game, p = g.player.mover.pos, s = g.fx.smoke;
    // parcacik dizini kayar (olen parcacigin yerine sonuncusu gelir): isaretli boyutla bul
    const MARK = Math.fround(0.31337);
    const y0 = p.y + 3;
    s.emit(p.x + 2, y0, p.z, 0, 0.5, 0, 3, MARK, 1, [0.3, 0.3, 0.3, 0.5], [0.2, 0.2, 0.2, 0], -0.45, 1.3);
    __enkaz.step(30);
    let i = -1;
    for (let k = 0; k < s.count; k++) if (s.s0[k] === MARK) { i = k; break; }
    if (i < 0) return { lost: true };
    return { grav: s.grav[i], dy: s.py[i] - y0, ttl: s.ttl[i] };
  });
  check('vakumda duman yukselmez, duser', r3.grav > 1 && r3.dy < 0, JSON.stringify(r3));

  // kopuk yama: ~25 sn sonra delik kapanir, hacim yeniden basinclanir
  const r4 = await page.evaluate(() => {
    const g = __enkaz.game, v = g.moonSys.vols[0];
    let n = 0;
    while (v.state !== 'sealed' && n < 2400) { __enkaz.step(1); n++; }
    let foam = 0;
    const w = g.world;
    for (let i = 0; i < w.mat.length; i++) if (w.mat[i] === 54) foam++;
    return { state: v.state, secs: n / 60, foam, leaks: window.__H.leaks(v), ev: (g.events || []).slice(-4), light: v.L ? v.L.light.color.getHexString() : null };
  });
  check('delik ~25 sn sonra kopukle kapandi, hacim yeniden basincli', r4.state === 'sealed' && r4.foam > 0 && r4.secs > 20 && r4.secs < 30, JSON.stringify(r4));
  check('yamadan sonra sizinti yok', !r4.leaks);

  // 2) kendi deldigi kubbede uzaya savrulan: kendini parcalama (-1)
  const r5 = await page.evaluate(() => {
    const g = __enkaz.game, ms = g.moonSys, H = window.__H, VS = 0.25;
    // (komuta kubbesinde duvar konsollari siper olur: sera, dogu-guneydogu paneli)
    const D = { x: 72, z: 104, R: 28 };
    const phi = Math.PI * 22.5 / 180;
    const gl = H.glassAt(D, phi, 23);
    const b = g.bots[2];
    const pv = H.floorNear(D, phi, 21.5);
    b.mover.reset(pv[0], pv[1], pv[2]); b.health = 30; b.armor = 0; b.frags = 0;
    __enkaz.step(5);
    const n = g.destruction.blast((gl[0] + 0.5) * VS, (gl[1] + 0.5) * VS, (gl[2] + 0.5) * VS, 0.3, 160, b);
    let k = 0;
    const tr = [];
    const v = ms.vols[0];
    while (b.alive && k < 360) {
      __enkaz.step(1); k++;
      if (k % 15 === 0) { const p = b.mover.pos; let hd = 99; for (const h of v.holes) hd = Math.min(hd, Math.hypot(h.x - p.x, h.y - p.y - 0.9, h.z - p.z)); tr.push(`${(k / 60).toFixed(2)}:(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) hole ${hd.toFixed(1)} v${Math.hypot(b.mover.vel.x, b.mover.vel.y, b.mover.vel.z).toFixed(1)}`); }
    }
    const kill = window.__T.kills.find((x) => x[0] === b.name);
    return { gl, pv, removed: n, vol: v.state, by: v.by ? v.by.name : null, alive: b.alive, frags: b.frags, kill, secs: k / 60, holes: v.holes.length, bursts: ms.stats.bursts, tr: tr.slice(0, 12).join(' | ') };
  });
  check('kendi deldigi kubbede savrulan bot: kendini parcalama (-1)', !r5.alive && r5.kill && r5.kill[1] === null && r5.kill[2] === 'spaced' && r5.frags === -1, JSON.stringify(r5));

  // 3) bot camin ardindaki rakibi gorur, agir silah secer, ates eder, kubbeyi deler
  const r6 = await page.evaluate(() => {
    const g = __enkaz.game, ms = g.moonSys, H = window.__H, VS = 0.25;
    const D = { x: 160, z: 192, R: 21 };
    const phi = Math.PI * 202.5 / 180;
    const shooter = g.bots[3], target = g.bots[4];
    const pt = H.floorNear(D, phi, 13);
    target.mover.reset(pt[0], pt[1], pt[2]); target.health = 100; target.armor = 0;
    const ox = D.x + 0.5 + Math.cos(phi) * 40, oz = D.z + 0.5 + Math.sin(phi) * 40;
    shooter.mover.reset(ox * VS, H.groundAt(ox * VS, oz * VS), oz * VS); shooter.health = 200; shooter.armor = 200;
    shooter.yaw = Math.atan2(-(pt[0] - ox * VS), -(pt[2] - oz * VS));
    shooter.weapons.ammo = shooter.weapons.ammo.map(() => 50);
    // atici yeniden dusunur ve ates eder (yurumez); obur botlar ve oyuncu uzakta
    const proto = Object.getPrototypeOf(shooter);
    shooter.think = proto.think; shooter.tryFire = proto.tryFire;
    shooter.mem.clear(); shooter.target = null;
    g.player.mover.reset(4, 4, 140);
    const lab = ms.vols[3];
    let n = 0, sawT = -1, glass = false, weapon = null;
    while (lab.state === 'sealed' && n < 900) {
      __enkaz.step(1); n++;
      if (sawT < 0 && shooter.target === target) { sawT = n / 60; glass = !!shooter.memory(target).glass; }
      if (sawT >= 0 && !weapon && n / 60 > sawT + 1.6) weapon = shooter.weapons.def.id;
    }
    return { saw: sawT, glass, weapon: weapon || shooter.weapons.def.id, lab: lab.state, by: lab.by ? lab.by.name : null, secs: n / 60, shooter: shooter.name };
  });
  check('bot camin ardindaki rakibi gorur', r6.saw >= 0 && r6.glass, JSON.stringify(r6));
  check('agir silah secer ve kubbeyi deler', ['rocket', 'plasma', 'rail'].includes(r6.weapon) && r6.lab !== 'sealed' && r6.by === r6.shooter, JSON.stringify(r6));

  await page.evaluate(() => __enkaz.step(120));
  check('sayfa hatasi yok', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL istisna', e && e.stack || e);
  fails++;
} finally {
  await browser.close();
  srv.kill();
}
console.log(fails ? `\n${fails} test basarisiz` : '\ntum testler gecti');
process.exit(fails ? 1 : 0);
