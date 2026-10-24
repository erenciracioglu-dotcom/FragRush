// Duraklat -> MACTAN CIK -> ana menu
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8804' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
const logs = []; page.on('pageerror', (e) => logs.push(e.message));
await page.goto('http://127.0.0.1:8804/?test&bots=4&seed=4242');
await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
const st = () => page.evaluate(() => ({ state: window.__enkaz.game.state, q: window.__enkaz.game.settings.quality, menu: !document.getElementById('menu').classList.contains('hidden'), leave: !document.getElementById('btnLeave').classList.contains('hidden'), play: document.getElementById('btnPlay').textContent, actors: window.__enkaz.game.actors.length, hint: document.getElementById('menuHint').textContent.slice(0, 40) }));
console.log('acilis:', JSON.stringify(await st()));
await page.evaluate(() => window.__enkaz.play());
await page.keyboard.press('Escape');
console.log('duraklat:', JSON.stringify(await st()));
await page.click('#btnLeave');
console.log('mactan cik:', JSON.stringify(await st()));
console.log(logs.join('\n') || 'hata yok');
await browser.close(); srv.kill();
