// Fisekhane sesleri (WebAudio sentezi, dosya yok): fitil tislamasi, islik calarak yukselen fisek, patlama gumbur + catirti,
// sandik patlamasi, depo patlamasi, curuk fisek, depo uyarisi, yenilenme, uzak fisekler, gece circiri.
// sfx.js'e dokunmadan Audio.prototype'a eklenir (play('fwBurst') -> s_fwBurst).
import { Audio } from './sfx.js';

export function installFireworksSfx() {
  const P = Audio.prototype;
  if (P.s_fwBurst) return;
  Object.assign(P, {
    // fitil / cizirdayan sandik: kuru tislama
    s_fwFizz(x, y, z, v, local) { this._voice(0.3, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.2 * v, 0.3); this._noise('highpass', 5200 + Math.random() * 1600, 3600, 0.8, 0.24, 0.8, o, t, 0.01); this._noise('bandpass', 2400 + Math.random() * 600, 1600, 2.5, 0.16, 0.3, o, t + 0.04); }); },
    // fitil tutustu: kibrit cakimi
    s_fwLight(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.35 * v, 0.4); this._noise('bandpass', 1800, 6000, 1.2, 0.08, 0.9, o, t); this._noise('highpass', 4000, 3000, 0.8, 0.45, 0.5, o, t + 0.05, 0.03); }); },
    // yukselen fisek: yukselen islik + hava
    s_fwWhistle(x, y, z, v, local) { this._voice(1.5, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.16 * v, 0.9); const f0 = 800 + Math.random() * 500; this._tone('sine', f0, f0 * (2.2 + Math.random() * 0.6), 1.1, 0.4, o, t, 0.06); this._tone('triangle', f0 * 1.01, f0 * 2.5, 1.0, 0.08, o, t, 0.06); this._noise('bandpass', 1200, 3800, 4, 1.1, 0.3, o, t, 0.08); }); },
    // fisek acildi: derin gumbur + ardindan catirti
    s_fwBurst(x, y, z, v, local) {
      this._voice(2.0, () => {
        const ctx = this.ctx, t = ctx.currentTime, o = this._out(x, y, z, local, 0.75 * v, 1.8);
        const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(o);
        this._tone('sine', 85, 34, 0.7, 1.0, ws, t, 0.003);
        this._noise('lowpass', 1800, 120, 0.8, 0.9, 0.8, ws, t, 0.003);
        for (let i = 0; i < 9; i++) this._noise('bandpass', 2500 + Math.random() * 4000, 1500, 5, 0.03, 0.25, o, t + 0.25 + Math.random() * 0.9);
      });
    },
    // simli fisek: dagilan cit cit
    s_fwCrackle(x, y, z, v, local) { this._voice(1.4, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.4 * v, 1.2); for (let i = 0; i < 22; i++) this._noise('highpass', 3000 + Math.random() * 5000, 2500, 1.5, 0.018, 0.6 + Math.random() * 0.4, o, t + Math.random() * 0.9); }); },
    // sandik patladi: kuru patlama + kagit yirtilmasi + catirti
    s_fwCrate(x, y, z, v, local) {
      this._voice(1.6, () => {
        const ctx = this.ctx, t = ctx.currentTime, o = this._out(x, y, z, local, 0.95 * v, 1.4);
        const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(o);
        this._noise('lowpass', 3000, 140, 0.9, 0.7, 1.0, ws, t, 0.002);
        this._tone('sine', 110, 40, 0.45, 0.9, ws, t, 0.002);
        this._noise('bandpass', 1400, 400, 1.2, 0.3, 0.5, o, t + 0.01);
        for (let i = 0; i < 12; i++) this._noise('bandpass', 2000 + Math.random() * 5000, 1200, 4, 0.025, 0.35, o, t + 0.08 + Math.random() * 0.6);
      });
    },
    // depo patladi: cok derin, bozuk gumbur, uzun gok gurultusu ve dusen enkaz
    s_fwDepot(x, y, z, v, local) {
      this._voice(4.5, () => {
        const ctx = this.ctx, t = ctx.currentTime, o = this._out(x, y, z, local, 1.4 * v, 2.2);
        const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; ws.connect(o);
        this._tone('sine', 55, 18, 2.2, 1.0, ws, t, 0.004);
        this._noise('lowpass', 2200, 60, 0.9, 3.4, 1.0, ws, t, 0.004);
        this._noise('bandpass', 700, 120, 0.8, 1.6, 0.6, o, t + 0.05);
        for (let i = 0; i < 18; i++) this._noise('bandpass', 1500 + Math.random() * 4500, 900, 3, 0.04, 0.3, o, t + 0.3 + Math.random() * 2.4);
      });
    },
    // curuk fisek yere carpti / tavana carpti: kucuk patlama
    s_fwPop(x, y, z, v, local) { this._voice(0.8, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.55 * v, 1); this._noise('lowpass', 2600, 160, 0.9, 0.35, 1.0, o, t, 0.002); this._tone('sine', 140, 50, 0.25, 0.7, o, t); for (let i = 0; i < 5; i++) this._noise('highpass', 3500 + Math.random() * 3000, 2500, 2, 0.02, 0.4, o, t + 0.05 + Math.random() * 0.3); }); },
    // depo uyarisi: kapidan puskuren kivilcim + yukselen ikaz
    s_fwWarn(x, y, z, v, local) { this._voice(1.3, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.6 * v, 1); this._noise('highpass', 3500, 6000, 0.7, 1.0, 0.9, o, t, 0.05); this._tone('square', 660, 1320, 0.95, 0.18, o, t, 0.02); this._tone('square', 990, 1980, 0.95, 0.1, o, t + 0.12, 0.02); }); },
    // yenilenme: yumusak puf + cin
    s_fwRegen(x, y, z, v, local) { this._voice(0.9, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.3 * v, 0.6); this._noise('lowpass', 900, 300, 0.7, 0.35, 0.8, o, t, 0.03); [1320, 1760].forEach((f, i) => this._tone('sine', f, f, 0.25, 0.3, o, t + 0.12 + i * 0.07)); }); },
    // uzak fisek: bogulmus gumbur ve hafif catirti
    s_fwDistant(x, y, z, v, local) { this._voice(2.2, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.5 * v, 2.5); this._noise('lowpass', 420, 60, 0.8, 1.5, 1.0, o, t, 0.01); this._tone('sine', 60, 30, 0.9, 0.7, o, t, 0.01); for (let i = 0; i < 5; i++) this._noise('bandpass', 1400 + Math.random() * 1200, 900, 3, 0.03, 0.18, o, t + 0.5 + Math.random() * 0.8); }); },
    // gece circiri: uc kisa titresimli cirp
    s_cricket(x, y, z, v, local) { this._voice(0.6, () => { const t = this.ctx.currentTime, o = this._out(x, y, z, local, 0.05 * v, 0.4); const f = 4200 + Math.random() * 900; for (let i = 0; i < 3; i++) this._tone('sine', f, f * 0.98, 0.045, 0.6, o, t + i * 0.085, 0.004); }); },
  });
}
