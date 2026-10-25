// Bot navigasyonu: 1 m hucreli cok katli izgara, dunya degistikce yerel guncellenir; A* yol bulma.
import { VS } from '../config.js';

const CELL = 4;          // voxel
const L = 6;             // hucre basina azami kat
const CLEAR = 8;         // gereken bos yukseklik (voxel)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const EDGE_WALK = 1, EDGE_JUMP = 2, EDGE_DROP = 3, EDGE_PAD = 4;

class Heap {
  constructor(n) { this.a = new Int32Array(n); this.k = new Float32Array(n); this.n = 0; }
  push(v, key) {
    let i = this.n++;
    const a = this.a, k = this.k;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; a[i] = a[p]; k[i] = k[p]; i = p; }
    a[i] = v; k[i] = key;
  }
  pop() {
    const a = this.a, k = this.k;
    const top = a[0];
    const v = a[--this.n], key = k[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= this.n) break;
      if (c + 1 < this.n && k[c + 1] < k[c]) c++;
      if (k[c] >= key) break;
      a[i] = a[c]; k[i] = k[c]; i = c;
    }
    a[i] = v; k[i] = key;
    return top;
  }
}

export class NavGrid {
  constructor(world) {
    this.world = world;
    this.gx = Math.floor(world.sx / CELL);
    this.gz = Math.floor(world.sz / CELL);
    const nc = this.gx * this.gz;
    this.ncell = nc;
    this.cnt = new Uint8Array(nc);
    this.ny = new Int16Array(nc * L);        // dugum yuksekligi (voxel, ayak seviyesi)
    this.edge = new Int8Array(nc * L * 8);   // hedef kat indeksi ya da -1
    this.etype = new Uint8Array(nc * L * 8);
    this.wet = new Uint8Array(nc * L);       // dugum sigda (su ayak bileginden yukarida)
    this.pads = new Map();                   // node -> [{to, cost}]
    this.dirtyCells = new Set();
    // A* tamponlari
    this.g = new Float32Array(nc * L);
    this.parent = new Int32Array(nc * L);
    this.stamp = new Uint32Array(nc * L);
    this.closed = new Uint32Array(nc * L);
    this.stampId = 1;
    this.heap = new Heap(nc * L * 2);
    world.onChange((x0, y0, z0, x1, y1, z1) => {
      const c0x = Math.max(0, Math.floor(x0 / CELL) - 1), c1x = Math.min(this.gx - 1, Math.floor(x1 / CELL) + 1);
      const c0z = Math.max(0, Math.floor(z0 / CELL) - 1), c1z = Math.min(this.gz - 1, Math.floor(z1 / CELL) + 1);
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.dirtyCells.add(cx + cz * this.gx);
    });
  }

  buildAll() {
    for (let c = 0; c < this.ncell; c++) this._buildCell(c);
    for (let c = 0; c < this.ncell; c++) this._buildEdges(c);
    this.dirtyCells.clear();
  }

  // dunya degisikliklerini isle (kare basina sinirli)
  update(maxCells = 400) {
    if (this.dirtyCells.size === 0) return;
    const cells = [];
    for (const c of this.dirtyCells) { cells.push(c); if (cells.length >= maxCells) break; }
    for (const c of cells) this.dirtyCells.delete(c);
    for (const c of cells) this._buildCell(c);
    const edgeCells = new Set();
    for (const c of cells) {
      const cx = c % this.gx, cz = (c / this.gx) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x >= 0 && z >= 0 && x < this.gx && z < this.gz) edgeCells.add(x + z * this.gx);
      }
    }
    for (const c of edgeCells) this._buildEdges(c);
  }

  _free(x, y, z) { return !this.world.solid(x, y, z); }

  _buildCell(c) {
    const w = this.world;
    const cx = c % this.gx, cz = (c / this.gx) | 0;
    const vx = cx * CELL + 2, vz = cz * CELL + 2;
    let n = 0;
    const base = c * L;
    // derin su (ayak 1 m'den derinde: yuzulur) gezinme agina girmez
    const wv = w.waterY > -1e9 ? Math.round(w.waterY / VS) : -1e9;
    for (let y = 1; y < w.sy - CLEAR && n < L; y++) {
      if (!w.solid(vx, y - 1, vz) || w.solid(vx, y, vz)) continue;
      if (wv - y > 4) continue;
      // dikey ve yatay acik alan (3x3 voxel)
      let ok = true;
      for (let k = 0; k < CLEAR && ok; k++) {
        for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) {
          if (w.solid(vx + dx, y + k, vz + dz)) ok = false;
        }
      }
      if (!ok) continue;
      this.ny[base + n] = y;
      this.wet[base + n] = wv - y > 0 ? 1 : 0;
      n++;
      y += CLEAR - 1;
    }
    this.cnt[c] = n;
  }

  // iki nokta arasinda govde gecebilir mi (yatay hat, yy: taban voxel)
  _passable(ax, az, bx, bz, yy) {
    const w = this.world;
    for (let s = 1; s <= 3; s++) {
      const t = s / 4;
      const x = Math.floor(ax + (bx - ax) * t), z = Math.floor(az + (bz - az) * t);
      for (let k = 0; k < CLEAR - 1; k++) if (w.solid(x, yy + k, z)) return false;
    }
    return true;
  }

  _buildEdges(c) {
    const cx = c % this.gx, cz = (c / this.gx) | 0;
    const base = c * L;
    const n = this.cnt[c];
    for (let k = 0; k < L; k++) for (let d = 0; d < 8; d++) this.edge[(base + k) * 8 + d] = -1;
    for (let k = 0; k < n; k++) {
      const y = this.ny[base + k];
      const ax = cx * CELL + 2, az = cz * CELL + 2;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DIRS[d][0], nz = cz + DIRS[d][1];
        if (nx < 0 || nz < 0 || nx >= this.gx || nz >= this.gz) continue;
        const c2 = nx + nz * this.gx;
        const n2 = this.cnt[c2];
        if (!n2) continue;
        const bx = nx * CELL + 2, bz = nz * CELL + 2;
        let best = -1, bestCost = 1e9, bestType = 0;
        for (let k2 = 0; k2 < n2; k2++) {
          const y2 = this.ny[c2 * L + k2];
          const dy = y2 - y;
          let type = 0;
          if (dy >= -1 && dy <= 3) type = EDGE_WALK;
          else if (dy > 3 && dy <= 5) type = EDGE_JUMP;
          else if (dy < -1 && dy >= -48) type = EDGE_DROP;
          else continue;
          const hy = Math.max(y, y2);
          if (type === EDGE_DROP) { if (!this._passable(ax, az, bx, bz, y)) continue; }
          else if (!this._passable(ax, az, bx, bz, hy)) continue;
          const cost = Math.abs(dy);
          if (cost < bestCost) { bestCost = cost; best = k2; bestType = type; }
        }
        if (best >= 0) {
          // capraz: kose kesmeyi engelle
          if (d >= 4) {
            const ca = (cx + DIRS[d][0]) + cz * this.gx, cb = cx + (cz + DIRS[d][1]) * this.gx;
            if (!this._hasLevelNear(ca, y) || !this._hasLevelNear(cb, y)) continue;
          }
          this.edge[(base + k) * 8 + d] = best;
          this.etype[(base + k) * 8 + d] = bestType;
        }
      }
    }
  }

  _hasLevelNear(c, y) {
    const n = this.cnt[c];
    for (let k = 0; k < n; k++) if (Math.abs(this.ny[c * L + k] - y) <= 3) return true;
    return false;
  }

  addPad(fromX, fromY, fromZ, toX, toY, toZ) {
    const a = this.nearest(fromX, fromY + 0.3, fromZ), b = this.nearest(toX, toY + 0.3, toZ);
    if (a < 0 || b < 0) return;
    if (!this.pads.has(a)) this.pads.set(a, []);
    this.pads.get(a).push({ to: b, cost: 6 });
  }

  // dunya noktasina en yakin dugum
  nearest(x, y, z, radius = 3) {
    const cx0 = Math.floor(x / (CELL * VS)), cz0 = Math.floor(z / (CELL * VS));
    const fy = y / VS;
    let best = -1, bestD = 1e9;
    for (let r = 0; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = cx0 + dx, cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= this.gx || cz >= this.gz) continue;
        const c = cx + cz * this.gx;
        for (let k = 0; k < this.cnt[c]; k++) {
          const ny = this.ny[c * L + k];
          let dyc = ny - fy;
          if (dyc > 3) dyc *= 4; // ustteki katlari cezalandir
          const d = Math.abs(dyc) * 0.6 + r * 3 + Math.hypot(dx, dz);
          if (d < bestD) { bestD = d; best = c * L + k; }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }

  // sudan cikilabilecek en yakin dugum: yuksekligi [yMin, yMax] (m) icinde, yatayda en yakin
  // (ustteki kopru/guverte dugumleri haric). Bulunamazsa -1.
  nearestShore(x, z, yMin, yMax, radius = 14) {
    const cx0 = Math.floor(x / (CELL * VS)), cz0 = Math.floor(z / (CELL * VS));
    const v0 = yMin / VS, v1 = yMax / VS;
    let best = -1, bestD = 1e9;
    for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz;
      if (cx < 0 || cz < 0 || cx >= this.gx || cz >= this.gz) continue;
      const c = cx + cz * this.gx;
      for (let k = 0; k < this.cnt[c]; k++) {
        const ny = this.ny[c * L + k];
        if (ny < v0 || ny > v1) continue;
        const d = Math.hypot((cx * CELL + 2) * VS - x, (cz * CELL + 2) * VS - z);
        if (d < 0.6 || d >= bestD) continue;
        bestD = d; best = c * L + k;
      }
    }
    return best;
  }

  nodePos(id, out) {
    const c = (id / L) | 0;
    const cx = c % this.gx, cz = (c / this.gx) | 0;
    out.x = (cx * CELL + 2) * VS; out.y = this.ny[id] * VS; out.z = (cz * CELL + 2) * VS;
    return out;
  }

  valid(id) { const c = (id / L) | 0; return (id % L) < this.cnt[c]; }

  randomNode(rng = Math.random) {
    for (let t = 0; t < 200; t++) {
      const c = (rng() * this.ncell) | 0;
      if (this.cnt[c]) return c * L + ((rng() * this.cnt[c]) | 0);
    }
    return -1;
  }

  // A*: donus [{x,y,z,type}] ya da null
  findPath(start, goal, maxExpand = 5000) {
    if (start < 0 || goal < 0) return null;
    if (!this.valid(start) || !this.valid(goal)) return null;
    const sid = ++this.stampId;
    const g = this.g, parent = this.parent, stamp = this.stamp, closed = this.closed;
    const heap = this.heap; heap.n = 0;
    const tp = { x: 0, y: 0, z: 0 }, gp = { x: 0, y: 0, z: 0 };
    this.nodePos(goal, gp);
    const h = (id) => { this.nodePos(id, tp); return Math.hypot(tp.x - gp.x, (tp.y - gp.y) * 0.5, tp.z - gp.z); };
    stamp[start] = sid; g[start] = 0; parent[start] = -1;
    heap.push(start, h(start));
    let expanded = 0, found = false;
    let bestNode = start, bestH = 1e9;
    while (heap.n > 0 && expanded < maxExpand) {
      const cur = heap.pop();
      if (closed[cur] === sid) continue;
      closed[cur] = sid;
      expanded++;
      if (cur === goal) { found = true; break; }
      const hc = h(cur);
      if (hc < bestH) { bestH = hc; bestNode = cur; }
      const c = (cur / L) | 0;
      const cx = c % this.gx, cz = (c / this.gx) | 0;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const k2 = this.edge[cur * 8 + d];
        if (k2 < 0) continue;
        const c2 = (cx + DIRS[d][0]) + (cz + DIRS[d][1]) * this.gx;
        const nid = c2 * L + k2;
        if (closed[nid] === sid) continue;
        const t = this.etype[cur * 8 + d];
        const cost = (d < 4 ? 1 : 1.414) + (t === EDGE_JUMP ? 1.5 : 0) + (t === EDGE_DROP ? 0.4 : 0) + (this.wet[nid] ? 1.2 : 0);
        const ng = gc + cost;
        if (stamp[nid] !== sid || ng < g[nid]) {
          stamp[nid] = sid; g[nid] = ng; parent[nid] = cur;
          heap.push(nid, ng + h(nid));
        }
      }
      const pl = this.pads.get(cur);
      if (pl) for (const e of pl) {
        if (closed[e.to] === sid) continue;
        const ng = gc + e.cost;
        if (stamp[e.to] !== sid || ng < g[e.to]) { stamp[e.to] = sid; g[e.to] = ng; parent[e.to] = cur; heap.push(e.to, ng + h(e.to)); }
      }
    }
    const end = found ? goal : bestNode;
    if (end === start) return found ? [] : null;
    const ids = [];
    for (let n = end; n >= 0 && ids.length < 4000; n = parent[n]) ids.push(n);
    ids.reverse();
    const path = [];
    for (let i = 1; i < ids.length; i++) {
      const p = this.nodePos(ids[i], { x: 0, y: 0, z: 0, type: EDGE_WALK, id: ids[i] });
      // kenar turu
      const prev = ids[i - 1];
      const pads = this.pads.get(prev);
      if (pads && pads.some((e) => e.to === ids[i])) p.type = EDGE_PAD;
      else {
        const pc = (prev / L) | 0, nc = (ids[i] / L) | 0;
        const dx = (nc % this.gx) - (pc % this.gx), dz = ((nc / this.gx) | 0) - ((pc / this.gx) | 0);
        for (let d = 0; d < 8; d++) if (DIRS[d][0] === dx && DIRS[d][1] === dz) { p.type = this.etype[prev * 8 + d] || EDGE_WALK; break; }
      }
      path.push(p);
    }
    path.partial = !found;
    return path;
  }
}
