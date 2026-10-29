// Iki dil (English / Turkce). t('anahtar', ...degerler) -> metin; {0},{1} yer tutucu.
// HTML'de data-i18n="anahtar" olan ogelerin metni applyDom() ile guncellenir.
const D = {
  // menu
  tagline: ['Break · Blast · Bury', 'Break · Blast · Bury'],
  play: ['PLAY', 'OYNA'], resume: ['RESUME', 'DEVAM ET'], settings: ['SETTINGS', 'AYARLAR'], controls: ['CONTROLS', 'KONTROLLER'],
  newArena: ['NEW ARENA', 'YENİ ARENA'],
  map: ['MAP', 'HARİTA'], mapArena: ['ARENA', 'ARENA'], mapMeadow: ['MEADOW', 'ÇAYIR'], mapVolcano: ['VOLCANO', 'VOLKAN'], mapFrozen: ['FROZEN LAKE', 'BUZ GÖLÜ'], mapMoon: ['MOON BASE', 'AY ÜSSÜ'], mapToyroom: ['TOY ROOM', 'OYUNCAK ODASI'], mapRotate: ['ROTATE', 'SIRAYLA'], leave: ['LEAVE MATCH', 'MAÇTAN ÇIK'], quit: ['QUIT', 'ÇIKIŞ'], back: ['BACK', 'GERİ'],
  menuHint: ['Left click fire · Esc / P menu · F3 FPS', 'Sol tık ateş · Esc / P menü · F3 FPS'],
  kcTitle: ['CONTROLS', 'KONTROLLER'], kcMove: ['move', 'hareket'], kcAim: ['aim', 'nişan'], kcFire: ['fire', 'ateş'],
  kcJump: ['jump', 'zıpla'], kcDash: ['dash', 'atıl'], kcCrouch: ['crouch', 'eğil'], kcWeapons: ['weapons', 'silahlar'], kcPause: ['pause', 'duraklat'],
  kcGoal: ['First to 25 frags wins · walls break · blast cover away', '25 parçalamaya ulaşan kazanır · duvarlar yıkılır · siperi patlat'],
  kcHide: ['H: hide', 'H: gizle'],
  build: ['build', 'derleme'],
  igpuWarn: ['Running on integrated graphics (lower FPS). If the picture freezes every few seconds, <b>update your graphics driver</b>: older Intel drivers have this bug. If this computer has a dedicated GPU, set your browser to <b>High performance</b> (Windows: Settings → System → Display → Graphics), then close and reopen the browser.',
    'Dahili ekran kartında çalışıyor (FPS düşük olur). Görüntü birkaç saniyede bir donuyorsa <b>ekran kartı sürücünü güncelle</b>: eski Intel sürücülerinde bu hata var. Bilgisayarında harici ekran kartı varsa tarayıcıyı <b>Yüksek performans</b>a al (Windows: Ayarlar → Sistem → Ekran → Grafik), sonra tarayıcıyı kapatıp yeniden aç.'],
  lockFail: ['Could not lock the mouse, click again.', 'Fare kilitlenemedi, tekrar tıkla.'],
  closeHint: ['Press Alt+F4 to close the window.', 'Pencereyi kapatmak için Alt+F4.'],
  // ayarlar
  sLang: ['Language', 'Dil'], sSens: ['Mouse sensitivity', 'Fare hassasiyeti'], sFov: ['Field of view (FOV)', 'Görüş alanı (FOV)'],
  sQuality: ['Graphics quality', 'Grafik kalitesi'], qUltra: ['Ultra', 'Ultra'], qHigh: ['High', 'Yüksek'], qMedium: ['Medium', 'Orta'], qLow: ['Low', 'Düşük'],
  sBots: ['Bot count', 'Bot sayısı'], sDiff: ['Bot difficulty', 'Bot zorluğu'],
  d0: ['Rookie', 'Acemi'], d1: ['Novice', 'Çaylak'], d2: ['Normal', 'Normal'], d3: ['Hard', 'Zor'], d4: ['Very Hard', 'Çok Zor'], d5: ['Master', 'Usta'], d6: ['Nightmare', 'Kâbus'],
  sVol: ['Volume', 'Ses'], sInvert: ['Invert mouse', 'Fareyi ters çevir'], sFps: ['Show FPS', 'FPS göster'],
  // kontroller
  kMove: ['move', 'hareket'], kSpace: ['Space', 'Boşluk'], kJump: ['jump (hold: bunny hop)', 'zıpla (basılı tut: tavşan zıplaması)'],
  kDash: ['dash', 'atılma (dash)'], kCrouch: ['crouch · slide while running · dive in water', 'eğil · koşarken kayma · suda dal'],
  kWater: ['Water:', 'Su:'], kWaterText: ['creek slows you · in the lake hold Space to stay at the surface, C to dive · you cannot fire with your head underwater and you drown if you stay under too long',
    'dere yavaşlatır · gölde yüzeyde kalmak için Boşluk, dalmak için C · başın su altındayken ateş edemezsin, çok uzun kalırsan boğulursun'],
  kLava: ['Lava:', 'Lav:'], kLavaText: ['kills instantly. Fall in on your own and it counts as a self frag (−1); blast an enemy into it and the frag is yours',
    'dokunan anında ölür. Kendin düşersen kendini parçalamış sayılırsın (−1); rakibi lava itersen parçalama senin'],
  kIce: ['Ice:', 'Buz:'], kIceText: ['the lake ice is thin and slippery, and the water under it is freezing (it drains your health). Break the ice under an enemy and the frag is yours · trapped under the ice? hold Space to break through · shoot icicles to drop them on whoever is below · snowmen hide items',
    'göl buzu ince ve kaygan, altındaki su buz gibi (canını yer). Rakibin altındaki buzu kırarsan parçalama senin · buzun altında kaldıysan Boşluk\'u basılı tut, buzu kır · sarkıtları vur, altındakinin başına düşsün · kardan adamlar eşya saklar'],
  kMoon: ['Moon:', 'Ay:'], kMoonText: ['low gravity: jumps go twice as high, rocket jumps three times as high · shoot through a glass dome and its air rushes out: everyone inside is sucked to the hole and blown out into space (the frag is yours) · the hole is foam-patched after ~25 s',
    'düşük yerçekimi: zıplamalar iki kat, roket zıplamaları üç kat yükseğe · cam kubbeyi delersen havası kaçar: içeridekiler deliğe emilip uzaya fırlatılır (parçalama senin) · delik ~25 sn sonra köpükle kapanır'],
  kToy: ['Toy room:', 'Oyuncak odası:'], kToyText: ['you are a tiny robot in a giant kid\'s room · the bed, pillows and rubber ball are trampolines (hold Space as you land to bounce higher) · shoot the first domino by the castle: the chain runs to the block tower and knocks it down on whoever is near (every frag is yours) · the dominoes stand up again after ~45 s · climb the bookshelf, cross the ruler and the Doomsday orb waits on the wardrobe',
    'dev bir çocuk odasında minik bir robotsun · yatak, yastıklar ve lastik top trambolindir (inerken Boşluk\'a basılı tut, daha yükseğe sek) · kalenin yanındaki ilk dominoyu vur: zincir blok kuleye kadar koşar ve kuleyi yakındakilerin üstüne devirir (bütün parçalamalar senin) · dominolar ~45 sn sonra yeniden dizilir · kitaplığa tırman, cetvelden geç: KIYAMET küresi gardırobun tepesinde'],
  kLmb: ['Left click', 'Sol tık'], kFire: ['fire', 'ateş'], kRmb: ['Right click', 'Sağ tık'], kZoom: ['aim / zoom', 'nişan / yakınlaştırma'],
  kWheel: ['1-5 / wheel', '1-5 / tekerlek'], kWeapon: ['weapon', 'silah'], kPrev: ['previous weapon', 'önceki silah'],
  kTab: ['scoreboard', 'skor tablosu'], kEsc: ['menu (or P)', 'menü (ya da P)'], kF3: ['FPS meter', 'FPS göstergesi'],
  kRj: ['Rocket jump:', 'Roketle zıpla:'], kRjText: ['fire a rocket at your feet + jump', 'ayağının dibine roket at + zıpla'],
  // yukleme
  ldArena: ['Building arena...', 'Arena kuruluyor...'], ldMesh: ['Voxel mesh: {0}/{1}', 'Voxel mesh: {0}/{1}'],
  ldNav: ['Mapping paths...', 'Yol haritası çıkarılıyor...'], ldShaders: ['Compiling shaders...', 'Gölgelendiriciler derleniyor...'],
  ldReady: ['Ready', 'Hazır'], error: ['ERROR: ', 'HATA: '],
  // HUD
  you: ['YOU', 'SEN'], resumeHint: ['Click or press Enter to resume', 'Devam etmek için tıkla ya da Enter'],
  hp: ['HEALTH', 'CAN'], armor: ['ARMOR', 'ZIRH'], frags: ['FRAGS', 'PARÇALAMA'], scoreboard: ['SCOREBOARD', 'SKOR TABLOSU'],
  sbPlayer: ['PLAYER', 'OYUNCU'], sbFrags: ['FRAGS', 'PARÇALAMA'], sbDeaths: ['DEATHS', 'ÖLÜM'],
  quadHud: ['DOOMSDAY {0}', 'KIYAMET MODU {0}'],
  respawnIn: ['respawn: {0}', 'yeniden doğuş: {0}'], respawnClick: ['click / space to respawn', 'doğmak için tıkla / boşluk'],
  youDied: ['FRAGGED', 'PARÇALANDIN'], selfKill: ['YOU FRAGGED YOURSELF', 'KENDİNİ PARÇALADIN'], selfFeed: ['fragged themself', 'kendini parçaladı'],
  fps: ['{0} FPS  ·  worst {1} ms  ·  {2}k tris  ·  {3} draws  ·  {4}\ndebris {5}  ·  particles {6}  ·  falling {7}  ·  scale {8}%',
    '{0} FPS  ·  en kötü {1} ms  ·  {2}k üçgen  ·  {3} çizim  ·  {4}\nenkaz {5}  ·  parçacık {6}  ·  düşen {7}  ·  ölçek {8}%'],
  // silahlar
  'w.pulse': ['Pulse Rifle', 'Darbe Tüfeği'], 'w.shotgun': ['Shotgun', 'Saçmalı'], 'w.plasma': ['Plasma Gun', 'Plazma'], 'w.rocket': ['Rocket Launcher', 'Roketatar'], 'w.rail': ['Railgun', 'Raylı Tüfek'],
  'k.drown': ['DROWNED', 'BOĞULDU'], 'k.lava': ['LAVA', 'LAV'], 'k.cold': ['ICE', 'BUZ'], 'k.icicle': ['ICICLE', 'SARKIT'], 'k.spaced': ['SPACED', 'UZAY'], 'k.domino': ['DOMINO', 'DOMİNO'],
  'k.pulse': ['PULSE', 'DARBE'], 'k.shotgun': ['SHOTGUN', 'SAÇMA'], 'k.plasma': ['PLASMA', 'PLAZMA'], 'k.rocket': ['ROCKET', 'ROKET'], 'k.rail': ['RAIL', 'RAY'], 'k.crush': ['RUBBLE', 'ENKAZ'], 'k.world': ['WORLD', 'DÜNYA'],
  // esyalar
  'i.health': ['+25 HEALTH', '+25 CAN'], 'i.mega': ['MEGA HEALTH', 'MEGA CAN'], 'i.armor': ['+50 ARMOR', '+50 ZIRH'], 'i.ammo': ['AMMO', 'CEPHANE'], 'i.quad': ['DOOMSDAY MODE', 'KIYAMET MODU'],
  quadSpawn: ['DOOMSDAY ORB IS HERE', 'KIYAMET KÜRESİ GELDİ'], quadWhere: ['on the roof of the central tower', 'merkez kulenin çatısında'],
  quadYou: ['DOOMSDAY MODE IS YOURS!', 'KIYAMET MODU SENDE!'], quadOther: ['{0} HAS DOOMSDAY MODE', '{0} KIYAMET MODUNDA'],
  quadYouSub: ['every hit kills · 5x rocket blast · 15 s', 'her isabet öldürür · 5 kat roket patlaması · 15 sn'], careful: ['watch out!', 'dikkat!'],
  // olum / oldurme
  crushedFeed: ['got buried in rubble', 'enkaz altında kaldı'], blewUp: ['blew themself up', 'kendini havaya uçurdu'],
  drownedFeed: ['drowned', 'boğuldu'], youDrowned: ['YOU DROWNED', 'BOĞULDUN'], selfFragNote: ['self frag · −1', 'kendini parçaladın · −1'],
  air: ['AIR', 'HAVA'], drowning: ['DROWNING!', 'BOĞULUYORSUN!'], noFireWater: ["can't fire underwater", 'su altında ateş edilemez'],
  quadWhereMeadow: ['in the lookout at the top of the great oak', 'büyük meşenin tepesindeki gözetleme yerinde'],
  quadWhereVolcano: ['on the lookout ring at the top of the obsidian spire', 'obsidyen kulenin tepesindeki gözetleme halkasında'],
  lavaFeed: ['fell into the lava', 'lava düştü'], youBurned: ['BURNED IN LAVA', 'LAVDA YANDIN'], lavaKill: ['INTO THE LAVA!', 'LAVA DÜŞÜRDÜN!'],
  quadWhereFrozen: ['at the top of the ice castle tower', 'buz kalesinin kulesinin tepesinde'],
  quadWhereMoon: ['in the comms tower dish', 'iletişim kulesinin çanağında'],
  hullBreach: ['HULL BREACH!', 'HAVA KAÇAĞI!'],
  ventWarn: ['AIR LEAK · get away from the hole', 'HAVA KAÇIYOR · delikten uzaklaş'],
  spacedFeed: ['was blown into space', 'uzaya savruldu'], youSpaced: ['BLOWN INTO SPACE', 'UZAYA SAVRULDUN'], spacedKill: ['SPACED!', 'UZAYA FIRLATTIN!'],
  quadWhereToyroom: ['on top of the wardrobe', 'gardırobun tepesinde'],
  dominoFeed: ['was flattened by dominoes', 'dominoların altında kaldı'], youDomino: ['FLATTENED BY DOMINOES', 'DOMİNOLARIN ALTINDA KALDIN'], dominoKill: ['DOMINO!', 'DOMİNO!'],
  dominoRun: ['DOMINOES! · get away from the block tower', 'DOMİNOLAR DEVRİLİYOR! · blok kuleden uzaklaş'],
  coldFeed: ['froze to death', 'donarak öldü'], icicleFeed: ['was skewered by an icicle', 'sarkıt altında kaldı'],
  youFroze: ['YOU FROZE', 'DONDUN'], youIcicle: ['SKEWERED BY AN ICICLE', 'SARKIT SAPLANDI'],
  iceKill: ['THROUGH THE ICE!', 'BUZA GÖMDÜN!'], icicleKill: ['ICICLE DROP!', 'SARKITLA VURDUN!'],
  freezing: ['ice-cold water! get out fast', 'buz gibi su! hemen çık'],
  underIce: ['UNDER THE ICE · hold SPACE to break through', 'BUZUN ALTINDASIN · kırmak için BOŞLUK\'u basılı tut'],
  cacheFound: ['something was hidden inside the snowman!', 'kardan adamın içinden bir şey çıktı!'],
  multi2: ['DOUBLE FRAG!', 'ÇİFTE PARÇALAMA!'], multi3: ['TRIPLE DESTRUCTION!', 'ÜÇLÜ YIKIM!'], multi4: ['MASSACRE!', 'KATLİAM!'], multi5: ['DOOMSDAY!', 'KIYAMET!'],
  buried: ['BURIED IN RUBBLE!', 'ENKAZ ALTINDA KALDI!'], headshot: ['HEADSHOT!', 'KAFADAN!'], fragged: ['FRAGGED', 'PARÇALADIN'],
  streak5: ['UNSTOPPABLE!', 'DURDURULAMAZ!'], streak10: ['DEMOLITION MACHINE!', 'YIKIM MAKİNESİ!'], streak15: ['LEGENDARY!', 'EFSANE!'],
  fragCount: ['{0} frags', '{0} parçalama'],
  campWarn: ['you stayed too long in one spot: your position will be revealed soon', 'aynı yerde fazla kaldın: yakında konumun açığa çıkacak'],
  campReveal: ['YOUR POSITION IS REVEALED!', 'KONUMUN AÇIĞA ÇIKTI!'],
  youWin: ['YOU WON THE MATCH!', 'MAÇI KAZANDIN!'], winner: ['{0} WINS', '{0} KAZANDI'], newArenaSoon: ['building a new arena...', 'yeni arena hazırlanıyor...'],
};

const LANGS = ['en', 'tr'];
let lang = 'en';
const listeners = [];

export function setLang(l) {
  lang = LANGS.includes(l) ? l : 'en';
  document.documentElement.lang = lang;
  applyDom();
  for (const f of listeners) f(lang);
}
export function getLang() { return lang; }
export function onLangChange(f) { listeners.push(f); }

export function t(key, ...args) {
  const e = D[key];
  let s = e ? e[lang === 'tr' ? 1 : 0] : key;
  for (let i = 0; i < args.length; i++) s = s.split('{' + i + '}').join(String(args[i]));
  return s;
}

export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}
