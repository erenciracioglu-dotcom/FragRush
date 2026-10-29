// Oyuncak Odasi oyun ici testi (gercek Chrome, ?test kipi, oyun dongusu elle):
//  - menude kosan zincir ve yikilan kule OYNA'da sifirlanir (zincir dizili, kule saglam); ortam, gokyuzu, muzik kutusu
//  - yatak trambolin: 5 m'den dusen bot seker (inis hizinin ~0.8'i, boing), sekmeler sonumlenir
//  - oyuncu ilk dominoya gercek atis (darbe tufegi, girdi ile): zincir kosar, son domino kuleyi devirir; seritteki bot
//    ezilir: DOMINO parcalamasi oyuncunun (DOMİNO! mesaji); devrilen domino dibindeki botu yaralar
//  - zincir ve kule cokusunde kare sureleri (render acik) ve oyuncak sisteminin kare basina suresi
//  - 45 sn sonra zincir ve kule yeniden kurulur (katman katman; yeniden dizilme kare sureleri)
//  - bot kurali: gercek bot zekasi seritteki rakibi gorur, uygun dominoya ates eder, kule rakibi ezer (parcalama botun)
//  - seritte duran oyuncuya uyari; kendi kulesinin altinda kalan oyuncu: kendini parcalama (-1)
// usage: node test/toyroom.play.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const PORT = 8827;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=toyroom&bots=5&q=low&lang=tr`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });

  // 0) menude zincir kosar, kule yikilir; OYNA her seyi sifirlar
  const r0 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys;
    const atLoad = { active: ts.active, env: g.arena.env, dominoes: ts.chain.list.length, armed: ts.armed, tower: ts.tower.state, sky: g.toySky.mesh.visible, fog: !!g.scene.fog };
    ts.trigger(g.bots[0]);
    __enkaz.step(420, 1 / 60, false);
    const menu = { tower: ts.tower.state, standing: ts.chain.standing, topples: ts.stats.topples };
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
    const VS = 0.25;
    window.__H = {
      groundAt(x, z, yTop = 90) {
        const w = g.world, X = Math.floor(x / VS), Z = Math.floor(z / VS);
        for (let y = yTop; y > 1; y--) if (w.get(X, y, Z)) return (y + 1) * VS + 0.02;
        return 4;
      },
      put(a, x, z, yTop) { a.mover.reset(x, this.groundAt(x, z, yTop), z); a.mover.vel.set(0, 0, 0); },
      // kulenin ezecegi seritte, kulenin onunde boyunun k katinda
      strip(k, dx = 0) {
        const T = ts.tower, L = T.height * k;
        return [(T.box[0] + T.box[3]) * 0.5 * VS + dx, T.dir[1] < 0 ? T.box[2] * VS - L : T.box[5] * VS + L];
      },
    };
    __enkaz.step(30, 1 / 60, false);
    return { atLoad, menu, state: g.state, armed: ts.armed, tower: ts.tower.state, damaged: ts._towerDamaged(), standing: ts.chain.standing, music: window.__T.snd.includes('musicBox'), audio: !!g.audio };
  });
  check('yukleme: oyuncak odasi, 22 domino kurulu, kule ayakta, gokyuzu ve sis', r0.atLoad.active && r0.atLoad.env === 'toyroom' && r0.atLoad.dominoes >= 15 && r0.atLoad.armed && r0.atLoad.sky && r0.atLoad.fog, JSON.stringify(r0.atLoad));
  check('menude zincir kostu, kule yikildi', r0.menu.topples === 1 && r0.menu.tower !== 'stand' && r0.menu.standing < 22, JSON.stringify(r0.menu));
  check('OYNA: zincir dizili, kule saglam (mac basi sifirlama)', r0.state === 'playing' && r0.armed && r0.tower === 'stand' && !r0.damaged, JSON.stringify(r0));
  if (r0.audio) check('mac basinda muzik kutusu', r0.music);

  // 1) yatak trambolin
  const r1 = await page.evaluate(() => {
    const g = __enkaz.game, VS = 0.25, b = g.bots[4];
    b.mover.reset(57, 25 * VS + 5, 29); b.mover.vel.set(0, 0, 0); b.health = 100; b.protect = 0;
    const out = [], tops = [];
    let up = false, top = -1;
    for (let k = 0; k < 60 * 7; k++) {
      const vy = b.mover.vel.y;
      __enkaz.step(1, 1 / 60, false);
      const ev = b.mover.events;
      if (ev.bounced) out.push([+(-vy).toFixed(2), +ev.bounced.toFixed(2)]);
      if (b.mover.vel.y > 0) { up = true; top = Math.max(top, b.mover.pos.y); } else if (up) { tops.push(+(top - 25 * VS).toFixed(2)); up = false; top = -1; }
    }
    return { out, tops, y: +b.mover.pos.y.toFixed(2), onGround: b.mover.onGround, hp: b.health, boing: window.__T.snd.filter((n) => n === 'boing').length };
  });
  const ratio = r1.out.length ? r1.out[0][1] / r1.out[0][0] : 0;
  check('yatak trambolin: 5 m\'den dusen bot seker (cikis inisin ~0.8\'i)', r1.out.length >= 2 && ratio > 0.74 && ratio < 0.86, `${JSON.stringify(r1.out.slice(0, 4))} oran ${ratio.toFixed(2)}`);
  check('sekmeler sonumlenir, bot yatakta durur, hasar yok', r1.tops.length >= 2 && r1.tops.every((t, i) => i === 0 || t < r1.tops[i - 1]) && r1.onGround && Math.abs(r1.y - 6.25) < 0.1 && r1.hp === 100, `tepeler ${r1.tops.join(' > ')} m`);
  if (r0.audio) check('sekiste boing sesi', r1.boing >= 2, String(r1.boing));

  // 2) oyuncu ilk dominoya gercek atis (girdi): seritte bot, 10. ile 11. domino arasinda bot
  const r2 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys, ch = ts.chain, H = window.__H, P = g.player;
    const d0 = ch.list[0], c0 = ch.center(d0, { x: 0, y: 0, z: 0 });
    H.put(P, d0.x - d0.wx * 5, d0.z - d0.wz * 5); P.health = 100; P.armor = 0; P.protect = 0;
    const victim = g.bots[0], side = g.bots[1];
    const [vx, vz] = H.strip(0.5);
    H.put(victim, vx, vz); victim.health = 100; victim.armor = 0; victim.protect = 0;
    const d10 = ch.list[10], d11 = ch.list[11];
    H.put(side, (d10.x + d11.x) / 2, (d10.z + d11.z) / 2); side.health = 100; side.armor = 0; side.protect = 0;
    window.__victim = victim; window.__side = side;
    P.weapons.ammo = P.weapons.ammo.map(() => 50);
    P.weapons.select(0);
    // render isinmasi (sahne gorunur)
    for (let k = 0; k < 40; k++) __enkaz.step(1);
    const ey = P.mover.pos.y + P.mover.eyeHeight;
    const dx = c0.x - P.mover.pos.x, dy = c0.y - 0.2 - ey, dz = c0.z - P.mover.pos.z;
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    __enkaz.step(2, 1 / 60, false);
    g.input.virtualMouse = 1;
    __enkaz.step(1);
    g.input.virtualMouse = 0;
    __enkaz.step(1);
    return { weapon: P.weapons.def.id, st: d0.st, dir: d0.dir, by: d0.by ? d0.by.name : null, armed: ts.armed, runBy: ts.runBy ? ts.runBy.name : null, ammo: P.weapons.ammo[0] };
  });
  check('oyuncunun gercek atisi (darbe tufegi) ilk dominoyu zincir yonune devirir', r2.weapon === 'pulse' && r2.st === 'fall' && r2.dir === 1 && r2.by === 'SEN' && !r2.armed, JSON.stringify(r2));

  // 3) zincir kosar, kule devrilir, seritteki bot ezilir (render acik: kare sureleri)
  const r3 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys, T = ts.tower;
    const tu = ts.update.bind(ts);
    let toyMs = 0, toyWorst = 0;
    ts.update = (dt, cam) => { const a = performance.now(); tu(dt, cam); toyMs = performance.now() - a; };
    const frames = [];
    let n = 0, tTop = -1, tDown = -1, worst = 0, worstAt = '';
    while (n < 60 * 12) {
      const ms = __enkaz.step(1); n++;
      frames.push(ms);
      toyWorst = Math.max(toyWorst, toyMs);
      if (ms > worst) { worst = ms; worstAt = `${(n / 60).toFixed(2)} sn ${T.state}`; }
      if (tTop < 0 && T.state === 'fall') tTop = n / 60;
      if (tDown < 0 && T.state === 'down') tDown = n / 60;
      if (tDown > 0 && n / 60 > tDown + 1.5) break;
    }
    ts.update = tu;
    frames.sort((a, b) => a - b);
    const v = window.__victim, s = window.__side;
    return {
      tTop, tDown, worst: +worst.toFixed(1), worstAt, p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1), med: +frames[frames.length >> 1].toFixed(1), toyWorst: +toyWorst.toFixed(2),
      victim: v.name, sideHp: s.health, sideAlive: s.alive, kills: window.__T.kills.slice(), msgs: window.__T.msgs.slice(), frags: g.player.frags, stats: { ...ts.stats },
    };
  });
  console.log(`     zincir+kule: kule ${r3.tTop} sn'de devrildi, ${r3.tDown} sn'de yerde; kare medyan ${r3.med} ms, p95 ${r3.p95} ms, en kotu ${r3.worst} ms (${r3.worstAt}); oyuncak sistemi en kotu ${r3.toyWorst} ms`);
  check('dalga kuleye ulasti, kule menteseyle devrildi', r3.tTop > 2 && r3.tTop < 6 && r3.tDown > r3.tTop && r3.stats.topples >= 2, JSON.stringify(r3.stats));
  const kv = r3.kills.find((k) => k[0] === r3.victim);
  check('seritteki bot ezildi: DOMINO parcalamasi oyuncunun', !!kv && kv[1] === 'SEN' && kv[2] === 'domino' && r3.frags === 1, JSON.stringify(r3.kills) + ' frag ' + r3.frags);
  check('DOMİNO! mesaji', r3.msgs.includes('DOMİNO!'), r3.msgs.join(' | '));
  check('devrilen domino dibindeki botu yaraladi (40), oldurmedi', r3.sideAlive && r3.sideHp <= 61 && r3.sideHp >= 59, String(r3.sideHp));
  check('oyuncak sistemi kare basina hizli (< 3 ms)', r3.toyWorst < 3, `${r3.toyWorst} ms`);

  // 4) 45 sn sonra zincir ve kule yeniden kurulur (yeniden dizilme ve kule kurulumu render acik)
  // dominolarin arasindaki yarali bot cekilir (yerinde biri duran domino kalkmayi bekler: node testinde); bekleme
  // kucuk parcalarla (tarayici araya worker mesajlarini ve cop toplamayi alabilsin, gercek oyundaki gibi)
  await page.evaluate(() => { window.__H.put(window.__side, 60, 11); window.__waitN = 0; });
  for (let k = 0; k < 120; k++) {
    const left = await page.evaluate(() => { const ts = __enkaz.game.toySys; for (let i = 0; i < 30 && ts.resetT > 0.4; i++) { __enkaz.step(1, 1 / 60, false); window.__waitN++; } return ts.resetT; });
    if (left <= 0.4) break;
  }
  const r4 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys, info = g.renderer.info;
    const n = window.__waitN;
    let worst = 0, m = 0;
    const slow = [], P = {}, un = [];
    const wrap = (obj, name, key) => { if (!obj || !obj[name]) return; const f = obj[name]; obj[name] = function (...a) { const t0 = performance.now(); const r = f.apply(this, a); P[key] = (P[key] || 0) + performance.now() - t0; return r; }; un.push(() => { obj[name] = f; }); };
    wrap(ts, 'update', 'toy'); wrap(g.nav, 'update', 'nav'); wrap(g.chunks, 'update', 'chunks'); wrap(g.post, 'render', 'render'); wrap(g.destruction, 'update', 'destr'); wrap(g.fx, 'update', 'fx');
    wrap(g.items, 'update', 'items'); wrap(g.hud, 'update', 'hud'); wrap(g.player, 'update', 'player'); wrap(g.projectiles, 'update', 'proj');
    for (const b of g.bots) wrap(b, 'update', 'bots');
    while (!ts.armed && m < 60 * 8) {
      const pr = info.programs ? info.programs.length : -1;
      for (const k in P) P[k] = 0;
      const ms = __enkaz.step(1); m++; worst = Math.max(worst, ms);
      if (ms > 30) slow.push([m, +ms.toFixed(0), ts.tower.state, pr + '>' + (info.programs ? info.programs.length : -1), Object.fromEntries(Object.entries(P).filter(([, v]) => v > 1).map(([k, v]) => [k, +v.toFixed(0)]))]);
    }
    for (const f of un) f();
    return { secs: +((n + m) / 60).toFixed(1), armed: ts.armed, tower: ts.tower.state, damaged: ts._towerDamaged(), standing: ts.chain.standing, resets: ts.stats.resets, worst: +worst.toFixed(1), slow, tidy: window.__T.snd.filter((x) => x === 'tidy').length };
  });
  check('~45 sn sonra dominolar kalkti, kule anlik goruntuden aynen kuruldu', r4.armed && r4.tower === 'stand' && !r4.damaged && r4.resets >= 1 && r4.secs > 38 && r4.secs < 52, JSON.stringify(r4));
  console.log(`     yeniden dizilme + kule kurulumu: en kotu kare ${r4.worst} ms ${r4.slow.length ? '(yavas: ' + JSON.stringify(r4.slow) + ')' : ''}`);

  // 5) bot kurali: gercek bot zekasi seritteki rakibi gorur, uygun dominoya ates eder, kule rakibi ezer
  const r5 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys, ch = ts.chain, T = ts.tower, H = window.__H, VS = 0.25;
    ts.matchReset();
    // izleyiciler uzakta (gardirobun onu, kuzeybati kosesi)
    H.put(g.player, 60, 11); g.player.protect = 0;
    let k = 0;
    for (const b of g.bots) if (b !== g.bots[2] && b !== g.bots[3]) { if (b.alive) H.put(b, 8 + 2 * k, 9); k++; }
    const shooter = g.bots[2], victim = g.bots[3];
    for (const b of [shooter, victim]) if (!b.alive) b.spawn({ x: 30, y: 2, z: 30, yaw: 0 });
    const dl = ch.list[ch.list.length - 1];
    const vx = (T.box[3] * VS) - 0.5, vz = T.dir[1] < 0 ? T.box[2] * VS - T.height * 0.5 : T.box[5] * VS + T.height * 0.5;
    H.put(victim, vx, vz); victim.health = 100; victim.armor = 0; victim.protect = 0;
    // kurban yalniz dominodan zarar gorur (aticinin mermileri sayilmaz)
    const td = victim.takeDamage.bind(victim);
    victim.takeDamage = (dmg, by, wid, ...a) => (wid === 'domino' ? td(dmg, by, wid, ...a) : 0);
    const sx = (T.box[3] + 22) * VS, sz = dl.z - dl.fz * 7;
    H.put(shooter, sx, sz); shooter.health = 500; shooter.armor = 200; shooter.protect = 0;
    shooter.setSkill(5);
    shooter.weapons.ammo = shooter.weapons.ammo.map(() => 50);
    shooter.yaw = Math.atan2(-(vx - sx), -(vz - sz)); shooter.pitch = 0;
    const proto = Object.getPrototypeOf(shooter);
    shooter.think = proto.think; shooter.tryFire = proto.tryFire;
    shooter.mem.clear(); shooter.target = null; shooter.dominoCd = 0; shooter.dominoT = 0;
    const k0 = window.__T.kills.length;
    let n = 0, intent = null, tTop = -1;
    while (n < 60 * 15) {
      __enkaz.step(1, 1 / 60, false); n++;
      if (!intent && shooter.dominoT > 0) intent = { t: +(n / 60).toFixed(2), i: shooter.dominoAt.i };
      if (tTop < 0 && T.state === 'fall') tTop = n / 60;
      if (!victim.alive) break;
    }
    __enkaz.step(30, 1 / 60, false);
    shooter.think = () => {}; shooter.tryFire = () => {};
    return { intent, runBy: ts.runBy ? ts.runBy.name : null, first: ch.list.findIndex((d) => d.st !== 'stand'), tTop, victimAlive: victim.alive, kills: window.__T.kills.slice(k0), shooter: shooter.name, secs: +(n / 60).toFixed(2) };
  });
  check('bot seritteki rakibi gordu ve bir dominoyu hedefledi', !!r5.intent, JSON.stringify(r5.intent));
  check('bot zinciri baslatti, kule devrildi', r5.runBy === r5.shooter && r5.tTop > 0, JSON.stringify(r5));
  const kb = r5.kills.find((k) => k[2] === 'domino');
  check('kule rakibi ezdi: DOMINO parcalamasi botun', !r5.victimAlive && !!kb && kb[1] === r5.shooter, JSON.stringify(r5.kills));

  // 6) seritte duran oyuncuya uyari; zinciri kendisi baslatip kulenin altinda kalan oyuncu: kendini parcalama (-1)
  const r6 = await page.evaluate(() => {
    const g = __enkaz.game, ts = g.toySys, H = window.__H, P = g.player;
    ts.matchReset();
    for (const b of g.bots) if (b.alive) H.put(b, 8 + Math.random() * 8, 9);
    const [x, z] = H.strip(0.6);
    H.put(P, x, z); P.health = 30; P.armor = 0; P.protect = 0;
    const f0 = P.frags, s0 = window.__T.subs.length, k0 = window.__T.kills.length;
    ts.trigger(P);
    let n = 0;
    while (P.alive && n < 60 * 8) { __enkaz.step(1, 1 / 60, false); n++; }
    return { alive: P.alive, df: P.frags - f0, subs: window.__T.subs.slice(s0), kills: window.__T.kills.slice(k0), secs: +(n / 60).toFixed(2) };
  });
  check('seritteki oyuncuya uyari', r6.subs.some((s) => /DOMİNOLAR DEVRİLİYOR/.test(s)), r6.subs.join(' | '));
  check('kendi kulesinin altinda kalan oyuncu: kendini parcalama (-1)', !r6.alive && r6.df === -1 && r6.kills.some((k) => k[0] === 'SEN' && k[2] === 'domino' && (k[1] === 'SEN' || k[1] === null)), JSON.stringify(r6));

  await page.evaluate(() => __enkaz.step(120, 1 / 60, false));
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
