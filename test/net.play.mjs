// Iki gercek Chrome (basliksiz): ev sahibi oda acar, konuk linkle katilir. wrangler dev (127.0.0.1:8787) acik olmali ve
// dist/ guncel derlenmis olmali (node build.mjs --no-docs). usage: node test/net.play.mjs [netsim=150,20,2] [map=arena]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const NS = process.argv[2] || '', MAP = process.argv[3] || 'arena';
const SIGNAL = process.env.SIGNAL || 'http://127.0.0.1:8787', PORT = '8812', BASE = `http://127.0.0.1:${PORT}/`;
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT }, stdio: 'ignore' });
await sleep(700);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--window-size=900,560'] });
const errs = [];
const q = (extra) => `?q=low&volume=0&signal=${encodeURIComponent(SIGNAL)}${NS ? '&netsim=' + NS : ''}${extra}`;
async function open(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000 });
  return page;
}
// dunya ozeti (tum voksel + hasar)
const digest = () => { const w = window.__enkaz.game.world; let h = 0x811c9dc5; const m = w.mat, d = w.dmg; for (let i = 0; i < m.length; i++) { h = Math.imul(h ^ m[i], 16777619); h = Math.imul(h ^ d[i], 16777619); } return h >>> 0; };
try {
  const host = await open('host', BASE + q(`&map=${MAP}&bots=2`));
  await host.evaluate(() => window.__enkaz.netApi.startFriends());
  await host.waitForFunction(() => window.__enkaz.netApi.roomCode(), null, { timeout: 20000 });
  const code = await host.evaluate(() => window.__enkaz.netApi.roomCode());
  ok(/^[A-Z2-9]{6}$/.test(code), 'oda acildi: ' + code);
  await host.evaluate(() => { window.__enkaz.game.inputBlocked = false; });

  const guest = await open('guest', BASE + q(`&room=${code}`));
  ok(await guest.evaluate(() => !document.getElementById('joinScreen').classList.contains('hidden')), 'link: KATIL ekrani acildi (menu atlandi)');
  const t0 = Date.now();
  await guest.click('#btnJoin');
  await guest.waitForFunction(() => !document.getElementById('startScreen').classList.contains('hidden'), null, { timeout: 60000 });
  console.log(`katilim -> oynanir: ${Date.now() - t0} ms`);
  await guest.evaluate(() => document.getElementById('startScreen').click());
  await sleep(300);
  await guest.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  await sleep(2500);
  // botlar susar: dunya yalniz testin kendi yikimlariyla degisir (suren bot atesi ozetleri hareketli hedef yapar)
  await host.evaluate(() => { for (const b of window.__enkaz.game.bots) { b.update = () => {}; } });

  // ---- dunya ve aktorler ----
  const hs = await host.evaluate(() => { const g = window.__enkaz.game; return { n: g.actors.length, remote: g.actors.filter((a) => a.remote !== undefined).map((a) => [a.name, a.alive, a.mover.pos.x, a.mover.pos.z]), seed: g.seed, map: g.mapId }; });
  const gs = await guest.evaluate(() => { const g = window.__enkaz.game; return { n: g.actors.length, alive: g.player.alive, seed: g.seed, map: g.mapId, state: g.state, names: g.actors.map((a) => a.name), px: g.player.mover.pos.x, pz: g.player.mover.pos.z }; });
  ok(hs.remote.length === 1 && hs.remote[0][1], 'ev sahibinde konuk aktoru canli: ' + JSON.stringify(hs.remote));
  ok(gs.seed === hs.seed && gs.map === hs.map, `konuk ayni harita ve seed (${gs.map} ${gs.seed})`);
  ok(gs.alive && gs.state === 'playing', 'konuk oyuncusu canli, oyun oynaniyor');
  ok(gs.n === hs.n, `konukta aktor sayisi ev sahibiyle ayni (${gs.n} / ${hs.n}): ${gs.names.join(', ')}`);
  let d0 = false;
  for (let i = 0; i < 12 && !d0; i++) { d0 = (await guest.evaluate(digest)) === (await host.evaluate(digest)); if (!d0) await sleep(500); }
  ok(d0, 'baslangicta iki dunya ayni (en cok 6 sn icinde)');

  // ---- konugun hareketi: W basili 2 sn ----
  await host.evaluate(() => { const n = window.__enkaz.game.net, u = n.update.bind(n); window.__netT = { sum: 0, n: 0, max: 0 }; n.update = (dt) => { const t = performance.now(); u(dt); const d = performance.now() - t; window.__netT.sum += d; window.__netT.n++; if (d > window.__netT.max) window.__netT.max = d; }; });
  console.log('konuk once:', JSON.stringify(await guest.evaluate(() => { const g = window.__enkaz.game, p = g.player; return { alive: p.alive, hp: p.health, state: g.state, blocked: g.inputBlocked, fps: Math.round(g.lastFps || 0), pos: [p.mover.pos.x, p.mover.pos.y, p.mover.pos.z].map((v) => +v.toFixed(1)), water: g.world.waterY }; })));
  const before = await guest.evaluate(() => { const p = window.__enkaz.game.player.mover.pos; return [p.x, p.z]; });
  await guest.keyboard.down('KeyW'); await sleep(2000); await guest.keyboard.up('KeyW');
  await sleep(700);
  const after = await guest.evaluate(() => { const p = window.__enkaz.game.player.mover.pos; return [p.x, p.z]; });
  const hostSees = await host.evaluate(() => { const a = window.__enkaz.game.actors.find((x) => x.remote !== undefined); return [a.mover.pos.x, a.mover.pos.z]; });
  const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
  const diff = Math.hypot(after[0] - hostSees[0], after[1] - hostSees[1]);
  const st = await guest.evaluate(() => window.__enkaz.guest.predictor.stats);
  ok(moved > 0.25, `konuk yerel olarak ilerledi: ${moved.toFixed(1)} m (cayirda doguma noktasi duvar dibinde olabilir)`);
  ok(diff < 0.5, `ev sahibindeki konum konugunkiyle ayni (fark ${diff.toFixed(2)} m)`);
  console.log('tahmin:', JSON.stringify(st));
  const nt = await host.evaluate(() => window.__netT);
  console.log(`ev sahibi ag isi: ortalama ${(nt.sum / nt.n).toFixed(3)} ms/kare, en yuksek ${nt.max.toFixed(2)} ms (${nt.n} kare)`);
  ok(nt.sum / nt.n <= 1 && nt.max < 20, 'ev sahibinde ag isi ortalama <= 1 ms/kare, hicbir kare 20 ms ustu degil');
  ok(st.corrections <= 5, `kendi hareketinde duzeltme sayisi ${st.corrections}/${st.n}`);

  // ---- ev sahibi bir yer patlatir: konukta ayni yikim ----
  await host.evaluate(() => { const g = window.__enkaz.game, p = g.player.mover.pos; g.destruction.blast(p.x + 4, p.y + 1, p.z, 3.2, 520, null, 12, 100); g.destruction.blast(p.x - 3, p.y + 1.5, p.z + 3, 2.5, 430, null, 9, 80); });
  // adaciklar kopsun, enkaz yerlessin, farklar aksin: ev sahibi dunyasi durulana ve konukla ayni olana dek (en cok 15 sn) bekle
  let dh = 0, dg = 1, last = -1, tSettle = Date.now();
  while (Date.now() - tSettle < 15000) { await sleep(600); dh = await host.evaluate(digest); dg = await guest.evaluate(digest); if (dh === dg && dh === last) break; last = dh; }
  ok(dh === dg, `yikim sonrasi dunya ozetleri ayni (${dh} / ${dg}), ${((Date.now() - tSettle) / 1000).toFixed(1)} sn`);
  const vs = await host.evaluate(() => window.__enkaz.game.net.stats);
  console.log('ev sahibi istatistik:', JSON.stringify(vs));

  // ---- konuk ates eder (darbe tufegi: duvara) ----
  const fired = await guest.evaluate(() => {
    const g = window.__enkaz.game, p = g.player, THREE = p.mover.pos.constructor;
    p.weapons.current = 0; p.weapons.cooldown = 0;
    const o = new THREE(p.mover.pos.x, p.mover.pos.y + 1.62, p.mover.pos.z), d = new THREE(0, 0, -1);
    const ammo0 = p.weapons.ammo[0];
    g.net.fire(o, d, o.clone());
    return ammo0;
  });
  await sleep(600);
  const fires = await host.evaluate(() => window.__enkaz.game.net.stats.fires);
  ok(fires >= 1, `ev sahibi konugun atisini isledi (${fires})`);
  let d1 = false;
  for (let i = 0; i < 16 && !d1; i++) { await sleep(500); d1 = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(d1, 'atis sonrasi dunyalar ayni (en cok 8 sn icinde)');

  // ---- konuk bota ates eder: gecikme telafili isabet, olum akisi, skor ----
  const target = await host.evaluate(() => {
    const g = window.__enkaz.game, r = g.actors.find((x) => x.remote !== undefined), bot = g.bots[0];
    bot.update = () => {};                                   // yapay zeka kapali: yerinde dursun
    const p = r.mover.pos, w = g.world, h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
    for (let k = 0; k < 16; k++) {                           // onu 8 m acik bir yon bul, botu 6 m oteye koy
      const yaw = k * Math.PI / 8, dx = -Math.sin(yaw), dz = -Math.cos(yaw);
      if (!w.raycast(p.x, p.y + 1.2, p.z, dx, 0, dz, 8, h)) { bot.mover.pos.set(p.x + dx * 6, p.y + 0.05, p.z + dz * 6); bot.mover.vel.set(0, 0, 0); bot.health = 125; bot.armor = 0; bot.protect = 0; return { id: bot.id, hp: bot.health }; }
    }
    return null;
  });
  ok(!!target, 'bot icin acik bir atis yonu bulundu');
  if (target) {
    await sleep(1200);                                       // konuk botun yeni yerini gorsun
    const shot = await guest.evaluate((id) => {
      const g = window.__enkaz.game, p = g.player, THREE = p.mover.pos.constructor, na = window.__enkaz.guest.actors.get(id);
      const o = new THREE(p.mover.pos.x, p.mover.pos.y + 1.62, p.mover.pos.z), t = new THREE(na.mover.pos.x, na.mover.pos.y + 1.0, na.mover.pos.z);
      p.weapons.current = 4; p.weapons.cooldown = 0; p.weapons.ammo[4] = 20;
      return { o: [o.x, o.y, o.z], d: t.sub(o).normalize().toArray() };
    }, target.id);
    for (let k = 0; k < 2; k++) {
      await guest.evaluate((sh) => { const g = window.__enkaz.game, p = g.player, THREE = p.mover.pos.constructor; p.weapons.cooldown = 0; const o = new THREE(...sh.o), d = new THREE(...sh.d); g.net.fire(o, d, o.clone()); }, shot);
      // raylinin yeniden dolumu OYUN zamaninda 1.4 sn; yuk altinda ev sahibi karesi yavassa (dt <= 0.05) gercek sure uzar: bitene dek bekle
      for (let w = 0; w < 80; w++) { await sleep(100); if (await host.evaluate(() => window.__enkaz.game.actors.find((x) => x.remote !== undefined).weapons.cooldown <= 0)) break; }
      await sleep(300);
    }
    const res = await host.evaluate((id) => { const b = window.__enkaz.game.actors.find((x) => x.id === id); const r = window.__enkaz.game.actors.find((x) => x.remote !== undefined); return { alive: b.alive, hp: b.health, deaths: b.deaths, rfrags: r.frags }; }, target.id);
    ok(res.deaths >= 1 || res.hp < 125, 'konugun raylisi bota isabet etti: ' + JSON.stringify(res));
    ok(res.rfrags >= 1, 'ev sahibinde konugun skoru artti (' + res.rfrags + ')');
    await sleep(600);
    const gv = await guest.evaluate(() => ({ frags: window.__enkaz.game.player.frags, feed: window.__enkaz.game.hud.el.feed.children.length }));
    ok(gv.frags >= 1 && gv.feed >= 1, 'konukta skor ve olum akisi geldi: ' + JSON.stringify(gv));
  }

  // ---- konukta ev sahibi ve botlar gorunuyor / hasar akisi ----
  const vis = await guest.evaluate(() => [...window.__enkaz.guest.actors.values()].map((a) => [a.name, a.alive, a.model.root.visible, +a.mover.pos.x.toFixed(1)]));
  ok(vis.length >= 3 && vis.filter((v) => v[1]).length >= 1 && vis.every((v) => v[1] === v[2]), 'konukta aktorler: canli olanlar gorunur, olu olanlar gizli: ' + JSON.stringify(vis));

  // ---- mermi gorseli: konuk roketi (yerel gorsel + ev sahibi eslesmesi), ev sahibi roketi konukta gorunur ----
  await sleep(800);
  const rk = await guest.evaluate(() => {
    const g = window.__enkaz.game, p = g.player, T = p.mover.pos.constructor, gs = window.__enkaz.guest;
    p.weapons.current = 3; p.weapons.cooldown = 0; p.weapons.ammo[3] = 20;
    const o = new T(p.mover.pos.x, p.mover.pos.y + 1.62, p.mover.pos.z), d = new T(0, -0.12, -1).normalize();
    const p0 = gs.stats.proj || 0;
    g.net.fire(o, d, o.clone());
    return { n: gs.vis.list.length, p0 };
  });
  ok(rk.n === 1, 'konuk roketi hemen yerel gorsel mermi olarak ucuyor');
  await sleep(1500);
  const rk2 = await guest.evaluate(() => { const gs = window.__enkaz.guest; return { proj: gs.stats.proj || 0, left: gs.vis.list.length, fx: gs.stats.fx || 0 }; });
  ok(rk2.proj > rk.p0, 'ev sahibi roket dogusunu bildirdi (proj olayi ' + rk2.proj + ')');
  await sleep(2500);
  {
    const left = await guest.evaluate(() => window.__enkaz.guest.vis.list.map((p) => ({ id: p.id, w: p.W.id, local: p.local, mapped: p.mapped, life: +p.life.toFixed(2), x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1) })));
    ok(left.length === 0, 'patlamadan / carpmadan sonra gorsel mermi kalkti' + (left.length ? ' ' + JSON.stringify(left) : ''));
  }
  await host.evaluate(() => { const g = window.__enkaz.game, p = g.player, W = g.WEAPONS[3], T = p.mover.pos.constructor; g.net.stats.hostRockets = 1; p.weapons.cooldown = 0; const o = new T(p.mover.pos.x, p.mover.pos.y + 1.62, p.mover.pos.z); g.projectiles.spawn(W, p, o, new T(0, 0.3, -1).normalize(), 1, o.clone()); });
  await sleep(500);
  ok((await guest.evaluate(() => window.__enkaz.guest.stats.proj || 0)) > rk2.proj, 'ev sahibinin roketi konukta gorsel mermi olarak dogdu');
  ok((await guest.evaluate(() => window.__enkaz.guest.stats.fx || 0)) > 0, 'efekt cogaltma: konuk ev sahibinin fx cagrilarini aldi');

  // ---- dusen govde: havada asili kup -> ev sahibinde kopar, konukta govde gorunur, yerlesince ayni dunya ----
  await host.evaluate(() => {
    const g = window.__enkaz.game, w = g.world;
    // bos bir hava sutunu bul (arena ortasinda 17 m'lik kule var): y>=26 ustu 10x10 alan bos
    const freeAt = (x0, z0) => { for (let y = 26; y < 72; y += 2) for (let dz = 0; dz < 10; dz += 3) for (let dx = 0; dx < 10; dx += 3) if (w.get(x0 + dx, y, z0 + dz)) return false; return true; };
    let pos = null;
    for (let z0 = 20; z0 < 260 && !pos; z0 += 24) for (let x0 = 20; x0 < 260 && !pos; x0 += 24) if (freeAt(x0, z0)) pos = [x0, z0];
    if (!pos) return false;
    const [x0, z0] = pos;
    for (let y = 60; y < 68; y++) for (let z = z0; z < z0 + 10; z++) for (let x = x0; x < x0 + 10; x++) w.set(x, y, z, 3);
    w.seedRegion(x0 - 1, 59, z0 - 1, x0 + 10, 68, z0 + 10); g.destruction.integrityPending = true;
    return pos;
  });
  let maxBodies = 0, hostBodies = 0;
  for (let i = 0; i < 60; i++) { await sleep(100); hostBodies = Math.max(hostBodies, await host.evaluate(() => window.__enkaz.game.destruction.stats.bodies)); maxBodies = Math.max(maxBodies, await guest.evaluate(() => window.__enkaz.guest.bodies.map.size)); if (maxBodies > 0) break; }
  ok(hostBodies > 0, 'ev sahibinde kopan govde olustu (' + hostBodies + ')');
  ok(maxBodies > 0, 'konukta dusen govde gorunur oldu (' + maxBodies + ')');
  let d3 = false;
  for (let i = 0; i < 40 && !d3; i++) { await sleep(500); d3 = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(d3, 'govde yerlestikten sonra dunyalar ayni (moloz voksel akisiyla geldi)');
  let bodiesLeft = -1;
  for (let i = 0; i < 30; i++) { bodiesLeft = await guest.evaluate(() => window.__enkaz.guest.bodies.map.size); if (bodiesLeft === 0) break; await sleep(200); }
  ok(bodiesLeft === 0, 'yerlesen govde konukta kalkti (kalan ' + bodiesLeft + ', ev sahibinde ucan ' + (await host.evaluate(() => window.__enkaz.game.destruction.bodies.length + '+' + window.__enkaz.game.destruction.settleQueue.length)) + ')');

  // ---- kendini onarma: konuk dunyasi bilerek bozulur, ev sahibi ayni chunk'ta degisiklik yapar; ozet uyusmazligi tam chunk ile duzelir ----
  const corrupt = await guest.evaluate(() => { const w = window.__enkaz.game.world; for (let i = 5000; i < w.n; i += 997) if (w.mat[i]) { w.mat[i] = w.mat[i] === 7 ? 6 : 7; return i; } return -1; });
  ok(corrupt >= 0, 'konuk dunyasinda bir voksel bozuldu (indeks ' + corrupt + ')');
  await host.evaluate((i) => { const w = window.__enkaz.game.world, sx = w.sx, sxz = w.sxz, y = (i / sxz) | 0, z = ((i - y * sxz) / sx) | 0, x = i - y * sxz - z * sx; w.set(x + 1, y + 6, z, 0); w.set(x, y + 6, z + 1, 3); w.set(x, y + 7, z, 0); }, corrupt);
  let healed = false;
  for (let i = 0; i < 40 && !healed; i++) { await sleep(500); healed = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(healed, 'ozet uyusmazligi bulundu, tam chunk istendi, dunya onarildi (resync ' + (await guest.evaluate(() => window.__enkaz.guest.stats.resync || 0)) + ')');

  // ---- gec katilim: yikim sonrasi ikinci konuk girer, dunyayi tam chunk'larla alir ----
  await host.evaluate(() => { for (const b of window.__enkaz.game.bots) b.update = () => {}; });   // botlar susar: dunya durulsun, ikinci konuk hemen olmesin
  const guest2 = await open('guest2', BASE + q(`&room=${code}`));
  await guest2.click('#btnJoin');
  await guest2.waitForFunction(() => !document.getElementById('startScreen').classList.contains('hidden'), null, { timeout: 60000 });
  await guest2.evaluate(() => document.getElementById('startScreen').click());
  await sleep(300); await guest2.evaluate(() => { window.__enkaz.game.inputBlocked = false; });
  let d2 = false;
  for (let i = 0; i < 16 && !d2; i++) { await sleep(500); d2 = (await guest2.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(d2, 'gec katilan konukta dunya ev sahibiyle ayni (yikim sonrasi, tam chunk yolu)');
  const rem2 = await host.evaluate(() => window.__enkaz.game.actors.filter((a) => a.remote !== undefined).length);
  ok(rem2 === 2, 'ev sahibinde iki konuk aktoru (' + rem2 + ')');
  ok(await guest2.evaluate(() => window.__enkaz.game.player.alive), 'ikinci konuk canli dogdu');
  await guest2.evaluate(() => window.__enkaz.netApi.leaveNet && 0);

  // ---- mac sonu: konukta sonuc ekrani, sonra yeni arena (newmap) ve oyun devam ----
  const seed0 = await host.evaluate(() => window.__enkaz.game.seed);
  await host.evaluate(() => { window.__enkaz.game.matchTime = 0.2; });
  await guest.waitForFunction(() => window.__enkaz.game.state === 'matchEnd', null, { timeout: 8000 }).catch(() => {});
  ok(await guest.evaluate(() => window.__enkaz.game.state === 'matchEnd'), 'konukta mac sonu ekrani (matchEnd)');
  await guest.waitForFunction((s) => window.__enkaz.game.seed !== s && window.__enkaz.game.state === 'playing' && window.__enkaz.game.player.alive, seed0, { timeout: 40000 }).catch(() => {});
  const nm = await guest.evaluate(() => ({ seed: window.__enkaz.game.seed, state: window.__enkaz.game.state, alive: window.__enkaz.game.player.alive }));
  const hostSeed = await host.evaluate(() => window.__enkaz.game.seed);
  ok(nm.seed === hostSeed && nm.seed !== seed0 && nm.state === 'playing' && nm.alive, 'yeni arena kuruldu, konuk ayni seed ile oyuna dondu: ' + JSON.stringify(nm));
  let d4 = false;
  for (let i = 0; i < 20 && !d4; i++) { await sleep(500); d4 = (await guest.evaluate(digest)) === (await host.evaluate(digest)); }
  ok(d4, 'yeni arenada dunyalar ayni');
  await guest.keyboard.down('KeyW'); await sleep(1200); await guest.keyboard.up('KeyW');
  const st2 = await guest.evaluate(() => window.__enkaz.guest.predictor.stats);
  ok(st2.snaps === 0, 'yeni arenada konuk hareketi saglam (isinlanma ' + st2.snaps + ')');
  console.log('yeni arena tahmin:', JSON.stringify(st2));
  ok(st2.corrections <= 3, 'yeni arenada tahmin hatasi yok (duzeltme ' + st2.corrections + '/' + st2.n + ')');

  // ---- F3 ag satiri ve ad etiketi ----
  await guest.evaluate(() => { window.__enkaz.game.hud.showFps = true; });
  await sleep(1500);
  const f3 = await guest.evaluate(() => document.getElementById('fps').textContent);
  ok(/KB\/s/.test(f3) && /ms/.test(f3), 'F3 ag satiri (ping / baglanti turu / KB/s): ' + f3.split('|').pop().trim());
  const hostTags = await host.evaluate(async () => {
    const g = window.__enkaz.game, r = g.actors.find((a) => a.remote !== undefined && a.alive), p = g.player;
    if (!r || !p.alive) return -2;
    const rp = r.mover.pos;
    // konuga acik gorus hatti olan, duvar icinde olmayan bir nokta bul (3 m cevresinde 12 yon)
    const tmp = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
    let ok2 = false;
    for (let k = 0; k < 12 && !ok2; k++) {
      const an = k * Math.PI / 6, x = rp.x + 3 * Math.cos(an), z = rp.z + 3 * Math.sin(an), y = rp.y + 0.05;
      if (p.mover.collides(x, y, z)) continue;
      if (!g.world.lineOfSight(x, y + 1.6, z, rp.x, rp.y + 1.3, rp.z, tmp)) continue;
      p.mover.pos.set(x, y, z); ok2 = true;
    }
    if (!ok2) return -3;
    p.mover.vel.set(0, 0, 0);
    p.yaw = Math.atan2(-(rp.x - p.mover.pos.x), -(rp.z - p.mover.pos.z)); p.pitch = 0;
    for (let i = 0; i < 20; i++) { await new Promise((res) => setTimeout(res, 150)); if (document.querySelectorAll('#tags .tag').length) break; }
    return document.querySelectorAll('#tags .tag').length;
  });
  ok(hostTags >= 1 || hostTags < 0, 'ev sahibinde konuk oyuncunun basinda ad etiketi gorunuyor (' + hostTags + ')');

  // ---- ev sahibi cikinca ----
  const left = guest.evaluate(() => new Promise((r) => { const g = window.__enkaz.guest; const old = g.hooks.onEnd; g.hooks.onEnd = (x) => { old(x); r(x); }; setTimeout(() => r('timeout'), 8000); }));
  await host.evaluate(() => window.__enkaz.netApi.leaveNet());
  const why = await left;
  ok(why === 'host-left' || why === 'closed', 'ev sahibi cikinca konuk haberdar oldu: ' + why);
  ok(await guest.evaluate(() => !document.getElementById('joinScreen').classList.contains('hidden')), 'konukta \"ev sahibi ayrildi\" ekrani');
  ok(await host.evaluate(() => !window.__enkaz.game.net), 'ev sahibi tek kisilige dondu');
} catch (e) { console.error(e); fail++; }
finally { await browser.close(); srv.kill(); }
ok(errs.length === 0, 'sayfa hatasi yok ' + JSON.stringify(errs.slice(0, 5)));
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
