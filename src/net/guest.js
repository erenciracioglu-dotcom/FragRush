// Konuk oturumu: dunyayi (harita, seed) ile kendisi uretir, ev sahibinden gelen voksel farklarini uygular; yalniz kendi
// oyuncusunu simule eder (tahmin + uzlastirma). Botlar ve oteki insanlar anlik goruntuyle cizilir (enterpolasyon).
import { NetActor } from './netactor.js';
import { Predictor } from './prediction.js';
import * as P from './protocol.js';
import { applyDiff, applyFullChunk, chunkHash, inflate } from './voxelSync.js';
import { applyPad } from '../game/mover.js';
import { CS, VS } from '../config.js';
import * as THREE from 'three';
import { WEAPONS } from '../game/weapons.js';
import { meshVoxels } from '../world/mesher.js';
import { buildGeometry } from '../world/chunkManager.js';
import { NameTags, RateMeter } from './netui.js';
import { t } from '../i18n.js';
import { killLabelId, SELF_FEED, KILLER_MSG } from '../game/killnames.js';

const INTERP = 0.1;                       // s: ev sahibi zamaninin bu kadar gerisinden ciz
const CHUNK_FULL = 2 + CS * CS * CS * 2;  // fullChunk boyutu
const _hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };

const C_FIRE0 = [10, 5, 1.6, 1], C_FIRE1 = [3, 0.8, 0.1, 0], C_PL0 = [0.8, 3.5, 5, 0.9], C_PL1 = [0.2, 1, 2, 0];
const FX_FN = { i: 'impact', t: 'tracer', r: 'rail', m: 'muzzle', h: 'robotHit' };

// konukta gorsel mermiler: ev sahibi doguslari bildirir, mermi duz cizgide ucar, patlama olayi ya da duvara carpma bitirir
class VisualProjectiles {
  constructor(game) {
    this.game = game; this.list = [];
    this.q = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 0, 1); this.d = new THREE.Vector3(); this.nd = new THREE.Vector3(); this.m = new THREE.Matrix4();
    this.hit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 };
  }
  spawn(id, wid, p, v, local) {
    const W = WEAPONS.find((w) => w.id === wid); if (!W) return;
    let mesh = null;
    if (wid === 'rocket') { const P0 = this.game.projectiles; if (!P0.rocketPool.length) P0.prewarm(1); mesh = P0.rocketPool.pop(); this.game.scene.add(mesh); }
    this.list.push({ id, W, local, mapped: false, pos: new THREE.Vector3(p[0], p[1], p[2]), vel: new THREE.Vector3(v[0], v[1], v[2]), mesh, life: 0 });
  }
  adopt(wid, id) { for (const p of this.list) if (p.local && !p.mapped && p.W.id === wid) { p.id = id; p.mapped = true; return true; } return false; }
  remove(id) { for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].id === id) { this._free(this.list[i]); this.list.splice(i, 1); } }
  _free(p) { if (p.mesh) { this.game.scene.remove(p.mesh); this.game.projectiles.rocketPool.push(p.mesh); p.mesh = null; } }
  clear() { for (const p of this.list) this._free(p); this.list.length = 0; this.game.projectiles.plasmaMesh.count = 0; }
  update(dt) {
    const g = this.game, w = g.world, fx = g.fx, pm = g.projectiles.plasmaMesh; let pc = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]; p.life += dt;
      const sp = p.vel.length() || 1;
      this.d.copy(p.vel).divideScalar(sp);
      if (p.life > 7 || (p.local && !p.mapped && p.life > 1.2) || w.raycast(p.pos.x, p.pos.y, p.pos.z, this.d.x, this.d.y, this.d.z, sp * dt + p.W.radius, this.hit)) { this._free(p); this.list.splice(i, 1); continue; }
      p.pos.addScaledVector(p.vel, dt);
      const x = p.pos.x, y = p.pos.y, z = p.pos.z;
      if (p.mesh) {
        p.mesh.position.set(x, y, z); this.q.setFromUnitVectors(this.up, this.nd.copy(this.d).negate()); p.mesh.quaternion.copy(this.q);
        fx.add.emit(x - this.d.x * 0.26, y - this.d.y * 0.26, z - this.d.z * 0.26, -this.d.x * 4, -this.d.y * 4, -this.d.z * 4, 0.05, 0.22, 0.08, C_FIRE0, C_FIRE1, 0, 0, 0);
      } else if (pc < 160) {
        this.m.makeTranslation(x, y, z); pm.setMatrixAt(pc++, this.m);
        fx.add.emit(x, y, z, 0, 0, 0, 0.035, 0.42, 0.3, C_PL0, C_PL1, 0, 0, 0);
      }
    }
    pm.count = pc; if (pc) pm.instanceMatrix.needsUpdate = true;
  }
}

// konukta kopan govdeler: ev sahibi icerigi bir kez yollar, sonra konum / donus akar; yerlesince govde kalkar (moloz voksel akisiyla gelir)
class GuestBodies {
  constructor(game) { this.game = game; this.map = new Map(); }
  spawn(s) {
    const g = this.game, { id, minX, minY, minZ, nx, ny, nz, com, mats, dmgs } = s;
    const px = nx + 2, pz = nz + 2, vol = px * pz * (ny + 2), pm = new Uint8Array(vol), pd = new Uint8Array(vol);
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
      const src = nx * (z + nz * y), dst = 1 + px * ((z + 1) + pz * (y + 1));
      pm.set(mats.subarray(src, src + nx), dst); pd.set(dmgs.subarray(src, src + nx), dst);
    }
    const geo = buildGeometry(meshVoxels(pm, pd, nx, ny, nz, minX, minY, minZ, VS)); geo.computeBoundingSphere();
    const group = new THREE.Group(); group.position.set(com[0], com[1], com[2]);
    const mesh = new THREE.Mesh(geo, g.voxelMaterial); mesh.position.set(-com[0], -com[1], -com[2]); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); g.scene.add(group);
    const old = this.map.get(id); if (old) this.end(id);
    this.map.set(id, { group, geo });
  }
  set(list) { for (const b of list) { const e = this.map.get(b.id); if (e) { e.group.position.set(b.x, b.y, b.z); e.group.quaternion.set(b.qx, b.qy, b.qz, b.qw); } } }
  end(id) { const e = this.map.get(id); if (!e) return; this.game.scene.remove(e.group); e.geo.dispose(); this.map.delete(id); }
  clear() { for (const id of [...this.map.keys()]) this.end(id); }
}

export class GuestSession {
  // hooks: { progress(p, msg), onReady(), onEnd(reason), onChange() }
  constructor(game, room, link, hooks = {}) {
    this.role = 'guest'; this.game = game; this.room = room; this.link = link; this.hooks = hooks;
    this.myId = room.id; this.hostName = 'Host';
    this.chain = Promise.resolve();
    this.asm = new P.VoxAssembler();
    this.snaps = [];                   // son anlik goruntuler [{t, recv, actors: Map}]
    this.lastSeq = -1; this.lastHostT = 0; this.lastRecv = 0;
    this.actors = new Map();           // id -> NetActor
    this.roster = new Map();           // id -> {name, color, human}
    this.sent = [];
    this.active = false; this.worldReady = false;
    this.predictor = null;
    this.shotSeq = 0;
    this.stats = { snaps: 0, applied: 0, voxMsgs: 0, kills: 0 };
    this.vis = new VisualProjectiles(game); this.bodies = new GuestBodies(game);
    this.tags = new NameTags(); this.meter = new RateMeter(); this.begun = false;
    link.onmessage = (rel, buf) => (rel ? this.onReliable(buf) : this.onUnreliable(buf));
    link.onclosed = () => { if (this.hooks.onEnd && !this._ended) this.hooks.onEnd('closed'); };
    room.onHostLeft = () => { this._ended = true; if (this.hooks.onEnd) this.hooks.onEnd('host-left'); };
  }

  // ev sahibinin zamani (yaklasik): son anlik goruntu + gecen yerel sure
  hostNow() { return this.lastHostT + (performance.now() - this.lastRecv) / 1000; }
  renderTime() { return this.hostNow() - INTERP; }

  // ---- gelen mesajlar ----
  onReliable(buf) {
    const type = new Uint8Array(buf, 0, 1)[0];
    if (type === P.R_JSON) { const m = P.decodeJson(buf); this.chain = this.chain.then(() => this.handleJson(m)).catch((e) => console.error('guest json', e)); }
    else if (type === P.R_VOX) {
      this.stats.voxMsgs++;
      const done = this.asm.add(P.decodeVoxPart(buf));
      if (done) this.chain = this.chain.then(() => this.applyVox(done)).catch((e) => console.error('guest vox', e));
    }
  }

  async handleJson(m) {
    const game = this.game;
    if (m.t === 'hello' || m.t === 'newmap') {
      this.worldReady = false; this.active = false;
      this.vis.clear(); this.bodies.clear();
      this.myId = m.you; if (m.hostName) this.hostName = m.hostName;
      this.setRoster(m.roster);
      this.clearActors();
      game.net = this; game.auth = false;
      for (const b of game.bots) game.scene.remove(b.model.root);
      game.bots = []; game.actors = [game.player];
      game.state = 'loading';
      await game.buildArena(m.seed, (p, msg) => this.hooks.progress && this.hooks.progress(p, msg), m.map);
      if (m.matchTime !== undefined) game.matchTime = m.matchTime;
      this.applyItems(m.items);
      // komut sira numarasi arena degisiminde de monoton kalir (yeni Predictor seq'i sifirlayip ev sahibinin ack'ini bozmasin)
      if (this.predictor) this.predictor.reset();
      else this.predictor = new Predictor(game.player.mover, (mv, live) => { const pd = applyPad(game.pads, mv); if (pd && live) this.padFx(pd); });
      game.player.alive = false;
      this.snaps.length = 0; this.lastSeq = -1;
      if (this.begun) game.state = 'playing';
      if (m.t === 'newmap') { this.worldReady = true; this.send_ready(); }
    } else if (m.t === 'world-done') {
      this.worldReady = true;
      this.send_ready();
      if (this.hooks.onReady) this.hooks.onReady();
    } else if (m.t === 'roster') { this.setRoster(m.r); }
    else if (m.t === 'items') { this.applyItems(m.s); }
    else if (m.t === 'hit') {
      if (game.hud) game.hud.hitmarker(m.h ? 'head' : 'hit');
      if (game.audio) game.audio.play(m.h ? 'headshot' : 'hit', 0, 0, 0, 1, true);
    } else if (m.t === 'hurt') {
      const p = game.player;
      if (game.post) game.post.hit(Math.min(1.2, m.d / 45));
      if (game.audio && !m.s) game.audio.play('hurt', 0, 0, 0, Math.min(1.4, 0.5 + m.d / 60), true);
      if (game.hud) {
        if (m.a) { const pp = p.mover.pos; game.hud.damageDir(-(Math.atan2(-(m.a[0] - pp.x), -(m.a[1] - pp.z)) - p.yaw)); }
      }
    } else if (m.t === 'pickup') {
      if (game.hud) game.hud.subMsg(t('i.' + m.i), 1.4);
      if (game.audio) game.audio.play(m.i === 'quad' ? 'quad' : 'pickup', 0, 0, 0, 1, true);
    } else if (m.t === 'kill') { this.onKill(m); }
    else if (m.t === 'proj') this.onProj(m);
    else if (m.t === 'fx') this.replayFx(m.a);
    else if (m.t === 'matchend') this.onMatchEnd(m);
    else if (m.t === 'ann') this.onAnn(m);
    else if (m.t === 'bodyend') this.bodies.end(m.i);
    else if (m.t === 'hash') this.checkHashes(m);
    else if (m.t === 'mst' || m.t === 'mev') this.onMapNet(m);
    else if (m.t === 'pend') this.vis.remove(m.i);
    else if (m.t === 'boom') {
      const [x, y, z] = m.p, [nx, ny, nz] = m.n, q = m.q === 1;
      this.vis.remove(m.i);
      if (m.w === 'rocket') {
        if (!m.d) game.fx.explosion(x, y, z, 3.0 * (q ? 2.4 : 1), q ? 0xff5a2a : 0xff7a1a, q ? 1.6 : 1, nx, ny, nz); else game.fx.bubbles(x, y, z, 4);
        if (game.audio) game.audio.play('explosion', x, y, z, (q ? 1.8 : 1) * (m.d ? 0.6 : 1));
      } else {
        if (!m.d) game.fx.plasmaHit(x, y, z, nx, ny, nz); else game.fx.bubbles(x, y, z, 0.8);
        if (game.audio) game.audio.play('plasmaHit', x, y, z, m.d ? 0.5 : 1);
      }
    }
  }

  send_ready() { this.link.send(true, P.encodeJson({ t: 'ready' })); }

  setRoster(r) {
    if (!r) return;
    this.roster.clear();
    for (const e of r) this.roster.set(e.id, e);
    for (const [id, a] of this.actors) { const e = this.roster.get(id); if (e) { a.name = e.name; } }
    if (this.hooks.onChange) this.hooks.onChange();
  }

  clearActors() { for (const a of this.actors.values()) a.dispose(); this.actors.clear(); }

  applyItems(s) {
    const items = this.game.items; if (!items || typeof s !== 'string') return;
    items.list.forEach((it, i) => { it.active = s[i] === '1'; it.mesh.visible = it.active && !it.hidden; });
  }

  async applyVox({ kind, bytes }) {
    const world = this.game.world;
    const raw = await inflate(bytes);
    if (kind === P.VOX_BODY) { this.bodies.spawn(P.decodeBodySpawn(raw)); return; }
    if (kind === P.VOX_DIFF) applyDiff(world, raw);
    else for (let o = 0; o + CHUNK_FULL <= raw.length; o += CHUNK_FULL) applyFullChunk(world, raw.subarray(o, o + CHUNK_FULL));
    this.stats.applied++;
  }

  // ---- anlik goruntu ----
  onUnreliable(buf) {
    const ty = new Uint8Array(buf, 0, 1)[0];
    if (ty === P.U_BODY) { if (this.worldReady) this.bodies.set(P.decodeBodies(buf)); return; }
    if (ty !== P.U_SNAP || !this.worldReady || !this.predictor) return;
    const s = P.decodeSnapshot(buf, true);
    if (this.lastSeq >= 0 && ((s.seq - this.lastSeq) & 0xffff) >= 0x8000) return;     // eski / tekrar
    this.lastSeq = s.seq;
    this.stats.snaps++;
    const game = this.game, now = performance.now();
    this.lastHostT = s.hostTime; this.lastRecv = now;
    game.matchTime = s.matchTime;
    const map = new Map(); for (const a of s.actors) map.set(a.id, a);
    this.snaps.push({ t: s.hostTime, actors: map });
    while (this.snaps.length > 12) this.snaps.shift();
    this.applySelf(s);
    if (!this.active) { this.active = true; }
  }

  applySelf(s) {
    const game = this.game, p = game.player, ws = p.weapons, st = s.self;
    const wasAlive = p.alive;
    p.health = st.health; p.armor = st.armor; p.quad = st.quad; p.protect = st.protectT; p.respawnTimer = st.respawn;
    for (let i = 0; i < 5; i++) ws.ammo[i] = st.ammo[i];
    for (const a of s.actors) if (a.id === this.myId) { p.frags = a.frags; p.deaths = a.deaths; }
    if (st.alive && !wasAlive) {
      p.alive = true; this.predictor.reset(); p.mover.setState(st.state);
      p.yaw = st.yaw; p.pitch = 0;
      p.recoil = 0; p.landDip = 0; p.fovKick = 0; p.deathT = 0; p.zoom = false; ws.has.fill(true);
      if (game.audio) game.audio.play('respawn', 0, 0, 0, 1, true);
    } else if (st.alive) {
      this.predictor.reconcile(st.state, s.ack);
    } else if (wasAlive) p.alive = false;
  }

  // ---- her kare (Game.update'ten) ----
  update(dt) {
    const game = this.game;
    if (!this.worldReady) return;
    this.predictor.decay(dt);
    this.vis.update(dt); this.meter.tick(dt, [this.link]);
    if (this.snaps.length) this.interpolate(dt);
    // esya animasyonu (yalniz gorsel)
    const items = game.items;
    if (items) for (const it of items.list) {
      if (!it.active || it.hidden) continue;
      const sp = it.mesh.userData.spin;
      sp.rotation.y = game.time * 1.6 + it.phase; sp.position.y = Math.sin(game.time * 2.4 + it.phase) * 0.08;
      it.mesh.position.set(it.pos.x, it.pos.y + 0.65, it.pos.z);
    }
  }

  interpolate(dt) {
    const game = this.game, snaps = this.snaps, rt = this.renderTime();
    let a = snaps[0], b = snaps[snaps.length - 1];
    for (let i = snaps.length - 1; i > 0; i--) if (snaps[i - 1].t <= rt) { a = snaps[i - 1]; b = snaps[i]; break; }
    const k = b.t > a.t ? Math.max(0, Math.min(1.5, (rt - a.t) / (b.t - a.t))) : 1;   // 1'in ustu: sinirli dis kestirim
    const seen = new Set();
    for (const [id, sb] of b.actors) {
      if (id === this.myId) continue;
      const sa = a.actors.get(id) || sb;
      seen.add(id);
      let na = this.actors.get(id);
      if (!na) {
        const r = this.roster.get(id) || { name: 'Bot ' + id, color: 0x888888, human: false };
        na = new NetActor(game, id, r.name, r.color, r.human);
        this.actors.set(id, na);
        game.actors.push(na);
      }
      const lerp = (x, y) => x + (y - x) * k;
      let dy = sb.yaw - sa.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      na.setState({
        x: lerp(sa.x, sb.x), y: lerp(sa.y, sb.y), z: lerp(sa.z, sb.z), vx: sb.vx, vy: sb.vy, vz: sb.vz,
        yaw: sa.yaw + dy * Math.min(1, k), pitch: lerp(sa.pitch, sb.pitch), flags: sb.flags, health: sb.health, weapon: sb.weapon, frags: sb.frags, deaths: sb.deaths,
      }, P.AF);
      na.updateModel(dt);
    }
    // anlik goruntude olmayanlari kaldir (cikan bot / oyuncu)
    for (const [id, na] of this.actors) if (!seen.has(id)) { na.dispose(); this.actors.delete(id); const i = game.actors.indexOf(na); if (i >= 0) game.actors.splice(i, 1); }
  }

  padFx(pd) {
    const g = this.game;
    g.fx.padBurst(pd.x, pd.y, pd.z);
    if (g.audio) g.audio.play('jumppad', pd.x, pd.y, pd.z, 1, true);
    g.player.fovKick = 6;
  }

  // ---- yerel oyuncu: Player.update'ten ----
  step(dt, cmd) {
    const c = this.predictor.step(dt, cmd);
    this.sent.push(c); if (this.sent.length > 3) this.sent.shift();
    this.link.send(false, P.encodeInput(this.sent, this.game.player.weapons.current));
  }

  // ates: yerel gorsel / ses hemen; asil isabet ev sahibinde (gecikme telafili)
  fire(origin, dir, muzzle) {
    const game = this.game, p = game.player, ws = p.weapons, W = ws.def;
    ws.consume();
    p.lastFireTime = game.time;
    this.shotSeq++;
    this.link.send(true, P.encodeJson({ t: 'fire', w: ws.current, o: [origin.x, origin.y, origin.z], d: [dir.x, dir.y, dir.z], n: this.shotSeq, ht: this.renderTime() }));
    // yerel gorsel: namlu alevi, ses; anlik silahlarda iz (dunyadaki ilk carpisma noktasina)
    game.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, W.color, W.id === 'shotgun' ? 1.6 : W.id === 'rocket' ? 1.3 : 1, true);
    if (game.audio) game.audio.play(W.sound, muzzle.x, muzzle.y, muzzle.z, 1, true);
    if (W.type === 'projectile') this.vis.spawn(-this.shotSeq, W.id, [origin.x + dir.x * 0.25, origin.y + dir.y * 0.25, origin.z + dir.z * 0.25], [dir.x * W.speed, dir.y * W.speed, dir.z * W.speed], true);
    if (W.type === 'hitscan' || W.type === 'rail') {
      const hit = game.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, W.range, _hit);
      const d = hit ? _hit.dist : W.range;
      if (W.type === 'rail') game.fx.rail(muzzle.x, muzzle.y, muzzle.z, origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d, W.color);
      else game.fx.tracer(muzzle.x, muzzle.y, muzzle.z, origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d, W.tracer);
    }
  }

  // olum akisi (herkese): HUD, yerel olum ekrani
  onKill(m) {
    this.stats.kills++;
    const game = this.game, hud = game.hud, me = game.player;
    const nm = (id) => id === this.myId ? me : this.actors.get(id) || null;
    const victim = nm(m.v) || { name: (this.roster.get(m.v) || {}).name || '?', color: m.c || 0x888888, isPlayer: false };
    const killer = m.k >= 0 ? (nm(m.k) || { name: (this.roster.get(m.k) || {}).name || '?', color: (this.roster.get(m.k) || {}).color || 0x888888, isPlayer: false }) : null;
    const label = t('k.' + killLabelId(m.w));
    const self = !killer || killer === victim;
    game.fx.robotGib(m.p[0], m.p[1], m.p[2], m.c || 0x888888, 0, 0, 0);
    if (game.audio) game.audio.play(victim === me ? 'playerDeath' : 'botDeath', m.p[0], m.p[1] + 1, m.p[2], 1, victim === me);
    if (victim === me && hud) { me.killer = killer && killer !== me ? killer : null; hud.death(killer ? killer.name : '', label, self, m.w); }
    if (hud) {
      const involves = victim === me || killer === me;
      if (self) hud.feed(null, victim, t(SELF_FEED[m.w] || 'blewUp'), involves); else hud.feed(killer, victim, label, involves);
      if (killer === me && !self) {
        hud.hitmarker('kill');
        const sp = m.w === 'drown' && game.iceSys.active ? 'iceKill' : KILLER_MSG[m.w];
        if (sp) hud.centerMsg(t(sp), 1.8); else hud.centerMsg(m.h ? t('headshot') : t('fragged'), 1.2);
      }
    }
    if (game.audio && killer === me && !self) game.audio.play('kill', 0, 0, 0, 1, true);
  }

  // maça girildi: Game.state'i oynanir yap
  begin() { this.begun = true; this.game.state = 'playing'; }

  // ev sahibinin chunk ozetleri: uyusmayan chunk tam icerikle yeniden istenir (kendini onarma)
  checkHashes(m) {
    if (!this.worldReady) return;
    const bad = [];
    for (let i = 0; i < m.c.length; i++) if (chunkHash(this.game.world, m.c[i]) !== m.h[i]) bad.push(m.c[i]);
    if (bad.length) { this.stats.resync = (this.stats.resync || 0) + bad.length; this.link.send(true, P.encodeJson({ t: 'resync', c: bad })); }
  }

  // harita sistemleri (P.MAP_NET_SYSTEMS): ev sahibinin durumu (mst) ve olaylari (mev) o sisteme
  onMapNet(m) {
    if (!this.worldReady || !P.MAP_NET_SYSTEMS.includes(m.s)) return;
    const s = this.game[m.s];
    if (!s || !s.active) return;
    try {
      if (m.t === 'mst') { if (s.applyNetState) s.applyNetState(m.v); }
      else if (s.onNetEvent) s.onNetEvent(m.e);
    } catch (e) { console.error('map net', m.s, e); }
  }

  onProj(m) {
    this.stats.proj = (this.stats.proj || 0) + 1;
    if (m.ow === this.myId && this.vis.adopt(m.w, m.i)) return;   // kendi mermimiz: yerel gorsel ev sahibinin kimligiyle eslesir
    this.vis.spawn(m.i, m.w, m.p, m.v, false);
  }

  // ev sahibinin efekt cagrilari (iz, kivilcim, namlu alevi, ray, debris) ayni argumanlarla
  replayFx(list) {
    const g = this.game, fx = g.fx;
    this.stats.fx = (this.stats.fx || 0) + list.length;
    for (const [k, a] of list) {
      try {
        if (k === 'd') {
          const arr = a[5], idx = new Int32Array(arr.length >> 1), mats = new Uint8Array(arr.length >> 1);
          for (let i = 0; i < idx.length; i++) { idx[i] = arr[i * 2]; mats[i] = arr[i * 2 + 1]; }
          fx.voxelDebris(g.world, idx, mats, idx.length, a[0], a[1], a[2], a[3], a[4]);
          continue;
        }
        const args = a.map((v) => (v === null ? undefined : v));
        if (k === 'm') {
          args[8] = false;
          const W = WEAPONS.find((w) => w.color === args[6]);
          if (W && g.audio) g.audio.play(W.sound, args[0], args[1], args[2], 1);
        } else if (k === 'i' && g.audio && Math.random() < 0.4) g.audio.impact(args[6], args[0], args[1], args[2]);
        fx[FX_FN[k]](...args);
      } catch (e) { console.warn('fx replay', k, e); }
    }
  }

  onMatchEnd(m) {
    const g = this.game;
    g.state = 'matchEnd'; g.endT = 7;
    const won = m.w === this.myId, name = (this.roster.get(m.w) || {}).name || '?';
    if (g.hud) { g.hud.centerMsg(won ? t('youWin') : t('winner', name), 6); g.hud.subMsg(t('newArenaSoon'), 6); }
  }

  onAnn(m) {
    const g = this.game;
    if (m.k === 'quadSpawn') { g.announce(t('quadSpawn'), t(m.w)); if (g.audio) g.audio.play('quadSpawn', 0, 0, 0, 1, true); }
    else if (m.k === 'quadPick') {
      const me = m.a === this.myId, name = (this.roster.get(m.a) || {}).name || '?';
      g.announce(me ? t('quadYou') : t('quadOther', name), me ? t('quadYouSub') : t('careful'));
    }
  }

  humanActors() { const out = []; for (const a of this.actors.values()) if (a.human && a.alive) out.push(a); return out; }
  updateTags(camera) { this.tags.update(camera, this.game.world, this.humanActors()); }
  infoLine() { return Math.round(this.link.rtt) + ' ms · ' + this.link.connType + ' · in ' + this.meter.inKB.toFixed(1) + ' / out ' + this.meter.outKB.toFixed(1) + ' KB/s'; }

  close() {
    this._ended = true;
    try { this.room.close(); } catch { /* */ }
    this.vis.clear(); this.bodies.clear(); this.tags.clear();
    this.clearActors();
    const g = this.game;
    if (g.net === this) { g.net = null; g.auth = true; }
  }
}
