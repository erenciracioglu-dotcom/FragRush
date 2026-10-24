// Headless goruntu: node test/shot.mjs "<query>" out.png [steps] [w] [h] [evalJs]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, query = '', out = 'shot.png', steps = '3', W = '960', H = '600', evalJs = ''] = process.argv;
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8790' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 400));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:8790/?test&${query}`);
try { await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 }); }
catch (e) { logs.push('[timeout] ready bekleniyordu'); }
const tReady = Date.now() - t0;
if (evalJs) { try { const r = await page.evaluate(evalJs); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r).slice(0, 2000)); } catch (e) { logs.push('[evalerror] ' + e.message); } }
const t1 = Date.now();
const url = await page.evaluate((n) => { window.__enkaz.step(n); return window.__enkaz.capture(); }, +steps);
const tStep = Date.now() - t1;
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
const stats = await page.evaluate(() => { const g = window.__enkaz.game; return { tris: g.chunks && g.chunks.triangles, calls: g.renderer.info.render.calls, rtris: g.renderer.info.render.triangles, frame: g.frame, extra: window.__enkaz.stats ? window.__enkaz.stats() : null }; });
console.log('ready ms', tReady, 'step ms', tStep, 'stats', JSON.stringify(stats));
console.log(logs.filter(l => !l.includes('GPU stall') && !l.includes('Automatic fallback')).slice(0, 40).join('\n'));
await browser.close();
srv.kill();
