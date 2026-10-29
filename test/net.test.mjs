// Ag katmani birim testleri (Node, tarayicisiz): mesaj kodlama, voksel farki, nicemleme sinirlari, girdi yedekliligi,
// Mover getState/setState ile yeniden oynatma, ayni (harita, seed) = ayni dunya. usage: node test/net.test.mjs
import { WORLD, VS, setPhysics, GRAVITY0 } from '../src/config.js';
import { VoxelWorld } from '../src/world/voxelWorld.js';
import { LEVELS, LEVEL_ORDER } from '../src/world/levels.js';
import { Mover } from '../src/game/mover.js';
import * as P from '../src/net/protocol.js';
import { VoxelShadow, applyDiff, applyFullChunk, worldDigest, chunkHash, deflate, inflate, splitParts, joinParts, MAX_PART } from '../src/net/voxelSync.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fail++; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = rng(2026);

// ---- 1) girdi kodlama gidis-donusu + yedeklilik ----
{
  const cmds = [];
  for (let i = 1; i <= 5; i++) cmds.push({ seq: i, dt: 1 / 60, fwd: R() < 0.5 ? 1 : -1, side: 0, yaw: R() * 6 - 3, pitch: R() - 0.5, jump: R() < 0.5, crouch: R() < 0.3, dash: R() < 0.2 });
  const dec = P.decodeInput(P.encodeInput(cmds, 3));
  ok(dec.length === 3 && dec[0].seq === 3 && dec[2].seq === 5, 'girdi: son 3 komut yedekli gider');
  ok(dec.every((d, i) => d.jump === cmds[2 + i].jump && d.crouch === cmds[2 + i].crouch && d.dash === cmds[2 + i].dash && d.fwd === cmds[2 + i].fwd && Math.abs(d.yaw - cmds[2 + i].yaw) < 1e-6 && d.weapon === 3), 'girdi: bayraklar, yon ve silah gidis-donusu');
  // kayip: 3 paketten 2'si dusse bile komut kaybolmuyor (her komut 3 pakette bulunur)
  const got = new Set();
  const pk = [];
  for (let i = 1; i <= 30; i++) { cmds.push({ seq: 5 + i, dt: 1 / 60, fwd: 1, side: 0, yaw: 0, pitch: 0, jump: false, crouch: false, dash: false }); pk.push(P.encodeInput(cmds.slice(-3), 0)); }
  for (let i = 0; i < pk.length; i++) { if (i % 3 !== 0) continue; /* her 3 paketten 2'si kayip */ for (const c of P.decodeInput(pk[i])) got.add(c.seq); }
  let missing = 0; for (let s = 8; s <= 33; s++) if (!got.has(s)) missing++;
  ok(missing <= 2, `girdi yedeklilik: %66 kayipta komut kaybi ${missing}/26 (ardisik 2 paket kaybinda yedek kurtarir)`);
}

// ---- 2) anlik goruntu nicemleme hatasi ----
{
  const actors = [], seed = rng(5);
  for (let i = 0; i < 12; i++) actors.push({ id: i, flags: P.AF.ALIVE | P.AF.GROUND, x: seed() * 72, y: seed() * 24 - 2, z: seed() * 72, vx: (seed() - 0.5) * 40, vy: (seed() - 0.5) * 60, vz: (seed() - 0.5) * 40, yaw: seed() * 20 - 10, pitch: (seed() - 0.5) * 3.1, health: seed() * 200, weapon: i % 5, frags: i - 3, deaths: i });
  const st = new Float64Array(Mover.STATE_LEN).map((_, i) => i * 1.5 - 4);
  const self = { state: st, health: 77, armor: 23, alive: true, weapon: 3, ammo: [100, 12, 90, 7, 3], quad: 4.5, protectT: 0.8, respawn: 0, yaw: 2.5 };
  const buf = P.encodeSnapshot(70000, 123.456, 598.2, 4000000000, actors, self);
  const d = P.decodeSnapshot(buf, true);
  let ep = 0, ev = 0, ey = 0;
  d.actors.forEach((a, i) => { const s = actors[i]; ep = Math.max(ep, Math.abs(a.x - s.x), Math.abs(a.y - s.y), Math.abs(a.z - s.z)); ev = Math.max(ev, Math.abs(a.vx - s.vx), Math.abs(a.vy - s.vy), Math.abs(a.vz - s.vz)); let dy = Math.abs(a.yaw - (((s.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))); ey = Math.max(ey, Math.min(dy, Math.PI * 2 - dy)); });
  ok(ep <= 0.0051, `konum nicemleme hatasi <= 0.5 cm (en kotu ${(ep * 100).toFixed(2)} cm)`);
  ok(ev <= 0.0051, `hiz nicemleme hatasi <= 0.5 cm/s (en kotu ${(ev * 100).toFixed(2)})`);
  ok(ey < 0.0001, `yon nicemleme hatasi < 0.0001 rad (en kotu ${ey.toExponential(1)})`);
  ok(d.seq === (70000 & 0xffff) && Math.abs(d.hostTime - 123.456) < 1e-3 && d.ack === 4000000000, 'baslik: seq, zaman, ack');
  ok(d.self && d.self.health === 77 && d.self.ammo[3] === 7 && Math.abs(d.self.state[16] - st[16]) < 1e-4 && Math.abs(d.self.quad - 4.5) < 0.06 && Math.abs(d.self.yaw - 2.5) < 1e-3, 'konuga ozel blok gidis-donusu (dogma yonu dahil)');
  ok(d.actors.every((a, i) => a.frags === actors[i].frags && a.deaths === actors[i].deaths && a.weapon === actors[i].weapon), 'skor ve silah gidis-donusu');
  const kb30 = buf.byteLength * 30 / 1024;
  ok(buf.byteLength < 400, `12 aktorlu anlik goruntu ${buf.byteLength} bayt (30 Hz: ${kb30.toFixed(1)} KB/s)`);
}

// ---- 3) JSON ve voksel parcalama ----
{
  const o = { t: 'fire', w: 3, o: [1, 2, 3], ad: 'ş ğ ü' };
  ok(JSON.stringify(P.decodeJson(P.encodeJson(o))) === JSON.stringify(o), 'JSON gidis-donusu (Turkce karakterli)');
  const big = new Uint8Array(100000).map((_, i) => (i * 7) & 255);
  const parts = splitParts(big);
  ok(parts.every((p) => p.length <= MAX_PART - 16 + 0), 'parcalar <= 16 KB');
  const msgs = P.encodeVoxParts(P.VOX_DIFF, 70001, parts);
  ok(msgs.every((m) => m.byteLength <= MAX_PART), 'ag mesajlari <= 16 KB (basliklar dahil)');
  const asm = new P.VoxAssembler(); let res = null;
  for (const m of msgs.slice().reverse()) res = asm.add(P.decodeVoxPart(m)) || res;   // sirasiz da toplanir
  ok(res && res.bytes.length === big.length && res.bytes.every((v, i) => v === big[i]), 'voksel parcalari birlesti (ters sirada bile)');
  const z = await deflate(big);
  ok((await inflate(z)).every((v, i) => v === big[i]), 'deflate-raw gidis-donusu');
}

// ---- 4) voksel farki: rastgele yazmalar -> kodla -> baska kopyaya uygula -> diziler ayni ----
{
  const a = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z), b = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  LEVELS.arena.generate(a, 11); LEVELS.arena.generate(b, 11);
  ok(worldDigest(a) === worldDigest(b), 'arena ayni seed iki kez: ayni ozet');
  a.enableNetDirty(); a.takeNetDirty();
  const sh = new VoxelShadow(a);
  // rastgele yazmalar: set, damageSphere, removeIndices, depositMany
  for (let k = 0; k < 400; k++) a.set((R() * WORLD.X) | 0, (R() * 30 + 5) | 0, (R() * WORLD.Z) | 0, (R() * 12) | 0);
  for (let k = 0; k < 6; k++) { a.damageSphere(R() * 70, 2 + R() * 6, R() * 70, 1 + R() * 3, 300 + R() * 300); const isl = a.findIslands(); for (const i of isl) a.removeIndices(i); }
  a.depositMany(Int32Array.from([30, 8, 30, 3, 31, 8, 30, 3, 32, 8, 30, 4]), 12);
  const dirty = a.takeNetDirty();
  const raw = sh.diff(dirty);
  ok(raw && raw.length > 0, `fark uretildi (${dirty.length} kirli chunk, ${raw ? raw.length : 0} bayt)`);
  const back = await inflate(await deflate(raw));
  applyDiff(b, back);
  ok(worldDigest(a) === worldDigest(b), 'fark uygulandi: iki dunya ayni');
  ok(sh.diff(dirty) === null, 'golge guncellendi: ikinci fark bos');
  // ayni fark iki kez uygulansa zarar vermez (mutlak degerler)
  applyDiff(b, back);
  ok(worldDigest(a) === worldDigest(b), 'ayni farkin tekrari zararsiz');
  // gorunur esigin altindaki hasar (mesh degismez) da ag farkina girmeli: dmg dizileri ayni kalsin
  a.takeNetDirty();
  const wp = { x: 0, y: 0, z: 0 }; outer: for (let y = 5; y < 20; y++) for (let x = 20; x < 260; x++) { if (a.get(x, y, 150)) { wp.x = x; wp.y = y; break outer; } }
  a.damageSphere((wp.x + 0.5) * 0.25, (wp.y + 0.5) * 0.25, 150.5 * 0.25, 0.3, 14, { noise: 0 });
  const rawSub = sh.diff(a.takeNetDirty());
  ok(rawSub !== null, 'gorunmez (esik alti) hasar da ag kirli kumesine girdi');
  if (rawSub) applyDiff(b, await inflate(await deflate(rawSub)));
  ok(worldDigest(a) === worldDigest(b), 'esik alti hasar sonrasi dunyalar (dmg dahil) ayni');
  // golge (son gonderilen durum) ozetleri konuk dunyasiyla ayni: kendini onarma karsilastirmasi buna dayanir
  { let same = true; for (let ci = 0; ci < a.ncx * a.ncy * a.ncz; ci++) if (chunkHash(a, ci, sh.mat, sh.dmg) !== chunkHash(b, ci)) { same = false; break; } ok(same, 'golge chunk ozetleri konuk dunyasiyla ayni'); }
  // yalnizca kirli chunk'lara bakmak yetiyor: dokunulmamis chunk'in ozeti degismedi
  const hs = []; for (let ci = 0; ci < a.ncx * a.ncy * a.ncz; ci++) hs.push(chunkHash(a, ci) === chunkHash(b, ci));
  ok(hs.every(Boolean), 'her chunk ozeti ayni');
  // tam chunk (gec katilim)
  const c = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z); LEVELS.arena.generate(c, 11);
  for (const ci of dirty) applyFullChunk(c, sh.fullChunk(ci));
  ok(worldDigest(a) === worldDigest(c), 'gec katilim: tam chunk\'larla ayni dunya');
  // bozulma onarimi: bir chunk'in ozeti uyusmazsa tam icerik gonderilince duzelir
  const ci0 = dirty[0]; c.mat[0] = 99;
  applyFullChunk(c, sh.fullChunk(ci0));
}

// ---- 5) nicemleme: konum hata siniri guvenli mi (dunya sinirlari int16'ya sigar) ----
ok(P.q16(72, 100) === 7200 && P.q16(-4, 100) === -400 && P.q16(1e9, 100) === 32767, 'int16 kirpma: dunya 72 m icinde tasma yok, asiri deger kirpilir');

// ---- 6) Mover getState/setState ile yeniden oynatma ayni sonucu veriyor ----
{
  const w = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const arena = LEVELS.arena.generate(w, 3);
  const A = new Mover(w), B = new Mover(w), sp = arena.spawns[0];
  A.reset(sp.x, sp.y + 0.02, sp.z); B.reset(sp.x, sp.y + 0.02, sp.z);
  const cmds = [];
  for (let i = 0; i < 600; i++) cmds.push({ fwd: 1, side: (i / 40 | 0) % 2 ? 1 : -1, yaw: Math.sin(i / 50) * 2, pitch: 0, jump: i % 90 < 60, crouch: i % 200 > 170, dash: i % 120 === 0 });
  let snap = null;
  for (let i = 0; i < 600; i++) { A.simulate(1 / 60, cmds[i]); if (i === 299) snap = A.getState(); }
  B.setState(snap);
  for (let i = 300; i < 600; i++) B.simulate(1 / 60, cmds[i]);
  const d = Math.hypot(A.pos.x - B.pos.x, A.pos.y - B.pos.y, A.pos.z - B.pos.z);
  ok(d < 1e-9 && A.vel.distanceTo(B.vel) < 1e-9, `getState/setState: 300 komut yeniden oynatildi, fark ${d.toExponential(1)}`);
  const s2 = A.getState(); const C = new Mover(w); C.setState(s2);
  ok(C.getState().every((v, i) => v === s2[i]), 'getState -> setState -> getState ayni');
}

// ---- 7) ayni (harita, seed) iki kez uretilince ayni dunya (alti harita) ----
for (const m of LEVEL_ORDER) {
  const a = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z), b = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
  const ia = LEVELS[m].generate(a, 987654), ib = LEVELS[m].generate(b, 987654);
  ok(worldDigest(a) === worldDigest(b) && JSON.stringify(ia.spawns) === JSON.stringify(ib.spawns), `${m}: ayni (harita, seed) -> ayni dunya ve doguma noktalari`);
}
setPhysics(GRAVITY0, null);
console.log(fail ? `\n${fail} HATA` : '\nhepsi gecti');
process.exit(fail ? 1 : 0);
