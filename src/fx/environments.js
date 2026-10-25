// Harita ortamlari: cayir icin water.js gokyuzu + su ayarlari ve uzak tepe silueti.
// Arena ortami (gun batimi) game.js icinde kurulur.
import * as THREE from 'three';
import { hash3 } from '../world/voxelWorld.js';

// gunesli ogleden sonra: water.js Sky parametreleri
export const MEADOW_SKY = {
  sunElevation: 50, sunAzimuth: 212, cloudCover: 0.34, cloudDarkness: 0.1, haze: 0.14,
  fogDensity: 0.0032, sunIntensity: 20, exposure: 1,
};

// gol + dere suyu: kucuk, korunakli, hafif bulanik yesil-mavi; derede akis kopugu
export const MEADOW_WATER = {
  preset: 'pond',
  params: {
    windSpeed: 2.2, windDirection: 35, fetch: 70, choppiness: 0.35, spread: 1.5, detailScale: 0.55,
    waterColor: [0.008, 0.03, 0.024], absorption: [0.42, 0.12, 0.14], turbidity: 0.16,
    sssColor: [0.02, 0.07, 0.04], sss: 0.5, edgeSoftness: 0.07,
    whitecaps: 0, shoreFoam: 0.12, shoreFoamWidth: 0.35, flowFoam: 0.25, foamScale: 1.6,
    caustics: 0.65, causticScale: 1.3, flowCycle: 2.2,
  },
};

// Uzak tepeler ve orman silueti: ucurumlarin ustunden bakinca dunya bitmis gibi gorunmesin.
// Sis onlari ufuk rengine bogar; golge yok, carpisma yok.
export function createHills(center) {
  const SEG = 160, RINGS = 8;
  const radii = [44, 74, 82, 95, 120, 160, 220, 320];
  const pos = [], col = [], idx = [];
  const near = new THREE.Color(0x3d5a2c), far = new THREE.Color(0x5b7088), rock = new THREE.Color(0x6b6a64);
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEG; s++) {
      const a = s / SEG * Math.PI * 2;
      const R = radii[r];
      const n = (k, f) => hash3(Math.floor(s / k) % Math.ceil(SEG / k), r * 13 + f, 7);
      // kademeli tepe profili + agac pürüzü
      const sm = (k, f) => { const t = (s / k) % 1; const i0 = n(k, f), i1 = hash3((Math.floor(s / k) + 1) % Math.ceil(SEG / k), r * 13 + f, 7); const u = t * t * (3 - 2 * t); return i0 + (i1 - i0) * u; };
      // ilk iki halka ucurumlarin arkasindaki boslugu kapatan alcak zemin
      let h = r === 0 ? 9 : r === 1 ? 11 + 2 * hash3(s, r, 3) : 4 + 22 * sm(16, 1) + 8 * sm(5, 2) + 2.5 * hash3(s, r, 3);
      if (r === RINGS - 1) h *= 0.6;
      pos.push(center.x + Math.cos(a) * R, h, center.z + Math.sin(a) * R);
      const c = (r < 4 ? near.clone().lerp(rock, 0.25 * hash3(s, r, 9)) : near.clone().lerp(far, (r - 3) / (RINGS - 4)));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < RINGS - 1; r++) for (let s = 0; s < SEG; s++) {
    const a = r * SEG + s, b = r * SEG + (s + 1) % SEG, c = (r + 1) * SEG + s, d = (r + 1) * SEG + (s + 1) % SEG;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hills';
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}
