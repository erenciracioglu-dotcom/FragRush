// Tum sesler WebAudio ile anlik sentezlenir (dosya yok). 3B konumlu, yanki (reverb) gonderimli.
import { MAT_SOUND } from '../world/materials.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.7;
    this.voices = 0;
    this.maxVoices = 56;
    this.listener = { x: 0, y: 0, z: 0 };
    this.lastPlay = new Map();
  }

  // Ses baglamini onceden (yukleme bitince) kur. new AudioContext() ana is parcacigini Windows'ta
  // ~150-200 ms kilitliyor (ses aygiti sorgusu); bu OYNA tiklamasinda olursa oyun basinda takilma olur.
  // Kullanici etkilesimi olmadan baglam 'suspended' baslar; asil acma init() icinde resume() ile.
  prepare() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    // yanki
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4, 2.6);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.22;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    // gurultu tamponu
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // bozulma egrisi
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.distCurve[i] = Math.tanh(x * 3.2); }
  }

  // ilk kullanici etkilesiminde (OYNA) cagrilmali: hazir baglami yalnizca baslatir
  init() {
    this.prepare();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { try { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* yok */ } }
    this.enabled = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _impulse(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
    return buf;
  }

  setListener(cam) {
    if (!this.ctx || !this.enabled) return;
    const L = this.ctx.listener;
    const p = cam.position;
    this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(ux, t); L.upY.setValueAtTime(uy, t); L.upZ.setValueAtTime(uz, t);
    } else {
      L.setPosition(p.x, p.y, p.z); L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // cikis zinciri: kaynak -> [filtre] -> gain -> panner -> master (+reverb)
  _out(x, y, z, local, vol, revAmt = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    let node = g;
    const dist = local ? 0 : Math.hypot(x - this.listener.x, y - this.listener.y, z - this.listener.z);
    if (!local) {
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower';
      pan.distanceModel = 'inverse';
      pan.refDistance = 3.5; pan.rolloffFactor = 1.1; pan.maxDistance = 120;
      if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; } else pan.setPosition(x, y, z);
      g.connect(pan);
      node = pan;
      // uzak sesler bogulsun
      if (dist > 12) {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.value = Math.max(600, 16000 / (1 + (dist - 12) * 0.12));
        pan.connect(lp); node = lp;
      }
    }
    node.connect(this.master);
    const send = ctx.createGain(); send.gain.value = 0.35 * revAmt * (local ? 0.5 : 1 + Math.min(1.5, dist / 30));
    node.connect(send); send.connect(this.reverb);
    return g;
  }

  _noiseSrc(dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random() * 1.5;
    return s;
  }

  _env(g, t, a, peak, dec, sustain = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + dec);
  }

  _voice(dur, fn) {
    if (this.voices >= this.maxVoices) return;
    this.voices++;
    fn();
    setTimeout(() => { this.voices--; }, (dur + 0.1) * 1000);
  }

  impact(mat, x, y, z) {
    const snd = MAT_SOUND[mat] || 'stone';
    this.play('imp_' + snd, x, y, z, 0.8);
  }

  play(name, x = 0, y = 0, z = 0, vol = 1, local = false) {
    if (!this.enabled || !this.ctx || this.volume <= 0) return;
    // ayni sesin cok sik tekrarini sinirla
    const now = this.ctx.currentTime;
    const key = name + (local ? 'L' : '');
    const last = this.lastPlay.get(key) || 0;
    const minGap = name.startsWith('imp_') ? 0.025 : name === 'step' ? 0.08 : 0.012;
    if (now - last < minGap) return;
    this.lastPlay.set(key, now);
    const f = this['s_' + name];
    if (f) f.call(this, x, y, z, vol, local);
  }

  // ---- tarifler ----
  _tone(type, f0, f1, dur, peak, out, t, attack = 0.002) {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = this.ctx.createGain(); this._env(g, t, attack, peak, dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + attack + 0.02);
  }
  _noise(type, f0, f1, q, dur, peak, out, t, attack = 0.002) {
    const s = this._noiseSrc(dur);
    const bf = this.ctx.createBiquadFilter(); bf.type = type; bf.Q.value = q;
    bf.frequency.setValueAtTime(f0, t); bf.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain(); this._env(g, t, attack, peak, dur);
    s.connect(bf); bf.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + attack + 0.05);
  }

  s_pulse(x, y, z, v, local) { this._voice(0.15, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.42 * v, 0.6); const r = 1 + (Math.random() - 0.5) * 0.08; this._tone('square', 190 * r, 70, 0.07, 0.35, o, t); this._noise('bandpass', 3200 * r, 900, 1.2, 0.06, 0.9, o, t); this._tone('sine', 110, 45, 0.09, 0.6, o, t); }); }
  s_shotgun(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.85 * v, 1.2); this._noise('lowpass', 4500, 280, 0.8, 0.42, 1.0, o, t); this._tone('sine', 120, 38, 0.25, 1.0, o, t); this._noise('bandpass', 1400, 500, 1, 0.12, 0.6, o, t); }); }
  s_plasma(x, y, z, v, local) { this._voice(0.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.3 * v, 0.6); const r = 1 + (Math.random() - 0.5) * 0.1; this._tone('sine', 1300 * r, 260, 0.13, 0.5, o, t); this._tone('triangle', 2600 * r, 700, 0.08, 0.25, o, t); this._noise('highpass', 5000, 3000, 0.7, 0.05, 0.2, o, t); }); }
  s_rocket(x, y, z, v, local) { this._voice(0.7, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.6 * v, 1); this._noise('bandpass', 500, 2400, 1.5, 0.45, 0.9, o, t, 0.02); this._tone('sine', 95, 45, 0.3, 0.9, o, t); this._noise('lowpass', 1800, 200, 0.7, 0.2, 0.6, o, t); }); }
  s_rail(x, y, z, v, local) { this._voice(1.0, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.55 * v, 1.4); this._tone('sawtooth', 2400, 160, 0.55, 0.35, o, t); this._tone('sine', 140, 70, 0.7, 0.6, o, t, 0.005); this._noise('highpass', 6000, 2500, 0.8, 0.18, 0.5, o, t); this._tone('square', 60, 40, 0.4, 0.2, o, t); }); }
  s_explosion(x, y, z, v, local) {
    this._voice(2.2, () => {
      const ctx = this.ctx, t = ctx.currentTime, o = this._out(x, y, z, local, 1.1 * v, 1.6);
      const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(o);
      this._noise('lowpass', 2400, 90, 0.9, 1.6, 1.0, ws, t, 0.004);
      this._tone('sine', 70, 26, 0.9, 1.0, ws, t, 0.003);
      this._noise('bandpass', 900, 200, 0.7, 0.5, 0.7, o, t + 0.02);
      // tasma seslerinin dagilmasi
      for (let i = 0; i < 6; i++) this._noise('bandpass', 2000 + Math.random() * 3000, 800, 4, 0.04, 0.25, o, t + 0.15 + Math.random() * 0.7);
    });
  }
  s_plasmaHit(x, y, z, v, local) { this._voice(0.3, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.38 * v); this._noise('bandpass', 3000, 600, 1.2, 0.18, 0.7, o, t); this._tone('sine', 700, 120, 0.2, 0.5, o, t); }); }
  s_imp_stone(x, y, z, v, local) { this._voice(0.15, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.3 * v, 0.5); this._noise('bandpass', 1300 + Math.random() * 800, 500, 1.4, 0.07, 0.8, o, t); }); }
  s_imp_metal(x, y, z, v, local) { this._voice(0.35, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.25 * v, 0.7); const f = 1600 + Math.random() * 1400; this._tone('sine', f, f * 0.97, 0.25, 0.4, o, t); this._tone('sine', f * 1.53, f * 1.5, 0.18, 0.25, o, t); this._noise('highpass', 4000, 3000, 0.7, 0.04, 0.6, o, t); }); }
  s_imp_wood(x, y, z, v, local) { this._voice(0.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.32 * v, 0.5); this._noise('lowpass', 1100, 300, 1, 0.09, 0.8, o, t); this._tone('triangle', 260, 140, 0.08, 0.4, o, t); }); }
  s_imp_glass(x, y, z, v, local) { this._voice(0.4, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.25 * v, 0.8); this._noise('highpass', 5000, 3500, 1, 0.12, 0.6, o, t); for (let i = 0; i < 3; i++) this._tone('sine', 2500 + Math.random() * 2500, 2400, 0.2, 0.15, o, t + i * 0.03); }); }
  s_creak(x, y, z, v, local) { this._voice(1.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.5 * v, 1.2); this._tone('sawtooth', 75, 42, 0.9, 0.25, o, t, 0.08); this._noise('lowpass', 500, 80, 1, 1.0, 0.7, o, t, 0.05); }); }
  s_crumble(x, y, z, v, local) {
    this._voice(2.0, () => {
      const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.95 * v, 1.5);
      this._noise('lowpass', 900, 60, 0.8, 1.8, 1.0, o, t, 0.01);
      this._tone('sine', 55, 28, 0.8, 0.9, o, t);
      for (let i = 0; i < 10; i++) this._noise('bandpass', 700 + Math.random() * 1800, 300, 3, 0.05, 0.35, o, t + Math.random() * 1.2);
    });
  }
  s_jump(x, y, z, v, local) { this._voice(0.15, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.14 * v, 0.3); this._noise('lowpass', 900, 400, 0.7, 0.08, 0.6, o, t); }); }
  s_land(x, y, z, v, local) { this._voice(0.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.28 * Math.min(1.5, v), 0.4); this._noise('lowpass', 420, 90, 0.8, 0.13, 0.9, o, t); this._tone('sine', 90, 50, 0.1, 0.5, o, t); }); }
  s_step(x, y, z, v, local) { this._voice(0.1, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.07 * v, 0.2); this._noise('lowpass', 650 + Math.random() * 300, 200, 0.8, 0.05, 0.8, o, t); }); }
  s_dash(x, y, z, v, local) { this._voice(0.35, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.3 * v, 0.6); this._noise('bandpass', 350, 1900, 1.2, 0.28, 0.9, o, t, 0.02); }); }
  s_slide(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.18 * v, 0.4); this._noise('lowpass', 1400, 300, 0.7, 0.55, 0.7, o, t, 0.02); }); }
  s_jumppad(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.4 * v, 0.8); this._tone('sine', 180, 950, 0.38, 0.6, o, t); this._tone('square', 90, 480, 0.3, 0.15, o, t); this._noise('bandpass', 600, 3000, 1, 0.3, 0.4, o, t); }); }
  s_hit(x, y, z, v) { this._voice(0.08, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.22 * v, 0); this._tone('sine', 2100, 1900, 0.045, 0.6, o, t); }); }
  s_headshot(x, y, z, v) { this._voice(0.15, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.3 * v, 0); this._tone('sine', 2600, 2500, 0.07, 0.6, o, t); this._tone('sine', 3900, 3800, 0.1, 0.4, o, t + 0.04); }); }
  s_kill(x, y, z, v) { this._voice(0.4, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.32 * v, 0.3); this._tone('triangle', 880, 870, 0.12, 0.6, o, t); this._tone('triangle', 1320, 1310, 0.25, 0.6, o, t + 0.07); }); }
  s_hurt(x, y, z, v) { this._voice(0.25, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.35 * v, 0.2); this._noise('lowpass', 700, 120, 1, 0.16, 0.8, o, t); this._tone('sine', 160, 70, 0.15, 0.6, o, t); }); }
  s_pickup(x, y, z, v, local) { this._voice(0.35, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.25 * v, 0.4); [660, 880, 1320].forEach((f, i) => this._tone('sine', f, f, 0.1, 0.5, o, t + i * 0.05)); }); }
  s_quad(x, y, z, v, local) { this._voice(1.5, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.45 * v, 1.2); [110, 165, 220, 330].forEach((f) => this._tone('sawtooth', f, f * 1.01, 1.2, 0.2, o, t, 0.05)); this._tone('sine', 200, 1600, 0.8, 0.4, o, t); }); }
  s_quadSpawn(x, y, z, v, local) { this._voice(1.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, true, 0.3 * v, 1); this._tone('sine', 300, 1200, 0.9, 0.4, o, t, 0.1); this._tone('triangle', 450, 1800, 0.9, 0.2, o, t, 0.1); }); }
  s_quadFire(x, y, z, v, local) { this._voice(0.4, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.3 * v); this._tone('sawtooth', 220, 110, 0.3, 0.3, o, t); }); }
  s_respawn(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.25 * v, 0.8); this._tone('sine', 400, 1600, 0.45, 0.4, o, t, 0.02); this._noise('highpass', 3000, 8000, 0.7, 0.4, 0.2, o, t); }); }
  s_switch(x, y, z, v) { this._voice(0.1, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.15 * v, 0); this._noise('bandpass', 2500, 1500, 2, 0.04, 0.8, o, t); this._tone('square', 500, 400, 0.04, 0.2, o, t + 0.03); }); }
  s_empty(x, y, z, v) { this._voice(0.1, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.2 * v, 0); this._noise('bandpass', 3500, 3000, 3, 0.03, 0.8, o, t); }); }
  s_scan(x, y, z, v) { this._voice(1.0, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.35 * v, 1.2); for (let i = 0; i < 3; i++) this._tone('square', 1200, 1150, 0.12, 0.25, o, t + i * 0.18); this._tone('sine', 300, 60, 0.8, 0.4, o, t); }); }
  s_botDeath(x, y, z, v, local) { this._voice(0.8, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.5 * v, 1); this._tone('square', 900, 90, 0.5, 0.3, o, t); this._noise('bandpass', 1500, 300, 1, 0.4, 0.8, o, t); }); }
  s_playerDeath(x, y, z, v) { this._voice(1.2, () => { const t = this.ctx.currentTime, o = this._out(0, 0, 0, true, 0.45 * v, 1); this._tone('sawtooth', 300, 40, 1.0, 0.35, o, t); this._noise('lowpass', 1200, 80, 0.8, 0.9, 0.6, o, t); }); }
}
