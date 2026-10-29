// Voksel esitleme (ev sahibi -> konuk). Ev sahibi, konuklardaki dunyanin golge kopyasini tutar; kirli chunk'lari
// golgeyle karsilastirir, degisen vokselleri (indeks farki + malzeme + hasar) kodlar. Degerler MUTLAKTIR: ayni fark
// iki kez uygulansa zarar vermez. Mesher'in takeDirty'sine dokunmaz (world.netDirty ayri kumedir).
import { CS } from '../config.js';

const CV = CS * CS * CS;           // chunk basina voksel (32768)
export const MAX_PART = 16 * 1024; // tek mesaj siniri

// chunk indeksi ci = cx + ncx * (cz + ncz * cy)
export function chunkCoords(world, ci) {
  const cx = ci % world.ncx;
  const r = (ci - cx) / world.ncx;
  const cz = r % world.ncz;
  const cy = (r - cz) / world.ncz;
  return [cx, cy, cz];
}

export class VoxelShadow {
  constructor(world) {
    this.world = world;
    this.mat = world.mat.slice();
    this.dmg = world.dmg.slice();
    this._buf = new Uint8Array(1 << 20);
  }

  // golgeyi dunyaya esitle (yeni harita / mac basi)
  reset() { this.mat.set(this.world.mat); this.dmg.set(this.world.dmg); }

  _ensure(n) {
    if (this._buf.length >= n) return;
    let l = this._buf.length; while (l < n) l *= 2;
    const b = new Uint8Array(l); b.set(this._buf); this._buf = b;
  }

  // chunkList: kirli chunk indeksleri. Donus: ham yuk (Uint8Array) ya da degisiklik yoksa null. Golgeyi gunceller.
  // Bicim: u16 chunkSayisi; her chunk icin: u16 ci, u16 sayi, sayi x u16 indeks FARKI (ilki mutlak),
  // sayi x u8 malzeme, sayi x u8 hasar. (Yapi-dizisi duzeni deflate icin daha iyi.)
  diff(chunkList) {
    const w = this.world, sx = w.sx, sxz = w.sxz;
    const wm = w.mat, wd = w.dmg, sm = this.mat, sd = this.dmg;
    let o = 2, nChunks = 0;
    const idxScratch = this._idx || (this._idx = new Uint16Array(CV));
    for (const ci of chunkList) {
      const [cx, cy, cz] = chunkCoords(w, ci);
      const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
      let n = 0;
      for (let ly = 0; ly < CS; ly++) {
        for (let lz = 0; lz < CS; lz++) {
          let gi = x0 + sx * (z0 + lz) + sxz * (y0 + ly);
          let li = CS * (lz + CS * ly);
          for (let lx = 0; lx < CS; lx++, gi++, li++) {
            if (wm[gi] !== sm[gi] || wd[gi] !== sd[gi]) idxScratch[n++] = li;
          }
        }
      }
      if (n === 0) continue;
      this._ensure(o + 4 + n * 4 + 8);
      const b = this._buf;
      b[o++] = ci & 255; b[o++] = ci >> 8; b[o++] = n & 255; b[o++] = n >> 8;
      let prev = 0;
      for (let k = 0; k < n; k++) { const d = idxScratch[k] - prev; prev = idxScratch[k]; b[o++] = d & 255; b[o++] = d >> 8; }
      for (let k = 0; k < n; k++) {
        const li = idxScratch[k];
        const lx = li & 31, lz = (li >> 5) & 31, ly = li >> 10;
        const gi = x0 + lx + sx * (z0 + lz) + sxz * (y0 + ly);
        b[o++] = wm[gi]; sm[gi] = wm[gi];
      }
      for (let k = 0; k < n; k++) {
        const li = idxScratch[k];
        const lx = li & 31, lz = (li >> 5) & 31, ly = li >> 10;
        const gi = x0 + lx + sx * (z0 + lz) + sxz * (y0 + ly);
        b[o++] = wd[gi]; sd[gi] = wd[gi];
      }
      nChunks++;
    }
    if (nChunks === 0) return null;
    this._buf[0] = nChunks & 255; this._buf[1] = nChunks >> 8;
    return this._buf.slice(0, o);
  }

  // bir chunk'in TAM icerigi (geç katilim ya da bozulma onarimi): ayni bicim, tum 32768 voksel degil yalniz
  // malzemesi bos olmayanlar degil — mutlak oldugu icin kodlanacak olan golgeden FARK degil dunyanin kendisi:
  // golgeyi bos varsayip fark almak yerine chunk'i dogrudan yaz.
  fullChunk(ci) {
    const w = this.world, sx = w.sx, sxz = w.sxz;
    const [cx, cy, cz] = chunkCoords(w, ci);
    const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
    const out = new Uint8Array(2 + CV * 2);
    out[0] = ci & 255; out[1] = ci >> 8;
    let o = 2;
    for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) {
      const gi = x0 + sx * (z0 + lz) + sxz * (y0 + ly);
      out.set(w.mat.subarray(gi, gi + CS), o); o += CS;
    }
    for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) {
      const gi = x0 + sx * (z0 + lz) + sxz * (y0 + ly);
      out.set(w.dmg.subarray(gi, gi + CS), o); o += CS;
    }
    return out;
  }
}

// farki dunyaya yaz (konuk). onChunk(ci, minX,minY,minZ,maxX,maxY,maxZ) verilirse degisen sinir kutusunu bildirir;
// donus: degisen voksel sayisi. markRegionDirty + _notify cagrilir (mesher, lav duvari, kar haritasi, gezinme agi).
export function applyDiff(world, buf, shadow = null) {
  const sx = world.sx, sxz = world.sxz, wm = world.mat, wd = world.dmg;
  const nChunks = buf[0] | (buf[1] << 8);
  let o = 2, total = 0;
  for (let c = 0; c < nChunks; c++) {
    const ci = buf[o] | (buf[o + 1] << 8), n = buf[o + 2] | (buf[o + 3] << 8); o += 4;
    const [cx, cy, cz] = chunkCoords(world, ci);
    const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
    const idxO = o, matO = o + n * 2, dmgO = matO + n;
    o = dmgO + n;
    let li = 0, minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1, maxY = -1, maxZ = -1;
    for (let k = 0; k < n; k++) {
      li += buf[idxO + k * 2] | (buf[idxO + k * 2 + 1] << 8);
      const lx = li & 31, lz = (li >> 5) & 31, ly = li >> 10;
      const x = x0 + lx, y = y0 + ly, z = z0 + lz;
      const gi = x + sx * z + sxz * y;
      wm[gi] = buf[matO + k]; wd[gi] = buf[dmgO + k];
      if (shadow) { shadow.mat[gi] = wm[gi]; shadow.dmg[gi] = wd[gi]; }
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    total += n;
    if (maxX >= 0) {
      world.markRegionDirty(minX - 1, minY - 1, minZ - 1, maxX + 1, maxY + 1, maxZ + 1);
      world._notify(minX, minY, minZ, maxX, maxY, maxZ);
    }
  }
  return total;
}

// tam chunk yaz (fullChunk ciktisi)
export function applyFullChunk(world, buf) {
  const sx = world.sx, sxz = world.sxz;
  const ci = buf[0] | (buf[1] << 8);
  const [cx, cy, cz] = chunkCoords(world, ci);
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
  let o = 2;
  for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) { world.mat.set(buf.subarray(o, o + CS), x0 + sx * (z0 + lz) + sxz * (y0 + ly)); o += CS; }
  for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) { world.dmg.set(buf.subarray(o, o + CS), x0 + sx * (z0 + lz) + sxz * (y0 + ly)); o += CS; }
  world.markRegionDirty(x0 - 1, y0 - 1, z0 - 1, x0 + CS, y0 + CS, z0 + CS);
  world._notify(x0, y0, z0, x0 + CS - 1, y0 + CS - 1, z0 + CS - 1);
}

// FNV-1a: chunk basina ozet (dogrulama / kendini onarma)
export function chunkHash(world, ci, mat = world.mat, dmg = world.dmg) {
  const sx = world.sx, sxz = world.sxz;
  const [cx, cy, cz] = chunkCoords(world, ci);
  const x0 = cx * CS, y0 = cy * CS, z0 = cz * CS;
  let h = 0x811c9dc5;
  const wm = mat, wd = dmg;
  for (let ly = 0; ly < CS; ly++) for (let lz = 0; lz < CS; lz++) {
    const gi = x0 + sx * (z0 + lz) + sxz * (y0 + ly);
    for (let lx = 0; lx < CS; lx++) { h = Math.imul(h ^ wm[gi + lx], 16777619); h = Math.imul(h ^ wd[gi + lx], 16777619); }
  }
  return h >>> 0;
}
export function worldHashes(world) {
  const n = world.ncx * world.ncy * world.ncz;
  const out = new Uint32Array(n);
  for (let ci = 0; ci < n; ci++) out[ci] = chunkHash(world, ci);
  return out;
}
// tum dunyanin tek ozeti (testlerde ev sahibi / konuk karsilastirmasi)
export function worldDigest(world) {
  let h = 0x811c9dc5;
  const hs = worldHashes(world);
  for (let i = 0; i < hs.length; i++) h = Math.imul(h ^ hs[i], 16777619);
  return h >>> 0;
}

// ---- sikistirma (tarayici ve Node 18+ CompressionStream) ----
async function pipeAll(stream, data) {
  const w = stream.writable.getWriter();
  w.write(data); w.close();
  const chunks = []; let len = 0;
  const r = stream.readable.getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(value); len += value.length; }
  const out = new Uint8Array(len); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
export const deflate = (u8) => pipeAll(new CompressionStream('deflate-raw'), u8);
export const inflate = (u8) => pipeAll(new DecompressionStream('deflate-raw'), u8);

// buyuk yuku <= MAX_PART'lik parcalara bol / birlestir
export function splitParts(u8, max = MAX_PART - 16) {
  const parts = [];
  for (let o = 0; o < u8.length; o += max) parts.push(u8.subarray(o, Math.min(u8.length, o + max)));
  return parts.length ? parts : [new Uint8Array(0)];
}
export function joinParts(parts) {
  let len = 0; for (const p of parts) len += p.length;
  const out = new Uint8Array(len); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
