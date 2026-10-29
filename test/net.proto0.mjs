// Asama 0 olcumu (Node, tarayicisiz): voksel akisi. KIYAMET roketi (12.5 m yaricap, guc 860) ve normal roket icin
// kac voksel degisiyor, ham / sikistirilmis boyut, kodlama ve uygulama suresi. usage: node test/net.proto0.mjs [harita...]
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { LEVELS } from '../src/world/levels.js';
import { VoxelShadow, applyDiff, deflate, inflate, splitParts, worldDigest } from '../src/net/voxelSync.js';

const maps = process.argv.slice(2).length ? process.argv.slice(2) : ['arena', 'meadow'];
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

for (const map of maps) {
  const host = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const info = LEVELS[map].generate(host, 4242);
  const guest = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  LEVELS[map].generate(guest, 4242);
  const same0 = worldDigest(host) === worldDigest(guest);
  host.enableNetDirty(); host.takeNetDirty();
  const shadow = new VoxelShadow(host);
  console.log(`\n=== ${map}: uretim ayni (host=guest): ${same0}`);

  const c = { x: WORLD.X * VS / 2, z: WORLD.Z * VS / 2 };
  // en yuksek kati voksel: merkez kolonu
  let top = 0; for (let y = WORLD.Y - 1; y >= 0; y--) if (host.get((WORLD.X / 2) | 0, y, (WORLD.Z / 2) | 0)) { top = y; break; }
  const cy = Math.max(1.5, top * VS - 0.5);

  const cases = [
    ['normal roket (r2.5, g430)', 2.5, 430, 1],
    ['KIYAMET roketi (r12.5, g860)', 12.5, 860, 1],
    ['3 KIYAMET roketi art arda', 12.5, 860, 3],
  ];
  for (const [label, r, p, count] of cases) {
    let removed = 0;
    for (let k = 0; k < count; k++) {
      const ox = (k - (count - 1) / 2) * 7;
      removed += host.damageSphere(c.x + ox, cy, c.z + k * 3, r, p);
      // yapisal butunluk: kopan adaciklar dunyadan silinir (enkaz govdesi ayri akar; burada yalniz vokseller)
      const isl = host.findIslands();
      for (const i of isl) host.removeIndices(i);
    }
    const t0 = performance.now();
    const dirty = host.takeNetDirty();
    const raw = shadow.diff(dirty);
    const tEnc = performance.now() - t0;
    if (!raw) { console.log(`${label}: degisiklik yok`); continue; }
    const t1 = performance.now();
    const z = await deflate(raw);
    const tZ = performance.now() - t1;
    const parts = splitParts(z);
    // konuk tarafi
    const t2 = performance.now();
    const back = await inflate(z);
    const n = applyDiff(guest, back);
    const tApply = performance.now() - t2;
    const nDirty = guest.dirtyList.length;
    console.log(`${label}: kaldirilan ${removed}, degisen voksel ${n}, kirli chunk ${dirty.length} (konukta mesh ${nDirty})`);
    console.log(`   ham ${kb(raw.length)} -> deflate ${kb(z.length)} (${parts.length} parca)  kodlama ${tEnc.toFixed(1)} ms + deflate ${tZ.toFixed(1)} ms  konuk uygulama ${tApply.toFixed(1)} ms  esit: ${worldDigest(host) === worldDigest(guest)}`);
  }
}
