// Yerel (SwiftShader) adli inceleme bench'i: sader derleme hatasi / JS hatasi var mi diye hizli kontrol
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [,, extra = '&fp&forensic', secs = '12'] = process.argv;
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8794' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall') && !t.includes('Automatic fallback')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:8794/?bench=${secs}&q=ultra&bots=7&seed=4242&tag=loc${extra}`);
try {
  await page.waitForFunction(() => document.title === 'BENCH DONE', null, { timeout: 240000, polling: 1000 });
  console.log('BENCH DONE');
} catch (e) { console.log('zaman asimi'); }
console.log(logs.slice(0, 30).join('\n'));
await browser.close(); srv.kill();
