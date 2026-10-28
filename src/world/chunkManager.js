// Chunk mesh yonetimi + mesh worker havuzu.
import * as THREE from 'three';
import { VS, CS } from '../config.js';
import { paletteForWorker } from './materials.js';
import { meshVoxels, setPalette } from './mesher.js';

/* global __WORKER_CODE__ */

export function buildGeometry(r) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(r.nrm, 4, true));
  g.setAttribute('color', new THREE.BufferAttribute(r.col, 4, true));
  g.setAttribute('aMat', new THREE.BufferAttribute(r.mat, 4, true));
  g.setIndex(new THREE.BufferAttribute(r.idx, 1));
  return g;
}

// Chunk geometrisi: payli kapasiteyle ayrilir, sonraki yeniden meshlemelerde ayni GPU tamponlari
// yerinde guncellenir (her yikimda tampon olusturup silmek surucude ara sira uzun takilmalara yol aciyordu).
const HEAD = 1.5;
function allocChunkGeometry(r) {
  const vcap = Math.ceil(r.vcount * HEAD) + 64;
  const icap = Math.ceil(r.idx.length * HEAD) + 96;
  const mk = (src, n) => { const a = new src.constructor(n); a.set(src); return a; };
  const g = new THREE.BufferGeometry();
  const attr = (arr, size, norm) => { const a = new THREE.BufferAttribute(arr, size, norm); a.setUsage(THREE.DynamicDrawUsage); return a; };
  g.setAttribute('position', attr(mk(r.pos, vcap * 3), 3, false));
  g.setAttribute('normal', attr(mk(r.nrm, vcap * 4), 4, true));
  g.setAttribute('color', attr(mk(r.col, vcap * 4), 4, true));
  g.setAttribute('aMat', attr(mk(r.mat, vcap * 4), 4, true));
  const idx = vcap > 65535 ? new Uint32Array(icap) : new Uint16Array(icap);
  idx.set(r.idx);
  g.setIndex(attr(idx, 1, false));
  g.setDrawRange(0, r.idx.length);
  g.userData.vcap = vcap; g.userData.icap = icap;
  return g;
}
function fitsChunkGeometry(g, r) {
  const u = g.userData;
  if (!u.vcap || r.vcount > u.vcap || r.idx.length > u.icap) return false;
  // kapasite cok buyuk kaldiysa (parca cok kuculduyse) yeniden ayir, bellek bosa gitmesin
  if (u.vcap > 4096 && r.vcount * 4 < u.vcap) return false;
  return true;
}
function updateChunkGeometry(g, r) {
  const put = (a, src) => { a.array.set(src); a.clearUpdateRanges(); a.addUpdateRange(0, src.length); a.needsUpdate = true; };
  put(g.attributes.position, r.pos);
  put(g.attributes.normal, r.nrm);
  put(g.attributes.color, r.col);
  put(g.attributes.aMat, r.mat);
  put(g.index, r.idx);
  g.setDrawRange(0, r.idx.length);
}

export class MeshWorkers {
  constructor(count) {
    this.workers = [];
    this.idle = [];
    this.jobs = new Map();
    this.jobId = 1;
    this.queue = [];
    const palette = paletteForWorker();
    setPalette(palette);
    let url = null;
    try {
      url = URL.createObjectURL(new Blob([__WORKER_CODE__], { type: 'text/javascript' }));
    } catch (e) { url = null; }
    for (let i = 0; i < count && url; i++) {
      try {
        const w = new Worker(url);
        w.onmessage = (e) => this._onMessage(w, e.data);
        w.onerror = (e) => console.error('mesh worker hatasi', e.message || e);
        w.postMessage({ type: 'palette', palette });
        this.workers.push(w);
        this.idle.push(w);
      } catch (e) {
        console.warn('Worker olusturulamadi, ana is parcacigi kullanilacak', e);
        break;
      }
    }
  }
  get busy() { return this.workers.length - this.idle.length; }

  // job: {nx,ny,nz,ox,oy,oz,mats,dmgs}, cb(result)
  submit(job, cb, priority = false) {
    const id = this.jobId++;
    this.jobs.set(id, cb);
    const msg = { type: 'mesh', job: id, vs: VS, ...job };
    if (this.workers.length === 0) {
      const r = meshVoxels(job.mats, job.dmgs, job.nx, job.ny, job.nz, job.ox, job.oy, job.oz, VS, !!job.split);
      this.jobs.delete(id);
      cb(r);
      return;
    }
    if (priority) this.queue.unshift(msg); else this.queue.push(msg);
    this._pump();
  }
  _pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop();
      const msg = this.queue.shift();
      w.postMessage(msg, [msg.mats.buffer, msg.dmgs.buffer]);
    }
  }
  _onMessage(w, d) {
    this.idle.push(w);
    const cb = this.jobs.get(d.job);
    this.jobs.delete(d.job);
    if (cb) cb(d);
    this._pump();
  }
}

export class ChunkManager {
  constructor(world, scene, material, workers) {
    this.world = world;
    this.scene = scene;
    this.material = material;
    this.workers = workers;
    const n = world.ncx * world.ncy * world.ncz;
    this.n = n;
    this.meshes = new Array(n).fill(null);
    // saydam (cam) yuzler: ayri mesh, ayri malzeme (game.js glassMaterial); golge atmaz
    this.gmeshes = new Array(n).fill(null);
    this.glassMaterial = null;
    this.want = new Uint32Array(n);     // istenen surum
    this.sent = new Uint32Array(n);     // gonderilen surum
    this.inflight = new Uint8Array(n);
    this.pending = [];                  // gonderilmeyi bekleyen chunk'lar
    this.inPending = new Uint8Array(n);
    this.inPool = [];                   // yeniden kullanilan giris tamponlari
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
    this.triangles = 0;
    this.camPos = new THREE.Vector3();
    this.maxInflight = Math.max(2, workers.workers.length * 2);
    this.onChunkMeshed = null;
    // oyun sirasinda kare basina en fazla bu kadar yeni GPU tamponu ayrilir; fazlasi sonraki karelere kalir
    // (cok buyuk patlamada onlarca chunk ayni karede yeniden ayrilinca surucude uzun takilma oluyordu)
    this.allocPerFrame = Infinity;
    this._allocs = 0;
    this.deferred = new Map();
  }

  chunkCoords(ci) {
    const ncx = this.world.ncx, ncz = this.world.ncz;
    const cy = Math.floor(ci / (ncx * ncz));
    const rem = ci - cy * ncx * ncz;
    const cz = Math.floor(rem / ncx);
    const cx = rem - cz * ncx;
    return [cx, cy, cz];
  }

  update(camPos) {
    if (camPos) this.camPos.copy(camPos);
    this._allocs = 0;
    if (this.deferred.size) {
      for (const [ci, d] of this.deferred) {
        if (this._allocs >= this.allocPerFrame) break;
        this.deferred.delete(ci);
        this._apply(ci, d.r, d.cx, d.cy, d.cz);
      }
    }
    const dirty = this.world.takeDirty();
    for (const ci of dirty) {
      this.want[ci]++;
      if (!this.inPending[ci]) { this.inPending[ci] = 1; this.pending.push(ci); }
    }
    if (this.pending.length === 0) return;
    if (this.pending.length > 8) {
      // kameraya yakin olanlar once
      const cp = this.camPos;
      const half = CS * VS * 0.5;
      this.pending.sort((a, b) => {
        const [ax, ay, az] = this.chunkCoords(a);
        const [bx, by, bz] = this.chunkCoords(b);
        const da = (ax * CS * VS + half - cp.x) ** 2 + (ay * CS * VS + half - cp.y) ** 2 + (az * CS * VS + half - cp.z) ** 2;
        const db = (bx * CS * VS + half - cp.x) ** 2 + (by * CS * VS + half - cp.y) ** 2 + (bz * CS * VS + half - cp.z) ** 2;
        return da - db;
      });
    }
    let inflightCount = this.workers.busy + this.workers.queue.length;
    const keep = [];
    for (let k = 0; k < this.pending.length; k++) {
      const ci = this.pending[k];
      if (this.inflight[ci] || inflightCount >= this.maxInflight) { keep.push(ci); continue; }
      this.inPending[ci] = 0;
      this._dispatch(ci);
      inflightCount++;
    }
    this.pending = keep;
    for (const ci of keep) this.inPending[ci] = 1;
  }

  _dispatch(ci) {
    const [cx, cy, cz] = this.chunkCoords(ci);
    const size = (CS + 2) ** 3;
    // worker'in geri yolladigi giris tamponlarini yeniden kullan (cop toplayici yuku azalsin)
    const pooled = this.inPool.pop();
    const mats = pooled ? pooled[0] : new Uint8Array(size), dmgs = pooled ? pooled[1] : new Uint8Array(size);
    this.world.extractPadded(cx * CS, cy * CS, cz * CS, CS, CS, CS, mats, dmgs);
    const version = this.want[ci];
    this.sent[ci] = version;
    this.inflight[ci] = 1;
    this.workers.submit({ nx: CS, ny: CS, nz: CS, ox: cx * CS, oy: cy * CS, oz: cz * CS, mats, dmgs, split: !!this.glassMaterial }, (r) => {
      if (r.mats && r.mats.length === size && r.dmgs && this.inPool.length < 32) this.inPool.push([r.mats, r.dmgs]);
      this.inflight[ci] = 0;
      this._apply(ci, r, cx, cy, cz);
      if (this.want[ci] > version && !this.inPending[ci]) { this.inPending[ci] = 1; this.pending.push(ci); }
    });
  }

  _apply(ci, r, cx, cy, cz) {
    const old = this.meshes[ci];
    // ayni tamponlara sigiyorsa yerinde guncelle
    if (old && r.vcount > 0 && fitsChunkGeometry(old.geometry, r)) {
      this.deferred.delete(ci);
      updateChunkGeometry(old.geometry, r);
      const tris = r.idx.length / 3;
      this.triangles += tris - old.userData.tris;
      old.userData.tris = tris;
      this._glass(ci, r.glass, cx, cy, cz);
      if (this.onChunkMeshed) this.onChunkMeshed(ci);
      return;
    }
    if (r.vcount > 0 && this._allocs >= this.allocPerFrame) {
      this.deferred.delete(ci);
      this.deferred.set(ci, { r, cx, cy, cz });
      return;
    }
    this.deferred.delete(ci);
    if (r.vcount > 0) this._allocs++;
    if (old) {
      this.triangles -= old.userData.tris;
      old.geometry.dispose();
      this.group.remove(old);
      this.meshes[ci] = null;
    }
    if (r.vcount > 0) {
      const g = allocChunkGeometry(r);
      const s = CS * VS;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(cx * s, cy * s, cz * s), new THREE.Vector3((cx + 1) * s, (cy + 1) * s, (cz + 1) * s));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * s, (cy + 0.5) * s, (cz + 0.5) * s), s * 0.8661);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.tris = r.idx.length / 3;
      this.triangles += mesh.userData.tris;
      this.group.add(mesh);
      this.meshes[ci] = mesh;
    }
    this._glass(ci, r.glass, cx, cy, cz);
    if (this.onChunkMeshed) this.onChunkMeshed(ci);
  }

  // chunk'in cam yuzleri (saydam mesh): yoksa eskisi kaldirilir, sigiyorsa yerinde guncellenir
  _glass(ci, g, cx, cy, cz) {
    const old = this.gmeshes[ci];
    if (!g || !g.vcount || !this.glassMaterial) {
      if (old) { this.triangles -= old.userData.tris; old.geometry.dispose(); this.group.remove(old); this.gmeshes[ci] = null; }
      return;
    }
    const tris = g.idx.length / 3;
    if (old && fitsChunkGeometry(old.geometry, g)) {
      updateChunkGeometry(old.geometry, g);
      this.triangles += tris - old.userData.tris;
      old.userData.tris = tris;
      return;
    }
    if (old) { this.triangles -= old.userData.tris; old.geometry.dispose(); this.group.remove(old); }
    const geo = allocChunkGeometry(g);
    const s = CS * VS;
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(cx * s, cy * s, cz * s), new THREE.Vector3((cx + 1) * s, (cy + 1) * s, (cz + 1) * s));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * s, (cy + 0.5) * s, (cz + 0.5) * s), s * 0.8661);
    const mesh = new THREE.Mesh(geo, this.glassMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = 5;
    mesh.userData.tris = tris;
    this.triangles += tris;
    this.group.add(mesh);
    this.gmeshes[ci] = mesh;
  }

  get busy() { return this.pending.length > 0 || this.deferred.size > 0 || this.inflight.some((v) => v); }

  pendingCount() {
    let c = this.pending.length + this.deferred.size;
    for (let i = 0; i < this.n; i++) if (this.inflight[i]) c++;
    return c;
  }

  dispose() {
    for (const m of this.meshes) if (m) { m.geometry.dispose(); this.group.remove(m); }
    for (const m of this.gmeshes) if (m) { m.geometry.dispose(); this.group.remove(m); }
    this.meshes.fill(null);
    this.gmeshes.fill(null);
    this.scene.remove(this.group);
  }
}
