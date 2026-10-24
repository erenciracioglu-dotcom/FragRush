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

export const voxelUniforms = {
  uTime: { value: 0 },
  uEmissiveScale: { value: 4.5 },
  uVS: { value: VS },
  uAOStrength: { value: 1.0 },
  uDetail: { value: 1.0 },
  uMatRough: { value: Array.from(MAT_ROUGH) },
  uMatMetal: { value: Array.from(MAT_METAL) },
  uMatEmis: { value: Array.from(MAT_EMISSIVE) },
  uMatPattern: { value: Array.from(PATTERN) },
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
flat varying vec3 vObjNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vMatId = aMat.x * 255.0;
vDmg = aMat.y * 255.0 / 36.0;
vAO = aMat.w;
vObjPos = position;
vObjNormal = normal;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uEmissiveScale;
uniform float uVS;
uniform float uAOStrength;
uniform float uDetail;
uniform float uMatRough[${MAT_COUNT}];
uniform float uMatMetal[${MAT_COUNT}];
uniform float uMatEmis[${MAT_COUNT}];
uniform float uMatPattern[${MAT_COUNT}];
flat varying float vMatId;
flat varying float vDmg;
varying float vAO;
varying vec3 vObjPos;
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
vec3 vxEmissive = vec3(0.0);
float vxRough = 1.0;
float vxMetal = 0.0;`)
      .replace('#include <color_fragment>', `
{
  int mid = int(vMatId + 0.5);
  float pat = uMatPattern[mid];
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
  float varAmt = pat > 11.5 ? 0.4 : (rough > 0.5 ? 0.22 : 0.11);
  float var = 1.0 + (h - 0.5) * varAmt * mix(0.4, 1.0, detail);
  vec3 tint = vec3(1.0 + (h2 - 0.5) * 0.07, 1.0, 1.0 - (h2 - 0.5) * 0.07);
  // voxel kenar pahi
  vec2 ft = fract(t); vec2 ed = min(ft, 1.0 - ft);
  float e = min(ed.x, ed.y);
  // hasarli voxellerde kenar daha belirgin (kirik gorunum), saglam yuzeyde ince
  float edgeK = mix(0.1, 0.24, clamp(vDmg / 3.0 + rough * 0.5, 0.0, 1.0));
  float bevel = mix(1.0, 1.0 - edgeK + edgeK * smoothstep(0.0, 0.1, e), detail);
  float p = 1.0;
  vxRough = uMatRough[mid];
  vxMetal = uMatMetal[mid];
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
    vxEmissive = base * uMatEmis[mid] * uEmissiveScale * pulse;
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
    vxEmissive = base * (uMatEmis[mid] + sp * 0.6) * uEmissiveScale * 0.5;
  }
  // hasar catlaklari
  if (vDmg > 0.5) {
    float cr = vxHash(floor(q * 2.0 - vObjNormal * 0.25));
    p *= 1.0 - step(0.82, cr) * min(vDmg, 6.0) * 0.07;
  }
  diffuseColor.rgb *= base * tint * var * bevel * p;
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
