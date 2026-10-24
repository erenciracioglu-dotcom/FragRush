// Ziplama pedi yorungesi: her ped icin oyuncu catida mi?
import { WORLD, VS } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { generateArena } from '../src/world/mapgen.js';
import { Mover, padLaunchVelocity } from '../src/game/mover.js';
const apex = process.argv[2] ? Number(process.argv[2]) : null;
const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
const info = generateArena(w, 31337);
const dt = 1 / 250;
for (const pd of info.pads) {
  if (apex != null) pd.apex = apex;
  const m = new Mover(w);
  m.reset(pd.x, pd.y + 0.02, pd.z);
  padLaunchVelocity(pd, m.vel); m.onGround = false; m.groundTime = 1; m.padLock = 0.5;
  let minClear = 1e9;
  for (let i = 0; i < 2.5 / dt; i++) m.simulate(dt, { fwd: 0, side: 0, yaw: 0, jump: false, crouch: false, dash: false });
  console.log(`apex ${apex}: hedef (${pd.tx.toFixed(1)}, ${pd.ty.toFixed(1)}, ${pd.tz.toFixed(1)}) son (${m.pos.x.toFixed(1)}, ${m.pos.y.toFixed(1)}, ${m.pos.z.toFixed(1)}) ${Math.abs(m.pos.y - pd.ty) < 0.3 ? 'CATIDA' : 'OLMADI'}`);
}
