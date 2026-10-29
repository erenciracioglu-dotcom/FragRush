// Asama 0 olcumu: iki gercek Chrome (basliksiz) arasinda WebRTC DataChannel. wrangler dev (127.0.0.1:8787) gerekir.
// Olcer: kanal acilma suresi, gidis-donus (ping), 16 KB guvenilir mesaj yankisi, guvenilmez kanalda 60 Hz yankisi,
// baglanti turu; ayrica netsim (yapay gecikme / kayip) calisiyor mu.
// usage: node test/net.rtc.mjs [netsim=gecikme,oynama,kayip%]   (ornek: 150,20,2)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(root, '..', 'FragRush-CrazyGames', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const BASE = process.env.SIGNAL || 'http://127.0.0.1:8787';
const netsimArg = process.argv[2] || '';
const ns = netsimArg ? (() => { const [lat, jit, loss] = netsimArg.split(',').map(Number); return { lat, jit, loss: loss || 0 }; })() : null;

const bundle = (await esbuild.build({ entryPoints: [path.join(root, 'src/net/transport.js')], bundle: true, format: 'iife', globalName: 'FRNet', write: false })).outputFiles[0].text;

// bos sayfa: gercek bir yerel HTTP sunucusundan (route ile sunulan sayfa Chrome'un loopback izni kontrolune takiliyor)
const pageSrv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>t</title>'); }).listen(8899, '127.0.0.1');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
try {
  const mk = async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://127.0.0.1:8899/');
    await page.addScriptTag({ content: bundle });
    page.errs = errs;
    return page;
  };
  const [hp, gp] = [await mk(), await mk()];
  const code = await hp.evaluate(async ({ BASE, ns }) => {
    window.H = { opened: false, got: { r: 0, u: 0 }, echoR: 0, echoU: 0 };
    const room = await FRNet.RoomClient.host({
      base: BASE, name: 'Eren', netsim: ns,
      onLink: (link) => {
        window.H.link = link;
        link.onopen = () => { window.H.opened = true; };
        // ev sahibi yankilar: gelen her mesaji aynen geri yollar
        link.onmessage = (rel, buf) => { window.H.got[rel ? 'r' : 'u']++; link.send(rel, buf); };
      },
    });
    window.H.room = room;
    return room.code;
  }, { BASE, ns });
  console.log('oda kodu', code, ns ? `(netsim ${netsimArg})` : '');

  const t0 = Date.now();
  await gp.evaluate(async ({ BASE, code, ns }) => {
    window.G = { opened: false, echoR: 0, echoU: 0, rtts: [], sendT: new Map() };
    window.G.room = await FRNet.RoomClient.join({
      base: BASE, code, name: 'Ali', netsim: ns,
      onLink: (link) => {
        window.G.link = link;
        link.onopen = () => { window.G.opened = true; };
        link.onmessage = (rel, buf) => {
          const dv = new DataView(buf);
          if (rel) window.G.echoR++;
          else { window.G.echoU++; const t = window.G.sendT.get(dv.getUint32(0, true)); if (t) window.G.rtts.push(performance.now() - t); }
        };
      },
    });
  }, { BASE, code, ns });
  await gp.waitForFunction(() => window.G.opened, null, { timeout: 15000 });
  await hp.waitForFunction(() => window.H.opened, null, { timeout: 15000 });
  const joinMs = Date.now() - t0;
  const open = await gp.evaluate(() => ({ g: window.G.link.openMs }));
  const openH = await hp.evaluate(() => window.H.link.openMs);
  console.log(`katilma -> iki kanal acik: ${joinMs} ms (konuk linki ${open.g.toFixed(0)} ms, ev sahibi linki ${openH.toFixed(0)} ms)`);
  ok(joinMs < 5000, 'baglanti 5 sn icinde kuruldu');

  // 16 KB guvenilir x10, guvenilmez 120 mesaj (60 Hz, 2 sn)
  const res = await gp.evaluate(async () => {
    const L = window.G.link;
    for (let i = 0; i < 10; i++) { const b = new Uint8Array(16 * 1024); b[0] = i; L.send(true, b.buffer); }
    for (let i = 0; i < 120; i++) {
      const b = new ArrayBuffer(64); new DataView(b).setUint32(0, i + 1, true);
      window.G.sendT.set(i + 1, performance.now()); L.send(false, b);
      await new Promise((r) => setTimeout(r, 1000 / 60));
    }
    await new Promise((r) => setTimeout(r, 1500));
    const rt = window.G.rtts.slice().sort((a, b) => a - b);
    await L.refreshConnType();
    return { echoR: window.G.echoR, echoU: window.G.echoU, p50: rt[(rt.length / 2) | 0], p95: rt[(rt.length * 0.95) | 0], rtt: L.rtt, type: L.connType, bytesIn: L.bytesIn, bytesOut: L.bytesOut };
  });
  console.log(`16 KB guvenilir yanki: ${res.echoR}/10, guvenilmez yanki: ${res.echoU}/120, gidis-donus p50 ${res.p50?.toFixed(1)} ms p95 ${res.p95?.toFixed(1)} ms, ping ${res.rtt.toFixed(1)} ms, baglanti ${res.type}`);
  ok(res.echoR === 10, 'guvenilir kanal: 10 x 16 KB hepsi geldi');
  if (!ns) ok(res.echoU >= 110, 'guvenilmez kanal: kayipsiz yerel agda >=110/120');
  else ok(res.p50 > ns.lat * 0.8, 'netsim: gidis-donus gecikmesi ayarlanan degere yakin');

  // ev sahibi cikinca konuk haberdar olur
  const left = gp.evaluate(() => new Promise((r) => { window.G.room.onHostLeft = () => r(true); setTimeout(() => r(false), 5000); }));
  await hp.evaluate(() => window.H.room.close());
  ok(await left, 'ev sahibi cikinca konukta onHostLeft');
  ok(await gp.evaluate(() => window.G.link.closed), 'konuk linki kapandi');
  ok(hp.errs.length + gp.errs.length === 0, 'sayfa hatasi yok ' + JSON.stringify([...hp.errs, ...gp.errs]));
} finally { await browser.close(); pageSrv.close(); }
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
