// Akis testleri: olum/yeniden dogus, mac sonu -> yeni arena, KIYAMET toplama, ziplama pedi
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8795' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
await page.goto(`http://127.0.0.1:8795/?test&q=low&bots=5&seed=31337`);
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
const ev = (fn, a) => page.evaluate(fn, a);
const step = (n) => ev((n) => window.__enkaz.step(n, 1 / 60, false), n);
await ev(() => window.__enkaz.play());
await step(90); // dogma korumasi bitsin
// 1) olum ve yeniden dogus
let r = await ev(() => { const g = window.__enkaz.game; g.player.takeDamage(999, g.bots[0], 'rocket', null, false); return { alive: g.player.alive, deaths: g.player.deaths, botFrags: g.bots[0].frags, deathHidden: document.getElementById('death').classList.contains('hidden') }; });
await step(5);
r.deathScreen = await ev(() => !document.getElementById('death').classList.contains('hidden'));
console.log('olum:', JSON.stringify(r));
await step(Math.ceil((1.6 + 2.6) * 60));
console.log('otomatik dogus:', JSON.stringify(await ev(() => { const g = window.__enkaz.game; return { alive: g.player.alive, hp: g.player.health, deathScreen: !document.getElementById('death').classList.contains('hidden') }; })));
// 2) ziplama pedi: oyuncuyu pede koy
r = await ev(() => { const g = window.__enkaz.game, p = g.player, pd = g.pads[0]; p.mover.reset(pd.x, pd.y + 0.05, pd.z); return { pad: [pd.x, pd.y, pd.z, pd.tx, pd.ty, pd.tz] }; });
await step(2);
const v0 = await ev(() => { const v = window.__enkaz.game.player.mover.vel; return [v.x, v.y, v.z]; });
await step(120);
const after = await ev(() => { const p = window.__enkaz.game.player.mover.pos; return [p.x, p.y, p.z]; });
console.log('ped: hiz', v0.map(x => x.toFixed(1)).join(','), 'hedef', r.pad.slice(3).map(x => x.toFixed(1)).join(','), 'son konum', after.map(x => x.toFixed(1)).join(','));
// 3) KIYAMET toplama
r = await ev(() => { const g = window.__enkaz.game; const it = g.items.list.find(i => i.type === 'quad'); it.active = true; it.mesh.visible = true; const p = g.player; p.mover.reset(it.pos.x, it.pos.y + 0.05, it.pos.z); return it.pos.y; });
await step(3);
console.log('kiyamet:', JSON.stringify(await ev(() => { const g = window.__enkaz.game; return { quad: g.player.quad.toFixed(1), itemActive: g.items.list.find(i => i.type === 'quad').active }; })));
// 4) kamp tespiti: oyuncuyu sabit tut
await ev(() => { const g = window.__enkaz.game; g.player.protect = 999; g.camp = null; });
await step(16 * 60);
console.log('kamp:', JSON.stringify(await ev(() => { const g = window.__enkaz.game; return { campT: g.camp && g.camp.t.toFixed(1), hunters: g.bots.filter(b => b.target === g.player).length, breach: g.bots.filter(b => b.breachT > 0).length, msg: document.getElementById('center-msg').textContent }; })));
// 5) mac sonu
await ev(() => { const g = window.__enkaz.game; g.player.protect = 0; g.player.frags = 24; g.onKill(g.bots[1], g.player, 'rail', false); });
console.log('mac sonu durum:', await ev(() => window.__enkaz.game.state));
await step(8 * 60);
await page.waitForFunction(() => window.__enkaz.game.state === 'playing', null, { timeout: 60000, polling: 300 }).catch(() => {});
console.log('yeni mac:', JSON.stringify(await ev(() => { const g = window.__enkaz.game; return { state: g.state, seed: g.seed, frags: g.player.frags, alive: g.player.alive }; })));
console.log(logs.slice(0, 20).join('\n'));
await browser.close(); srv.kill();
