// Tus atamalari: her eylemin iki yuvasi var (birincil / ikincil). Kodlar fiziksel tus kodu (event.code) ya da
// fare dugmesi ('Mouse0' sol, 'Mouse1' orta, 'Mouse2' sag, 'Mouse3' / 'Mouse4' yan dugmeler).
// Kayit tarayicinin localStorage'inda ('fragrush.keys'): yerel kopyada da GitHub Pages'te de calisir.
// Yasak tuslar: Ctrl (Chrome'da Ctrl+W sekmeyi kapatir, sayfa bunu engelleyemez; Ctrl+T/N/Q de oyle),
// Win/Cmd, Esc (menu), F1-F24 (F3 FPS, F5 yenile, F11 tam ekran, F12 gelistirici), ContextMenu, PrintScreen.
import { t } from '../i18n.js';

export const ACTIONS = [
  { id: 'forward', def: ['KeyW', 'ArrowUp'] },
  { id: 'back', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', def: ['KeyD', 'ArrowRight'] },
  { id: 'jump', def: ['Space', null] },
  { id: 'crouch', def: ['KeyC', null] },
  { id: 'dash', def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'fire', def: ['Mouse0', null] },
  { id: 'zoom', def: ['Mouse2', null] },
  { id: 'prevWeapon', def: ['KeyQ', null] },
  { id: 'w1', def: ['Digit1', 'Numpad1'] },
  { id: 'w2', def: ['Digit2', 'Numpad2'] },
  { id: 'w3', def: ['Digit3', 'Numpad3'] },
  { id: 'w4', def: ['Digit4', 'Numpad4'] },
  { id: 'w5', def: ['Digit5', 'Numpad5'] },
  { id: 'scoreboard', def: ['Tab', null] },
  { id: 'pause', def: ['KeyP', null] },
];
const IDS = new Set(ACTIONS.map((a) => a.id));
const STORE = 'fragrush.keys';

export function isForbidden(code) {
  if (!code || typeof code !== 'string') return true;
  return /^(Control|Meta|OS)/.test(code) || code === 'Escape' || /^F\d+$/.test(code) || code === 'Fn' || code === 'FnLock' ||
    code === 'ContextMenu' || code === 'PrintScreen' || code === 'Unidentified' || /^Browser|^Launch|^Audio|^Media/.test(code);
}
export function isMouse(code) { return typeof code === 'string' && /^Mouse[0-4]$/.test(code); }

// klavye duzenine gore tus adi (Chrome: navigator.keyboard.getLayoutMap; yoksa fiziksel kod adi)
let layout = null;
const layoutListeners = [];
try {
  if (typeof navigator !== 'undefined' && navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then((m) => { layout = m; for (const f of layoutListeners) f(); }).catch(() => {});
  }
} catch (e) { /* yok */ }

const NAMES = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  ShiftLeft: 'Shift', ShiftRight: 'R-Shift', AltLeft: 'Alt', AltRight: 'AltGr', Tab: 'Tab', CapsLock: 'Caps',
  Enter: 'Enter', NumpadEnter: 'Num Enter', Backspace: 'Backspace', Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End',
  PageUp: 'PgUp', PageDown: 'PgDn', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (code === 'Space') return t('kSpace');
  if (code === 'Mouse0') return t('kLmb');
  if (code === 'Mouse1') return t('kMmb');
  if (code === 'Mouse2') return t('kRmb');
  if (code === 'Mouse3' || code === 'Mouse4') return t('kMouseN', Number(code.slice(5)) + 1);
  if (NAMES[code]) return NAMES[code];
  if (/^Numpad\d$/.test(code)) return 'Num ' + code.slice(6);
  if (layout && layout.get(code)) return layout.get(code).toLocaleUpperCase();
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code;
}

export class Keybinds {
  constructor() {
    this.map = {};
    this.listeners = [];
    this.load();
    layoutListeners.push(() => this._emit());
  }
  defaults() { const m = {}; for (const a of ACTIONS) m[a.id] = a.def.slice(); return m; }
  load() {
    this.map = this.defaults();
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || !s.map) return;
    const used = new Set();
    for (const a of ACTIONS) {
      const v = s.map[a.id];
      if (!Array.isArray(v)) continue;
      this.map[a.id] = [0, 1].map((i) => {
        const c = v[i];
        if (c === null || c === undefined || isForbidden(c) || used.has(c)) return null;
        used.add(c); return c;
      });
    }
    // kayitta olmayan (sonradan eklenen) eylemler varsayilanla gelir, ama zaten kullanilan tusu almaz
    for (const a of ACTIONS) if (!Array.isArray(s.map[a.id])) this.map[a.id] = a.def.map((c) => (c && !used.has(c) ? (used.add(c), c) : null));
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify({ v: 1, map: this.map })); } catch (e) { /* yok */ } }
  codes(id) { return this.map[id] || []; }
  has(id, code) { const c = this.map[id]; return !!c && (c[0] === code || c[1] === code); }
  // bu tus herhangi bir eyleme atanmis mi
  actionOf(code) { for (const a of ACTIONS) if (this.has(a.id, code)) return a.id; return null; }
  // ilk atanmis tusun adi (metinlerdeki {K:eylem} yer tutuculari icin)
  label(id) { const c = this.codes(id); return keyLabel(c[0] || c[1] || null); }
  // atama: { ok, taken: onceki eylem } ya da { error: 'forbidden' }. Ayni tus baska eylemdeyse oradan alinir.
  set(id, slot, code) {
    if (!IDS.has(id) || (slot !== 0 && slot !== 1)) return { error: 'bad' };
    if (code !== null && isForbidden(code)) return { error: 'forbidden' };
    let taken = null;
    if (code !== null) {
      for (const a of ACTIONS) {
        const c = this.map[a.id];
        for (let i = 0; i < 2; i++) if (c[i] === code && !(a.id === id && i === slot)) { c[i] = null; if (a.id !== id) taken = a.id; }
      }
    }
    this.map[id][slot] = code;
    this.save(); this._emit();
    return { ok: true, taken };
  }
  reset() { this.map = this.defaults(); try { localStorage.removeItem(STORE); } catch (e) { /* yok */ } this._emit(); }
  isDefault() { const d = this.defaults(); return ACTIONS.every((a) => d[a.id][0] === this.map[a.id][0] && d[a.id][1] === this.map[a.id][1]); }
  onChange(f) { this.listeners.push(f); }
  _emit() { for (const f of this.listeners) f(); }
}
