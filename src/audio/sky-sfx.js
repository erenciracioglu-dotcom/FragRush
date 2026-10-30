// Gok adalari sesleri: sfx.js'teki Audio sinifina eklenir (paylasilan dosyaya dokunmadan; fx/sky-islands.js yukler).
// Hepsi WebAudio ile anlik sentez: kristal catlamasi / parcalanmasi, ada gurlemesi, buluta gomulme (vuuus), yukselis,
// surekli kristal ugultusu (cani azaldikca tizlesir) ve sellale.
import { Audio } from './sfx.js';

Object.assign(Audio.prototype, {
  s_crystalCrack(x, y, z, v, local) {
    this._voice(0.9, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.5 * v, 1.2);
      this._noise('highpass', 4500, 2500, 0.9, 0.08, 1.0, o, t);
      for (let i = 0; i < 4; i++) { const f = 2200 + Math.random() * 1800; this._tone('sine', f, f * 0.6, 0.35, 0.22, o, t + i * 0.05); }
      this._tone('triangle', 420, 180, 0.4, 0.3, o, t);
    });
  },
  s_crystalShatter(x, y, z, v, local) {
    this._voice(1.6, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.8 * v, 1.5);
      this._noise('highpass', 3000, 1800, 0.8, 0.5, 1.0, o, t);
      for (let i = 0; i < 12; i++) this._tone('sine', 1800 + Math.random() * 4200, 1500, 0.3 + Math.random() * 0.5, 0.18, o, t + Math.random() * 0.25);
      this._tone('sine', 90, 35, 0.9, 0.9, o, t);
      this._noise('lowpass', 600, 60, 0.8, 1.0, 0.7, o, t);
    });
  },
  s_islandRumble(x, y, z, v, local) {
    this._voice(2.8, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.85 * v, 1.4);
      this._noise('lowpass', 160, 60, 1.2, 2.6, 1.0, o, t, 0.25);
      this._tone('sawtooth', 48, 32, 2.4, 0.18, o, t, 0.3);
      for (let i = 0; i < 6; i++) {
        const tt = t + 0.2 + i * 0.38 + Math.random() * 0.1;
        this._noise('bandpass', 700 + Math.random() * 600, 300, 3, 0.18, 0.35, o, tt);
        this._tone('sawtooth', 70 + Math.random() * 40, 50, 0.25, 0.12, o, tt);
      }
    });
  },
  s_cloudWhoosh(x, y, z, v, local) {
    this._voice(2.0, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.9 * v, 1.6);
      this._noise('bandpass', 2400, 180, 0.6, 1.6, 1.0, o, t, 0.05);
      this._noise('lowpass', 400, 50, 0.7, 1.8, 0.8, o, t, 0.1);
      this._tone('sine', 70, 30, 1.2, 0.7, o, t + 0.05);
    });
  },
  s_islandRise(x, y, z, v, local) {
    this._voice(4.2, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.6 * v, 1.6);
      this._noise('lowpass', 90, 260, 1, 3.8, 0.6, o, t, 1.2);
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this._tone('sine', f, f, 1.2, 0.25, o, t + 0.4 + i * 0.32, 0.01));
      this._noise('highpass', 5000, 9000, 0.7, 3.0, 0.12, o, t, 0.8);
    });
  },
  s_cloudPoof(x, y, z, v, local) {
    this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.5 * v, 0.8); this._noise('lowpass', 900, 120, 0.7, 0.5, 0.9, o, t, 0.02); });
  },
  _skyVisHook() {
    if (this._visHookS || typeof document === 'undefined') return;
    this._visHookS = true;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.setSkyHum(0); this.setFallsAmbience(0); } });
  },
  // surekli kristal ugultusu: ucgen + besli kismi, titresim; k 0..1, pitch Hz
  setSkyHum(k, pitch = 180) {
    if (!this.ctx || !this.enabled) return;
    if (typeof document !== 'undefined' && document.hidden) k = 0;
    let A = this.skyHum;
    if (!A) {
      if (k <= 0.001) return;
      const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0.0001;
      const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = pitch;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = pitch * 1.503;
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      const tr = ctx.createGain(); tr.gain.value = 1;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 0.3;
      lfo.connect(lg); lg.connect(tr.gain);
      o1.connect(tr); o2.connect(g2); g2.connect(tr); tr.connect(g); g.connect(this.master);
      o1.start(); o2.start(); lfo.start();
      A = this.skyHum = { o1, o2, lfo, g, k: 0, p: pitch };
      this._skyVisHook();
    }
    const t = this.ctx.currentTime;
    if (Math.abs(pitch - A.p) > 2) {
      A.p = pitch;
      A.o1.frequency.setTargetAtTime(pitch, t, 0.3); A.o2.frequency.setTargetAtTime(pitch * 1.503, t, 0.3);
      A.lfo.frequency.setTargetAtTime(4 + (pitch - 150) / 30, t, 0.3);
    }
    if (Math.abs(k - A.k) < 0.01) return;
    A.k = k; A.g.gain.setTargetAtTime(Math.max(0.0001, k * 0.045), t, 0.25);
  },
  // sellale: genis bant akan su
  setFallsAmbience(k) {
    if (!this.ctx || !this.enabled) return;
    if (typeof document !== 'undefined' && document.hidden) k = 0;
    let A = this.fallsAmb;
    if (!A) {
      if (k <= 0.001) return;
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(this.master); src.start();
      A = this.fallsAmb = { src, g, k: 0 };
      this._skyVisHook();
    }
    if (Math.abs(k - A.k) < 0.01) return;
    A.k = k; A.g.gain.setTargetAtTime(Math.max(0.0001, k * 0.12), this.ctx.currentTime, 0.4);
  },
  stopSkyAmbience() {
    const H = this.skyHum;
    if (H) { this.skyHum = null; try { H.o1.stop(); H.o2.stop(); H.lfo.stop(); } catch (e) { /* zaten durmus */ } H.g.disconnect(); }
    const F = this.fallsAmb;
    if (F) { this.fallsAmb = null; try { F.src.stop(); } catch (e) { /* zaten durmus */ } F.g.disconnect(); }
  },
});
