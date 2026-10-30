// Fisekhane ag testi (iki tarayici, canli oda sunucusu): ev sahibi sandik yiginini tutusturur ve bir fitili depoya
// yakin yakar. Konuk fwSys.netStats sayaclariyla cizirti / sandik patlamasi / fisek / depo uyarisi / depo patlamasi
// olaylarini alir, fitil kivilcimi konukta ev sahibiyle birlikte ilerler. Konugun baslattigi (ona yazilan) zincir ev
// sahibinin iki botunu oldurur: konukta iki frag ve ZINCIRLEME x2! mesaji. Duman cokunce iki dunya ayni; sayfa hatasi yok.
// usage: SIGNAL=<oda sunucusu> PORT=8915 node test/net.fireworks.mjs
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const SIGNAL = process.env.SIGNAL || 'http://127.0.0.1:8787', PORT = process.env.PORT || '8915', BASE = `http://127.0.0.1:${PORT}/`;
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
const NS = () => ({ ...window.__enkaz.game.fwSys.netStats });
const quiet = () => { const f = window.__enkaz.game.fwSys; return f.shells.length === 0 && f.crates.every((c) => c.st !== 1 && c.st !== 3) && f.fuses.every((u) => u.st !== 1) && f.depots.every((d) => d.st !== 1); };
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
  await host.evaluate(() => { const g = window.__enkaz.game; g.settings.map = 'fireworks'; g.matchTime = 0.2; });
  await guest.waitForFunction(() => window.__enkaz.game.mapId === 'fireworks' && window.__enkaz.game.state === 'playing' && window.__enkaz.game.player.alive, null, { timeout: 90000 });
  ok(true, 'konuk fisekhane haritasina gecti');
  await sleep(2500);
  await host.evaluate(SILENCE);
  const act = await Promise.all([host, guest].map((p) => p.evaluate(() => { const f = window.__enkaz.game.fwSys; return f.active ? `${f.crates.length}/${f.fuses.length}/${f.depots.length}` : 'kapali'; })));
  ok(act[0] === '72/3/2' && act[1] === act[0], 'iki tarafta fisekhane sistemi kurulu (sandik/fitil/depo ' + act.join(' | ') + ')');
  await guest.evaluate(() => { const g = window.__enkaz.game; window.__msgs = []; const cm = g.hud.centerMsg.bind(g.hud); g.hud.centerMsg = (t, d) => { window.__msgs.push(t); return cm(t, d); }; });

  // 1) konugun zinciri (her sey saglamken): ev sahibinin iki botu sandigin dibinde
  const f0 = await guest.evaluate(() => window.__enkaz.game.player.frags);
  const who = await host.evaluate(() => {
    const g = window.__enkaz.game, fw = g.fwSys, VS = 0.25, y = fw.G * VS + 0.02;
    const ga = g.actors.find((a) => a !== g.player && !g.bots.includes(a));
    const put = (b, x, z) => { if (!b.alive) b.spawn({ x, y, z, yaw: 0 }); b.mover.reset(x, y, z); b.mover.vel.set(0, 0, 0); b.health = 100; b.armor = 0; b.protect = 0; };
    const c = fw.crates[44];
    put(g.bots[0], fw.crates[46].cx, fw.crates[46].z0 * VS - 0.7);
    put(g.bots[1], c.x0 * VS - 0.7, c.cz);
    fw._ignite(c, ga, 0, 0, [0.3, 0.3]);
    return ga ? ga.name : null;
  });
  let msgs = [], f1 = f0;
  for (let i = 0; i < 24; i++) { await sleep(500); [msgs, f1] = await guest.evaluate(() => [window.__msgs.slice(), window.__enkaz.game.player.frags]); if (f1 - f0 >= 2 && msgs.some((m) => /x2/.test(m))) break; }
  ok(!!who && f1 - f0 === 2, `konugun zinciri iki botu oldurdu: frag +${f1 - f0} (${who})`);
  ok(msgs.some((m) => /ZİNCİRLEME!/.test(m)) && msgs.some((m) => /ZİNCİRLEME x2!/.test(m)), 'konukta ZINCIRLEME! ve ZINCIRLEME x2! ' + JSON.stringify(msgs.slice(-4)));
  for (let i = 0; i < 40; i++) { await sleep(500); if (await host.evaluate(quiet)) break; }

  // 2) ev sahibi: saglam bir sandik yigini + depoya 3 sn kala fitil
  const n0 = await guest.evaluate(NS);
  const h0 = await host.evaluate(() => { const g = window.__enkaz.game, fw = g.fwSys, f = fw.fuses[2]; const s = { ...fw.stats }; const c = [36, 52, 0, 12, 24].map((i) => fw.crates[i]).find((o) => o.st === 0); if (c) fw._ignite(c, g.player, 0, 0, [0.3, 0.3]); fw._light(f, f.n - 30, g.player, 0); return s; });
  await sleep(700);
  const sp = [];
  for (let i = 0; i < 3; i++) { sp.push(await Promise.all([host.evaluate(() => window.__enkaz.game.fwSys.fuses[2].p), guest.evaluate(() => { const u = window.__enkaz.game.fwSys.fuses[2]; return u.st === 1 ? u.p : -1; })])); await sleep(400); }
  ok(sp.every(([h, g]) => g >= 0 && Math.abs(h - g) < 4) && sp[2][1] > sp[0][1] + 4, 'konukta fitil kivilcimi ev sahibiyle birlikte ilerliyor ' + JSON.stringify(sp.map(([h, g]) => [+h.toFixed(1), +g.toFixed(1)])));
  for (let i = 0; i < 40; i++) { await sleep(500); if (await host.evaluate(quiet)) break; }
  const n1 = await guest.evaluate(NS), h1 = await host.evaluate(() => ({ ...window.__enkaz.game.fwSys.stats }));
  const d = Object.fromEntries(Object.keys(n1).map((k) => [k, n1[k] - n0[k]]));
  ok(d.fz > 0 && d.bx > 0 && d.sh > 0 && d.dw >= 1 && d.dx >= 1, 'konuk olaylari aldi ' + JSON.stringify(d));
  ok(d.bx === h1.crates - h0.crates && d.sh === h1.shells - h0.shells && d.dx === h1.depots - h0.depots, `konuktaki patlama / fisek / depo sayisi ev sahibininkiyle ayni (sandik ${h1.crates - h0.crates}, fisek ${h1.shells - h0.shells}, depo ${h1.depots - h0.depots})`);

  // 3) iki dunya ayni
  let eq = false;
  for (let i = 0; i < 40 && !eq; i++) { await sleep(500); eq = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(eq, 'zincir, fitil ve depo sonrasi iki dunya ayni');
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); srv.kill(); }
ok(errs.length === 0, 'sayfa hatasi 0 ' + JSON.stringify(errs.slice(0, 4)));
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
