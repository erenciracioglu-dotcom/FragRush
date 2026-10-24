// Menu + HUD ekran goruntusu (DOM dahil) ve tum seslerin hatasiz calmasi
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8794' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', m => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:8794/?test&q=low&bots=6&seed=99`);
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
await page.evaluate(() => window.__enkaz.step(90, 1 / 60, true));
await page.screenshot({ path: '/tmp/claude-0/shots/ui_menu.png' });
await page.evaluate(() => { window.__enkaz.play(); const g = window.__enkaz.game; g.player.weapons.current = 0; window.__enkaz.input.virtualMouse = 1; });
await page.evaluate(() => window.__enkaz.step(40, 1 / 60, false));
await page.evaluate(() => { const g = window.__enkaz.game; g.hud.centerMsg('PARÇALADIN', 3); g.hud.subMsg('Vidalı Veli · 3 parçalama', 3); g.hud.feed(g.bots[0], g.bots[1], 'ROKET', false); g.hud.feed(g.player, g.bots[2], 'RAY', true); g.hud.damageDir(0.8); g.hud.hitmarker('hit'); g.hud.showFps = true; });
await page.evaluate(() => window.__enkaz.step(1, 1 / 60, true));
await page.screenshot({ path: '/tmp/claude-0/shots/ui_hud.png' });
// sesler
const res = await page.evaluate(async () => {
  const g = window.__enkaz.game, a = g.audio;
  a.init(); a.setVolume(0.5);
  const names = Object.getOwnPropertyNames(Object.getPrototypeOf(a)).filter(n => n.startsWith('s_')).map(n => n.slice(2));
  const errs = [];
  for (const n of names) { try { a.lastPlay.clear(); a.play(n, 36, 2, 36, 1, n === 'hit'); } catch (e) { errs.push(n + ': ' + e.message); } }
  await new Promise(r => setTimeout(r, 300));
  return { n: names.length, errs, state: a.ctx && a.ctx.state, voices: a.voices };
});
console.log('ses', JSON.stringify(res));
await page.evaluate(() => { const i = window.__enkaz.input; i.virtualMouse = 0; i.virtual.add('Tab'); });
await page.evaluate(() => window.__enkaz.step(1, 1 / 60, true));
await page.screenshot({ path: '/tmp/claude-0/shots/ui_score.png' });
console.log(logs.slice(0, 20).join('\n'));
await browser.close(); srv.kill();
