// Tam mac testi: ev sahibi + 2 konuk (hepsi otomatik pilotla), botlarla en az N sn oynar. wrangler dev (127.0.0.1:8787) acik
// olmali; dist/ guncel olmali (node build.mjs --no-docs). Olcut: sayfa hatasi 0; sonunda dunya ozetleri ayni; oldurme akislari
// ayni (arena degisimi sirasindaki ~2 sn'lik pencere payi); konuk basina ortalama / tepe KB/s; kare suresi (game.update ms).
// usage: node test/net.fullmatch.mjs [sure_sn=300] [harita=arena] [netsim=]   (arka planda calistir: dakikalarca surer)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const DUR = Number(process.argv[2] || 300), MAP = process.argv[3] || 'arena', NS = process.argv[4] || '';
const SIGNAL = process.env.SIGNAL || 'http://127.0.0.1:8787', PORT = '8812', BASE = `http://127.0.0.1:${PORT}/`;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT }, stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=640,400'] });
const errs = [];
const q = (extra) => `?q=low&volume=0&signal=${encodeURIComponent(SIGNAL)}${NS ? '&netsim=' + NS : ''}${extra}`;
async function open(name, url) {
  const page = await (await browser.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  // game.update suresi (ms/kare)
  await page.evaluate(() => { const g = window.__enkaz.game, u = g.update.bind(g); window.__upd = { sum: 0, n: 0, max: 0 }; g.update = (dt) => { const t = performance.now(); u(dt); const d = performance.now() - t; window.__upd.sum += d; window.__upd.n++; if (d > window.__upd.max) window.__upd.max = d; }; });
  return page;
}
const digest = () => { const w = window.__enkaz.game.world; let h = 0x811c9dc5; const m = w.mat, d = w.dmg; for (let i = 0; i < m.length; i++) { h = Math.imul(h ^ m[i], 16777619); h = Math.imul(h ^ d[i], 16777619); } return h >>> 0; };
const snap = (p) => p.evaluate(() => { const g = window.__enkaz.game, n = g.net, u = window.__upd; const m = n ? n.meter : null; return { fps: Math.round(g.lastFps || 0), updMs: u.n ? u.sum / u.n : 0, updMax: u.max, inKB: m ? m.inKB : 0, outKB: m ? m.outKB : 0, avgIn: m ? m.avgIn() : 0, avgOut: m ? m.avgOut() : 0, peakIn: m ? m.peakIn : 0, peakOut: m ? m.peakOut : 0, pc: window.__enkaz.guest ? window.__enkaz.guest.predictor.stats.corrections + '/' + window.__enkaz.guest.predictor.stats.n + ' s' + window.__enkaz.guest.predictor.seq + '/a' + window.__enkaz.guest.predictor.lastAck : '-', state: g.state, alive: g.player.alive, frags: g.player.frags, seed: g.seed }; });
try {
  // ---- tek kisilik taban: ayni sayfa, ag yok, otomatik pilot, 15 sn ----
  const solo = await open('solo', BASE + q('&map=' + MAP + '&bots=3&autopilot'));
  await solo.evaluate(() => { const g = window.__enkaz.game; g.startMatch(true); g.inputBlocked = false; }); await sleep(500);
  await solo.evaluate(() => { window.__enkaz.game.inputBlocked = false; window.__upd.sum = 0; window.__upd.n = 0; window.__upd.max = 0; });
  await sleep(15000);
  const soloS = await snap(solo);
  console.log(`tek kisilik taban: ${soloS.fps} FPS, game.update ${soloS.updMs.toFixed(2)} ms (en yuksek ${soloS.updMax.toFixed(1)})`);
  await solo.close();

  // ---- mac ----
  const host = await open('host', BASE + q('&map=' + MAP + '&bots=3&autopilot'));
  await host.evaluate(() => window.__enkaz.netApi.startFriends());
  await host.waitForFunction(() => window.__enkaz.netApi.roomCode(), null, { timeout: 30000 });
  const code = await host.evaluate(() => window.__enkaz.netApi.roomCode());
  await host.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  const guests = [];
  for (let i = 0; i < 2; i++) {
    const g = await open('guest' + i, BASE + q(`&room=${code}&autopilot`));
    await g.click('#btnJoin');
    await g.waitForFunction(() => !document.getElementById('startScreen').classList.contains('hidden'), null, { timeout: 60000 });
    await g.evaluate(() => document.getElementById('startScreen').click());
    await sleep(300); await g.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
    guests.push(g);
  }
  for (const p of [host, ...guests]) await p.evaluate(() => { window.__upd.sum = 0; window.__upd.n = 0; window.__upd.max = 0; });
  console.log(`oda ${code}, ${MAP}, ${DUR} sn, 3 bot, 3 insan (otomatik pilot)`);
  // SWITCH=<harita>: ev sahibi maci bitirip o haritaya gecer (ag uzerinden newmap), sonra o haritada oynanir
  if (process.env.SWITCH) {
    const to = process.env.SWITCH;
    await host.evaluate((m) => { const g = window.__enkaz.game; g.settings.map = m; g.matchTime = 0.2; }, to);
    await Promise.all(guests.map((g) => g.waitForFunction((m) => window.__enkaz.game.mapId === m && window.__enkaz.game.state === 'playing' && window.__enkaz.game.player.alive, to, { timeout: 90000 })));
    ok(true, 'konuklar ' + to + ' haritasina gecti: ' + (await Promise.all(guests.map((g) => g.evaluate(() => window.__enkaz.game.mapId + '/' + window.__enkaz.game.seed)))).join(', ') + ' (ev sahibi ' + (await host.evaluate(() => window.__enkaz.game.mapId + '/' + window.__enkaz.game.seed)) + ')');
    for (const p of [host, ...guests]) await p.evaluate(() => { const pr = window.__enkaz.guest && window.__enkaz.guest.predictor; if (pr) { pr.stats.n = 0; pr.stats.corrections = 0; pr.stats.small = 0; pr.stats.big = 0; pr.stats.maxErr = 0; pr.stats.sumErr = 0; pr.stats.snaps = 0; } });
  }
  const fpsAcc = [[], [], []];
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < DUR) {
    await sleep(30000);
    if (process.env.EARLYEND && Date.now() - t0 < 40000) await host.evaluate(() => { window.__enkaz.game.matchTime = 25; });   // arena degisimini erkene cek (hata ayiklama)
    const ss = await Promise.all([host, ...guests].map(snap));
    ss.forEach((s, i) => fpsAcc[i].push(s.fps));
    console.log(`t=${Math.round((Date.now() - t0) / 1000)}s  ` + ss.map((s, i) => `${i ? 'k' + i : 'ev'}: ${s.fps}fps upd ${s.updMs.toFixed(1)}ms ${s.state}${s.alive ? '' : '(olu)'} f${s.frags} ${s.inKB.toFixed(1)}/${s.outKB.toFixed(1)}KB/s c${s.pc}`).join(' | ') + ` | hata ${errs.length}`);
  }
  const fin = await Promise.all([host, ...guests].map(snap));

  // ---- sessizlesme: pilotlar ve botlar durur; dunyalar ve olum sayilari esitlenmeli ----
  for (const p of [host, ...guests]) await p.evaluate(() => { const g = window.__enkaz.game; g.autopilot = null; for (const b of g.bots) b.update = () => {}; });
  let eq = false, tq = Date.now();
  while (Date.now() - tq < 45000 && !eq) {
    await sleep(1500);
    const ds = await Promise.all([host, ...guests].map((p) => p.evaluate(digest)));
    eq = ds.every((d) => d === ds[0]);
  }
  ok(eq, `mac sonunda 3 sayfanin dunya ozetleri ayni (${((Date.now() - tq) / 1000).toFixed(1)} sn sessizlesme)`);
  const kills = await Promise.all([host.evaluate(() => window.__enkaz.game.net.stats.kills), ...guests.map((g) => g.evaluate(() => window.__enkaz.guest.stats.kills))]);
  console.log('oldurme sayilari (ev sahibi / konuklar):', kills.join(' / '));
  for (let i = 1; i < kills.length; i++) ok(Math.abs(kills[0] - kills[i]) <= Math.max(3, kills[0] * 0.1), `konuk ${i} olum akisi ev sahibiyle uyumlu (${kills[i]} / ${kills[0]}; arena degisim penceresi payi)`);
  ok(kills[0] > 0, 'macta olumler oldu (' + kills[0] + ')');
  const names = ['ev sahibi', 'konuk 1', 'konuk 2'];
  fin.forEach((s, i) => console.log(`${names[i]}: ${s.fps} FPS son, game.update ort ${s.updMs.toFixed(2)} ms en yuksek ${s.updMax.toFixed(1)} ms | KB/s ort in ${s.avgIn.toFixed(1)} out ${s.avgOut.toFixed(1)} tepe in ${s.peakIn.toFixed(1)} out ${s.peakOut.toFixed(1)}`));
  ok(fin.slice(1).every((s) => s.avgIn <= 50), 'konuk basina ortalama gelen veri <= 50 KB/s');
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const fm = fpsAcc.map(mean);
  console.log(`ortalama FPS (ayni anda, ayni yuk altinda; basliksiz yazilim cizimi): ev sahibi ${fm[0].toFixed(0)}, konuk 1 ${fm[1].toFixed(0)}, konuk 2 ${fm[2].toFixed(0)}; tek kisilik taban (yalniz basina) ${soloS.fps}`);
  ok(fm[1] >= fm[0] * 0.9 && fm[2] >= fm[0] * 0.9, 'konuklarin FPS ortalamasi ev sahibininkinden dusuk degil (bot yapay zekasi ve yikim hesabi konukta calismiyor)');
  ok(fin.every((s) => s.updMax < 200), 'hicbir sayfada 200 ms ustu game.update karesi yok (' + fin.map((s) => s.updMax.toFixed(0)).join(', ') + ')');
  const pr = await Promise.all(guests.map((g) => g.evaluate(() => window.__enkaz.guest.predictor.stats)));
  console.log('tahmin:', pr.map((s) => `${s.corrections}/${s.n} duzeltme (>1 cm), ortalama hata ${(s.sumErr / s.n * 100).toFixed(2)} cm, >25 cm ${s.big}, en buyuk ${(s.maxErr * 100).toFixed(1)} cm, isinlanma ${s.snaps}`).join(' | '));
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); srv.kill(); }
ok(errs.length === 0, 'sayfa hatasi 0 ' + JSON.stringify(errs.slice(0, 5)));
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
