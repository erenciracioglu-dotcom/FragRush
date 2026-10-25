/*
 * water.js — Hafif ve gerçekçi WebGL2 su
 * ---------------------------------------------------------------------------
 * Tek dosya, bağımlılık yok (ES module). Gölet, göl, nehir, deniz, okyanus ve
 * fırtına aynı sistemle çizilir: ya hazır ön ayarlarla (WaterPresets) ya da
 * parametrelerle (rüzgar, fetch, dalga ölçeği, renk, köpük...).
 *
 * Nasıl hafif kalıyor?
 *  - Büyük dalgalar: az sayıda Gerstner dalgası, köşe (vertex) shader'ında.
 *    Dalga boyları ve genlikleri gerçek okyanus spektrumundan (JONSWAP) gelir.
 *  - Küçük dalgalar: her karede 128²/256²'lik küçük bir "detay" dokusuna
 *    toplanan 32-64 döşenebilir sinüs (gerçek dispersiyonla hareket eder).
 *    Piksel başına yalnızca 2-4 doku okuması.
 *  - Uzakta çözülemeyen küçük dalgaların eğim varyansı pürüzlülüğe eklenir:
 *    güneş parıltısı ufka doğru doğal biçimde genişler, titreme (aliasing) olmaz.
 *  - Yansıma: bir kez üretilen gökyüzü küp haritası (+ isteğe bağlı düzlemsel).
 *  - Kırılma/derinlik/kostik: sahnenin hazır renk + derinlik dokusundan.
 *    Su için sahne tekrar çizilmez.
 *
 * Koordinatlar: Y yukarı, birim metre. Matrisler sütun öncelikli (WebGL).
 */

const TAU = Math.PI * 2;
const GRAVITY = 9.81;
const DEG = Math.PI / 180;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// patlama tohumu: her istemcide aynı, işaretsiz 32 bit tam sayı (kesirli ve negatifler dahil)
const normSeed = (s) => (Number.isInteger(s) ? s >>> 0 : Math.imul((s * 4294967296) | 0, 0x9e3779b1) >>> 0);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => t * t * (3 - 2 * t);
const modTau = (x) => x - TAU * Math.floor(x / TAU);

// ---------------------------------------------------------------------------
// Küçük matris yardımcıları (oyunda da kullanılabilir)
// ---------------------------------------------------------------------------
export const mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  multiply(out, a, b) {
    const r = mat4._tmp;
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    out.set(r);
    return out;
  },
  invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  },
  perspective(out, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },
  lookAt(out, eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },
  _tmp: new Float32Array(16),
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

// ---------------------------------------------------------------------------
// Hazır senaryolar. Renkler doğrusal (linear) uzayda, soğurma 1/metre.
// "sky" alanı Sky sınıfı içindir; Water onu görmezden gelir.
// ---------------------------------------------------------------------------
const DEFAULT_PARAMS = {
  windSpeed: 6,          // m/s
  windDirection: 0,      // derece, 0 = +X yönüne eser
  fetch: 5000,           // m, rüzgarın su üzerinde estiği mesafe (Infinity = açık okyanus)
  waveScale: 1,          // dalga yüksekliği çarpanı
  choppiness: 0.7,       // dalga tepelerinin sivriliği (0-1.5)
  spread: 1,             // dalga yönlerinin dağınıklığı
  detailScale: 1,        // küçük dalgaların (pürüz) gücü
  swellHeight: 0,        // m, uzak fırtınalardan gelen uzun dalga (ölü dalga)
  swellLength: 120,      // m
  swellDirection: 0,     // derece
  flow: [0, 0],          // m/s, sabit akış (nehir); değişken akış için setFlowMap
  flowCycle: 2,          // s, değişken akışta doku döngüsü
  waterColor: [0.004, 0.02, 0.035],   // suyun derin (saçılma) rengi
  absorption: [0.45, 0.07, 0.04],     // 1/m, kanal başına soğurma
  turbidity: 0.05,                    // 1/m, bulanıklık
  depthDarkening: 0,     // 0-1: su altında derinlikle kararma (0 = sabit su gövdesi rengi)
  sssColor: [0.02, 0.09, 0.07],       // dalga tepesinden geçen ışığın rengi
  sss: 1,
  roughness: 0.0001,     // taban pürüzlülük (eğim varyansı)
  refraction: 1,
  edgeSoftness: 0.12,    // m, kıyı çizgisinin yumuşaklığı
  whitecaps: 1,          // dalga köpüğü: 1 = rüzgar hızına göre ölçülmüş gerçek kapsama (Monahan)
  shoreFoam: 0.6,
  shoreFoamWidth: 1.2,   // m
  flowFoam: 0,
  foamScale: 6,          // m, köpük dokusunun boyutu
  foamStreaks: 0,        // rüzgar yönünde köpük şeritleri (fırtına)
  caustics: 0.6,
  causticScale: 3,       // m
  rain: 0,               // 0-1, yağmur damlası halkaları
  seed: 1337,
};

export const WaterPresets = {
  pond: {
    label: 'Gölet',
    windSpeed: 1, windDirection: 30, fetch: 40, choppiness: 0.3, spread: 1.7, detailScale: 0.35,
    swellHeight: 0.01, swellLength: 3.5, swellDirection: 50,
    waterColor: [0.010, 0.020, 0.011], absorption: [0.55, 0.40, 0.70], turbidity: 0.45,
    sssColor: [0.02, 0.05, 0.02], sss: 0.4, roughness: 0.00003, edgeSoftness: 0.06,
    whitecaps: 0, shoreFoam: 0.04, shoreFoamWidth: 0.3, foamScale: 2,
    caustics: 0.35, causticScale: 1.1,
    sky: { sunElevation: 34, sunAzimuth: 235, cloudCover: 0.38, cloudDarkness: 0.2, haze: 0.3, fogDensity: 0.0016 },
  },
  lake: {
    label: 'Göl',
    windSpeed: 5, windDirection: 20, fetch: 1500, choppiness: 0.55, spread: 1.2, detailScale: 0.85,
    waterColor: [0.006, 0.026, 0.030], absorption: [0.42, 0.11, 0.10], turbidity: 0.18,
    sssColor: [0.02, 0.08, 0.06], sss: 0.6, roughness: 0.00008,
    whitecaps: 1, shoreFoam: 0.25, shoreFoamWidth: 0.6, foamScale: 3,
    caustics: 0.5, causticScale: 1.8,
    sky: { sunElevation: 26, sunAzimuth: 200, cloudCover: 0.45, cloudDarkness: 0.25, haze: 0.4, fogDensity: 0.0006 },
  },
  river: {
    label: 'Nehir',
    windSpeed: 2.5, windDirection: 0, fetch: 120, choppiness: 0.4, spread: 1.6, detailScale: 0.95,
    flowCycle: 2.2,
    waterColor: [0.016, 0.028, 0.018], absorption: [0.55, 0.30, 0.32], turbidity: 0.42,
    sssColor: [0.03, 0.07, 0.03], sss: 0.5, roughness: 0.0001,
    whitecaps: 0, shoreFoam: 0.55, shoreFoamWidth: 0.55, flowFoam: 0.6, foamScale: 2.5,
    caustics: 0.4, causticScale: 1.2,
    sky: { sunElevation: 42, sunAzimuth: 160, cloudCover: 0.3, cloudDarkness: 0.15, haze: 0.3, fogDensity: 0.001 },
  },
  tropical: {
    label: 'Tropik',
    windSpeed: 5, windDirection: 250, fetch: 40000, choppiness: 0.6, detailScale: 0.9,
    swellHeight: 0.7, swellLength: 70, swellDirection: 265,
    waterColor: [0.001, 0.055, 0.075], absorption: [0.32, 0.045, 0.028], turbidity: 0.015,
    sssColor: [0.02, 0.14, 0.11], sss: 1.2, roughness: 0.0001, edgeSoftness: 0.15,
    whitecaps: 1, shoreFoam: 0.85, shoreFoamWidth: 1.4, foamScale: 4,
    caustics: 1, causticScale: 3.5,
    sky: { sunElevation: 55, sunAzimuth: 120, cloudCover: 0.25, cloudDarkness: 0.1, haze: 0.2, fogDensity: 0.00025 },
  },
  sea: {
    label: 'Deniz',
    windSpeed: 8, windDirection: 260, fetch: 30000, choppiness: 0.75, detailScale: 1,
    swellHeight: 0.4, swellLength: 90, swellDirection: 280,
    waterColor: [0.003, 0.020, 0.036], absorption: [0.45, 0.075, 0.045], turbidity: 0.06,
    sssColor: [0.02, 0.10, 0.08], sss: 1,
    whitecaps: 1.4, shoreFoam: 0.7, shoreFoamWidth: 1.6, foamScale: 6,
    caustics: 0.7, causticScale: 4,
    sky: { sunElevation: 30, sunAzimuth: 110, cloudCover: 0.4, cloudDarkness: 0.2, haze: 0.35, fogDensity: 0.00035 },
  },
  ocean: {
    label: 'Okyanus',
    windSpeed: 12, windDirection: 255, fetch: Infinity, waveScale: 0.75, choppiness: 0.85, detailScale: 1,
    swellHeight: 1.6, swellLength: 160, swellDirection: 285,
    waterColor: [0.002, 0.013, 0.034], absorption: [0.45, 0.065, 0.032], turbidity: 0.03,
    sssColor: [0.02, 0.10, 0.09], sss: 1.1,
    whitecaps: 1.4, shoreFoam: 0.8, shoreFoamWidth: 2.5, foamScale: 8, foamStreaks: 0.2,
    caustics: 0.6, causticScale: 5,
    sky: { sunElevation: 18, sunAzimuth: 95, cloudCover: 0.5, cloudDarkness: 0.3, haze: 0.4, fogDensity: 0.0003 },
  },
  storm: {
    label: 'Fırtına',
    // gelişmekte olan fırtına denizi: kısa, dik dalgalar (yükseklik/dalga boyu ~1/18)
    windSpeed: 23, windDirection: 245, fetch: 120000, waveScale: 1.8, choppiness: 1.5, detailScale: 1.25,
    swellHeight: 3, swellLength: 180, swellDirection: 230,
    waterColor: [0.003, 0.016, 0.05], absorption: [0.45, 0.07, 0.035], turbidity: 0.04,
    sssColor: [0.0, 0.2, 0.22], sss: 1.4, roughness: 0.0004,
    whitecaps: 1.5, shoreFoam: 0.7, shoreFoamWidth: 2, foamScale: 7, foamStreaks: 0.6, rain: 0.4,
    caustics: 0.15, causticScale: 5,
    sky: { sunElevation: 22, sunAzimuth: 80, cloudCover: 0.96, cloudDarkness: 0.4, haze: 1.4, fogDensity: 0.0008, exposure: 1.5 },
  },
};

// Yalnızca bu parametreler dalga setini (spektrumu) değiştirir; diğerleri anında uygulanır.
const WAVE_KEYS = ['windSpeed', 'windDirection', 'fetch', 'waveScale', 'choppiness', 'spread',
  'detailScale', 'swellHeight', 'swellLength', 'swellDirection', 'seed'];

function resolvePreset(preset) {
  if (!preset) return {};
  if (typeof preset === 'string') {
    const p = WaterPresets[preset];
    if (!p) throw new Error(`water.js: bilinmeyen ön ayar "${preset}"`);
    return p;
  }
  return preset;
}

function copyParams(src) {
  const out = {};
  for (const k in DEFAULT_PARAMS) {
    const v = src[k] ?? DEFAULT_PARAMS[k];
    out[k] = Array.isArray(v) ? v.slice() : v;
  }
  return out;
}

function lerpParams(a, b, t) {
  const out = {};
  for (const k in a) {
    const x = a[k], y = b[k];
    if (Array.isArray(x)) out[k] = x.map((v, i) => lerp(v, y[i], t));
    else if (typeof x === 'number' && Number.isFinite(x) && Number.isFinite(y)) out[k] = lerp(x, y, t);
    else out[k] = t < 0.5 ? x : y;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dalga spektrumu (JONSWAP). Rüzgar hızı + fetch → belirgin dalga yüksekliği
// (Hs) ve tepe dalga sayısı (kp). Gölde santimlik dalgacıklar, okyanusta
// metrelerce dalga — aynı formül.
// ---------------------------------------------------------------------------
function seaState(p) {
  const U = Math.max(0.5, p.windSpeed);
  const fetch = p.fetch > 0 ? Math.min(p.fetch, 1e9) : 1e9;
  const X = Math.min((GRAVITY * fetch) / (U * U), 2.2e4); // boyutsuz fetch; tam gelişmiş denizde sabitlenir
  const Hs = (0.0016 * Math.sqrt(X) * U * U) / GRAVITY;
  const fp = 3.5 * (GRAVITY / U) * Math.pow(X, -0.33);
  const wp = TAU * fp;
  const kp = (wp * wp) / GRAVITY;
  const gamma = 1 + 2.3 * clamp((Math.log10(2.2e4) - Math.log10(X)) / 2, 0, 1);
  return { U, Hs, wp, kp, gamma };
}

function jonswapK(k, s) {
  const w = Math.sqrt(GRAVITY * k);
  const sigma = w <= s.wp ? 0.07 : 0.09;
  const r = Math.exp(-((w - s.wp) ** 2) / (2 * sigma * sigma * s.wp * s.wp));
  const Sw = Math.pow(w, -5) * Math.exp(-1.25 * Math.pow(s.wp / w, 4)) * Math.pow(s.gamma, r);
  return (Sw * GRAVITY) / (2 * w); // S(k) = S(ω)·dω/dk
}

function spectrumNorm(s) {
  const n = 400;
  const l0 = Math.log(s.kp * 0.1), l1 = Math.log(s.kp * 1000);
  const d = (l1 - l0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.exp(l0 + (i + 0.5) * d);
    sum += jonswapK(k, s) * k * d;
  }
  return (s.Hs / 4) ** 2 / sum;
}

// Eğim kovaryansı (xx, zz, xz); döndürülmüş doku kopyasıyla ortalaması (shader'daki 2 örnek)
function layerCov(waves, P, rc, rs) {
  let xx = 0, zz = 0, xz = 0;
  for (const w of waves) {
    const kx = (TAU * w.m) / P, kz = (TAU * w.n) / P;
    xx += 0.5 * (w.a * kx) ** 2;
    zz += 0.5 * (w.a * kz) ** 2;
    xz += 0.5 * w.a * w.a * kx * kz;
  }
  const rxx = xx * rc * rc + 2 * xz * rc * rs + zz * rs * rs;
  const rzz = xx * rs * rs - 2 * xz * rc * rs + zz * rc * rc;
  const rxz = (zz - xx) * rc * rs + xz * (rc * rc - rs * rs);
  return [0.5 * (xx + rxx), 0.5 * (zz + rzz), 0.5 * (xz + rxz)];
}

function makeWave(k, angle, a, rand) {
  return { dx: Math.cos(angle), dz: Math.sin(angle), k, w: Math.sqrt(GRAVITY * k), a, c: 0, phase0: rand() * TAU };
}

// Döşenebilir detay katmanı: dalga vektörleri tamsayı (m, n) → doku kenarları birleşir.
const DETAIL_CMIN = 3; // detay katmanının en uzun dalgası = yama/3 (2 olunca yönler çok kaba kuantalanıyordu)

function buildDetailLayer(P, count, cMax, windA, spreadFn, S, rand) {
  const cMin = DETAIL_CMIN;
  const waves = [];
  const used = new Set();
  const dln = Math.log(cMax / cMin) / count;
  for (let i = 0; i < count; i++) {
    const c = cMin * Math.exp((i + rand()) * dln);
    let ang = windA + gauss(rand) * spreadFn((TAU * c) / P);
    if (rand() < 0.12) ang += Math.PI; // kısa dalgaların bir kısmı ters yönde
    let m = Math.round(c * Math.cos(ang));
    let n = Math.round(c * Math.sin(ang));
    for (let t = 0; t < 10 && ((m === 0 && n === 0) || used.has(m + ',' + n)); t++) {
      if (t & 1) n += rand() < 0.5 ? -1 : 1;
      else m += rand() < 0.5 ? -1 : 1;
    }
    if ((m === 0 && n === 0) || used.has(m + ',' + n)) continue;
    used.add(m + ',' + n);
    used.add(-m + ',' + -n);
    const k = (TAU * Math.hypot(m, n)) / P;
    const a = Math.sqrt(2 * S(k) * k * dln);
    // kılcal dalga terimi: çok kısa dalgalar biraz daha hızlı ilerler
    waves.push({ m, n, k, a, P, w: Math.sqrt(GRAVITY * k + 7.4e-5 * k * k * k), phase0: rand() * TAU });
  }
  return waves;
}

/**
 * Parametrelerden tam bir dalga seti üretir.
 * cfg: { vertexCount, detailCount, detailSize, nearSpacing, fixedPatch }
 */
function buildWaveSet(p, cfg) {
  const rand = mulberry32(p.seed);
  const sp = seaState(p);
  const norm = spectrumNorm(sp);
  const S = (k) => jonswapK(k, sp) * norm;
  const windA = p.windDirection * DEG;
  const spreadFn = (k) => p.spread * (0.32 + 0.6 * clamp(Math.log(k / sp.kp) / Math.log(40), 0, 1));

  // --- Büyük dalgalar (köşe shader'ı) ---
  const vertex = [];
  const hasSwell = p.swellHeight > 0.001;
  const vCount = cfg.vertexCount - (hasSwell ? 3 : 0);
  const kMesh = TAU / (6 * cfg.nearSpacing);
  const kLo = 0.5 * sp.kp;
  const kHi = Math.min(sp.kp * 10, kMesh);
  let detailStart = 0.5 * sp.kp;
  if (kHi > kLo * 1.25 && vCount > 0) {
    const dln = Math.log(kHi / kLo) / vCount;
    for (let i = 0; i < vCount; i++) {
      const k = kLo * Math.exp((i + 0.25 + 0.5 * rand()) * dln);
      const ang = windA + gauss(rand) * spreadFn(k);
      vertex.push(makeWave(k, ang, Math.sqrt(2 * S(k) * k * dln) * p.waveScale, rand));
    }
    detailStart = kHi;
  }
  if (hasSwell) {
    // dar bantlı ölü dalga: 3 bileşen (dalga boyu ±%15, yön ±~7°); iki sabit dalganın
    // düzenli vuru deseni yerine doğal gruplanma. Toplam varyans (Hs/4)² korunur.
    const ks = TAU / Math.max(p.swellLength, 1);
    const sa = p.swellDirection * DEG;
    const comps = [[1, 0, 1], [1.16, 0.12, 0.72], [0.88, -0.1, 0.8]];
    const aTot = (p.swellHeight / (2 * Math.SQRT2)) * p.waveScale;
    const rn = Math.sqrt(comps.reduce((t, c) => t + c[2] * c[2], 0));
    for (const [km, da, r] of comps) {
      vertex.push(makeWave(ks * km, sa + da + (rand() - 0.5) * 0.06, (aTot * r) / rn, rand));
    }
  }
  // Dalga tepelerinin sivriliği (Tessendorf "choppiness"): yatay genlik = λ·a
  let sumAK = 0;
  for (const w of vertex) sumAK += w.a * w.k;
  const lambda = sumAK > 0 ? Math.min(p.choppiness, 0.92 / sumAK) : 0;
  let vertexVar = 0;
  for (const w of vertex) {
    w.c = lambda * w.a;
    vertexVar += 0.5 * (w.a * w.k) ** 2;
  }

  // --- Küçük dalgalar (detay dokusu, iki katman) ---
  const cMax = cfg.detailSize / 4;
  // yama en az 4 m: küçük sularda tekrar görünmesin, yansımayı oynatan orta dalgalar olsun
  const PA = cfg.fixedPatch ? cfg.fixedPatch.PA : Math.max((DETAIL_CMIN * TAU) / detailStart, 4);
  const PB = cfg.fixedPatch ? cfg.fixedPatch.PB : ((PA * DETAIL_CMIN) / cMax) * 0.93;
  const detailA = buildDetailLayer(PA, cfg.detailCount, cMax, windA, spreadFn, S, rand);
  const detailB = buildDetailLayer(PB, cfg.detailCount, cMax, windA, spreadFn, S, rand);
  // Toplam eğim varyansını Cox–Munk ölçümüne göre ayarla (rüzgar ↑ → pürüz ↑)
  const coxMunk = 0.003 + 0.00512 * sp.U;
  const target = Math.max(0.3 * coxMunk, coxMunk - vertexVar) * p.detailScale * p.detailScale;
  let varA = 0, varB = 0;
  for (const w of detailA) varA += 0.5 * (w.a * w.k) ** 2;
  for (const w of detailB) varB += 0.5 * (w.a * w.k) ** 2;
  const f = varA + varB > 0 ? Math.sqrt(target / (varA + varB)) : 0;
  for (const w of detailA) w.a *= f;
  for (const w of detailB) w.a *= f;
  varA *= f * f;
  varB *= f * f;
  // A katmanı geometri olarak da çizilir: tepe sivriliği (döngü yapmasın diye sınırlı)
  let sumAKd = 0, ampA = 0;
  for (const w of detailA) { sumAKd += w.a * w.k; ampA += w.a; }
  const chopA = sumAKd > 0 ? Math.min(p.choppiness, 0.8 / sumAKd) : 0;
  let jVarA = 0;
  for (const w of detailA) jVarA += 0.5 * (chopA * w.a * w.k) ** 2;
  const covA = layerCov(detailA, PA, 0.6216, 0.7833);
  const covB = layerCov(detailB, PB, -0.4161, 0.9093);

  let maxA = 0;
  for (const w of vertex) maxA += w.a;
  return {
    vertex, detailA, detailB, PA, PB, varA, varB, chopA, jVarA, ampA, akA: sumAKd, covA, covB,
    Hs: Math.max(sp.Hs * p.waveScale, 0.02),
    maxAmplitude: maxA,
    kp: sp.kp,
  };
}

// ---------------------------------------------------------------------------
// Kalite seviyeleri
// ---------------------------------------------------------------------------
const QUALITY = {
  low: { detailSize: 128, detailWaves: 24, vertexWaves: 8, segments: 128, rings: 96, r0: 0.35, rectRes: 128, aniso: 1, detailTaps: 4, foamRes: 256, foamSize: 160, foamFarSize: 640 },
  medium: { detailSize: 256, detailWaves: 24, vertexWaves: 12, segments: 160, rings: 128, r0: 0.3, rectRes: 192, aniso: 1, detailTaps: 4, foamRes: 384, foamSize: 240, foamFarSize: 960 },
  high: { detailSize: 256, detailWaves: 32, vertexWaves: 16, segments: 256, rings: 176, r0: 0.25, rectRes: 256, aniso: 2, detailTaps: 4, foamRes: 512, foamSize: 320, foamFarSize: 1280 },
};

// ---------------------------------------------------------------------------
// GL yardımcıları
// ---------------------------------------------------------------------------
function detectCaps(gl) {
  return {
    floatRT: !!gl.getExtension('EXT_color_buffer_float'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
  };
}

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    gl.deleteShader(s);
    throw new Error(`water.js shader derleme hatası:\n${log}\n${lines}`);
  }
  return s;
}

/** #define'larla program derler; uniform konumlarını `u` nesnesinde döndürür. */
// Derlemeyi başlatır ama sonucu sormaz: KHR_parallel_shader_compile varsa sürücü arka planda
// derler. finishProgram() ile tamamlanır (gerekirse o anda bekler).
function createProgramDeferred(gl, vsSrc, fsSrc, defines = {}) {
  gl.getExtension('KHR_parallel_shader_compile');
  let head = '#version 300 es\n';
  for (const [k, v] of Object.entries(defines)) {
    if (v === false || v == null) continue;
    head += `#define ${k}${v === true ? '' : ' ' + v}\n`;
  }
  const program = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vsSrc], [gl.FRAGMENT_SHADER, fsSrc]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, head + src);
    gl.compileShader(sh);
    gl.attachShader(program, sh);
    gl.deleteShader(sh);
  }
  gl.linkProgram(program);
  return { program, u: null };
}

function finishProgram(gl, p) {
  if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
    throw new Error('water.js program bağlama hatası: ' + gl.getProgramInfoLog(p.program));
  }
  const u = {};
  const n = gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p.program, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p.program, info.name);
  }
  p.u = u;
  return p;
}

export function createProgram(gl, vsSrc, fsSrc, defines = {}) {
  let head = '#version 300 es\n';
  for (const [k, v] of Object.entries(defines)) {
    if (v === false || v == null) continue;
    head += `#define ${k}${v === true ? '' : ' ' + v}\n`;
  }
  const vs = compileShader(gl, gl.VERTEX_SHADER, head + vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, head + fsSrc);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('water.js program bağlama hatası: ' + gl.getProgramInfoLog(program));
  }
  const u = {};
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, u };
}

function setTexParams(gl, target, { filter = 'linear', mip = false, wrap = gl.REPEAT, aniso = 0, caps } = {}) {
  const min = filter === 'nearest' ? gl.NEAREST : mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter === 'nearest' ? gl.NEAREST : gl.LINEAR);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, wrap);
  if (aniso > 1 && caps && caps.aniso) {
    const max = gl.getParameter(caps.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
    gl.texParameterf(target, caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(aniso, max));
  }
}

/**
 * Float verisinden filtrelenebilir doku (R16F / RG16F / RGBA16F) üretir.
 * Yükseklik haritası ve akış haritası için uygundur.
 */
export function createDataTexture(gl, data, width, height, channels = 1) {
  const fmt = [null, [gl.R16F, gl.RED], [gl.RG16F, gl.RG], null, [gl.RGBA16F, gl.RGBA]][channels];
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], width, height, 0, fmt[1], gl.FLOAT, data);
  setTexParams(gl, gl.TEXTURE_2D, { wrap: gl.CLAMP_TO_EDGE });
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

// ---------------------------------------------------------------------------
// Ortak GLSL: ortam (küp harita), sis ve ton eşleme. Oyunun kendi
// shader'larına da eklenebilir; böylece su ile sahne aynı ışık/sisi paylaşır.
// Gerekli uniform'lar bindEnvironment() ile atanır.
// ---------------------------------------------------------------------------
const GLSL_ENV = /* glsl */ `
uniform samplerCube uEnv;
uniform float uEnvScale;
uniform float uEnvMaxLod;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uFogDensity;
uniform float uExposure;

vec3 envLod(vec3 d, float lod) { return textureLod(uEnv, d, lod).rgb * uEnvScale; }
// Dağınık (difüz) gökyüzü ışığı
vec3 skyAmbient(vec3 n) { return envLod(n, max(uEnvMaxLod - 1.0, 0.0)); }
// Mesafe sisi: renk, bakış yönündeki ufuk renginden gelir (gökyüzüyle dikişsiz)
vec3 applyFog(vec3 color, vec3 viewDir, float dist) {
  float f = 1.0 - exp(-dist * uFogDensity);
  vec3 fd = normalize(vec3(viewDir.x, abs(viewDir.y) * 0.25 + 0.04, viewDir.z));
  return mix(color, envLod(fd, max(uEnvMaxLod - 3.0, 0.0)), f);
}
// AgX (Sobotka; Wrensch'in polinom yaklaşımı): parlak renkleri beyaza doğru doygunluğunu
// yitirerek sıkıştırır (güneş parıltısı ve köpükte renk kayması yok). Hafif "punchy" görünüm.
vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agxToneMap(vec3 c) {
  const mat3 toAgx = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 fromAgx = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                            -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                            -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = clamp(log2(max(toAgx * c, 1.0e-10)), -12.47393, 4.026069);
  c = agxCurve((c + 12.47393) / 16.500999);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = l + 1.3 * (pow(max(c, 0.0), vec3(1.25)) - l);
  // ekran kodlamasında kal (EOTF + sRGB gama birbirini götürür)
  return clamp(fromAgx * c, 0.0, 1.0);
}
vec3 toneMap(vec3 c) { return agxToneMap(c * uExposure); }
`;

// ---------------------------------------------------------------------------
// Su üstü / su altı aynı anda. Water.updateNear() her karede kameranın yakın düzleminin
// suyla ilişkisini hesaplar: tamamen havada, tamamen suda ya da su çizgisinde. Su
// çizgisindeyken küçük bir ızgarada, yüzeyle AYNI dalga fonksiyonunu çözerek her ekran
// noktasının yakın düzlemdeki karşılığının yüzeye göre yüksekliğini (s) üretir.
// Sahne, gökyüzü ve son işleme shader'ları bu parçalarla aynı cevabı okur; böylece su
// çizgisinin altı ile üstü tam dalganın lensi kestiği yerde ayrılır.
// Gerekli uniform'lar bindMedium() ile atanır.
// ---------------------------------------------------------------------------
const GLSL_NEAR = /* glsl */ `
uniform sampler2D uNearMap;   // yakın düzlem ızgarası (s, metre)
uniform vec4 uNearInfo;       // kip (0 hava, 1 su, 2 su çizgisinde), RGBA8 paketli, aralık (m), kamera derinliği (m)
uniform vec4 uNearGrid;       // ızgara N, M, 1/ekran genişliği, 1/ekran yüksekliği
float medNearTexel(ivec2 c) {
  vec4 t = texelFetch(uNearMap, c, 0);
  return uNearInfo.y > 0.5 ? ((t.r + t.g / 255.0) * 2.0 - 1.0) * uNearInfo.z : t.r;
}
// s ve piksel başına türevi. s > 0: yakın düzlem noktası havada, s < 0: suda.
// suv: ekran uv'si (0..1, sol alt köken), gl_FragCoord.xy * uNearGrid.zw
vec3 waterNearSGrad(vec2 suv) {
  if (uNearInfo.x < 0.5) return vec3(1.0, 0.0, 0.0);
  if (uNearInfo.x < 1.5) return vec3(-max(uNearInfo.w, 1.0e-3), 0.0, 0.0);
  vec2 n1 = uNearGrid.xy - 1.0;
  vec2 f = clamp(suv, 0.0, 1.0) * n1;
  vec2 i0 = min(floor(f), n1 - 1.0);
  vec2 t = f - i0;
  ivec2 c = ivec2(i0);
  float a = medNearTexel(c), b = medNearTexel(c + ivec2(1, 0));
  float e = medNearTexel(c + ivec2(0, 1)), d = medNearTexel(c + ivec2(1, 1));
  float sv = mix(mix(a, b, t.x), mix(e, d, t.x), t.y);
  vec2 g = vec2(mix(b - a, d - e, t.y), mix(e - a, d - b, t.x)) * n1 * uNearGrid.zw;
  return vec3(sv, g);
}
float waterNearS(vec2 suv) { return waterNearSGrad(suv).x; }
// Su çizgisine işaretli uzaklık (piksel; > 0 hava tarafı). Su çizgisinde değilse ±1e4.
float waterlineDistPx(vec2 suv) {
  if (uNearInfo.x < 1.5) return uNearInfo.x < 0.5 ? 1.0e4 : -1.0e4;
  vec3 sg = waterNearSGrad(suv);
  return sg.x / max(length(sg.yz), 1.0e-7);
}
`;

// Su gövdesi (GLSL_ENV ve GLSL_NEAR gerekir): su yüzeyi shader'ıyla aynı saçılma modeli.
const GLSL_MEDIUM_CORE = /* glsl */ `
uniform vec3 uMedCam;         // kamera konumu
uniform vec4 uMedFwd;         // kamera ileri yönü, yakın düzlem uzaklığı
uniform vec3 uMedWaterColor;
uniform vec3 uMedSigma;       // σt = soğurma + bulanıklık (1/m)
uniform vec3 uMedKd;          // derinlikle kararma (0 = sabit su gövdesi rengi)
uniform float uMedLevel;      // su seviyesi
uniform sampler2D uMedConst;  // 1x1: suyun kendi saçtığı ışık (karede bir kez hesaplanır)
uniform float uMedConstOn;    // 1: uMedConst geçerli, 0: gökyüzü dokusundan hesapla
uniform vec4 uMedFlash;       // su altı patlama flaşı: konum xyz, şiddet (0 = yok)
uniform float uMedFlashS;     // suyun saçılma katsayısı (1/m), flaş parıltısı için
// Noktasal flaşın su içinde bir ışın boyunca saçtığı ışık: tek saçılma, ışın üzerindeki en yakın
// noktadan uzaklık h ile ∫ dt / (h² + t²) kapalı formu (atan); zayıflama en yakın noktadan yaklaşık.
vec3 flashGlow(vec3 o, vec3 dir, float dist) {
  if (uMedFlash.w <= 0.0) return vec3(0.0);
  vec3 Lv = uMedFlash.xyz - o;
  float t0 = dot(Lv, dir);
  float h = max(length(Lv - dir * t0), 0.25);
  float a = atan((dist - t0) / h) + atan(t0 / h);
  float tm = clamp(t0, 0.0, dist);
  vec3 att = exp(-uMedSigma * (tm + distance(uMedFlash.xyz, o + dir * tm)));
  return vec3(1.0, 0.82, 0.6) * (uMedFlash.w * uMedFlashS * a / (12.566 * h)) * att;
}
// Flaşın bir noktaya düşen ışınımı (ters kare + soğurma)
vec3 flashIrradiance(vec3 p) {
  if (uMedFlash.w <= 0.0) return vec3(0.0);
  float r = max(distance(p, uMedFlash.xyz), 0.5);
  return vec3(1.0, 0.82, 0.6) * (uMedFlash.w / (r * r)) * exp(-uMedSigma * r);
}
// Gök yarıküresinin ortalaması (su köşe shader'ındaki vHemi ile aynı formül)
vec3 medHemi() {
  float topLod = max(uEnvMaxLod - 1.0, 0.0);
  return 0.4 * envLod(vec3(0.0, 1.0, 0.0), topLod) + 0.15 * (
    envLod(vec3(0.94, 0.34, 0.0), topLod) + envLod(vec3(-0.94, 0.34, 0.0), topLod) +
    envLod(vec3(0.0, 0.34, 0.94), topLod) + envLod(vec3(0.0, 0.34, -0.94), topLod));
}
// Suyun kendi saçtığı ışık (su yüzeyi shader'ındaki inscatter ile aynı)
vec3 medInscatterEnv() {
  return uMedWaterColor * (medHemi() * 1.6 + uSunColor * 3.14159265 * max(uSunDir.y, 0.0) * 0.8);
}
vec3 medInscatter() {
  return uMedConstOn > 0.5 ? texelFetch(uMedConst, ivec2(0), 0).rgb : medInscatterEnv();
}
// Su içinde bir ışın parçası: col, dist metre ötede; depth0 başlangıç derinliği, dir ışın yönü.
// Tek saçılmanın kapalı formu (Kd = 0 iken mix(S, col, exp(-σ·dist)) ile aynı).
vec3 waterSegmentS(vec3 col, float depth0, vec3 dir, float dist, vec3 S) {
  // Su içindeki ışık alanı yöne bağlı: S yukarıdan görülen (aşağı bakan) parlaklıktır;
  // yatay ve yukarı bakışta parlaklık artar, kırılan güneşe doğru öne saçılma parıltısı oluşur.
  // Yukarıdan bakışta (ışın aşağı) neredeyse değişmez.
  float q = dir.y * 0.5 + 0.5;
  vec3 rs = refract(-uSunDir, vec3(0.0, 1.0, 0.0), 0.75);
  S = S * (1.0 + 4.0 * q * q) + uMedWaterColor * uSunColor * (2.5 * max(uSunDir.y, 0.0) * pow(max(dot(dir, -rs), 0.0), 8.0));
  vec3 T = exp(-uMedSigma * dist);
  vec3 kA = max(uMedSigma - uMedKd * dir.y, vec3(1.0e-4));
  vec3 ins = S * exp(-uMedKd * max(depth0, 0.0)) * uMedSigma * (1.0 - exp(-kA * dist)) / kA;
  return col * T + ins;
}
vec3 waterSegment(vec3 col, float depth0, vec3 dir, float dist) {
  return waterSegmentS(col, depth0, dir, dist, medInscatter());
}
// Yukarıdan bakış (kırılan ışın aşağı, yön çarpanı ≈ 1): ucuz yol, Kd = 0 iken eski formül
vec3 waterSegmentDown(vec3 col, float dist, vec3 S) {
  vec3 T = exp(-uMedSigma * dist);
  if (uMedKd.x + uMedKd.y + uMedKd.z <= 0.0) return col * T + S * (1.0 - T);
  vec3 kA = uMedSigma + 0.8 * uMedKd;
  return col * T + S * uMedSigma * (1.0 - exp(-kA * dist)) / kA;
}
`;

// Oyunun sahne shader'ları için (GLSL_ENV + GLSL_NEAR + GLSL_MEDIUM_CORE gerekir)
const GLSL_MEDIUM_SCENE = /* glsl */ `
uniform sampler2D uMedNoise;  // water.noiseTexture
uniform vec4 uMedCaustics;    // güç, 1/ölçek, zaman, etkin (1 = sahne su altı ışığını kendisi uygular)
uniform float uMedWaveH;      // dalga çukuru payı (m): ortalama seviyenin bu kadar altına kadar hava sayılabilir
#ifdef WATER_AIR
// Kamera havadayken derlenen hafif varyant (Intel iGPU'larda büyük shader yavaşlar):
// oyun iki program derleyip water.medium.mode === 'air' ise bunu kullanır.
vec3 underwaterLight(vec3 col, vec3 p) { return col; }
vec3 underwaterLight(vec3 col, vec3 p, vec3 N, vec3 alb) { return col; }
vec3 applyMedium(vec3 col, vec3 worldPos) {
  vec3 V = worldPos - uMedCam;
  float d = length(V);
  return applyFog(col, V / max(d, 1.0e-6), d);
}
#else
// Kırılan güneşin derinlikle zayıflaması + kostik (below: yüzeyin altındaki derinlik, > 0)
vec3 underwaterSun(vec3 col, vec3 p, float below) {
  vec3 rs = refract(-uSunDir, vec3(0.0, 1.0, 0.0), 0.75);
  float sunY = max(-rs.y, 0.1);
  vec3 sunT = exp(-uMedSigma * (below / sunY));
  if (sunT.r + sunT.g + sunT.b < 0.003) return col * sunT;
  vec2 cp = p.xz - rs.xz * (below / sunY);
  float t = uMedCaustics.z;
  float c1 = texture(uMedNoise, cp * uMedCaustics.y + t * vec2(0.021, 0.013)).b;
  float c2 = texture(uMedNoise, cp * uMedCaustics.y * 1.37 + vec2(0.41, 0.73) - t * vec2(0.016, 0.024)).b;
  float caus = min(c1, c2) * uMedCaustics.x * smoothstep(0.02, 0.5, below) / (1.0 + below * 0.25);
  col *= 1.0 + caus * 3.0 * clamp(dot(uSunColor, vec3(0.3, 0.5, 0.2)), 0.0, 2.0);
  return col * sunT;
}
// Su altındaki yüzeyler: kırılan güneş + kostik + patlama flaşı. Water seçeneği sceneLit: true
// ise, kamera suya girince/su çizgisindeyken bunu sahne yapar ve su yüzeyi shader'ı yapmaz;
// kamera havadayken su yüzeyi yukarıdan bakışta kendisi yapar (ucuz yol).
// Bu biçimde flaş yüzeyin yönünden ve renginden bağımsız eklenir; normal ve renk verilebiliyorsa
// alttaki biçim daha doğrudur.
vec3 underwaterLight(vec3 col, vec3 p) {
  float below = uMedLevel - uMedWaveH - p.y;
  if (uMedCaustics.w < 0.5 || below <= 0.0) return col;
  return underwaterSun(col, p, below) + 0.25 * flashIrradiance(p);
}
// N: yüzey normali, alb: yüzey rengi (yansıtma); flaş Lambert ile: alb/π · E · cosθ
vec3 underwaterLight(vec3 col, vec3 p, vec3 N, vec3 alb) {
  float below = uMedLevel - uMedWaveH - p.y;
  if (uMedCaustics.w < 0.5 || below <= 0.0) return col;
  vec3 fl = vec3(0.0);
  if (uMedFlash.w > 0.0) fl = alb * (0.3183 * max(dot(N, normalize(uMedFlash.xyz - p)), 0.0)) * flashIrradiance(p);
  return underwaterSun(col, p, below) + fl;
}
// applyFog yerine: kamera ışını yakın düzlemden itibaren havadaysa mesafe sisi, sudaysa
// su içinden geçiş. Su çizgisinde ~1.5 piksellik yumuşak geçiş.
vec3 applyMedium(vec3 col, vec3 worldPos) {
  vec3 V = worldPos - uMedCam;
  float d = length(V);
  vec3 dir = V / max(d, 1.0e-6);
  if (uNearInfo.x < 0.5) return applyFog(col, dir, d);
  vec3 sg = waterNearSGrad(gl_FragCoord.xy * uNearGrid.zw);
  float sd = uNearInfo.x < 1.5 ? -1.0e4 : sg.x / max(length(sg.yz), 1.0e-7);
  vec3 air = vec3(0.0), wat = vec3(0.0);
  if (sd > -0.75) air = applyFog(col, dir, d);
  if (sd < 0.75) {
    // su çizgisindeyken su yakın düzlemde başlar; kamera tamamen sudaysa kameradan
    float t0 = uNearInfo.x > 1.5 ? uMedFwd.w / max(dot(dir, uMedFwd.xyz), 1.0e-3) : 0.0;
    wat = waterSegment(col, max(-sg.x, 0.0), dir, max(d - t0, 0.0)) + flashGlow(uMedCam + dir * t0, dir, max(d - t0, 0.0));
  }
  return mix(wat, air, smoothstep(-0.75, 0.75, sd));
}
#endif
`;

// Lens gürültüsü (lens son işlemesi ve film geçişi). Tamsayı hash: sin tabanlı hash bazı
// derleyicilerde komşu hücrelerde farklı yuvarlanıp basamak yapar; içeren shader'ın varsayılan
// hassasiyetinden bağımsız olsun diye highp.
const GLSL_LENS_NOISE = /* glsl */ `
float lensHash(highp vec2 p) {
  highp uvec2 q = uvec2(ivec2(p) + 32768);
  highp uint h = (q.x * 1597334677u) ^ (q.y * 3812015801u);
  h = (h ^ (h >> 16)) * 0x7feb352du;
  h ^= h >> 15;
  return float(h >> 8) * (1.0 / 16777216.0);
}
float lensNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lensHash(i), lensHash(i + vec2(1.0, 0.0)), f.x),
             mix(lensHash(i + vec2(0.0, 1.0)), lensHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// Lense sıçrayan su (son işleme geçişi için, GLSL_NEAR'dan sonra): damlalar küçük, ters çeviren
// mercekler; süzülen su filmi aşağı akan çizgili, hafif bulanık bir tabaka. Yalnızca lensin havadaki
// kısmında: su çizgisinin altında damla ve film suya karışır. bindLens() ile beslenir.
const GLSL_LENS = /* glsl */ `
uniform sampler2D uLensMap;   // R: damla yüksekliği / uLensInfo.z (ekran yüksekliği birimi), G: su filmi (0..1)
uniform vec4 uLensInfo;       // en kalın film, zaman, yükseklik ölçeği, etkin
uniform vec4 uLensDown;       // xy: ekranda yerçekimi yönü, z: en/boy oranı
struct WaterLens {
  vec2 offset;   // sahne dokusunu okurken uv'ye eklenecek kayma
  vec2 blur;     // bulanıklık yarıçapı (uv)
  float shade;   // renk çarpanı (damla kenarında koyu halka, film kenarı)
  float glint;   // eklenecek parıltı (ton eşlenmiş renk biriminde)
};
${GLSL_LENS_NOISE}
WaterLens waterLens(vec2 uv) {
  WaterLens o = WaterLens(vec2(0.0), vec2(0.0), 1.0, 0.0);
  if (uLensInfo.w < 0.5) return o;
  vec2 hf = textureLod(uLensMap, uv, 0.0).rg;   // türevsiz okumalar: dallar düzleşmesin
  float h = hf.r * uLensInfo.z;
  float film = hf.g;   // film kalınlığı (sınır gürültüsü film geçişinde eklendi)
  if (h <= 1.0e-5 && (uLensInfo.x <= 0.0 || film <= 0.002)) return o;   // kuru piksel
  // su çizgisindeyken lensin suyun içinde kalan kısmında cam ıslak ama görünmez
  float air = smoothstep(-1.0, 1.0, waterlineDistPx(uv));
  if (air <= 0.0) return o;
  float asp = uLensDown.z;
  vec2 px = 1.0 / vec2(textureSize(uLensMap, 0));
  if (h > 1.0e-5) {
    float hx = textureLod(uLensMap, uv + vec2(px.x, 0.0), 0.0).r - textureLod(uLensMap, uv - vec2(px.x, 0.0), 0.0).r;
    float hy = textureLod(uLensMap, uv + vec2(0.0, px.y), 0.0).r - textureLod(uLensMap, uv - vec2(0.0, px.y), 0.0).r;
    // eğim (yükseklik ve uzunluk ekran yüksekliği biriminde)
    vec2 g = vec2(hx / (2.0 * px.x * asp), hy / (2.0 * px.y)) * uLensInfo.z;
    float s = length(g);
    // kubbe h = r·√(1−d²)/2 için merkeze uzaklık r·d = 4·h·|∇h|: damla çevresini 2.5 kat
    // geniş açıyla ters çevrilmiş gösterir (küçük bir balık gözü mercek)
    vec2 toC = g * (4.0 * h * 3.5);
    o.offset = vec2(toC.x / asp, toC.y);
    o.blur = vec2(0.0012 / asp, 0.0012);
    o.shade = 1.0 - 0.5 * smoothstep(0.6, 1.8, s);
    vec3 n = normalize(vec3(-g * 1.5, 1.0));
    o.glint = 0.5 * pow(max(dot(n, vec3(-0.42, 0.55, 0.72)), 0.0), 90.0);
  }
  if (uLensInfo.x > 0.0 && film > 0.002) {
    vec2 sp = (uv - 0.5) * vec2(asp, 1.0);
    vec2 dn = uLensDown.xy, tn = vec2(-dn.y, dn.x);
    float gy = 0.5 - dot(sp, dn);   // yerçekimine göre yükseklik (0 alt, 1 üst)
    float gx = dot(sp, tn);
    float t = uLensInfo.y;
    // film üstten çekilir: kalın film ekranın üstüne kadar, incelen film yalnızca altta
    float e = film * 1.25 - 0.1 - gy;
    float m = smoothstep(0.0, 0.05, e);
    if (m > 0.0) {
      // aşağı akan su yolları: akış yönünde uzamış gürültü
      float r1 = lensNoise(vec2(gx * 48.0, gy * 2.5 + t * 1.1));
      float r2 = lensNoise(vec2(gx * 21.0 + 7.3, gy * 1.4 + t * 0.7));
      vec2 w = vec2(r1 - 0.5, (r2 - 0.5) * 0.5) * (0.014 * m * min(film * 2.0, 1.0));
      vec2 ws = tn * w.x - dn * w.y;
      o.offset += vec2(ws.x / asp, ws.y);
      o.blur = max(o.blur, vec2(0.004 / asp, 0.004) * m);
      o.shade *= 1.0 - 0.06 * m;
    }
    // film kenarındaki ince çizgi (menisküs)
    o.shade *= 1.0 - 0.25 * exp(-e * e * 4.0e4);
    o.glint += 0.2 * exp(-(e - 0.006) * (e - 0.006) * 1.0e5);
  }
  o.offset *= air;
  o.blur *= air;
  o.shade = mix(1.0, o.shade, air);
  o.glint *= air;
  return o;
}
`;

export const WaterGLSL = {
  environment: GLSL_ENV,
  // son işleme geçişleri için: su çizgisi testi (waterNearSGrad, waterlineDistPx)
  near: GLSL_NEAR,
  // sahne shader'ları için (environment'tan sonra ekle): applyMedium, underwaterLight, waterSegment
  medium: GLSL_NEAR + GLSL_MEDIUM_CORE + GLSL_MEDIUM_SCENE,
  // son işleme geçişi için (near'dan sonra ekle): lense sıçrayan su (waterLens(uv) → kayma,
  // bulanıklık, gölge, parıltı)
  lens: GLSL_LENS,
};

/**
 * WaterGLSL.medium / near uniform'larını atar (Water.updateNear() ile hesaplanmış durum).
 * unit, unit+1 ve unit+2 doku birimlerini kullanır (varsayılan 13-15). opts: { width, height, forceAir, cameraPos }
 *   width/height: çizilen hedefin boyutu; forceAir: yansıma gibi kamera dışı geçişler için.
 */
export function bindMedium(gl, u, water, unit = 13, opts = {}) {
  water._bindMediumUniforms(u, unit, opts);
}

/**
 * WaterGLSL.lens uniform'larını atar (Water.updateNear() ile güncellenen damlalar).
 * unit doku birimini kullanır (varsayılan 12).
 */
export function bindLens(gl, u, water, unit = 12) {
  water._bindLensUniforms(u, unit);
}

/**
 * GLSL_ENV uniform'larını atar. `u` createProgram()'ın döndürdüğü konumlardır.
 * env: { envMap, envScale, envMaxLod, sunDirection, sunColor, fogDensity, exposure }
 */
export function bindEnvironment(gl, u, env, unit = 2) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, env.envMap);
  if (u.uEnv) gl.uniform1i(u.uEnv, unit);
  if (u.uEnvScale) gl.uniform1f(u.uEnvScale, env.envScale);
  if (u.uEnvMaxLod) gl.uniform1f(u.uEnvMaxLod, env.envMaxLod);
  if (u.uSunDir) gl.uniform3fv(u.uSunDir, env.sunDirection);
  if (u.uSunColor) gl.uniform3fv(u.uSunColor, env.sunColor);
  if (u.uFogDensity) gl.uniform1f(u.uFogDensity, env.fogDensity);
  if (u.uExposure) gl.uniform1f(u.uExposure, env.exposure ?? 1);
}

const FULLSCREEN_VS = /* glsl */ `
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Detay dokusu: her karede küçük dalgalar iki dokuya toplanır.
//   çıktı 0: RG = A katmanının eğimi (büyük yama), BA = B katmanının eğimi (küçük yama)
//   çıktı 1: A katmanının yüksekliği (R), yatay "choppy" kayması (GB) ve sıkışması (A, Jacobian izi)
// İkinci doku köşe shader'ında okunur: küçük dalgalar da gerçek 3B geometri olur.
const DETAIL_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out vec4 outSlope;
layout(location = 1) out vec4 outDisp;
uniform vec4 uWaves[DMAX * 2];   // 2πm, 2πn, faz, a/P
uniform int uCountA;
uniform int uCountB;
uniform vec4 uEncScale;
uniform float uEncBias;
uniform vec2 uPatchChop;         // A yaması (m), A choppiness
uniform vec4 uDispEnc;           // yükseklik, kayma, sıkışma ölçekleri (RGBA8 için)
void main() {
  vec2 sa = vec2(0.0), sb = vec2(0.0), d = vec2(0.0);
  float h = 0.0, tr = 0.0;
  for (int i = 0; i < DMAX; i++) {
    if (i >= uCountA) break;
    vec4 w = uWaves[i];
    float th = dot(w.xy, vUv) + w.z;
    float c = cos(th), s = sin(th);
    float len = length(w.xy);
    sa += w.xy * (w.w * c);
    h += w.w * s;
    d += w.xy * (w.w * c / len);
    tr -= w.w * len * s;
  }
  for (int i = 0; i < DMAX; i++) {
    if (i >= uCountB) break;
    vec4 w = uWaves[DMAX + i];
    sb += w.xy * (w.w * cos(dot(w.xy, vUv) + w.z));
  }
  outSlope = vec4(sa, sb) * uEncScale + uEncBias;
  vec4 disp = vec4(h * uPatchChop.x, d * (uPatchChop.x * uPatchChop.y), tr * uPatchChop.y);
  outDisp = disp * uDispEnc.xyyz + uEncBias;
}`;

// Bir kez üretilen döşenebilir gürültü dokusu:
// R = köpük deseni, G = geniş maske, B = kostik ağı, A = genel gürültü.
const NOISE_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
float hash1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
float vnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash1(mod(i, per)), b = hash1(mod(i + vec2(1.0, 0.0), per));
  float c = hash1(mod(i + vec2(0.0, 1.0), per)), d = hash1(mod(i + vec2(1.0, 1.0), per));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, float per, int oct) {
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * vnoise(p, per);
    n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / n;
}
vec2 worley(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + hash2(mod(i + g, per)) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
// "İsviçre peyniri" köpük: köpük malzemesinde 1, kabarcıkların içinde 0 (kabarcık başına yarıçap)
float bubbleHoles(vec2 uv, float per, float salt, float rmin, float rmax) {
  vec2 w = vec2(fbm(uv * per * 0.5, per * 0.5, 3), fbm(uv * per * 0.5 + 17.0, per * 0.5, 3)) - 0.5;
  vec2 p = uv * per + w * 1.8;
  vec2 ip = floor(p), fp = fract(p);
  float v = 9.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 cell = mod(ip + o, per);
    vec2 hh = hash2(cell + salt);
    float rad = mix(rmin, rmax, hash1(cell + salt + 7.0));
    v = min(v, length(o + hh * 0.9 + 0.05 - fp) / rad);
  }
  return smoothstep(0.8, 1.25, v);
}

void main() {
  vec2 uv = vUv;
  vec2 warp = vec2(fbm(uv * 4.0, 4.0, 3), fbm(uv * 4.0 + 7.3, 4.0, 3)) - 0.5;
  // köpük: yırtık delikli büyük tabakalar + küçük yuvarlak kabarcıklar + yoğunluk
  vec2 wA = vec2(fbm(uv * 5.0, 5.0, 3), fbm(uv * 5.0 + vec2(3.7, 9.1), 5.0, 3)) * 2.0 - 1.0;
  float m1 = smoothstep(-0.14, 0.06, fbm(uv * 10.0 + wA * 1.4, 10.0, 5) * 2.0 - 1.0);
  vec2 wB = vec2(fbm(uv * 12.0 + 1.3, 12.0, 2), fbm(uv * 12.0 + 7.9, 12.0, 2)) * 2.0 - 1.0;
  float m2 = smoothstep(-0.16, 0.04, fbm(uv * 27.0 + wB * 0.9, 27.0, 4) * 2.0 - 1.0);
  float b3 = bubbleHoles(uv, 29.0, 37.0, 0.06, 0.45);
  float dens = fbm(uv * 4.0, 4.0, 5);
  float big = m1 * (0.55 + 0.45 * m2) * (0.75 + 0.25 * b3);
  float foam = clamp(big * 0.6 + dens * 0.4, 0.0, 1.0);
  float mask = fbm(uv * 3.0, 3.0, 5);
  // kostik: bükülmüş Worley hücre kenarları
  vec2 cw = worley(uv * 7.0 + warp * 1.2, 7.0);
  float e = cw.y - cw.x;
  float caus = exp(-e * e * 28.0);
  float n2 = fbm(uv * 8.0, 8.0, 5);
  fragColor = vec4(foam, mask, caus, n2);
}`;

// Yağmur halkaları: döşenebilir küçük doku, her karede (yalnızca yağarken) hesaplanır.
// Her hücrede iki damla; her döngüde rastgele yerde, yağmur şiddeti kadar olasılıkla düşer.
const RAIN_FS = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform float uTime;
uniform float uRain;
const float CELLS = 10.0;
vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}
void main() {
  vec2 p = vUv * CELLS;
  vec2 cell = floor(p);
  vec2 s = vec2(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 c = cell + vec2(float(x), float(y));
    vec2 cw = mod(c, CELLS);
    for (int k = 0; k < 2; k++) {
      vec3 h = hash3(cw + float(k) * 17.17);
      float cyc = uTime * (0.9 + 0.5 * h.z) + h.x * 7.0;
      float age = fract(cyc);
      float id = floor(cyc);
      vec3 r = hash3(cw + vec2(id * 0.137, float(k) * 3.1));
      float on = step(r.z, uRain);
      vec2 d = p - (c + 0.15 + 0.7 * r.xy);
      float len = length(d);
      float xr = (len - age) * 7.0;          // halka yarıçapı en fazla 1 hücre
      float env = on * (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.06, age);
      s += d / max(len, 1.0e-4) * (cos(xr * 4.0) * exp(-xr * xr) * env);
    }
  }
  fragColor = vec4(s * 0.4 + 0.5, 0.5, 1.0);
}`;

// ---------------------------------------------------------------------------
// Su yüzeyi shader'ları
// ---------------------------------------------------------------------------
// Ortak dalga fonksiyonu: köşe shader'ı ve su çizgisi testi (NEAR_FS) aynı metni derler.
// Böylece ekranda çizilen yüzey ile analitik test hiçbir zaman ayrışmaz; yüzeye eklenen
// her yer değiştirme (ör. patlama) yalnızca burada tanımlanır.
const GLSL_WAVES = /* glsl */ `
uniform vec4 uWaveA[MAXV];   // yön.x, yön.z, k, faz
uniform vec4 uWaveB[MAXV];   // genlik, yatay genlik, -, -
uniform int uWaveCount;
uniform vec2 uLod;           // en küçük ızgara aralığı, mesafe başına aralık
uniform float uBreakK;       // 0.4 / toplam genlik: sığ suda dalga yüksekliği ≤ ~0.8·derinlik
uniform vec2 uFlow;
uniform float uTime;
#ifdef DEPTHMAP
uniform sampler2D uDepthMap;
uniform vec4 uDepthRect;     // minX, minZ, 1/boyutX, 1/boyutZ
uniform vec2 uDepthDecode;   // zemin yüksekliği = doku * x + y
#endif
#ifdef FLOWMAP
uniform sampler2D uFlowMap;
uniform vec4 uFlowRect;
uniform vec2 uFlowDecode;
#endif
#ifdef DETAIL_DISP
uniform sampler2D uDetailDisp;
uniform vec4 uDetailParams;  // 1/PA, 1/PB, doku çözünürlüğü, 1/oktav
uniform vec4 uDispDecode;    // 1/yükseklik, 1/kayma, 1/sıkışma ölçeği, ofset
uniform float uDetailJVar;   // A katmanı sıkışmasının varyansı
uniform float uFlowCycle;
const mat2 ROT_A = mat2(0.6216, 0.7833, -0.7833, 0.6216);
vec4 dispTap(vec2 uv, float lod) {
  return (textureLod(uDetailDisp, uv, lod) + uDispDecode.w) * uDispDecode.xyyz;
}
// döndürülmüş/ölçeklenmiş kopya: parça shader'ındaki eğimlerle aynı yüzey (1/0.71 genlik telafisi)
vec4 dispTapRot(vec2 ua, float lod) {
  vec4 d = dispTap(ROT_A * ua * 0.71 + vec2(0.31, 0.17), lod - 0.5);
  d.xyz *= 1.4085;
  d.yz = d.yz * ROT_A;
  return d;
}
#endif

// Izgara aralığına göre çok kısa dalgaları sönümle (titreme olmasın)
float waveFade(float k, float spacing) {
  return 1.0 - smoothstep(0.16, 0.33, spacing * k * 0.1591549);
}

#ifdef EXPLOSIONS
uniform vec4 uExplA[4];      // x, z, yaş (s), R (m)
uniform vec4 uExplB[4];      // kubbe yüksekliği (m), krater derinliği (m), açılma zamanı (s), genel sönüm
uniform int uExplCount;
// Su altı patlamasının yüzeyi (yalnızca dikey; ağ katlanmaz): önce kubbe kabarır, gaz yüzeyi
// delince kratere döner, krater salınarak söner. Krater, derin su Cauchy-Poisson çözümüyle
// (durağan faz) dışa yayılan halkalar üretir: uzun hızlı dalgalar önde, kısalar arkada.
// Döner: (yükseklik, ∂/∂x, ∂/∂z)
vec3 blastField(vec2 p, float spacing) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    if (i >= uExplCount) break;
    vec4 A = uExplA[i];
    vec4 Bv = uExplB[i];
    vec2 dv = p - A.xy;
    float r = length(dv) + 1.0e-3;
    float R = A.w, t = A.z, tv = Bv.z;
    float tc = max(t - tv, 0.0);
    // yakın alan: kubbe → krater (Gauss biçimli)
    // ızgara aralığına göre genişletilmiş Gauss (hacim korunur): seyrek ızgarada tepe kaybolmaz,
    // CPU ikiziyle aynı yüzey
    float Re2 = R * R + 0.36 * spacing * spacing;
    float g2 = exp(-r * r / Re2) * (R * R / Re2);
    float dome = Bv.x * (t < tv ? smoothstep(0.0, tv, t) : exp(-pow((t - tv) / 0.35, 2.0)));
    float wc = sqrt(9.81 / R);
    float crater = -Bv.y * smoothstep(0.0, 0.3, tc) * cos(wc * tc * 0.9) * exp(-tc * wc * 0.25);
    float e = (dome + crater) * g2 * Bv.w;
    float de = e * (-2.0 * r / Re2);
    // uzak alan halkaları
    if (tc > 0.0 && r > 1.2 * R) {
      float k = 9.81 * tc * tc / (4.0 * r * r);
      float th = 9.81 * tc * tc / (4.0 * r);
      float amp = Bv.y * R * R * 9.81 * tc * tc / (5.657 * r * r * r) * exp(-pow(k * R * 0.5, 2.0));
      amp *= waveFade(k, spacing) * smoothstep(1.2 * R, 2.5 * R, r) * Bv.w;
      e -= amp * cos(th);
      de -= amp * k * sin(th);
    }
    o += vec3(e, de * dv / r);
  }
  return o;
}
#endif

struct WaveOut {
  vec3 disp;         // yer değiştirme (yatay + dikey)
  vec3 T;            // ∂(dünya)/∂x
  vec3 B;            // ∂(dünya)/∂z
  float detailTr;    // detay katmanının sıkışma izi (yaklaşık J katkısı)
  float varJ;        // görünen dalgaların J varyansı
  float waterDepth;  // zemine kadar derinlik (derinlik haritası yoksa çok büyük)
  vec3 flow;         // akış (xy) + akış haritasındaki köpük (z)
};

// grid: ızgara noktası (y = su seviyesi), spacing: o noktadaki ızgara aralığı
WaveOut waterWaves(vec3 grid, vec2 aFlow, float spacing) {
  WaveOut o;
  o.waterDepth = 1.0e4;
#ifdef DEPTHMAP
  vec2 duv = (grid.xz - uDepthRect.xy) * uDepthRect.zw;
  if (duv == clamp(duv, 0.0, 1.0)) {
    o.waterDepth = max(grid.y - (textureLod(uDepthMap, duv, 0.0).r * uDepthDecode.x + uDepthDecode.y), 0.0);
  }
#endif
  vec3 flow = vec3(uFlow + aFlow, 0.0);
#ifdef FLOWMAP
  vec2 fuv = (grid.xz - uFlowRect.xy) * uFlowRect.zw;
  if (fuv == clamp(fuv, 0.0, 1.0)) {
    vec4 fm = textureLod(uFlowMap, fuv, 0.0);
    flow.xy += fm.xy * uFlowDecode.x + uFlowDecode.y;
    flow.z = fm.z;
  }
#endif
  o.flow = flow;
  vec3 disp = vec3(0.0);
  vec3 T = vec3(1.0, 0.0, 0.0);
  vec3 B = vec3(0.0, 0.0, 1.0);
  float varJ = 0.0;
  // sığ suda dalgalar kırılma sınırına göre küçülür (kıyıda düzleşir)
  float shallow = clamp(o.waterDepth * uBreakK, 0.0, 1.0);
  for (int i = 0; i < MAXV; i++) {
    if (i >= uWaveCount) break;
    vec4 wa = uWaveA[i];
    vec4 wb = uWaveB[i];
    float f = waveFade(wa.z, spacing) * shallow;
    if (f <= 0.0) continue;
    float a = wb.x * f;
    float c = wb.y * f;
    float th = wa.z * dot(wa.xy, grid.xz) + wa.w;
    float s = sin(th);
    float co = cos(th);
    disp += vec3(c * wa.x * co, a * s, c * wa.y * co);
    float ka = wa.z * a * co;
    float kc = wa.z * c * s;
    T += vec3(-kc * wa.x * wa.x, ka * wa.x, -kc * wa.x * wa.y);
    B += vec3(-kc * wa.x * wa.y, ka * wa.y, -kc * wa.y * wa.y);
    varJ += 0.5 * (wa.z * c) * (wa.z * c);
  }
#ifdef EXPLOSIONS
  vec3 bf = blastField(grid.xz, spacing);
  disp.y += bf.x;
  T.y += bf.y;
  B.y += bf.z;
#endif
  o.detailTr = 0.0;
#ifdef DETAIL_DISP
  // Küçük dalgaların geometrisi (detay dokusunun A katmanı). Izgara aralığından kısa
  // dalgalar mip seviyesiyle süzülür, böylece kamera hareket ederken titreme olmaz.
  float lodD = log2(max(spacing * uDetailParams.x * uDetailParams.z, 1.0e-3)) + 1.0;
  float fadeD = (1.0 - smoothstep(log2(uDetailParams.z) - 2.0, log2(uDetailParams.z) - 1.0, lodD)) * shallow;
  if (fadeD > 0.0) {
#ifdef FLOW_VARYING
    float ph0 = fract(uTime / uFlowCycle);
    float ph1 = fract(ph0 + 0.5);
    float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
    float w1 = 1.0 - w0;
    vec4 dd = (dispTap((grid.xz - flow.xy * (ph0 * uFlowCycle)) * uDetailParams.x, lodD) * w0
             + dispTapRot((grid.xz - flow.xy * (ph1 * uFlowCycle) - vec2(3.7, 1.3)) * uDetailParams.x, lodD) * w1)
             * inversesqrt(w0 * w0 + w1 * w1);
#else
    vec2 uf = (grid.xz - flow.xy * uTime) * uDetailParams.x;
    vec4 dd = (dispTap(uf, lodD) + dispTapRot(uf, lodD)) * 0.7071;
#endif
    dd *= fadeD;
    disp += vec3(dd.y, dd.x, dd.z);
    o.detailTr = dd.w;
    // mip ile süzülen kısa dalgaların sıkışması da kaybolur (oktav başına eşit pay)
    varJ += uDetailJVar * fadeD * fadeD * (1.0 - clamp((lodD - 0.5) * uDetailParams.w, 0.0, 1.0));
  }
#endif
  o.disp = disp;
  o.T = T;
  o.B = B;
  o.varJ = varJ;
  return o;
}
`;

const WATER_VS = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aFlow;

uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform vec3 uOrigin;
uniform float uHsInv;
uniform samplerCube uEnv;
uniform float uEnvScale;
uniform float uEnvMaxLod;
${GLSL_WAVES}

out vec3 vWorld;
out vec3 vGrid;
out vec3 vNormal;
out float vJacobian;
out float vSigmaJ;
out float vHeight;
out float vWaterDepth;
out vec3 vFlow;
out vec3 vAmbient;   // gökyüzü ortam ışığı (her yerde aynı; piksel başına okumaya gerek yok)
out vec3 vHemi;      // üst yarıkürenin ortalama parlaklığı (ufuk bandı dahil): su gövdesi ve köpük için
out vec3 vFogColor;  // bakış yönündeki ufuk rengi (yavaş değişir)

void main() {
  vec3 grid = aPosition + uOrigin;
  float spacing = max(uLod.x, length(grid - uCameraPos) * uLod.y);
  WaveOut w = waterWaves(grid, aFlow, spacing);
  vec3 world = grid + w.disp;
  vWorld = world;
  vGrid = grid;
  vNormal = normalize(cross(w.B, w.T));
  vJacobian = w.T.x * w.B.z - w.T.z * w.B.x + w.detailTr;   // < 1: yüzey sıkışıyor (tepe) → köpük
  vSigmaJ = sqrt(w.varJ);               // bu noktada görünen dalgaların J dağılımı
  vHeight = w.disp.y * uHsInv;
  vWaterDepth = w.waterDepth;
  vFlow = w.flow;
  float topLod = max(uEnvMaxLod - 1.0, 0.0);
  vAmbient = textureLod(uEnv, vec3(0.0, 1.0, 0.0), topLod).rgb * uEnvScale;
  vHemi = vAmbient * 0.4 + 0.15 * uEnvScale * (
      textureLod(uEnv, vec3(0.94, 0.34, 0.0), topLod).rgb + textureLod(uEnv, vec3(-0.94, 0.34, 0.0), topLod).rgb +
      textureLod(uEnv, vec3(0.0, 0.34, 0.94), topLod).rgb + textureLod(uEnv, vec3(0.0, 0.34, -0.94), topLod).rgb);
  vec3 vd = normalize(world - uCameraPos);
  vFogColor = textureLod(uEnv, normalize(vec3(vd.x, abs(vd.y) * 0.25 + 0.04, vd.z)), max(uEnvMaxLod - 3.0, 0.0)).rgb * uEnvScale;
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

const WATER_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_ENV}
${GLSL_NEAR}
${GLSL_MEDIUM_CORE}
in vec3 vWorld;
in vec3 vGrid;
in vec3 vNormal;
in float vJacobian;
in float vSigmaJ;
in float vHeight;
in float vWaterDepth;
in vec3 vFlow;
in vec3 vAmbient;
in vec3 vHemi;
in vec3 vFogColor;
out vec4 fragColor;

uniform vec3 uCameraPos;
uniform float uBreakK;
uniform mat4 uView;
uniform float uTime;
uniform vec4 uWaveA[MAXV];
uniform vec4 uWaveB[MAXV];
uniform int uWaveCount;
uniform vec2 uLod;
uniform sampler2D uDetail;
uniform vec4 uDetailParams;   // 1/PA, 1/PB, doku çözünürlüğü, 1/oktav
uniform vec2 uDetailVar;      // A ve B katmanlarının eğim varyansı
uniform vec3 uDetailCovA;     // A katmanı eğim kovaryansı (xx, zz, xz) — döndürülmüş kopya dahil
uniform vec3 uDetailCovB;     // B katmanı eğim kovaryansı
uniform vec3 uDetailDecode;   // A ölçeği, B ölçeği, ofset
uniform sampler2D uNoise;
uniform float uEnvSize;
uniform vec3 uWaterColor;
uniform vec3 uAbsorption;
uniform float uTurbidity;
uniform vec3 uSssColor;
uniform float uSss;
uniform float uRoughness;
uniform float uRefraction;
uniform float uEdgeSoftness;
uniform vec4 uFoam;           // dalga köpüğü yoğunluğu, şerit köpüğü, kıyı köpüğü, kıyı genişliği
uniform vec4 uFoam2;          // akış köpüğü, köpük ölçeği, şerit uzatma, -
uniform vec2 uGust;           // esinti yamalarında kısa dalga çarpanı (en az, en çok)
uniform vec3 uWhitecap;       // köpük eşikleri σ cinsinden (Jacobian, detay eğimi), 1/σJ (tüm dalgalar)
#ifdef RAIN
uniform sampler2D uRainTex;
uniform vec2 uRainParams;     // 1/karo boyutu, genlik
#endif
#ifdef FOAM_MAP
uniform sampler2D uFoamMap;     // yakın harita: R = köpük miktarı, G = tazelik
uniform vec3 uFoamMapRect;      // minX, minZ, 1/boyut
uniform sampler2D uFoamMapFar;  // uzak (kaba) harita
uniform vec3 uFoamMapFarRect;
#endif
uniform vec2 uWindDir;
uniform vec2 uCaustics;       // güç, 1/ölçek
uniform float uFlowCycle;
#if defined(SCENE) || defined(PLANAR)
uniform vec2 uScreenSize;
#endif
#ifdef SCENE
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform vec2 uProjZ;          // projeksiyon[10], projeksiyon[14]
uniform mat4 uInvViewProj;
#endif
#ifdef PLANAR
uniform sampler2D uReflection;
uniform float uReflectionDistort;
uniform mat4 uViewProj;
uniform float uPixelAngle;    // bir pikselin açısal boyutu (radyan)
#endif
#ifdef RIPPLES
uniform sampler2D uRipple;
uniform vec3 uRippleRect;     // minX, minZ, 1/boyut
#endif

const float PI = 3.14159265;
const mat2 ROT_A = mat2(0.6216, 0.7833, -0.7833, 0.6216);
const mat2 ROT_B = mat2(-0.4161, 0.9093, -0.9093, -0.4161);

float waveFade(float k, float spacing) {
  return 1.0 - smoothstep(0.16, 0.33, spacing * k * 0.1591549);
}

// Köşe shader'ının ızgarası yüzünden söndürülen ama ekranda hâlâ görülebilen
// dalgaların eğimi burada piksel başına hesaplanır. Pikselden küçük olanların eğimi
// kaybolmaz: yöne bağlı bir kovaryans olarak pürüzlülüğe eklenir (dalga, piksel
// izdüşümünün o yöndeki boyundan kısaysa) — LEAN haritalamanın ucuz analitik karşılığı.
vec2 analyticSlope(vec2 p, float spacing, vec2 fx, vec2 fy, inout vec3 lostCov) {
  vec2 sl = vec2(0.0);
  float shallow = clamp(vWaterDepth * uBreakK, 0.0, 1.0);
  for (int i = 0; i < MAXV; i++) {
    if (i >= uWaveCount) break;
    vec4 wa = uWaveA[i];
    float k = wa.z;
    float w = 1.0 - waveFade(k, spacing);
    if (w <= 0.001) continue;
    float a = uWaveB[i].x * shallow;
    float fpD = max(abs(dot(fx, wa.xy)), abs(dot(fy, wa.xy))) + 1.0e-5;   // izdüşümün dalga yönündeki boyu
    float fp = 1.0 - smoothstep(0.8, 1.6, fpD * k);
    lostCov += (w * (1.0 - fp) * 0.5 * a * a * k * k) * vec3(wa.x * wa.x, wa.y * wa.y, wa.x * wa.y);
    float wf = w * fp;
    if (wf <= 0.001) continue;
    sl += (wf * a * k * cos(k * dot(wa.xy, p) + wa.w)) * wa.xy;
  }
  return sl;
}

// Gauss eğim dağılımı için Smith maskeleme (kovaryanslı)
float lambdaSmith(vec3 w, vec3 cov) {
  float xz2 = max(dot(w.xz, w.xz), 1.0e-8);
  float il = inversesqrt(xz2);
  vec2 az = w.xz * il;
  float sig2 = az.x * az.x * cov.x + az.y * az.y * cov.y + 2.0 * az.x * az.y * cov.z;
  float a = max(w.y * il, 1.0e-3) / sqrt(2.0 * max(sig2, 1.0e-7));
  if (a >= 1.6) return 0.0;
  return (1.0 - 1.259 * a + 0.396 * a * a) / (3.535 * a + 2.181 * a * a);
}

// Dielektrik Fresnel (polarize olmayan); eta = n_geliş / n_iletim. Tam iç yansımada 1.
float fresnelDielectric(float cosI, float eta) {
  float sinT2 = eta * eta * (1.0 - cosI * cosI);
  if (sinT2 >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sinT2);
  float rs = (eta * cosI - cosT) / (eta * cosI + cosT);
  float rp = (cosI - eta * cosT) / (cosI + eta * cosT);
  return 0.5 * (rs * rs + rp * rp);
}

float fresnelWater(float c) {
  float x = 1.0 - clamp(c, 0.0, 1.0);
  float x2 = x * x;
  return 0.02 + 0.98 * x2 * x2 * x;
}

vec2 decA(vec2 v) { return (v + uDetailDecode.z) * uDetailDecode.x; }
vec2 decB(vec2 v) { return (v + uDetailDecode.z) * uDetailDecode.y; }

// A (uzun) ve B (kısa) katmanlarının eğimleri ayrı döner; B'ye rüzgar yaması uygulanır.
void detailSlopesFast(vec2 p, out vec2 sA, out vec2 sB) {
  sA = decA(texture(uDetail, p * uDetailParams.x).xy);
  sB = decB(texture(uDetail, p * uDetailParams.y).zw);
}

// Aynı katmanların döndürülmüş/ölçeklenmiş kopyası
void detailSlopesRot(vec2 p, out vec2 sA, out vec2 sB) {
  sA = decA(texture(uDetail, ROT_A * p * (uDetailParams.x * 0.71) + vec2(0.31, 0.17)).xy) * ROT_A;
  sB = decB(texture(uDetail, ROT_B * p * (uDetailParams.y * 0.71) + vec2(0.63, 0.29)).zw) * ROT_B;
}

// Normal + döndürülmüş kopya → döşeme tekrarı görünmez
void detailSlopes(vec2 p, out vec2 sA, out vec2 sB) {
  vec2 a0, b0, a1, b1;
  detailSlopesFast(p, a0, b0);
  detailSlopesRot(p, a1, b1);
  sA = (a0 + a1) * 0.7071;
  sB = (b0 + b1) * 0.7071;
}

float foamPattern(vec2 q0) {
  vec2 q = vec2(dot(q0, uWindDir), dot(q0, vec2(-uWindDir.y, uWindDir.x)));
  q.x /= 1.0 + uFoam2.z * 3.0;
  float t1 = texture(uNoise, q / uFoam2.y).r;
  float t2 = texture(uNoise, q / (uFoam2.y * 0.41) + 0.37).r;
  return t1 * 0.62 + t2 * 0.38;
}

#ifdef SCENE
vec3 depthToWorld(vec2 uv, float raw) {
  vec4 c = uInvViewProj * vec4(uv * 2.0 - 1.0, raw * 2.0 - 1.0, 1.0);
  return c.xyz / c.w;
}
float linearDepth(float raw) { return uProjZ.y / (raw * 2.0 - 1.0 + uProjZ.x); }
#endif

void main() {
  vec3 toCam = uCameraPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec2 p = vGrid.xz;
  vec2 fx = dFdx(p), fy = dFdy(p);
  float spacing = max(uLod.x, length(vGrid - uCameraPos) * uLod.y);
  vec3 lostCov = vec3(0.0);

  // --- normal: büyük dalgalar + analitik orta dalgalar + detay + halkalar ---
  vec3 gn = normalize(vNormal);
  vec2 slope = -gn.xz / max(gn.y, 0.15);
  slope += analyticSlope(p, spacing, fx, fy, lostCov);

  // rüzgar yamaları ("kedi pençesi"): kısa dalgacıkların güçlü ya da sakin olduğu, rüzgarla kayan bölgeler
  float gust = mix(uGust.x, uGust.y, smoothstep(0.3, 0.72, texture(uNoise, (p - uWindDir * (uTime * 2.5)) * 0.011).g));

  // detay dokusunun mip ile kaybettiği eğim: eksen başına (izdüşüm uzun ekseninde daha çok)
  vec2 fXZ = vec2(max(abs(fx.x), abs(fy.x)), max(abs(fx.y), abs(fy.y))) + 1.0e-5;
  vec2 kA = clamp((log2(fXZ * uDetailParams.x * uDetailParams.z) - 0.5) * uDetailParams.w, 0.0, 1.0);
  vec2 kB = clamp((log2(fXZ * uDetailParams.y * uDetailParams.z) - 0.5) * uDetailParams.w, 0.0, 1.0);
  vec3 lostA = uDetailCovA * vec3(kA, sqrt(kA.x * kA.y));
  // uzun dalgaların kaybı (Fresnel için): kısa B dalgacıkları yakında da çözülemez, onları sayma
  vec3 covF = lostCov + lostA;
  lostCov += lostA + uDetailCovB * (gust * gust) * vec3(kB, sqrt(kB.x * kB.y));

  vec2 flow = vFlow.xy;
  vec2 sA, sB;
#ifdef FLOW_VARYING
  // değişken akış: iki fazlı akış haritası (flow mapping)
  float ph0 = fract(uTime / uFlowCycle);
  float ph1 = fract(ph0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
  float w1 = 1.0 - w0;
  float wn = inversesqrt(w0 * w0 + w1 * w1);
  vec2 o0 = flow * (ph0 * uFlowCycle);
  vec2 o1 = flow * (ph1 * uFlowCycle) + vec2(3.7, 1.3);
  vec2 a0, b0, a1, b1;
  detailSlopesFast(p - o0, a0, b0);
  detailSlopesRot(p - o1, a1, b1);
  sA = (a0 * w0 + a1 * w1) * wn;
  sB = (b0 * w0 + b1 * w1) * wn;
#else
  vec2 o0 = flow * uTime;
  detailSlopes(p - o0, sA, sB);
#endif
  slope += sA + sB * gust;

#ifdef RAIN
  // yağmur halkaları: iki farklı ölçek/yönde örnekle (karo tekrarı görünmesin)
  vec2 rq = p * uRainParams.x;
  vec2 rs = (texture(uRainTex, rq).xy - 0.5) + (texture(uRainTex, ROT_A * rq * 1.37 + 0.5).xy - 0.5) * ROT_A;
  slope += rs * (2.5 * uRainParams.y);
#endif

#ifdef RIPPLES
  vec2 iq = (vWorld.xz - uRippleRect.xy) * uRippleRect.z;
  if (iq == clamp(iq, 0.0, 1.0)) {
    float re = smoothstep(0.0, 0.12, min(min(iq.x, iq.y), min(1.0 - iq.x, 1.0 - iq.y)));
    slope += texture(uRipple, iq).zw * re;
  }
#endif

  // parlaklık kenar yumuşatma: piksel içindeki eğim değişimi de pürüzlülüğe eklenir
  vec2 dsx = dFdx(slope), dsy = dFdy(slope);
  vec3 aa = vec3(dsx.x * dsx.x + dsy.x * dsy.x, dsx.y * dsx.y + dsy.y * dsy.y, dsx.x * dsx.y + dsy.x * dsy.y) * 0.5;
  aa *= min(1.0, 0.03 / max(max(aa.x, aa.y), 1.0e-8));
  // çözülemeyen eğim kovaryansı (xx, zz, xz): taban + kaybolan dalgalar + kenar yumuşatma
  vec3 cov = vec3(vec2(uRoughness * 0.5 + 1.0e-5), 0.0) + lostCov + aa;

  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 L = uSunDir;
  vec3 sunE = uSunColor * PI;
  vec3 sigma = uAbsorption + vec3(uTurbidity);
  // su gövdesinden yukarı saçılan ışık dağınıktır: tüm gökyüzü yarıküresi + kırılan güneş
  vec3 inscatter = uWaterColor * (vHemi * 1.6 + sunE * max(L.y, 0.0) * 0.8);

  // --- su altından yüzeye bakış: Snell penceresi + tam iç yansıma ---
  if (!gl_FrontFacing) {
    vec3 Nu = -N;
#ifndef UNDERWATER
    // kamera havada: arka yüzler yalnızca nadiren (tepe kenarlarında) görünür, basit yol
    vec3 Tr0 = refract(-V, Nu, 1.333);
    vec3 col = inscatter * 1.2;
    if (dot(Tr0, Tr0) > 0.0) col = mix(envLod(Tr0, 1.0) * 0.9, col, 0.02 + 0.98 * pow(1.0 - max(dot(Tr0, -Nu), 0.0), 5.0));
    col = mix(inscatter, col, exp(-sigma * dist));
#else
    float Fr = fresnelDielectric(clamp(dot(V, Nu), 0.0, 1.0), 1.333);
    vec3 col = vec3(0.0);
    if (Fr < 1.0) {
      // pencereden görünen gökyüzü: suya girerken parlaklık n² kadar artar
      vec3 Tr = refract(-V, Nu, 1.333);
      float wl = clamp(log2(max(2.0 * sqrt(max(cov.x + cov.y, 1.0e-6) * 0.5) * uEnvSize / 1.5708, 1.0)), 0.0, uEnvMaxLod);
      float sd = max(dot(Tr, L), 0.0);
      vec3 win = envLod(Tr, wl) + uSunColor * (600.0 * pow(sd, 1200.0) + 0.6 * pow(sd, 24.0));
      col = win * 1.777 * (1.0 - Fr);
    }
    // pencerenin dışı: aşağı yansıyan ışın suyun kendi saçtığı ışığı görür (yukarı dönmesin:
    // su çizgisinde parlak/koyu hale olmasın)
    vec3 Rd = reflect(-V, Nu);
    Rd.y = min(Rd.y, -0.1);
    col += waterSegmentS(vec3(0.0), 0.0, Rd, 200.0, inscatter) * Fr;
    // kameradan (yakın düzlemden) yüzeye kadar su
    float d0 = max(-waterNearS(gl_FragCoord.xy * uNearGrid.zw), 0.0);
    float dw = uNearInfo.x > 1.5 ? max(dist - uMedFwd.w / max(dot(-V, uMedFwd.xyz), 1.0e-3), 0.0) : dist;
    col = waterSegmentS(min(col, vec3(2.0e4)), d0, -V, dw, inscatter);
#ifdef EXPLOSIONS
    col += flashGlow(uCameraPos, -V, dw);
#endif
#endif
#ifdef TONEMAP
    col = toneMap(col);
#endif
    fragColor = vec4(col, 1.0);
    return;
  }

  float NdotV = max(dot(N, V), 0.0);
  float sig = sqrt(max(cov.x + cov.y, 1.0e-6) * 0.5);

  // --- yansıma ---
  // Sığ açıda görünen yüzeyler bakana dönük olanlardır (izdüşüm alanı + maskeleme):
  // etkin yansıtıcı yukarı eğilir ve daha yüksek, daha gri gökyüzünü görür.
  vec3 vh = normalize(vec3(V.x, 0.0, V.z) + vec3(1.0e-5, 0.0, 0.0));
  float sigV = sqrt(max(vh.x * vh.x * cov.x + vh.z * vh.z * cov.y + 2.0 * vh.x * vh.z * cov.z, 1.0e-6));
  float aV = max(V.y, 1.0e-3) / max(sqrt(1.0 - V.y * V.y), 1.0e-3) / (1.4142 * sigV);
  vec3 nV = normalize(N + vh * (0.32 * sigV * (1.0 - smoothstep(0.0, 2.5, aV))));
  vec3 R = reflect(-V, nV);
  R = normalize(vec3(R.x, abs(R.y) * 0.4 + max(R.y, 0.0) * 0.6, R.z));
  float envLevel = clamp(log2(max(0.7 * sig * uEnvSize / 1.5708, 1.0)), 0.0, uEnvMaxLod);
  vec3 refl = envLod(R, envLevel);
#ifdef PLANAR
  // Bozulmuş yansıma ışınını, düz suda aynı ışını veren kamera ışınına çevirip ekrana
  // yansıt: sığ açılarda dalgaların yansımayı dikey şeritlere bölmesi doğal çıkar.
  vec3 Rr = reflect(-V, nV);
  vec4 c0 = uViewProj * vec4(-V, 0.0);
  vec4 c1 = uViewProj * vec4(Rr.x, -Rr.y, Rr.z, 0.0);
  vec2 offR = c1.w > 1.0e-4 ? (c1.xy / c1.w - c0.xy / c0.w) * 0.5 : vec2(0.0);
  offR = clamp(offR * uReflectionDistort, vec2(-0.2), vec2(0.2));
  // pürüzlülük kadar bulanıklaştır (doku yarım çözünürlükte ve mip'li olabilir)
  float rLod = clamp(log2(max(1.4142 * sig / uPixelAngle * 0.5, 1.0)), 0.0, 6.0);
  vec4 pr = textureLod(uReflection, gl_FragCoord.xy / uScreenSize + offR, rLod);
  refl = refl * (1.0 - pr.a) + pr.rgb;   // doku önceden çarpılmış (premultiplied) kabul edilir
#endif
  // Fresnel kısmen yumuşatılmış normalden: uzun dalga yüzü + ince dalgaların sığ açı istatistiği.
  // Çözülemeyen eğimler görünen yüzeyleri bakana döndürür: ortalama Fresnel düşer
  // (Bruneton ve ark. 2010 yaklaşımı; pürüzlü fırtına denizi ufukta gri ayna olmaz).
  float cF = max(dot(normalize(mix(N, vec3(0.0, 1.0, 0.0), 0.2)), V), 0.0);
  float sigF = sqrt(max(vh.x * vh.x * covF.x + vh.z * vh.z * covF.y + 2.0 * vh.x * vh.z * covF.z, 0.0));
  float F = 0.02 + 0.98 * pow(1.0 - cF, 5.0 * exp(-2.69 * sigF)) / (1.0 + 22.7 * sigF * sqrt(sigF));

  // --- kırılma, soğurma, kostik ---
#ifdef UNDERWATER
  vec3 transmitted = inscatter * uMedSigma / (uMedSigma + 0.8 * uMedKd);
#else
  vec3 transmitted = inscatter;
#endif
  float shoreDepth = vWaterDepth;
  float edge = 1.0;
#ifdef SCENE
  vec2 suv = gl_FragCoord.xy / uScreenSize;
  float wDepth = -(uView * vec4(vWorld, 1.0)).z;
  float raw0 = texture(uSceneDepth, suv).r;
  float sD0 = linearDepth(raw0);
  float below0 = 1.0e4;
  if (raw0 < 0.99999) below0 = max(vWorld.y - depthToWorld(suv, raw0).y, 0.0);
  shoreDepth = min(shoreDepth, below0);
  vec3 dnT = mat3(uView) * (N - vec3(0.0, 1.0, 0.0));
  vec2 off = dnT.xy * (uRefraction * 0.35 * min(max(sD0 - wDepth, 0.0), 4.0) / max(wDepth, 1.0));
  vec2 ruv = suv + clamp(off, vec2(-0.06), vec2(0.06));
#ifdef UNDERWATER
  // su çizgisinde: kırılan doku su altı tarafından okunmasın (orası zaten su içinden görüldü)
  if (uNearInfo.x > 1.5 && waterNearS(ruv) < 0.0) ruv = suv;
#endif
  float raw1 = texture(uSceneDepth, ruv).r;
  if (linearDepth(raw1) < wDepth) { ruv = suv; raw1 = raw0; }   // kırılan nokta suyun önündeyse iptal
  vec3 bottom = texture(uSceneColor, ruv).rgb;
  vec3 sceneRaw = texture(uSceneColor, suv).rgb;
  float path = 1.0e4;
  if (raw1 < 0.99999) {
    vec3 sp = depthToWorld(ruv, raw1);
    path = distance(sp, vWorld);
    float below = max(vWorld.y - sp.y, 0.0);
#ifndef SCENE_LIT
    vec3 rs = refract(-L, vec3(0.0, 1.0, 0.0), 0.75);   // su içindeki güneş ışını
    float sunY = max(-rs.y, 0.1);
#ifdef CAUSTICS
    if (dot(exp(-sigma * path), vec3(0.333)) > 0.01) {
      vec2 cp = sp.xz - rs.xz * (below / sunY);
      float c1 = texture(uNoise, cp * uCaustics.y + uTime * vec2(0.021, 0.013)).b;
      float c2 = texture(uNoise, cp * uCaustics.y * 1.37 + vec2(0.41, 0.73) - uTime * vec2(0.016, 0.024)).b;
      float caus = min(c1, c2) * uCaustics.x * smoothstep(0.02, 0.5, below) / (1.0 + below * 0.25);
      bottom *= 1.0 + caus * 3.0 * clamp(dot(uSunColor, vec3(0.3, 0.5, 0.2)), 0.0, 2.0);
    }
#endif
    bottom *= exp(-sigma * (below / sunY));   // güneş ışığı dibe inene kadar zayıflar
#ifdef EXPLOSIONS
    bottom += 0.25 * flashIrradiance(sp);   // flaşın aydınlattığı dip (underwaterLight ile aynı)
#endif
#endif
  }
  // su içindeki görüş yolu (su altından bakışla aynı model)
#ifdef UNDERWATER
  transmitted = waterSegmentDown(bottom, path, inscatter);
#else
  vec3 viewT = exp(-sigma * path);
  transmitted = bottom * viewT + inscatter * (1.0 - viewT);
#endif
  edge = smoothstep(0.0, uEdgeSoftness, below0);
#endif

  // --- ışık saçılması: arkadan aydınlanan ince dalga tepelerinden geçen güneş ---
  float H = clamp(vHeight, 0.0, 1.0);
  float toSun = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  float thin = pow(clamp(0.5 - 0.5 * dot(L, N), 0.0, 1.0), 3.0);
  vec3 sssLight = uSssColor * uSss * (sunE * (H * H * toSun * thin * 2.0 * exp(-dist / 600.0) + 0.11 * H * NdotV * NdotV) + vHemi * 0.15 * H);
  // ince dalga tepelerinden geçen dağınık gök ışığı: güneş olmasa da sırtlar turkuaz parlar
  // yalnızca sıkışmış (keskin, ince) tepelerde: sakin denizin yuvarlak kabarışları turkuaz olmaz
  float sharp = smoothstep(0.05, 0.5, 1.0 - vJacobian);
  sssLight += uSssColor * uSss * vHemi * (H * H * sharp * (1.2 - 0.6 * NdotV) * 1.8);
  transmitted += sssLight;
#ifdef EXPLOSIONS
  // su altı patlama flaşı: su içinde saçılıp yüzeyden çıkan parıltı; ışın dipte/sahnede biter,
  // sudan havaya çıkarken parlaklık 1/n² ile azalır
  vec3 Tf = refract(-V, N, 0.75);
  float fLen = min(shoreDepth / max(-Tf.y, 0.1), 40.0);
#ifdef SCENE
  fLen = min(fLen, path);
#endif
  transmitted += 0.5625 * flashGlow(vWorld, Tf, fLen);
#endif

  // --- güneş parıltısı: anizotropik Gauss eğim dağılımı + Smith maskeleme ---
  vec3 Hv = normalize(V + L);
  vec2 dsl = -Hv.xz / max(Hv.y, 1.0e-3) - slope;
  float det = max(cov.x * cov.y - cov.z * cov.z, 1.0e-10);
  float e = (dsl.x * dsl.x * cov.y + dsl.y * dsl.y * cov.x - 2.0 * dsl.x * dsl.y * cov.z) / det;
  float hy2 = Hv.y * Hv.y;
  float Dm = exp(-0.5 * e) / (2.0 * PI * sqrt(det) * max(hy2 * hy2, 1.0e-6));
  float Gs = 1.0 / (1.0 + lambdaSmith(V, cov) + lambdaSmith(L, cov));
  vec3 spec = min(sunE * (fresnelWater(dot(V, Hv)) * Dm * Gs / (4.0 * max(V.y, 0.02))), vec3(250.0)) * step(0.0, L.y);

  // --- köpük: dalga tepesi + rüzgar şeritleri + kıyı + akış ---
  // Eşikler CPU'da rüzgar hızına göre ölçülmüş köpük kapsamasından (Monahan) hesaplanır.
  // Jacobian büyük dalgaları ve geometri olarak çizilen küçük dalgaları içerir.
  // Uzun dalga tepeleri kesintisiz şerit değil, yama yama köpürür (yavaşça kayan maske).
  float patchN = texture(uNoise, (p - uWindDir * (uTime * 0.6)) / (uFoam2.y * 6.0)).g;
  float wc = 0.0;
  // yalnızca dalgaların çoğu görünürken (uzakta birkaç uzun dalga kalınca şerit çizmesin)
  float jVis = smoothstep(0.25, 0.6, vSigmaJ * uWhitecap.z);
  if (jVis > 0.0) wc = smoothstep(-0.2, 0.4, (1.0 - vJacobian) / vSigmaJ - uWhitecap.x) * smoothstep(0.38, 0.62, patchN) * jVis;
  // anlık tahmin: yalnızca köpük haritalarının ötesinde, hafif taze tepe katkısı
  float foamAmt = uFoam.x * wc * 0.35;
  float freshCore = 0.0;
  float laceAmt = 0.0;   // yaşlanan köpük: dalga yüzlerini kaplayan ince damar ağı
#ifdef FOAM_MAP
  // kalıcı köpük: yakın ve uzak haritalar (kenarlarda yumuşak geçiş)
  vec2 fq0 = (p - uFoamMapRect.xy) * uFoamMapRect.z;
  vec2 fq1 = (p - uFoamMapFarRect.xy) * uFoamMapFarRect.z;
  float mw0 = smoothstep(0.0, 0.15, min(min(fq0.x, fq0.y), min(1.0 - fq0.x, 1.0 - fq0.y)));
  float mw1 = smoothstep(0.0, 0.15, min(min(fq1.x, fq1.y), min(1.0 - fq1.x, 1.0 - fq1.y)));
  if (mw1 > 0.0) {
    vec3 fmv = texture(uFoamMapFar, fq1).rga;
    if (mw0 > 0.0) fmv = mix(fmv, texture(uFoamMap, fq0).rga, mw0);
    float mapCover = 0.0;
    if (fmv.r > 0.003) {   // köpüksüz yüzeyin çoğunda ek doku okuması yok
      // yaşlanan köpük rüzgar yönünde şeritlere ayrılır, taze tepe köpüğü yoğun kalır
      vec2 wq0 = vec2(dot(p, uWindDir), dot(p, vec2(-uWindDir.y, uWindDir.x)));
      float streakA = texture(uNoise, wq0 * vec2(0.006, 0.03)).a;
      float freshK = clamp(fmv.g * 2.0, 0.0, 1.0);
      // taze köpük yoğun yamalar; yaşlanan köpük şeritlere ve damar ağına ayrılır
      mapCover = fmv.r * mix(smoothstep(0.3, 0.7, streakA) * 0.6, 1.0, freshK);
      freshCore = fmv.g * mw1 * uFoam.x;
      laceAmt = fmv.r * (1.0 - freshK) * mw1 * uFoam.x;
    }
    foamAmt = mix(foamAmt, uFoam.x * mapCover, mw1);
    // patlama köpüğü (ön ayarın dalga köpüğü yoğunluğundan bağımsız: sakin gölde de görünür)
    if (fmv.z > 0.003) {
      foamAmt = max(foamAmt, fmv.z * mw1);
      freshCore = max(freshCore, smoothstep(0.5, 1.0, fmv.z) * mw1);
      laceAmt = max(laceAmt, fmv.z * mw1 * 0.8);
    }
  }
  // ince haritanın ötesinde: geometrinin çözdüğü tepelerde anlık taze köpük (orta mesafe beyaz tepeler)
  freshCore = max(freshCore, wc * uFoam.x * (1.0 - mw0) * 0.6);
#endif
  if (uFoam.y > 0.0) {
    vec2 wq = vec2(dot(p, uWindDir), dot(p, vec2(-uWindDir.y, uWindDir.x)));
    float streak = texture(uNoise, vec2(wq.x * 0.0035, wq.y * 0.028) + uTime * vec2(-0.0012, 0.0)).g;
    float sk = uFoam.y * smoothstep(0.45, 0.75, streak);
    foamAmt += sk * (0.12 + 0.6 * wc + 0.2 * H);
    laceAmt += sk * 0.7;
  }
  float sb = 1.0 - smoothstep(0.0, uFoam.w, shoreDepth);
  if (sb > 0.0) {
    float nz = texture(uNoise, p * 0.043).a;
    float pulse = 0.5 + 0.5 * sin(shoreDepth / max(uFoam.w, 0.05) * 7.0 - uTime * 1.6 + nz * 9.0);
    foamAmt += uFoam.z * sb * mix(0.35, 1.0, pulse);
  }
  // akıntı: hızla artan, akışla sürüklenen seyrek kabarcıklar + akış haritasındaki ek köpük
  float fs = length(flow);
  if (fs > 0.01) foamAmt += uFoam2.x * ((0.2 + 0.8 * smoothstep(0.3, 2.5, fs)) * 0.55 + vFlow.z);
  foamAmt = clamp(foamAmt, 0.0, 1.5);
  float foam = 0.0;
  float bub = 0.5;
  // desen piksel altına küçülünce eşikleme kapsamayı yok eder: uzakta ortalama kapsamaya geç
  float minif = smoothstep(0.2, 0.9, length(fwidth(p)) / uFoam2.y);
  if (foamAmt > 0.002) {
#ifdef FLOW_VARYING
    float pat = foamPattern(p - o0) * w0 + foamPattern(p - o1) * w1;
#else
    float pat = foamPattern(p - o0);
#endif
    float mask = texture(uNoise, (p - o0) / (uFoam2.y * 9.0)).g;
    pat = clamp(pat * (0.8 + 0.4 * mask), 0.0, 1.0);
    bub = texture(uNoise, (p - o0) * 1.9 + vec2(0.21, 0.53)).a;
    // kapsama → desen eşiği: ince köpük yarı saydam film, yoğun köpük keskin kenarlı opak
    float fw = fwidth(pat) + 0.03;
    float soft = 0.04 + 0.14 * (1.0 - clamp(foamAmt, 0.0, 1.0));
    float fm = smoothstep(1.0 - foamAmt - fw - soft, 1.0 - foamAmt + fw + soft, pat);
    foam = clamp(fm * smoothstep(0.0, 0.5, foamAmt), 0.0, 1.0) * (0.68 + 0.32 * smoothstep(0.3, 0.9, foamAmt));
    // yeni kırılan tepeler: tazelik = hücrede o an kırılan alan oranı; desenin o kadarı opak beyaz
    float fc = clamp(freshCore * 1.6, 0.0, 1.0);
    foam = max(foam, smoothstep(1.0 - fc - fw, 1.0 - fc + fw, pat) * smoothstep(0.0, 0.12, fc) * 0.92);
    foam = mix(foam, max(clamp(foamAmt, 0.0, 1.0) * 0.7, fc * 0.92), minif);
  }
  if (laceAmt > 0.03) {
    // Worley kenar ağı (gürültü B kanalı): rüzgar yönünde gerilmiş, büyük ölçekte bükülmüş
    // dalga eğimi ağı yüzey boyunca büker, rüzgar onu iplikçiklere gerer
    // Dağılan köpük tabakasında delikler büyür, geriye ince köprüler kalır: küçük hücreli
    // iki Voronoi duvar katmanı, hafif bükülmüş ve rüzgar yönünde biraz gerilmiş.
    vec2 lp = p - o0 + sA * (uFoam2.y * 0.3);
    lp += (texture(uNoise, lp * 0.05).ga - 0.5) * (uFoam2.y * 0.5);
    vec2 lq = vec2(dot(lp, uWindDir), dot(lp, vec2(-uWindDir.y, uWindDir.x)));
    float lace = max(texture(uNoise, lq * vec2(0.5, 1.0) / (uFoam2.y * 0.9)).b,
                     texture(uNoise, ROT_A * (lq * vec2(0.6, 1.0)) / (uFoam2.y * 0.37) + 0.5).b * 0.85);
    float la = clamp(laceAmt * 1.2, 0.0, 1.0);
    // duvar kalınlığı yoğunlukla biraz artar; seyrek köpük ince çizgi değil soluk ağ olur
    float thr = 0.75 - 0.35 * la;
    float lfw = fwidth(lace) + 0.03;
    float lnet = smoothstep(thr - lfw, thr + lfw + 0.1, lace) * smoothstep(0.0, 0.35, la);
    // ağ yer yer kopuk ve kalın/ince (eşitlenmiş köpük deseni ile)
    lnet *= smoothstep(0.25, 0.65, texture(uNoise, lq / (uFoam2.y * 2.3) + 0.21).r + la * 0.35);
    foam = max(foam, mix(lnet, la * 0.3, minif) * (0.4 + 0.45 * la));
  }
  // köpüğün altındaki kabarcıklar suyu açar
  transmitted += uSssColor * (sunE * 0.05 + vHemi * 0.35) * clamp(foamAmt + laceAmt * 0.5, 0.0, 1.0);

  vec3 color = transmitted * (1.0 - F) + refl * F + spec;
  // köpük tüm yarıküreden ışık alır (serin zenit dahil): daha az doygun ortam; alçak güneş
  // köpüğün pütürlü yapısında büyük ölçüde gölgelenir
  vec3 foamAmb = mix(vHemi, vec3(dot(vHemi, vec3(0.2126, 0.7152, 0.0722))), 0.85);
  vec3 foamCol = vec3(0.82, 0.87, 0.92) * (0.78 + 0.3 * bub) * (uSunColor * max(dot(gn, L), 0.0) * 0.5 + foamAmb * 1.55);
  color = mix(color, foamCol, foam * 0.95);

#ifdef SCENE
  color = mix(sceneRaw, color, edge);
#endif
  color = mix(color, vFogColor, 1.0 - exp(-dist * uFogDensity));
#ifdef TONEMAP
  color = toneMap(color);
#endif
  fragColor = vec4(color, 1.0);
#ifdef DEBUG_VIEW
  fragColor = vec4(foamAmt, freshCore, foam, 1.0);
#endif
}`;

// Su çizgisi testi: ekran ızgarasının her noktası için yakın düzlem noktasını bul, yüzeyi
// çizen fonksiyonun yatay kaymasını Newton ile ters çöz ve noktanın yüzeye göre yüksekliğini yaz.
const NEAR_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_WAVES}
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uLevel;
uniform vec4 uNearOut;   // N, M, RGBA8 paketli, aralık (m)
uniform vec4 uNearRect;  // dikdörtgen su sınırı (minX, minZ, maxX, maxZ); dışı hava
out vec4 fragColor;
WaveOut evalAt(vec2 g) {
  vec3 grid = vec3(g.x, uLevel, g.y);
  return waterWaves(grid, vec2(0.0), max(uLod.x, length(grid - uCameraPos) * uLod.y));
}
void main() {
  vec2 uv = floor(gl_FragCoord.xy) / (uNearOut.xy - 1.0);
  vec4 pn = uInvViewProj * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
  vec3 P = pn.xyz / pn.w;
  vec2 g = P.xz;
  for (int it = 0; it < 6; it++) {
    WaveOut w = evalAt(g);
    vec2 F = g + w.disp.xz - P.xz;
    float a = w.T.x + 0.5 * w.detailTr, b = w.B.x, c = w.T.z, d = w.B.z + 0.5 * w.detailTr;
    float det = a * d - b * c;
    g -= det > 0.1 ? vec2(d * F.x - b * F.y, a * F.y - c * F.x) / det : F * 0.7;
  }
  float sv = P.y - (uLevel + evalAt(g).disp.y);
  if (any(lessThan(P.xz, uNearRect.xy)) || any(greaterThan(P.xz, uNearRect.zw))) sv = uNearOut.w;
  if (uNearOut.z > 0.5) {
    float v = clamp(sv / uNearOut.w * 0.5 + 0.5, 0.0, 1.0) * 255.0;
    fragColor = vec4(floor(v) / 255.0, fract(v), 0.0, 1.0);
  } else {
    fragColor = vec4(sv, 0.0, 0.0, 1.0);
  }
}`;

// Su gövdesinin saçtığı ışık: karede bir kez, 1 piksel (sahne shader'ları tek okumayla alır)
const MEDCONST_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_ENV}
${GLSL_NEAR}
${GLSL_MEDIUM_CORE}
out vec4 fragColor;
void main() { fragColor = vec4(medInscatterEnv(), 1.0); }`;

// Patlama spreyi: durum tutmayan, her karede kapalı formülle hesaplanan parçacıklar (sütunu
// oluşturan yırtık su tabakaları + ince damla çizgileri). Aynı tohum her istemcide aynı patlama.
// Lens damlaları: her damla yükseklik dokusuna bir kubbe (MAX karışımı: üst üste binenlerin birleşimi)
const LENS_VS = /* glsl */ `
precision highp float;
uniform vec4 uDrops[64];   // x, y (ekran uv), yarıçap (ekran yüksekliği), uzama
uniform vec4 uLensP;       // en/boy, 1/yükseklik ölçeği, ekranda aşağı yön xy
out vec2 vQ;
out float vH;
void main() {
  int cv = gl_VertexID;
  vec2 c = vec2(cv == 1 || cv == 2 || cv == 4 ? 1.0 : -1.0, cv == 2 || cv == 4 || cv == 5 ? 1.0 : -1.0);
  vec4 d = uDrops[gl_InstanceID];
  vec2 dn = uLensP.zw, tn = vec2(-dn.y, dn.x);
  // kayan damla akış yönünde uzar
  vec2 o = (tn * c.x + dn * c.y * (1.0 + d.w)) * d.z;
  vQ = c;
  vH = 0.5 * d.z * uLensP.y;
  gl_Position = vec4((d.xy + vec2(o.x / uLensP.x, o.y)) * 2.0 - 1.0, 0.0, 1.0);
}`;

const LENS_FS = /* glsl */ `
precision highp float;
in vec2 vQ;
in float vH;
out vec4 fragColor;
void main() {
  float q2 = dot(vQ, vQ);
  if (q2 >= 1.0) discard;
  fragColor = vec4(vH * sqrt(1.0 - q2), 0.0, 0.0, 1.0);
}`;

// Lens filmi: 16x9 hücrelik ıslaklık ızgarası, çift doğrusal olarak G kanalına (MAX karışımı)
const LENS_FILM_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform vec4 uFilm[36];   // hücrelerin su filmi, satır satır (alt satır önce)
uniform vec4 uFilmP;      // xy: ekranda yerçekimi yönü, z: en/boy oranı, w: zaman
${GLSL_LENS_NOISE}
float filmAt(int i, int j) {
  int k = j * 16 + i;
  return dot(uFilm[k >> 2], vec4(equal(ivec4(k & 3), ivec4(0, 1, 2, 3))));
}
void main() {
  // hücre ızgarası görünmesin: arama noktası ~±0.35 hücre bükülür
  vec2 g = vUv * vec2(16.0, 9.0);
  g += 0.7 * (vec2(lensNoise(g * 0.43 + 1.7), lensNoise(g * 0.43 + vec2(9.2, 4.1))) - 0.5);
  g = clamp(g - 0.5, vec2(0.0), vec2(15.0, 8.0));
  ivec2 c = min(ivec2(floor(g)), ivec2(14, 7));
  vec2 t = g - vec2(c);
  float f = mix(mix(filmAt(c.x, c.y), filmAt(c.x + 1, c.y), t.x),
                mix(filmAt(c.x, c.y + 1), filmAt(c.x + 1, c.y + 1), t.x), t.y);
  // film sınırı düzensiz: gürültü kalınlığa eklenir (frekanslar hücre aralığıyla çakışmaz)
  vec2 sp = (vUv - 0.5) * vec2(uFilmP.z, 1.0);
  vec2 dn = uFilmP.xy;
  float gy = 0.5 - dot(sp, dn), gx = dot(sp, vec2(-dn.y, dn.x)), tm = uFilmP.w;
  float fn = f + 0.12 * (lensNoise(vec2(gx * 10.7 + 0.37, gy * 2.3 + tm * 0.5)) - 0.5)
               + 0.04 * (lensNoise(vec2(gx * 29.3 + 3.1, gy * 6.1 + tm * 0.9)) - 0.5);
  fragColor = vec4(0.0, f > 0.002 ? max(fn, 0.0) : 0.0, 0.0, 0.0);
}`;

const LENS_HSCALE = 0.025;   // lens dokusundaki yükseklik birimi (ekran yüksekliği)
const LENS_GX = 16, LENS_GY = 9;   // lens ıslaklık ızgarası (ekran hücreleri)
const LENS_ZERO = new Float32Array(4);

const SPRAY_VS = /* glsl */ `
precision highp float;
precision highp int;
uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uSprayA;    // x, z, açılmadan beri geçen süre (s), R (m)
uniform vec4 uSprayB;    // sütun yüksekliği H (m), tohum, tabaka sayısı, su seviyesi
uniform float uFade;
out vec2 vUv;
out vec3 vWorld;
out float vAlpha;
out float vType;
out float vAge;
out float vLevel;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return x;
}
float rnd(inout uint st) { st = hashU(st); return float(st >> 8) * (1.0 / 16777216.0); }
void main() {
  int cv = gl_VertexID;
  vec2 c = vec2(cv == 1 || cv == 2 || cv == 4 ? 1.0 : -1.0, cv == 2 || cv == 4 || cv == 5 ? 1.0 : -1.0);
  uint st = hashU(uint(gl_InstanceID) * 747796405u + uint(uSprayB.y));
  bool sheet = float(gl_InstanceID) < uSprayB.z;
  float R = uSprayA.w, H = uSprayB.x;
  float u1 = rnd(st), u2 = rnd(st), u3 = rnd(st), u4 = rnd(st), u5 = rnd(st), u6 = rnd(st);
  float tl = uSprayA.z - u5 * (sheet ? 0.3 : 0.2);
  // tabakalar: %60 dik ve hızlı çekirdek (sütun), %40 dışa açılan taç (25-45°)
  bool crown = sheet && u1 > 0.6;
  float rr = sheet ? R * (crown ? mix(0.45, 0.9, (u1 - 0.6) / 0.4) : 0.4 * sqrt(u1 / 0.6)) : R * 0.75 * sqrt(u1);
  float an = 6.2831853 * u2;
  vec2 dir = vec2(cos(an), sin(an));
  float V0 = sqrt(2.0 * 9.81 * H);
  float prof = exp(-1.5 * (rr / R) * (rr / R));      // merkez daha yükseğe
  float up, side;
  if (crown) {
    float ang = mix(0.45, 0.8, u4);                   // dikeyden açı (rad)
    float sp = V0 * mix(0.35, 0.6, u3);
    up = sp * cos(ang);
    side = sp * sin(ang);
  } else {
    up = V0 * prof * (sheet ? mix(0.7, 1.05, u3) : mix(0.3, 1.0, u3));
    side = V0 * (sheet ? mix(0.03, 0.12, u4) : mix(0.15, 0.55, u4)) * (0.3 + rr / R);
  }
  float k = sheet ? mix(0.35, 0.7, u6) : mix(0.08, 0.2, u6);   // doğrusal sürtünme
  // sürtünmesiz tepe yüksekliği aynı kalsın diye hız artırılır (h = v0/k - g/k²·ln(1+k·v0/g) ≈ H, %3 içinde)
  float boost = 1.0 + 0.35 * k * up / 9.81;
  vec3 v0 = vec3(dir.x * side, up, dir.y * side) * boost;
  vec3 p0 = vec3(uSprayA.x + dir.x * rr, uSprayB.w, uSprayA.y + dir.y * rr);
  // dv/dt = g - k·v  →  v = (v0 - g/k)·e^(-kt) + g/k,  p = p0 + (v0 - g/k)(1 - e^(-kt))/k + (g/k)·t
  vec3 gk = vec3(0.0, -9.81, 0.0) / k;
  float t = max(tl, 0.0);
  float e = exp(-k * t);
  vec3 p = p0 + (v0 - gk) * (1.0 - e) / k + gk * t;
  vec3 v = (v0 - gk) * e + gk;
  float alive = step(0.0, tl) * step(uSprayB.w - 0.3, p.y);
  vec3 toC = p - uCameraPos;
  float dist = length(toC);
  vec3 ax, ay;
  if (sheet) {
    // hız yönünde uzayan su tabakası; yavaşladıkça yuvarlaklaşıp büyür (dağılır)
    float size = R * (0.12 + 0.16 * u4) * (0.6 + 0.9 * min(t, 3.0));
    size = min(size, dist * 0.3);                   // ekranı kaplamasın
    vec3 vd = normalize(v + vec3(0.0, 1.0e-4, 0.0));
    vec3 vs = normalize(cross(vd, toC / max(dist, 1.0e-3)));
    float stretch = 1.0 + 2.2 * clamp(length(v) / V0, 0.0, 1.0);
    ax = vs * size;
    ay = vd * size * stretch;
  } else {
    float w = max(0.03 + 0.04 * u4, dist * 0.0012);  // en az ~1 piksel genişlik
    vec3 vd = normalize(v + vec3(0.0, 1.0e-4, 0.0));
    ax = normalize(cross(vd, toC / max(dist, 1.0e-3))) * w;
    ay = vd * clamp(length(v) * 0.05, 0.08, 2.5);
  }
  vec3 wp = p + ax * c.x + ay * c.y;
  vUv = c * 0.5 + 0.5;
  vWorld = wp;
  vType = sheet ? 0.0 : 1.0;
  vAge = t;
  vLevel = uSprayB.w;
  float life = sheet ? 1.0 - smoothstep(2.0, 5.0 + 2.0 * u3, t) : smoothstep(0.0, 0.08, t) * clamp(length(v) / 6.0, 0.25, 1.0);
  vAlpha = alive * life * smoothstep(-0.3, 0.8, p.y - uSprayB.w) * uFade;
  gl_Position = vAlpha > 0.0 ? uViewProj * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const SPRAY_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_ENV}
uniform sampler2D uNoise;
uniform vec3 uCameraPos;
uniform float uSeedF;
uniform float uSprayCut;   // 1: kamera yüzeyi kesiyor → sprey seviyede kesilir (havadayken derinlik testi yeter)
in vec2 vUv;
in vec3 vWorld;
in float vAlpha;
in float vType;
in float vAge;
in float vLevel;
out vec4 fragColor;
void main() {
  if (uSprayCut > 0.5 && vWorld.y < vLevel) discard;   // sprey suyun altına sarkmasın (su altından görünmesin)
  vec2 q = vUv * 2.0 - 1.0;
  float a;
  if (vType < 0.5) {
    // yırtılan su tabakası: yaşlandıkça gürültü eşiği yükselir, tabaka parçalanır
    float r = length(q);
    float n = texture(uNoise, vUv * 0.4 + vec2(uSeedF, vAge * 0.03)).r;
    float thr = 0.12 + 0.55 * smoothstep(0.5, 3.5, vAge);
    a = smoothstep(1.0, 0.45, r) * smoothstep(thr, thr + 0.15, n * (1.3 - 0.6 * r));
    a = min(a * 1.3, 1.0);
  } else {
    a = (1.0 - abs(q.x)) * smoothstep(1.0, 0.5, abs(q.y));
  }
  a *= vAlpha;
  if (a < 0.004) discard;
  vec3 V = normalize(uCameraPos - vWorld);
  float mu = dot(-V, uSunDir);
  float hg = 0.51 / pow(1.49 - 1.4 * mu, 1.5) / 12.566;   // öne saçılma (güneşe karşı gümüş kenar)
  // köpük gibi: güneş + tüm gök yarıküresi (ufuk dahil)
  float lod = max(uEnvMaxLod - 1.0, 0.0);
  vec3 amb = 0.5 * envLod(vec3(0.0, 1.0, 0.0), lod) + 0.5 * envLod(normalize(vec3(V.x, 0.35, V.z)), lod);
  vec3 col = vec3(0.86, 0.9, 0.94) * (uSunColor * (0.35 + 5.0 * hg) * max(uSunDir.y + 0.15, 0.15) + amb * 1.9);
  col = applyFog(col, -V, length(uCameraPos - vWorld));
#ifdef TONEMAP
  col = toneMap(col);
#endif
  fragColor = vec4(col * a, a);   // önceden çarpılmış
}`;

// Su altı patlamasının gaz kabarcığı (örnek 0: salınan küre, ışın-küre kesişimi) ve ardından
// yükselen kabarcık bulutu (diğer örnekler). Yalnızca kamera suya girdiğinde çizilir.
const BUBBLE_VS = /* glsl */ `
precision highp float;
precision highp int;
uniform mat4 uViewProj;
uniform vec3 uCameraPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uBubble;     // gaz kabarcığı: merkez xyz, yarıçap (0 = yok)
uniform vec4 uCloud;      // bulut: x, z, yaş (s), yayılma yarıçapı (m)
uniform vec4 uCloudB;     // tohum, su seviyesi, en derin nokta (m), solma
uniform int uInstOffset;  // bu çizimdeki ilk örneğin numarası
out vec3 vWorld;
out vec2 vUv;
out float vKind;
out float vAlpha;
out vec3 vCenter;
out float vRad;
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return x;
}
float rnd(inout uint st) { st = hashU(st); return float(st >> 8) * (1.0 / 16777216.0); }
void main() {
  int cv = gl_VertexID;
  vec2 c = vec2(cv == 1 || cv == 2 || cv == 4 ? 1.0 : -1.0, cv == 2 || cv == 4 || cv == 5 ? 1.0 : -1.0);
  int id = gl_InstanceID + uInstOffset;
  vUv = c;
  if (id == 0) {
    float r = uBubble.w;
    vec3 C = uBubble.xyz;
    // kamera→merkez ışınına dik düzlemde, teğet koninin kesitini kapsayan kare (yakında büyür;
    // ekranın kenarındaki küre de kırpılmaz, merkezi yakın düzlemin önündeyken de görünür)
    float dc = max(distance(C, uCameraPos), r * 1.05);
    float s = r * 1.15 * dc / sqrt(max(dc * dc - r * r, 1.0e-4));
    vec3 w = (C - uCameraPos) / max(distance(C, uCameraPos), 1.0e-4);
    vec3 ax = cross(w, uCamUp);
    ax = dot(ax, ax) > 1.0e-6 ? normalize(ax) : uCamRight;   // merkez tam kameranın üstündeyse
    vec3 ay = cross(ax, w);
    vec3 wp = C + (ax * c.x + ay * c.y) * s;
    vWorld = wp; vKind = 0.0; vCenter = C; vRad = r; vAlpha = 1.0;
    gl_Position = r > 0.01 ? uViewProj * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  uint st = hashU(uint(id) * 747796405u + uint(uCloudB.x));
  float u1 = rnd(st), u2 = rnd(st), u3 = rnd(st), u4 = rnd(st), u5 = rnd(st), u6 = rnd(st);
  float t = uCloud.z - u5 * u5 * 1.2;               // farklı anlarda kopar (çoğu hemen)
  float an = 6.2831853 * u1;
  float rr = uCloud.w * sqrt(u2) * (1.0 + 0.25 * max(t, 0.0));
  float rise = mix(0.25, 1.3, u3 * u3);             // büyük kabarcıklar hızlı yükselir
  vec3 p = vec3(uCloud.x + cos(an) * rr + 0.15 * sin(t * (2.0 + 3.0 * u4) + u6 * 6.28),
                uCloudB.y - uCloudB.z * mix(0.15, 1.0, u6) + rise * max(t, 0.0),
                uCloud.y + sin(an) * rr + 0.15 * cos(t * (2.0 + 3.0 * u6) + u4 * 6.28));
  float dist = distance(p, uCameraPos);
  float size = max(mix(0.008, 0.07, u3 * u3), dist * 0.0012);
  vec3 wp = p + (uCamRight * c.x + uCamUp * c.y) * size;
  float alive = step(0.0, t) * step(p.y, uCloudB.y - 0.03) * (1.0 - smoothstep(5.0, 9.0, t));
  vWorld = wp; vKind = 1.0; vCenter = p; vRad = size; vAlpha = alive * uCloudB.w;
  gl_Position = alive > 0.0 ? uViewProj * vec4(wp, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const BUBBLE_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_ENV}
${GLSL_NEAR}
${GLSL_MEDIUM_CORE}
uniform vec3 uCameraPos;
uniform mat4 uViewProj;
uniform float uTime;
in vec3 vWorld;
in vec2 vUv;
in float vKind;
in float vAlpha;
in vec3 vCenter;
in float vRad;
out vec4 fragColor;
// Su içinden bir yöne bakış: yukarıda Snell penceresinden gök, pencere dışında yüzeyin
// tam iç yansıması (derin su), aşağıda su gövdesi
vec3 lookUnder(float depth, vec3 dir) {
  if (dir.y < 0.02) return waterSegment(vec3(0.0), depth, dir, 1.0e4);
  vec3 ta = refract(dir, vec3(0.0, -1.0, 0.0), 1.333);
  vec3 far = dot(ta, ta) > 0.0 ? envLod(ta, 1.0) * 0.9
                               : waterSegment(vec3(0.0), 0.0, vec3(dir.x, -dir.y, dir.z), 1.0e4);
  return waterSegment(far, depth, dir, depth / dir.y);
}
void main() {
  vec3 rd = normalize(vWorld - uCameraPos);
#ifdef BUBBLE_SPHERE
  {
    // ışın-küre kesişimi; yüzey hafifçe dalgalanır
    vec3 oc = uCameraPos - vCenter;
    float b = dot(oc, rd), cc = dot(oc, oc) - vRad * vRad;
    float h = b * b - cc;
    if (h < 0.0 || cc < 0.0) discard;   // ıska ya da kamera kabarcığın içinde
    float tHit = -b - sqrt(h);
    vec3 P = uCameraPos + rd * tHit;
    vec3 N = normalize(P - vCenter);
    N = normalize(N + 0.07 * sin(N.yzx * 9.0 + uTime * vec3(7.0, 9.0, 8.0)));
    // sudan gaza: kritik açının ötesinde tam iç yansıma → gümüşi kenar
    float cosI = clamp(dot(-rd, N), 0.0, 1.0);
    float sinT2 = 1.777 * (1.0 - cosI * cosI);
    float F = 1.0;
    if (sinT2 < 1.0) {
      float cosT = sqrt(1.0 - sinT2);
      float rs = (1.333 * cosI - cosT) / (1.333 * cosI + cosT);
      float rp = (cosI - 1.333 * cosT) / (cosI + 1.333 * cosT);
      F = 0.5 * (rs * rs + rp * rp);
    }
    float depth = max(uMedLevel - P.y, 0.0);
    vec3 refl = lookUnder(depth, reflect(rd, N));
    // gazdan geçen ışın iki kez kırılır (ıraksak mercek: arkası küçülmüş görünür)
    vec3 thru = refl;
    if (F < 1.0) {
      vec3 d1 = refract(rd, N, 1.333);
      vec3 N2 = normalize(P + d1 * (-2.0 * vRad * dot(N, d1)) - vCenter);
      thru = lookUnder(depth, refract(d1, -N2, 0.75));
    }
    vec3 col = mix(thru, refl, F) + 0.06 * flashIrradiance(P);
    float d0 = max(-waterNearS(gl_FragCoord.xy * uNearGrid.zw), 0.0);
    col = waterSegment(col, d0, rd, tHit);
#ifdef TONEMAP
    col = toneMap(col);
#endif
    vec4 cp = uViewProj * vec4(P, 1.0);
    gl_FragDepth = clamp(cp.z / cp.w * 0.5 + 0.5, 0.0, 1.0);
    fragColor = vec4(col, 1.0);
  }
#else
  {
    // küçük kabarcık: parlak halka, saydam orta; yukarıdan gelen ışık (Snell penceresi) yansır
    float r = length(vUv);
    if (r > 1.0) discard;
    float ring = smoothstep(0.5, 0.92, r) * (1.0 - smoothstep(0.92, 1.0, r));
    float depth = max(uMedLevel - vCenter.y, 0.0);
    vec3 col = lookUnder(depth, vec3(0.0, 1.0, 0.0)) * (1.5 + 3.5 * ring);
    float d0 = max(-waterNearS(gl_FragCoord.xy * uNearGrid.zw), 0.0);
    col = waterSegment(col, d0, rd, distance(vCenter, uCameraPos));
#ifdef TONEMAP
    col = toneMap(col);
#endif
    float a = (0.3 + 0.7 * ring) * vAlpha;
    fragColor = vec4(col * a, a);   // önceden çarpılmış
  }
#endif
}`;

// Etkileşimli halkalar: küçük bir dalga denklemi (kamerayı izleyen pencere)
const RIPPLE_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uState;
uniform ivec2 uShift;
uniform int uRes;
uniform float uC2;
uniform float uDamp;
uniform float uDx;
uniform vec3 uRect;            // minX, minZ, boyut
uniform vec4 uDrops[16];       // x, z, yarıçap, güç
uniform int uDropCount;
float H(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= uRes || c.y >= uRes) return 0.0;
  return texelFetch(uState, c, 0).r;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) + uShift;
  vec2 s = vec2(0.0);
  if (c.x >= 0 && c.y >= 0 && c.x < uRes && c.y < uRes) s = texelFetch(uState, c, 0).rg;
  float hl = H(c - ivec2(1, 0)), hr = H(c + ivec2(1, 0));
  float hd = H(c - ivec2(0, 1)), hu = H(c + ivec2(0, 1));
  float hn = (2.0 * s.x - s.y + uC2 * (hl + hr + hd + hu - 4.0 * s.x)) * uDamp;
  vec2 wp = uRect.xy + vUv * uRect.z;
  for (int i = 0; i < 16; i++) {
    if (i >= uDropCount) break;
    vec4 d = uDrops[i];
    float r = length(wp - d.xy) / d.z;
    if (r < 1.0) hn -= d.w * (0.5 + 0.5 * cos(3.14159265 * r));
  }
  float e = min(min(vUv.x, vUv.y), min(1.0 - vUv.x, 1.0 - vUv.y));
  hn *= smoothstep(0.0, 0.04, e);
  fragColor = vec4(hn, s.x, (hr - hl) / (2.0 * uDx), (hu - hd) / (2.0 * uDx));
}`;

// Kalıcı köpük haritası: kamerayı izleyen dünya-uzayı ızgarası (Lagrange koordinatları).
// Yüzeyin sıkıştığı yerde köpük "enjekte" edilir, sonra söner, rüzgarla sürüklenir ve
// yaşlandıkça (tazelik kanalı) şeritlere ayrılır.
const FOAM_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPrev;
uniform ivec2 uShift;
uniform int uRes;
uniform vec3 uRect;          // minX, minZ, boyut (m)
uniform vec4 uWaveA[MAXV];
uniform vec4 uWaveB[MAXV];
uniform int uWaveCount;
uniform sampler2D uDetailDisp;
uniform vec4 uDetailParams;
uniform vec4 uDispDecode;
uniform vec2 uFlow;
uniform float uTime;
uniform vec4 uFoamP;         // dt, sönüm (1/s), J eşiği, 1/σ (hücreye sığmayan dalgalar)
uniform vec2 uDrift;         // rüzgarla sürüklenme (texel/s)
uniform float uBreakK;
uniform float uLevel;
uniform float uQuant;        // RGBA8 için adım başına doğrusal sönüm
uniform sampler2D uNoise;
uniform vec4 uGroups;        // dalga grubu maskesi: 1/ölçek, kayma xz (grup hızıyla), -
uniform vec4 uExplA[4];      // patlamalar: x, z, yaş, R
uniform vec4 uExplC[4];      // açılma zamanı, geri düşüş zamanı, -, genel sönüm
uniform int uExplCount;
uniform vec2 uDecayA;        // olay köpüğü: çarpan, doğrusal azalma (birikmiş adımda; yoksa 1, 0)
#ifdef DEPTHMAP
uniform sampler2D uDepthMap;
uniform vec4 uDepthRect;
uniform vec2 uDepthDecode;
#endif
const mat2 ROT_A = mat2(0.6216, 0.7833, -0.7833, 0.6216);
vec4 dispTap(vec2 uv, float lod) {
  return (textureLod(uDetailDisp, uv, lod) + uDispDecode.w) * uDispDecode.xyyz;
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float ts = uRect.z / float(uRes);
  vec2 wp = uRect.xy + (vec2(c) + 0.5) * ts;
  float shallow = 1.0;
#ifdef DEPTHMAP
  vec2 duv = (wp - uDepthRect.xy) * uDepthRect.zw;
  if (duv == clamp(duv, 0.0, 1.0)) {
    shallow = clamp(max(uLevel - (textureLod(uDepthMap, duv, 0.0).r * uDepthDecode.x + uDepthDecode.y), 0.0) * uBreakK, 0.0, 1.0);
  }
#endif
  // büyük dalgaların Jacobian'ı (analitik, hücre boyutuna göre süzülmüş)
  float jxx = 0.0, jzz = 0.0, jxz = 0.0;
  for (int i = 0; i < MAXV; i++) {
    if (i >= uWaveCount) break;
    vec4 wa = uWaveA[i];
    float k = wa.z;
    float f = (1.0 - smoothstep(0.16, 0.33, ts * k * 0.1591549)) * shallow;
    if (f <= 0.0) continue;
    float kc = k * uWaveB[i].y * f * sin(k * dot(wa.xy, wp) + wa.w);
    jxx -= kc * wa.x * wa.x;
    jzz -= kc * wa.y * wa.y;
    jxz -= kc * wa.x * wa.y;
  }
  // geometri olarak çizilen küçük dalgaların sıkışması (köşe shader'ındakiyle aynı süzme)
  float lodD = log2(max(ts * uDetailParams.x * uDetailParams.z, 1.0e-3)) + 1.0;
  vec2 uf = (wp - uFlow * uTime) * uDetailParams.x;
  float tr = (dispTap(uf, lodD).w + dispTap(ROT_A * uf * 0.71 + vec2(0.31, 0.17), lodD - 0.5).w) * 0.7071 * shallow;
  float J = (1.0 + jxx) * (1.0 + jzz) - jxz * jxz + tr;
  // önceki kare: kamera kayması + rüzgarla sürüklenme (yarı-Lagrange)
  vec2 pc = vec2(c + uShift) + 0.5 - uDrift * uFoamP.x;
  vec4 prev = vec4(0.0);
  if (pc == clamp(pc, vec2(0.5), vec2(float(uRes) - 0.5))) prev = texture(uPrev, pc / float(uRes));
  // Kırılma olasılığı: çözülen J ile hücreye sığmayan küçük dalgaların dağılımından.
  // Yakın (ince) haritada keskin, uzak (kaba) haritada yarı saydam bir kapsama oranı olur.
  float inject = 1.0 / (1.0 + exp(-1.702 * (uFoamP.z - J) * uFoamP.w));
  // Sırtlar her yerde değil, dalga gruplarının denk geldiği yerlerde aralıklı kırılır
  // (grup hızıyla rüzgar yönünde kayan maske). Yoksa ilerleyen sırt tüm yüzeyi süpürür.
  float groups = texture(uNoise, (wp - uGroups.yz) * uGroups.x).g;
  inject *= smoothstep(0.42, 0.62, groups);
  inject = inject < 0.02 ? 0.0 : inject;
  float amount = max(prev.r * exp(-uFoamP.x * uFoamP.y) - uQuant, inject);
  amount = min(amount + inject * uFoamP.x * 1.5, 1.5);
  float fresh = max(prev.g * exp(-uFoamP.x * 1.6) - uQuant, inject);
  // patlama köpüğü: sütunun dibinde kaynayan beyaz alan + geri düşen suyun halkası
  float ev = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uExplCount) break;
    vec4 E = uExplA[i];
    vec4 C = uExplC[i];
    float r = distance(wp, E.xy) / E.w;
    float tc = E.z - C.x;
    float disc = (1.0 - smoothstep(0.3 + 0.5 * smoothstep(0.0, 1.5, tc), 1.0 + 0.4 * smoothstep(0.0, 3.0, tc), r))
               * step(0.0, tc) * (1.0 - smoothstep(3.0, 6.0, tc)) * (1.0 - 0.4 * r);
    float tf = E.z - C.y;
    float ring = smoothstep(0.9, 1.4, r) * (1.0 - smoothstep(2.0, 2.8, r)) * smoothstep(-0.4, 0.2, tf) * (1.0 - smoothstep(1.5, 3.0, tf));
    ev = max(ev, max(disc, ring * 0.8) * C.w);
  }
  if (ev > 0.0) {
    // kaynayan beyaz su: iki ölçekte parçalı (düz beyaz bir tabak gibi durmasın)
    float n1 = texture(uNoise, wp * 0.07).r, n2 = texture(uNoise, wp * 0.21 + 0.37).r;
    ev *= smoothstep(0.3, 0.7, n1 * 0.6 + n2 * 0.4 + 0.25 * ev) * 0.9;
  }
  float evFoam = max(prev.a * uDecayA.x - uDecayA.y, ev);
  fragColor = vec4(amount, fresh, clamp(J * 0.5, 0.0, 1.0), evFoam);   // B: Jacobian (hata ayıklama için), A: olay köpüğü
}`;

// ---------------------------------------------------------------------------
// Izgaralar
// ---------------------------------------------------------------------------
// Kamerayı izleyen dairesel ızgara: merkezde sık, uzakta seyrek, ufka kadar.
// insertMin > 0 ise merkez yelpazesinin yerine çizilebilen sık ek halkalar da üretilir: kamera
// su çizgisindeyken çizilen yüzey, analitik testle piksel düzeyinde örtüşsün diye.
// Dizin düzeni: [ek halkalar | kaba merkez yelpazesi | dış halkalar]
function buildRadialGrid(segments, rings, r0, r1, rSkirt, insertMin = 0, insertRatio = 1.1) {
  const radii = [];
  for (let j = 0; j < rings; j++) radii.push(r0 * Math.pow(r1 / r0, j / (rings - 1)));
  radii.push(rSkirt);
  const ins = [];
  if (insertMin > 0) for (let r = insertMin; r < r0 / insertRatio; r *= insertRatio) ins.push(r);
  const all = ins.concat(radii);
  const R = all.length, K = ins.length;
  const positions = new Float32Array((1 + R * segments) * 3);
  let o = 3;
  for (let j = 0; j < R; j++) {
    const off = ((j - K) & 1) * 0.5;   // ana halkalar eskisi gibi dönüşümlü
    for (let i = 0; i < segments; i++) {
      const a = ((i + off) / segments) * TAU;
      positions[o++] = Math.cos(a) * all[j];
      positions[o++] = 0;
      positions[o++] = Math.sin(a) * all[j];
    }
  }
  const idx = [];
  const v = (j, i) => 1 + j * segments + (((i % segments) + segments) % segments);
  const band = (j) => {
    for (let i = 0; i < segments; i++) {
      idx.push(v(j, i), v(j, i + 1), v(j + 1, i));
      idx.push(v(j, i + 1), v(j + 1, i + 1), v(j + 1, i));
    }
  };
  if (K) {
    for (let i = 0; i < segments; i++) idx.push(0, v(0, i + 1), v(0, i));
    for (let j = 0; j < K; j++) band(j);
  }
  const insertCount = idx.length;
  for (let i = 0; i < segments; i++) idx.push(0, v(K, i + 1), v(K, i));
  const fanCount = idx.length - insertCount;
  for (let j = K; j < R - 1; j++) band(j);
  return { positions, indices: idx, insertCount, fanCount };
}

function buildRectGrid(w, d, nx, nz) {
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  let o = 0;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      positions[o++] = (i / nx - 0.5) * w;
      positions[o++] = 0;
      positions[o++] = (j / nz - 0.5) * d;
    }
  }
  const idx = [];
  const v = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      idx.push(v(i, j), v(i, j + 1), v(i + 1, j));
      idx.push(v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
    }
  }
  return { positions, indices: idx };
}

// ---------------------------------------------------------------------------
// Etkileşimli halka simülasyonu (isteğe bağlı)
// ---------------------------------------------------------------------------
class RippleSim {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.size = opts.size ?? 24;           // m, simülasyon penceresi
    this.res = opts.resolution ?? 256;
    this.speed = opts.speed ?? 0.9;        // m/s, halkaların yayılma hızı
    this.damping = opts.damping ?? 0.985;  // adım başına sönüm
    this.dx = this.size / this.res;
    this.center = [0, 0];
    this.shift = [0, 0];
    this.drops = [];
    this.accum = 0;
    this.program = createProgram(gl, FULLSCREEN_VS, RIPPLE_FS);
    this.tex = [];
    this.fbo = [];
    const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE);
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, this.res, this.res);
      setTexParams(gl, gl.TEXTURE_2D, { wrap: gl.CLAMP_TO_EDGE });
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.tex.push(t);
      this.fbo.push(f);
    }
    gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;
    this._dropData = new Float32Array(64);
  }

  get texture() { return this.tex[this.cur]; }
  get rect() { return [this.center[0] - this.size / 2, this.center[1] - this.size / 2, 1 / this.size]; }

  follow(x, z) {
    const cx = Math.round(x / this.dx) * this.dx;
    const cz = Math.round(z / this.dx) * this.dx;
    this.shift[0] += Math.round((cx - this.center[0]) / this.dx);
    this.shift[1] += Math.round((cz - this.center[1]) / this.dx);
    this.center[0] = cx;
    this.center[1] = cz;
  }

  addDrop(x, z, radius, strength) {
    if (this.drops.length < 64) this.drops.push([x, z, Math.max(radius, this.dx * 1.5), strength]);
  }

  update(dt, vao) {
    const gl = this.gl;
    this.accum = Math.min(this.accum + dt, 0.1);
    const step = 1 / 60;
    let steps = 0;
    while (this.accum >= step && steps < 4) {
      this.accum -= step;
      steps++;
      const p = this.program;
      const next = 1 - this.cur;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[next]);
      gl.viewport(0, 0, this.res, this.res);
      gl.useProgram(p.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
      gl.uniform1i(p.u.uState, 0);
      gl.uniform2i(p.u.uShift, this.shift[0], this.shift[1]);
      gl.uniform1i(p.u.uRes, this.res);
      const courant = Math.min((this.speed * step) / this.dx, 0.6);
      gl.uniform1f(p.u.uC2, courant * courant);
      gl.uniform1f(p.u.uDamp, this.damping);
      gl.uniform1f(p.u.uDx, this.dx);
      const r = this.rect;
      gl.uniform3f(p.u.uRect, r[0], r[1], this.size);
      const n = Math.min(this.drops.length, 16);
      for (let i = 0; i < n; i++) this._dropData.set(this.drops[i], i * 4);
      this.drops.splice(0, n);
      gl.uniform4fv(p.u.uDrops, this._dropData);
      gl.uniform1i(p.u.uDropCount, n);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cur = next;
      this.shift[0] = this.shift[1] = 0;
    }
    return steps > 0;
  }

  dispose() {
    const gl = this.gl;
    this.tex.forEach((t) => gl.deleteTexture(t));
    this.fbo.forEach((f) => gl.deleteFramebuffer(f));
    gl.deleteProgram(this.program.program);
  }
}

// ---------------------------------------------------------------------------
// Kalıcı köpük haritası (kamerayı izler; RGBA8, her yerde çalışır)
// ---------------------------------------------------------------------------
class FoamMap {
  constructor(gl, res, size, maxV, floatRT) {
    this.gl = gl;
    // RGBA8'de kare başına küçük sönüm 8 bit adımın altında kalır ve köpük hiç sönmez:
    // float hedef yoksa harita sabit 20 Hz adımla güncellenir ve doğrusal sönümle sıfıra iner.
    this.float = !!floatRT;
    this.step = this.float ? 0 : 1 / 20;
    this.accum = 0;
    this.res = res;
    this.size = size;
    this.ts = size / res;
    this.maxV = maxV;
    this.center = [0, 0];
    this.shift = [0, 0];
    this.programs = new Map();
    this.tex = [];
    this.fbo = [];
    const prevClear = gl.getParameter(gl.COLOR_CLEAR_VALUE);
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, this.float ? gl.RGBA16F : gl.RGBA8, res, res);
      setTexParams(gl, gl.TEXTURE_2D, { wrap: gl.CLAMP_TO_EDGE });
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.tex.push(t);
      this.fbo.push(f);
    }
    gl.clearColor(prevClear[0], prevClear[1], prevClear[2], prevClear[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.cur = 0;
  }

  get texture() { return this.tex[this.cur]; }
  get rect() { return [this.center[0] - this.size / 2, this.center[1] - this.size / 2, 1 / this.size]; }

  follow(x, z) {
    const cx = Math.round(x / this.ts) * this.ts;
    const cz = Math.round(z / this.ts) * this.ts;
    this.shift[0] += Math.round((cx - this.center[0]) / this.ts);
    this.shift[1] += Math.round((cz - this.center[1]) / this.ts);
    this.center[0] = cx;
    this.center[1] = cz;
  }

  program(depthMap) {
    const key = depthMap ? 1 : 0;
    let p = this.programs.get(key);
    if (!p) {
      p = createProgram(this.gl, FULLSCREEN_VS, FOAM_FS, { MAXV: this.maxV, DEPTHMAP: !!depthMap });
      this.programs.set(key, p);
    }
    return p;
  }

  // water: Water örneği (dalga dizileri, detay dokusu, parametreler buradan okunur)
  update(water, dt, inject, vao) {
    const gl = this.gl;
    this.accA = this.accA || 0;
    if (this.step > 0) {
      this.accum += dt;
      if (this.accum < this.step) return;
      dt = Math.min(this.accum, 0.2);
      this.accum = 0;
    }
    const P = water.params;
    const p = this.program(water.depthMap);
    const u = p.u;
    const next = 1 - this.cur;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[next]);
    gl.viewport(0, 0, this.res, this.res);
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[this.cur]);
    gl.uniform1i(u.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, water._detailDispTex);
    gl.uniform1i(u.uDetailDisp, 1);
    gl.uniform2i(u.uShift, this.shift[0], this.shift[1]);
    gl.uniform1i(u.uRes, this.res);
    const r = this.rect;
    gl.uniform3f(u.uRect, r[0], r[1], this.size);
    gl.uniform4fv(u.uWaveA, water._wA);
    gl.uniform4fv(u.uWaveB, water._wB);
    gl.uniform1i(u.uWaveCount, water._waveCount);
    const set = water._set;
    gl.uniform4f(u.uDetailParams, 1 / set.PA, 1 / set.PB, water.q.detailSize, 1 / Math.log2(water.q.detailSize / (4 * DETAIL_CMIN)));
    gl.uniform4fv(u.uDispDecode, water._dispDecode || [1, 1, 1, 0]);
    gl.uniform2fv(u.uFlow, P.flow);
    gl.uniform1f(u.uTime, water.time);
    // köpük ömrü rüzgarla uzar (fırtınada eski köpük dalgaları ağ gibi kaplar)
    const decay = 0.22 * clamp(10 / Math.max(P.windSpeed, 1), 0.5, 1);
    gl.uniform4f(u.uFoamP, dt, decay, inject.z, inject.invSigma);
    // küçük doğrusal sönüm: üstel kuyruk sonsuza kadar sürmesin (köpüksüz yüzeyde dallar atlanır)
    gl.uniform1f(u.uQuant, this.float ? dt * 0.01 : 1.5 / 255);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, water._noiseTex);
    gl.uniform1i(u.uNoise, 3);
    // dalga grupları: ölçek ~2 tepe dalga boyu, grup hızı = faz hızının yarısı
    const kp = set.kp, cg = 0.5 * Math.sqrt(GRAVITY / kp), Lg = (2 * TAU) / kp;
    const ga = P.windDirection * DEG, gx = Math.cos(ga) * cg * water.time, gz = Math.sin(ga) * cg * water.time;
    gl.uniform4f(u.uGroups, 1 / Lg, gx % (Lg * 64), gz % (Lg * 64), 0);
    const wa = P.windDirection * DEG, drift = (0.03 * P.windSpeed) / this.ts;
    gl.uniform2f(u.uDrift, Math.cos(wa) * drift, Math.sin(wa) * drift);
    gl.uniform1f(u.uBreakK, water._breakK);
    gl.uniform1f(u.uLevel, water.level);
    gl.uniform4fv(u.uExplA, water._explA);
    gl.uniform4fv(u.uExplC, water._explC);
    gl.uniform1i(u.uExplCount, water._explCount);
    // olay köpüğü ~25 s'de söner: yarım-float/8 bitte her kare küçük azalma yuvarlanıp kaybolmasın
    // diye azalma birikmiş adımlarla uygulanır (yüksek kare hızında da aynı ömür)
    this.accA += dt;
    const stepA = this.float ? 1 / 30 : 0.25;
    if (this.accA >= stepA) {
      gl.uniform2f(u.uDecayA, Math.exp(-this.accA / 25), this.float ? this.accA * 0.01 : (0.6 / 255) * (this.accA / 0.25));
      this.accA = 0;
    } else {
      gl.uniform2f(u.uDecayA, 1, 0);
    }
    if (water.depthMap) {
      const d = water.depthMap;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, d.texture);
      gl.uniform1i(u.uDepthMap, 2);
      gl.uniform4f(u.uDepthRect, d.rect[0], d.rect[1], 1 / d.rect[2], 1 / d.rect[3]);
      gl.uniform2fv(u.uDepthDecode, d.decode);
    }
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = next;
    this.shift[0] = this.shift[1] = 0;
  }

  dispose() {
    const gl = this.gl;
    this.tex.forEach((t) => gl.deleteTexture(t));
    this.fbo.forEach((f) => gl.deleteFramebuffer(f));
    for (const p of this.programs.values()) gl.deleteProgram(p.program);
  }
}

// ---------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------
/**
 * new Water(gl, {
 *   preset: 'ocean' | 'pond' | ... | { ...parametreler },
 *   params: { ...ön ayarın üstüne yazılacaklar },
 *   quality: 'low' | 'medium' | 'high',
 *   shape: { type: 'infinite', radius? }                       // ufka kadar deniz
 *        | { type: 'rect', center: [x, z], size: [w, d] }       // gölet, göl, nehir
 *        | { type: 'mesh', positions, indices, flows?, cellSize? }, // kendi ağın (eğimli nehir...)
 *   level: 0,                 // su yüksekliği (y)
 *   toneMapping: false,       // true: çıktıyı AgX ton eşleme ile doğrudan ekrana yaz
 *   ripples: false | { size, resolution, speed, damping },
 * })
 */
export class Water {
  constructor(gl, options = {}) {
    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
      throw new Error('water.js WebGL2 bağlamı gerektirir');
    }
    this.gl = gl;
    this.caps = detectCaps(gl);
    this.qualityName = QUALITY[options.quality] ? options.quality : 'medium';
    this.q = QUALITY[this.qualityName];
    this.level = options.level ?? 0;
    this.toneMapping = !!options.toneMapping;
    this.time = 0;
    this.params = copyParams({ ...resolvePreset(options.preset), ...(options.params || {}) });
    this.env = {
      envMap: null, envScale: 4, envMaxLod: 3, envSize: 8,
      sunDirection: [0.4, 0.6, 0.3], sunColor: [1.5, 1.4, 1.2], fogDensity: 0.0004, exposure: 1,
    };
    this.depthMap = null;
    this.flowMap = null;
    this.ripples = null;

    this._maxV = this.q.vertexWaves * 2;    // geçişlerde iki set aynı anda
    this._maxD = this.q.detailWaves * 2;
    this._wA = new Float32Array(this._maxV * 4);
    this._wB = new Float32Array(this._maxV * 4);
    this._dW = new Float32Array(this._maxD * 2 * 4);
    this._waveCount = 0;
    this._countA = 0;
    this._countB = 0;
    this._varA = 0;
    this._varB = 0;
    this._viewProj = new Float32Array(16);
    this._invViewProj = new Float32Array(16);
    this._camPos = [0, 10, 0];
    this._programs = new Map();
    this._transition = null;
    // su üstü/altı (updateNear): kamera ortamı, yakın düzlem ızgarası, ızgara merkezi kayması
    this.sceneLit = !!options.sceneLit;
    this.explosionsWarm = !!options.explosions;   // patlama shader'larını açılışta arka planda hazırla
    // su altı patlamaları (en fazla 4 eş zamanlı)
    this._expl = [];
    this._explA = new Float32Array(16);
    this._explB = new Float32Array(16);
    this._explC = new Float32Array(16);
    this._explCount = 0;
    this._flash = new Float32Array(4);   // o anki en parlak flaş: konum, şiddet
    // lense sıçrayan su: ekran uzayında damlalar (x, y uv; r ekran yüksekliği) ve süzülen film
    // ıslaklık ızgarası (ekran 16x9 hücre): hücre suda mı, ne kadardır, üstündeki su filmi, s (m)
    this._lens = { drops: [], acc: 0, lastT: -1, seed: 12345, down: [0, -1], slide: 1, aspect: 16 / 9,
      active: false, rt: null, buf: null, filmMax: 0,
      sub: new Uint8Array(LENS_GX * LENS_GY), subT: new Float32Array(LENS_GX * LENS_GY),
      film: new Float32Array(LENS_GX * LENS_GY), S: new Float32Array(LENS_GX * LENS_GY).fill(1e3) };
    const hiGrid = this.q === QUALITY.high;
    this._med = {
      N: hiGrid ? 64 : 32, M: hiGrid ? 36 : 18,
      info: new Float32Array([0, 0, 2, 0]),
      vp: new Float32Array(16), ivp: new Float32Array(16),
      fwd: [0, 0, -1], near: 0.3, off: [0, 0], lastT: -1, camH: 1e3, insert: false,
      state: { mode: 'air', depth: 0, height: 1e3, nearTexture: null, grid: [0, 0] },
    };

    this._emptyVao = gl.createVertexArray();
    this._createShape(options.shape || { type: 'infinite' });
    this._createDetailTarget();
    this._createNoiseTexture();
    this._createDefaultEnv();
    this._detailProgram = createProgram(gl, FULLSCREEN_VS, DETAIL_FS, {
      DMAX: this._maxD,
      DETAIL_RGBA8: !this._detailFloat,
    });
    this._set = this._buildSet(this.params, null);
    this._next = null;
    if (options.ripples) this.enableRipples(options.ripples === true ? {} : options.ripples);
    // iki seviyeli kalıcı köpük: yakın (ince) ve uzak (kaba) harita
    this._foamMaps = [
      new FoamMap(gl, this.q.foamRes, this.q.foamSize, this._maxV, this.caps.floatRT),
      new FoamMap(gl, 256, this.q.foamFarSize, this._maxV, this.caps.floatRT),
    ];
    this._packWaves();
  }

  // ---------------- genel API ----------------

  /** Ön ayar uygula. duration > 0 ise dalgalar ve renkler yumuşakça geçer. */
  setPreset(preset, { duration = 0, params = {} } = {}) {
    const target = copyParams({ ...resolvePreset(preset), ...params });
    if (duration > 0) {
      this._finishTransition();
      this._next = this._buildSet(target, { PA: this._set.PA, PB: this._set.PB });
      this._transition = { from: this.params, to: target, t: 0, duration };
    } else {
      this._transition = null;
      this._next = null;
      this.params = target;
      this._set = this._buildSet(this.params, null);
    }
  }

  /** Parametrelerin bir kısmını değiştir (ör. { windSpeed: 15 }). */
  set(partial) {
    this._finishTransition();
    let rebuild = false;
    for (const k in partial) {
      if (!(k in DEFAULT_PARAMS)) continue;
      const v = partial[k];
      if (WAVE_KEYS.includes(k) && v !== this.params[k]) rebuild = true;
      this.params[k] = Array.isArray(v) ? v.slice() : v;
    }
    if (rebuild) this._set = this._buildSet(this.params, null);
  }

  /** Ortam: gökyüzü küp haritası, güneş, sis. Sky.applyTo(water) bunu çağırır. */
  setEnvironment(env) {
    Object.assign(this.env, env);
    if (!env.envMap && env.envMap !== undefined) this.env.envMap = this._defaultEnv;
  }

  /**
   * Zemin yükseklik haritası (isteğe bağlı): sığ suda dalgalar küçülür, kıyı köpüğü
   * sahne derinliği olmadan da çalışır. rect: [minX, minZ, boyutX, boyutZ].
   * data (Float32Array) verilirse sample() de sığlığı hesaba katar.
   */
  setDepthMap(opts) {
    this.depthMap = opts ? { decode: [1, 0], ...opts } : null;
  }

  /**
   * Akış haritası (nehirler): RG = akış (m/s), B = ek köpük (çağlayan/akıntı).
   * rect: [minX, minZ, boyutX, boyutZ]. data (RGBA Float32Array) verilirse sample() akışı da döndürür.
   */
  setFlowMap(opts) {
    this.flowMap = opts ? { decode: [1, 0], ...opts } : null;
  }

  /** Etkileşimli halkaları aç (yağmur, oyuncu adımları, düşen nesneler). */
  enableRipples(opts = {}) {
    if (!this.caps.floatRT) {
      console.warn('water.js: EXT_color_buffer_float yok, halkalar kapalı');
      return false;
    }
    if (this.ripples) this.ripples.dispose();
    this.ripples = new RippleSim(this.gl, opts);
    this.ripples.follow(this._camPos[0], this._camPos[2]);
    return true;
  }

  disableRipples() {
    if (this.ripples) this.ripples.dispose();
    this.ripples = null;
  }

  /** (x, z) noktasına damla/halka ekle. strength ≈ metre cinsinden çökme. */
  addRipple(x, z, radius = 0.25, strength = 0.03) {
    if (this.ripples) this.ripples.addDrop(x, z, radius, strength);
  }

  /** Düzlemsel yansıma için aynalanmış görüş matrisi (y = level düzlemine göre). */
  reflectionView(view, out = new Float32Array(16)) {
    const m = new Float32Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2 * this.level, 0, 1]);
    return mat4.multiply(out, view, m);
  }

  /** Zamanı ilerlet, detay dokusunu ve halkaları güncelle. Her karede render'dan önce çağır. */
  update(dt) {
    const gl = this.gl;
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    if (this._transition) {
      const tr = this._transition;
      tr.t = Math.min(1, tr.t + dt / tr.duration);
      this.params = lerpParams(tr.from, tr.to, smooth01(tr.t));
      if (tr.t >= 1) this._finishTransition();
    }
    this._packWaves();
    this._dt = dt;
    this._packExplosions(dt);

    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const vp = gl.getParameter(gl.VIEWPORT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);

    // detay dokusu
    const N = this.q.detailSize;
    const p = this._detailProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._detailFbo);
    gl.viewport(0, 0, N, N);
    gl.useProgram(p.program);
    gl.uniform4fv(p.u.uWaves, this._dW);
    gl.uniform1i(p.u.uCountA, this._countA);
    gl.uniform1i(p.u.uCountB, this._countB);
    gl.uniform2f(p.u.uPatchChop, this._set.PA, this._chopA);
    if (this._detailFloat) {
      gl.uniform4f(p.u.uEncScale, 1, 1, 1, 1);
      gl.uniform1f(p.u.uEncBias, 0);
      gl.uniform4f(p.u.uDispEnc, 1, 1, 1, 1);
      this._decode = [1, 1, 0];
      this._dispDecode = [1, 1, 1, 0];
    } else {
      const sa = 0.5 / (3.5 * Math.sqrt(this._varA + 1e-9));
      const sb = 0.5 / (3.5 * Math.sqrt(this._varB + 1e-9));
      gl.uniform4f(p.u.uEncScale, sa, sa, sb, sb);
      gl.uniform1f(p.u.uEncBias, 0.5);
      this._decode = [1 / sa, 1 / sb, -0.5];
      // RGBA8: genliğin toplamının ~%60'ı kadar aralık (nadir tepeler kırpılabilir)
      const eh = 0.5 / Math.max(0.6 * this._ampA, 1e-4);
      const ed = 0.5 / Math.max(0.6 * this._ampA * this._chopA, 1e-4);
      const et = 0.5 / Math.max(0.6 * this._akA * this._chopA, 1e-4);
      gl.uniform4f(p.u.uDispEnc, eh, ed, et, 0);
      this._dispDecode = [1 / eh, 1 / ed, 1 / et, -0.5];
    }
    gl.bindVertexArray(this._emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (this.ripples) {
      this.ripples.follow(this._camPos[0], this._camPos[2]);
      this.ripples.update(dt, this._emptyVao);
    }
    this._updateRain();
    // detay mip'leri (köpük haritası ve köşe shader'ı süzülmüş seviyeleri okur)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._detailTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, this._detailDispTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (dt > 0) {
      for (const fm of this._foamMaps) {
        fm.follow(this._camPos[0], this._camPos[2]);
        fm.update(this, dt, this._foamInjection(fm), this._emptyVao);
      }
    }

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    if (this._rain && this._rain.dirtyMips) {
      gl.bindTexture(gl.TEXTURE_2D, this._rain.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      this._rain.dirtyMips = false;
    }
    gl.depthMask(true);
  }

  /**
   * Suyu çiz.
   * camera:  { view, projection, position }
   * targets: { sceneColor, sceneDepth, reflection, width, height } (hepsi isteğe bağlı)
   *   sceneColor: suyun altındaki sahnenin doğrusal renk dokusu (kırılma için)
   *   sceneDepth: aynı sahnenin derinlik dokusu (DEPTH_COMPONENT, aynı projeksiyon)
   *   reflection: düzlemsel yansıma dokusu (alfa = geometri var/yok)
   *   width/height: suyun çizildiği hedefin boyutu (varsayılan: tuval)
   * Not: sceneDepth, çizim yapılan framebuffer'a bağlı olmamalı (kopyasını ver).
   */
  render(camera, targets = {}) {
    const gl = this.gl;
    const P = this.params;
    const env = this.env;
    const scene = !!(targets.sceneColor && targets.sceneDepth);
    const planar = !!targets.reflection;
    const prog = this._getWaterProgram(scene, planar);
    const u = prog.u;
    const cp = camera.position;
    this._camPos[0] = cp[0]; this._camPos[1] = cp[1]; this._camPos[2] = cp[2];
    mat4.multiply(this._viewProj, camera.projection, camera.view);

    gl.useProgram(prog.program);
    gl.uniformMatrix4fv(u.uViewProj, false, this._viewProj);
    gl.uniformMatrix4fv(u.uView, false, camera.view);
    gl.uniform3fv(u.uCameraPos, cp);
    const sh = this._shape;
    // su çizgisindeyken ızgara, kameranın altındaki yüzey noktasının ön görüntüsüne ortalanır
    // (fırtınada yatay kayma metrelerce olabilir; sık ek halkalar lensin önünde kalsın)
    if (sh.type === 'infinite') gl.uniform3f(u.uOrigin, cp[0] + this._med.off[0], this.level, cp[2] + this._med.off[1]);
    else if (sh.type === 'rect') gl.uniform3f(u.uOrigin, sh.center[0], this.level, sh.center[1]);
    else gl.uniform3f(u.uOrigin, 0, 0, 0);
    gl.uniform1f(u.uHsInv, 1 / this._set.Hs);
    this._bindWaveUniforms(u);
    this._bindMediumUniforms(u, 13, { width: targets.width, height: targets.height });
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, this._foamMaps[0].texture);
    gl.uniform1i(u.uFoamMap, 11);
    gl.uniform3fv(u.uFoamMapRect, this._foamMaps[0].rect);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, this._foamMaps[1].texture);
    gl.uniform1i(u.uFoamMapFar, 12);
    gl.uniform3fv(u.uFoamMapFarRect, this._foamMaps[1].rect);
    gl.uniform2f(u.uDetailVar, this._varA, this._varB);
    gl.uniform3fv(u.uDetailCovA, this._covA);
    gl.uniform3fv(u.uDetailCovB, this._covB);
    gl.uniform3fv(u.uDetailDecode, this._decode || [1, 1, 0]);
    gl.uniform3fv(u.uWaterColor, P.waterColor);
    gl.uniform3fv(u.uAbsorption, P.absorption);
    gl.uniform1f(u.uTurbidity, P.turbidity);
    gl.uniform3fv(u.uSssColor, P.sssColor);
    gl.uniform1f(u.uSss, P.sss);
    gl.uniform1f(u.uRoughness, P.roughness);
    if (u.uRefraction) gl.uniform1f(u.uRefraction, P.refraction);
    if (u.uEdgeSoftness) gl.uniform1f(u.uEdgeSoftness, Math.max(P.edgeSoftness, 0.001));
    gl.uniform4f(u.uFoam, Math.min(P.whitecaps, 1), P.foamStreaks, P.shoreFoam, Math.max(P.shoreFoamWidth, 0.01));
    gl.uniform3fv(u.uWhitecap, this._whitecapUniform());
    if (this._rain) {
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, this._rain.tex);
      gl.uniform1i(u.uRainTex, 9);
      gl.uniform2f(u.uRainParams, 1 / this._rain.tile, 0.22 * Math.sqrt(P.rain));
    }
    gl.uniform4f(u.uFoam2, P.flowFoam, Math.max(P.foamScale, 0.1), P.foamStreaks, 0);
    // hafif rüzgarda kısa dalgalar yama yamadır (kedi pençesi); kuvvetli rüzgarda her yeri kaplar
    const gt = clamp((P.windSpeed - 2) / 7, 0, 1);
    gl.uniform2f(u.uGust, lerp(0.3, 0.85, gt), lerp(1.3, 1.1, gt));
    const wa = P.windDirection * DEG;
    gl.uniform2f(u.uWindDir, Math.cos(wa), Math.sin(wa));
    if (u.uCaustics) gl.uniform2f(u.uCaustics, P.caustics, 1 / Math.max(P.causticScale, 0.05));
    gl.uniform1f(u.uEnvSize, env.envSize);

    // dokular
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._detailTex);
    gl.uniform1i(u.uDetail, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._noiseTex);
    gl.uniform1i(u.uNoise, 1);
    bindEnvironment(gl, u, { ...env, envMap: env.envMap || this._defaultEnv }, 2);

    const width = targets.width || gl.drawingBufferWidth;
    const height = targets.height || gl.drawingBufferHeight;
    if (u.uScreenSize) gl.uniform2f(u.uScreenSize, width, height);
    if (scene) {
      mat4.invert(this._invViewProj, this._viewProj);
      gl.uniformMatrix4fv(u.uInvViewProj, false, this._invViewProj);
      gl.uniform2f(u.uProjZ, camera.projection[10], camera.projection[14]);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, targets.sceneColor);
      gl.uniform1i(u.uSceneColor, 3);
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, targets.sceneDepth);
      gl.uniform1i(u.uSceneDepth, 4);
    }
    if (planar) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, targets.reflection);
      gl.uniform1i(u.uReflection, 5);
      gl.uniform1f(u.uReflectionDistort, targets.reflectionDistort ?? 1);
      gl.uniformMatrix4fv(u.uViewProj, false, this._viewProj);
      gl.uniform1f(u.uPixelAngle, 2 / (camera.projection[5] * height));
    }
    if (this.ripples) {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this.ripples.texture);
      gl.uniform1i(u.uRipple, 6);
      gl.uniform3fv(u.uRippleRect, this.ripples.rect);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(sh.vao);
    if (!sh.hasFlow) gl.vertexAttrib2f(1, 0, 0);
    const isz = sh.indexType === gl.UNSIGNED_INT ? 4 : 2;
    if (sh.insertCount && this._med.insert) {
      // kamera su çizgisinde: merkez yelpazesi yerine sık ek halkalar
      const o = sh.insertCount + sh.fanCount;
      gl.drawElements(gl.TRIANGLES, sh.insertCount, sh.indexType, 0);
      gl.drawElements(gl.TRIANGLES, sh.count - o, sh.indexType, o * isz);
    } else {
      gl.drawElements(gl.TRIANGLES, sh.count - sh.insertCount, sh.indexType, sh.insertCount * isz);
    }
    gl.bindVertexArray(null);
    // sahne dokularını çöz (geri besleme döngüsü olmasın)
    for (const unit of u.uNearMap ? [3, 4, 5, 6, 13] : [3, 4, 5, 6]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * CPU tarafında su yüzeyini örnekle (yüzen nesneler, tekneler, oyuncu).
   * Döner: { height, normal: [x,y,z], flow: [x,z] }
   * Ekrandaki geometriyle aynıdır: büyük dalgalar + geometri olarak çizilen küçük dalgalar
   * (aynı mesafe/ızgara süzmesiyle). Yalnızca normal haritası olan en küçük pürüzler dahil değil.
   */
  sample(x, z, out = { height: 0, normal: [0, 1, 0], flow: [0, 0] }) {
    const A = this._wA, B = this._wB, n = this._waveCount;
    const cam = this._camPos;
    const lod = this._shape.lod;
    const depth = this._sampleDepth(x, z);
    const shallow = clamp(depth * this._breakK, 0, 1);
    const spacingAt = (gx, gz) => Math.max(lod[0], Math.hypot(gx - cam[0], this.level - cam[1], gz - cam[2]) * lod[1]);
    const fade = (k, sp) => (1 - smooth01(clamp((sp * k * 0.1591549 - 0.16) / 0.17, 0, 1))) * shallow;
    const det = this._dtmp || (this._dtmp = new Float64Array(5));
    // yatay kaymayı ters çöz: g + D(g) = (x, z). Newton (büyük dalgaların Jacobian'ı; detay için
    // yarı-Newton), sıkışmış tepelerde sabit nokta yinelemesi yavaş yakınsar
    let gx = x, gz = z;
    for (let it = 0; it < 6; it++) {
      const sp = spacingAt(gx, gz);
      this._detailAt(gx, gz, sp, shallow, det);
      let dx = det[1], dz = det[2], jxx = 1, jxz = 0, jzz = 1;
      for (let i = 0; i < n; i++) {
        const k = A[i * 4 + 2];
        const f = fade(k, sp);
        if (f <= 0) continue;
        const ux = A[i * 4], uz = A[i * 4 + 1];
        const th = k * (ux * gx + uz * gz) + A[i * 4 + 3];
        const c = B[i * 4 + 1] * f;
        const co = Math.cos(th), kc = k * c * Math.sin(th);
        dx += c * ux * co;
        dz += c * uz * co;
        jxx -= kc * ux * ux; jxz -= kc * ux * uz; jzz -= kc * uz * uz;
      }
      const rx = gx + dx - x, rz = gz + dz - z;
      if (rx * rx + rz * rz < 1e-8) break;
      const dj = jxx * jzz - jxz * jxz;
      if (dj > 0.1) {
        gx -= (jzz * rx - jxz * rz) / dj;
        gz -= (jxx * rz - jxz * rx) / dj;
      } else {
        gx -= rx * 0.7;
        gz -= rz * 0.7;
      }
    }
    const sp = spacingAt(gx, gz);
    this._detailAt(gx, gz, sp, shallow, det);
    const fade2 = (k) => fade(k, sp);
    let h = det[0];
    let tx = 1, ty = 0, tz = 0, bx = 0, by = 0, bz = 1, vy = 0;
    for (let i = 0; i < n; i++) {
      const k = A[i * 4 + 2], ux = A[i * 4], uz = A[i * 4 + 1];
      const f = fade2(k);
      if (f <= 0) continue;
      const a = B[i * 4] * f, c = B[i * 4 + 1] * f;
      const th = k * (ux * gx + uz * gz) + A[i * 4 + 3];
      const s = Math.sin(th), co = Math.cos(th);
      h += a * s;
      vy -= a * B[i * 4 + 2] * co;   // faz = faz0 - ω·t → ∂h/∂t
      const ka = k * a * co, kc = k * c * s;
      tx -= kc * ux * ux; ty += ka * ux; tz -= kc * ux * uz;
      bx -= kc * ux * uz; by += ka * uz; bz -= kc * uz * uz;
    }
    if (this._explCount) {
      const bl = this._blastAt(gx, gz, sp, this.time, this._btmp || (this._btmp = [0, 0, 0]));
      h += bl[0]; ty += bl[1]; by += bl[2];
      // patlamanın dikey hızı: zamanda ileri fark
      const b2 = this._blastAt(gx, gz, sp, this.time + 0.02, this._btmp2 || (this._btmp2 = [0, 0, 0]))[0];
      vy += (b2 - bl[0]) / 0.02;
    }
    out.vy = vy;   // büyük dalgalar + patlama (detay dalgacıkları hariç)
    const nyG = bz * tx - bx * tz;
    // büyük dalga normali → eğim; küçük dalgaların eğimini ekle
    const sxT = -(by * tz - bz * ty) / nyG + det[3];
    const szT = -(bx * ty - by * tx) / nyG + det[4];
    const l = Math.hypot(sxT, 1, szT);
    out.height = this.level + h;
    out.normal[0] = -sxT / l; out.normal[1] = 1 / l; out.normal[2] = -szT / l;
    if (out.grid) { out.grid[0] = gx; out.grid[1] = gz; }   // yüzey noktasının ızgara ön görüntüsü
    const fl = this._sampleFlow(x, z);
    out.flow[0] = this.params.flow[0] + fl[0];
    out.flow[1] = this.params.flow[1] + fl[1];
    return out;
  }

  /**
   * Su üstü / su altı aynı anda: kameranın yakın düzleminin suyla ilişkisini hesapla.
   * Her karede update()'ten sonra, sahne çizilmeden önce çağır (camera = { view, projection,
   * position }). Su çizgisindeyken küçük bir GPU geçişi çalışır (~0.01-0.03 ms), değilse hiç.
   * Lensteki damlaları ve filmi de günceller (lens boşken maliyetsiz). Geçişler kendi FBO'larını
   * kullanır ve önceki framebuffer/viewport'u geri yükler; karışım, derinlik testi ve yüz ayıklama
   * kapalı kalır (update() gibi).
   * Döner (water.medium ile aynı): { mode: 'air'|'water'|'straddle', depth, height }
   *   depth: kameranın yüzeyin altındaki derinliği (m, ≥ 0), height: yüzeyin üstündeki yüksekliği
   */
  updateNear(camera) {
    const md = this._med;
    md.inNear = true;
    md.tgt = null;
    const proj = camera.projection, view = camera.view, cp = camera.position;
    this._camPos[0] = cp[0]; this._camPos[1] = cp[1]; this._camPos[2] = cp[2];
    mat4.multiply(md.vp, proj, view);
    mat4.invert(md.ivp, md.vp);
    md.near = proj[14] / (proj[10] - 1);
    md.fwd[0] = -view[2]; md.fwd[1] = -view[6]; md.fwd[2] = -view[10];
    const iv = md.ivp;
    const smp = this._nearSmp || (this._nearSmp = { height: 0, normal: [0, 1, 0], flow: [0, 0], grid: [0, 0] });
    const sh = this._shape, B0 = this._wB;
    // en büyük olası yüzey sapması (dikey ve yatay): uzaktayken örneklemeye gerek yok
    let ampV = (this._ampA || 0) * 1.5, ampH = (this._ampA || 0) * (this._chopA || 0) * 1.5;
    for (let i = 0; i < this._waveCount; i++) { ampV += B0[i * 4]; ampH += B0[i * 4 + 1]; }
    for (const e of this._expl) ampV += e.dome + e.crater;
    // dikdörtgen su: sınırın (yatay kayma payıyla) dışındaki noktalar havadır
    let rect = null;
    if (sh.type === 'rect') {
      const hw = sh.size[0] / 2 + ampH + 0.5, hd = sh.size[1] / 2 + ampH + 0.5;
      rect = [sh.center[0] - hw, sh.center[1] - hd, sh.center[0] + hw, sh.center[1] + hd];
    }
    const inside = (x, z) => !rect || (x > rect[0] && x < rect[2] && z > rect[1] && z < rect[3]);
    const nearSize = md.near * 2.5;
    let minS = Infinity, maxS = -Infinity, sC = 0, x0 = 0, y0 = 0, z0 = 0, diag = 0, camS;
    const far = Math.abs(cp[1] - this.level) > ampV + nearSize + 0.5;
    if (sh.type === 'mesh' || far || !inside(cp[0], cp[2])) {
      // ağ şeklinde (eğimli nehir) seviye bilinmez: su üstü/altı desteklenmez, hep hava
      camS = sh.type === 'mesh' || !inside(cp[0], cp[2]) ? 1e3 : cp[1] - this.level;
      minS = maxS = sC = camS;
      smp.grid[0] = cp[0]; smp.grid[1] = cp[2];
    } else {
      // yakın düzlemin köşeleri ve merkezi (NDC z = -1)
      for (let k = 0; k < 5; k++) {
        const nx = k === 4 ? 0 : (k & 1 ? 1 : -1), ny = k === 4 ? 0 : (k & 2 ? 1 : -1);
        const w = iv[3] * nx + iv[7] * ny - iv[11] + iv[15];
        const px = (iv[0] * nx + iv[4] * ny - iv[8] + iv[12]) / w;
        const py = (iv[1] * nx + iv[5] * ny - iv[9] + iv[13]) / w;
        const pz = (iv[2] * nx + iv[6] * ny - iv[10] + iv[14]) / w;
        const sv = inside(px, pz) ? py - this.sample(px, pz, smp).height : 1e3;
        minS = Math.min(minS, sv);
        maxS = Math.max(maxS, sv);
        if (k === 0) { x0 = px; y0 = py; z0 = pz; }
        if (k === 3) diag = Math.hypot(px - x0, py - y0, pz - z0);
        if (k === 4) sC = sv;
      }
      // kameranın kendi konumu: yükseklik ve ızgara ön görüntüsü
      camS = cp[1] - this.sample(cp[0], cp[2], smp).height;
    }
    md.rect = rect;
    // CPU örneklemesi ile GPU yüzeyi arasındaki farkı ve köşeler arası eğriliği kapsayan pay
    const A = this._wA, B = this._wB, r0 = this._shape.lod[0];
    let kap = (this._akA || 0) * TAU / (4 * r0);
    for (let i = 0; i < this._waveCount; i++) {
      const k = A[i * 4 + 2];
      kap += B[i * 4] * k * k * (1 - smooth01(clamp((r0 * k * 0.1591549 - 0.16) / 0.17, 0, 1)));
    }
    const loose = this.flowMap || this._shape.hasFlow || !this.caps.floatRT;
    const margin = 0.125 * kap * diag * diag + 0.02 + (loose ? 0.1 : 0);
    const mode = minS > margin ? 0 : maxS < -margin ? 1 : 2;
    if (mode === 2) this._renderNear();
    if (mode !== 0) this._renderMedConst();
    // yüzeye yaklaşırken su altı shader varyantlarını arka planda derle (dalışta takılma olmasın);
    // ön ayar/bayrak değişince yeni anahtarlar da yakalansın diye ara ara bakılır
    if (mode === 0 && Math.abs(camS) < 8 && (md.warmTick = (md.warmTick || 0) + 1) % 30 === 1) this._warmUnderwater();
    const info = md.info;
    info[0] = mode;
    info[1] = this._nearRT && this._nearRT.packed ? 1 : 0;
    info[2] = 2;
    info[3] = Math.max(-sC, 0);
    md.camH = camS;
    md.insert = mode === 2 || Math.abs(sC) < 0.5;
    // ızgara merkezini, kameranın altındaki yüzey noktasının ön görüntüsüne yumuşakça taşı
    const near = Math.abs(camS) < 3 && this._shape.type === 'infinite';
    const tx = near ? smp.grid[0] - cp[0] : 0, tz = near ? smp.grid[1] - cp[2] : 0;
    const dt = md.lastT < 0 ? 1 : Math.max(this.time - md.lastT, 0);
    md.lastT = this.time;
    const kk = 1 - Math.exp(-dt / 0.08);
    md.off[0] += (tx - md.off[0]) * kk;
    md.off[1] += (tz - md.off[1]) * kk;
    this._updateLens(camera);
    const st = md.state;
    st.mode = mode === 0 ? 'air' : mode === 1 ? 'water' : 'straddle';
    st.depth = Math.max(-camS, 0);
    st.height = camS;
    st.nearTexture = this._nearRT ? this._nearRT.tex : null;
    st.grid[0] = md.N; st.grid[1] = md.M;
    md.inNear = false;
    md.tgt = null;
    return st;
  }

  /**
   * Su altı patlaması. (x, z): patlama noktası. radius: yüzeyde etkilenen yarıçap (m),
   * height: su sütununun yüksekliği (m), depth: patlayıcının derinliği (m; derin patlamada
   * sütun alçak, kubbe ve halkalar kalır). En fazla 4 patlama aynı anda; en eskisi düşer.
   * Döner: olay nesnesi { x, z, t0, R, H, vent, fall, ... } (oyun mantığı için).
   */
  explode(x, z, { radius = 6, height = 18, depth = 2, seed } = {}) {
    const R = Math.max(radius, 0.5);
    const floor = this._sampleDepth(x, z);   // su derinliği (derinlik haritası yoksa çok büyük)
    depth = Math.min(Math.max(depth, 0), Math.max(floor - 0.2, 0));   // patlayıcı en fazla dipte
    const deep = smooth01(clamp((depth - 0.8 * R) / R, 0, 1));   // derinse yüzeyi az deler
    const H = Math.max(height, 0.5) * (1 - 0.7 * deep);
    const vent = 0.15 + 0.04 * Math.max(depth, 0);
    const dome = Math.min(0.3 * Math.max(height, 0.5), 0.7 * R) * (1 - 0.4 * deep);
    const ev = {
      x, z, t0: this.time, R, H, depth, floor, vent,
      fall: vent + 2 * Math.sqrt((2 * H) / GRAVITY) * 1.1,   // sütunun geri düşme anı (sürtünmeyle)
      dome, crater: dome * 0.55, life: 50,
      flash: 2500 * (R / 6) ** 2,   // flaş şiddeti (W/sr benzeri, sahne birimlerinde)
      seed: normSeed(seed ?? Math.random() * 4294967296),
    };
    this._expl.push(ev);
    if (this._expl.length > 4) this._expl.shift();
    this._packExplosions(this._dt || 0);   // aynı kare aralığı: yeni olay bu karede karanlık sayılır
    this._warmExplosions();
    return ev;
  }

  /** Etkin patlamalar (salt okunur liste) */
  get explosions() {
    return this._expl;
  }

  /**
   * Lense su sıçrat: kameranın önünde damlalar (kayar, iz bırakır, birleşir, kurur) ve
   * istenirse süzülen su filmi. amount: 1 ≈ sudan çıkış (~26 damla), film: 0..1.
   * Su lensin bir kısmından çekilince (sudan çıkış, su çizgisinde dalga) ve patlama serpintisinin
   * içinde updateNear() bunu kendiliğinden yapar; lensin suda kalan kısmındaki damlalar suya karışır.
   * Görüntüye son işleme geçişinde WaterGLSL.lens + bindLens() ile uygulanır.
   */
  lensSplash(amount = 1, { film = 0 } = {}) {
    if (this._med.info[0] === 1) return;   // lens tamamen suyun içinde
    const n = Math.round(clamp(amount, 0, 3) * 26);
    for (let i = 0; i < n; i++) this._addDrop();
    this._wetFilm(clamp(film, 0, 1));
    this._warmLens();
  }

  /** Lens durumu (salt okunur): { active, drops, film (en kalın), texture } */
  get lens() {
    const L = this._lens;
    return { active: L.active, drops: L.drops.length, film: L.filmMax, texture: L.rt ? L.rt.tex : null };
  }

  /**
   * Patlamanın (x, y, z)'deki bir cisme verdiği fırlatma hızı [vx, vy, vz] (m/s) ya da null.
   * Sütunun açıldığı anda uygulanmalı (ev.vent saniye sonra); su ile aynı hız profili.
   */
  blastKick(x, y, z, ev) {
    const dx = x - ev.x, dz = z - ev.z, r = Math.hypot(dx, dz);
    if (r > 1.6 * ev.R || y < this.level - ev.depth - 1) return null;
    // sütunun o yükseklikte kalan hızı (sütunun ulaşmadığı yükseklikte fırlatma yok)
    const vc = Math.sqrt(2 * GRAVITY * ev.H) * Math.exp(-1.5 * (r / ev.R) ** 2);
    const v2 = vc * vc - 2 * GRAVITY * Math.max(y - this.level, 0);
    if (v2 <= 0) return null;
    const V0 = Math.sqrt(v2) * 0.85;
    const hx = r > 1e-3 ? dx / r : 0, hz = r > 1e-3 ? dz / r : 0;
    const l = Math.hypot(0.35, 1);
    return [(hx * 0.35 * V0) / l, V0 / l, (hz * 0.35 * V0) / l];
  }

  /**
   * Patlama spreyini çiz (water.render'dan sonra, aynı hedefe). Patlama yoksa hiçbir şey yapmaz.
   */
  renderEffects(camera) {
    // sütun ancak açılma anından sonra görünür; programlar arka planda derlenir ve hazır olunca
    // çizilir (ilk karede takılma olmasın). Kamera su altındaysa kabarcık hemen başlar.
    const mode = this._med.info[0], under = mode !== 0;
    if (!this._expl.some((e) => this.time - e.t0 > (under ? 0 : e.vent))) return;
    const gl = this.gl;
    // tamamen su altındayken sprey çizilmez: yüzeyin üstü yalnızca Snell penceresinden görünür
    let spray = mode !== 1 && this._expl.some((e) => {
      const tv = this.time - e.t0 - e.vent;
      return tv > 0 && tv <= 12;
    });
    if (spray) {
      if (!this._spray) this._spray = createProgramDeferred(gl, SPRAY_VS, SPRAY_FS, { TONEMAP: this.toneMapping });
      spray = this._programReady(this._spray);
    }
    if (!spray && !under) return;
    const blendOn = gl.isEnabled(gl.BLEND);
    const bs = [gl.BLEND_SRC_RGB, gl.BLEND_DST_RGB, gl.BLEND_SRC_ALPHA, gl.BLEND_DST_ALPHA].map((q) => gl.getParameter(q));
    mat4.multiply(this._viewProj, camera.projection, camera.view);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this._emptyVao);
    // kamera suya girdiyse: gaz kabarcığı ve kabarcık bulutu (önce: opak küre derinlik yazar, arkasındaki
    // sprey gizlenir, öndeki üstüne karışır)
    if (under) this._renderBubbles(camera);
    if (spray) {
      const pr = this._spray, u = pr.u, v = camera.view;
      gl.useProgram(pr.program);
      gl.uniformMatrix4fv(u.uViewProj, false, this._viewProj);
      gl.uniform3fv(u.uCameraPos, camera.position);
      gl.uniform3f(u.uCamRight, v[0], v[4], v[8]);
      gl.uniform3f(u.uCamUp, v[1], v[5], v[9]);
      gl.uniform1f(u.uSprayCut, mode !== 0 ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this._noiseTex);
      gl.uniform1i(u.uNoise, 1);
      bindEnvironment(gl, u, { ...this.env, envMap: this.env.envMap || this._defaultEnv }, 2);
      for (const ev of this._expl) {
        const tv = this.time - ev.t0 - ev.vent;
        if (tv <= 0 || tv > 12) continue;
        const sheets = 220, streaks = 1400;
        gl.uniform4f(u.uSprayA, ev.x, ev.z, tv, ev.R);
        gl.uniform4f(u.uSprayB, ev.H, ev.seed % 65536, sheets, this.level);
        gl.uniform1f(u.uSeedF, (ev.seed % 997) / 997);
        gl.uniform1f(u.uFade, 1 - smooth01(clamp((tv - 8) / 4, 0, 1)));
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, sheets + streaks);
      }
    }
    gl.bindVertexArray(null);
    // oyunun karışım ayarını geri yükle
    gl.blendFuncSeparate(bs[0], bs[1], bs[2], bs[3]);
    if (!blendOn) gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.activeTexture(gl.TEXTURE0);
  }

  _warmBubbles() {
    const gl = this.gl;
    if (!this._bubbleProg) this._bubbleProg = createProgramDeferred(gl, BUBBLE_VS, BUBBLE_FS, { BUBBLE_SPHERE: true, TONEMAP: this.toneMapping });
    if (!this._cloudProg) this._cloudProg = createProgramDeferred(gl, BUBBLE_VS, BUBBLE_FS, { TONEMAP: this.toneMapping });
  }

  _renderBubbles(camera) {
    const gl = this.gl, v = camera.view;
    this._warmBubbles();
    const vp = gl.getParameter(gl.VIEWPORT);
    const b = this._bubTmp || (this._bubTmp = new Float32Array(8));
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // önce bütün opak gaz kabarcıkları derinlik yazar, sonra bütün bulutlar karışır (yoksa sonraki
    // patlamanın küresi önceki bulutun önündeki kabarcıkları siler). Derlenmemiş program beklenmez.
    for (let pass = 0; pass < 2; pass++) {
      const pr = pass === 0 ? this._bubbleProg : this._cloudProg;
      if (!this._programReady(pr)) continue;
      const u = pr.u;
      gl.useProgram(pr.program);
      gl.uniformMatrix4fv(u.uViewProj, false, this._viewProj);
      gl.uniform3fv(u.uCameraPos, camera.position);
      gl.uniform3f(u.uCamRight, v[0], v[4], v[8]);
      gl.uniform3f(u.uCamUp, v[1], v[5], v[9]);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform1i(u.uInstOffset, pass);
      bindEnvironment(gl, u, { ...this.env, envMap: this.env.envMap || this._defaultEnv }, 2);
      this._bindMediumUniforms(u, 13, { width: vp[2], height: vp[3] });
      gl.depthMask(pass === 0);
      for (const ev of this._expl) {
        this._bubbleState(ev, b);
        if (pass === 0) {
          if (b[3] <= 0.01) continue;
          gl.uniform4f(u.uBubble, b[0], b[1], b[2], b[3]);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 1);
        } else {
          if (!(b[4] > 0 && b[4] < 9)) continue;
          gl.uniform4f(u.uCloud, ev.x, ev.z, b[4], b[5]);
          gl.uniform4f(u.uCloudB, ev.seed % 65536, this.level, b[6], 1 - smooth01(clamp((b[4] - 6) / 3, 0, 1)));
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, 600);
        }
      }
    }
    gl.depthMask(false);
  }

  /** Son updateNear() sonucu: { mode, depth, height, nearTexture, grid } */
  get medium() {
    return this._med.state;
  }

  /**
   * Önerilen yakın düzlem uzaklığı: kamera yüzeye yaklaştıkça küçülür, böylece su çizgisi
   * keskin kalır; uzaktayken büyük değer derinlik hassasiyetini korur. Son updateNear()'a göre.
   */
  recommendedNear({ min = 0.1, max = 0.3, range = 1.5 } = {}) {
    const t = clamp((Math.abs(this._med.camH) - 0.15) / range, 0, 1);
    return lerp(min, max, smooth01(t));
  }

  /** Bilgi: belirgin dalga yüksekliği (m), tepe dalga boyu (m) vb. */
  get info() {
    return {
      significantWaveHeight: this._set.Hs,
      peakWavelength: TAU / this._set.kp,
      vertexWaves: this._set.vertex.length,
      detailPatch: [this._set.PA, this._set.PB],
      quality: this.qualityName,
      floatTargets: this.caps.floatRT,
    };
  }

  dispose() {
    const gl = this.gl;
    for (const p of this._programs.values()) gl.deleteProgram(p.program);
    gl.deleteProgram(this._detailProgram.program);
    gl.deleteTexture(this._detailTex);
    gl.deleteTexture(this._detailDispTex);
    gl.deleteTexture(this._noiseTex);
    gl.deleteTexture(this._defaultEnv);
    gl.deleteFramebuffer(this._detailFbo);
    if (this._nearRT) {
      gl.deleteTexture(this._nearRT.tex);
      gl.deleteFramebuffer(this._nearRT.fbo);
    }
    if (this._nearDummy) gl.deleteTexture(this._nearDummy);
    if (this._spray) gl.deleteProgram(this._spray.program);
    if (this._bubbleProg) gl.deleteProgram(this._bubbleProg.program);
    if (this._cloudProg) gl.deleteProgram(this._cloudProg.program);
    if (this._lensProg) gl.deleteProgram(this._lensProg.program);
    if (this._lensFilmProg) gl.deleteProgram(this._lensFilmProg.program);
    if (this._lens.rt) {
      gl.deleteTexture(this._lens.rt.tex);
      gl.deleteFramebuffer(this._lens.rt.fbo);
    }
    if (this._medConst) {
      gl.deleteTexture(this._medConst.tex);
      gl.deleteFramebuffer(this._medConst.fbo);
      gl.deleteProgram(this._medConst.prog.program);
    } else if (this._medConstProg) {
      gl.deleteProgram(this._medConstProg.program);
    }
    gl.deleteVertexArray(this._shape.vao);
    gl.deleteVertexArray(this._emptyVao);
    this._shape.buffers.forEach((b) => gl.deleteBuffer(b));
    if (this.ripples) this.ripples.dispose();
    this._foamMaps.forEach((fm) => fm.dispose());
    if (this._rain) {
      gl.deleteTexture(this._rain.tex);
      gl.deleteFramebuffer(this._rain.fbo);
      gl.deleteProgram(this._rain.program.program);
    }
  }

  // ---------------- iç işler ----------------

  _buildSet(params, fixedPatch) {
    return buildWaveSet(params, {
      vertexCount: this.q.vertexWaves,
      detailCount: this.q.detailWaves,
      detailSize: this.q.detailSize,
      nearSpacing: this._shape.lod[0],
      fixedPatch,
    });
  }

  _finishTransition() {
    if (!this._transition) return;
    this.params = this._transition.to;
    this._set = this._next;
    this._next = null;
    this._transition = null;
  }

  // Köpük eşikleri: rüzgar hızına göre ölçülmüş kapsama oranı (Monahan, W ≈ 3.84e-6·U^3.41)
  // ve dalga istatistiklerinden. Gaussian varsayımıyla en sıkışık/dik %W'lik bölge köpürür.
  // Patlama olaylarını uniform dizilerine paketle, süresi dolanları at
  _packExplosions(dt = 0) {
    this._expl = this._expl.filter((e) => this.time - e.t0 < e.life);
    const A = this._explA, B = this._explB, C = this._explC;
    this._explCount = this._expl.length;
    this._expl.forEach((e, i) => {
      const age = this.time - e.t0;
      const fade = 1 - smooth01(clamp((age - (e.life - 12)) / 12, 0, 1));
      A.set([e.x, e.z, age, e.R], i * 4);
      B.set([e.dome, e.crater, e.vent, fade], i * 4);
      C.set([e.vent, e.fall, 0, fade], i * 4);
    });
    // flaş: birkaç milisaniyelik parlama + sıcak gazın kısa süren sönük ışıması (en parlak olay).
    // Bir kareden kısa olduğu için son kare aralığının ortalaması alınır (pozlama gibi): nokta
    // örnek kare hızına göre 20 kat değişirdi; t0'dan önceki kısım karanlıktır. Binde bire inerken
    // yumuşakça söner ve kapanır (shader'lar atlar).
    const F = this._flash;
    F.fill(0);
    for (const e of this._expl) {
      const t = this.time - e.t0;
      if (t < 0 || t > 1) continue;
      const a = Math.max(t - dt, 0);
      const pulse = dt > 1e-4
        ? (0.025 * (Math.exp(-a / 0.025) - Math.exp(-t / 0.025)) + 0.005 * (Math.exp(-a / 0.1) - Math.exp(-t / 0.1))) / dt
        : Math.exp(-t / 0.025) + 0.05 * Math.exp(-t / 0.1);
      const I = e.flash * pulse * smooth01(clamp((pulse - 1e-3) / 3e-3, 0, 1));
      if (I <= 0) continue;
      if (I > F[3]) F.set([e.x, this.level - Math.max(e.depth, 0.3), e.z, I]);
    }
  }

  // Gaz kabarcığı (Rayleigh çöküş zamanı ile): [x, y, z, yarıçap] ve kabarcık bulutunun başlangıcı.
  // Sığ patlamada kabarcık yüzeyi delene kadar şişer (sütun), derinde 3 kez salınarak yükselir.
  _bubbleState(ev, out) {
    const t = this.time - ev.t0;
    const Rmax = clamp(0.45 * ev.R, 0.4, 15);
    const P = 101325 + 1000 * GRAVITY * Math.max(ev.depth, 0);
    const T1 = 2 * 0.915 * Rmax * Math.sqrt(1000 / P);
    // yüzey sütunuyla aynı ölçüt: sütun ve krater tam açılıyorsa (explode: deep = 0) kabarcık da deler
    const vents = ev.depth < Math.max(1.2 * Rmax, 0.8 * ev.R);
    let r = 0, y = this.level - Math.max(ev.depth, 0.3);
    let cloudStart;
    if (vents) {
      const rv = Rmax * Math.min(1, ev.depth / Rmax + 0.3);
      if (t < ev.vent) r = rv * Math.sqrt(Math.max(t, 0) / ev.vent);
      else r = rv * (1 - smooth01(clamp((t - ev.vent) / 0.2, 0, 1)));   // açıldıktan sonra ~0.2 s'de çöker
      y += (this.level - 0.5 * rv - y) * clamp(t / ev.vent, 0, 1);       // açılırken yüzeye çıkar, tepesi deler
      cloudStart = ev.vent - 0.1;
    } else {
      const K = 0.68;   // her çöküşte enerjinin ~1/3'ü kalır (K³ ≈ 0.31; Cole 1948): yarıçap ve süre K ile küçülür
      let tt = t, A = Rmax, T = T1;
      for (let n = 0; n < 3; n++) {
        if (tt < T) { r = tt > 0 ? A * Math.pow(Math.sin((Math.PI * tt) / T), 0.6) : 0; break; }
        tt -= T; A *= K; T *= K;
      }
      cloudStart = T1 * (1 + K + K * K);
      y = Math.min(y + 0.75 * t * t + 0.8 * t, this.level - Math.max(r, 0.3));
    }
    y = Math.max(y, this.level - ev.floor + 0.6 * r);   // kabarcık dibe gömülmesin (dipte yassılır)
    if (vents && r > 0) {
      // yüzeyi delen kısım opak küre olarak görünmesin: tepesi gerçek yüzeyin (dalga + kubbe/krater) altında
      const sf = this.sample(ev.x, ev.z, this._bubSurf || (this._bubSurf = { height: 0, normal: [0, 1, 0], flow: [0, 0] }));
      r = Math.min(r, Math.max(sf.height - 0.1 - y, 0));
    }
    out[0] = ev.x; out[1] = y; out[2] = ev.z; out[3] = r;
    out[4] = t - cloudStart;            // bulutun yaşı
    out[5] = Rmax * 0.8;                // bulutun yayılma yarıçapı
    out[6] = Math.min(Math.max(ev.depth, 0.3) + Rmax * 0.5, Math.max(ev.floor - 0.1, 0.1));   // bulut dibin içinden başlamasın
    return out;
  }

  _lensRnd() {
    const L = this._lens;
    L.seed = (Math.imul(L.seed, 1664525) + 1013904223) >>> 0;
    return L.seed / 4294967296;
  }

  // Lense bir damla (r: ekran yüksekliği; verilmezse çoğu küçük, birkaçı büyük)
  _addDrop(r, x, y, life) {
    const L = this._lens, D = L.drops;
    if (r === undefined) { const q = this._lensRnd(); r = 0.004 + 0.03 * q * q * q; }
    if (D.length >= 64) {
      let mi = 0;
      for (let i = 1; i < D.length; i++) if (D[i].r < D[mi].r) mi = i;
      if (D[mi].r >= r) return;
      D.splice(mi, 1);
    }
    D.push({ x: x ?? this._lensRnd(), y: y ?? this._lensRnd(), r, age: 0, life: life ?? 2.5 + 5 * this._lensRnd(),
      stall: this._lensRnd() * 0.5, trail: 0, wx: 0, el: 0 });
  }

  _warmLens() {
    const gl = this.gl;
    if (!this._lensProg) this._lensProg = createProgramDeferred(gl, LENS_VS, LENS_FS);
    if (!this._lensFilmProg) this._lensFilmProg = createProgramDeferred(gl, FULLSCREEN_VS, LENS_FILM_FS);
  }

  // Havadaki hücrelerin su filmini en az v yap
  _wetFilm(v) {
    const L = this._lens;
    if (v <= 0) return;
    for (let c = 0; c < L.film.length; c++) if (!L.sub[c]) L.film[c] = Math.max(L.film[c], v);
  }

  // Lens ızgarasında (u, v) ekran noktasının yakın düzlem yüksekliği s (m; < 0 suda), hücre merkezlerinden
  _lensS(u, v) {
    const S = this._lens.S, GX = LENS_GX, GY = LENS_GY;
    const fx = clamp(u * GX - 0.5, 0, GX - 1), fy = clamp(v * GY - 0.5, 0, GY - 1);
    const i0 = Math.min(Math.floor(fx), GX - 2), j0 = Math.min(Math.floor(fy), GY - 2);
    const tx = fx - i0, ty = fy - j0, c = j0 * GX + i0;
    return (S[c] * (1 - tx) + S[c + 1] * tx) * (1 - ty) + (S[c + GX] * (1 - tx) + S[c + GX + 1] * tx) * ty;
  }

  // (x, y)'deki r yarıçaplı (akış yönünde el kadar uzamış) damla suya değiyor mu: su çizgisi eğikken
  // (dik bakış, dalga eğimi) su yandan ya da üstten de gelir, merkez ve dört uç denenir
  _lensWet(x, y, r, el) {
    const L = this._lens, asp = L.aspect, dx = L.down[0], dy = L.down[1], ry = r * (1 + el);
    return this._lensS(x, y) < 0 ||
      this._lensS(x + (dx * ry) / asp, y + dy * ry) < 0 ||
      this._lensS(x - (dx * ry) / asp, y - dy * ry) < 0 ||
      this._lensS(x - (dy * r) / asp, y + dx * r) < 0 ||
      this._lensS(x + (dy * r) / asp, y - dx * r) < 0;
  }

  // Lense sıçrayan su: CPU'da en fazla 64 damla (takılıp kayma, iz bırakma, birleşme, kuruma)
  // ve 16x9 hücrelik ıslaklık ızgarası: su bir hücreden çekilince arkasında film ve damla kalır,
  // suya değen damla suya karışır. Damlalar ve film yarım çözünürlüklü bir dokuya çizilir.
  _updateLens(camera) {
    const L = this._lens, md = this._med, view = camera.view, gl = this.gl;
    const dt = L.lastT < 0 ? 0 : clamp(this.time - L.lastT, 0, 0.1);
    L.lastT = this.time;
    // ekranda yerçekimi yönü (dünyanın aşağısı görüş uzayında); tam aşağı/yukarı bakarken kayma yok
    const gx = -view[4], gy = -view[5], gn = Math.hypot(gx, gy);
    L.down[0] = gn > 1e-3 ? gx / gn : 0;
    L.down[1] = gn > 1e-3 ? gy / gn : -1;
    L.slide = gn;
    // en/boy oranı kameranın izdüşümünden (çizilen hedefle aynı; tuval başka oranda olabilir)
    const proj = camera.projection;
    L.aspect = Math.abs(proj[5] / proj[0]) || 1;
    const h = gl.drawingBufferHeight, w = Math.max(1, Math.round(h * L.aspect));
    // hücre merkezlerinin yakın düzlem noktası suda mı (s < 0); yalnızca su çizgisindeyken örneklenir.
    // Yakın düzlem küçük, yüzey orada neredeyse düzlemsel: 6x4 düğümde sample() (144 yerine 24),
    // hücre merkezlerine çift doğrusal aradeğer (yakın düzlem noktaları NDC'de doğrusal)
    const mode = md.info[0], GX = LENS_GX, GY = LENS_GY, S = L.S, asp = L.aspect;
    if (mode === 2) {
      const iv = md.ivp, rect = md.rect, CX = 6, CY = 4;
      const smp = this._lensSmp || (this._lensSmp = { height: 0, normal: [0, 1, 0], flow: [0, 0] });
      const C = L.C || (L.C = new Float32Array(CX * CY)), p = L.p || (L.p = [0, 0, 0]);
      const unproj = (nx, ny) => {
        const q = iv[3] * nx + iv[7] * ny - iv[11] + iv[15];
        p[0] = (iv[0] * nx + iv[4] * ny - iv[8] + iv[12]) / q;
        p[1] = (iv[1] * nx + iv[5] * ny - iv[9] + iv[13]) / q;
        p[2] = (iv[2] * nx + iv[6] * ny - iv[10] + iv[14]) / q;
        return rect && (p[0] <= rect[0] || p[0] >= rect[2] || p[2] <= rect[1] || p[2] >= rect[3]);
      };
      for (let j = 0; j < CY; j++) {
        for (let i = 0; i < CX; i++) {
          // dikdörtgen suyun dışındaki düğüm: düz su (aradeğer sıçramasın)
          const out = unproj((i / (CX - 1)) * 2 - 1, (j / (CY - 1)) * 2 - 1);
          C[j * CX + i] = p[1] - (out ? this.level : this.sample(p[0], p[2], smp).height);
        }
      }
      for (let j = 0; j < GY; j++) {
        const fy = ((j + 0.5) / GY) * (CY - 1), j0 = Math.min(Math.floor(fy), CY - 2), ty = fy - j0;
        for (let i = 0; i < GX; i++) {
          const fx = ((i + 0.5) / GX) * (CX - 1), i0 = Math.min(Math.floor(fx), CX - 2), tx = fx - i0, c = j0 * CX + i0;
          const sv = (C[c] * (1 - tx) + C[c + 1] * tx) * (1 - ty) + (C[c + CX] * (1 - tx) + C[c + CX + 1] * tx) * ty;
          S[j * GX + i] = rect && unproj(((i + 0.5) / GX) * 2 - 1, ((j + 0.5) / GY) * 2 - 1) ? 1e3 : sv;
        }
      }
    } else S.fill(mode === 1 ? -1e3 : 1e3);
    // su bir hücreden çekilince camda film ve (suda kaldığı süreye göre) birkaç damla kalır;
    // tamamen sudan çıkış bütün hücrelerde aynı anda olur (~26 damla, kalın film)
    const sub = L.sub, subT = L.subT, film = L.film, N = GX * GY;
    for (let c = 0; c < N; c++) {
      if (S[c] < 0) {
        subT[c] = sub[c] ? subT[c] + dt : 0;
        sub[c] = 1;
      } else if (sub[c]) {
        sub[c] = 0;
        film[c] = clamp(subT[c] / 0.3, 0.3, 1);
        const n = Math.floor((26 / N) * clamp(subT[c] / 0.5, 0.25, 1) + this._lensRnd());
        for (let k = 0; k < n; k++) {
          // damla hücrenin suyun üstündeki kısmında doğar (su çizgisi o an hücre ortasındadır):
          // suya değiyorsa yerçekimine karşı yarımşar hücre (en fazla 3 kez) kaydırılır
          const q = this._lensRnd(), r = 0.004 + 0.03 * q * q * q;
          let x = (c % GX + this._lensRnd()) / GX, y = (Math.floor(c / GX) + this._lensRnd()) / GY;
          for (let m = 0; m <= 3; m++) {
            if (!this._lensWet(x, y, r, 0)) { this._addDrop(r, x, y); break; }
            x -= (L.down[0] * 0.5) / GY / asp;
            y -= (L.down[1] * 0.5) / GY;
          }
        }
      } else film[c] = Math.max(film[c] - dt / 1.3, 0);   // film ~1.3 s'de süzülür
    }
    if (mode === 1) {
      L.drops.length = 0; L.acc = 0; L.filmMax = 0; L.active = false;
      return;
    }
    // patlama serpintisi: sütunun ve geri düşen perdenin altındaki kamera
    const cp = camera.position;
    for (const e of this._expl) {
      const t = this.time - e.t0;
      if (t < e.vent + 0.2 || t > e.fall + 1.5) continue;
      const r = Math.hypot(cp[0] - e.x, cp[2] - e.z), y = cp[1] - this.level;
      if (r > 1.6 * e.R || y > e.H * 1.1) continue;
      const k = 1 - r / (1.6 * e.R), falling = t > e.fall - 0.8;
      L.acc += dt * (falling ? 60 : 20) * k;
      if (falling && r < 1.2 * e.R) this._wetFilm(0.8 * k);
    }
    for (; L.acc >= 1; L.acc -= 1) this._addDrop();
    const D = L.drops, born = [];
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.age += dt;
      if (d.age > d.life) d.r -= dt * 0.005;   // kuruyup küçülür
      const ex = d.r - 0.013;                  // tutunma eşiğinin üstü kayar
      let moving = false;
      if (ex > 0 && L.slide > 0.2) {
        if (d.stall > 0) d.stall -= dt;
        else {
          moving = true;
          const step = Math.min(ex * 30, 0.6) * L.slide * dt;
          d.wx = clamp(d.wx + (this._lensRnd() - 0.5) * dt * 6, -0.45, 0.45);   // yanal sapma
          d.x += (L.down[0] - L.down[1] * d.wx) * step / asp;
          d.y += (L.down[1] + L.down[0] * d.wx) * step;
          d.trail += step;
          if (d.trail > d.r * 3) {
            // arada bir arkasında çabuk kuruyan küçük bir damlacık bırakır, ara ara takılır
            d.trail = 0;
            if (this._lensRnd() < 0.5) {
              const rr = d.r * 0.3;
              d.r = Math.cbrt(d.r ** 3 - rr ** 3);
              born.push([rr, d.x - (L.down[0] * d.r * 1.3) / asp, d.y - L.down[1] * d.r * 1.3, 0.6 + 1.5 * this._lensRnd()]);
            }
            if (this._lensRnd() < 0.2) d.stall = 0.1 + this._lensRnd() * 0.5;
          }
        }
      }
      d.el = moving ? Math.min(ex * 20, 0.5) : d.el * Math.exp(-dt * 4);
      // suya değen damla suya karışır
      const wet = mode === 2 && this._lensWet(d.x, d.y, d.r, d.el);
      if (wet || d.r < 0.0025 || d.x < -0.1 || d.x > 1.1 || d.y < -0.1 || d.y > 1.1) D.splice(i, 1);
    }
    for (const b of born) this._addDrop(b[0], b[1], b[2], b[3]);
    // dokunan damlalar birleşir (hacim korunur)
    for (let i = 0; i < D.length; i++) {
      for (let j = D.length - 1; j > i; j--) {
        const a = D[i], b = D[j], dx = (a.x - b.x) * asp, dy = a.y - b.y, rs = (a.r + b.r) * 0.8;
        if (dx * dx + dy * dy >= rs * rs) continue;
        const va = a.r ** 3, vb = b.r ** 3, k = vb / (va + vb);
        a.x += (b.x - a.x) * k; a.y += (b.y - a.y) * k;
        a.r = Math.min(Math.cbrt(va + vb), 0.05);
        a.age = Math.min(a.age, b.age); a.stall = 0;
        D.splice(j, 1);
      }
    }
    // gönderilen film: suda kalan hücre havadaki 4 komşusunun en kalın filmini alır (film su
    // çizgisine kadar sürer ve onlarla birlikte süzülür; uzaktaki hücrelerin filmine bağlı değil)
    const fu = L.filmUp || (L.filmUp = new Float32Array(N));
    let fm = 0;
    for (let c = 0; c < N; c++) {
      let f = film[c];
      if (sub[c]) {
        const i = c % GX;
        f = 0;
        if (i > 0 && !sub[c - 1]) f = Math.max(f, film[c - 1]);
        if (i < GX - 1 && !sub[c + 1]) f = Math.max(f, film[c + 1]);
        if (c >= GX && !sub[c - GX]) f = Math.max(f, film[c - GX]);
        if (c < N - GX && !sub[c + GX]) f = Math.max(f, film[c + GX]);
      }
      fu[c] = f;
      if (f > fm) fm = f;
    }
    L.filmMax = fm;
    L.active = D.length > 0 || fm > 0;
    if (L.active) this._renderLens(w, h);
  }

  _renderLens(w, h) {
    const gl = this.gl, L = this._lens;
    this._warmLens();
    // derlenince başlar
    if (!this._programReady(this._lensProg) || !this._programReady(this._lensFilmProg)) { L.active = false; return; }
    const [prevFbo, vp] = this._target();
    const rw = Math.max(1, Math.round(w / 2)), rh = Math.max(1, Math.round(h / 2));
    let rt = L.rt;
    if (!rt || rt.w !== rw || rt.h !== rh) {
      if (rt) { gl.deleteTexture(rt.tex); gl.deleteFramebuffer(rt.fbo); }
      gl.activeTexture(gl.TEXTURE12);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // float hedef yoksa RGB10_A2 (çekirdek WebGL2, MAX karışımlı): 8 bitte büyük damlanın eğimi basamaklanır
      gl.texStorage2D(gl.TEXTURE_2D, 1, this.caps.floatRT ? gl.RG16F : gl.RGB10_A2, rw, rh);
      setTexParams(gl, gl.TEXTURE_2D, { filter: 'linear', wrap: gl.CLAMP_TO_EDGE });
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      rt = L.rt = { tex, fbo, w: rw, h: rh };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fbo);
    gl.viewport(0, 0, rt.w, rt.h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearBufferfv(gl.COLOR, 0, LENS_ZERO);   // oyunun temizleme rengine dokunmaz
    const D = L.drops;
    // MAX denklemi karışım çarpanlarını kullanmaz: oyunun blendFunc'ına dokunulmaz, yalnızca denklem
    // saklanıp geri yüklenir (iki sorgu, yalnız lens doluyken)
    const eq = [gl.getParameter(gl.BLEND_EQUATION_RGB), gl.getParameter(gl.BLEND_EQUATION_ALPHA)];
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.bindVertexArray(this._emptyVao);
    if (D.length) {
      // R: damla kubbeleri
      const arr = L.buf || (L.buf = new Float32Array(256));
      D.forEach((d, i) => { arr[i * 4] = d.x; arr[i * 4 + 1] = d.y; arr[i * 4 + 2] = d.r; arr[i * 4 + 3] = d.el; });
      const pr = this._lensProg, u = pr.u;
      gl.useProgram(pr.program);
      gl.uniform4fv(u.uDrops, arr);
      gl.uniform4f(u.uLensP, L.aspect, 1 / LENS_HSCALE, L.down[0], L.down[1]);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, D.length);
    }
    if (L.filmMax > 0) {
      // G: hücrelerin su filmi
      const pr = this._lensFilmProg;
      gl.useProgram(pr.program);
      gl.uniform4fv(pr.u.uFilm, L.filmUp);
      gl.uniform4f(pr.u.uFilmP, L.down[0], L.down[1], L.aspect, this.time % 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
    // karışım kapalı kalır (update() ve su çizgisi geçişi gibi)
    gl.blendEquationSeparate(eq[0], eq[1]);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.activeTexture(gl.TEXTURE0);
  }

  _dummyTexture() {
    const gl = this.gl;
    if (!this._nearDummy) {
      this._nearDummy = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._nearDummy);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
    return this._nearDummy;
  }

  _bindLensUniforms(u, unit = 12) {
    if (!u.uLensInfo) return;
    const gl = this.gl, L = this._lens, on = L.active && !!L.rt;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, on ? L.rt.tex : this._dummyTexture());
    gl.uniform1i(u.uLensMap, unit);
    gl.uniform4f(u.uLensInfo, L.filmMax, this.time % 1000, LENS_HSCALE, on ? 1 : 0);
    gl.uniform4f(u.uLensDown, L.down[0], L.down[1], L.aspect, 0);
    gl.activeTexture(gl.TEXTURE0);
  }

  // GLSL blastField'ın CPU ikizi: [yükseklik, ∂/∂x, ∂/∂z]
  _blastAt(px, pz, spacing, time, out) {
    out[0] = out[1] = out[2] = 0;
    for (const e of this._expl) {
      const t = time - e.t0, R = e.R, tv = e.vent;
      const fadeE = 1 - smooth01(clamp((t - (e.life - 12)) / 12, 0, 1));
      const dx = px - e.x, dz = pz - e.z, r = Math.hypot(dx, dz) + 1e-3;
      const tc = Math.max(t - tv, 0);
      const Re2 = R * R + 0.36 * spacing * spacing;
      const g2 = Math.exp(-(r * r) / Re2) * ((R * R) / Re2);
      const ss = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));
      const dome = e.dome * (t < tv ? ss(0, tv, t) : Math.exp(-(((t - tv) / 0.35) ** 2)));
      const wc = Math.sqrt(GRAVITY / R);
      const crater = -e.crater * ss(0, 0.3, tc) * Math.cos(wc * tc * 0.9) * Math.exp(-tc * wc * 0.25);
      let h = (dome + crater) * g2 * fadeE;
      let de = h * ((-2 * r) / Re2);
      if (tc > 0 && r > 1.2 * R) {
        const k = (GRAVITY * tc * tc) / (4 * r * r), th = (GRAVITY * tc * tc) / (4 * r);
        let amp = ((e.crater * R * R * GRAVITY * tc * tc) / (5.657 * r * r * r)) * Math.exp(-((k * R * 0.5) ** 2));
        amp *= (1 - smooth01(clamp((spacing * k * 0.1591549 - 0.16) / 0.17, 0, 1))) * ss(1.2 * R, 2.5 * R, r) * fadeE;
        h -= amp * Math.cos(th);
        de -= amp * k * Math.sin(th);
      }
      out[0] += h;
      out[1] += (de * dx) / r;
      out[2] += (de * dz) / r;
    }
    return out;
  }

  // Yüzeyi çizen dalga fonksiyonunun uniform'ları (WATER_VS ve NEAR_FS ortak)
  _bindWaveUniforms(u) {
    const gl = this.gl;
    const P = this.params, set = this._set;
    gl.uniform1f(u.uTime, this.time);
    gl.uniform4fv(u.uWaveA, this._wA);
    gl.uniform4fv(u.uWaveB, this._wB);
    gl.uniform1i(u.uWaveCount, this._waveCount);
    gl.uniform2fv(u.uLod, this._shape.lod);
    gl.uniform1f(u.uBreakK, this._breakK);
    gl.uniform2fv(u.uFlow, P.flow);
    if (u.uFlowCycle) gl.uniform1f(u.uFlowCycle, Math.max(P.flowCycle, 0.2));
    gl.uniform4f(u.uDetailParams, 1 / set.PA, 1 / set.PB, this.q.detailSize, 1 / Math.log2(this.q.detailSize / (4 * DETAIL_CMIN)));
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this._detailDispTex);
    gl.uniform1i(u.uDetailDisp, 10);
    gl.uniform4fv(u.uDispDecode, this._dispDecode || [1, 1, 1, 0]);
    gl.uniform1f(u.uDetailJVar, this._jVarA);
    if (u.uExplCount) {
      gl.uniform4fv(u.uExplA, this._explA);
      gl.uniform4fv(u.uExplB, this._explB);
      gl.uniform1i(u.uExplCount, this._explCount);
    }
    if (this.depthMap) {
      const d = this.depthMap;
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D, d.texture);
      gl.uniform1i(u.uDepthMap, 7);
      gl.uniform4f(u.uDepthRect, d.rect[0], d.rect[1], 1 / d.rect[2], 1 / d.rect[3]);
      gl.uniform2fv(u.uDepthDecode, d.decode);
    }
    if (this.flowMap) {
      const f = this.flowMap;
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, f.texture);
      gl.uniform1i(u.uFlowMap, 8);
      gl.uniform4f(u.uFlowRect, f.rect[0], f.rect[1], 1 / f.rect[2], 1 / f.rect[3]);
      gl.uniform2fv(u.uFlowDecode, f.decode);
    }
  }

  // Su ortamı uniform'ları (WaterGLSL.near / medium ve su yüzeyi shader'ı)
  _bindMediumUniforms(u, unit = 13, { width, height, forceAir = false, cameraPos } = {}) {
    if (!u.uNearInfo && !u.uMedCam && !u.uMedSigma && !u.uMedCaustics && !u.uMedLevel && !u.uNearMap && !u.uMedFlash) return;
    const gl = this.gl, md = this._med, P = this.params;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this._nearRT ? this._nearRT.tex : this._dummyTexture());
    gl.uniform1i(u.uNearMap, unit);
    const info = md.info;
    gl.uniform4f(u.uNearInfo, forceAir ? 0 : info[0], info[1], info[2], info[3]);
    const w = width || gl.drawingBufferWidth, h = height || gl.drawingBufferHeight;
    gl.uniform4f(u.uNearGrid, md.N, md.M, 1 / w, 1 / h);
    gl.uniform3fv(u.uMedCam, cameraPos || this._camPos);
    gl.uniform4f(u.uMedFwd, md.fwd[0], md.fwd[1], md.fwd[2], md.near);
    gl.uniform3fv(u.uMedWaterColor, P.waterColor);
    const a = P.absorption, tb = P.turbidity, kd = clamp(P.depthDarkening || 0, 0, 1);
    gl.uniform3f(u.uMedSigma, a[0] + tb, a[1] + tb, a[2] + tb);
    gl.uniform3f(u.uMedKd, kd * (a[0] + 0.25 * tb), kd * (a[1] + 0.25 * tb), kd * (a[2] + 0.25 * tb));
    gl.uniform1f(u.uMedLevel, this.level);
    if (u.uMedNoise) {
      gl.activeTexture(gl.TEXTURE0 + unit + 1);
      gl.bindTexture(gl.TEXTURE_2D, this._noiseTex);
      gl.uniform1i(u.uMedNoise, unit + 1);
    }
    if (u.uMedCaustics) gl.uniform4f(u.uMedCaustics, P.caustics, 1 / Math.max(P.causticScale, 0.05), this.time, this._sceneLitActive() ? 1 : 0);
    if (u.uMedWaveH) gl.uniform1f(u.uMedWaveH, 0.35 * this._set.Hs);
    if (u.uMedFlash) {
      gl.uniform4fv(u.uMedFlash, this._flash);
      gl.uniform1f(u.uMedFlashS, P.turbidity + 0.02);
    }
    if (u.uMedConst) {
      const ok = !!(this._medConst && this._medConst.ok) && md.info[0] !== 0;   // havadayken bayat olabilir
      gl.activeTexture(gl.TEXTURE0 + unit + 2);
      gl.bindTexture(gl.TEXTURE_2D, ok ? this._medConst.tex : this._nearDummy);
      gl.uniform1i(u.uMedConst, unit + 2);
      gl.uniform1f(u.uMedConstOn, ok ? 1 : 0);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  // Sahne shader'ları su altı ışığını şu an kendileri mi uyguluyor (kamera havada değilken)
  _sceneLitActive() {
    return this.sceneLit && this._med.info[0] !== 0;
  }

  // Su gövdesinin saçtığı ışık (1x1, float hedef varsa); sahne/gökyüzü tek okumayla alır
  _renderMedConst() {
    const gl = this.gl;
    if (!this.caps.floatRT) return;
    const [prevFbo, vp] = this._target();
    if (!this._medConst) {
      gl.activeTexture(gl.TEXTURE13);   // kütüphanenin ortam birimi: oyunun bağlantıları bozulmasın
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 1, 1);
      setTexParams(gl, gl.TEXTURE_2D, { filter: 'nearest', wrap: gl.CLAMP_TO_EDGE });
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this._medConst = { tex, fbo, prog: this._medConstProg || createProgram(gl, FULLSCREEN_VS, MEDCONST_FS), ok: false };
    }
    const mc = this._medConst;
    if (!mc.prog.u) finishProgram(gl, mc.prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mc.fbo);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(mc.prog.program);
    bindEnvironment(gl, mc.prog.u, { ...this.env, envMap: this.env.envMap || this._defaultEnv }, 2);
    gl.uniform3fv(mc.prog.u.uMedWaterColor, this.params.waterColor);
    gl.bindVertexArray(this._emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    mc.ok = true;
  }

  // Su çizgisi testi programı (warm: yalnızca arka planda derlemeyi başlat)
  _nearProgram(warm, expl = null) {
    const defines = {
      MAXV: this._maxV,
      DEPTHMAP: !!this.depthMap,
      FLOWMAP: !!this.flowMap,
      FLOW_VARYING: !!this.flowMap || this._shape.hasFlow,
      DETAIL_DISP: true,
      EXPLOSIONS: expl ?? this._explCount > 0,
    };
    const key = 'near:' + JSON.stringify(defines);
    let prog = this._programs.get(key);
    if (!prog) {
      prog = warm ? createProgramDeferred(this.gl, FULLSCREEN_VS, NEAR_FS, defines) : createProgram(this.gl, FULLSCREEN_VS, NEAR_FS, defines);
      this._programs.set(key, prog);
    } else if (!warm && !prog.u) {
      finishProgram(this.gl, prog);
    }
    return prog;
  }

  // Su çizgisi ızgarası (yalnızca kamera su çizgisindeyken)
  // updateNear içindeki geçişler için oyunun framebuffer'ı ve viewport'u: karede bir kez sorulur
  // (gl.getParameter Chrome'da pahalı) ve geçiş kendi FBO'sunu bağlamadan önce alınır
  _target() {
    const md = this._med;
    if (md.tgt) return md.tgt;
    const gl = this.gl, t = [gl.getParameter(gl.FRAMEBUFFER_BINDING), gl.getParameter(gl.VIEWPORT)];
    if (md.inNear) md.tgt = t;
    return t;
  }

  _renderNear() {
    const gl = this.gl, md = this._med;
    const [prevFbo, vp] = this._target();
    if (!this._nearRT) {
      const packed = !this.caps.floatRT;
      gl.activeTexture(gl.TEXTURE13);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, packed ? gl.RGBA8 : gl.R16F, md.N, md.M);
      setTexParams(gl, gl.TEXTURE_2D, { filter: 'nearest', wrap: gl.CLAMP_TO_EDGE });
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this._nearRT = { tex, fbo, packed };
    }
    const prog = this._nearProgram(false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._nearRT.fbo);
    gl.viewport(0, 0, md.N, md.M);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(prog.program);
    const u = prog.u;
    this._bindWaveUniforms(u);
    gl.uniformMatrix4fv(u.uInvViewProj, false, md.ivp);
    gl.uniform3fv(u.uCameraPos, this._camPos);
    gl.uniform1f(u.uLevel, this.level);
    gl.uniform4f(u.uNearOut, md.N, md.M, this._nearRT.packed ? 1 : 0, 2);
    const rc = md.rect;
    gl.uniform4f(u.uNearRect, rc ? rc[0] : -1e9, rc ? rc[1] : -1e9, rc ? rc[2] : 1e9, rc ? rc[3] : 1e9);
    gl.bindVertexArray(this._emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.activeTexture(gl.TEXTURE0);
  }

  _whitecapUniform() {
    const P = this.params;
    const u = this._wcU || (this._wcU = new Float32Array(3));
    const W = clamp(3.84e-6 * Math.pow(Math.max(P.windSpeed, 0), 3.41) * P.whitecaps, 1e-5, 0.4);
    // Jacobian köpüğü shader'da ~%50'lik yama maskesiyle çarpılır → eşik 2W ile telafi
    const q = Math.min(2 * W, 0.45);
    const t = Math.sqrt(-2 * Math.log(q));
    u[0] = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
    // eğim büyüklüğü Rayleigh dağılır: P(|s| > r) = exp(-r²/σ²)
    u[1] = Math.sqrt(-Math.log(W));
    let vJ = 0;
    for (let i = 0; i < this._waveCount; i++) {
      const ck = this._wB[i * 4 + 1] * this._wA[i * 4 + 2];
      vJ += 0.5 * ck * ck;
    }
    vJ += this._jVarA || 0;
    u[2] = vJ > 1e-10 ? 1 / Math.sqrt(vJ) : 0;
    // dalga setinden ölçülen eşik varsa onu kullan (Gauss varsayımı az dalgada çok az tepe verir)
    if (this._zJemp !== undefined) u[0] = this._zJemp;
    return u;
  }

  // Köpük haritası için kırılma eşiği. Az sayıda dalganın sıkışma (J) dağılımı Gauss değildir
  // (alt kuyruğu çok incedir), bu yüzden eşik gerçek dalga setinden alınan örneklerle ayarlanır:
  // haritada o an kırılan alan oranı, rüzgara göre ölçülmüş köpük oranının (Monahan) beşte biri
  // olur; biriken yaşlı köpük görünen kapsamayı bu oranın birkaç katına çıkarır.
  _foamInjection(fm) {
    const P = this.params;
    const r = fm.inj || (fm.inj = { z: -1e3, invSigma: 1, t: -1 });
    if (Math.abs(this.time - r.t) < 0.3 && r.wc === P.whitecaps && r.ws === P.windSpeed) return r;
    r.t = this.time; r.wc = P.whitecaps; r.ws = P.windSpeed;
    const W = clamp(3.84e-6 * Math.pow(Math.max(P.windSpeed, 0), 3.41) * P.whitecaps, 0, 0.4);
    // hücrede çözülen ve çözülemeyen sıkışma varyansı
    let vRes = 0, vUnres = 0;
    const n = this._waveCount;
    const fw = fm.fw || (fm.fw = new Float32Array(this._maxV));
    for (let i = 0; i < n; i++) {
      const k = this._wA[i * 4 + 2];
      const f = 1 - smooth01(clamp((fm.ts * k * 0.1591549 - 0.16) / 0.17, 0, 1));
      const ck = this._wB[i * 4 + 1] * k;
      fw[i] = f;
      vRes += 0.5 * (ck * f) ** 2;
      vUnres += 0.5 * ck * ck * (1 - f * f);
    }
    const lodD = Math.log2(Math.max((fm.ts * this.q.detailSize) / this._set.PA, 1e-3)) + 1;
    const keep = 1 - clamp((lodD - 0.5) / Math.log2(this.q.detailSize / (4 * DETAIL_CMIN)), 0, 1);
    const jA = this._jVarA || 0;
    vRes += jA * keep;
    vUnres += jA * (1 - keep);
    const sTot = Math.sqrt(vRes + vUnres);
    r.invSigma = 1 / Math.max(Math.sqrt(vUnres), 0.15 * sTot, 1e-4);
    if (!(W > 1e-5) || sTot < 1e-4) { r.z = -1e3; return r; }
    // rastgele noktalarda haritanın göreceği J (büyük dalgalar analitik, detay Gauss)
    if (!this._jPts) {
      let a = 0x9e3779b9;
      const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      this._jPts = new Float32Array(512 * 3);
      for (let i = 0; i < 512; i++) {
        this._jPts[i * 3] = rnd() * 4096;
        this._jPts[i * 3 + 1] = rnd() * 4096;
        this._jPts[i * 3 + 2] = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(TAU * rnd());
      }
      this._jS = new Float32Array(512);
    }
    const pts = this._jPts, J = this._jS, sd = Math.sqrt(jA * keep);
    for (let s = 0; s < 512; s++) {
      const x = pts[s * 3], z = pts[s * 3 + 1];
      let jxx = 0, jzz = 0, jxz = 0;
      for (let i = 0; i < n; i++) {
        if (fw[i] <= 0) continue;
        const dx = this._wA[i * 4], dz = this._wA[i * 4 + 1], k = this._wA[i * 4 + 2];
        const kc = k * this._wB[i * 4 + 1] * fw[i] * Math.sin(k * (dx * x + dz * z) + this._wA[i * 4 + 3]);
        jxx -= kc * dx * dx; jzz -= kc * dz * dz; jxz -= kc * dx * dz;
      }
      J[s] = (1 + jxx) * (1 + jzz) - jxz * jxz + pts[s * 3 + 2] * sd;
    }
    if (fm === this._foamMaps[0]) {
      // anlık tepe köpüğü eşiği (normalize sıkışma (1-J)/σJ'nin üst yüzdeliği): taze tepe oranı ~0.6W
      const sJ = Math.sqrt(vRes + vUnres);
      const u = (this._jU || (this._jU = new Float32Array(512)));
      for (let s = 0; s < 512; s++) u[s] = (1 - J[s]) / sJ;
      u.sort();
      this._zJemp = u[Math.min(511, Math.floor((1 - Math.min(W * 0.6, 0.45)) * 512))];
    }
    // istenen oran (dalga grubu maskesinin geçirdiği pay hesaba katılır), ikiye bölmeyle eşik
    const need = clamp((W * 0.2) / (this._groupPass || 0.3), 1e-5, 0.5);
    const k1 = 1.702 * r.invSigma;
    let lo = -4, hi = 1.5;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) * 0.5;
      let m = 0;
      for (let s = 0; s < 512; s++) m += 1 / (1 + Math.exp(-k1 * (mid - J[s])));
      if (m / 512 < need) lo = mid; else hi = mid;
    }
    r.z = (lo + hi) * 0.5;
    return r;
  }

  // Yağmur halkası dokusu (yalnızca yağarken güncellenir)
  _updateRain() {
    const gl = this.gl;
    if (!(this.params.rain > 0)) return;
    if (!this._rain) {
      const N = 256;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 9, gl.RGBA8, N, N);
      setTexParams(gl, gl.TEXTURE_2D, { mip: true, aniso: this.q.aniso, caps: this.caps });
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      this._rain = { tex, fbo, size: N, tile: 2.5, program: createProgram(gl, FULLSCREEN_VS, RAIN_FS) };
    }
    const r = this._rain;
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbo);
    gl.viewport(0, 0, r.size, r.size);
    gl.useProgram(r.program.program);
    gl.uniform1f(r.program.u.uTime, this.time % 1000);
    gl.uniform1f(r.program.u.uRain, clamp(this.params.rain, 0, 1));
    gl.bindVertexArray(this._emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    r.dirtyMips = true;
  }

  // Her karede: dalga fazlarını (çift duyarlıklı) hesapla ve uniform dizilerine yaz
  _packWaves() {
    const t = this.time;
    const b = this._transition ? smooth01(this._transition.t) : 0;
    const sets = this._next ? [[this._set, Math.sqrt(1 - b)], [this._next, Math.sqrt(b)]] : [[this._set, 1]];
    const A = this._wA, B = this._wB, D = this._dW, DM = this._maxD;
    let n = 0, na = 0, nb = 0, varA = 0, varB = 0, chopA = 0, jVarA = 0, ampA = 0, akA = 0;
    const cA = this._covA || (this._covA = new Float32Array(3));
    const cB = this._covB || (this._covB = new Float32Array(3));
    cA.fill(0);
    cB.fill(0);
    for (const [set, wgt] of sets) {
      for (const w of set.vertex) {
        if (n >= this._maxV) break;
        const i = n * 4;
        A[i] = w.dx; A[i + 1] = w.dz; A[i + 2] = w.k; A[i + 3] = modTau(w.phase0 - w.w * t);
        B[i] = w.a * wgt; B[i + 1] = w.c * wgt; B[i + 2] = w.w; B[i + 3] = 0;   // z: ω (CPU dikey hız için)
        n++;
      }
      for (const w of set.detailA) {
        if (na >= DM) break;
        const i = na++ * 4;
        D[i] = TAU * w.m; D[i + 1] = TAU * w.n; D[i + 2] = modTau(w.phase0 - w.w * t); D[i + 3] = (w.a / w.P) * wgt;
      }
      for (const w of set.detailB) {
        if (nb >= DM) break;
        const i = (DM + nb++) * 4;
        D[i] = TAU * w.m; D[i + 1] = TAU * w.n; D[i + 2] = modTau(w.phase0 - w.w * t); D[i + 3] = (w.a / w.P) * wgt;
      }
      varA += wgt * wgt * set.varA;
      varB += wgt * wgt * set.varB;
      chopA += wgt * wgt * set.chopA;
      jVarA += wgt * wgt * set.jVarA;
      ampA += wgt * set.ampA;
      akA += wgt * set.akA;
      for (let i = 0; i < 3; i++) {
        cA[i] += wgt * wgt * set.covA[i];
        cB[i] += wgt * wgt * set.covB[i];
      }
    }
    this._chopA = chopA;
    this._jVarA = jVarA;
    this._ampA = ampA;
    this._akA = akA;
    this._waveCount = n;
    let ampSum = 0;
    for (let i = 0; i < n; i++) ampSum += B[i * 4];
    this._breakK = 0.4 / Math.max(ampSum, 0.01);
    this._countA = na;
    this._countB = nb;
    this._varA = varA;
    this._varB = varB;
  }

  _getWaterProgram(scene, planar, under = null, warm = false, expl = null, lit = null) {
    const defines = {
      MAXV: this._maxV,
      SCENE: scene,
      PLANAR: planar,
      DEPTHMAP: !!this.depthMap,
      FLOWMAP: !!this.flowMap,
      FLOW_VARYING: !!this.flowMap || this._shape.hasFlow,
      RIPPLES: !!this.ripples,
      TONEMAP: this.toneMapping,
      DETAIL_TAPS4: this.q.detailTaps === 4,
      CAUSTICS: scene && this.params.caustics > 0,
      RAIN: this.params.rain > 0 && !!this._rain,
      DETAIL_DISP: true,
      FOAM_MAP: true,
      DEBUG_VIEW: !!this.debugView,
      SCENE_LIT: scene && (lit ?? this._sceneLitActive()),
      UNDERWATER: under ?? this._underwaterActive(),
      EXPLOSIONS: expl ?? this._explCount > 0,
    };
    const key = JSON.stringify(defines);
    let p = this._programs.get(key);
    if (warm) {
      // yalnızca arka planda derlemeyi başlat (KHR_parallel_shader_compile varsa bekletmez)
      if (!p) this._programs.set(key, createProgramDeferred(this.gl, WATER_VS, WATER_FS, defines));
      return null;
    }
    if (p && !p.u && !this._programReady(p) && (defines.EXPLOSIONS || defines.UNDERWATER)) {
      // arka planda derleniyor: bir iki kare patlamasız / havadaki varyantla çiz (takılma yok)
      const fb = this._getWaterProgram(scene, planar, defines.EXPLOSIONS ? defines.UNDERWATER : false, false, false, lit);
      if (fb) return fb;
    }
    if (!p) {
      p = createProgram(this.gl, WATER_VS, WATER_FS, defines);
      this._programs.set(key, p);
    } else if (!p.u) {
      finishProgram(this.gl, p);
    }
    const first = !this._lastFlags;
    this._lastFlags = [scene, planar];
    if (first && this.explosionsWarm) this._warmExplosions();
    return p;
  }

  // KHR_parallel_shader_compile varsa derlemenin bitip bitmediğini bekletmeden sorar
  _programReady(p) {
    if (p.u) return true;
    const ext = this._parallel || (this._parallel = this.gl.getExtension('KHR_parallel_shader_compile') || false);
    if (ext && !this.gl.getProgramParameter(p.program, ext.COMPLETION_STATUS_KHR)) return false;
    finishProgram(this.gl, p);
    return true;
  }

  // Patlama shader varyantlarını arka planda derlemeye başla (ilk patlamada ya da seçenekle açılışta)
  _warmExplosions() {
    if (!this._lastFlags) return;
    const [sc, pl] = this._lastFlags;
    this._getWaterProgram(sc, pl, null, true, true);
    if (!this._spray) this._spray = createProgramDeferred(this.gl, SPRAY_VS, SPRAY_FS, { TONEMAP: this.toneMapping });
    this._warmBubbles();
    this._warmLens();
    if (this._med.camH !== 1e3) this._nearProgram(true, true);
  }

  // Suya yaklaşırken gerekecek su altı varyantlarını arka planda derle (eksik olanları)
  _warmUnderwater() {
    if (!this._lastFlags) return;
    const [sc, pl] = this._lastFlags;
    const lit = this.sceneLit;
    for (const planar of pl ? [true, false] : [false]) {
      this._getWaterProgram(sc, planar, true, true, null, lit);
      if (this._explCount > 0 || this.explosionsWarm) this._getWaterProgram(sc, planar, true, true, true, lit);
    }
    this._nearProgram(true);
    if (this._explCount > 0 || this.explosionsWarm) this._nearProgram(true, true);
    if (this.caps.floatRT && !this._medConstProg && !this._medConst) this._medConstProg = createProgramDeferred(this.gl, FULLSCREEN_VS, MEDCONST_FS);
    this._warmLens();   // sudan çıkış damlaları
  }

  // Su altı kodu gerekli mi: kamera havada değilse (ya da derinlikle kararma açıksa)
  _underwaterActive() {
    return this._med.info[0] !== 0 || (this.params.depthDarkening || 0) > 0;
  }

  _createShape(shape) {
    const gl = this.gl;
    let geo, lod, hasFlow = false, center = [0, 0];
    if (shape.type === 'rect') {
      const [w, d] = shape.size || [50, 50];
      const cell = Math.max(w, d) / (shape.resolution || this.q.rectRes);
      geo = buildRectGrid(w, d, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(d / cell)));
      lod = [cell, 0.002];
      center = shape.center || [0, 0];
    } else if (shape.type === 'mesh') {
      geo = { positions: new Float32Array(shape.positions), indices: shape.indices, flows: shape.flows };
      lod = [shape.cellSize || 1, 0.002];
      hasFlow = !!shape.flows;
    } else {
      const r0 = this.q.r0, r1 = shape.radius || 9000;
      // hücre boyutu ≈ mesafe × max(açısal, radyal aralık oranı)
      lod = [r0, Math.max(TAU / this.q.segments, Math.pow(r1 / r0, 1 / (this.q.rings - 1)) - 1)];
      geo = buildRadialGrid(this.q.segments, this.q.rings, r0, r1, 60000, 0.01, 1 + lod[1]);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffers = [];
    const pb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    buffers.push(pb);
    if (hasFlow) {
      const fb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, fb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.flows), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      buffers.push(fb);
    } else {
      gl.disableVertexAttribArray(1);
    }
    const vcount = geo.positions.length / 3;
    const big = vcount > 65535;
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(geo.indices) : new Uint16Array(geo.indices), gl.STATIC_DRAW);
    buffers.push(ib);
    gl.bindVertexArray(null);
    this._shape = {
      type: shape.type === 'rect' || shape.type === 'mesh' ? shape.type : 'infinite',
      vao, buffers, lod, hasFlow, center, size: shape.size || [50, 50],
      count: geo.indices.length,
      insertCount: geo.insertCount || 0,
      fanCount: geo.fanCount || 0,
      indexType: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      vertexCount: vcount,
    };
  }

  _createDetailTarget() {
    const gl = this.gl;
    const N = this.q.detailSize;
    this._detailFloat = this.caps.floatRT;
    const levels = Math.log2(N) + 1;
    this._detailTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._detailTex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, this._detailFloat ? gl.RGBA16F : gl.RGBA8, N, N);
    setTexParams(gl, gl.TEXTURE_2D, { mip: true, aniso: this.q.aniso, caps: this.caps });
    // ikinci çıktı: A katmanının yüksekliği/kayması/sıkışması (köşe shader'ı okur)
    this._detailDispTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._detailDispTex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, this._detailFloat ? gl.RGBA16F : gl.RGBA8, N, N);
    setTexParams(gl, gl.TEXTURE_2D, { mip: true });
    this._detailFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._detailFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._detailTex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this._detailDispTex, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _createNoiseTexture() {
    const gl = this.gl;
    const N = 256;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 9, gl.RGBA8, N, N);
    setTexParams(gl, gl.TEXTURE_2D, { mip: true, aniso: this.q.aniso, caps: this.caps });
    const fbo = gl.createFramebuffer();
    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const vp = gl.getParameter(gl.VIEWPORT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, N, N);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const p = createProgram(gl, FULLSCREEN_VS, NOISE_FS);
    gl.useProgram(p.program);
    gl.bindVertexArray(this._emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // Köpük kanalını (R) histogram eşitle: desen [0,1]'de düzgün dağılsın ki "kapsama c"
    // eşiği ekranda gerçekten c oranında köpük göstersin (bir kez, açılışta).
    const px = new Uint8Array(N * N * 4);
    gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) hist[px[i]]++;
    // köpük haritasındaki dalga grubu maskesinin (G kanalı, smoothstep 0.42–0.62) ortalaması
    let gp = 0;
    for (let i = 1; i < px.length; i += 4) gp += smooth01(clamp((px[i] / 255 - 0.42) / 0.2, 0, 1));
    this._groupPass = Math.max(gp / (N * N), 0.05);
    const lut = new Uint8Array(256);
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      lut[v] = Math.round(((acc + hist[v] * 0.5) / (N * N)) * 255);
      acc += hist[v];
    }
    for (let i = 0; i < px.length; i += 4) px[i] = lut[px[i]];
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.deleteFramebuffer(fbo);
    gl.deleteProgram(p.program);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.generateMipmap(gl.TEXTURE_2D);
    this._noiseTex = tex;
  }

  /** Paylaşılan gürültü dokusu (oyunun kendi shader'ları için de kullanılabilir). */
  get noiseTexture() { return this._noiseTex; }

  // Gökyüzü verilmezse basit bir gradyan küp harita
  _createDefaultEnv() {
    const gl = this.gl;
    const S = 8;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    const zen = [0.18, 0.32, 0.6], hor = [0.6, 0.68, 0.75], gnd = [0.12, 0.13, 0.13];
    for (let f = 0; f < 6; f++) {
      const data = new Uint8Array(S * S * 4);
      for (let j = 0; j < S; j++) {
        for (let i = 0; i < S; i++) {
          const v = 1 - ((j + 0.5) / S) * 2;
          const y = f === 2 ? 1 : f === 3 ? -1 : v * 0.7;
          const c = y >= 0 ? hor.map((h, k) => lerp(h, zen[k], Math.sqrt(y))) : hor.map((h, k) => lerp(h, gnd[k], Math.sqrt(-y)));
          const o = (j * S + i) * 4;
          for (let k = 0; k < 3; k++) data[o + k] = clamp(Math.round((c[k] / 4) * 255), 0, 255);
          data[o + 3] = 255;
        }
      }
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    setTexParams(gl, gl.TEXTURE_CUBE_MAP, { mip: true, wrap: gl.CLAMP_TO_EDGE });
    this._defaultEnv = tex;
    this.env.envMap = tex;
  }

  // Detay A katmanının (geometri olarak çizilen küçük dalgalar) CPU karşılığı.
  // Köşe shader'ındaki iki örnek (normal + döndürülmüş kopya) ve mip süzmesiyle aynı toplam.
  // out: [yükseklik, kaymaX, kaymaZ, eğimX, eğimZ]
  _detailAt(x, z, spacing, shallow, out) {
    out[0] = out[1] = out[2] = out[3] = out[4] = 0;
    const N = this.q.detailSize, PA = this._set.PA;
    const lodD = Math.log2(Math.max((spacing * N) / PA, 1e-3)) + 1;
    const gf = (1 - smooth01(clamp(lodD - (Math.log2(N) - 2), 0, 1))) * shallow;
    if (gf <= 0 || !this._countA) return out;
    const fl = this.params.flow;
    const u0 = (x - fl[0] * this.time) / PA, v0 = (z - fl[1] * this.time) / PA;
    const u1 = 0.71 * (0.6216 * u0 - 0.7833 * v0) + 0.31;
    const v1 = 0.71 * (0.7833 * u0 + 0.6216 * v0) + 0.17;
    const D = this._dW;
    const mipFade = (r) => 1 - smooth01(clamp((r - 0.125) / 0.125, 0, 1));
    let h0 = 0, dx0 = 0, dz0 = 0, sx0 = 0, sz0 = 0, h1 = 0, dx1 = 0, dz1 = 0, sx1 = 0, sz1 = 0;
    for (let i = 0; i < this._countA; i++) {
      const wx = D[i * 4], wz = D[i * 4 + 1], ph = D[i * 4 + 2], ap = D[i * 4 + 3];
      const len = Math.hypot(wx, wz);
      const r = (spacing * len) / (TAU * PA); // ızgara aralığı / dalga boyu
      const f0 = mipFade(r) * ap, f1 = mipFade(r * 0.71) * ap;
      if (f0 > 0) {
        const th = wx * u0 + wz * v0 + ph, s = Math.sin(th), c = Math.cos(th);
        h0 += f0 * s; dx0 += (f0 * c * wx) / len; dz0 += (f0 * c * wz) / len; sx0 += f0 * wx * c; sz0 += f0 * wz * c;
      }
      if (f1 > 0) {
        const th = wx * u1 + wz * v1 + ph, s = Math.sin(th), c = Math.cos(th);
        h1 += f1 * s; dx1 += (f1 * c * wx) / len; dz1 += (f1 * c * wz) / len; sx1 += f1 * wx * c; sz1 += f1 * wz * c;
      }
    }
    // döndürülmüş kopyanın vektörlerini geri döndür (v * ROT_A) ve 1/0.71 genlik telafisi
    const rdx = 0.6216 * dx1 + 0.7833 * dz1, rdz = -0.7833 * dx1 + 0.6216 * dz1;
    const rsx = 0.6216 * sx1 + 0.7833 * sz1, rsz = -0.7833 * sx1 + 0.6216 * sz1;
    const k = 0.7071 * gf;
    out[0] = k * PA * (h0 + 1.4085 * h1);
    out[1] = k * PA * this._chopA * (dx0 + 1.4085 * rdx);
    out[2] = k * PA * this._chopA * (dz0 + 1.4085 * rdz);
    out[3] = k * (sx0 + rsx);
    out[4] = k * (sz0 + rsz);
    return out;
  }

  _sampleDepth(x, z) {
    const d = this.depthMap;
    if (!d || !d.data) return 1e4;
    const u = (x - d.rect[0]) / d.rect[2], v = (z - d.rect[1]) / d.rect[3];
    if (u < 0 || v < 0 || u > 1 || v > 1) return 1e4;
    const g = bilinear(d.data, d.width, d.height, 1, u, v, 0) * d.decode[0] + d.decode[1];
    return Math.max(this.level - g, 0);
  }

  _sampleFlow(x, z) {
    const f = this.flowMap;
    if (!f || !f.data) return [0, 0];
    const u = (x - f.rect[0]) / f.rect[2], v = (z - f.rect[1]) / f.rect[3];
    if (u < 0 || v < 0 || u > 1 || v > 1) return [0, 0];
    const ch = f.channels || 4;
    return [
      bilinear(f.data, f.width, f.height, ch, u, v, 0) * f.decode[0] + f.decode[1],
      bilinear(f.data, f.width, f.height, ch, u, v, 1) * f.decode[0] + f.decode[1],
    ];
  }
}

function bilinear(data, w, h, ch, u, v, c) {
  const x = clamp(u * w - 0.5, 0, w - 1), y = clamp(v * h - 0.5, 0, h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = x - x0, fy = y - y0;
  const s = (i, j) => data[(j * w + i) * ch + c];
  return lerp(lerp(s(x0, y0), s(x1, y0), fx), lerp(s(x0, y1), s(x1, y1), fx), fy);
}

// ---------------------------------------------------------------------------
// Sky: prosedürel gökyüzü (tek saçılmalı atmosfer + bulut katmanı).
// Parametre değişince küp haritayı bir kez üretir; her karede maliyeti yok.
// ---------------------------------------------------------------------------
const SKY_FS = /* glsl */ `
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 fragColor;
uniform int uFace;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uMie;
uniform float uCloudCover;
uniform float uCloudDarkness;
uniform vec2 uCloudOffset;
uniform vec3 uSunLight;      // bulutlara düşen güneş ışığı
uniform vec3 uZenith;        // gökyüzü ortam rengi
uniform float uEncode;

const float PI = 3.14159265;
const float RE = 6360.0e3;
const float RA = 6420.0e3;
const vec3 BR = vec3(5.802e-6, 13.558e-6, 33.1e-6);
const float HR = 8000.0;
const float HM = 1200.0;

vec3 faceDir(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  if (uFace == 0) return normalize(vec3(1.0, -c.y, -c.x));
  if (uFace == 1) return normalize(vec3(-1.0, -c.y, c.x));
  if (uFace == 2) return normalize(vec3(c.x, 1.0, c.y));
  if (uFace == 3) return normalize(vec3(c.x, -1.0, -c.y));
  if (uFace == 4) return normalize(vec3(c.x, -c.y, 1.0));
  return normalize(vec3(-c.x, -c.y, -1.0));
}

float raySphereFar(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  return h < 0.0 ? -1.0 : -b + sqrt(h);
}

vec3 atmosphere(vec3 dir) {
  vec3 orig = vec3(0.0, RE + 10.0, 0.0);
  // yatay ışınları kısalt: tek saçılmada ufuk aşırı söner (gerçekte çoklu saçılma aydınlatır)
  float tmax = min(raySphereFar(orig, dir, RA), 90.0e3);
  const int N = 16;
  const int NL = 6;
  float seg = tmax / float(N);
  float mu = dot(dir, uSunDir);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  const float g = 0.76;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 sumR = vec3(0.0), sumM = vec3(0.0), sumMS = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  for (int i = 0; i < N; i++) {
    vec3 p = orig + dir * (seg * (float(i) + 0.5));
    float h = length(p) - RE;
    float dR = exp(-h / HR) * seg;
    float dM = exp(-h / HM) * seg;
    odR += dR;
    odM += dM;
    float tl = raySphereFar(p, uSunDir, RA);
    float segL = tl / float(NL);
    float lR = 0.0, lM = 0.0;
    bool shadow = false;
    for (int j = 0; j < NL; j++) {
      vec3 q = p + uSunDir * (segL * (float(j) + 0.5));
      float hl = length(q) - RE;
      if (hl < 0.0) { shadow = true; break; }
      lR += exp(-hl / HR) * segL;
      lM += exp(-hl / HM) * segL;
    }
    if (!shadow) {
      vec3 sunT = exp(-(BR * lR + uMie * 1.1 * lM));
      vec3 att = exp(-(BR * odR + uMie * 1.1 * odM)) * sunT;
      sumR += att * dR;
      sumM += att * dM;
      // çoklu saçılma (Hillaire 2020'nin yalınlaştırılmışı): noktaya ulaşan güneş ışığının
      // bir kısmı her yöne eşit saçılır; uzun yatay ışınlarda ufku beyazımsı maviye açar
      sumMS += att * (BR * dR + uMie * dM);
    }
  }
  return uSunIntensity * (sumR * BR * pR + sumM * uMie * pM + sumMS * (0.35 / (4.0 * PI)));
}

// tamsayı hash: büyük koordinatlarda da hassas (sin tabanlı hash iGPU'larda bloklanır)
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(p) + 32768) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n >> 8) * (1.0 / 16777216.0);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    s += a * noise(p);
    p = r * p * 2.03;
    a *= 0.5;
  }
  return s / 0.984;
}

void main() {
  vec3 dir = faceDir(vUv);
  vec3 col = atmosphere(normalize(vec3(dir.x, max(dir.y, 0.002), dir.z)));
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  // kapalı hava: gökyüzü grileşir ve kararır
  col = mix(col, vec3(lum) * (1.0 - 0.55 * uCloudDarkness), uCloudCover * uCloudCover);
  float trans = 1.0;
  if (dir.y > 0.0 && uCloudCover > 0.001) {
    float t = 1.0 / (dir.y + 0.04);
    vec2 p = dir.xz * t * 0.9 + uCloudOffset;
    vec2 q = vec2(fbm(p * 0.5), fbm(p * 0.5 + 5.2));
    float n = fbm(p + q * 0.6);
    float c0 = 1.0 - uCloudCover;
    float dens = smoothstep(c0 - 0.12, c0 + 0.32, n);
    vec2 sd = normalize(uSunDir.xz + 1.0e-4) * 0.15;
    float dens2 = smoothstep(c0 - 0.12, c0 + 0.32, fbm(p + sd + q * 0.6));
    float lit = exp(-dens2 * mix(1.5, 5.0, uCloudDarkness));
    float fw = pow(max(dot(dir, uSunDir), 0.0), 8.0);
    vec3 cloud = uSunLight * lit * (0.7 + 1.6 * fw) + uZenith * mix(1.6, 0.9, uCloudDarkness);
    cloud *= mix(1.0, 0.3, uCloudDarkness * dens);
    float fade = smoothstep(0.0, 0.18, dir.y);
    cloud = mix(col, cloud, 0.35 + 0.65 * fade);
    float a = dens * mix(uCloudCover * uCloudCover, 1.0, fade);
    col = mix(col, cloud, a);
    trans = 1.0 - a;
  }
  // ufkun altı: ufuk rengine yakın kalsın (bulanık mip'lerde sis rengi kirlenmesin)
  if (dir.y < 0.0) col *= mix(1.0, 0.75, smoothstep(0.0, -0.6, dir.y));
  fragColor = vec4(col * uEncode, trans);
}`;

// Gökyüzü arka planı. MEDIUM tanımlıyken su ortamını da uygular: kamera ışını yakın
// düzlemden itibaren sudaysa gökyüzü yerine suyun kendi saçtığı ışık görünür.
const SKY_BG_FS = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_ENV}
#ifdef MEDIUM
${GLSL_NEAR}
${GLSL_MEDIUM_CORE}
#endif
in vec2 vUv;
out vec4 fragColor;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform vec3 uSunRadiance;
void main() {
  vec4 p = uInvViewProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w - uCameraPos);
  vec4 e = textureLod(uEnv, dir, 0.0);
  vec3 col = e.rgb * uEnvScale;
  float disc = smoothstep(0.99996, 0.99999, dot(dir, uSunDir));
  col += uSunRadiance * disc * e.a * step(0.0, dir.y);
#ifdef MEDIUM
  if (uNearInfo.x > 0.5) {
    vec3 sg = waterNearSGrad(gl_FragCoord.xy * uNearGrid.zw);
    float sd = uNearInfo.x < 1.5 ? -1.0e4 : sg.x / max(length(sg.yz), 1.0e-7);
    vec3 wat = waterSegment(vec3(0.0), max(-sg.x, 0.0), dir, 1.0e4) + flashGlow(uCameraPos, dir, 1.0e4);
    col = mix(wat, col, smoothstep(-0.75, 0.75, sd));
  }
#endif
#ifdef TONEMAP
  col = toneMap(col);
#endif
  fragColor = vec4(col, 1.0);
}`;

const ATM = { RE: 6360e3, RA: 6420e3, BR: [5.802e-6, 13.558e-6, 33.1e-6], HR: 8000, HM: 1200 };
function raySphereFarJS(o, d, r) {
  const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
  const h = b * b - c;
  return h < 0 ? -1 : -b + Math.sqrt(h);
}
function sunTransmittance(sunDir, mie) {
  if (sunDir[1] < -0.03) return [0, 0, 0];
  const o = [0, ATM.RE + 10, 0];
  const t = raySphereFarJS(o, sunDir, ATM.RA);
  const n = 32, seg = t / n;
  let odR = 0, odM = 0;
  for (let i = 0; i < n; i++) {
    const s = seg * (i + 0.5);
    const p = [o[0] + sunDir[0] * s, o[1] + sunDir[1] * s, o[2] + sunDir[2] * s];
    const h = Math.max(Math.hypot(p[0], p[1], p[2]) - ATM.RE, 0);
    odR += Math.exp(-h / ATM.HR) * seg;
    odM += Math.exp(-h / ATM.HM) * seg;
  }
  const horizon = smooth01(clamp((sunDir[1] + 0.03) / 0.06, 0, 1));
  return ATM.BR.map((b) => Math.exp(-(b * odR + mie * 1.1 * odM)) * horizon);
}

/**
 * new Sky(gl, { size: 512 })
 * sky.set({ sunElevation, sunAzimuth, cloudCover, cloudDarkness, haze, fogDensity, exposure })
 * sky.update()          → değişiklik varsa küp haritayı yeniden üretir
 * sky.applyTo(water)    → su için ortamı ayarla
 * sky.renderBackground(camera, { toneMapping })
 * sky.environment       → bindEnvironment() için nesne (oyunun shader'ları)
 */
export class Sky {
  constructor(gl, opts = {}) {
    this.gl = gl;
    this.caps = detectCaps(gl);
    this.size = opts.size || 512;
    this.params = {
      sunElevation: 35, sunAzimuth: 140, cloudCover: 0.35, cloudDarkness: 0.2,
      haze: 0.3, fogDensity: 0.0005, exposure: 1, sunIntensity: 20, cloudOffset: [0, 0],
    };
    this.sunDirection = [0, 1, 0];
    this.sunColor = [1, 1, 1];
    this.ambient = [0.3, 0.4, 0.5];
    this._float = this.caps.floatRT;
    this.envScale = this._float ? 1 : 4;
    this.envMaxLod = Math.log2(this.size);
    this.envMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envMap);
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, this.envMaxLod + 1, this._float ? gl.RGBA16F : gl.RGBA8, this.size, this.size);
    setTexParams(gl, gl.TEXTURE_CUBE_MAP, { mip: true, wrap: gl.CLAMP_TO_EDGE });
    this._fbo = gl.createFramebuffer();
    this._vao = gl.createVertexArray();
    this._gen = createProgram(gl, FULLSCREEN_VS, SKY_FS);
    this._bgProgs = [createProgram(gl, FULLSCREEN_VS, SKY_BG_FS)];
    this._vp = new Float32Array(16);
    this._ivp = new Float32Array(16);
    this._dirty = true;
    if (opts.params) this.set(opts.params);
  }

  set(p) {
    for (const k in p) {
      if (k in this.params) this.params[k] = Array.isArray(p[k]) ? p[k].slice() : p[k];
    }
    this._dirty = true;
  }

  get environment() {
    return {
      envMap: this.envMap, envScale: this.envScale, envMaxLod: this.envMaxLod, envSize: this.size,
      sunDirection: this.sunDirection, sunColor: this.sunColor,
      fogDensity: this.params.fogDensity, exposure: this.params.exposure,
    };
  }

  applyTo(water) {
    this.update();
    water.setEnvironment(this.environment);
  }

  update() {
    if (!this._dirty) return false;
    this._dirty = false;
    const gl = this.gl;
    const P = this.params;
    const el = P.sunElevation * DEG, az = P.sunAzimuth * DEG;
    this.sunDirection = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
    const mie = 21e-6 * (0.4 + P.haze * 1.6);
    const T = sunTransmittance(this.sunDirection, mie);
    const SUN = 1.7;
    const cover2 = P.cloudCover * P.cloudCover;
    const cloudAtten = 1 - 0.88 * cover2;
    const sunLight = T.map((t) => t * SUN);
    // bulutlar ışığı dağıtır: kapalı havada doğrudan ışık zayıflar ve grileşir
    const sunLum = 0.3 * sunLight[0] + 0.5 * sunLight[1] + 0.2 * sunLight[2];
    this.sunColor = sunLight.map((c) => lerp(c, sunLum, cover2) * cloudAtten);
    // ortam ışığı ~ gökyüzünün ortalama parlaklığı (bulutlar için kaba tahmin)
    const day = smooth01(clamp((this.sunDirection[1] + 0.1) / 0.4, 0, 1));
    const zen = [0.05, 0.11, 0.24].map((c, i) => (c * (0.15 + 0.85 * day) + 0.02 * T[i]) * (P.sunIntensity / 20));
    const grey = (zen[0] + zen[1] + zen[2]) / 3;
    this.ambient = zen.map((c) => lerp(c, grey * 1.2, P.cloudCover * P.cloudCover));

    const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const vp = gl.getParameter(gl.VIEWPORT);
    const g = this._gen;
    gl.useProgram(g.program);
    gl.uniform3fv(g.u.uSunDir, this.sunDirection);
    gl.uniform1f(g.u.uSunIntensity, P.sunIntensity);
    gl.uniform1f(g.u.uMie, mie);
    gl.uniform1f(g.u.uCloudCover, P.cloudCover);
    gl.uniform1f(g.u.uCloudDarkness, P.cloudDarkness);
    gl.uniform2fv(g.u.uCloudOffset, P.cloudOffset);
    gl.uniform3fv(g.u.uSunLight, sunLight);
    gl.uniform3fv(g.u.uZenith, this.ambient);
    gl.uniform1f(g.u.uEncode, 1 / this.envScale);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this._vao);
    for (let f = 0; f < 6; f++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, this.envMap, 0);
      gl.uniform1i(g.u.uFace, f);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.envMap);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    return true;
  }

  /**
   * Gökyüzünü arka plan olarak çiz (derinlik testi kapalı; sahneden önce çağır).
   * medium: Water örneği verilirse (updateNear() çağrıldıysa) su altındaki kısım su rengi olur.
   */
  renderBackground(camera, { toneMapping = false, medium = null, width, height } = {}) {
    const gl = this.gl;
    // varyantlar (ton eşleme / su ortamı) ayrı derlenir: büyük shader iGPU'da yavaşlar
    const tk = toneMapping ? 1 : 0;
    if (medium && medium._med.info[0] === 0) {
      // havada: hafif program; su ortamı varyantını arka planda derlemeye başla (dalışta takılmasın)
      if (!this._bgProgs[tk + 2]) this._bgProgs[tk + 2] = createProgramDeferred(gl, FULLSCREEN_VS, SKY_BG_FS, { TONEMAP: toneMapping, MEDIUM: true });
      medium = null;
    }
    const key = tk + (medium ? 2 : 0);
    let b = this._bgProgs[key];
    if (!b) b = this._bgProgs[key] = createProgram(gl, FULLSCREEN_VS, SKY_BG_FS, { TONEMAP: toneMapping, MEDIUM: !!medium });
    else if (!b.u) finishProgram(gl, b);
    mat4.multiply(this._vp, camera.projection, camera.view);
    mat4.invert(this._ivp, this._vp);
    gl.useProgram(b.program);
    gl.uniformMatrix4fv(b.u.uInvViewProj, false, this._ivp);
    gl.uniform3fv(b.u.uCameraPos, camera.position);
    bindEnvironment(gl, b.u, this.environment, 2);
    gl.uniform3fv(b.u.uSunRadiance, this.sunColor.map((c) => c * 3000));
    if (medium) {
      const vp = width && height ? null : gl.getParameter(gl.VIEWPORT);
      medium._bindMediumUniforms(b.u, 13, { width: width || vp[2], height: height || vp[3] });
    }
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this._vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  dispose() {
    const gl = this.gl;
    gl.deleteTexture(this.envMap);
    gl.deleteFramebuffer(this._fbo);
    gl.deleteVertexArray(this._vao);
    gl.deleteProgram(this._gen.program);
    for (const b of this._bgProgs) if (b) gl.deleteProgram(b.program);
  }
}
