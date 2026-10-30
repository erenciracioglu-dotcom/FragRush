// Gok Adalari ag testi (iki tarayici, canli oda sunucusu): ev sahibi ve konuk gok adalarina gecer. Ev sahibinde
// konugun aktoru bahce adasinin kristalini kirar; konuk adanin durumlarini (uyari, dusus, yukselis) ev sahibiyle
// birlikte gorur, dusen ada konukta govde olarak gorunur. Adadaki bot konuga yazilir: konukta frag ve ADAYI
// DUSURDUN! mesaji. Ev sahibinin itip bulutlara dusurdugu konuk BULUTLARA DUSTUN basligini gorur. Ada geri gelince
// iki dunya ayni; sayfa hatasi yok.
// usage: SIGNAL=<oda sunucusu> PORT=8965 node test/net.sky.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const SIGNAL = process.env.SIGNAL || 'http://127.0.0.1:8787', PORT = process.env.PORT || '8965', BASE = `http://127.0.0.1:${PORT}/`;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT }, stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
const errs = [];
const q = (extra) => `?q=low&volume=0&lang=tr&signal=${encodeURIComponent(SIGNAL)}${extra}`;
async function open(name, url) {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  return page;
}
const digest = () => { const w = window.__enkaz.game.world; let h = 0x811c9dc5; const m = w.mat, d = w.dmg; for (let i = 0; i < m.length; i++) { h = Math.imul(h ^ m[i], 16777619); h = Math.imul(h ^ d[i], 16777619); } return h >>> 0; };
const SILENCE = () => { const g = window.__enkaz.game; for (const b of g.bots) { b.think = () => {}; b.steer = () => { b.cmd.fwd = 0; b.cmd.side = 0; b.cmd.jump = false; b.cmd.dash = false; }; b.tryFire = () => {}; } };
const PH = () => window.__enkaz.game.skySys.isles.map((s) => s.phase).join('');
try {
  const host = await open('host', BASE + q('&map=arena&bots=2'));
  await host.evaluate(() => window.__enkaz.netApi.startFriends());
  await host.waitForFunction(() => window.__enkaz.netApi.roomCode(), null, { timeout: 30000 });
  const code = await host.evaluate(() => window.__enkaz.netApi.roomCode());
  await host.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  const guest = await open('guest', BASE + q(`&room=${code}`));
  await guest.click('#btnJoin');
  await guest.waitForFunction(() => !document.getElementById('startScreen').classList.contains('hidden'), null, { timeout: 60000 });
  await guest.evaluate(() => document.getElementById('startScreen').click());
  await sleep(300); await guest.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  await host.evaluate(() => { const g = window.__enkaz.game; g.settings.map = 'sky'; g.matchTime = 0.2; });
  await guest.waitForFunction(() => window.__enkaz.game.mapId === 'sky' && window.__enkaz.game.state === 'playing' && window.__enkaz.game.player.alive, null, { timeout: 90000 });
  ok(true, 'konuk gok adalarina gecti');
  await sleep(2500);
  await host.evaluate(SILENCE);
  const act = await Promise.all([host, guest].map((p) => p.evaluate(() => { const k = window.__enkaz.game.skySys; return k.active ? k.isles.length + ':' + k.isles.map((s) => s.phase).join('') : 'kapali'; })));
  ok(act[0] === '6:000000' && act[1] === act[0], 'iki tarafta gok adalari sistemi kurulu, adalar ayakta (' + act.join(' | ') + ')');
  await guest.evaluate(() => { const g = window.__enkaz.game; window.__msgs = []; window.__snd = []; const cm = g.hud.centerMsg.bind(g.hud); g.hud.centerMsg = (t, d) => { window.__msgs.push(t); return cm(t, d); }; if (g.audio) { const ap = g.audio.play.bind(g.audio); g.audio.play = (n, ...a) => { window.__snd.push(n); return ap(n, ...a); }; } window.__ph = new Set(); window.__body = false; setInterval(() => { const k = g.skySys; window.__ph.add(k.isles[1].phase); if (k.isles[1].body) window.__body = true; }, 50); });

  // 1) ev sahibinde konugun aktoru bahce adasinin kristalini kirar; adadaki bot konuga yazilir
  const r1 = await host.evaluate(() => {
    const g = window.__enkaz.game, k = g.skySys, isl = k.isles[1], ga = g.actors.find((a) => a !== g.player && !g.bots.includes(a)), b = g.bots[0];
    const s = (k.allSpawns || g.arena.spawns).find((x) => x.isle === 1);
    b.mover.reset(s.x, s.y, s.z); b.mover.vel.set(0, 0, 0); b.health = 100; b.protect = 0;
    window.__gf0 = ga ? ga.frags : -1;
    k.damage(isl, isl.maxHp, ga);
    return { ga: ga ? ga.name : null, ph: isl.phase, bot: b.name };
  });
  ok(!!r1.ga && r1.ph === 1, 'ev sahibinde kristal kirildi, uyari basladi (kiran: konuk ' + r1.ga + ')');
  await guest.waitForFunction(() => window.__enkaz.game.skySys.isles[1].phase === 1, null, { timeout: 3000 }).then(() => ok(true, 'konukta uyari gorundu'), () => ok(false, 'konukta uyari gorundu'));
  await sleep(4500);
  const r2 = await host.evaluate(() => { const g = window.__enkaz.game, ga = g.actors.find((a) => a !== g.player && !g.bots.includes(a)); return { ph: g.skySys.isles[1].phase, df: ga.frags - window.__gf0, botAlive: g.bots[0].alive }; });
  const g2 = await guest.evaluate(() => ({ ph: [...window.__ph], body: window.__body, msgs: window.__msgs.slice(), snd: [...new Set(window.__snd)], frags: window.__enkaz.game.player.frags }));
  ok(r2.ph >= 2 && g2.ph.includes(2), 'ada dustu: ev sahibi ' + r2.ph + ', konukta gorulen evreler ' + g2.ph.join(','));
  ok(g2.body, 'dusen ada konukta govde olarak gorundu');
  // en az +1: bot[0] adaya kondu; dolasan baska bir bot da o an adadaysa onunla birlikte duser (+2)
  ok(r2.df >= 1, 'adadaki bot konuga yazildi (ev sahibinde konugun fragi +' + r2.df + ')');
  ok(g2.msgs.includes('ADAYI DÜŞÜRDÜN!'), 'konukta ADAYI DUSURDUN! ' + JSON.stringify(g2.msgs));
  ok(['islandRumble', 'cloudWhoosh'].every((n) => g2.snd.includes(n)), 'konukta dusus sesleri ' + JSON.stringify(g2.snd));

  // 2) ev sahibi konugu koy adasindan bulutlara iter (kimse vurmadan): konuk kendi duser, -1 ve olum basligi
  const gf = await guest.evaluate(() => window.__enkaz.game.player.frags);
  await host.evaluate(() => {
    const g = window.__enkaz.game, k = g.skySys, ga = g.actors.find((a) => a !== g.player && !g.bots.includes(a)), isl = k.isles[3];
    const s = (k.allSpawns || g.arena.spawns).find((x) => x.isle === 3);
    ga.lastAttacker = null; ga.lastAttackTime = -100;
    ga.mover.reset(s.x, s.y + 0.5, s.z);
    const dx = isl.def.x * 0.25 - 36, dz = isl.def.z * 0.25 - 36, l = Math.hypot(dx, dz) || 1;
    ga.mover.vel.set(dx / l * 22, 5, dz / l * 22); ga.mover.onGround = false;
  });
  const fell = await guest.waitForFunction(() => !window.__enkaz.game.player.alive, null, { timeout: 8000 }).then(() => true, () => false);
  await sleep(600);
  const g3 = await guest.evaluate(() => ({ title: document.getElementById('deathTitle').textContent, frags: window.__enkaz.game.player.frags }));
  ok(fell && g3.title === 'BULUTLARA DÜŞTÜN', 'konuk bulutlara dustu, olum basligi: ' + g3.title);
  ok(g3.frags === gf - 1, 'konugun kendi dususu -1 (' + gf + ' -> ' + g3.frags + ')');

  // 3) ada geri gelir (~45 sn): konuk yukselisi gorur (ses), iki dunya ayni
  await host.waitForFunction(() => { const k = window.__enkaz.game.skySys, i = k.isles[1]; return i.phase === 0 && !i.body && !i.rise; }, null, { timeout: 90000, polling: 500 });
  await guest.waitForFunction(() => { const k = window.__enkaz.game.skySys, i = k.isles[1]; return i.phase === 0 && !i.rise; }, null, { timeout: 15000, polling: 250 });
  await sleep(3000);
  const g4 = await guest.evaluate(() => ({ ph: [...window.__ph], snd: [...new Set(window.__snd)] }));
  ok(g4.ph.includes(4) && g4.snd.includes('islandRise'), 'konukta ada yukseldi (evreler ' + g4.ph.join(',') + ', ses islandRise ' + g4.snd.includes('islandRise') + ')');
  const dg = await Promise.all([host, guest].map((p) => p.evaluate(digest)));
  ok(dg[0] === dg[1], 'ada dondukten sonra iki dunya ayni (' + dg.join(' / ') + ')');
  ok(errs.length === 0, 'sayfa hatasi 0 ' + JSON.stringify(errs.slice(0, 3)));
} catch (e) {
  ok(false, 'beklenmeyen hata: ' + e.message);
} finally {
  await browser.close();
  srv.kill();
}
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
