// Gun batimi gokyuzu: degrade, gunes diski + parlamasi, ince bulutlar, zenitte yildizlar.
import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color(0x121a3a),
  mid: new THREE.Color(0x3f4478),
  horizon: new THREE.Color(0xf09466),
  ground: new THREE.Color(0x17151c),
  sunColor: new THREE.Color(0xffc896),
};
// ortam haritasi icin daha serin ve notr gokyuzu (her sey turuncuya boyanmasin)
const ENV_SKY = {
  zenith: new THREE.Color(0x2a3560),
  mid: new THREE.Color(0x56628f),
  horizon: new THREE.Color(0x9a8a90),
  ground: new THREE.Color(0x2a2626),
};

export function createSky(sunDir) {
  const uniforms = {
    uSunDir: { value: sunDir.clone().normalize() },
    uTime: { value: 0 },
    uZenith: { value: SKY.zenith.clone().convertSRGBToLinear() },
    uMid: { value: SKY.mid.clone().convertSRGBToLinear() },
    uHorizon: { value: SKY.horizon.clone().convertSRGBToLinear() },
    uGround: { value: SKY.ground.clone().convertSRGBToLinear() },
    uSun: { value: SKY.sunColor.clone().convertSRGBToLinear() },
    uSunBoost: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uZenith, uMid, uHorizon, uGround, uSun;
      uniform float uTime, uSunBoost;
      varying vec3 vDir;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
        col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
        // gunes tarafinda daha sicak ufuk
        float sd = max(dot(d, uSunDir), 0.0);
        float az = max(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0);
        col += uHorizon * pow(az, 6.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.6;
        // ufuk alti
        col = mix(col, uGround, smoothstep(0.0, -0.12, h));
        // bulutlar
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float c = fbm(uv);
          c = smoothstep(0.5, 0.85, c) * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h));
          vec3 cloudCol = mix(uMid * 0.6, uHorizon * 1.4, pow(sd, 3.0) * 0.8 + 0.2);
          col = mix(col, cloudCol, c * 0.75);
          // yildizlar
          vec2 sp = d.xz / (h + 0.3) * 160.0;
          float st = step(0.9975, hash(floor(sp))) * smoothstep(0.35, 0.8, h) * (1.0 - c);
          col += vec3(0.8, 0.85, 1.0) * st * (0.6 + 0.4 * sin(uTime * 2.0 + hash(floor(sp) + 3.0) * 30.0));
        }
        // gunes
        col += uSun * pow(sd, 12.0) * 0.55 * uSunBoost;
        col += uSun * pow(sd, 120.0) * 2.0 * uSunBoost;
        col += uSun * smoothstep(0.9993, 0.9997, sd) * 30.0 * uSunBoost;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return { mesh, uniforms };
}

// Ortam haritasi (PMREM) icin gokyuzunu ayri sahnede bir kez cizer.
export function createEnvironment(renderer, sunDir) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = createSky(sunDir);
  sky.uniforms.uSunBoost.value = 0.12; // yansimada gunesi yumusat
  sky.uniforms.uZenith.value.copy(ENV_SKY.zenith).convertSRGBToLinear();
  sky.uniforms.uMid.value.copy(ENV_SKY.mid).convertSRGBToLinear();
  sky.uniforms.uHorizon.value.copy(ENV_SKY.horizon).convertSRGBToLinear();
  sky.uniforms.uGround.value.copy(ENV_SKY.ground).convertSRGBToLinear();
  sky.mesh.material.depthTest = true;
  s.add(sky.mesh);
  const rt = pmrem.fromScene(s, 0, 0.1, 1000);
  pmrem.dispose();
  sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
  return rt.texture;
}
