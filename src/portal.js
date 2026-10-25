// Portal entegrasyonu (CrazyGames). Normal (GitHub Pages / yerel) derlemede __PORTAL__ bos: her sey etkisiz.
// Oyun hicbir zaman SDK'yi beklemez; SDK yuklenemezse (reklam engelleyici, ag) oyun aynen calisir.
/* global __PORTAL__ */
const ON = typeof __PORTAL__ !== 'undefined' && __PORTAL__ === 'crazygames';

let sdk = null;
let playing = false;
let loading = false;
let muted = false;
const muteListeners = [];

function call(name) {
  if (!sdk) return;
  try { sdk.game[name](); } catch (e) { /* SDK hatasi oyunu durdurmasin */ }
}

export const portal = {
  on: ON,
  // SDK'yi baslat; donen soz (promise) hicbir zaman reddedilmez
  async init() {
    if (!ON) return;
    try {
      const S = window.CrazyGames && window.CrazyGames.SDK;
      if (!S) return;
      await S.init();
      if (S.environment === 'disabled') return;
      sdk = S;
      try {
        muted = !!(S.game.settings && S.game.settings.muteAudio);
        S.game.addSettingsChangeListener((s) => {
          muted = !!(s && s.muteAudio);
          for (const f of muteListeners) f(muted);
        });
      } catch (e) { /* yok */ }
    } catch (e) { sdk = null; }
  },
  get ready() { return !!sdk; },
  get muted() { return muted; },
  onMuteChange(f) { muteListeners.push(f); },
  // CrazyGames kullanicisinin dili (or. 'tr-TR'); bilinmiyorsa ''
  locale() {
    try { return (sdk && sdk.user && sdk.user.systemInfo && sdk.user.systemInfo.locale) || ''; } catch (e) { return ''; }
  },
  loadingStart() { if (sdk && !loading) { loading = true; call('loadingStart'); } },
  loadingStop() { if (sdk && loading) { loading = false; call('loadingStop'); } },
  // oyuncu fiilen oynarken true (menu, duraklatma, mac sonu: false). Her karede cagrilabilir.
  setPlaying(v) {
    v = !!v;
    if (!sdk || v === playing) return;
    playing = v;
    call(v ? 'gameplayStart' : 'gameplayStop');
  },
};
