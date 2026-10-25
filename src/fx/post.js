// Post-processing zinciri: N8AO (SSAO) -> temizleme -> silah modeli -> Bloom + renk sapmasi + tonemap (AgX)
// + renk derecelendirme + vinyet + sinirlama -> SMAA
import * as THREE from 'three';
import {
  Effect, EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, ChromaticAberrationEffect, SMAAEffect, SMAAPreset,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

// NaN/Inf ve asiri HDR degerleri temizler (bazi GPU'larda tek bir bozuk piksel bloom ile ekrana yayilmasin).
// isnan()/isinf() D3D derleyicisinde (ANGLE) iyilestirme ile silinebiliyor; bu yuzden bit duzeyinde bakilir.
// mode 1 (setDiag): tani gorunumu dogrudan ekrana - yesil NaN, sari Inf, mavi negatif, mor >65000,
// kirmizi >20, beyaz/camgobegi baska yontemle yakalanan NaN, gerisi soluk gri sahne.
class SanitizeEffect extends Effect {
  constructor() {
    super('SanitizeEffect', /* glsl */`
      uniform float mode;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        uvec4 bits = floatBitsToUint(inputColor);
        uvec4 ex = bits & uvec4(0x7f800000u);
        uvec4 mt = bits & uvec4(0x007fffffu);
        bvec4 sp = equal(ex, uvec4(0x7f800000u));
        bvec4 nn = notEqual(mt, uvec4(0u));
        bool anyNan = (sp.x && nn.x) || (sp.y && nn.y) || (sp.z && nn.z) || (sp.w && nn.w);
        bool anySpecial = any(sp);
        vec4 c = inputColor;
        if (mode > 0.5) {
          // siniflar saf renk; normal pikseller 0.05..0.55 gri (saf siyah/beyaz olamaz)
          float l = dot(c.rgb, vec3(0.3, 0.5, 0.2));
          vec3 o = vec3(clamp(0.05 + l * 0.35, 0.05, 0.55));
          bool okR = c.r >= 0.0 && c.r <= 65000.0;
          bool okG = c.g >= 0.0 && c.g <= 65000.0;
          bool okB = c.b >= 0.0 && c.b <= 65000.0;
          bool unord = !(c.r >= 0.0 || c.r < 0.0) || !(c.g >= 0.0 || c.g < 0.0) || !(c.b >= 0.0 || c.b < 0.0);
          if (anyNan) o = vec3(0.0, 1.0, 0.0);
          else if (anySpecial) o = vec3(1.0, 1.0, 0.0);
          else if (any(isnan(c.rgb))) o = vec3(0.0, 1.0, 1.0);
          else if (unord) o = vec3(1.0);
          else if (!(okR && okG && okB)) o = (c.r < 0.0 || c.g < 0.0 || c.b < 0.0) ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 1.0);
          else if (max(max(c.r, c.g), c.b) > 20.0) o = vec3(1.0, 0.0, 0.0);
          else if (sp.w || c.a != c.a) o = vec3(0.0);
          outputColor = vec4(o, 1.0);
          return;
        }
        if (anySpecial) c = vec4(0.0, 0.0, 0.0, 1.0);
        outputColor = vec4(clamp(c.rgb, 0.0, 60.0), clamp(c.a, 0.0, 1.0));
      }`, { uniforms: new Map([['mode', new THREE.Uniform(0)]]) });
  }
}

// Renk derecelendirme (ton eslemeden sonra): kontrast algisal uzayda, doygunluk, sonunda [0,1] sinirlama.
// Not: eski BrightnessContrastEffect lineer uzayda 0.5 etrafinda kontrast verdigi icin koyu pikselleri
// NEGATIF yapiyordu; SMAA/sRGB donusumu negatifi NaN'a cevirip ekranda beyaz/siyah lekeler olusturuyordu.
class GradeEffect extends Effect {
  constructor({ contrast = 0.06, saturation = 0.05 } = {}) {
    super('GradeEffect', /* glsl */`
      uniform float contrast;
      uniform float saturation;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = clamp(inputColor.rgb, 0.0, 1.0);
        vec3 p = sqrt(c);
        p = clamp((p - 0.5) * (1.0 + contrast) + 0.5, 0.0, 1.0);
        vec3 o = p * p;
        float l = dot(o, vec3(0.2126, 0.7152, 0.0722));
        o = clamp(mix(vec3(l), o, 1.0 + saturation), 0.0, 1.0);
        // en koyu tonlari hafif soguk bir griye kaldir (golgeler tamamen simsiyah olup detay kaybolmasin)
        o = o + (1.0 - o) * vec3(0.0016, 0.0019, 0.0027);
        outputColor = vec4(o, clamp(inputColor.a, 0.0, 1.0));
      }`, { uniforms: new Map([['contrast', new THREE.Uniform(contrast)], ['saturation', new THREE.Uniform(saturation)]]) });
  }
}

// Son guvenlik: SMAA/sRGB donusumune yalnizca sonlu ve [0,1] araliginda renk gitsin.
class ClampEffect extends Effect {
  constructor() {
    super('ClampEffect', /* glsl */`
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        uvec4 bits = floatBitsToUint(inputColor);
        bool bad = any(equal(bits & uvec4(0x7f800000u), uvec4(0x7f800000u)));
        vec3 c = bad ? vec3(0.0) : clamp(inputColor.rgb, 0.0, 1.0);
        outputColor = vec4(c, 1.0);
      }`);
  }
}

export const QUALITY = {
  ultra: { label: 'Ultra', scale: 1.0, maxPix: 4.3e6, shadow: 4096, ao: 'Medium', aoHalf: false, bloom: true, smaa: SMAAPreset.HIGH, debrisShadow: true, debrisMul: 1.0, particleMul: 1.0 },
  high: { label: 'Yuksek', scale: 1.0, maxPix: 3.2e6, shadow: 4096, ao: 'Low', aoHalf: false, bloom: true, smaa: SMAAPreset.MEDIUM, debrisShadow: true, debrisMul: 0.8, particleMul: 0.9 },
  medium: { label: 'Orta', scale: 0.85, maxPix: 2.2e6, shadow: 2048, ao: 'Low', aoHalf: false, bloom: true, smaa: SMAAPreset.MEDIUM, debrisShadow: false, debrisMul: 0.6, particleMul: 0.7 },
  low: { label: 'Dusuk', scale: 0.7, maxPix: 1.3e6, shadow: 1024, ao: null, aoHalf: true, bloom: true, smaa: null, debrisShadow: false, debrisMul: 0.4, particleMul: 0.5 },
};

export class PostFX {
  constructor(renderer, scene, camera, quality = 'ultra', viewmodel = null, water = null) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.viewmodel = viewmodel;
    this.water = water;   // WaterSystem (su olan haritada): yuzey, su ici ve lens gecisleri
    this.q = QUALITY[quality] || QUALITY.ultra;
    this.qualityName = quality;
    this.width = 1; this.height = 1;
    this.damage = 0;
    this.build();
  }

  build() {
    if (this.composer) this.composer.dispose();
    const q = this.q;
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.n8 = null;
    const dbg = new URLSearchParams(location.search);
    if (q.ao && !dbg.has('noao')) {
      const n8 = new N8AOPostPass(this.scene, this.camera, this.width, this.height);
      n8.configuration.aoRadius = 1.4;
      n8.configuration.distanceFalloff = 0.9;
      n8.configuration.intensity = 2.6;
      n8.configuration.color = new THREE.Color(0x000000);
      n8.configuration.halfRes = q.aoHalf;
      n8.configuration.gammaCorrection = false;
      // saydam nesne farkindaligi kapali: katkili parcaciklarin alfasi AO'yu bozuyordu (+2 sahne cizimi tasarrufu)
      n8.autoDetectTransparency = false;
      n8.configuration.transparencyAware = false;
      try { n8.setQualityMode(q.ao); } catch (e) { /* surume gore */ }
      composer.addPass(n8);
      this.n8 = n8;
    }
    // su: AO'dan sonra (AO su yuzeyine/dibe yansimasin), temizlemeden once
    const wp = this.water ? this.water.createPasses(composer) : null;
    if (wp) { composer.addPass(wp.surface); composer.addPass(wp.medium); }
    this.sanitize = new SanitizeEffect();
    this.sanitizePass = new EffectPass(this.camera, this.sanitize);
    composer.addPass(this.sanitizePass);
    if (this.viewmodel && !dbg.has('novm')) {
      // silah modeli: derinligi temizleyip ustune ciz (duvara gomulmez)
      const vm = new RenderPass(this.viewmodel.scene, this.viewmodel.camera);
      vm.clearPass.setClearFlags(false, true, false);
      vm.ignoreBackground = true;
      vm.skipShadowMapUpdate = true;
      composer.addPass(vm);
    }
    // lense sicrayan su silah modelini de bozsun
    if (wp) composer.addPass(wp.lens);
    this.bloom = new BloomEffect({
      mipmapBlur: true, luminanceThreshold: 0.92, luminanceSmoothing: 0.25, intensity: 1.15, radius: 0.72,
    });
    this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.25 });
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.grade = new GradeEffect({ contrast: 0.06, saturation: 0.05 });
    this.vignette = new VignetteEffect({ darkness: 0.5, offset: 0.32 });
    this.clamp = new ClampEffect();
    const effects = dbg.has('nobloom') ? [this.ca, this.tone, this.grade, this.vignette, this.clamp] : [this.bloom, this.ca, this.tone, this.grade, this.vignette, this.clamp];
    composer.addPass(new EffectPass(this.camera, ...effects));
    if (q.smaa != null) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: q.smaa })));
    this.composer = composer;
    this.setSize(this.width, this.height);
  }

  // tani modu: temizleme gecisi siniflandirmayi dogrudan ekrana yazar, sonraki gecisler atlanir
  setDiag(on) {
    const passes = this.composer.passes;
    const i = passes.indexOf(this.sanitizePass);
    this.sanitize.uniforms.get('mode').value = on ? 1 : 0;
    for (let k = i + 1; k < passes.length; k++) passes[k].enabled = !on;
    this.sanitizePass.renderToScreen = !!on;
  }

  setQuality(name) {
    if (!QUALITY[name] || name === this.qualityName) return;
    this.q = QUALITY[name]; this.qualityName = name;
    this.build();
  }

  // su sistemi degisince (harita degisimi) zinciri yeniden kur
  setWater(water) {
    if (water === this.water) return;
    this.water = water;
    this.build();
  }

  // w,h: CSS piksel (renderer.setSize birimi)
  setSize(w, h) {
    this.width = w; this.height = h;
    this.composer.setSize(w, h, false);
  }

  // hasar geri bildirimi: kromatik sapma + vinyet kizarmasi
  hit(amount) { this.damage = Math.min(1.5, this.damage + amount); }

  render(dt) {
    this.damage = Math.max(0, this.damage - dt * 2.2);
    const d = this.damage;
    this.ca.offset.set(0.0015 * d + 0.0003, 0.001 * d);
    this.vignette.darkness = 0.5 + d * 0.35;
    this.composer.render(dt);
  }
}
