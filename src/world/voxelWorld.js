// Voxel dunya: malzeme + hasar dizileri, isin izleme, kuresel hasar, yapisal butunluk.
import { VS, CS } from '../config.js';
import { MAT_TOUGH, INDESTRUCTIBLE } from './materials.js';

export function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class VoxelWorld {
  constructor(sx, sy, sz) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.sxz = sx * sz;
    this.n = sx * sy * sz;
    this.mat = new Uint8Array(this.n);
    this.dmg = new Uint8Array(this.n);
    this.ncx = sx / CS; this.ncy = sy / CS; this.ncz = sz / CS;
    this.chunkDirty = new Uint8Array(this.ncx * this.ncy * this.ncz);
    this.dirtyList = [];
    this.mark = new Uint32Array(this.n);
    this.markCounter = 1;
    this.removed = new Int32Array(1 << 18);
    this.removedMat = new Uint8Array(1 << 18);
    this.removedCount = 0;
    this.seeds = new Int32Array(1 << 18);
    this.seedCount = 0;
    this.stack = new Int32Array(1 << 20);
    this.listeners = [];
    this.version = 0;
    // su seviyesi (m): bunun altindaki her bos voxel sudur; susuz haritada -Infinity
    this.waterY = -Infinity;
    // yuzen malzeme (buz golu): bu malzemenin [floatY0, floatY1] katlarindaki voxelleri su tasir; kopan buz
    // parcasi (kutle) dusmez, yerinde yuzer. 0: yok
    this.floatMat = 0; this.floatY0 = 0; this.floatY1 = -1;
    // yumusak tavan (m): ustunde aktorleri asagi ceken ek yercekimi (mover.js); ay ussunde dusuk yercekimi
    this.ceilY = Infinity;
  }

  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  inBounds(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.mat[x + this.sx * (z + this.sz * y)];
  }
  // Hareket carpismasi icin: yatay sinir disi ve alt kati; ust bos.
  solid(x, y, z) {
    if (y < 0) return true;
    if (y >= this.sy) return false;
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return true;
    return this.mat[x + this.sx * (z + this.sz * y)] !== 0;
  }
  solidAtWorld(wx, wy, wz) {
    return this.solid(Math.floor(wx / VS), Math.floor(wy / VS), Math.floor(wz / VS));
  }

  onChange(cb) { this.listeners.push(cb); }
  _notify(x0, y0, z0, x1, y1, z1) {
    this.version++;
    for (const cb of this.listeners) cb(x0, y0, z0, x1, y1, z1);
  }

  set(x, y, z, m) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.mat[i] === m) return;
    this.mat[i] = m; this.dmg[i] = 0;
    this.markRegionDirty(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1);
  }

  markRegionDirty(x0, y0, z0, x1, y1, z1) {
    const cx0 = Math.max(0, Math.floor(x0 / CS)), cx1 = Math.min(this.ncx - 1, Math.floor(x1 / CS));
    const cy0 = Math.max(0, Math.floor(y0 / CS)), cy1 = Math.min(this.ncy - 1, Math.floor(y1 / CS));
    const cz0 = Math.max(0, Math.floor(z0 / CS)), cz1 = Math.min(this.ncz - 1, Math.floor(z1 / CS));
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cz = cz0; cz <= cz1; cz++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const ci = cx + this.ncx * (cz + this.ncz * cy);
          if (!this.chunkDirty[ci]) { this.chunkDirty[ci] = 1; this.dirtyList.push(ci); }
        }
  }
  markAllDirty() { this.markRegionDirty(0, 0, 0, this.sx - 1, this.sy - 1, this.sz - 1); }
  takeDirty() {
    const l = this.dirtyList; this.dirtyList = [];
    for (const ci of l) this.chunkDirty[ci] = 0;
    return l;
  }

  // Padli blok cikar (mesher icin). out dizileri (nx+2)*(ny+2)*(nz+2).
  extractPadded(x0, y0, z0, nx, ny, nz, outMat, outDmg) {
    const px = nx + 2, pz = nz + 2;
    const sx = this.sx, sy = this.sy, sz = this.sz, sxz = this.sxz;
    const mat = this.mat, dmg = this.dmg;
    let o = 0;
    for (let y = y0 - 1; y <= y0 + ny; y++) {
      const yIn = y >= 0 && y < sy;
      for (let z = z0 - 1; z <= z0 + nz; z++) {
        const zIn = z >= 0 && z < sz;
        if (!yIn || !zIn) {
          // alt sinir: kati say (alt yuzler uretilmesin)
          const v = y < 0 ? 1 : 0;
          for (let k = 0; k < px; k++) { outMat[o] = v; outDmg[o] = 0; o++; }
          continue;
        }
        const row = sx * z + sxz * y;
        for (let x = x0 - 1; x <= x0 + nx; x++) {
          if (x >= 0 && x < sx) { const i = row + x; outMat[o] = mat[i]; outDmg[o] = dmg[i]; }
          else { outMat[o] = 0; outDmg[o] = 0; }
          o++;
        }
      }
    }
    return o === px * pz * (ny + 2);
  }

  // DDA isin izleme. Dunya metre biriminde. out: {x,y,z,nx,ny,nz,dist,mat,i}
  // pass: gecilen malzemeler (Uint8Array, 1 = saydam gibi gec; botlarin camin ardini gormesi)
  raycast(ox, oy, oz, dx, dy, dz, maxDist, out, pass = null) {
    const inv = 1 / VS;
    const px = ox * inv, py = oy * inv, pz = oz * inv;
    let x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e30;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : 1e30;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : 1e30;
    let tmx = dx > 0 ? (x + 1 - px) * tdx : (px - x) * tdx;
    let tmy = dy > 0 ? (y + 1 - py) * tdy : (py - y) * tdy;
    let tmz = dz > 0 ? (z + 1 - pz) * tdz : (pz - z) * tdz;
    if (dx === 0) tmx = 1e30; if (dy === 0) tmy = 1e30; if (dz === 0) tmz = 1e30;
    const maxT = maxDist * inv;
    const sx = this.sx, sy = this.sy, sz = this.sz, mat = this.mat;
    let t = 0, face = -1;
    for (let iter = 0; iter < 2048; iter++) {
      if (y < 0) {
        out.x = x; out.y = 0; out.z = z; out.nx = 0; out.ny = 1; out.nz = 0; out.dist = t * VS; out.mat = 1; out.i = -1;
        return true;
      }
      if (x >= 0 && z >= 0 && x < sx && z < sz && y < sy) {
        const i = x + sx * (z + sz * y);
        const m = mat[i];
        if (m !== 0 && !(pass && pass[m])) {
          out.x = x; out.y = y; out.z = z; out.dist = t * VS; out.mat = m; out.i = i;
          out.nx = face === 0 ? -stepX : 0; out.ny = face === 1 ? -stepY : 0; out.nz = face === 2 ? -stepZ : 0;
          if (face === -1) { out.nx = -Math.sign(dx); out.ny = 0; out.nz = 0; }
          return true;
        }
      } else if ((x < 0 && stepX < 0) || (x >= sx && stepX > 0) || (z < 0 && stepZ < 0) || (z >= sz && stepZ > 0) || (y >= sy && stepY > 0)) {
        return false;
      }
      if (tmx < tmy) {
        if (tmx < tmz) { x += stepX; t = tmx; tmx += tdx; face = 0; }
        else { z += stepZ; t = tmz; tmz += tdz; face = 2; }
      } else {
        if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; face = 1; }
        else { z += stepZ; t = tmz; tmz += tdz; face = 2; }
      }
      if (t > maxT) return false;
    }
    return false;
  }

  // Iki nokta arasi gorus hatti (dunya metre).
  lineOfSight(ax, ay, az, bx, by, bz, tmp, pass = null) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d, tmp, pass);
  }

  // AABB (metre) dunya ile cakisiyor mu?
  boxSolid(minX, minY, minZ, maxX, maxY, maxZ) {
    const inv = 1 / VS;
    const x0 = Math.floor(minX * inv), x1 = Math.floor((maxX - 1e-6) * inv);
    const y0 = Math.floor(minY * inv), y1 = Math.floor((maxY - 1e-6) * inv);
    const z0 = Math.floor(minZ * inv), z1 = Math.floor((maxZ - 1e-6) * inv);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (this.solid(x, y, z)) return true;
    return false;
  }

  // Kuresel hasar. power: merkezdeki hasar (tough birimi). Kaldirilan voxeller this.removed'a yazilir.
  // Donus: kaldirilan voxel sayisi.
  damageSphere(wx, wy, wz, radius, power, opts = null) {
    const inv = 1 / VS;
    const cx = wx * inv, cy = wy * inv, cz = wz * inv, r = Math.max(0.5, radius * inv);
    const sx = this.sx, sy = this.sy, sz = this.sz;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(sx - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(sy - 1, Math.floor(cy + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(sz - 1, Math.floor(cz + r));
    if (x0 > x1 || y0 > y1 || z0 > z1) return 0;
    const r2 = r * r;
    const mat = this.mat, dmg = this.dmg;
    const noise = opts && opts.noise !== undefined ? opts.noise : 0.5;
    let removed = this.removedCount = 0;
    let changed = false;
    const cap = this.removed.length;
    for (let y = y0; y <= y1; y++) {
      const ddy = y + 0.5 - cy;
      for (let z = z0; z <= z1; z++) {
        const ddz = z + 0.5 - cz;
        const row = sx * (z + sz * y);
        for (let x = x0; x <= x1; x++) {
          const ddx = x + 0.5 - cx;
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (d2 > r2) continue;
          const i = row + x;
          const m = mat[i];
          if (m === 0) continue;
          const tough = MAT_TOUGH[m];
          if (tough === 255) continue;
          const f = 1 - Math.sqrt(d2) / r;
          const amt = power * f * (1 - noise * 0.5 + noise * hash3(x, y, z));
          const total = dmg[i] + amt;
          if (total >= tough) {
            if (removed < cap) { this.removed[removed] = i; this.removedMat[removed] = m; removed++; }
            mat[i] = 0; dmg[i] = 0; changed = true;
          } else if (amt >= 1) {
            const nd = Math.min(254, total) | 0;
            if (((nd * 8 / tough) | 0) !== ((dmg[i] * 8 / tough) | 0)) changed = true;
            dmg[i] = nd;
          }
        }
      }
    }
    this.removedCount = removed;
    if (changed) {
      this.markRegionDirty(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
      this._notify(x0, y0, z0, x1, y1, z1);
    }
    if (removed > 0) this._collectSeeds();
    return removed;
  }

  // Kaldirilan voxellerin kati komsulari -> butunluk kontrolu tohumlari
  _collectSeeds() {
    const id = ++this.markCounter;
    const mark = this.mark, mat = this.mat;
    const sx = this.sx, sy = this.sy, sz = this.sz, sxz = this.sxz;
    let n = this.seedCount; // birikir: findIslands tuketir
    const cap = this.seeds.length;
    for (let k = 0; k < this.removedCount; k++) {
      const i = this.removed[k];
      const y = (i / sxz) | 0; const rem = i - y * sxz; const z = (rem / sx) | 0; const x = rem - z * sx;
      if (x > 0) { const j = i - 1; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
      if (x < sx - 1) { const j = i + 1; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
      if (z > 0) { const j = i - sx; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
      if (z < sz - 1) { const j = i + sx; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
      if (y > 0) { const j = i - sxz; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
      if (y < sy - 1) { const j = i + sxz; if (mat[j] && mark[j] !== id) { mark[j] = id; if (n < cap) this.seeds[n++] = j; } }
    }
    this.seedCount = n;
  }

  // Tohumlardan baglantisiz adaciklari bul. Zemine/yikilmaz malzemeye bagli olanlar sabit.
  // cap: bir aramada gezilecek azami voxel (asilirsa sabit sayilir).
  findIslands(cap = 160000) {
    const islands = [];
    if (this.seedCount === 0) return islands;
    const mark = this.mark, mat = this.mat, stack = this.stack;
    const sx = this.sx, sy = this.sy, sz = this.sz, sxz = this.sxz;
    const anchorId = ++this.markCounter;
    const maxCap = Math.min(cap, stack.length - 8);
    const fm = this.floatMat, fy0 = this.floatY0, fy1 = this.floatY1;
    for (let s = 0; s < this.seedCount; s++) {
      const start = this.seeds[s];
      if (mat[start] === 0) continue;
      const m0 = mark[start];
      if (m0 >= anchorId) continue; // bu kontrolde zaten islendi
      const bfsId = ++this.markCounter;
      let sp = 0, visited = 0;
      stack[sp++] = start; mark[start] = bfsId;
      let anchored = false;
      // gezilenleri ayri tut (sabitlenirse isaretlemek icin)
      const order = this._order || (this._order = new Int32Array(1 << 20));
      while (sp > 0) {
        const i = stack[--sp];
        order[visited++] = i;
        if (INDESTRUCTIBLE[mat[i]]) { anchored = true; break; }
        const y = (i / sxz) | 0;
        if (y === 0) { anchored = true; break; }
        if (fm && mat[i] === fm && y >= fy0 && y <= fy1) { anchored = true; break; }
        if (visited >= maxCap) { anchored = true; break; }
        const rem = i - y * sxz; const z = (rem / sx) | 0; const x = rem - z * sx;
        // asagi en son itilir -> once islenir (zemine hizli inis)
        let j;
        if (y < sy - 1) { j = i + sxz; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } } }
        if (x > 0) { j = i - 1; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } } }
        if (x < sx - 1) { j = i + 1; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } } }
        if (z > 0) { j = i - sx; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } } }
        if (z < sz - 1) { j = i + sx; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } } }
        j = i - sxz; if (mat[j]) { const mj = mark[j]; if (mj === anchorId) { anchored = true; break; } if (mj !== bfsId) { mark[j] = bfsId; stack[sp++] = j; } }
        if (sp >= stack.length - 8) { anchored = true; break; }
      }
      if (anchored) {
        for (let k = 0; k < visited; k++) mark[order[k]] = anchorId;
        for (let k = 0; k < sp; k++) mark[stack[k]] = anchorId;
      } else {
        islands.push(order.slice(0, visited));
      }
    }
    this.seedCount = 0;
    return islands;
  }

  // Adacigi dunyadan cikar: yerel kutu + malzemeler. Dunyadan SILMEZ (removeIsland ayrica).
  extractIsland(indices) {
    const sx = this.sx, sxz = this.sxz;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1, maxY = -1, maxZ = -1;
    let comX = 0, comY = 0, comZ = 0;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const y = (i / sxz) | 0; const rem = i - y * sxz; const z = (rem / sx) | 0; const x = rem - z * sx;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      comX += x + 0.5; comY += y + 0.5; comZ += z + 0.5;
    }
    const nx = maxX - minX + 1, ny = maxY - minY + 1, nz = maxZ - minZ + 1;
    const mats = new Uint8Array(nx * ny * nz);
    const dmgs = new Uint8Array(nx * ny * nz);
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const y = (i / sxz) | 0; const rem = i - y * sxz; const z = (rem / sx) | 0; const x = rem - z * sx;
      const li = (x - minX) + nx * ((z - minZ) + nz * (y - minY));
      mats[li] = this.mat[i]; dmgs[li] = this.dmg[i];
    }
    const c = indices.length;
    return { minX, minY, minZ, nx, ny, nz, mats, dmgs, count: c, com: [comX / c * VS, comY / c * VS, comZ / c * VS] };
  }

  removeIndices(indices) {
    const sx = this.sx, sxz = this.sxz;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1, maxY = -1, maxZ = -1;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      this.mat[i] = 0; this.dmg[i] = 0;
      const y = (i / sxz) | 0; const rem = i - y * sxz; const z = (rem / sx) | 0; const x = rem - z * sx;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (maxX >= 0) {
      this.markRegionDirty(minX - 1, minY - 1, minZ - 1, maxX + 1, maxY + 1, maxZ + 1);
      this._notify(minX, minY, minZ, maxX, maxY, maxZ);
    }
  }

  // Toplu yazim (moloz birakma). list: [x,y,z,m,...]
  depositMany(list, n) {
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1, maxY = -1, maxZ = -1, any = false;
    for (let k = 0; k < n; k += 4) {
      const x = list[k], y = list[k + 1], z = list[k + 2], m = list[k + 3];
      if (x < 0 || y < 1 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) continue;
      const i = x + this.sx * (z + this.sz * y);
      if (this.mat[i] !== 0) continue;
      this.mat[i] = m; this.dmg[i] = 0; any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (any) {
      this.markRegionDirty(minX - 1, minY - 1, minZ - 1, maxX + 1, maxY + 1, maxZ + 1);
      this._notify(minX, minY, minZ, maxX, maxY, maxZ);
    }
    return any ? [minX, minY, minZ, maxX, maxY, maxZ] : null;
  }

  // Bir bolgedeki kati voxelleri tohum yap (moloz sonrasi butunluk icin)
  seedRegion(x0, y0, z0, x1, y1, z1) {
    let n = this.seedCount; const cap = this.seeds.length;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); z0 = Math.max(0, z0);
    x1 = Math.min(this.sx - 1, x1); y1 = Math.min(this.sy - 1, y1); z1 = Math.min(this.sz - 1, z1);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = this.idx(x, y, z);
      if (this.mat[i] && n < cap) this.seeds[n++] = i;
    }
    this.seedCount = n;
  }
}
