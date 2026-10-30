// Ev sahibi oturumu: oyunu bugunku gibi tam calistirir; konuklar RemotePlayer aktorleridir. Yetki yalniz burada:
// hasar / olum, voksel yazma, esya alma, bot yapay zekasi. Konuga: 30 Hz anlik goruntu, ~15 Hz voksel farki, olaylar.
import * as THREE from 'three';
import { RemotePlayer } from './netactor.js';
import * as P from './protocol.js';
import { VoxelShadow, worldHashes, chunkHash, deflate, splitParts } from './voxelSync.js';
import { applyPad } from '../game/mover.js';
import { fire } from '../game/combat.js';
import { NameTags, RateMeter } from './netui.js';

const FX_NAMES = { i: 'impact', t: 'tracer', r: 'rail', m: 'muzzle', h: 'robotHit' };
const SNAP_DT = 1 / 30, VOX_DT = 1 / 15, MAX_CMD_DT = 0.05, VOX_CHUNKS_PER_FLUSH = 24, MAPST_DT = 0.1;
const GUEST_COLORS = [0x40d0ff, 0xffe040, 0xff60a0];
const _e = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3();

export class HostSession {
  constructor(game, room, name = 'Host') {
    this.role = 'host'; this.game = game; this.room = room; this.hostName = name;
    this.guests = new Map();
    this.snapSeq = 0; this.snapT = 0; this.voxT = 0; this.transfer = 1;
    this.shadow = null; this.baseHash = null; this.itemSig = ''; this.rosterSig = ''; this.rosterT = 0;
    this.hist = new Map();      // aktor -> [{t,x,y,z}]  (gecikme telafisi icin ~0.6 sn)
    this.stats = { snapBytes: 0, voxBytes: 0, voxMsgs: 0, inputs: 0, fires: 0, kills: 0 };
    this.hashPending = new Set(); this.hashT = 0;
    this.mapT = 0; this.mapSig = new Map();     // harita sistemlerinin son gonderilen durumu (P.MAP_NET_SYSTEMS)
    this.fxQ = []; this.curShooter = -1; this.projId = 0; this.bodyId = 0; this.connT = 0;
    this.tags = new NameTags(); this.meter = new RateMeter();
    this.onChange = null;       // arayuz: oyuncu listesi degisti
  }

  // oturumu ac: kirli takibi, golge, baz ozetler, esler
  enable() {
    const g = this.game;
    g.net = this; g.auth = true;
    g.world.enableNetDirty();
    // efekt cogaltma: bu fx cagrilari (isabet kivilcimi, iz, namlu alevi, ray, robot vurusu, debris) ayni argumanlarla konuklarda da calisir
    const fx = g.fx; this._fxOrig = {};
    const R2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
    for (const [k, name] of Object.entries(FX_NAMES)) {
      const orig = fx[name]; this._fxOrig[name] = orig;
      fx[name] = (...a) => { orig.apply(fx, a); if (this.guests.size && this.fxQ.length < 60) this.fxQ.push([k, this.curShooter, a.map(R2)]); };
    }
    const vd = fx.voxelDebris; this._fxOrig.voxelDebris = vd;
    fx.voxelDebris = (world, idx, mats, n, x, y, z, force, max = 220) => {
      vd.call(fx, world, idx, mats, n, x, y, z, force, max);
      if (!this.guests.size || n <= 0 || this.fxQ.length >= 60) return;
      const m = Math.min(n, max, 80), step = n / m, arr = [];
      for (let k = 0; k < m; k++) { const j = Math.floor(k * step); arr.push(idx[j], mats[j]); }
      this.fxQ.push(['d', this.curShooter, [R2(x), R2(y), R2(z), force, max, arr]]);
    };
    this.onArenaBuilt();
    this.room.onLink = (link, id, name) => this.addGuest(link, id, name);
    this.room.onPeerLeft = (id) => this.removeGuest(id);
    this.room.onClosed = () => { for (const id of [...this.guests.keys()]) this.removeGuest(id); };
  }

  // harita (yeniden) kuruldu: golge ve baz ozetleri tazele; konuklara yeni haritayi bildir
  onArenaBuilt() {
    const g = this.game, w = g.world;
    w.enableNetDirty(); w.netDirty.length = 0; w.netChunkDirty.fill(0);
    this.shadow = new VoxelShadow(w);
    this.baseHash = worldHashes(w);
    this.hist.clear(); this.itemSig = ''; this.hashPending.clear(); this.mapSig.clear();
    for (const gu of this.guests.values()) {
      gu.ready = false; gu.synced = true;
      this.sendJson(gu, { t: 'newmap', map: g.mapId, seed: g.seed, items: this.itemString(), roster: this.roster(), you: gu.id, matchTime: g.matchTime });
    }
  }

  itemString() { return this.game.items ? this.game.items.list.map((it) => (it.active && !it.hidden ? '1' : '0')).join('') : ''; }
  roster() { return this.game.actors.map((a) => ({ id: a.id, name: a.isPlayer ? this.hostName : a.name, color: a.color, human: !!(a.isPlayer || a.human) })); }
  remotes() { const out = []; for (const g of this.guests.values()) if (g.player) out.push(g.player); return out; }
  humanCount() { return 1 + this.guests.size; }

  // ---- baglanti ----
  addGuest(link, id, name) {
    const g = { id, name, link, player: null, ready: false, synced: false, q: Promise.resolve(), inputQ: [], lastSeq: 0, gap: 0, shot: 0, ping: 0 };
    this.guests.set(id, g);
    link.onopen = () => this.sendHello(g);
    link.onmessage = (rel, buf) => this.onMessage(g, rel, buf);
    link.onclosed = () => { if (this.guests.get(id) === g) this.removeGuest(id); };
    if (this.onChange) this.onChange();
  }

  removeGuest(id) {
    const g = this.guests.get(id); if (!g) return;
    this.guests.delete(id);
    if (g.player) {
      const game = this.game, i = game.actors.indexOf(g.player);
      if (i >= 0) game.actors.splice(i, 1);
      g.player.alive = false; g.player.dispose();
      for (const b of game.bots) { if (b.target === g.player) b.target = null; b.mem.delete(g.player); }
      this.hist.delete(g.player);
    }
    try { g.link.close(); } catch { /* */ }
    if (this.onChange) this.onChange();
  }

  sendJson(g, obj) { g.q = g.q.then(() => { try { g.link.send(true, P.encodeJson(obj)); } catch (e) { console.warn('net send', e); } }); }
  broadcast(obj, onlyReady = true) { for (const g of this.guests.values()) if (!onlyReady || g.ready) this.sendJson(g, obj); }

  // katilim: hello + harita kurulumundan farkli chunk'larin tam icerigi
  sendHello(g) {
    const game = this.game, w = game.world;
    this.sendJson(g, { t: 'hello', map: game.mapId, seed: game.seed, you: g.id, name: g.name, hostName: this.hostName, items: this.itemString(), roster: this.roster(), matchTime: game.matchTime });
    // yaratildigindan beri degisen chunk'lar tam gonderilir (sonraki farklar mutlak oldugu icin tutarli)
    const full = [];
    for (let ci = 0; ci < this.baseHash.length; ci++) if (chunkHash(w, ci) !== this.baseHash[ci]) full.push(this.shadow.fullChunk(ci));
    g.synced = true;
    if (full.length) {
      const raw = new Uint8Array(full.length * full[0].length);
      full.forEach((c, i) => raw.set(c, i * c.length));
      this.enqueueVox(P.VOX_FULL, this.transfer++, raw, [g]);
    }
    this.sendJson(g, { t: 'world-done', chunks: full.length });
  }

  enqueueVox(kind, id, raw, targets) {
    const msgsP = deflate(raw).then((z) => P.encodeVoxParts(kind, id & 0xffff, splitParts(z)));
    for (const g of targets) g.q = g.q.then(() => msgsP).then((msgs) => { for (const m of msgs) { g.link.send(true, m); this.stats.voxBytes += m.byteLength; this.stats.voxMsgs++; } }).catch((e) => console.warn('vox send', e));
  }

  // ---- gelen mesajlar ----
  onMessage(g, rel, buf) {
    const type = new Uint8Array(buf, 0, 1)[0];
    if (type === P.U_INPUT) {
      this.stats.inputs++;
      for (const c of P.decodeInput(buf)) if (c.seq > g.lastSeq && !g.inputQ.some((x) => x.seq === c.seq)) g.inputQ.push(c);
      g.inputQ.sort((a, b) => a.seq - b.seq);
      if (g.inputQ.length > 60) g.inputQ.splice(0, g.inputQ.length - 60);
    } else if (type === P.R_JSON) {
      const m = P.decodeJson(buf);
      if (m.t === 'ready') this.guestReady(g, m);
      else if (m.t === 'fire') this.onFire(g, m);
      else if (m.t === 'resync') this.onResync(g, m);
      else if (m.t === 'name') { g.name = String(m.name || g.name).slice(0, 20); if (g.player) g.player.name = g.name; }
    }
  }

  guestReady(g) {
    const game = this.game;
    g.ready = true;
    if (!g.player) g.player = new RemotePlayer(game, g.id, g.name, GUEST_COLORS[(g.id - 12) % GUEST_COLORS.length], g.id);
    if (!game.actors.includes(g.player)) game.actors.push(g.player);
    if (!g.player.alive) { g.player.frags = 0; g.player.deaths = 0; g.player.spawn(game.pickSpawn(g.player)); }
    g.inputQ.length = 0;       // lastSeq sifirlanmaz: konugun komut numaralari arena degisiminde de artarak devam eder
    this.rosterSig = '';   // liste degisti: hemen yolla
    this.sendMapStates(g);   // harita sistemlerinin tam durumu (gec katilan / yeni harita)
    if (this.onChange) this.onChange();
  }

  // ---- her kare ----
  update(dt) {
    const game = this.game, now = game.time;
    for (const g of this.guests.values()) {
      if (!g.player) continue;
      this.runInputs(g, dt);
      g.player.update(dt);
    }
    // gecmis konumlar
    for (const a of game.actors) {
      let h = this.hist.get(a); if (!h) { h = []; this.hist.set(a, h); }
      const p = a.mover.pos; h.push({ t: now, x: p.x, y: p.y, z: p.z });
      while (h.length > 2 && now - h[0].t > 0.6) h.shift();
    }
    this.meter.tick(dt, [...this.guests.values()].map((x) => x.link));
    this.snapT += dt;
    if (this.snapT >= SNAP_DT) { this.snapT = Math.min(this.snapT - SNAP_DT, SNAP_DT); this.sendSnapshots(); }
    this.voxT += dt;
    if (this.voxT >= VOX_DT && game.world.netDirty.length) { this.voxT = 0; this.flushVoxels(); }
    this.hashT += dt;
    if (this.hashT >= 2 && this.hashPending.size) { this.hashT = 0; this.sendHashes(); }
    this.mapT += dt;
    if (this.mapT >= MAPST_DT) { this.mapT = 0; this.sendMapStates(null); }
    this.rosterT += dt;
    if (this.rosterT >= 0.5) {
      this.rosterT = 0;
      const sig = game.actors.map((a) => a.id + ':' + (a.isPlayer ? this.hostName : a.name)).join('|');
      if (sig !== this.rosterSig) { this.rosterSig = sig; this.broadcast({ t: 'roster', r: this.roster() }); }
      const is = this.itemString();
      if (is !== this.itemSig) { this.itemSig = is; this.broadcast({ t: 'items', s: is }); }
    }
  }

  runInputs(g, dt) {
    const game = this.game, a = g.player, q = g.inputQ;
    let n = 0;
    while (q.length && n++ < 12) {
      const c = q[0];
      if (c.seq <= g.lastSeq) { q.shift(); continue; }
      // eksik komut (sirasiz gelen / kayip paket): yedek komutlar doldurabilsin diye kisa sure bekle, sonra atla
      if (g.lastSeq > 0 && c.seq > g.lastSeq + 1 && g.gap < 0.12) { g.gap += dt; break; }
      q.shift(); g.gap = 0;
      g.lastSeq = c.seq;
      if (!a.alive || game.state === 'loading') continue;
      a.mover.simulate(Math.min(MAX_CMD_DT, Math.max(0.0005, c.dt)), c);
      const pd = applyPad(game.pads, a.mover);
      if (pd) { game.fx.padBurst(pd.x, pd.y, pd.z); if (game.audio) game.audio.play('jumppad', pd.x, pd.y, pd.z, 1); }
      a.yaw = c.yaw; a.pitch = Math.max(-1.55, Math.min(1.55, c.pitch)); a.cmd = c;
      if (c.weapon < 5 && c.weapon !== a.weapons.current && a.weapons.has[c.weapon]) a.weapons.current = c.weapon;
    }
  }

  actorList() {
    const game = this.game, out = [];
    for (const a of game.actors) {
      const m = a.mover, p = m.pos;
      out.push({
        id: a.id, flags: (a.alive ? P.AF.ALIVE : 0) | (m.crouching ? P.AF.CROUCH : 0) | (m.onGround ? P.AF.GROUND : 0) | (game.time - a.lastFireTime < 0.12 ? P.AF.FIRE : 0) | (a.quad > 0 ? P.AF.QUAD : 0) | (a.protect > 0 ? P.AF.PROTECT : 0) | ((a.isPlayer || a.human) ? P.AF.HUMAN : 0),
        x: p.x, y: p.y, z: p.z, vx: m.vel.x, vy: m.vel.y, vz: m.vel.z, yaw: a.yaw, pitch: a.pitch, health: a.health, weapon: a.weapons.current, frags: a.frags, deaths: a.deaths,
      });
    }
    return out;
  }

  sendSnapshots() {
    const game = this.game;
    if (!this.guests.size) return;
    const all = this.actorList();
    this.snapSeq = (this.snapSeq + 1) & 0xffff;
    const bl = game.destruction.bodies.filter((b) => b.nid).map((b) => ({ id: b.nid, x: b.group.position.x, y: b.group.position.y, z: b.group.position.z, qx: b.group.quaternion.x, qy: b.group.quaternion.y, qz: b.group.quaternion.z, qw: b.group.quaternion.w }));
    for (const g of this.guests.values()) {
      if (!g.ready || !g.player) continue;
      const a = g.player;
      const self = { state: a.mover.getState(), health: a.health, armor: a.armor, alive: a.alive, weapon: a.weapons.current, ammo: a.weapons.ammo, quad: a.quad, protectT: a.protect, respawn: a.respawnTimer, yaw: a.yaw };
      const buf = P.encodeSnapshot(this.snapSeq, game.time, game.matchTime, g.lastSeq, all, self);   // konugun kendi satiri da gider (skor); konuk onu cizmez
      if (g.link.send(false, buf)) this.stats.snapBytes += buf.byteLength;
      if (bl.length) g.link.send(false, P.encodeBodies(bl));
      g.ping = g.link.rtt;
    }
    this.flushFx();
  }

  flushVoxels() {
    const w = this.game.world;
    const targets = [...this.guests.values()].filter((g) => g.synced);
    if (!targets.length) { w.takeNetDirty(); return; }
    const dirty = w.takeNetDirty(VOX_CHUNKS_PER_FLUSH);
    const raw = this.shadow.diff(dirty);
    if (raw) { this.enqueueVox(P.VOX_DIFF, this.transfer++, raw, targets); for (const ci of dirty) this.hashPending.add(ci); }
  }

  // kendini onarma: golgedeki (konuklara gonderilmis) chunk ozetleri; konuk kendi dunyasiyla karsilastirir
  sendHashes() {
    const list = [...this.hashPending].slice(0, 40);
    for (const ci of list) this.hashPending.delete(ci);
    const h = list.map((ci) => chunkHash(this.game.world, ci, this.shadow.mat, this.shadow.dmg));
    for (const g of this.guests.values()) if (g.synced) this.sendJson(g, { t: 'hash', c: list, h });
  }
  onResync(g, m) {
    const list = (m.c || []).filter((ci) => Number.isInteger(ci) && ci >= 0 && ci < this.baseHash.length).slice(0, 12);
    if (!list.length) return;
    this.stats.resync = (this.stats.resync || 0) + list.length;
    const full = list.map((ci) => this.shadow.fullChunk(ci)), raw = new Uint8Array(full.length * full[0].length);
    full.forEach((c, i) => raw.set(c, i * c.length));
    this.enqueueVox(P.VOX_FULL, this.transfer++, raw, [g]);
  }

  // ---- atis (gecikme telafili) ----
  onFire(g, m) {
    const game = this.game, a = g.player;
    if (!a || !a.alive || game.state === 'loading') return;
    const ws = a.weapons;
    if (m.w >= 0 && m.w < 5 && ws.has[m.w]) ws.current = m.w;
    if (!ws.canFire()) return;
    this.stats.fires++;
    a.eye(_e);
    _p.set(m.o[0], m.o[1], m.o[2]);
    if (_p.distanceTo(_e) < 1.0) _e.copy(_p);       // bildirilen goz ev sahibindekine ~1 m'den yakinsa onu kullan
    _d.set(m.d[0], m.d[1], m.d[2]);
    if (_d.lengthSq() < 0.5) return;
    _d.normalize();
    a.yaw = Math.atan2(-_d.x, -_d.z); a.pitch = Math.asin(Math.max(-1, Math.min(1, _d.y)));
    a.model.muzzle(_m, a.mover.pos.x, a.mover.pos.y - a.mover.stepSmooth, a.mover.pos.z, a.yaw, a.pitch);
    a.firing = true;
    // hitscan: dunya geri sarilmaz, yalniz diger aktorlerin konumu konugun gordugu ana alinir
    const restore = this.rewind(a, m.ht);
    this.curShooter = g.id;
    try { fire(game, a, _e, _d, _m); } finally { this.curShooter = -1; restore(); }
  }

  rewind(shooter, t) {
    const saved = [];
    if (typeof t === 'number' && t > 0 && t < this.game.time) {
      for (const b of this.game.actors) {
        if (b === shooter || !b.alive) continue;
        const h = this.hist.get(b); if (!h || h.length < 2) continue;
        let p = null;
        if (t <= h[0].t) p = h[0];
        else for (let i = h.length - 1; i > 0; i--) if (h[i - 1].t <= t) { const a0 = h[i - 1], a1 = h[i], k = Math.min(1, (t - a0.t) / Math.max(1e-6, a1.t - a0.t)); p = { x: a0.x + (a1.x - a0.x) * k, y: a0.y + (a1.y - a0.y) * k, z: a0.z + (a1.z - a0.z) * k }; break; }
        if (!p) continue;
        const pos = b.mover.pos; saved.push([pos, pos.x, pos.y, pos.z]); pos.set(p.x, p.y, p.z);
      }
    }
    return () => { for (const [pos, x, y, z] of saved) pos.set(x, y, z); };
  }

  // ---- harita sistemleri (P.MAP_NET_SYSTEMS): durum degisince ~10 Hz 'mst', katilan konuga hemen tam durum; olaylar 'mev' ----
  sendMapStates(target) {
    if (!this.guests.size) { this.mapSig.clear(); return; }
    const game = this.game;
    for (const name of P.MAP_NET_SYSTEMS) {
      const s = game[name];
      if (!s || !s.active || typeof s.netState !== 'function') continue;
      const v = s.netState();
      if (v === undefined || v === null) continue;
      if (target) { if (target.ready) this.sendJson(target, { t: 'mst', s: name, v }); this.mapSig.delete(name); continue; }
      const js = JSON.stringify(v);
      if (this.mapSig.get(name) === js) continue;
      this.mapSig.set(name, js);
      this.broadcast({ t: 'mst', s: name, v });
    }
  }
  mapEvent(sys, ev) { if (this.guests.size) this.broadcast({ t: 'mev', s: sys, e: ev }); }

  // ---- Game kancalari (hasar / olum / esya): konuga kisisel olay, herkese olum akisi ----
  onDamage(victim, attacker, dmg, dir, head) {
    if (attacker && attacker.remote !== undefined && attacker !== victim) { const g = this.guests.get(attacker.remote); if (g) this.sendJson(g, { t: 'hit', h: head ? 1 : 0 }); }
    if (victim.remote !== undefined) {
      const g = this.guests.get(victim.remote);
      if (g) { const ap = attacker && attacker !== victim ? attacker.mover.pos : null; this.sendJson(g, { t: 'hurt', d: Math.round(dmg), a: ap ? [ap.x, ap.z] : null, s: attacker === victim ? 1 : 0 }); }
    }
  }
  onKill(victim, killer, weaponId, head) {
    this.stats.kills++;
    const p = victim.mover.pos;
    this.broadcast({ t: 'kill', v: victim.id, k: killer ? killer.id : -1, w: weaponId, h: head ? 1 : 0, p: [p.x, p.y, p.z], c: victim.color });
  }
  // roket / plazma patlamasi: konuklarda patlama efekti ve sesi (vokseller voksel akisiyla gelir)
  onBoom(p, x, y, z, nx, ny, nz, deep) {
    this.broadcast({ t: 'boom', i: p.nid || 0, w: p.W.id, q: p.quad > 1 ? 1 : 0, p: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], n: [nx, ny, nz], d: deep ? 1 : 0 });
  }
  onPickup(actor, item) {
    if (item.type === 'quad') this.broadcast({ t: 'ann', k: 'quadPick', a: actor.id });
    if (actor.remote === undefined) return;
    const g = this.guests.get(actor.remote); if (g) this.sendJson(g, { t: 'pickup', i: item.type });
  }

  // roket / plazma dogdu: konuklarda duz cizgide gorsel mermi ucar (sahibi konuksa kendi yerel gorseliyle eslesir)
  onProj(p) {
    p.nid = ++this.projId;
    const r = (v) => Math.round(v * 100) / 100;
    this.broadcast({ t: 'proj', i: p.nid, w: p.W.id, q: p.quad > 1 ? 1 : 0, ow: p.owner ? p.owner.id : -1, p: [r(p.pos.x), r(p.pos.y), r(p.pos.z)], v: [r(p.vel.x), r(p.vel.y), r(p.vel.z)] });
  }
  // kopan govde: bir kez ham icerik (sikistirilmis), sonra 30 Hz konum + donus
  onBody(body, isl) {
    body.nid = (++this.bodyId) & 0xffff;
    const targets = [...this.guests.values()].filter((g) => g.ready);
    if (targets.length) this.enqueueVox(P.VOX_BODY, this.transfer++, P.encodeBodySpawn(body.nid, isl), targets);
  }
  onBodyEnd(body) { this.broadcast({ t: 'bodyend', i: body.nid }); }
  onMatchEnd(winner) { this.broadcast({ t: 'matchend', w: winner ? winner.id : -1 }); }
  flushFx() {
    if (!this.fxQ.length) return;
    for (const g of this.guests.values()) {
      if (!g.ready) continue;
      const list = this.fxQ.filter((e) => e[1] !== g.id).map((e) => [e[0], e[2]]);
      if (list.length) this.sendJson(g, { t: 'fx', a: list });
    }
    this.fxQ.length = 0;
  }
  humanActors() { return this.remotes().filter((a) => a.alive); }
  updateTags(camera) { this.tags.update(camera, this.game.world, this.humanActors()); }
  infoLine() {
    let worst = 0; for (const g of this.guests.values()) worst = Math.max(worst, g.link.rtt || 0);
    return this.guests.size + ' guest(s) · ping ' + Math.round(worst) + ' ms · in ' + this.meter.inKB.toFixed(1) + ' / out ' + this.meter.outKB.toFixed(1) + ' KB/s';
  }

  close() {
    for (const [name, f] of Object.entries(this._fxOrig || {})) this.game.fx[name] = f;
    this.tags.clear();
    for (const id of [...this.guests.keys()]) this.removeGuest(id);
    try { this.room.close(); } catch { /* */ }
    if (this.game.net === this) { this.game.net = null; this.game.world.netDirty = null; }
  }
}
