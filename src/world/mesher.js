// Greedy voxel mesher + kose ortam golgelemesi (AO). Worker ve ana is parcaciginda kullanilir.
// Girdi: padli malzeme/hasar dizileri, index = (x+1) + (nx+2)*((z+1) + (nz+2)*(y+1))

const NMAT = 32;
const COLOR_LUT = new Uint8Array(NMAT * 8 * 3);
const MATP = new Uint8Array(NMAT * 3);
const TOUGH = new Uint8Array(NMAT);

export function setPalette(p) {
  for (let m = 0; m < NMAT; m++) {
    const c = p.color[m] || 0;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    TOUGH[m] = p.tough[m] || 0;
    const emis = (p.emis[m] || 0) > 0.5;
    for (let dl = 0; dl < 8; dl++) {
      // hasar: koyulasma + is/yanik tonuna kayma (emissive malzemede daha az)
      const k = emis ? dl * 0.05 : dl * 0.085;
      const o = (m * 8 + dl) * 3;
      COLOR_LUT[o] = Math.round(r * (1 - k) + 34 * k * 0.5);
      COLOR_LUT[o + 1] = Math.round(g * (1 - k) + 28 * k * 0.5);
      COLOR_LUT[o + 2] = Math.round(b * (1 - k) + 24 * k * 0.5);
    }
    MATP[m * 3] = Math.round(Math.min(1, p.rough[m] ?? 1) * 255);
    MATP[m * 3 + 1] = Math.round(Math.min(1, p.metal[m] ?? 0) * 255);
    MATP[m * 3 + 2] = Math.round(Math.min(1, p.emis[m] ?? 0) * 255);
  }
}

class Grow {
  constructor(T, n) { this.T = T; this.a = new T(n); this.n = 0; }
  ensure(k) {
    if (this.n + k <= this.a.length) return;
    let m = this.a.length * 2; while (m < this.n + k) m *= 2;
    const b = new this.T(m); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
}

const gPos = new Grow(Float32Array, 1 << 16);
const gNrm = new Grow(Int8Array, 1 << 16);
const gCol = new Grow(Uint8Array, 1 << 16);
const gMat = new Grow(Uint8Array, 1 << 16);
const gIdx = new Grow(Uint32Array, 1 << 16);
let mask = new Int32Array(64 * 64);

function vao(s1, s2, c) { return (s1 && s2) ? 0 : 3 - (s1 + s2 + c); }

export function meshVoxels(mats, dmgs, nx, ny, nz, ox, oy, oz, vs) {
  const px = nx + 2, pz = nz + 2;
  const strides = [1, px * pz, px];
  const dims = [nx, ny, nz];
  const origin = [ox, oy, oz];
  const base0 = 1 + px + px * pz;
  gPos.n = gNrm.n = gCol.n = gMat.n = gIdx.n = 0;
  let vcount = 0;
  const cu = [0, 0, 0];

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const du = dims[u], dv = dims[v], dd = dims[d];
    const sd = strides[d], su = strides[u], sv = strides[v];
    if (mask.length < du * dv) mask = new Int32Array(du * dv);
    for (let side = 0; side < 2; side++) {
      const dir = side ? sd : -sd;
      for (let i = 0; i < dd; i++) {
        let n = 0;
        let any = false;
        for (let b = 0; b < dv; b++) {
          let base = base0 + i * sd + b * sv;
          for (let a = 0; a < du; a++, base += su) {
            const m = mats[base];
            let key = 0;
            if (m !== 0 && mats[base + dir] === 0) {
              const p = base + dir;
              const su0 = mats[p - su] !== 0 ? 1 : 0, su1 = mats[p + su] !== 0 ? 1 : 0;
              const sv0 = mats[p - sv] !== 0 ? 1 : 0, sv1 = mats[p + sv] !== 0 ? 1 : 0;
              const c00 = mats[p - su - sv] !== 0 ? 1 : 0, c10 = mats[p + su - sv] !== 0 ? 1 : 0;
              const c11 = mats[p + su + sv] !== 0 ? 1 : 0, c01 = mats[p - su + sv] !== 0 ? 1 : 0;
              const a00 = vao(su0, sv0, c00), a10 = vao(su1, sv0, c10), a11 = vao(su1, sv1, c11), a01 = vao(su0, sv1, c01);
              const t = TOUGH[m];
              let dl = t > 0 && t < 255 ? ((dmgs[base] * 8 / t) | 0) : 0;
              if (dl > 7) dl = 7;
              key = m | (dl << 8) | (a00 << 11) | (a10 << 13) | (a11 << 15) | (a01 << 17);
              any = true;
            }
            mask[n++] = key;
          }
        }
        if (!any) continue;
        n = 0;
        for (let b = 0; b < dv; b++) {
          for (let a = 0; a < du;) {
            const key = mask[n];
            if (key === 0) { a++; n++; continue; }
            let w = 1;
            while (a + w < du && mask[n + w] === key) w++;
            let h = 1;
            outer: while (b + h < dv) {
              const row = n + h * du;
              for (let k = 0; k < w; k++) if (mask[row + k] !== key) break outer;
              h++;
            }
            // dortgen yay
            const m = key & 255, dl = (key >> 8) & 7;
            const a00 = (key >> 11) & 3, a10 = (key >> 13) & 3, a11 = (key >> 15) & 3, a01 = (key >> 17) & 3;
            // normal ve renk 4 bilesenli: 3 bilesenli 8 bit nitelik D3D'de (ANGLE) yerel bicim degil,
            // her degisiklikte tampon donusturuluyor ve ara sira yarim saniyelik takilmalara yol aciyordu
            gPos.ensure(12); gNrm.ensure(16); gCol.ensure(16); gMat.ensure(16); gIdx.ensure(6);
            const P = gPos.a, N = gNrm.a, C = gCol.a, MA = gMat.a, I = gIdx.a;
            const plane = i + side;
            const corners = [a, b, a + w, b, a + w, b + h, a, b + h];
            const aos = [a00, a10, a11, a01];
            const co = (m * 8 + dl) * 3;
            const cr = COLOR_LUT[co], cg = COLOR_LUT[co + 1], cb = COLOR_LUT[co + 2];
            const ee = MATP[m * 3 + 2];
            const nv = side ? 127 : -127;
            for (let k = 0; k < 4; k++) {
              cu[d] = plane; cu[u] = corners[k * 2]; cu[v] = corners[k * 2 + 1];
              const pp = gPos.n;
              P[pp] = (origin[0] + cu[0]) * vs; P[pp + 1] = (origin[1] + cu[1]) * vs; P[pp + 2] = (origin[2] + cu[2]) * vs;
              gPos.n += 3;
              const nn = gNrm.n;
              N[nn] = d === 0 ? nv : 0; N[nn + 1] = d === 1 ? nv : 0; N[nn + 2] = d === 2 ? nv : 0; N[nn + 3] = 0;
              gNrm.n += 4;
              const cc = gCol.n;
              C[cc] = cr; C[cc + 1] = cg; C[cc + 2] = cb; C[cc + 3] = 255;
              gCol.n += 4;
              const mo = gMat.n;
              MA[mo] = m; MA[mo + 1] = dl * 36; MA[mo + 2] = ee; MA[mo + 3] = aos[k] * 85;
              gMat.n += 4;
            }
            const v0 = vcount;
            const flip = (a00 + a11) < (a10 + a01);
            let ii = gIdx.n;
            if (side) {
              if (!flip) { I[ii++] = v0; I[ii++] = v0 + 1; I[ii++] = v0 + 2; I[ii++] = v0; I[ii++] = v0 + 2; I[ii++] = v0 + 3; }
              else { I[ii++] = v0 + 1; I[ii++] = v0 + 2; I[ii++] = v0 + 3; I[ii++] = v0 + 1; I[ii++] = v0 + 3; I[ii++] = v0; }
            } else {
              if (!flip) { I[ii++] = v0; I[ii++] = v0 + 2; I[ii++] = v0 + 1; I[ii++] = v0; I[ii++] = v0 + 3; I[ii++] = v0 + 2; }
              else { I[ii++] = v0 + 1; I[ii++] = v0 + 3; I[ii++] = v0 + 2; I[ii++] = v0 + 1; I[ii++] = v0; I[ii++] = v0 + 3; }
            }
            gIdx.n = ii;
            vcount += 4;
            for (let l = 0; l < h; l++) {
              const row = n + l * du;
              for (let k = 0; k < w; k++) mask[row + k] = 0;
            }
            a += w; n += w;
          }
        }
      }
    }
  }
  const pos = gPos.a.slice(0, gPos.n);
  const nrm = gNrm.a.slice(0, gNrm.n);
  const col = gCol.a.slice(0, gCol.n);
  const mat = gMat.a.slice(0, gMat.n);
  const idx = vcount < 65536 ? Uint16Array.from(gIdx.a.subarray(0, gIdx.n)) : gIdx.a.slice(0, gIdx.n);
  return { pos, nrm, col, mat, idx, vcount };
}
