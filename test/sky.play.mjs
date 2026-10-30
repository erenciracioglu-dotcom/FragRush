// Gok Adalari oyun ici testi (gercek Chrome, ?test kipi, oyun dongusu elle):
//  - yukleme: gok ortami, 6 ada ayakta; bekleyince hicbir ada dusmez (baglama)
//  - kristal hasari: %75 / %50 / %25 kademeleri, catlama sesi
//  - kirilma: 2.5 sn uyari, sonra ada govde olarak duser; ustundeki bot olur ve kristali kirana (oyuncu) yazilir:
//    ADAYI DUSURDUN!, ada / bulut sesleri; dusus aninda kare sureleri (render acik)
//  - itme: oyuncunun vurdugu bot bulutlara: oyuncuya (clouds), BULUTLARA GONDERDIN!
//  - kendi dususu: oyuncu kendi duser: -1, olum basligi BULUTLARA DUSTUN
//  - geri donus: ~45 sn sonra ada yukselir ve yerine aynen yazilir (voksel ozeti ilk halle ayni), kristal tam canla
//  - yenilenme: roket cukuru ve KIYAMET (5 m) oyugu oyun dongusunde kenarlarindan geri buyur; kare sureleri
//  - sayfa hatasi yok
// usage: PORT=8961 node test/sky.play.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const PORT = Number(process.env.PORT || 8961);
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=sky&bots=5&q=low&lang=tr`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });

  // 0) yukleme ve baglama; mac baslar, botlar susar, oyuncu ana adada
  const r0 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys;
    window.__enkaz.play();
    for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; }
    window.__T = { kills: [], msgs: [], snd: [] };
    if (g.audio) { const ap = g.audio.play.bind(g.audio); g.audio.play = (n, ...a) => { window.__T.snd.push(n); return ap(n, ...a); }; }
    const ok = g.onKill.bind(g);
    g.onKill = (v, k, wid, head) => { window.__T.kills.push([v.name, k ? k.name : null, wid]); return ok(v, k, wid, head); };
    const cm = g.hud.centerMsg.bind(g.hud);
    g.hud.centerMsg = (txt, d) => { window.__T.msgs.push(txt); return cm(txt, d); };
    const sp = (i) => g.arena.spawns.concat(sky.allSpawns || []).find((s) => s.isle === i);
    window.__H = {
      sp,
      put(a, s) { if (!a.alive) a.spawn({ x: s.x, y: s.y, z: s.z, yaw: 0 }); a.mover.reset(s.x, s.y, s.z); a.mover.vel.set(0, 0, 0); a.health = 100; a.armor = 0; a.protect = 0; },
      hash(isl) { const s = isl.snap, w = g.world; let h = 0x811c9dc5; for (let y = s.minY; y < s.minY + s.ny; y++) for (let z = s.minZ; z < s.minZ + s.nz; z++) for (let x = s.minX; x < s.minX + s.nx; x++) h = Math.imul(h ^ w.get(x, y, z), 16777619); return h >>> 0; },
      // harita merkezinden adanin merkezine dogru (adanin dis kenarina), yatayda v m/s firlatma
      fling(a, isl, v) { const dx = isl.def.x * 0.25 - 36, dz = isl.def.z * 0.25 - 36, l = Math.hypot(dx, dz) || 1; a.mover.vel.set(dx / l * v, 5, dz / l * v); a.mover.onGround = false; },
    };
    const P = g.player; P.protect = 0;
    __H.put(P, sp(0));
    g.bots.forEach((b, i) => __H.put(b, sp(0)));   // herkes once ana adada (dusurulecek adalarda kimse kalmasin)
    const atLoad = { active: sky.active, env: g.arena.env, isles: sky.isles.length, up: sky.isles.every((s) => s.phase === 0), fog: !!g.scene.fog };
    window.__H0 = sky.isles.map((s) => __H.hash(s));
    __enkaz.step(300, 1 / 60, false);
    return { atLoad, drops: sky.stats.drops, upAfter: sky.isles.every((s) => s.phase === 0) };
  });
  check('yukleme: gok ortami, 6 ada ayakta', r0.atLoad.active && r0.atLoad.env === 'sky' && r0.atLoad.isles === 6 && r0.atLoad.up, JSON.stringify(r0.atLoad));
  check('baglama: 5 sn sonra hicbir ada dusmedi', r0.drops === 0 && r0.upAfter, JSON.stringify(r0));

  // 1) kristal kademeleri (bahce adasi): %70, %45, %20
  const r1 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, isl = sky.isles[1], P = g.player, st = [];
    for (const f of [0.3, 0.25, 0.25]) { sky.damage(isl, isl.maxHp * f, P); __enkaz.step(6, 1 / 60, false); st.push(isl.stage); }
    return { st, hp: Math.round(isl.hp / isl.maxHp * 100), phase: isl.phase, crack: window.__T.snd.filter((n) => n === 'crystalCrack').length };
  });
  check('kristal kademeleri %75 / %50 / %25 (catlama sesi)', r1.st.join() === '1,2,3' && r1.phase === 0 && r1.crack >= 3, JSON.stringify(r1));

  // 2) kirilma: bot bahce adasinda; oyuncu kristali bitirir -> 2.5 sn uyari -> dusus; bot olur, oyuncuya yazilir
  const r2 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, isl = sky.isles[1], P = g.player, B = g.bots[0];
    __H.put(B, __H.sp(1));
    __enkaz.step(20, 1 / 60, true);                                  // isinma: ilk cizimler (golgelendirici derleme) olcume girmesin
    const f0 = P.frags, k0 = window.__T.kills.length, m0 = window.__T.msgs.length, s0 = window.__T.snd.length;
    sky.damage(isl, isl.maxHp, P);
    const ph = [isl.phase];
    __enkaz.step(120, 1 / 60, false); ph.push(isl.phase);            // 2.0 sn: hala uyari
    const frames = [];
    for (let n = 0; n < 60 * 4; n++) { frames.push(__enkaz.step(1, 1 / 60, true)); if (n === 60) ph.push(isl.phase); }
    frames.sort((a, b) => a - b);
    const kills = window.__T.kills.slice(k0), msgs = window.__T.msgs.slice(m0), snd = window.__T.snd.slice(s0);
    return { ph, kills, msgs, df: P.frags - f0, bname: B.name, snd: [...new Set(snd)], worst: +frames[frames.length - 1].toFixed(1), p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), med: +frames[frames.length >> 1].toFixed(1), drops: sky.stats.drops };
  });
  check('kirilma: once uyari (2 sn), sonra dusus', r2.ph[0] === 1 && r2.ph[1] === 1 && r2.ph[2] >= 2, JSON.stringify(r2.ph));
  check('adadaki bot olur, kristali kirana yazilir (island), frag +1', r2.kills.some((k) => k[0] === r2.bname) && r2.kills.every((k) => k[1] === 'SEN' && k[2] === 'island') && r2.df === r2.kills.length, JSON.stringify({ k: r2.kills, df: r2.df }));
  check('ADAYI DUSURDUN! mesaji', r2.msgs.includes('ADAYI DÜŞÜRDÜN!'), JSON.stringify(r2.msgs));
  check('dusus sesleri (gurleme, kristal kirilmasi, bulut)', ['islandRumble', 'crystalShatter', 'cloudWhoosh'].every((n) => r2.snd.includes(n)), JSON.stringify(r2.snd));
  check('dusus aninda kare sureleri (render acik, basziz)', r2.worst < 250, `en kotu ${r2.worst} ms, p95 ${r2.p95}, medyan ${r2.med}`);

  // 3) itme: oyuncu koy adasindaki botu vurur ve iter -> bulutlara: oyuncuya (clouds)
  const r3 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, isl = sky.isles[3], P = g.player, B = g.bots[1];
    __H.put(B, __H.sp(3));
    const f0 = P.frags, k0 = window.__T.kills.length, m0 = window.__T.msgs.length;
    B.takeDamage(10, P, 'rocket', { x: 0, y: 0, z: 0 }, false);
    __H.fling(B, isl, 22);
    for (let n = 0; n < 60 * 5 && B.alive; n++) __enkaz.step(1, 1 / 60, false);
    return { bname: B.name, alive: B.alive, kills: window.__T.kills.slice(k0), msgs: window.__T.msgs.slice(m0), df: P.frags - f0 };
  });
  check('itilen bot bulutlara: oyuncuya yazilir (clouds), frag +1', !r3.alive && r3.kills.length === 1 && r3.kills[0][0] === r3.bname && r3.kills[0][1] === 'SEN' && r3.kills[0][2] === 'clouds' && r3.df === 1, JSON.stringify(r3));
  check('BULUTLARA GONDERDIN! mesaji', r3.msgs.includes('BULUTLARA GÖNDERDİN!'), JSON.stringify(r3.msgs));

  // 4) kendi dususu: oyuncu yel degirmeni adasindan kendi duser -> -1, olum basligi
  const r4 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, isl = sky.isles[2], P = g.player;
    P.lastAttacker = null; P.lastAttackTime = -100;
    __H.put(P, __H.sp(2));
    const f0 = P.frags, k0 = window.__T.kills.length;
    __H.fling(P, isl, 22);
    for (let n = 0; n < 60 * 5 && P.alive; n++) __enkaz.step(1, 1 / 60, false);
    __enkaz.step(30, 1 / 60, true);
    return { alive: P.alive, kills: window.__T.kills.slice(k0), df: P.frags - f0, title: document.getElementById('deathTitle').textContent, self: sky.stats.self };
  });
  check('kendi dususu: oyuncu olur, kendine yazilir, frag -1', !r4.alive && r4.kills.length === 1 && r4.kills[0][0] === 'SEN' && r4.kills[0][2] === 'clouds' && r4.df === -1, JSON.stringify(r4));
  check('olum basligi: BULUTLARA DUSTUN', r4.title === 'BULUTLARA DÜŞTÜN', r4.title);

  // 5) geri donus: bahce adasi ~45 sn sonra yukselir ve aynen yerine yazilir; kristal tam can; nav dugumleri geri
  const r5 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, isl = sky.isles[1], s0 = window.__T.snd.length, seen = new Set();
    let t = 0;
    while (t < 75 && isl.phase !== 0) { __enkaz.step(30, 1 / 60, false); t += 0.5; seen.add(isl.phase); }
    __enkaz.step(30, 1 / 60, false);
    return { phase: isl.phase, t, seen: [...seen], same: __H.hash(isl) === window.__H0[1], hp: isl.hp === isl.maxHp, rise: window.__T.snd.slice(s0).includes('islandRise'), rises: sky.stats.rises };
  });
  check('geri donus: ada yukselir (ses) ve ayakta', r5.phase === 0 && r5.seen.includes(4) && r5.rise && r5.rises >= 1, JSON.stringify(r5));
  check('geri donus: voksel ozeti ilk halle ayni, kristal tam can', r5.same && r5.hp, JSON.stringify({ same: r5.same, hp: r5.hp }));
  // 6) yenilenme: yel degirmeni adasina roket boyu, ana adaya KIYAMET boyu (5 m) oyuk; render acik oyun dongusunde
  //    2 sn bekleyip kenarlarindan geri buyur; kare sureleri ve yenilenme adimi
  const r6 = await page.evaluate(() => {
    const g = __enkaz.game, sky = g.skySys, W = sky.isles[2], Mn = sky.isles[0], cw = W.def.crystal, cm = Mn.def.crystal, P = g.player;
    __H.put(P, __H.sp(4));
    for (const b of g.bots) __H.put(b, __H.sp(4));
    __enkaz.step(30, 1 / 60, false);
    g.destruction.blast(cw.x + 2, W.def.top + 0.1, cw.z, 2.5, 430, P, 10, 320);
    g.destruction.blast(cm.x + 3, Mn.def.top + 0.2, cm.z, 5, 860, P, 25, 900);
    const pc = (i) => { const r = sky.snapMatch(i); return +(r[0] / r[1] * 100).toFixed(1); };
    const m0 = [pc(2), pc(0)];
    const rg = sky._regrow.bind(sky);
    let worstG = 0;
    sky._regrow = () => { const t = performance.now(); const r = rg(); worstG = Math.max(worstG, performance.now() - t); return r; };
    const ft = [];
    let tW = -1, tM = -1;
    for (let n = 1; n <= 60 * 25 && (tW < 0 || tM < 0); n++) {
      // ilk saniye sayilmaz: patlamanin kendisi (toz, parca, basziz ilk golgelendirici derlemesi); yenilenme 2. sn'de baslar
      const t = performance.now(); __enkaz.step(1, 1 / 60, true); if (n > 60) ft.push(performance.now() - t);
      if (n > 30 && tW < 0 && sky.regions[2].miss.size === 0) tW = n / 60;
      if (n > 30 && tM < 0 && sky.regions[0].miss.size === 0) tM = n / 60;
    }
    sky._regrow = rg;
    ft.sort((a, b) => a - b);
    return { m0, m1: [pc(2), pc(0)], tW: +tW.toFixed(1), tM: +tM.toFixed(1), worstG: +worstG.toFixed(2), worst: +ft[ft.length - 1].toFixed(1), p95: +ft[Math.floor(ft.length * 0.95)].toFixed(1), med: +ft[ft.length >> 1].toFixed(1), grown: sky.stats.grown, up: sky.isles.every((s) => s.phase === 0) };
  });
  check('yenilenme: roket cukuru ve KIYAMET (5 m) oyugu kenarlarindan geri buyur (2 sn sonra baslar)', r6.m0[0] < 99 && r6.m0[1] < 95 && r6.m1[0] === 100 && r6.m1[1] === 100 && r6.tW > 1.5 && r6.tW < 8 && r6.tM > 1.5 && r6.tM < 20 && r6.up, JSON.stringify(r6));
  check('yenilenme sirasinda kare sureleri (patlamadan 1 sn sonrasi, render acik, basziz), adim < 8 ms', r6.worst < 250 && r6.worstG < 8, 'en kotu kare ' + r6.worst + ' ms, p95 ' + r6.p95 + ', medyan ' + r6.med + ', yenilenme adimi en cok ' + r6.worstG + ' ms');
  check('sayfa hatasi yok', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
} catch (e) {
  console.log('FAIL beklenmeyen hata', e.message);
  fails++;
} finally {
  await browser.close();
  srv.kill();
}
console.log(fails ? `\n${fails} FAIL` : '\nhepsi OK');
process.exit(fails ? 1 : 0);
