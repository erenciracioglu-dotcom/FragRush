// Fisekhane oyun ici testi (gercek Chrome, ?test kipi, oyun dongusu elle):
//  - yukleme: fisekhane ortami (gece gogu, sis, tepe halkasi), 72 sandik, 3 fitil, 2 depo; menude (&chain gibi) kosan
//    zincir OYNA'da sifirlanir (sandik / fitil / depo tam)
//  - oyuncunun gercek atisi (darbe tufegi, girdi ile) sandiga: ilk mermi tutusturmaz, ikincisi tutusturur; zincir
//    yiginda yayilir, yanindaki iki bot olur: ikisi de oyuncunun ('chain'), ZINCIRLEME! ve ZINCIRLEME x2! mesajlari
//  - kirmizi direge gercek atis: kivilcim depoya kosar, depo uyarisi, depodaki bot olur (oyuncunun)
//  - en buyuk zincir (uc fitil + her ~9 sandiktan biri, render acik): kare sureleri ve fisek sisteminin kare basi suresi
//  - kendi sandiginin dibindeki oyuncu: kendini parcalama (-1)
//  - sayfa hatasi yok
// usage: PORT=8911 node test/fireworks.play.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const PORT = Number(process.env.PORT || 8911);
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=fireworks&bots=5&q=low&lang=tr`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });

  // 0) yukleme, menude zincir, OYNA sifirlar
  const r0 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys;
    const atLoad = { active: fw.active, env: g.arena.env, crates: fw.crates.length, fuses: fw.fuses.length, depots: fw.depots.length, sky: g.fwSky.mesh.visible, hills: g.fwHills.visible, fog: !!g.scene.fog };
    fw.benchChain(g.bots[0]);
    __enkaz.step(420, 1 / 60, false);
    const menu = { crates: fw.stats.crates, shells: fw.stats.shells, burning: fw.fuses.filter((f) => f.st !== 0).length };
    window.__T = { kills: [], msgs: [], subs: [], snd: [] };
    if (g.audio) { const ap = g.audio.play.bind(g.audio); g.audio.play = (n, ...a) => { window.__T.snd.push(n); return ap(n, ...a); }; }
    window.__enkaz.play();
    for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; }
    g.player.protect = 0;
    const ok = g.onKill.bind(g);
    g.onKill = (v, k, wid, head) => { window.__T.kills.push([v.name, k ? k.name : null, wid]); return ok(v, k, wid, head); };
    const cm = g.hud.centerMsg.bind(g.hud);
    g.hud.centerMsg = (txt, d) => { window.__T.msgs.push(txt); return cm(txt, d); };
    const sm = g.hud.subMsg.bind(g.hud);
    g.hud.subMsg = (txt, d) => { window.__T.subs.push(txt); return sm(txt, d); };
    const VS = 0.25, w = g.world, G = fw.G;
    const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0 };
    window.__H = {
      groundAt(x, z, yTop = 90) { const X = Math.floor(x / VS), Z = Math.floor(z / VS); for (let y = yTop; y > 1; y--) if (w.get(X, y, Z)) return (y + 1) * VS + 0.02; return 4; },
      put(a, x, z, y) { if (!a.alive) a.spawn({ x, y: y || this.groundAt(x, z), z, yaw: 0 }); a.mover.reset(x, y || this.groundAt(x, z), z); a.mover.vel.set(0, 0, 0); a.health = 100; a.armor = 0; a.protect = 0; },
      // (x, z) cevresinde, R1..R2 uzakta, goz hizasindan hedefe (tx,ty,tz) acik atis yeri (ilk carpan voxel malzemesi m)
      spotFor(tx, ty, tz, m, R1 = 8, R2 = 13) {
        for (let R = R1; R <= R2; R += 1) for (let k = 0; k < 24; k++) {
          const a = -Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, x = tx + Math.cos(a) * R, z = tz + Math.sin(a) * R;
          if (x < 2 || z < 2 || x > 70 || z > 70) continue;
          const y = this.groundAt(x, z, G + 4);
          if (Math.abs(y - (G * VS + 0.02)) > 0.01 || w.boxSolid(x - 0.4, y + 0.05, z - 0.4, x + 0.4, y + 1.8, z + 0.4)) continue;
          const ey = y + 1.6, dx = tx - x, dy = ty - ey, dz = tz - z, L = Math.hypot(dx, dy, dz);
          if (w.raycast(x, ey, z, dx / L, dy / L, dz / L, L + 0.5, hit) && hit.mat === m) return [x, z];
        }
        return null;
      },
      aim(P, tx, ty, tz) { const ey = P.mover.pos.y + P.mover.eyeHeight, dx = tx - P.mover.pos.x, dy = ty - ey, dz = tz - P.mover.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
      fire(P) {
        for (let k = 0; k < 90 && (P.weapons.cooldown > 0 || P.weapons.pending >= 0); k++) __enkaz.step(1, 1 / 60, false);
        g.input.virtualMouse = 1; __enkaz.step(1); g.input.virtualMouse = 0; __enkaz.step(10, 1 / 60, false);
      },
      // depo kutusunun icinde, merkeze en yakin bos yer
      inside(d) {
        let best = null, bd = 1e9; const b = d.box;
        for (let z = b[2] + 2; z < b[5] - 2; z++) for (let x = b[0] + 2; x < b[3] - 2; x++) {
          let ok = w.solid(x, G - 1, z);
          for (let y = G; y < G + 8 && ok; y++) for (let dz = -2; dz < 2 && ok; dz++) for (let dx = -2; dx < 2 && ok; dx++) if (w.get(x + dx, y, z + dz)) ok = false;
          const dd = Math.hypot(x * VS - d.c[0], z * VS - d.c[2]);
          if (ok && dd < bd) { bd = dd; best = [x * VS, z * VS]; }
        }
        return best;
      },
    };
    __enkaz.step(30, 1 / 60, false);
    const intact = fw.crates.every((c) => c.st === 0) && fw.fuses.every((f) => f.st === 0) && fw.depots.every((d) => d.st === 0);
    return { atLoad, menu, state: g.state, intact, shells: fw.shells.length };
  });
  check('yukleme: fisekhane, 72 sandik, 3 fitil, 2 depo, gece gogu, tepeler, sis', r0.atLoad.active && r0.atLoad.env === 'fireworks' && r0.atLoad.crates === 72 && r0.atLoad.fuses === 3 && r0.atLoad.depots === 2 && r0.atLoad.sky && r0.atLoad.hills && r0.atLoad.fog, JSON.stringify(r0.atLoad));
  check('menude zincir kostu (sandiklar patladi, fisekler firladi, fitiller yandi)', r0.menu.crates >= 8 && r0.menu.shells >= 20 && r0.menu.burning >= 1, JSON.stringify(r0.menu));
  check('OYNA: sandik, fitil, depo tam; ucan fisek yok (mac basi sifirlama)', r0.state === 'playing' && r0.intact && r0.shells === 0, JSON.stringify(r0));

  // 1) oyuncunun gercek atisi sandiga (darbe tufegi: 78 hasar; ilk mermi tutusturmaz, ikincisi tutusturur)
  const r1 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys, H = window.__H, P = g.player, VS = 0.25, M = { crate: 0 };
    const c = fw.crates[44], tx = c.cx, ty = c.cy - 0.1, tz = c.z0 * VS + 0.15;
    M.crate = g.world.mat[g.world.idx(c.x0 + 1, c.y0 + 1, c.z0)];
    const sp = H.spotFor(tx, ty, tz, M.crate);
    if (!sp) return { err: 'atis yeri yok' };
    H.put(P, sp[0], sp[1]);
    const v1 = g.bots[0], v2 = g.bots[1];
    H.put(v1, fw.crates[46].cx, fw.crates[46].z0 * VS - 0.7);
    H.put(v2, fw.crates[44].x0 * VS - 0.7, fw.crates[44].cz);
    for (let k = 2; k < g.bots.length; k++) H.put(g.bots[k], 8 + 3 * k, 44);
    window.__V = [v1, v2]; window.__D = [];
    for (const v of [v1, v2]) { const td = v.takeDamage.bind(v); v.takeDamage = (d, by, wid, ...r) => { window.__D.push([v.name, Math.round(d), wid, +v.mover.pos.x.toFixed(1), +v.mover.pos.z.toFixed(1)]); return td(d, by, wid, ...r); }; }
    P.weapons.ammo = P.weapons.ammo.map(() => 50);
    P.weapons.select(0);
    for (let k = 0; k < 40; k++) __enkaz.step(1);
    H.aim(P, tx, ty, tz);
    H.fire(P);
    const hurt = fw.crates.filter((o) => o.hp < 100), after1 = { hurt: hurt.length, lit: fw.crates.filter((o) => o.st !== 0).length };
    H.aim(P, tx, ty, tz);
    H.fire(P);
    const lit = fw.crates.filter((o) => o.st === 1);
    return { spot: sp.map((v) => +v.toFixed(1)), weapon: P.weapons.def.id, after1, lit: lit.map((o) => o.i), by: lit.length ? (lit[0].by ? lit[0].by.name : null) : null, me: P.name, same: lit.length === 1 && hurt.length === 1 && hurt[0] === lit[0] };
  });
  check('oyuncunun gercek atisi: ilk mermi tutusturmaz, ikincisi tutusturur (darbe tufegi)', r1.weapon === 'pulse' && r1.after1.hurt === 1 && r1.after1.lit === 0 && r1.same && r1.by === r1.me, JSON.stringify(r1));

  // 2) zincir yayilir (render acik: kare sureleri), iki bot olur: ikisi de oyuncunun, ZINCIRLEME x2!
  const r2 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys, P = g.player;
    const fu = fw.update.bind(fw);
    let fwMs = 0, fwWorst = 0;
    fw.update = (dt, cam) => { const a = performance.now(); fu(dt, cam); fwMs = performance.now() - a; };
    const frames = [];
    for (let n = 0; n < 60 * 5; n++) { frames.push(__enkaz.step(1)); fwWorst = Math.max(fwWorst, fwMs); }
    fw.update = fu;
    frames.sort((a, b) => a - b);
    const cl = fw.crates.slice(44, 52);
    const T = window.__T, mine = T.kills.filter((k) => k[1] === P.name && k[2] === 'chain').map((k) => k[0]);
    return { names: window.__V.map((b) => b.name), dmg: window.__D.slice(0, 12), all: T.kills.slice(), ev: (g.events || []).filter((e) => /chainkill/.test(e)).slice(-6), gone: cl.filter((c) => c.st === 2).length, shells: fw.stats.shells, kills: mine, v: window.__V.map((b) => b.alive), frags: P.frags, msgs: T.msgs.slice(-4), worst: +frames[frames.length - 1].toFixed(1), p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), med: +frames[frames.length >> 1].toFixed(1), fwWorst: +fwWorst.toFixed(2), snd: ['fwFizz', 'fwCrate', 'fwWhistle', 'fwBurst'].filter((s) => T.snd.includes(s)) };
  });
  check('zincir yiginda yayilir, fisekler firlar', r2.gone === 8 && r2.shells >= 16, `${r2.gone}/8 sandik, ${r2.shells} fisek`);
  check('iki bot olur: ikisi de oyuncunun (chain), frag +2', r2.kills.length === 2 && r2.names.every((n) => r2.kills.includes(n)) && r2.frags === 2, JSON.stringify({ all: r2.all, v: r2.v, frags: r2.frags, dmg: r2.dmg }));
  check('ZINCIRLEME! ve ZINCIRLEME x2! mesajlari', r2.msgs.includes('ZİNCİRLEME!') && r2.msgs.includes('ZİNCİRLEME x2!'), JSON.stringify(r2.msgs));
  check('zincir sesleri (cizirti, patlama, islik, havai fisek)', r2.snd.length === 4 || !r2.snd.length, r2.snd.join(' ') || 'ses yok (headless)');
  check('zincir sirasinda kare sureleri (render acik), fisek sistemi kare basi < 4 ms', r2.fwWorst < 4, `en kotu ${r2.worst} ms, p95 ${r2.p95}, medyan ${r2.med}, fwSys en cok ${r2.fwWorst} ms`);

  // 3) kirmizi direge gercek atis: kivilcim depoya kosar, uyari, depodaki bot olur (oyuncunun)
  const r3 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys, H = window.__H, P = g.player, w = g.world;
    const f = fw.fuses[2], d = fw.depots[f.depot], B = f.box;
    // onceki zincirin havadaki fisekleri insin; curuk fisek fitili kesmis olabilir (rastgele): fitil tam olsun
    for (let k = 0; k < 900 && fw.shells.length; k++) __enkaz.step(1, 1 / 60, false);
    fw._restoreFuse(f, true);
    const tx = (B[0] + B[3]) / 2, ty = B[1] + 0.9, tz = (B[2] + B[5]) / 2;
    const sp = H.spotFor(tx, ty, tz, w.mat[w.idx(Math.floor(tx / 0.25), Math.floor(ty / 0.25), Math.floor(tz / 0.25))], 5, 12);
    if (!sp) return { err: 'direk atis yeri yok' };
    H.put(P, sp[0], sp[1]);
    const v = g.bots[2], ins = H.inside(d);
    H.put(v, ins[0], ins[1], fw.G * 0.25 + 0.02);
    __enkaz.step(10, 1 / 60, false);
    H.aim(P, tx, ty, tz);
    H.fire(P);
    const lit = { st: f.st, by: f.by ? f.by.name : null, s0: f.s0 };
    const T = window.__T, k0 = T.kills.length;
    let tWarn = -1, tBoom = -1, n = 0;
    while (n < 60 * 16 && tBoom < 0) { __enkaz.step(1, 1 / 60, false); n++; if (tWarn < 0 && d.st === 1) tWarn = n / 60; if (d.st === 2) tBoom = n / 60; }
    const kills = T.kills.slice(k0);
    return { lit, n: f.n, tWarn: +tWarn.toFixed(2), tBoom: +tBoom.toFixed(2), victim: v.alive, kills, me: P.name, depots: fw.stats.depots, snd: ['fwLight', 'fwWarn', 'fwDepot'].filter((s) => T.snd.includes(s)) };
  });
  check('kirmizi direge mermi: fitil bastan yanar (oyuncunun)', r3.lit && r3.lit.st === 1 && r3.lit.s0 === 0 && r3.lit.by === r3.me, JSON.stringify(r3.lit || r3));
  check('kivilcim depoya varir, 1 sn uyari, depo patlar', r3.tWarn > 0 && Math.abs(r3.tWarn - r3.n / 10) < 0.6 && Math.abs(r3.tBoom - r3.tWarn - 1) < 0.1, `fitil ${r3.n} hucre, uyari ${r3.tWarn} sn, patlama ${r3.tBoom} sn`);
  check('depodaki bot olur: oyuncunun (chain)', !r3.victim && r3.kills.some((k) => k[1] === r3.me && k[2] === 'chain'), JSON.stringify(r3.kills));

  // 4) kendi sandiginin dibindeki yarali oyuncu: kendini parcalama (-1), olum basligi
  const r5 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys, H = window.__H, P = g.player, VS = 0.25;
    for (let k = 0; k < 600 && fw.depots.some((d) => d.st === 1); k++) __enkaz.step(1, 1 / 60, false);
    fw.matchReset();
    const c = fw.crates[0];
    H.put(P, c.cx, (c.z0 + 4) * VS + 0.7, c.y0 * VS + 0.02);
    for (const b of g.bots) H.put(b, 60, 45);
    const f0 = P.frags, k0 = window.__T.kills.length;
    P.health = 35;   // yarali oyuncu (kendine hasar PLAYER.selfDamageScale ile olceklenir)
    __enkaz.step(5, 1 / 60, false);
    H.aim(P, c.cx, c.cy - 0.1, (c.z0 + 4) * VS - 0.1);
    const ammo0 = P.weapons.ammo[0], wid = P.weapons.def.id, eye = [P.mover.pos.x, P.mover.pos.y + P.mover.eyeHeight, P.mover.pos.z].map((v) => +v.toFixed(2));
    const hh = { mat: 0, dist: 0 }; { const dx = c.cx - eye[0], dy = c.cy - 0.1 - eye[1], dz = (c.z0 + 4) * VS - 0.1 - eye[2], L = Math.hypot(dx, dy, dz); g.world.raycast(eye[0], eye[1], eye[2], dx / L, dy / L, dz / L, L + 1, hh); }
    H.fire(P); const hp1 = c.hp;
    for (let s = 0; s < 3 && c.st === 0; s++) { H.aim(P, c.cx, c.cy - 0.1, (c.z0 + 4) * VS - 0.1); H.fire(P); }
    window.__dbg = { hurt: fw.crates.filter((o) => o.hp < 100 || o.st).map((o) => [o.i, o.hp, o.st]), ammo0, ammo1: P.weapons.ammo[0], wid, eye, hit: [hh.mat, +(+hh.dist).toFixed(2)], hp1, st: c.st, cm: c.m };
    for (let k = 0; k < 180 && P.alive; k++) __enkaz.step(1, 1 / 60, false);
    __enkaz.step(2);
    const kills = window.__T.kills.slice(k0);
    return { alive: P.alive, kills, me: P.name, df: P.frags - f0, title: document.getElementById('deathTitle').textContent, self: fw.stats.selfKills, dbg: window.__dbg };
  });
  check('kendi zinciri: oyuncu olur, kendine yazilir, frag -1', !r5.alive && r5.kills.some((k) => k[0] === r5.me && k[1] === r5.me && k[2] === 'chain') && r5.df === -1, JSON.stringify(r5));
  check('olum basligi: ZINCIRLEME PATLAMADA KALDIN', r5.title === 'ZİNCİRLEME PATLAMADA KALDIN', r5.title);
  // 5) en buyuk zincir (uc fitil + her ~9 sandiktan biri), render acik: kare sureleri
  const r4 = await page.evaluate(() => {
    const g = __enkaz.game, fw = g.fwSys, H = window.__H, P = g.player;
    let best = null, bd = -1;
    for (const s of g.arena.spawns) {
      let m = 1e9;
      for (const c of fw.crates) m = Math.min(m, Math.hypot(c.cx - s.x, c.cz - s.z));
      for (const d of fw.depots) m = Math.min(m, Math.hypot(d.c[0] - s.x, d.c[2] - s.z) - 5);
      if (Math.abs(s.y - fw.G * 0.25) < 0.3 && m > bd) { bd = m; best = s; }
    }
    H.put(P, best.x, best.z);
    P.yaw = Math.atan2(-(36 - best.x), -(36 - best.z)); P.pitch = 0.25;
    for (const b of g.bots) H.put(b, best.x + 1.5, best.z);
    fw.benchChain(P);
    const fu = fw.update.bind(fw);
    let fwMs = 0, fwWorst = 0;
    fw.update = (dt, cam) => { const a = performance.now(); fu(dt, cam); fwMs = performance.now() - a; };
    const frames = [];
    let maxShells = 0;
    for (let n = 0; n < 60 * 8; n++) { frames.push(__enkaz.step(1)); fwWorst = Math.max(fwWorst, fwMs); maxShells = Math.max(maxShells, fw.shells.length); }
    fw.update = fu;
    const worstAt = frames.indexOf(Math.max(...frames)), slow = frames.filter((v) => v > 33).length;
    frames.sort((a, b) => a - b);
    return { safeDist: +bd.toFixed(1), crates: fw.stats.crates, maxQ: fw.stats.maxQ, maxShells, worst: +frames[frames.length - 1].toFixed(1), p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), med: +frames[frames.length >> 1].toFixed(1), fwWorst: +fwWorst.toFixed(2), worstAt, slow, alive: P.alive };
  });
  check('en buyuk zincir: kuyruk ve fisek siniri tutar, fisek sistemi kare basi < 6 ms', r4.maxShells <= 40 && r4.fwWorst < 6, JSON.stringify(r4));

  check('sayfa hatasi yok', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('HATA', e.message);
  fails++;
} finally {
  await browser.close();
  srv.kill();
}
console.log(fails ? `\n${fails} FAIL` : '\nhepsi OK');
process.exit(fails ? 1 : 0);
