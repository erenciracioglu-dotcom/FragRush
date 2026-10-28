// Voxel yuzey malzemesi: MeshStandardMaterial + onBeforeCompile.
// Voxel basina renk sapmasi, kenar pahi, malzeme desenleri (panel, plaka, karo, ikaz seridi...),
// kose AO, neon nabzi. Geometri mutlak dunya koordinatinda tutulur (desen kopmasin diye).
import * as THREE from 'three';
import { VS } from '../config.js';
import { M, MAT_ROUGH, MAT_METAL, MAT_EMISSIVE, MAT_COUNT } from './materials.js';

const PATTERN = new Float32Array(MAT_COUNT);
const P = (ids, v) => ids.forEach((id) => { PATTERN[id] = v; });
P([M.CONCRETE, M.CONCRETE_DARK, M.CONCRETE_RED], 1);
P([M.METAL, M.RUST, M.STEEL, M.FRAME], 2);
P([M.TILE_A, M.TILE_B], 3);
P([M.HAZARD], 4);
P([M.BRICK], 5);
P([M.WOOD], 6);
P([M.GRATE], 7);
P([M.NEON_ORANGE, M.NEON_CYAN, M.NEON_MAGENTA, M.LAMP], 8);
P([M.BEDROCK], 9);
P([M.PAD], 10);
P([M.CRYSTAL], 11);
P([M.RUBBLE, M.SAND, M.MOSS], 12);
P([M.GRASS], 13);
P([M.DIRT], 14);
P([M.BARK], 15);
P([M.LEAVES], 16);
P([M.ROCK, M.CLIFF], 17);
P([M.FLOWER], 18);
// volkan haritasi
P([M.ASH], 19);
P([M.BASALT], 20);
P([M.SCORIA], 21);
P([M.OBSIDIAN], 22);
P([M.MAGMA], 23);
P([M.FIRE], 24);
P([M.VCLIFF], 25);
P([M.BASALT_BRICK], 5);
// buz golu haritasi: kar (26), gol buzu (27), buz tugla (28), sarkit (29), karli cam (30), karli kaya (31)
P([M.SNOW], 26);
P([M.ICE], 27);
P([M.ICE_BRICK], 28);
P([M.ICICLE], 29);
P([M.SNOWPINE], 30);
P([M.SROCK, M.SCLIFF], 31);
P([M.CARROT], 12);
// ay ussu: regolit (32), ay kayasi / krater kenari (33), kubbe cami opak (34; saydam cizim createGlassMaterial),
// govde paneli (35), gunes paneli (36), kopuk yama (37), ekran (38), altin folyo (39)
P([M.REGOLITH], 32);
P([M.MROCK, M.MCLIFF], 33);
P([M.GLASS], 34);
P([M.HULL], 35);
P([M.SOLAR], 36);
P([M.FOAM], 37);
P([M.SCREEN], 38);
P([M.FOIL], 39);
P([M.GROW], 8);
P([M.PLANT], 16);

// lav isigi haritasi yokken baglanan bos doku
const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blankTex.needsUpdate = true;

export const voxelUniforms = {
  uTime: { value: 0 },
  uEmissiveScale: { value: 4.5 },
  uVS: { value: VS },
  uAOStrength: { value: 1.0 },
  uDetail: { value: 1.0 },
  // malzeme basina (puruzluluk, metallik, emissive, desen): tek vec4 dizisi (az uniform yuvasi)
  uMatP: { value: Array.from({ length: MAT_COUNT }, (_, i) => new THREE.Vector4(MAT_ROUGH[i], MAT_METAL[i], MAT_EMISSIVE[i], PATTERN[i])) },
  // lavin cevresine vurdugu turuncu isik (volkan haritasi): ustten gorunus yakinlik haritasi + lav seviyesi
  uLavaOn: { value: 0 },
  uLavaY: { value: -1000 },
  uLavaGlowI: { value: 0 },
  uLavaInv: { value: new THREE.Vector2(1, 1) },
  uLavaGlow: { value: blankTex },
};

export function createVoxelMaterial({ rotated = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 1.0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, voxelUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aMat;
flat varying float vMatId;
flat varying float vDmg;
varying float vAO;
varying vec3 vObjPos;
varying vec3 vWPos;
flat varying vec3 vObjNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vMatId = aMat.x * 255.0;
vDmg = aMat.y * 255.0 / 36.0;
vAO = aMat.w;
vObjPos = position;
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
vObjNormal = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uEmissiveScale;
uniform float uVS;
uniform float uAOStrength;
uniform float uDetail;
uniform vec4 uMatP[${MAT_COUNT}];
uniform float uLavaOn;
uniform float uLavaY;
uniform float uLavaGlowI;
uniform vec2 uLavaInv;
uniform sampler2D uLavaGlow;
flat varying float vMatId;
flat varying float vDmg;
varying float vAO;
varying vec3 vObjPos;
varying vec3 vWPos;
flat varying vec3 vObjNormal;
float vxHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vxLine(float x, float w, float aa) {
  float f = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(w - aa, w + aa, f);
}
float vxNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = vxHash(vec3(i, 0.5)), b = vxHash(vec3(i + vec2(1.0, 0.0), 0.5));
  float c = vxHash(vec3(i + vec2(0.0, 1.0), 0.5)), d = vxHash(vec3(i + 1.0, 0.5));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
vec3 vxEmissive = vec3(0.0);
float vxRough = 1.0;
float vxMetal = 0.0;`)
      .replace('#include <color_fragment>', `
{
  int mid = int(vMatId + 0.5);
  vec4 mp = uMatP[mid];
  float pat = mp.w;
  vec3 base = vColor.rgb;
  base = base * base * (base * 0.305306011 + 0.682171111) + 0.012522878 * base; // sRGB -> lineer
  vec3 q = vObjPos / uVS;
  vec3 an = abs(vObjNormal);
  vec2 t; float vertical = 1.0;
  if (an.x > 0.5) { t = q.zy; }
  else if (an.y > 0.5) { t = q.xz; vertical = 0.0; }
  else { t = q.xy; }
  vec3 cell = floor(q - vObjNormal * 0.5 + 0.0001);
  float h = vxHash(cell);
  float h2 = vxHash(cell + 17.31);
  vec3 fw = fwidth(q);
  float pxv = max(max(fw.x, fw.y), fw.z);
  float detail = (1.0 - smoothstep(0.12, 0.55, pxv)) * uDetail;
  float aa = clamp(pxv * 0.75, 0.002, 0.5);

  // voxel basina parlaklik / ton sapmasi
  float rough = (pat > 4.5 && pat < 6.5) || pat > 11.5 ? 1.0 : 0.0; // tugla/tahta/moloz daha parcali
  float varAmt = pat > 12.5 ? 0.26 : pat > 11.5 ? 0.4 : (rough > 0.5 ? 0.22 : 0.11);
  float var = 1.0 + (h - 0.5) * varAmt * mix(0.4, 1.0, detail);
  vec3 tint = vec3(1.0 + (h2 - 0.5) * 0.07, 1.0, 1.0 - (h2 - 0.5) * 0.07);
  // voxel kenar pahi
  vec2 ft = fract(t); vec2 ed = min(ft, 1.0 - ft);
  float e = min(ed.x, ed.y);
  // hasarli voxellerde kenar daha belirgin (kirik gorunum), saglam yuzeyde ince
  float edgeK = mix(0.1, 0.24, clamp(vDmg / 3.0 + rough * 0.5, 0.0, 1.0));
  float bevel = mix(1.0, 1.0 - edgeK + edgeK * smoothstep(0.0, 0.1, e), detail);
  float p = 1.0;
  vxRough = mp.x;
  vxMetal = mp.y;
  if (pat > 25.5 && pat < 31.5) {
    // kar ve buz: voxel izgarasi belli olmasin (yumusak kar ortusu, puruzsuz gol buzu); tugla derzi kalir
    float bk = pat < 26.5 ? 0.3 : pat < 27.5 ? 0.1 : pat < 28.5 ? 0.75 : 0.35;
    bevel = mix(1.0, bevel, bk);
    var = 1.0 + (h - 0.5) * 0.05 * detail;
    tint = vec3(1.0);
  }
  if (pat > 0.5 && pat < 1.5) {
    // beton panel: 2m x 1.5m derz
    float seam = max(vxLine(t.x / 8.0, 0.012, aa / 8.0), vxLine(t.y / 6.0, 0.016, aa / 6.0));
    p *= 1.0 - seam * 0.32 * detail;
    vec2 pid = floor(vec2(t.x / 8.0, t.y / 6.0));
    p *= 0.95 + 0.1 * vxHash(vec3(pid, cell.y * 0.0 + floor(q.x / 64.0)));
  } else if (pat > 1.5 && pat < 2.5) {
    // celik plaka: 1m panel, perci derzleri, panel basina ton
    float seam = max(vxLine(t.x / 4.0, 0.02, aa / 4.0), vxLine(t.y / 4.0, 0.02, aa / 4.0));
    p *= 1.0 - seam * 0.45 * mix(0.5, 1.0, detail);
    vec2 pid = floor(t / 4.0);
    float ph = vxHash(vec3(pid, 3.7 + an.x * 11.0 + an.z * 5.0));
    p *= 0.9 + 0.2 * ph;
    vxRough = clamp(vxRough + (ph - 0.5) * 0.2, 0.42, 1.0);
  } else if (pat > 2.5 && pat < 3.5) {
    // karo satranc 1m
    vec2 cid = floor(t / 4.0);
    float ch = mod(cid.x + cid.y, 2.0);
    p *= 0.85 + 0.3 * ch;
    float seam = max(vxLine(t.x / 4.0, 0.02, aa / 4.0), vxLine(t.y / 4.0, 0.02, aa / 4.0));
    p *= 1.0 - seam * 0.5;
    vxRough = mix(0.55, 0.8, ch);
  } else if (pat > 3.5 && pat < 4.5) {
    // ikaz seridi: sari/siyah capraz
    float s = step(0.5, fract((q.x + q.y + q.z) / 4.0));
    base = mix(base, vec3(0.02, 0.018, 0.015), s);
  } else if (pat > 4.5 && pat < 5.5) {
    // tugla: yatay harc her voxelde, dikey harc 2 voxelde bir kaydirmali
    float row = floor(t.y);
    float off = mod(row, 2.0);
    float mortar = max(vxLine(t.y, 0.06, aa), vxLine((t.x + off) / 2.0, 0.03, aa / 2.0));
    if (vertical < 0.5) mortar = vxLine(t.x, 0.05, aa);
    p *= 1.0 - mortar * 0.5 * detail;
  } else if (pat > 5.5 && pat < 6.5) {
    // tahta kalas
    float plank = vxLine(t.y / 2.0, 0.03, aa / 2.0);
    float grain = sin(t.x * 3.1 + h * 6.0) * 0.5 + 0.5;
    p *= (1.0 - plank * 0.5) * (0.92 + 0.12 * grain);
  } else if (pat > 6.5 && pat < 7.5) {
    // izgara
    vec2 g = fract(t * 2.0);
    float hole = step(0.25, g.x) * step(g.x, 0.75) * step(0.25, g.y) * step(g.y, 0.75);
    p *= 1.0 - hole * 0.7 * detail;
  } else if (pat > 7.5 && pat < 8.5) {
    // neon nabzi
    float pulse = 0.82 + 0.18 * sin(uTime * 3.0 + h * 6.2831 + q.y * 0.3);
    vxEmissive = base * mp.z * uEmissiveScale * pulse;
  } else if (pat > 8.5 && pat < 9.5) {
    // ana kaya: koyu teknoloji izgarasi
    float grid = max(vxLine(t.x / 8.0, 0.01, aa / 8.0), vxLine(t.y / 8.0, 0.01, aa / 8.0));
    vxEmissive = vec3(1.0, 0.35, 0.08) * grid * 0.35;
  } else if (pat > 9.5 && pat < 10.5) {
    // ziplama pedi: hareketli halkalar
    float r = length(fract(vec2(q.x, q.z) / 12.0) - 0.5) * 12.0;
    float ring = 0.5 + 0.5 * sin(r * 1.6 - uTime * 7.0);
    vxEmissive = base * uEmissiveScale * (0.35 + 0.9 * ring * ring);
    p *= 0.5;
  } else if (pat > 10.5 && pat < 11.5) {
    // kristal
    float sp = pow(h, 12.0);
    vxEmissive = base * (mp.z + sp * 0.6) * uEmissiveScale * 0.5;
  } else if (pat > 31.5) {
    // ay ussu: regolit (32), ay kayasi (33), kubbe cami opak (34), govde paneli (35), gunes paneli (36),
    // kopuk yama (37), ekran (38), altin folyo (39)
    vec2 sc = floor(t * 4.0);
    float s = vxHash(vec3(sc, cell.y * 0.37 + cell.x * 0.11 + 5.0));
    float s2 = vxHash(vec3(sc + 31.7, cell.z * 0.21 + 2.0));
    bool top = vObjNormal.y > 0.5;
    tint = vec3(1.0);
    if (pat < 32.5) {
      // regolit: ince gri toz; genis olcekte acik / koyu lekeler, ince benek, seyrek cakil; voxel kenari silik
      vec2 w = vWPos.xz;
      float big = vxNoise(w * 0.05) * 0.65 + vxNoise(w * 0.17 + 4.0) * 0.35;
      base *= mix(1.0, 0.8 + 0.4 * big, max(detail, 0.35));
      base *= mix(1.0, 0.92 + 0.16 * s, detail);
      base = mix(base, base * 0.5, step(0.975, s2) * detail);
      bevel = mix(1.0, bevel, 0.3);
      var = 1.0 + (h - 0.5) * 0.05 * detail;
      if (!top) base *= vertical > 0.5 ? 0.8 : 0.55;
      vxRough = 0.97;
    } else if (pat < 33.5) {
      // ay kayasi / krater kenari: koyu gri bazalt, gozenekler, yan yuzde katmanlar
      base *= mix(1.0, 0.8 + 0.4 * s, detail);
      base *= 1.0 - 0.5 * step(0.92, s2) * detail;
      if (vertical > 0.5) base *= mix(1.0, 0.84 + 0.22 * vxHash(vec3(0.0, floor(q.y / 3.0), floor((q.x + q.z) / 24.0))), detail);
      if (top) base *= 1.08;
    } else if (pat < 34.5) {
      // kubbe cami (opak cizim: dusen cam parcasi): koyu mavi-yesil, cok parlak, ince ic isik
      base = vec3(0.03, 0.07, 0.1) * (0.85 + 0.3 * h);
      bevel = mix(1.0, bevel, 0.5); var = 1.0;
      vxRough = 0.05; vxMetal = 0.0;
      vxEmissive += vec3(0.01, 0.03, 0.04);
    } else if (pat < 35.5) {
      // govde paneli: beyaz 1 m paneller, ince derz, panel basina ton, kose percinleri
      float seam = max(vxLine(t.x / 4.0, 0.018, aa / 4.0), vxLine(t.y / 4.0, 0.018, aa / 4.0));
      vec2 pid = floor(t / 4.0);
      float ph = vxHash(vec3(pid, 7.7 + an.x * 11.0 + an.z * 5.0));
      base *= (0.92 + 0.12 * ph) * (1.0 - seam * 0.5 * mix(0.5, 1.0, detail));
      vec2 fp = fract(t / 4.0);
      float rv = step(length(abs(fp - 0.5) - 0.42), 0.03);
      base *= 1.0 - rv * 0.35 * detail;
      bevel = mix(1.0, bevel, 0.4); var = 1.0;
      vxRough = 0.45 + 0.15 * ph;
    } else if (pat < 36.5) {
      // gunes paneli: ust yuz koyu mavi hucreler + gumus hatlar; yan / alt gri cerceve
      if (top) {
        float cl = max(vxLine(t.x * 2.0, 0.05, aa * 2.0), vxLine(t.y * 2.0, 0.05, aa * 2.0));
        base = mix(vec3(0.02, 0.035, 0.09) * (0.8 + 0.3 * s), vec3(0.55, 0.58, 0.62), cl);
        vxRough = mix(0.12, 0.4, cl); vxMetal = mix(0.35, 0.9, cl);
      } else { base = vec3(0.32, 0.33, 0.35); vxRough = 0.5; vxMetal = 0.7; }
      bevel = 1.0; var = 1.0;
    } else if (pat < 37.5) {
      // kopuk yama: kabarcikli sari kopuk
      float bl = vxNoise(vWPos.xz * 5.0 + vWPos.y * 3.0) * 0.6 + vxNoise(vWPos.zy * 9.0) * 0.4;
      base *= 0.8 + 0.4 * bl;
      bevel = mix(1.0, bevel, 0.2); var = 1.0;
      vxRough = 0.95;
    } else if (pat < 38.5) {
      // ekran: tarama cizgisi, voxel basina yanip sonen veri bloklari; ust / alt yuz koyu kasa
      if (vertical > 0.5) {
        float sl = 0.75 + 0.25 * sin(t.y * 12.0 - uTime * 6.0);
        float blink = step(0.35, fract(h * 7.0 + uTime * (0.3 + h2)));
        float bar = step(fract(t.x * 0.5 + h), 0.6 + 0.3 * sin(uTime * 1.3 + h * 9.0));
        vec3 scc = h2 < 0.33 ? vec3(0.15, 0.85, 1.0) : h2 < 0.66 ? vec3(0.25, 1.0, 0.45) : vec3(1.0, 0.7, 0.2);
        vxEmissive = scc * mp.z * uEmissiveScale * 0.45 * sl * mix(0.4, 1.0, blink * bar);
        base = scc * 0.2;
      } else base = vec3(0.05);
      bevel = 1.0; var = 1.0;
    } else {
      // altin folyo: kirisik parlak altin (inis aracinin alt kati)
      float cr = vxNoise(vWPos.xz * 7.0 + vWPos.y * 5.0) * 0.6 + vxNoise(vWPos.zy * 13.0 + 2.0) * 0.4;
      base *= 0.7 + 0.6 * cr;
      vxRough = 0.18 + 0.35 * (1.0 - cr); vxMetal = 0.95;
      bevel = mix(1.0, bevel, 0.5); var = 1.0;
    }
  } else if (pat > 25.5) {
    // buz golu: kar (26), gol buzu (27), buz tugla (28), sarkit (29), karli cam (30), karli kaya (31)
    vec2 sc = floor(t * 4.0);
    float s = vxHash(vec3(sc, cell.y * 0.37 + cell.x * 0.11 + 5.0));
    float s2 = vxHash(vec3(sc + 31.7, cell.z * 0.21 + 2.0));
    bool top = vObjNormal.y > 0.5;
    if (pat < 26.5 || (top && pat > 29.5)) {
      // kar (ve karli cam / kayanin ust yuzu): ruzgar dalgalari, hafif benek, ust yuzde goz kirpan kristaller
      vec3 snow = vec3(0.86, 0.9, 0.95);
      float wav = 0.5 + 0.5 * sin(vWPos.x * 0.9 + vWPos.z * 0.35 + sin(vWPos.z * 0.6) * 1.5);
      snow *= mix(1.0, 0.93 + 0.05 * wav + 0.04 * s, detail);
      if (!top) snow *= vec3(0.92, 0.95, 1.0) * (0.96 - 0.05 * vxLine(t.y / 2.0, 0.08, aa / 2.0) * detail);
      base = snow;
      vxRough = 0.8;
      if (top) {
        vec2 gc = floor(t * 6.0);
        float glint = step(0.992, vxHash(vec3(gc, cell.y + 71.0))) * detail;
        float tw = max(0.0, sin(uTime * 2.3 + vxHash(vec3(gc, 3.0)) * 40.0));
        vxEmissive += vec3(0.9, 0.95, 1.0) * glint * tw * tw * 1.8;
      }
    } else if (pat > 30.5) {
      // karli kaya (yan / alt yuz): gri kaya, katmanlar, ustten sarkan kar dudaklari
      base *= mix(1.0, 0.84 + 0.28 * s, detail);
      if (vertical > 0.5) {
        // kaya katmanlari: yuz boyunca dalgali yatay seritler (dikey dilim cizgisi olmasin)
        float sy = q.y / 3.0 + vxNoise(vec2((q.x + q.z) / 21.0, 4.3)) * 2.4;
        base *= mix(1.0, 0.86 + 0.2 * vxHash(vec3(0.0, floor(sy), 9.0)), detail);
        float lip = step(0.76 + 0.16 * s2, fract(t.y)) * step(0.5, vxHash(vec3(floor(t.x * 2.0), cell.y, 7.0)));
        base = mix(base, vec3(0.8, 0.84, 0.9), lip * 0.85 * detail);
      } else base *= 0.75;
      vxRough = 0.85;
    } else if (pat > 29.5) {
      // karli cam (yan / alt yuz): koyu yesil igne kumeleri, seyrek kar
      float leaf = vxHash(vec3(floor(t * 2.0), cell.y + 13.0));
      base *= mix(1.0, 0.62 + 0.62 * leaf, detail);
      base = mix(base, vec3(0.78, 0.82, 0.88), step(0.86, s2) * 0.75 * detail);
      vxRough = 0.8;
    } else if (pat < 27.5) {
      // gol buzu: genis lekeler (alttaki derin suyu gosteren koyu seffaf buz / acik mavi / kirag), dunya
      // olceginde catlak agi, donmus kabarciklar. Yan yuz: kirik kenar; alt yuz: su altindan bakista isik gecirir
      vec2 w = vWPos.xz;
      float m1 = vxNoise(w * 0.3) * 0.65 + vxNoise(w * 0.95 + 7.3) * 0.35;
      vec3 col = mix(vec3(0.025, 0.085, 0.13), base * 1.05, smoothstep(0.22, 0.6, m1));
      col = mix(col, vec3(0.72, 0.82, 0.9), smoothstep(0.64, 0.88, m1) * 0.8);
      vec2 cw = w * 0.55 + vec2(vxNoise(w * 0.7), vxNoise(w * 0.7 + 3.1)) * 1.4;
      float cr = max(vxLine(cw.x, 0.016, 0.02), vxLine(cw.y * 0.8 + cw.x * 0.3, 0.014, 0.02));
      vec2 cw2 = w * 1.7 + vec2(vxNoise(w * 2.1 + 9.0), vxNoise(w * 2.1 + 4.0)) * 1.2;
      float cr2 = vxLine(cw2.x + cw2.y * 0.4, 0.02, 0.03) * step(0.55, vxNoise(w * 0.5 + 2.0));
      col = mix(col, vec3(0.85, 0.93, 1.0), max(cr, cr2 * 0.6) * 0.75 * detail);
      float bub = step(0.985, vxHash(vec3(floor(w * 9.0), 5.0))) * (1.0 - smoothstep(0.25, 0.6, m1));
      col = mix(col, vec3(0.75, 0.88, 0.95), bub * 0.7 * detail);
      if (top) {
        base = col;
        vxRough = 0.035 + 0.3 * smoothstep(0.62, 0.9, m1);
      } else if (vObjNormal.y < -0.5) {
        base = vec3(0.1, 0.22, 0.28);
        vxEmissive += vec3(0.05, 0.16, 0.21);
        vxRough = 0.2;
      } else {
        base = mix(base * 1.1, vec3(0.6, 0.8, 0.9), 0.3) * (0.92 + 0.08 * vxLine(t.y, 0.1, aa));
        vxEmissive += base * 0.05;
        vxRough = 0.1;
      }
    } else if (pat < 28.5) {
      // buz tugla: 2x1 voxel bloklar (yatayda 2x2), karli derz, blok basina ton, blok ortasi acik
      float row = floor(t.y);
      float off = mod(row, 2.0);
      vec2 fb = fract(vec2((t.x + off) / 2.0, t.y));
      float bh = vxHash(vec3(floor((t.x + off) / 2.0), row, 3.0 + an.x * 7.0));
      float mortar = max(vxLine(t.y, 0.07, aa), vxLine((t.x + off) / 2.0, 0.035, aa / 2.0));
      if (vertical < 0.5) {
        vec2 tb = t / 2.0;
        fb = fract(tb);
        bh = vxHash(vec3(floor(tb), 9.0));
        mortar = max(vxLine(tb.x, 0.035, aa / 2.0), vxLine(tb.y, 0.035, aa / 2.0));
      }
      vec3 ice = base * (0.84 + 0.32 * bh);
      ice = mix(ice, ice * vec3(0.8, 0.95, 1.12), step(0.7, bh) * 0.5);
      float ctr = 1.0 - max(abs(fb.x - 0.5), abs(fb.y - 0.5)) * 2.0;
      ice *= 0.9 + 0.2 * ctr;
      base = mix(ice, vec3(0.86, 0.9, 0.95), mortar * 0.85 * detail);
      if (top) base = mix(base, vec3(0.86, 0.9, 0.95), 0.5);
      vxRough = mix(0.12, 0.7, mortar);
      vxEmissive += ice * 0.03;
    } else {
      // sarkit: dikey ince cizgiler, cok parlak, hafif ic isik
      float st = vxLine(t.x * 1.3 + h * 3.0, 0.15, aa);
      base *= 1.0 + 0.15 * st;
      vxRough = 0.03;
      vxEmissive += base * (0.06 + 0.14 * pow(h2, 6.0));
    }
  } else if (pat > 18.5) {
    // volkanik: kul (19), bazalt (20), curuf (21), obsidyen (22), magma kaya (23), mangal atesi (24),
    // volkanik ucurum (25)
    vec2 sc = floor(t * 4.0);
    float s = vxHash(vec3(sc, cell.y * 0.37 + cell.x * 0.11 + 5.0));
    float s2 = vxHash(vec3(sc + 31.7, cell.z * 0.21 + 2.0));
    bool top = vObjNormal.y > 0.5;
    float k = mix(1.0, 0.8 + 0.4 * s, detail);
    if (pat < 19.5) {
      // kul: koyu gri benekli; ustte acik kul lekeleri ve seyrek sonmemis kor, yanda koyu alt katman
      base *= k;
      if (top) {
        base = mix(base, base * vec3(1.4, 1.34, 1.3), step(0.8, s2) * 0.6 * detail);
        float ember = step(0.9985, s) * step(0.6, h2) * detail;
        float fl = 0.45 + 0.55 * sin(uTime * (1.5 + s2 * 3.0) + h * 40.0);
        vxEmissive += vec3(1.0, 0.24, 0.035) * ember * max(fl, 0.0) * 1.4;
      } else if (vertical > 0.5) {
        float fy = fract(t.y);
        float edge = 0.55 + 0.3 * vxHash(vec3(floor(t * vec2(4.0, 1.0)), 9.0));
        base = mix(base * vec3(0.66, 0.62, 0.64), base, step(edge, fy));
      }
    } else if (pat < 20.5) {
      // bazalt: yan yuzde dikey sutun derzleri ve yatay kiriklar, ustte kaydirilmis cokgen hucreler
      if (vertical > 0.5) {
        float cid = floor(t.x / 4.0);
        float colW = 3.0 + floor(vxHash(vec3(cid, 0.0, 7.0)) * 2.0);
        float seam = vxLine(t.x / colW, 0.035, aa / colW);
        float band = vxLine(t.y / 9.0 + vxHash(vec3(floor(t.x / colW), 3.0, 1.0)), 0.025, aa / 9.0);
        base *= (1.0 - max(seam, band * 0.6) * 0.5 * detail) * (0.9 + 0.2 * vxHash(vec3(floor(t.x / colW), 1.0, 5.0)));
      } else {
        vec2 g = t / 3.0;
        g.x += 0.5 * mod(floor(g.y), 2.0);
        vec2 fg = fract(g);
        float ed = min(min(fg.x, 1.0 - fg.x), min(fg.y, 1.0 - fg.y));
        base *= 1.0 - (1.0 - smoothstep(0.0, 0.07 + aa, ed)) * 0.5 * detail;
        base *= 0.88 + 0.24 * vxHash(vec3(floor(g), 2.0));
      }
      base *= k;
      vxRough = clamp(vxRough + (s - 0.5) * 0.2, 0.5, 1.0);
    } else if (pat < 21.5) {
      // curuf: kirmizimsi kahve, koyu gozenekler, pas tonlu lekeler
      base *= k;
      base *= 1.0 - 0.65 * step(0.8, s) * detail;
      base = mix(base, base * vec3(1.4, 1.0, 0.8), step(0.86, s2) * 0.6 * detail);
    } else if (pat < 22.5) {
      // obsidyen: cam gibi siyah; voxel basina parlaklik, mor/yesil hare ve dalgali kirik izleri
      float f = vxHash(cell + 3.1);
      base *= 0.8 + 0.4 * f;
      base = mix(base, base * vec3(0.75, 1.15, 1.6), step(0.68, f) * 0.6);
      vxRough = 0.035 + 0.2 * h2;
      float wav = vxLine((t.x + t.y * 0.6) * 0.7 + sin(t.y * 1.3 + h * 6.0) * 0.4, 0.035, aa);
      base *= 1.0 - wav * 0.25 * detail;
    } else if (pat < 23.5) {
      // magma kaya: koyu kabuk + akkor catlaklar (yavas nabiz); renk = catlagin parlamasi
      vec3 crust = vec3(0.04, 0.018, 0.012) * (0.8 + 0.4 * s);
      vec2 w = t * 0.5;
      w += vec2(vxHash(vec3(floor(w), 11.0)), vxHash(vec3(floor(w), 13.0))) * 0.35;
      float c1 = vxLine(w.x + 0.3 * sin(w.y * 2.3 + h * 6.0), 0.06, aa);
      float c2 = vxLine(w.y + 0.3 * sin(w.x * 1.7 + h2 * 6.0), 0.06, aa);
      float crack = max(c1, c2) * mix(0.55, 1.0, detail);
      float pulse = 0.7 + 0.3 * sin(uTime * 1.3 + h * 6.2831 + q.x * 0.2 + q.z * 0.15);
      vxEmissive += base * (crack * mp.z * uEmissiveScale * 0.6 + 0.05) * pulse;
      base = mix(crust, base * 0.35, crack);
      vxRough = 0.9;
    } else if (pat < 24.5) {
      // mangal atesi: titreyen alev
      float fl = 0.72 + 0.28 * sin(uTime * 13.0 + h * 20.0) * sin(uTime * 7.3 + q.y);
      vxEmissive = base * mp.z * uEmissiveScale * fl;
    } else {
      // volkanik ucurum: koyu kaya, yanda katmanlar ve egik koyu akinti izleri, ustte kul serpintisi
      base *= k * (1.0 - 0.3 * step(0.93, s));
      if (vertical > 0.5) {
        base *= mix(1.0, 0.8 + 0.28 * vxHash(vec3(0.0, floor(q.y / 3.0), floor((q.x + q.z) / 24.0))), detail);
        float sx = (q.x + q.z) / 5.0;
        float streak = vxLine(sx + vxHash(vec3(floor(sx), 0.0, 3.0)), 0.07, aa / 5.0);
        base *= 1.0 - streak * 0.3 * detail;
      }
      if (top) base = mix(base, base * vec3(1.35, 1.3, 1.3), step(0.82, s2) * 0.5 * detail);
    }
  } else if (pat > 12.5) {
    // dogal malzemeler: voxel alti (4x4) benek, cimen yanlarinda toprak, kabuk oluklari, cicekler
    vec2 sc = floor(t * 4.0);
    float s = vxHash(vec3(sc, cell.y * 0.37 + cell.x * 0.11 + 5.0));
    float s2 = vxHash(vec3(sc + 31.7, cell.z * 0.21 + 2.0));
    bool top = vObjNormal.y > 0.5;
    float k = mix(1.0, 0.82 + 0.36 * s, detail);
    if (pat < 13.5 || pat > 17.5) {
      // cimen / cicek: ust yuz yesil + sari-yesil lekeler; yan yuzde ustte yesil sacak, altta toprak
      if (top) {
        base *= k;
        base = mix(base, base * vec3(1.3, 1.18, 0.55), step(0.84, s2) * 0.7 * detail);
        if (pat > 17.5) {
          // cicek benekleri: her hucre ayri renk (kirmizi, sari, beyaz, mor)
          float f = step(0.7, s);
          float hue = s2;
          vec3 pc = hue < 0.25 ? vec3(0.75, 0.06, 0.05) : hue < 0.5 ? vec3(0.85, 0.62, 0.05) : hue < 0.75 ? vec3(0.8, 0.8, 0.78) : vec3(0.42, 0.16, 0.7);
          base = mix(base, pc, f * mix(0.6, 1.0, detail));
          vxRough = mix(vxRough, 0.6, f);
        }
      } else if (vertical > 0.5) {
        float fy = fract(t.y);
        float edge = 0.5 + 0.3 * vxHash(vec3(floor(t * vec2(4.0, 1.0)), 9.0));
        vec3 dirt = vec3(0.14, 0.072, 0.03) * (0.85 + 0.3 * s);
        base = mix(dirt, base * k, step(edge, fy));
      } else base = vec3(0.12, 0.065, 0.028);
    } else if (pat < 14.5) {
      // toprak: kahve + cakil benekleri
      base *= k * (1.0 - 0.25 * step(0.9, s2));
    } else if (pat < 15.5) {
      // kabuk: dikey oluklar; kesik yuzde yillik halkalar
      if (vertical > 0.5) {
        float gx = t.x * 1.6 + vxHash(vec3(floor(t.x), cell.y * 0.0, cell.z * 0.0 + 3.0)) * 0.7;
        float groove = vxLine(gx, 0.12, aa * 1.6);
        base *= (1.0 - groove * 0.45 * detail) * (0.9 + 0.2 * s);
      } else {
        float r = length(fract(t / 8.0) - 0.5) * 8.0;
        base = mix(base * 1.9, base * 1.4, 0.5 + 0.5 * sin(r * 5.0)) * vec3(1.15, 1.05, 0.85);
      }
    } else if (pat < 16.5) {
      // yaprak: koyu/acik yaprak kumeleri, gunes alan ust yuz biraz sarimsi
      float leaf = vxHash(vec3(floor(t * 2.0), cell.y + 13.0));
      base *= mix(1.0, 0.62 + 0.62 * leaf, detail) * (0.92 + 0.16 * s);
      if (top) base *= vec3(1.12, 1.1, 0.8);
      vxRough = 0.75 + 0.2 * leaf;
    } else {
      // kaya / ucurum: gri, catlak benekleri, yan yuzde yatay katmanlar, ustte liken
      base *= k * (1.0 - 0.3 * step(0.93, s));
      if (vertical > 0.5) base *= mix(1.0, 0.86 + 0.2 * vxHash(vec3(0.0, floor(q.y / 3.0), floor((q.x + q.z) / 24.0))), detail);
      if (top) base = mix(base, base * vec3(1.05, 1.25, 0.7), step(0.8, s2) * 0.5 * detail);
    }
  }
  // hasar catlaklari
  if (vDmg > 0.5) {
    float cr = vxHash(floor(q * 2.0 - vObjNormal * 0.25));
    p *= 1.0 - step(0.82, cr) * min(vDmg, 6.0) * 0.07;
  }
  vec3 alb = base * tint * var * bevel * p;
  diffuseColor.rgb *= alb;
  // lav isigi: yakindaki lavin (ustten yakinlik haritasi) asagidan ve yandan vurdugu turuncu isik.
  // Yukseldikce soner; asagi ve yana bakan yuzler daha cok alir.
  if (uLavaOn > 0.5) {
    float lg = texture2D(uLavaGlow, vWPos.xz * uLavaInv).r;
    float hh = vWPos.y - uLavaY;
    // seviyenin altindaki yuzler de isinir: patlayip acilan kraterde acikta kalan lav duvarinin isigi
    if (lg > 0.002) {
      float fall = hh > 0.0 ? exp(-hh * 0.8) : 0.8;
      float face = vObjNormal.y < -0.5 ? 1.3 : (vObjNormal.y > 0.5 ? 0.45 : 1.0);
      float fl = 0.86 + 0.14 * sin(uTime * 1.7 + vWPos.x * 0.6 + vWPos.z * 0.45);
      float le = lg * fall * face * fl * uLavaGlowI;
      le = le / (1.0 + le * 0.12);   // kiyida yumusak doyma (AgX acik ten rengine kacmasin)
      vxEmissive += alb * vec3(1.0, 0.24, 0.035) * le;
    }
  }
}
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vxRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vxMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vxEmissive;')
      .replace('#include <aomap_fragment>', `
{
  float ao = vAO;
  ao = ao * ao * (3.0 - 2.0 * ao);
  float aoF = mix(1.0, 0.28 + 0.72 * ao, uAOStrength);
  reflectedLight.indirectDiffuse *= aoF;
  reflectedLight.indirectSpecular *= aoF;
  reflectedLight.directDiffuse *= mix(1.0, aoF, 0.35);
  reflectedLight.directSpecular *= mix(1.0, aoF, 0.35);
  // alcak gunesin parlak yuzeylerde yaptigi asiri yansima ekrani beyaza boyamasin
  reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(1.6));
  reflectedLight.directDiffuse = min(reflectedLight.directDiffuse, vec3(3.2));
  reflectedLight.indirectSpecular = min(reflectedLight.indirectSpecular, vec3(1.2));
}`);
  };
  mat.customProgramCacheKey = () => 'voxel-v1' + (rotated ? 'r' : '');
  return mat;
}

// Kubbe cami (ay ussu): chunk'larin saydam mesh'i (mesher bolmesi). Dik bakista neredeyse gorunmez, kenara
// dogru (fresnel) daha opak ve yansitici; hasar kademesiyle beyazimsi catlaklar ve buzlanma. Golge atmaz.
export function createGlassMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xc4e4f4, roughness: 0.04, metalness: 0.05, transparent: true, depthWrite: false, envMapIntensity: 1.8 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVS = voxelUniforms.uVS;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aMat;
flat varying float vDmg;
varying vec3 vObjPos;
flat varying vec3 vObjNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vDmg = aMat.y * 255.0 / 36.0;
vObjPos = position;
vObjNormal = normal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uVS;
flat varying float vDmg;
varying vec3 vObjPos;
flat varying vec3 vObjNormal;
float glHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float glCrack = 0.0;
{
  vec3 q = vObjPos / uVS;
  vec3 an = abs(vObjNormal);
  vec2 t = an.x > 0.5 ? q.zy : an.y > 0.5 ? q.xz : q.xy;
  if (vDmg > 0.5) {
    // catlak: voxel basina iki rastgele kirik hatti + merkezde buzlanma
    vec3 cell = floor(q - vObjNormal * 0.5 + 0.0001);
    vec2 f = fract(t) - 0.5;
    float h = glHash(cell) * 6.2831;
    float l1 = abs(f.x * cos(h) + f.y * sin(h));
    float l2 = abs(f.x * cos(h + 2.1) + f.y * sin(h + 2.1));
    float k = min(vDmg, 6.0);
    glCrack = clamp((1.0 - smoothstep(0.012, 0.05, min(l1, l2))) * k / 3.0 + (1.0 - smoothstep(0.0, 0.45, length(f))) * k * 0.06, 0.0, 1.0);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.3, vec3(0.9, 0.95, 1.0), glCrack);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float nv = abs(dot(normal, normalize(vViewPosition)));
  float fres = pow(1.0 - nv, 3.0);
  diffuseColor.a = clamp(0.08 + 0.55 * fres + glCrack * 0.8, 0.0, 0.95);
}`);
  };
  mat.customProgramCacheKey = () => 'glass-v1';
  return mat;
}
