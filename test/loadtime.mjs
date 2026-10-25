// Yukleme suresi olcumu: gercek Chrome (GPU ile, pencereli), sayfa acilisindan oyun hazir olana kadar.
// usage: node test/loadtime.mjs [tekrar=2] [harita=meadow,arena] [gpu=default|high]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const reps = Number(process.argv[2] || 2);
const maps = (process.argv[3] || 'meadow,arena').split(',');
const gpu = process.argv[4] || 'default';

const srv = spawn(process.execPath, [path.join(root, 'serve.mjs')], { cwd: root, env: { ...process.env, PORT: '8811' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));
const args = ['--window-size=1280,760'];
if (gpu === 'high') args.push('--force-high-performance-gpu');
const browser = await chromium.launch({ channel: 'chrome', headless: false, args });
try {
  for (const map of maps) {
    for (let i = 0; i < reps; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1216, height: 684 } });
      const page = await ctx.newPage();
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:8811/?map=${map}&bots=7`);
      await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 120000, polling: 50 });
      const total = Date.now() - t0;
      const info = await page.evaluate(() => {
        const g = window.__enkaz.game; const gl = g.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info');
        return { ldt: g.ldt, gpu: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', nav: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) };
      });
      console.log(JSON.stringify({ map, run: i + 1, total, dcl: info.nav, ...info.ldt, gpu: info.gpu.slice(0, 60) }));
      await ctx.close();
    }
  }
} finally { await browser.close(); srv.kill(); }
