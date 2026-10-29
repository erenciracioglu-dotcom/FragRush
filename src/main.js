// FragRush giris noktasi: ayarlar, menu, ana dongu.
import { Game } from './game/game.js';
import { Input } from './core/input.js';
import { HUD } from './ui/hud.js';
import { Audio } from './audio/sfx.js';
import { MeshBasicMaterial as THREE_Basic, MeshStandardMaterial as THREE_Std } from 'three';
import { voxelUniforms } from './world/voxelMaterial.js';
import { t, setLang, onLangChange } from './i18n.js';
import { portal } from './portal.js';
import { NET } from './config.js';
import { RoomClient, parseNetsim, HostSession, GuestSession, Autopilot } from './net/index.js';

/* global __BUILD_TIME__ */
const params = new URLSearchParams(location.search);
const DEFAULTS = { sensitivity: 1.0, fov: 100, quality: 'low', bots: 3, difficulty: 0, diffScale: 2, lang: 'en', volume: 0.7, invert: false, showFps: false, map: 'rotate', mapVer: 2 };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('fragrush.settings') || localStorage.getItem('enkaz.settings') || '{}'); } catch (e) { s = {}; }
  // zorluk olcegi 4 -> 7 seviyeye cikti: eski kayitli zorluk yeni varsayilana doner
  if (s.diffScale !== 2) { s.difficulty = DEFAULTS.difficulty; s.diffScale = 2; }
  // varsayilan zorluk Acemi (yeni oyuncu ilk maci kaybetmesin). Kayitli zorluk yalniz oyuncu ayarlardan
  // kendisi sectiyse korunur; eski kayitlardaki zorluk o zamanki varsayilandi (Normal).
  if (!s.diffChosen) s.difficulty = DEFAULTS.difficulty;
  // varsayilan bot sayisi 3 (yeni oyuncu once kirilabilir ortami kesfetsin); kayitli sayi yalniz oyuncu
  // ayarlardan kendisi degistirdiyse korunur (eski kayitlardaki 7 o zamanki varsayilandi)
  if (!s.botsChosen) s.bots = DEFAULTS.bots;
  // harita listesi degisti (2 -> 6 harita; SIRAYLA oyuncak odasiyla acilir): eski kayitli harita secimi bir kez varsayilana doner
  if (s.mapVer !== DEFAULTS.mapVer) { s.map = DEFAULTS.map; s.mapVer = DEFAULTS.mapVer; }
  return { ...DEFAULTS, ...s };
}
function saveSettings(s) { try { localStorage.setItem('fragrush.settings', JSON.stringify(s)); } catch (e) { /* yok */ } }

const settings = loadSettings();
// oyuncu dili kendisi secmis mi (secmediyse portalin bildirdigi dil kullanilir)
const langSaved = (() => { try { return !!JSON.parse(localStorage.getItem('fragrush.settings') || '{}').lang; } catch (e) { return false; } })();
if (params.get('q')) settings.quality = params.get('q');
if (params.has('bots')) settings.bots = Number(params.get('bots'));
if (params.get('lang')) settings.lang = params.get('lang');
if (params.get('map')) settings.map = params.get('map');
setLang(settings.lang);
settings.seed = params.has('seed') ? Number(params.get('seed')) : 0;
const testMode = params.has('test');
if (testMode) settings.volume = 0;

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const input = new Input(canvas);
const hud = new HUD();
const audio = new Audio();
audio.setVolume(settings.volume);
hud.showFps = !!settings.showFps;
const game = new Game(canvas, settings, { hud, audio, input });
window.__enkaz = { game, ready: false, input };
// cok oyunculu maçta menu acikken ya da duraklatilmisken (tek kisilikte oyun durur, cok oyunculuda yalniz girdi kesilir)
const midMatch = () => game.state === 'paused' || game.inputBlocked;

// ---- portal (CrazyGames) ----
// SDK oyunu hicbir zaman bekletmez: yuklenemezse oyun aynen calisir.
let gameLoaded = false;
const portalReady = portal.init().then(() => {
  if (!portal.ready) return;
  if (!gameLoaded) portal.loadingStart();
  audio.setMuted(portal.muted);
  portal.onMuteChange((m) => audio.setMuted(m));
  if (!langSaved && !params.get('lang')) {
    const lang = /^tr/i.test(portal.locale()) ? 'tr' : 'en';
    if (lang !== settings.lang) { settings.lang = lang; setLang(lang); const sl = document.getElementById('setLang'); if (sl) sl.value = lang; }
  }
});

const menu = $('menu'), btnPlay = $('btnPlay');
const panels = { settings: $('panelSettings'), controls: $('panelControls') };
const buttons = $('menuButtons');
function showPanel(name) {
  buttons.classList.toggle('hidden', !!name);
  for (const k in panels) panels[k].classList.toggle('hidden', k !== name);
  if (name === 'controls') {
    // harita kurallari: yalniz secili (macta: oynanan) haritanin karti; SIRAYLA'da hepsi (harita arttikca panel
    // kucuk pencereye sigmiyordu)
    const m = game.state === 'paused' ? game.mapId : settings.map;
    for (const c of panels.controls.querySelectorAll('[data-rules]')) c.classList.toggle('hidden', m !== 'rotate' && c.dataset.rules !== m);
  }
}
function showMenu(v) {
  menu.classList.toggle('hidden', !v);
  hud.show(!v && game.state === 'playing');
  if (v) showPanel(null);
  btnPlay.textContent = midMatch() ? t('resume') : t('play');
  $('btnLeave').classList.toggle('hidden', !midMatch());
  mapPick.classList.toggle('hidden', midMatch() || !!game.net);
  $('btnFriends').classList.toggle('hidden', !NET_ON || midMatch() || !!game.net);
  $('roomBox').classList.toggle('hidden', !game.net || !v);
  if (game.net && v) renderRoom();
  syncMapPick();
}
// harita secimi (ana menude): secilen harita hemen kurulur; SIRAYLA her mactan sonra degistirir
const mapPick = $('mapPick');
function syncMapPick() { for (const b of mapPick.querySelectorAll('button[data-map]')) b.classList.toggle('on', b.dataset.map === settings.map); }
mapPick.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-map]');
  if (!b || game.state !== 'menu') return;
  settings.map = b.dataset.map;
  saveSettings(settings);
  syncMapPick();
  if (settings.map !== 'rotate' && settings.map !== game.mapId) await rebuildArena(settings.map);
});
// tarayici dahili ekran kartinda calisiyorsa (cift kartli dizustulerde sik) kisa bir uyari goster
let gpuIntegrated = null;
function checkGpu() {
  try {
    const gl = game.renderer && game.renderer.getContext();
    if (!gl) return;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '');
    gpuIntegrated = /intel|radeon\(tm\) graphics|radeon graphics|vega \d/i.test(r) && !/arc\(tm\) a\d/i.test(r);
  } catch (e) { gpuIntegrated = false; }
}
function setHint() {
  $('menuHint').innerHTML = (gpuIntegrated ? '<div class="gpuwarn">' + t('igpuWarn') + '</div>' : '') + t('menuHint') + '<br><span style="opacity:.6">' + t('build') + ' ' + (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__.slice(0, 16).replace('T', ' ') : '') + '</span>';
}
setHint();
onLangChange(() => { setHint(); btnPlay.textContent = game.state === 'paused' ? t('resume') : t('play'); hud.relabel(); game.player.name = t('you'); });

async function startPlay() {
  if (game.inputBlocked) { resumeGame(); return; }
  audio.init();
  audio.setVolume(settings.volume);
  const fresh = game.state === 'menu';
  if (fresh) game.startMatch(true);
  else if (game.state === 'paused') game.state = 'playing';
  else if (game.state !== 'playing') return;
  showMenu(false);
  resumeHint(false);
  // portalda tam ekrani portal saglar (oyun ici tam ekran istegi yasak)
  if (!portal.on && settings.fullscreen !== false && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* olmadi */ }
  }
  lockKeys();
  input.lock();
  if (fresh) showKeyCard();
}
btnPlay.addEventListener('click', startPlay);

// ---- CrazyGames: yukleme bitince menu yerine baslangic ekrani; tek tik (ya da Enter / Bosluk) oyuna sokar ----
// (Full Launch sarti: yeni oyuncu hemen oyuna girmeli, en fazla 1 tik). Ana menu: Esc ya da mactan cikinca.
const startScreen = $('startScreen');
const directStart = (portal.on || params.has('direct')) && !testMode && !params.has('bench');
function showStart(v) { startScreen.classList.toggle('hidden', !v); }
function startFromScreen() {
  if (startScreen.classList.contains('hidden')) return;
  if (game.net && game.net.role === 'guest') { showStart(false); startGuestPlay(); return; }
  if (game.state !== 'menu') return;
  showStart(false);
  startPlay();
}
startScreen.addEventListener('click', startFromScreen);

// ---- ilk mac: kisa tus karti (yalniz ilk kez; H ile gizlenir, 12 sn sonra kendiliginden kaybolur) ----
const keyCard = $('keyCard');
let keyCardTimer = 0;
function hideKeyCard() {
  if (keyCard.classList.contains('hidden')) return;
  keyCard.classList.add('fade');
  clearTimeout(keyCardTimer);
  setTimeout(() => keyCard.classList.add('hidden'), 650);
}
function showKeyCard() {
  let seen = false;
  try { seen = localStorage.getItem('fragrush.keycard') === '1'; localStorage.setItem('fragrush.keycard', '1'); } catch (e) { /* yok */ }
  if (seen || testMode) return;
  keyCard.classList.remove('hidden', 'fade');
  keyCardTimer = setTimeout(hideKeyCard, 12000);
}

// ---- Esc / Enter ile menu ----
// Tam ekranda Esc tusunu sayfaya al (tarayici Esc'yi yutmasin; tam ekrandan cikmak icin Esc basili tutulur)
function lockKeys() {
  try { if (document.fullscreenElement && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {}); } catch (e) { /* yok */ }
}
const resumeEl = $('resumeHint');
function resumeHint(v) { resumeEl.classList.toggle('hidden', !v); }
let lastPauseT = 0;
function pauseGame() {
  if (game.state !== 'playing') return;
  hideKeyCard();
  lastPauseT = performance.now();
  if (game.net) game.inputBlocked = true; else game.state = 'paused';
  resumeHint(false); showMenu(true); input.unlock();
}
function resumeGame() {
  if (game.net && game.inputBlocked) { game.inputBlocked = false; showMenu(false); resumeHint(false); lockKeys(); input.lock(); return; }
  if (game.state !== 'paused') return;
  game.state = 'playing'; showMenu(false); resumeHint(false);
  lockKeys(); input.lock();
}
input.onLockChange = (locked, error) => {
  if (error) {
    // kilit alinamadi (or. Esc ile devam: tarayici Esc'yi kullanici hareketi saymiyor) -> tikla / Enter ile devam
    if (game.state === 'playing') { if (game.net) game.inputBlocked = true; else game.state = 'paused'; showMenu(false); hud.show(true); resumeHint(true); }
    return;
  }
  if (locked) { resumeHint(false); if (game.inputBlocked && menu.classList.contains('hidden')) game.inputBlocked = false; if (game.state === 'paused' && menu.classList.contains('hidden')) game.state = 'playing'; return; }
  if (game.state === 'playing' && !game.inputBlocked) pauseGame();
};
// oyunda / devam ipucunda tiklayinca kilidi geri al
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked && !game.inputBlocked) input.lock();
  else if (midMatch() && menu.classList.contains('hidden')) resumeGame();
});
window.addEventListener('keydown', (e) => {
  if (!e.repeat && e.code === 'KeyH') hideKeyCard();
  if (!startScreen.classList.contains('hidden')) {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); startFromScreen(); }
    else if (e.code === 'Escape') { e.preventDefault(); showStart(false); showMenu(true); }
    return;
  }
  // P: Esc'ye ek duraklatma tusu (Esc portalda tam ekrandan da cikarir)
  if (!e.repeat && e.code === 'KeyP' && $('loading').classList.contains('hidden')) {
    const panelP = Object.keys(panels).find((k) => !panels[k].classList.contains('hidden'));
    if (game.state === 'playing' && !game.inputBlocked) { e.preventDefault(); pauseGame(); return; }
    if (midMatch() && !panelP) { e.preventDefault(); resumeGame(); return; }
  }
  if (e.repeat || (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
  if (game.state === 'loading' || game.state === 'matchEnd' || !$('loading').classList.contains('hidden')) return;
  const menuOpen = !menu.classList.contains('hidden');
  const panel = Object.keys(panels).find((k) => !panels[k].classList.contains('hidden'));
  if (e.code === 'Escape') {
    e.preventDefault();
    // kilit Esc ile birakildiysa ayni tus vurusu menuyu hemen kapatmasin
    if (performance.now() - lastPauseT < 350) return;
    if (menuOpen) {
      if (panel) { if (panel === 'settings') saveSettings(settings); showPanel(null); return; }
      if (midMatch()) resumeGame();
      return;
    }
    if (game.state === 'playing' && !game.inputBlocked) pauseGame();
    else if (midMatch()) resumeGame();
    return;
  }
  // Enter: ana menude OYNA / DEVAM ET, devam ipucunda devam
  if (menuOpen && !panel && document.activeElement && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'SELECT') { e.preventDefault(); btnPlay.click(); }
  else if (!menuOpen && midMatch()) { e.preventDefault(); resumeGame(); }
});
$('btnSettings').addEventListener('click', () => showPanel('settings'));
// maci birak: ana menuye don (arkada botlar oynamaya devam eder), tam ekrandan cik
$('btnLeave').addEventListener('click', () => {
  if (!midMatch()) return;
  if (game.net) { leaveNet(); return; }
  game.startMatch(false);
  resumeHint(false);
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* yok */ }
  showMenu(true);
});
$('btnQuit').addEventListener('click', () => { try { window.close(); } catch (e) { /* yok */ } setTimeout(() => { $('menuHint').textContent = t('closeHint'); }, 300); });
// sunucuya canlilik sinyali (oyun kapaninca sunucu kendini kapatir)
// yalniz yerel sunucuda (serve.mjs): canlilik sinyali ve hata gunlugu. GitHub Pages gibi statik sunucuda kapali.
const localServer = !portal.on && location.protocol === 'http:' && (location.hostname === '127.0.0.1' || location.hostname === 'localhost');
if (!localServer) $('btnQuit').classList.add('hidden');
if (localServer) setInterval(() => { fetch('/__ping', { cache: 'no-store' }).catch(() => {}); }, 5000);
$('btnControls').addEventListener('click', () => showPanel('controls'));
$('btnBack1').addEventListener('click', () => { saveSettings(settings); showPanel(null); });
$('btnBack2').addEventListener('click', () => showPanel(null));
async function rebuildArena(map = null) {
  buttons.classList.add('hidden');
  $('loading').classList.remove('hidden');
  hud.show(false);
  await game.newArena(progress, map);
  $('loading').classList.add('hidden');
  showMenu(true);
}
$('btnNewMap').addEventListener('click', () => rebuildArena());

// ayar paneli
function bindRange(id, key, fmt, apply) {
  const el = $(id), out = $(id + 'V');
  el.value = settings[key];
  const upd = () => { settings[key] = Number(el.value); if (out) out.textContent = fmt(settings[key]); if (apply) apply(settings[key]); saveSettings(settings); };
  el.addEventListener('input', upd);
  if (out) out.textContent = fmt(settings[key]);
}
bindRange('setSens', 'sensitivity', (v) => v.toFixed(2));
bindRange('setFov', 'fov', (v) => String(v), () => { game._fov = -1; });
bindRange('setVol', 'volume', (v) => Math.round(v * 100) + '%', (v) => audio.setVolume(v));
bindRange('setBots', 'bots', (v) => String(v), () => { settings.botsChosen = true; if (game.state !== 'loading') game.syncBots(); });
const selL = $('setLang'); selL.value = settings.lang;
selL.addEventListener('change', () => { settings.lang = selL.value; setLang(settings.lang); saveSettings(settings); });
const selQ = $('setQuality'); selQ.value = settings.quality;
selQ.addEventListener('change', () => { settings.qualityChosen = true; game.setQuality(selQ.value); saveSettings(settings); });
// oyuncu kaliteyi kendisi secmediyse: harici ekran kartinda daha yuksek kaliteyle basla
function autoQuality() {
  if (settings.qualityChosen || params.get('q') || testMode || params.has('bench')) return;
  let r = '';
  try { const gl = game.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { return; }
  let q = 'low';
  if (/RTX|Radeon RX ?[5-9]d{3}|Arc(TM) A[57]|Apple M[1-9] (Pro|Max|Ultra)/i.test(r)) q = 'high';
  else if (/GTX|Radeon RX|Radeon Pro|Arc(TM)|Apple Md/i.test(r)) q = 'medium';
  if (q !== settings.quality) { game.setQuality(q); selQ.value = q; }
}
const selD = $('setDiff'); selD.value = String(settings.difficulty);
selD.addEventListener('change', () => { settings.difficulty = Number(selD.value); settings.diffChosen = true; for (const b of game.bots) b.setSkill(settings.difficulty); saveSettings(settings); });
const chkI = $('setInvert'); chkI.checked = !!settings.invert; chkI.addEventListener('change', () => { settings.invert = chkI.checked; saveSettings(settings); });
const chkF = $('setFps'); chkF.checked = !!settings.showFps; chkF.addEventListener('change', () => { settings.showFps = chkF.checked; hud.showFps = chkF.checked; saveSettings(settings); });

// ---- cok oyunculu: ARKADASLA OYNA ----
/* global __NET__ */
const NET_ON = typeof __NET__ !== 'undefined' && __NET__ && !portal.on && location.protocol !== 'file:';
const SIGNAL = params.get('signal') || (localServer ? 'http://127.0.0.1:8787' : NET.signal);
const netsim = parseNetsim(location.search);
const roomParam = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
let netBusy = false;
function playerName() {
  if (!settings.name) { settings.name = 'Player ' + (1000 + ((Math.random() * 9000) | 0)); saveSettings(settings); }
  return settings.name;
}
function roomLink(code) {
  const base = location.origin + location.pathname + '?room=' + code;
  return params.get('signal') ? base + '&signal=' + encodeURIComponent(params.get('signal')) : base;
}
function renderRoom() {
  const net = game.net; if (!net) return;
  const code = net.role === 'host' ? net.room.code : net.room.code;
  $('roomCode').textContent = code;
  $('roomLink').value = roomLink(code);
  const rows = [];
  if (net.role === 'host') {
    rows.push('<div>' + esc(playerName()) + '<span class="pg">' + t('hostWord') + ' · ' + t('you2') + '</span></div>');
    for (const g of net.guests.values()) rows.push('<div>' + esc(g.name) + '<span class="pg">' + (g.link.open ? Math.round(g.link.rtt) + ' ms · ' + (g.link.connType === 'relay' ? t('conRelay') : t('conDirect')) : '...') + '</span></div>');
  } else {
    rows.push('<div>' + esc(net.hostName) + '<span class="pg">' + t('hostWord') + ' · ' + Math.round(net.link.rtt) + ' ms</span></div>');
    for (const e of net.roster.values()) if (e.human && e.id !== 0) rows.push('<div>' + esc(e.id === net.myId ? playerName() : e.name) + (e.id === net.myId ? '<span class="pg">' + t('you2') + '</span>' : '') + '</div>');
  }
  $('roomPlayers').innerHTML = rows.join('');
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
setInterval(() => { if (game.net && !menu.classList.contains('hidden')) renderRoom(); }, 1000);
$('btnCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('roomLink').value); $('btnCopy').textContent = t('copied'); setTimeout(() => { $('btnCopy').textContent = t('copy'); }, 1500); } catch (e) { $('roomLink').select(); }
});
function toast(msg, ms = 9000) { const el = $('roomToast'); el.textContent = msg; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), ms); }

// ev sahibi: oda ac, oyunu baslat
async function startFriends() {
  if (netBusy || game.net || !NET_ON) return;
  if (!SIGNAL) { $('menuHint').textContent = t('netNoServer'); return; }
  netBusy = true;
  try {
    $('menuHint').textContent = t('connecting');
    const room = await RoomClient.host({ base: SIGNAL, name: playerName(), netsim });
    const host = new HostSession(game, room, playerName());
    host.enable(); host.onChange = () => { if (!menu.classList.contains('hidden')) renderRoom(); };
    // yerel deneme (.bat): oda kodunu sunucuya birak, ikinci pencere linkle acilsin
    if (localServer) fetch('/__report?name=room', { method: 'POST', body: JSON.stringify({ code: room.code, link: roomLink(room.code) }) }).catch(() => {});
    setHint();
    await startPlay();
    toast(t('roomShare') + '  ' + roomLink(room.code), 12000);
  } catch (e) {
    console.error(e); setHint(); $('menuHint').textContent = t('netFail');
  } finally { netBusy = false; }
}
$('btnFriends').addEventListener('click', startFriends);

function leaveNet() {
  const net = game.net; if (!net) return;
  const guest = net.role === 'guest';
  net.close(); game.inputBlocked = false;
  if (guest) { location.href = location.pathname; return; }
  game.startMatch(false);
  resumeHint(false);
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* yok */ }
  $('roomToast').classList.add('hidden');
  showMenu(true);
}

// konuk: baglantiya KATIL
const joinScreen = $('joinScreen');
function joinMsg(msg, bar) { $('joinMsg').textContent = msg; if (bar !== undefined) $('joinBar').style.width = (bar * 100).toFixed(0) + '%'; }
function showJoin() {
  menu.classList.add('hidden'); showStart(false);
  joinScreen.classList.remove('hidden');
  $('joinCode').textContent = roomParam;
  joinMsg('');
  $('btnJoin').classList.remove('hidden');
}
async function joinRoom() {
  if (netBusy) return; netBusy = true;
  $('btnJoin').classList.add('hidden');
  joinMsg(t('connecting'), 0.02);
  audio.init(); audio.setVolume(settings.volume);
  let room = null, guest = null;
  const end = (reason) => {
    guest = null; game.inputBlocked = false;
    try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* yok */ }
    hud.show(false); showStart(false); joinScreen.classList.remove('hidden');
    joinMsg(reason === 'host-left' ? t('hostLeft') : t('netFail'), 0);
    $('btnJoin').classList.add('hidden'); $('btnSolo').textContent = t('mainMenu');
  };
  try {
    room = await RoomClient.join({
      base: SIGNAL, code: roomParam, name: playerName(), netsim,
      onLink: (link) => {
        guest = new GuestSession(game, room, link, {
          progress: (p, msg) => joinMsg(msg || t('joinWait'), 0.1 + p * 0.85),
          onReady: () => { joinMsg('', 1); joinScreen.classList.add('hidden'); showStart(true); },
          onEnd: end,
        });
        window.__enkaz.guest = guest;
      },
    });
    joinMsg(t('joinWait'), 0.08);
  } catch (e) {
    console.error(e);
    joinMsg(e.code === 'room-full' ? t('roomFull') : e.code === 'no-room' ? t('noRoom') : t('netFail'), 0);
    $('btnSolo').textContent = t('mainMenu');
  } finally { netBusy = false; }
}
$('btnJoin').addEventListener('click', joinRoom);
$('btnSolo').addEventListener('click', () => { location.href = location.pathname; });
async function startGuestPlay() {
  audio.init(); audio.setVolume(settings.volume);
  game.net.begin();
  showMenu(false); resumeHint(false); hud.show(true);
  if (!portal.on && settings.fullscreen !== false && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* olmadi */ }
  }
  lockKeys(); input.lock();
  showKeyCard();
}
window.__enkaz.netApi = { startFriends, joinRoom, roomCode: () => (game.net ? game.net.room.code : null), leaveNet };
const nameEl = $('setName'); nameEl.value = settings.name || '';
nameEl.addEventListener('change', () => { settings.name = nameEl.value.trim().slice(0, 16); saveSettings(settings); });

const loadBar = $('loadBar'), loadText = $('loadText');
function progress(p, msg) { loadBar.style.width = (p * 100).toFixed(0) + '%'; loadText.textContent = msg; }

// hata gunlugu: sunucuya (reports/game.log) yazilir; bir hata olsa da oyun dongusu durmaz
const canLog = localServer;
let logCount = 0;
function glog(kind, msg) {
  if (logCount++ > 60) return;
  const st = `[${kind}] state=${game.state} t=${(game.time || 0).toFixed(1)} bots=${game.bots.length} v=${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '-'}\n${msg}\nevents: ${(game.events || []).join(' | ')}`;
  if (canLog) fetch('/__log', { method: 'POST', body: st }).catch(() => {});
  else console.error(st);
}
window.__enkaz.glog = glog;
window.addEventListener('error', (e) => glog('error', (e.error && e.error.stack) || e.message));
window.addEventListener('unhandledrejection', (e) => glog('reject', (e.reason && e.reason.stack) || String(e.reason)));
let frameErrs = 0, lastErrMsg = '';
let last = performance.now();
function frame(now, manual = false, fixedDt = 0, doRender = true) {
  if (!manual) requestAnimationFrame(frame);
  const dt = manual ? fixedDt : Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
  last = now;
  try {
    if (input.pressed('F3')) { hud.showFps = !hud.showFps; settings.showFps = hud.showFps; chkF.checked = hud.showFps; }
    game.update(dt);
    if (doRender) game.render(dt);
    if (portal.on) portal.setPlaying(game.state === 'playing' && menu.classList.contains('hidden'));
  } catch (e) {
    if (manual) throw e;
    const m = (e && e.stack) || String(e);
    frameErrs++;
    if (m !== lastErrMsg || frameErrs % 600 === 1) { glog('frame', m + ' (x' + frameErrs + ')'); lastErrMsg = m; }
  }
  input.endFrame();
}
// ekran karti sifirlanirsa (GPU surucu resetlenmesi) sayfayi yeniden yukle
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  glog('contextlost', 'WebGL baglami kayboldu');
  $('menuHint').textContent = 'GPU reset...';
  setTimeout(() => location.reload(), 2500);
});
canvas.addEventListener('webglcontextrestored', () => { glog('contextrestored', ''); location.reload(); });
// oyun acikken 30 sn'de bir kisa durum satiri (donma olursa son durumu gormek icin)
if (canLog && !testMode) setInterval(() => {
  if (game.state !== 'playing') return;
  fetch('/__log', { method: 'POST', body: `[beat] t=${game.time.toFixed(0)} fps=${Math.round(game.lastFps || 0)} bots=${game.bots.length} alive=${game.bots.filter((b) => b.alive).length} quad=${game.player.quad.toFixed(1)} tris=${game.chunks.triangles} def=${game.chunks.deferred.size} bodies=${game.destruction.bodies.length} heap=${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : '-'}` }).catch(() => {});
}, 30000);

game.init(progress).then(() => {
  // ses baglami simdi (menude, kimse oynamiyorken) kurulsun; OYNA tiklamasi yalniz baslatir
  audio.prepare();
  gameLoaded = true;
  portalReady.then(() => portal.loadingStop());
  window.__enkaz.ready = true;
  checkGpu(); setHint(); autoQuality();
  if (NET_ON && params.has('autopilot')) game.autopilot = new Autopilot(game);
  $('loading').classList.add('hidden');
  if (NET_ON && roomParam) showJoin();
  else if (NET_ON && params.has('autohost')) { menu.classList.add('hidden'); startFriends(); }
  else if (directStart) { menu.classList.add('hidden'); showStart(true); } else showMenu(true);
  if (testMode) {
    window.__enkaz.step = (n = 1, dt = 1 / 60, renderLast = true) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) frame(performance.now(), true, dt, renderLast && i === n - 1);
      return performance.now() - t0;
    };
    window.__enkaz.capture = () => game.renderer.domElement.toDataURL('image/png');
    window.__enkaz.play = () => { game.startMatch(true); showMenu(false); };
    window.__enkaz.stats = () => ({ state: game.state, fps: game.lastFps, actors: game.actors.map((a) => [a.name, a.alive, a.frags, Math.round(a.health)]), debris: game.fx.debris.count, bodies: game.destruction.bodies.length, d: game.destruction.stats, tris: game.chunks.triangles });
  } else if (params.has('bench')) {
    runBench();
  } else requestAnimationFrame(frame);
}).catch((e) => { console.error(e); loadText.textContent = t('error') + e.message; });

// ---------------- performans olcumu (?bench) ----------------
// Kamera bir botun gozunden izler, zaman zaman buyuk patlamalar olur; sonuc sunucuya yazilir.
function runBench() {
  const dur = Number(params.get('bench')) || 30;
  const frames = [];
  const upd = [], ren = [];
  let t0 = 0, lastT = performance.now(), shots = 0, nextBoom = 3, skipNext = false;
  // soak: uzun sure, sik ve arenaya dagilmis patlamalar, 10 sn'lik ornekler (bozulma / bellek sizintisi var mi)
  const soak = params.has('soak');
  const samples = [];
  const spikes = [], gpuSpikes = [];
  let lastShotT = -99, lastHeap = null, lastHeapT = 0;
  let lastProgN = game.renderer.info.programs ? game.renderer.info.programs.length : -1;
  let winFrames = [], nextSample = 10;
  const shotTimes = soak ? [0.15, 0.35, 0.55, 0.75, 0.95].map((k) => k * dur) : [5, 10, 15, 20, 25];
  // &domino (oyuncak odasi en kotu durumu): kamera bastan odanin genel gorunusunde (olcum disi ilk 2 sn'de gecis)
  game.spectate = params.has('domino') ? null : game.bots[0] || null;
  game.benchMode = true;
  if (params.has('fp')) game.benchFirstPerson = true;
  hud.show(false); menu.classList.add('hidden');
  const gl = game.renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'bilinmiyor';
  const post = (path, body) => fetch(path, { method: 'POST', body }).catch(() => {});
  const tq = params.has('notq') ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpuMs = [];
  const pending = [];
  const forensicLog = [];
  // ---- goruntu adli incelemesi: ayni karede tek tek alt sistemleri kapatip saf beyaz/siyah piksel say ----
  let pixBuf = null;
  // tani modunda siniflar tam renk: yesil NaN(bit), sari Inf, camgobegi NaN(isnan), pembe sirasiz, mavi negatif, turuncu >65000, kirmizi >20, mor alfa
  function countPix() {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    if (!pixBuf || pixBuf.length !== w * h * 4) pixBuf = new Uint8Array(w * h * 4);
    game.renderer.setRenderTarget(null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixBuf);
    // siniflar (tani modunda): yesil NaN(bit), sari Inf, camgobegi NaN(isnan), beyaz sirasiz karsilastirma,
    // mavi negatif, mor >65000, kirmizi >20, siyah alfa bozuk. Normal modda white/black = saf beyaz/siyah.
    const C = { white: 0, black: 0, nan: 0, inf: 0, isnan: 0, unord: 0, neg: 0, big: 0, red: 0, alpha: 0 };
    let n = 0;
    const hi = (v) => v > 235, lo = (v) => v < 20;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * 4; n++;
      const r = pixBuf[i], g = pixBuf[i + 1], b = pixBuf[i + 2];
      if (r >= 250 && g >= 250 && b >= 250) C.white++;
      else if (r <= 2 && g <= 2 && b <= 2) C.black++;
      if (lo(r) && hi(g) && lo(b)) C.nan++;
      else if (hi(r) && hi(g) && lo(b)) C.inf++;
      else if (lo(r) && hi(g) && hi(b)) C.isnan++;
      else if (hi(r) && hi(g) && hi(b)) C.unord++;
      else if (lo(r) && lo(g) && hi(b)) C.neg++;
      else if (hi(r) && lo(g) && hi(b)) C.big++;
      else if (hi(r) && lo(g) && lo(b)) C.red++;
      else if (lo(r) && lo(g) && lo(b)) C.alpha++;
    }
    for (const k in C) C[k] = +(C[k] * 1000 / n).toFixed(1);
    return C;
  }
  function forensic(nm) {
    const fx = game.fx, P = game.post, scene = game.scene;
    const res = { name: nm, t: +((performance.now() - t0) / 1000).toFixed(1), v: {} };
    const measure = () => { game.render(0); return countPix(); };
    const snap = (suffix) => post('/__shot?name=fz_' + nm + '_' + suffix, game.renderer.domElement.toDataURL('image/jpeg', 0.85));
    const bad = (v) => v.nan + v.inf + v.isnan + v.unord + v.neg + v.big + v.alpha;
    res.v.base = measure(); snap('base');
    P.setDiag(true);
    const all = res.v.all = measure(); snap('all');
    const variant = (name, apply, undo) => {
      apply();
      const v = res.v[name] = measure();
      if (bad(all) > 3 && bad(v) < bad(all) * 0.4) snap(name);
      undo();
    };
    if (P.n8) variant('noao', () => { P.n8.enabled = false; }, () => { P.n8.enabled = true; });
    const si = game.sun.intensity;
    variant('nosun', () => { game.sun.intensity = 0; }, () => { game.sun.intensity = si; });
    const pls = [...fx.lights.slots.map((s) => s.light), ...game.staticLights.map((L) => L.light)];
    const pi = pls.map((l) => l.intensity);
    variant('nopoint', () => pls.forEach((l) => { l.intensity = 0; }), () => pls.forEach((l, i) => { l.intensity = pi[i]; }));
    const hemi = scene.children.find((o) => o.isHemisphereLight);
    if (hemi) { const hi = hemi.intensity; variant('nohemi', () => { hemi.intensity = 0; }, () => { hemi.intensity = hi; }); }
    const ei = scene.environmentIntensity;
    variant('noenv', () => { scene.environmentIntensity = 0; }, () => { scene.environmentIntensity = ei; });
    if (scene.fog) { const fd = scene.fog.density; variant('nofog', () => { scene.fog.density = 0; }, () => { scene.fog.density = fd; }); }
    const ud = voxelUniforms.uDetail.value;
    variant('nodetail', () => { voxelUniforms.uDetail.value = 0; }, () => { voxelUniforms.uDetail.value = ud; });
    const hideFx = [fx.add.mesh, fx.smoke.mesh, fx.beams.mesh, game.sky.mesh];
    const hv = hideFx.map((o) => o.visible);
    const basicM = new THREE_Basic({ color: 0x808080 });
    variant('ovr_basic', () => { scene.overrideMaterial = basicM; hideFx.forEach((o) => { o.visible = false; }); }, () => { scene.overrideMaterial = null; hideFx.forEach((o, i) => { o.visible = hv[i]; }); });
    const stdM = new THREE_Std({ color: 0x808080, roughness: 0.7, metalness: 0 });
    variant('ovr_std', () => { scene.overrideMaterial = stdM; hideFx.forEach((o) => { o.visible = false; }); }, () => { scene.overrideMaterial = null; hideFx.forEach((o, i) => { o.visible = hv[i]; }); });
    variant('nodebris', () => { fx.debris.mesh.visible = false; fx.glowDebris.mesh.visible = false; }, () => { fx.debris.mesh.visible = true; fx.glowDebris.mesh.visible = true; });
    if (nm.endsWith('_1') || nm.endsWith('_3')) {
      // golge kapali (shader yeniden derlenir, sadece adli incelemede)
      variant('noshadow', () => { game.sun.castShadow = false; }, () => { game.sun.castShadow = !params.has('noshadow'); });
    }
    P.setDiag(false);
    res.lights = fx.lights.slots.filter((s) => s.active).map((s) => [+s.light.intensity.toFixed(1), +s.light.distance.toFixed(1), +s.light.position.x.toFixed(1), +s.light.position.y.toFixed(1), +s.light.position.z.toFixed(1)]);
    res.cam = [+game.camera.position.x.toFixed(2), +game.camera.position.y.toFixed(2), +game.camera.position.z.toFixed(2)];
    res.counts = { debris: fx.debris.count, glow: fx.glowDebris.count, add: fx.add.count, smoke: fx.smoke.count, bodies: game.destruction.bodies.length };
    forensicLog.push(res);
    post('/__report?name=forensic_' + (params.get('tag') || 'x'), JSON.stringify(forensicLog, null, 1));
  }
  function loop(now) {
    const rawMs = now - lastT;
    const dt = Math.min(0.05, Math.max(0.0005, rawMs / 1000));
    lastT = now;
    if (!t0) t0 = now;
    const el = (now - t0) / 1000;
    // doomall: butun botlar surekli KIYAMET modunda (gercek dovus, tek vurus + dev roketler)
    if (params.has('doomall')) for (const b of game.bots) if (b.alive) b.quad = 15;
    const a = performance.now();
    game.update(dt);
    const b = performance.now();
    let q = null;
    if (tq && pending.length < 6) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    game.render(dt);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push(q); }
    while (pending.length) {
      const q0 = pending[0];
      if (!gl.getQueryParameter(q0, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(q0, gl.QUERY_RESULT);
      if (!disjoint && el > 2) {
        gpuMs.push(ns / 1e6);
        if (ns / 1e6 > 25) gpuSpikes.push({ t: +el.toFixed(2), gpu: +(ns / 1e6).toFixed(1), made: game.destruction.stats.bodies, coll: game.destruction.stats.collapses, tris: game.renderer.info.render.triangles, geo: game.renderer.info.memory.geometries });
      }
      gl.deleteQuery(q0); pending.shift();
    }
    const c = performance.now();
    if (el > 2 && !skipNext) { frames.push(dt * 1000); upd.push(b - a); ren.push(c - b); winFrames.push(dt * 1000); }
    // takilma kaydi: hangi karede ne oldu (shader derlemesi = program sayisi artar)
    const progN = game.renderer.info.programs ? game.renderer.info.programs.length : -1;
    if (el > 2 && (c - b > 25 || b - a > 15 || dt > 0.02 || progN !== lastProgN)) {
      spikes.push({ t: +el.toFixed(2), sinceShot: +(el - lastShotT).toFixed(2), skip: skipNext, upd: +(b - a).toFixed(1), ren: +(c - b).toFixed(1), raw: +rawMs.toFixed(1), prog: progN, prevProg: lastProgN,
        made: game.destruction.stats.bodies, coll: game.destruction.stats.collapses,
        heap: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, prevHeap: lastHeap,
        geo: game.renderer.info.memory.geometries, bodies: game.destruction.bodies.length, queued: game.destruction.settleQueue ? game.destruction.settleQueue.length : 0,
        tris: game.renderer.info.render.triangles });
      if (spikes.length > 60) spikes.shift();
    }
    lastProgN = progN;
    // bellek okumasi pahali olabilir: 250 ms'de bir
    if (performance.memory && now - lastHeapT > 250) { lastHeapT = now; lastHeap = +(performance.memory.usedJSHeapSize / 1048576).toFixed(1); }
    skipNext = false;
    if (el > nextSample) {
      nextSample += 10;
      const wf = winFrames.slice().sort((x, y) => x - y);
      const wavg = wf.reduce((s, x) => s + x, 0) / Math.max(1, wf.length);
      samples.push({
        t: Math.round(el), fps: +(1000 / wavg).toFixed(1), p99: wf.length ? +wf[Math.floor(wf.length * 0.99)].toFixed(2) : 0, max: wf.length ? +wf[wf.length - 1].toFixed(2) : 0,
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        tris: game.renderer.info.render.triangles, calls: game.renderer.info.render.calls, chunkTris: game.chunks.triangles,
        geo: game.renderer.info.memory.geometries, tex: game.renderer.info.memory.textures,
        debris: game.fx.debris.count, add: game.fx.add.count, smoke: game.fx.smoke.count, bodies: game.destruction.bodies.length,
        removed: game.destruction.stats.removed, collapses: game.destruction.stats.collapses, state: game.state,
      });
      winFrames = [];
    }
    if (el > nextBoom && !params.has('calm')) {
      nextBoom += soak ? 1.2 : params.has('doom') ? 1.0 : 2.5;
      // soak: arenada rastgele bir noktaya (yukaridan asagi isin) buyuk patlama
      if (soak && Math.random() < 0.6) {
        const W = game.world, h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
        const x = 4 + Math.random() * 64, z = 4 + Math.random() * 64, y0 = 23.5;
        if (W.raycast(x, y0, z, 0, -1, 0, 30, h)) {
          const hy = y0 - h.dist;
          if (hy > 1.8) { game.destruction.blast(x, hy, z, 2.6 + Math.random() * 1.2, 520, null, 12, 320); game.fx.explosion(x, hy + 0.2, z, 3.2, 0xff7a1a, 1.1, 0, 1, 0); }
        }
      }
      // izlenen botun baktigi yere buyuk patlama
      const s = game.spectate || game.bots[0];
      if (s && s.alive) {
        const e = s.eye(new game.camera.position.constructor()), d = s.aimDir(new game.camera.position.constructor());
        const h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
        if (game.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, 40, h)) {
          const x = e.x + d.x * h.dist, y = e.y + d.y * h.dist, z = e.z + d.z * h.dist;
          if (params.has('doom')) {
            // KIYAMET roketi: gercek patlama yolu (5 kat yaricap)
            const W = game.WEAPONS.find((w) => w.id === 'rocket');
            game.projectiles.explode({ W, owner: s, quad: 3, vel: d }, x - d.x * 0.1, y - d.y * 0.1, z - d.z * 0.1, -d.x, -d.y, -d.z, null);
          } else {
            game.destruction.blast(x, y, z, 3.2, 520, null, 12, 320);
            game.fx.explosion(x, y, z, 3.4, 0xff7a1a, 1.2);
          }
        }
      }
    }
    // ay ussu en kotu durum (&breach): 4 sn'de bir izlenen bota en yakin kapali kubbenin camini, bota bakan
    // yuzunden del (hava kacagi kameranin onunde: akis alani, cam paneli patlamasi, buhar jeti, emme)
    if (params.has('breach') && game.moonSys.active && el > (runBench.nextBreach ??= 3)) {
      runBench.nextBreach += 4;
      const s = game.spectate || game.bots[0], ms = game.moonSys;
      if (s) {
        const p = s.mover.pos;
        let best = null, bd = 1e9;
        for (const v of ms.vols) if (v.state === 'sealed' && v.kind === 'dome') { const d = Math.hypot(v.c[0] - p.x, v.c[2] - p.z); if (d < bd) { bd = d; best = v; } }
        if (best) {
          const dx = p.x - best.c[0], dz = p.z - best.c[2], l = Math.hypot(dx, dz) || 1;
          const h = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
          if (game.world.raycast(best.c[0], best.c[1] + 1.2, best.c[2], dx / l, 0.12, dz / l, 30, h)) {
            game.destruction.blast((h.x + 0.5) * 0.25, (h.y + 0.5) * 0.25, (h.z + 0.5) * 0.25, 0.85, 165, s, 4, 40);
            game.fx.plasmaHit((h.x + 0.5) * 0.25, (h.y + 0.5) * 0.25, (h.z + 0.5) * 0.25, 0, 0, 0);
          }
        }
      }
    }
    // oyuncak odasi en kotu durum (&domino): 7 sn'de bir zincir ve kule aninda yeniden kurulur (2200 voxel yazilir),
    // ilk domino devrilir: 22 domino kosar, kule menteseyle devrilir, yere carpar. Kamera odanin genel gorunusunde
    if (params.has('domino') && game.toySys.active && el > (runBench.nextDomino ??= 2)) {
      runBench.nextDomino += 7;
      game.toySys.matchReset();
      game.toySys.trigger(game.bots[0] || null);
    }
    if (shots < 5 && el > shotTimes[shots] && !params.has('noshots')) {
      shots++;
      lastShotT = el;
      skipNext = true; // ekran goruntusu kodlamasi olcumu bozmasin
      const nm = (params.get('tag') || settings.quality) + '_' + shots;
      if (params.has('forensic')) forensic(nm);
      else post('/__shot?name=shot_' + nm, game.renderer.domElement.toDataURL('image/jpeg', 0.85));
    }
    if (el < dur) { requestAnimationFrame(loop); return; }
    const sorted = [...frames].sort((x, y) => x - y);
    const avg = frames.reduce((s, x) => s + x, 0) / frames.length;
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
    const report = {
      gpu, quality: settings.quality, w: game.renderer.domElement.width, h: game.renderer.domElement.height, dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight], screen: [screen.width, screen.height], renderScale: game.renderScale, ua: navigator.userAgent,
      frames: frames.length, avgFps: 1000 / avg, avgMs: avg, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted[sorted.length - 1],
      over20: frames.filter((x) => x > 20).length, over33: frames.filter((x) => x > 33).length,
      updMs: mean(upd), renMs: mean(ren), updMax: Math.max(...upd), renMax: Math.max(...ren),
      gpuMs: gpuMs.length ? mean(gpuMs) : null, gpuMax: gpuMs.length ? Math.max(...gpuMs) : null, gpuN: gpuMs.length, prof: game.prof,
      tris: game.renderer.info.render.triangles, calls: game.renderer.info.render.calls,
      chunkTris: game.chunks.triangles, debris: game.fx.debris.count, d: game.destruction.stats,
      moon: game.moonSys.active ? game.moonSys.stats : undefined,
      toy: game.toySys.active ? game.toySys.stats : undefined,
      frags: game.actors.map((x) => x.name + ':' + x.frags),
      samples, spikes, gpuSpikes,
      programs: game.renderer.info.programs ? game.renderer.info.programs.map((p) => p.name || p.cacheKey.slice(0, 60)) : null,
    };
    post('/__report?name=bench_' + (params.get('tag') || settings.quality), JSON.stringify(report, null, 1)).then(() => { document.title = 'BENCH DONE'; });
  }
  requestAnimationFrame(loop);
}
