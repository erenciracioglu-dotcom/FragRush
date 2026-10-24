import { WORLD, VS, CS, FLOOR_Y } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateArena } from '../src/world/mapgen.js';
import { meshVoxels, setPalette } from '../src/world/mesher.js';
import { paletteForWorker, M } from '../src/world/materials.js';

const t0 = performance.now();
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateArena(w, 12345);
const t1 = performance.now();
let solid = 0; for (let i = 0; i < w.n; i++) if (w.mat[i]) solid++;
console.log(`arena: ${(t1 - t0).toFixed(0)} ms, solid voxels ${solid}, spawns ${info.spawns.length}, items ${info.items.length}, pads ${info.pads.length}, lights ${info.lights.length}`);

setPalette(paletteForWorker());
const size = (CS + 2) ** 3;
const mats = new Uint8Array(size), dmgs = new Uint8Array(size);
let tris = 0, maxTris = 0, verts = 0;
const t2 = performance.now();
let worst = 0;
for (let cy = 0; cy < w.ncy; cy++) for (let cz = 0; cz < w.ncz; cz++) for (let cx = 0; cx < w.ncx; cx++) {
  const a = performance.now();
  w.extractPadded(cx * CS, cy * CS, cz * CS, CS, CS, CS, mats, dmgs);
  const r = meshVoxels(mats, dmgs, CS, CS, CS, cx * CS, cy * CS, cz * CS, VS);
  const dt = performance.now() - a; if (dt > worst) worst = dt;
  tris += r.idx.length / 3; verts += r.vcount; maxTris = Math.max(maxTris, r.idx.length / 3);
}
const t3 = performance.now();
console.log(`mesh: ${(t3 - t2).toFixed(0)} ms total, worst chunk ${worst.toFixed(1)} ms, tris ${tris}, verts ${verts}, max chunk tris ${maxTris}`);

// raycast test: from above center downward
const hit = {};
const ok = w.raycast(10, 20, 10, 0, -1, 0, 50, hit);
console.log('raycast down:', ok, hit.y, hit.ny, hit.mat, 'dist', hit.dist.toFixed(2));

// explosion test + integrity
const ta = performance.now();
const removed = w.damageSphere(36, FLOOR_Y * VS + 1, 36 + 5.2, 2.5, 400);
const tb = performance.now();
const islands = w.findIslands();
const tc = performance.now();
console.log(`explosion removed ${removed} in ${(tb - ta).toFixed(2)} ms, islands ${islands.length} in ${(tc - tb).toFixed(2)} ms`);

// pillar cut test: build a free pillar and cut its base
const px = 40, pz = 40;
for (let y = FLOOR_Y; y < FLOOR_Y + 30; y++) for (let z = pz; z < pz + 4; z++) for (let x = px; x < px + 4; x++) w.mat[w.idx(x, y, z)] = M.CONCRETE;
const r2 = w.damageSphere((px + 2) * VS, (FLOOR_Y + 3) * VS, (pz + 2) * VS, 1.0, 600);
const td = performance.now();
const isl2 = w.findIslands();
const te = performance.now();
console.log(`pillar cut removed ${r2}, islands ${isl2.length} sizes ${isl2.map(a => a.length).join(',')} in ${(te - td).toFixed(2)} ms`);
if (isl2.length) { const e = w.extractIsland(isl2[0]); console.log('island box', e.nx, e.ny, e.nz, 'com', e.com.map(v => v.toFixed(2)).join(',')); }

// big tower top cut test: blast ring around tower at mid height and see islands
const tf = performance.now();
let total = 0;
for (let a = 0; a < 16; a++) {
  const ang = a / 16 * Math.PI * 2;
  total += w.damageSphere(36 + Math.cos(ang) * 5, (FLOOR_Y + 30) * VS, 36 + Math.sin(ang) * 5, 2.2, 600);
  const isl = w.findIslands();
  if (isl.length) console.log(' blast', a, 'islands', isl.map(x => x.length).join(','));
}
console.log(`ring blasts removed ${total} in ${(performance.now() - tf).toFixed(1)} ms`);
