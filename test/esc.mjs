// Esc / Enter menu davranisi + bot isimleri
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8797' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('http://127.0.0.1:8797/?test&q=low&bots=7&seed=4242');
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
const st = () => page.evaluate(() => ({
  state: window.__enkaz.game.state,
  menu: !document.getElementById('menu').classList.contains('hidden'),
  settings: !document.getElementById('panelSettings').classList.contains('hidden'),
  hint: !document.getElementById('resumeHint').classList.contains('hidden'),
  play: document.getElementById('btnPlay').textContent,
}));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.click('#btnSettings');
console.log('ayarlar acik:', JSON.stringify(await st()));
await page.keyboard.press('Escape');
console.log('Esc -> ana menu:', JSON.stringify(await st()));
await page.evaluate(() => window.__enkaz.play());
console.log('oyunda:', JSON.stringify(await st()));
await page.keyboard.press('Escape');
console.log('Esc -> duraklat:', JSON.stringify(await st()));
await page.keyboard.press('Escape');
console.log('hemen Esc (yok sayilmali):', JSON.stringify(await st()));
await wait(450);
await page.keyboard.press('Escape');
await wait(200);
console.log('Esc -> devam:', JSON.stringify(await st()));
await page.keyboard.press('Enter');
await wait(200);
console.log('Enter:', JSON.stringify(await st()));
console.log('botlar:', await page.evaluate(() => window.__enkaz.game.bots.map((b) => b.name).join(', ')), '| oyuncu:', await page.evaluate(() => window.__enkaz.game.player.name));
console.log(logs.join('\n'));
await browser.close(); srv.kill();
