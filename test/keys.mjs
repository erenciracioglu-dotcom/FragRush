// Tus atama: panel, klavye/fare atamasi, yasak tuslar (Ctrl+W), cakisma, kalicilik, varsayilana donus ve
// oyunda yeni tusun gercekten calismasi. Kullanim: node test/keys.mjs [ekran_goruntusu_oneki]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const out = process.argv[2] || '/tmp/claude-0/shots/keys';
fs.mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
const srv = spawn('node', ['serve.mjs'], { env: { ...process.env, PORT: '8797' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
const exe = process.env.CHROME || undefined;
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
let fail = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'HATA ') + msg); if (!c) fail++; };
const URL = 'http://127.0.0.1:8797/?test&q=low&bots=2&seed=4242&lang=tr';
const load = async () => {
  await page.goto(URL);
  await page.waitForFunction(() => window.__enkaz && window.__enkaz.ready, null, { timeout: 180000, polling: 500 });
};
const binds = () => page.evaluate(() => window.__enkaz.input.binds.map);
const slot = (a, s) => `#kbList button[data-a="${a}"][data-s="${s}"]`;

await load();
await page.evaluate(() => localStorage.removeItem('fragrush.keys'));
await load();
await page.click('#btnControls');
ok(await page.isVisible('#btnKeys'), 'Kontroller panelinde TUSLARI DEGISTIR dugmesi');
await page.click('#btnKeys');
ok(await page.isVisible('#panelKeys'), 'tus atama paneli acildi');
ok((await page.$$('#kbList .kbRow')).length === 17, '17 eylem satiri');
await page.screenshot({ path: out + '_panel_tr.png' });

// ileri -> I (KeyI)
await page.click(slot('forward', 0));
ok((await page.textContent(slot('forward', 0))).includes('bas'), 'bekleme durumu');
await page.keyboard.press('KeyI');
ok((await binds()).forward[0] === 'KeyI', 'ileri = I');

// yasak: Ctrl, Meta, F5, Esc iptal
await page.click(slot('crouch', 0));
await page.keyboard.down('ControlLeft'); await page.keyboard.up('ControlLeft');
ok((await binds()).crouch[0] === 'KeyC', 'Ctrl atanmadi');
ok((await page.textContent('#kbMsg')).includes('Ctrl+W'), 'Ctrl+W uyarisi gorundu');
await page.keyboard.press('MetaLeft');
ok((await binds()).crouch[0] === 'KeyC', 'Win/Cmd atanmadi');
await page.keyboard.press('F5');
ok((await binds()).crouch[0] === 'KeyC', 'F5 atanmadi');
await page.keyboard.press('Escape');
ok((await binds()).crouch[0] === 'KeyC' && await page.isVisible('#panelKeys'), 'Esc iptal etti, panel acik kaldi');
// localStorage'a elle yazilmis Ctrl de yuklenmez
const ctrlLoad = await page.evaluate(() => {
  const B = window.__enkaz.input.binds;
  localStorage.setItem('fragrush.keys', JSON.stringify({ v: 1, map: { ...B.map, crouch: ['ControlLeft', null] } }));
  B.load(); const r = B.map.crouch.slice();
  localStorage.setItem('fragrush.keys', JSON.stringify({ v: 1, map: { ...B.map, crouch: ['KeyC', null] } })); B.load();
  return r;
});
ok(ctrlLoad[0] === null, 'kayitta Ctrl olsa da yuklenmiyor');

// cakisma: egil -> Q (onceki silahtan alinir)
await page.click(slot('crouch', 0));
await page.keyboard.press('KeyQ');
let b = await binds();
ok(b.crouch[0] === 'KeyQ' && b.prevWeapon[0] === null, 'Q onceki silahtan alindi, egile verildi');
ok((await page.textContent('#kbMsg')).length > 5, 'cakisma mesaji: ' + await page.textContent('#kbMsg'));

// fare: ates -> sag tik, nisan -> orta tik, ziplama ikinci yuva -> fare yan dugmesi yerine Backspace temizleme
await page.click(slot('fire', 0));
await page.mouse.click(640, 360, { button: 'right' });
b = await binds();
ok(b.fire[0] === 'Mouse2' && b.zoom[0] === null, 'ates = sag tik (nisandan alindi)');
ok(await page.isVisible('#panelKeys'), 'fare tiklamasi menude baska bir seye basmadi');
await page.click(slot('zoom', 0));
await page.mouse.click(640, 360, { button: 'middle' });
ok((await binds()).zoom[0] === 'Mouse1', 'nisan = orta tik');
await page.click(slot('dash', 1));
await page.keyboard.press('Backspace');
ok((await binds()).dash[1] === null, 'Backspace yuvayi bosaltti');
// ziplama -> F (layout harfi)
await page.click(slot('jump', 0));
await page.keyboard.press('KeyF');
ok((await binds()).jump[0] === 'KeyF', 'zipla = F');
await page.screenshot({ path: out + '_changed_tr.png' });

// metinlerdeki {K:...} ve kontroller listesi yeni tuslari gosteriyor
await page.click('#btnBack3');
ok(await page.isVisible('#panelControls'), 'GERI -> kontroller paneli');
const ctl = await page.evaluate(() => [...document.querySelectorAll('#panelControls [data-key]')].map((e) => e.dataset.key + '=' + e.textContent));
console.log('     ' + ctl.join(' | '));
ok(ctl.includes('move=IASD') && ctl.includes('jump=F'), 'kontroller listesi guncel');
const water = await page.evaluate(() => window.__enkaz.input && document.querySelector('[data-i18n="kWaterText"]').textContent);
ok(water.includes('F') && water.includes('dalmak için Q'), 'su kurali metni yeni tuslarla: ' + water.slice(0, 70));
await page.click('#btnBack2');

// kalicilik
await load();
b = await binds();
ok(b.forward[0] === 'KeyI' && b.fire[0] === 'Mouse2' && b.jump[0] === 'KeyF' && b.crouch[0] === 'KeyQ', 'yeniden yuklemede atamalar korundu');

// oyunda: I ileri goturur, W gotumez; F zipla; sanal tus ve fare dugmesi
const moved = await page.evaluate(async () => {
  const E = window.__enkaz, g = E.game, i = E.input;
  E.play(); E.step(60, 1 / 60, false);
  const p = g.player.mover.pos;
  const dist = (code) => { const a = { x: p.x, z: p.z }; i.virtual.add(code); E.step(40, 1 / 60, false); i.virtual.delete(code); E.step(20, 1 / 60, false); return Math.hypot(p.x - a.x, p.z - a.z); };
  const w = dist('KeyW'), I = dist('KeyI');
  const y0 = p.y; i.virtual.add('KeyF'); E.step(8, 1 / 60, false); i.virtual.delete('KeyF'); const jumpUp = g.player.mover.vel.y;
  i.virtualMouse = 4; const fireR = i.act('fire'); i.virtualMouse = 1; const fireL = i.act('fire'); i.virtualMouse = 0;
  return { w, I, jumpUp, y0, fireR, fireL };
});
console.log('     ' + JSON.stringify(moved));
ok(moved.I > 2 && moved.w < 0.5, 'oyunda I ileri goturuyor, W artik gotumuyor');
ok(moved.fireR && !moved.fireL, 'ates sag tikta, sol tikta degil');

// varsayilana don
await page.evaluate(() => { window.__enkaz.game.startMatch(false); });
await load();
await page.click('#btnControls'); await page.click('#btnKeys');
await page.click('#btnKbReset');
b = await binds();
ok(b.forward[0] === 'KeyW' && b.fire[0] === 'Mouse0' && b.jump[0] === 'Space' && b.crouch[0] === 'KeyC' && b.prevWeapon[0] === 'KeyQ', 'varsayilana donuldu');
await page.selectOption && 0;
await page.click('#btnBack3'); await page.click('#btnBack2');
await page.click('#btnSettings'); await page.selectOption('#setLang', 'en'); await page.click('#btnBack1');
await page.click('#btnControls'); await page.click('#btnKeys');
await page.screenshot({ path: out + '_panel_en.png' });
ok((await page.textContent('#kbList')).includes('Forward'), 'Ingilizce eylem adlari');
await page.keyboard.press('Escape');
ok(await page.isVisible('#panelControls'), 'Esc tus panelinden kontrollere dondu');

ok(logs.length === 0, 'sayfa hatasi yok' + (logs.length ? ': ' + logs.join(' / ') : ''));
await browser.close(); srv.kill();
console.log(fail ? `${fail} HATA` : 'HEPSI GECTI');
process.exit(fail ? 1 : 0);
