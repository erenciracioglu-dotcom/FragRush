// Buz Golu oyun ici testi (gercek Chrome, ?test kipi, oyun dongusu elle): buzu kiran parcalamayi alir
// (soguk su olumu oyuncuya yazilir, BUZA GOMDUN mesaji, kiragi perdesi), vurulan sarkit duser ve altindaki
// botu yaralar (saldirgan vuran), kardan adami kiran saklanan esyayi ortaya cikarir ve alabilir.
// usage: node test/frozen.play.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const PORT = 8816;
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?test&map=frozen&bots=3&q=low&lang=tr`);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 250 });
  await page.evaluate(() => {
    window.__enkaz.play();
    const g = window.__enkaz.game;
    // botlar durgun: dusunmez, yurumez, ates etmez (testin sahnesini bozmasinlar)
    for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; }
    g.player.protect = 0;
    window.__T = { kills: [], msgs: [] };
    const ok = g.onKill.bind(g);
    g.onKill = (v, k, wid, head) => { window.__T.kills.push([v.name, k ? k.name : null, wid]); return ok(v, k, wid, head); };
    const cm = g.hud.centerMsg.bind(g.hud);
    g.hud.centerMsg = (txt, d) => { window.__T.msgs.push(txt); return cm(txt, d); };
    // bir bot disinda hepsini uzaga (haritanin kosesine, cok yuksege degil) tasi
    const far = [[6, 6], [66, 6], [6, 66]];
    g.bots.forEach((b, i) => { const [x, z] = far[i % 3]; b.mover.reset(x, 9, z); b.protect = 0; });
    g.player.mover.reset(36, 9, 60);
  });
  await page.evaluate(() => __enkaz.step(30));
  check('mac basladi, buz sistemi acik', await page.evaluate(() => { const g = __enkaz.game; return g.state === 'playing' && g.iceSys.active; }));

  // 1) buzu oyuncu kirar, ustundeki bot suya duser ve donarak olur: parcalama oyuncunun
  const r1 = await page.evaluate(() => {
    const g = __enkaz.game, w = g.world, VS = 0.25, L = g.iceSys.level;
    // acik gokyuzu altinda, derin su ustunde, iki katli buz
    const iceAt = (X, Z) => (w.get(X, L - 1, Z) === 41 ? 1 : 0) + (w.get(X, L, Z) === 41 ? 1 : 0);
    let spot = null;
    for (let Z = 60; Z < 230 && !spot; Z += 3) for (let X = 60; X < 230 && !spot; X += 3) {
      if (Math.hypot(X - 144, Z - 146) < 52) continue;
      let ok = true;
      for (let dz = -3; dz <= 3 && ok; dz++) for (let dx = -3; dx <= 3 && ok; dx++) {
        if (iceAt(X + dx, Z + dz) !== 2) ok = false;
        let y = L - 2; while (y > 1 && !w.get(X + dx, y, Z + dz)) y--;
        if (L - 1 - y < 6) ok = false;
        for (let k = L + 1; k < L + 16 && ok; k++) if (w.get(X + dx, k, Z + dz)) ok = false;
      }
      if (ok) spot = [X, Z];
    }
    const b = g.bots[0], px = (spot[0] + 0.5) * VS, pz = (spot[1] + 0.5) * VS;
    b.mover.reset(px, (L + 1) * VS + 0.02, pz); b.health = 100; b.armor = 100;
    __enkaz.step(20);
    const before = { y: b.mover.pos.y, wet: b.mover.inWater };
    g.destruction.blast(px, (L + 1) * VS - 0.15, pz, 1.2, 400, g.player);
    window.__victim = b;
    return { spot, before, frags: g.player.frags };
  });
  check('bot buz ustunde duruyor (batmiyor)', !r1.before.wet && Math.abs(r1.before.y - 4.75) < 0.05, JSON.stringify(r1.before));
  let r1b = null;
  for (let i = 0; i < 20 && !(r1b && r1b.dead); i++) {
    r1b = await page.evaluate(() => { __enkaz.step(60); const b = window.__victim; return { dead: !b.alive, wet: b.mover.inWater, hp: b.health, armor: b.armor, iceBy: b.iceBy ? b.iceBy.name : null }; });
  }
  const r1c = await page.evaluate(() => ({ kills: window.__T.kills.slice(), msgs: window.__T.msgs.slice(), frags: __enkaz.game.player.frags, pname: __enkaz.game.player.name, victim: window.__victim.name }));
  const k1 = r1c.kills.find((k) => k[0] === r1c.victim);
  check('kirik buzdan dusen bot donarak olur', r1b.dead && k1 && k1[2] === 'cold', JSON.stringify(k1 || r1b));
  check('parcalama buzu kiran oyuncunun', !!k1 && k1[1] === r1c.pname && r1c.frags === r1.frags + 1, `olduren ${k1 && k1[1]}, frag ${r1.frags}->${r1c.frags}`);
  check('BUZA GOMDUN mesaji', r1c.msgs.some((m) => /BUZA/.test(m)), r1c.msgs.join(' | '));
  check('zirh soguga karsi korumaz (zirh duruyor, can gitti)', r1b.armor === 100, `zirh ${r1b.armor}`);

  // 2) oyuncu buz gibi suda: ekranda kiragi, can azalir
  const r2 = await page.evaluate(() => {
    const g = __enkaz.game, p = g.player, [X, Z] = [Math.floor(window.__victim.mover.pos.x / 0.25), Math.floor(window.__victim.mover.pos.z / 0.25)];
    p.health = 100; p.armor = 0;
    p.mover.reset((X + 0.5) * 0.25, 3.6, (Z + 0.5) * 0.25);
    __enkaz.step(90);
    const op = parseFloat(document.getElementById('frost').style.opacity || '0');
    return { op, hp: p.health, wet: p.mover.inWater };
  });
  check('oyuncu soguk suda: kiragi perdesi ve hasar', r2.wet && r2.op > 0.3 && r2.hp < 100, JSON.stringify(r2));
  await page.evaluate(() => { const g = __enkaz.game; g.player.mover.reset(36, 9, 60); g.player.health = 100; __enkaz.step(120); });

  // 3) sarkit: kutuk evin sacagindaki bir sarkitin altina bot, oyuncu sarkitin kokunu vurur
  const r3 = await page.evaluate(() => {
    const g = __enkaz.game, w = g.world, VS = 0.25;
    let best = null;
    for (let z = 20; z < 268 && !best; z++) for (let x = 20; x < 268 && !best; x++) for (let y = 30; y < 60; y++) {
      if (w.get(x, y, z) !== 43 || w.get(x, y + 1, z) === 43 || !w.get(x, y + 1, z)) continue;   // sarkitin tepesi
      let len = 0; while (w.get(x, y - len, z) === 43) len++;
      let free = 0; while (free < 40 && !w.get(x, y - len - free, z)) free++;
      const gy = y - len - free + 1;   // ilk bos voxel (zemin)
      if (len < 3 || free < 6 || free > 14) continue;
      // altinda durulabilir duz zemin
      let flat = true;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.get(x + dx, gy - 1, z + dz) || w.get(x + dx, gy, z + dz)) flat = false;
      if (flat) best = { x, y, z, len, gy };
    }
    if (!best) return null;
    const b = g.bots[1];
    b.mover.reset((best.x + 0.5) * VS, best.gy * VS + 0.02, (best.z + 0.5) * VS); b.health = 100; b.armor = 0;
    __enkaz.step(10);
    const hp0 = b.health;
    // mermi gibi: yalniz sarkitin kokundeki voxel kirilir, gerisi kopup duser
    g.destruction.blast((best.x + 0.5) * VS, (best.y + 0.5) * VS, (best.z + 0.5) * VS, 0.12, 120, g.player);
    let hit = 0;
    for (let i = 0; i < 120; i++) { __enkaz.step(1); if (b.health < hp0 || !b.alive) { hit = i; break; } }
    return { best, hp0, hp: b.health, alive: b.alive, la: b.lastAttacker ? b.lastAttacker.name : null, pname: g.player.name, frames: hit, icicleLeft: w.get(best.x, best.y - 1, best.z) };
  });
  check('sarkit bulundu (sacak altinda, altinda zemin)', !!r3, JSON.stringify(r3 && r3.best));
  if (r3) {
    check('vurulan sarkit duser, altindakini yaralar', r3.hp < r3.hp0 && r3.icicleLeft !== 43, `can ${r3.hp0}->${r3.hp}, ${r3.frames} kare`);
    check('sarkit hasari vurana yazilir', r3.la === r3.pname, `saldirgan ${r3.la}`);
  }

  // 4) kardan adam: kirilinca saklanan esya gorunur ve alinabilir
  const r4 = await page.evaluate(() => {
    const g = __enkaz.game, it = g.items.list.find((i) => i.cache);
    const was = { hidden: it.hidden, visible: it.mesh.visible };
    g.destruction.blast(it.home.x, it.home.y + 0.35, it.home.z + 0.4, 1.0, 300, g.player);
    __enkaz.step(30);
    const now = { hidden: it.hidden, visible: it.mesh.visible, active: it.active };
    // oyuncu esyanin ustune: alinir
    const p = g.player; p.health = 50; p.armor = 0;
    p.mover.reset(it.pos.x, it.pos.y + 0.05, it.pos.z);
    __enkaz.step(20);
    return { type: it.type, was, now, after: { active: it.active, hp: p.health, armor: p.armor } };
  });
  check('kardan adamdaki esya saklidir', r4.was.hidden && !r4.was.visible, JSON.stringify(r4.was));
  check('kardan adam kirilinca esya gorunur', !r4.now.hidden && r4.now.visible, JSON.stringify(r4.now));
  check('ortaya cikan esya alinabilir', !r4.after.active, `${r4.type}: ${JSON.stringify(r4.after)}`);
  check('sayfa hatasi yok', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('HATA', e && e.stack || e); fails++;
} finally {
  await browser.close(); srv.kill();
}
console.log(fails ? `${fails} HATA` : 'tum buz golu oyun testleri gecti');
process.exitCode = fails ? 1 : 0;
