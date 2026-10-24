// Statik barindirma (GitHub Pages benzeri, COOP/COEP yok) ve file:// testi
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv = spawn('python3', ['-m', 'http.server', '8803', '--bind', '127.0.0.2', '--directory', 'docs'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const url of ['http://127.0.0.2:8803/?test&q=low&bots=4&seed=4242', 'file://' + process.cwd() + '/docs/index.html?test&q=low&bots=4&seed=4242']) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const logs = [], reqs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:')) reqs.push(r.url().slice(0, 80)); });
  await page.goto(url);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 240000, polling: 500 });
  await page.evaluate(() => { window.__enkaz.play(); window.__enkaz.step(120, 1 / 60, true); });
  const st = await page.evaluate(() => ({ state: window.__enkaz.game.state, actors: window.__enkaz.game.actors.length, quit: !document.getElementById('btnQuit').classList.contains('hidden'), title: document.title }));
  console.log(url.slice(0, 30), JSON.stringify(st), 'istekler:', JSON.stringify(reqs));
  console.log(logs.join('\n') || 'hata yok');
  await page.close();
}
await browser.close(); srv.kill();
