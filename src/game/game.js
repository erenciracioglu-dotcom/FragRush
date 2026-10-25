// Oyunun cekirdegi: render, dunya, tum alt sistemler ve mac akisi.
import * as THREE from 'three';
import { VS, WORLD, FLOOR_Y, MATCH, PLAYER } from '../config.js';
import { VoxelWorld } from '../world/voxelWorld.js';
import { LEVELS, resolveLevel } from '../world/levels.js';
import { MeshWorkers, ChunkManager } from '../world/chunkManager.js';
import { createVoxelMaterial, voxelUniforms } from '../world/voxelMaterial.js';
import { M } from '../world/materials.js';
import { createSky, createEnvironment } from '../fx/sky.js';
import { WaterSystem } from '../fx/water.js';
import { MEADOW_SKY, MEADOW_WATER, createHills } from '../fx/environments.js';
import { PostFX, QUALITY } from '../fx/post.js';
import { Effects } from '../fx/effects.js';
import { Destruction } from './destruction.js';
import { Projectiles } from './projectiles.js';
import { ViewModel } from './viewmodel.js';
import { Player } from './player.js';
import { Bot, BOT_DEFS, FAMILY_COUNT, SKILLS, DEFAULT_SKILL } from './bot.js';
import { t } from '../i18n.js';
import { Items, ITEM_TYPES } from './items.js';
import { NavGrid } from './nav.js';
import { padLaunchVelocity } from './mover.js';
import { WEAPONS } from './weapons.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

const KILL_IDS = new Set(['pulse', 'shotgun', 'plasma', 'rocket', 'rail', 'crush', 'world', 'drown']);
// statik nokta isiklari her haritada bu kadar (sayi degisirse tum malzemeler yeniden derlenir)
const STATIC_LIGHTS = 10;
const ARENA_ENV = { fog: 0x5d5a74, fogDensity: 0.0088, sun: 0xffdcb8, sunIntensity: 3.2, hemi: 0.38, envIntensity: 0.9 };

export class Game {
  constructor(canvas, settings, { hud, audio, input }) {
    this.canvas = canvas;
    this.settings = settings;
    this.hud = hud; this.audio = audio; this.input = input;
    this.time = 0;
    this.frame = 0;
    this.ready = false;
    this.state = 'loading';
    this.WEAPONS = WEAPONS;
    this.actors = [];
    this.bots = [];
    this.playerBias = 6;
    this.matchTime = MATCH.timeLimit;
    this.renderScale = 1;
    this.lastFps = 0;
    this.multiKill = { n: 0, t: -10 };
    this.attract = { t: 0 };
  }

  async init(onProgress = () => {}) {
    const T0 = performance.now(); this.ldt = {}; const mk = (k) => { this.ldt[k] = Math.round(performance.now() - T0); };
    this._mk = mk;
    const canvas = this.canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.info.autoReset = false;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 600);
    camera.rotation.order = 'YXZ';
    this.camera = camera;
    scene.add(camera);

    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 22), THREE.MathUtils.degToRad(218));
    this.sunDir = sunDir;
    this.sky = createSky(sunDir);
    scene.add(this.sky.mesh);
    this.arenaSunDir = sunDir.clone();
    scene.environment = createEnvironment(renderer, sunDir);
    this.envSunset = scene.environment;
    scene.environmentIntensity = ARENA_ENV.envIntensity;
    scene.fog = new THREE.FogExp2(new THREE.Color(ARENA_ENV.fog), ARENA_ENV.fogDensity);

    const center = new THREE.Vector3(WORLD.X * VS / 2, 0, WORLD.Z * VS / 2);
    this.center = center;
    const q = this.quality();
    const sun = new THREE.DirectionalLight(0xffdcb8, 3.2);
    sun.position.copy(center).addScaledVector(sunDir, 90);
    sun.target.position.copy(center);
    sun.castShadow = !new URLSearchParams(location.search).has('noshadow');
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const sc = sun.shadow.camera;
    sc.left = -54; sc.right = 54; sc.top = 54; sc.bottom = -54; sc.near = 10; sc.far = 200;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0x8a9ad8, 0x3a3030, ARENA_ENV.hemi);
    scene.add(this.hemi);
    this.hills = createHills(center);
    scene.add(this.hills);

    mk('setup');
    this.world = new VoxelWorld(WORLD.X, WORLD.Y, WORLD.Z);
    const nWorkers = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = new MeshWorkers(nWorkers);
    this.voxelMaterial = createVoxelMaterial();
    this.chunks = new ChunkManager(this.world, scene, this.voxelMaterial, this.workers);
    this.chunks.maxInflight = nWorkers * 3;
    this.fx = new Effects(this, q);
    this.destruction = new Destruction(this);
    this.projectiles = new Projectiles(this);
    this.viewmodel = new ViewModel(scene.environment, sunDir);
    this.player = new Player(this);
    this.nav = new NavGrid(this.world);
    this.staticLights = [];
    this.items = null;
    this.waterSys = new WaterSystem(this);

    mk('systems');
    await this.buildArena(this.settings.seed || ((Math.random() * 1e9) | 0), onProgress);
    mk('arena');

    this.post = new PostFX(renderer, scene, camera, this.settings.quality, this.viewmodel, this.waterSys.active ? this.waterSys : null);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    mk('post');
    this.createBots();
    this.startMatch(false);
    mk('bots');
    // shader isindirma: tum malzemeleri bir kez derle
    onProgress(0.97, t('ldShaders'));
    await nextFrame();
    this.warmup();
    mk('warmup');
    onProgress(1, t('ldReady'));
    this.ready = true;
  }

  quality() { return QUALITY[this.settings.quality] || QUALITY.ultra; }

  // tum efekt turlerini gorunmez sekilde bir kez cizip shader derlemesini oyundan once yap
  warmup() {
    const c = this.center;
    this.fx.explosion(c.x, -50, c.z, 2, 0xff7a1a, 0.2);
    this.fx.impact(c.x, -50, c.z, 0, 1, 0, M.CONCRETE, 1);
    this.fx.rail(c.x, -50, c.z, c.x + 1, -50, c.z);
    this.fx.debris.spawn(c.x, -50, c.z, 0, 0, 0, 0.2, 1, 1, 1, 0.1);
    this.fx.glowDebris.spawn(c.x, -50, c.z, 0, 0, 0, 0.2, 1, 1, 1, 0.1);
    for (const m of this.viewmodel.models) m.visible = true;
    // sonradan ortaya cikan nesneler (KIYAMET kuresi, roketler) de derlensin
    const tmp = [];
    if (this.items) for (const it of this.items.list) if (!it.mesh.visible) { it.mesh.visible = true; tmp.push(it.mesh); }
    const rockets = this.projectiles.prewarm(6);
    const r0 = rockets[0];
    r0.position.set(c.x, -50, c.z); this.scene.add(r0);
    // Not: asil cizim post-processing hedefine (lineer) yapiliyor; ekran (sRGB) icin derlemek yetmez.
    const rt = this.post.composer.inputBuffer;
    this.renderer.setRenderTarget(rt);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.viewmodel.scene, this.viewmodel.camera);
    this.renderer.setRenderTarget(null);
    // bir kez gercekten ciz (golge/derinlik malzemeleri ve post gecisleri de derlensin)
    try { this.post.render(0.016); } catch (e) { console.warn(e); }
    this.scene.remove(r0);
    for (const m of tmp) m.visible = false;
    for (const m of this.viewmodel.models) m.visible = false;
    this.viewmodel.current = -1;
    try { this.post.render(0.016); } catch (e) { console.warn(e); }
  }

  async buildArena(seed, onProgress = () => {}, map = null) {
    this.seed = seed;
    this.mapId = map && LEVELS[map] ? map : resolveLevel(this.settings.map, this.mapId);
    onProgress(0.05, t('ldArena'));
    await nextFrame();
    // eski durum temizligi
    this.fx.clear();
    this.destruction.reset();
    this.projectiles.clear();
    if (this.items) this.items.dispose();
    for (const L of this.staticLights) this.scene.remove(L.light);
    this.staticLights = [];
    const mk = this._mk || (() => {});
    mk('b0');
    this.arena = LEVELS[this.mapId].generate(this.world, seed);
    mk('gen');
    this.world.waterY = this.arena.water ? this.arena.water.y : -Infinity;
    this.applyEnvironment(this.arena);
    this.world.dirtyList = []; this.world.chunkDirty.fill(0);
    this.world.markAllDirty();
    this.world.version++;
    // statik isiklar
    const w = this.world;
    const defs = this.arena.lights.slice(0, STATIC_LIGHTS);
    while (defs.length < STATIC_LIGHTS) defs.push({ x: this.center.x, y: -60, z: this.center.z, color: 0x000000, intensity: 0, distance: 1 });
    for (const L of defs) {
      const pl = new THREE.PointLight(L.color, L.intensity, L.distance, 2);
      pl.position.set(L.x, L.y, L.z);
      this.scene.add(pl);
      const lamps = [];
      if (L.voxR) {
        const cx = Math.floor(L.x / VS), cy = Math.floor(L.y / VS), cz = Math.floor(L.z / VS);
        for (let y = cy - 2; y <= cy + 4; y++) for (let z = cz - 4; z <= cz + 4; z++) for (let x = cx - 4; x <= cx + 4; x++) {
          if (w.get(x, y, z) === M.LAMP) lamps.push(w.idx(x, y, z));
        }
      }
      this.staticLights.push({ light: pl, def: L, on: true, lamps, base: L.intensity });
    }
    // mesh
    const total = this.chunks.n;
    this.chunks.allocPerFrame = Infinity;
    this.chunks.update(this.center);
    while (this.chunks.pendingCount() > 0) {
      this.chunks.update(this.center);
      const done = total - this.chunks.pendingCount();
      onProgress(0.1 + 0.8 * done / total, t('ldMesh', done, total));
      await nextFrame();
    }
    this.chunks.allocPerFrame = 3;
    mk('mesh');
    onProgress(0.92, t('ldNav'));
    await nextFrame();
    this.nav.pads.clear();
    this.nav.buildAll();
    for (const p of this.arena.pads) this.nav.addPad(p.x, p.y, p.z, p.tx, p.ty, p.tz);
    mk('nav');
    this.items = new Items(this, this.arena.items);
    this.pads = this.arena.pads;
    this._attractCam = null;
    if (this.post) {
      this.post.setWater(this.waterSys.active ? this.waterSys : null);
      await this.warmLevel();
    }
  }

  // harita degisince yeni malzeme/gecis shader'larini (su, gokyuzu kupu, tepeler) oyundan once derle
  async warmLevel() {
    await nextFrame();
    try {
      if (this.waterSys.active) this.waterSys.update(0, this.camera);
      this.renderer.setRenderTarget(this.post.composer.inputBuffer);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.post.render(0.016);
    } catch (e) { console.warn(e); }
  }

  // map: 'arena' | 'meadow' (verilmezse ayara gore; 'rotate' sirayla)
  async newArena(onProgress, map = null) {
    this.state = 'loading';
    await this.buildArena((Math.random() * 1e9) | 0, onProgress, map);
    this.startMatch(false);
  }

  // gokyuzu, gunes, sis, ortam isigi ve su: haritanin ortamina gore
  applyEnvironment(arena) {
    const scene = this.scene, ws = this.waterSys, c = this.center;
    const meadow = arena.env === 'meadow';
    if (meadow) {
      // ?nowater: su cizimi kapali (yalnizca olcum icin; oyun kurallari ayni)
      if (new URLSearchParams(location.search).has('nowater')) ws.disable(); else ws.setup({ water: MEADOW_WATER, sky: MEADOW_SKY, y: arena.water.y, flow: arena.water.flow, depth: arena.water.depth, worldSize: [WORLD.X * VS, WORLD.Z * VS] }, this.settings.quality);
      if (!this._meadowEnv && !ws.sky) ws.setup({ water: MEADOW_WATER, sky: MEADOW_SKY, y: arena.water.y, flow: null, depth: null, worldSize: [WORLD.X * VS, WORLD.Z * VS] }, this.settings.quality), ws.disable();
      if (!this._meadowEnv) {
        const cubes = ws.skyCubes();
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const env = pmrem.fromCubemap(cubes.env).texture;
        pmrem.dispose();
        cubes.env.dispose();
        this._meadowEnv = { ...cubes, envMap: env };
      }
      const E = this._meadowEnv;
      scene.background = E.background;
      scene.environment = E.envMap;
      scene.environmentIntensity = 1.0;
      this.sky.mesh.visible = false;
      this.sunDir.set(E.sunDirection[0], E.sunDirection[1], E.sunDirection[2]).normalize();
      const sc = E.sunColor, mx = Math.max(sc[0], sc[1], sc[2], 1e-3);
      this.sun.color.setRGB(sc[0] / mx, sc[1] / mx, sc[2] / mx, THREE.LinearSRGBColorSpace);
      this.sun.intensity = Math.PI * mx;
      const h = E.horizon;
      scene.fog.color.setRGB(h[0] * 0.8, h[1] * 0.84, h[2] * 0.9, THREE.LinearSRGBColorSpace);
      scene.fog.density = 0.0048;
      this.hemi.intensity = 0;
      this.hills.visible = true;
    } else {
      ws.disable();
      scene.background = null;
      scene.environment = this.envSunset;
      scene.environmentIntensity = ARENA_ENV.envIntensity;
      this.sky.mesh.visible = true;
      this.sunDir.copy(this.arenaSunDir);
      this.sun.color.set(ARENA_ENV.sun);
      this.sun.intensity = ARENA_ENV.sunIntensity;
      scene.fog.color.set(ARENA_ENV.fog);
      scene.fog.density = ARENA_ENV.fogDensity;
      this.hemi.intensity = ARENA_ENV.hemi;
      this.hills.visible = false;
    }
    this.sun.position.copy(c).addScaledVector(this.sunDir, 90);
    this.sun.target.position.copy(c);
    this.viewmodel.scene.environment = scene.environment;
    for (const P of [this.fx.add, this.fx.smoke]) {
      P.uniforms.uFogDensity.value = scene.fog.density;
      P.uniforms.uFogColor.value.copy(scene.fog.color).convertSRGBToLinear();
    }
    if (this.audio) this.audio.setUnderwater(false);
  }

  botTarget() { return Math.max(0, Math.min(BOT_DEFS.length, this.settings.bots ?? MATCH.botCount)); }

  makeBot(slot) {
    const [name, color] = BOT_DEFS[this._botOrder[slot]];
    // zorlukta hafif cesitlilik
    const lvl = Math.max(0, Math.min(SKILLS.length - 1, (this.settings.difficulty ?? DEFAULT_SKILL) + (Math.random() < 0.2 ? -1 : Math.random() < 0.15 ? 1 : 0)));
    return new Bot(this, slot + 1, name, color, lvl);
  }

  createBots() {
    for (const b of this.bots) this.scene.remove(b.model.root);
    this.bots = [];
    // aile once, sonra digerleri karisik
    const rest = BOT_DEFS.map((d, i) => i).slice(FAMILY_COUNT).sort(() => Math.random() - 0.5);
    this._botOrder = [...Array(FAMILY_COUNT).keys(), ...rest];
    const n = this.botTarget();
    for (let i = 0; i < n; i++) this.bots.push(this.makeBot(i));
  }

  // bot sayisi ayari degisince: mac surerken botlari ekle / cikar (mac sifirlanmaz)
  syncBots() {
    const n = this.botTarget();
    if (!this._botOrder) { this.createBots(); return; }
    const inMatch = this.actors.length > 0;
    while (this.bots.length > n) {
      const b = this.bots.pop();
      b.alive = false;
      this.scene.remove(b.model.root);
      const i = this.actors.indexOf(b); if (i >= 0) this.actors.splice(i, 1);
      for (const o of this.bots) { if (o.target === b) o.target = null; o.mem.delete(b); }
      if (this.spectate === b) this.spectate = null;
    }
    while (this.bots.length < n) {
      const b = this.makeBot(this.bots.length);
      this.bots.push(b);
      if (inMatch) { this.actors.push(b); b.frags = 0; b.deaths = 0; b.spawn(this.pickSpawn(b)); }
    }
  }

  startMatch(withPlayer) {
    if (this.bots.length !== this.botTarget()) this.createBots();
    this.matchTime = MATCH.timeLimit;
    this.multiKill = { n: 0, t: -10 };
    this.fx.clear();
    this.projectiles.clear();
    if (this.items) this.items.reset();
    this.actors = withPlayer ? [this.player, ...this.bots] : [...this.bots];
    for (const a of [this.player, ...this.bots]) { a.frags = 0; a.deaths = 0; a.alive = false; }
    for (const b of this.bots) b.spawn(this.pickSpawn(b));
    if (withPlayer) { this.player.spawn(this.pickSpawn(this.player)); if (this.audio) this.audio.play('respawn', 0, 0, 0, 1, true); }
    this.state = withPlayer ? 'playing' : 'menu';
  }

  pickSpawn(actor) {
    const spawns = this.arena.spawns;
    const scored = spawns.map((s) => {
      let minD = 1e9;
      for (const a of this.actors) {
        if (a === actor || !a.alive) continue;
        const d = Math.hypot(a.mover.pos.x - s.x, a.mover.pos.y - s.y, a.mover.pos.z - s.z);
        if (d < minD) minD = d;
      }
      // zemin hala var mi
      const floor = this.world.solidAtWorld(s.x, s.y - 0.1, s.z);
      const blocked = this.world.boxSolid(s.x - 0.35, s.y + 0.05, s.z - 0.35, s.x + 0.35, s.y + 1.8, s.z + 0.35);
      return { s, score: Math.min(minD, 60) + Math.random() * 10 - (blocked ? 100 : 0) - (floor ? 0 : 5) };
    });
    scored.sort((a, b) => b.score - a.score);
    const s = scored[0].s;
    // gomuluyse yukari kaydir
    let y = s.y;
    for (let k = 0; k < 40 && this.world.boxSolid(s.x - 0.35, y + 0.02, s.z - 0.35, s.x + 0.35, y + 1.8, s.z + 0.35); k++) y += VS;
    return { x: s.x, y, z: s.z, yaw: s.yaw || 0 };
  }

  resize() {
    const q = this.quality();
    const w = window.innerWidth, h = window.innerHeight;
    const native = window.devicePixelRatio || 1;
    let dpr = native * q.scale * (this.settings.renderScale || 1);
    const pix = w * h * dpr * dpr;
    if (pix > q.maxPix) dpr *= Math.sqrt(q.maxPix / pix);
    this.renderScale = dpr / native;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.viewmodel.resize(w / h);
    this._fov = -1;
    this.setFov(this.settings.fov || 100);
    if (this.post) this.post.setSize(w, h); // composer CSS boyutu alir, piksel oranini kendisi uygular
  }

  setFov(hfov) {
    if (Math.abs(hfov - this._fov) < 0.01) return;
    this._fov = hfov;
    const a = this.camera.aspect;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfov) / 2) / a));
    this.camera.updateProjectionMatrix();
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.settings.quality = name;
    const q = this.quality();
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.post.setQuality(name);
    if (this.waterSys.active) this.waterSys.setQuality(name);
    this.fx.pm = q.particleMul; this.fx.dm = q.debrisMul;
    this.fx.debris.mesh.castShadow = q.debrisShadow;
    this.resize();
  }

  // -------------------------------------------------- olaylar
  onDamage(victim, attacker, dmg, dir, head, weaponId) {
    const hud = this.hud, audio = this.audio;
    if (victim.isPlayer) {
      if (this.post) this.post.hit(Math.min(1.2, dmg / 45));
      if (audio && attacker !== victim) audio.play('hurt', 0, 0, 0, Math.min(1.4, 0.5 + dmg / 60), true);
      if (attacker && attacker !== victim && hud) {
        const ap = attacker.mover.pos, vp = victim.mover.pos;
        const ang = Math.atan2(-(ap.x - vp.x), -(ap.z - vp.z));
        hud.damageDir(-(ang - victim.yaw));
      } else if (dir && hud) {
        const ang = Math.atan2(dir.x, dir.z);
        hud.damageDir(-(ang - victim.yaw));
      }
    } else if (victim.onHurt) victim.onHurt();
    if (attacker && attacker.isPlayer && victim !== attacker && hud) {
      hud.hitmarker(head ? 'head' : 'hit');
      if (audio) audio.play(head ? 'headshot' : 'hit', 0, 0, 0, 1, true);
    }
  }

  logEvent(s) {
    const ev = this.events || (this.events = []);
    ev.push(this.time.toFixed(1) + ' ' + s);
    if (ev.length > 24) ev.shift();
  }

  onKill(victim, killer, weaponId, head) {
    this.logEvent('kill ' + (killer ? killer.name : '-') + '>' + victim.name + ' ' + weaponId + (killer && killer.quad > 0 ? ' DOOM' : ''));
    const hud = this.hud, audio = this.audio;
    const label = t('k.' + (KILL_IDS.has(weaponId) ? weaponId : 'world'));
    if (killer && killer !== victim) { killer.frags++; killer.streak++; }
    else { victim.frags--; }
    const vp = victim.mover.pos;
    if (!victim.isPlayer) {
      this.fx.robotGib(vp.x, vp.y, vp.z, victim.color, victim.mover.vel.x, victim.mover.vel.y, victim.mover.vel.z);
      if (audio) audio.play('botDeath', vp.x, vp.y + 1, vp.z, 1);
      victim.model.root.visible = false;
    } else {
      this.fx.robotGib(vp.x, vp.y, vp.z, victim.color, 0, 0, 0);
      if (audio) audio.play('playerDeath', 0, 0, 0, 1, true);
      if (hud) hud.death(killer ? killer.name : '', label, !killer || killer === victim, weaponId);
    }
    if (hud) {
      const involves = victim.isPlayer || (killer && killer.isPlayer);
      if (!killer || killer === victim) hud.feed(null, victim, weaponId === 'crush' ? t('crushedFeed') : weaponId === 'drown' ? t('drownedFeed') : t('blewUp'), involves);
      else hud.feed(killer, victim, label, involves);
    }
    if (killer && killer.isPlayer && killer !== victim) {
      const mk = this.multiKill;
      if (this.time - mk.t < 2.6) mk.n++; else mk.n = 1;
      mk.t = this.time;
      if (audio) audio.play('kill', 0, 0, 0, 1, true);
      if (hud) {
        hud.hitmarker('kill');
        const msgs = { 2: t('multi2'), 3: t('multi3'), 4: t('multi4'), 5: t('multi5') };
        if (mk.n >= 2) hud.centerMsg(msgs[Math.min(5, mk.n)], 2.0);
        else if (weaponId === 'crush') hud.centerMsg(t('buried'), 1.8);
        else if (head) hud.centerMsg(t('headshot'), 1.4);
        else hud.centerMsg(t('fragged'), 1.2);
        const st = killer.streak;
        const sm = st === 5 ? ' · ' + t('streak5') : st === 10 ? ' · ' + t('streak10') : st === 15 ? ' · ' + t('streak15') : '';
        hud.subMsg(victim.name + '  ·  ' + t('fragCount', killer.frags) + sm, 1.8);
      }
    }
    if (killer && killer.frags >= MATCH.fragLimit && this.state === 'playing') this.endMatch();
  }

  // su olaylari: suya dusme (sicrama), yuzeyde hareket (halka), sudan cikis
  waterEvents(a, dt) {
    const ws = this.waterSys;
    if (!ws.active) return;
    const m = a.mover, p = m.pos, ev = m.events, L = this.world.waterY;
    if (ev.splash > 0) {
      const pw = Math.min(2.2, ev.splash / 8);
      this.fx.splash(p.x, L, p.z, pw);
      ws.ripple(p.x, p.z, 0.7, 0.06 * pw);
      if (this.audio) this.audio.play('splash', p.x, L, p.z, Math.min(1.5, 0.45 + pw * 0.5), a.isPlayer);
    }
    if (ev.waterJump) {
      this.fx.splash(p.x, L, p.z, 0.35);
      if (this.audio) this.audio.play('wade', p.x, L, p.z, 1.2, a.isPlayer);
    }
    if (m.inWater && p.y + m.h > L) {
      const sp = Math.hypot(m.vel.x, m.vel.z);
      a.rippleT = (a.rippleT || 0) - dt * (0.5 + sp * 0.6);
      if (a.rippleT <= 0) { a.rippleT = 0.55; ws.ripple(p.x, p.z, 0.35, 0.012 + Math.min(0.03, sp * 0.005)); }
    }
  }

  // bogulma hasari: hirilti + kabarcik
  onDrown(actor, dmg) {
    const p = actor.mover.pos;
    this.fx.bubbles(p.x, p.y + actor.mover.eyeHeight, p.z, 1.4);
    if (this.audio) this.audio.play('gurgle', p.x, p.y + 1.5, p.z, 1, actor.isPlayer);
  }

  // sudan bas cikti: uzun kaldiysa nefes nefese
  onSurface(actor, underT) {
    if (underT < 5 || !actor.alive) return;
    const p = actor.mover.pos;
    if (this.audio) this.audio.play('gasp', p.x, p.y + 1.6, p.z, Math.min(1.3, 0.5 + underT / 12), actor.isPlayer);
  }

  onPickup(actor, item) {
    if (item.type === 'quad') this.logEvent('quad ' + actor.name);
    const p = item.pos;
    if (actor.isPlayer) {
      if (this.hud) this.hud.subMsg(t('i.' + item.type), 1.4);
      if (this.audio) this.audio.play(item.type === 'quad' ? 'quad' : 'pickup', p.x, p.y, p.z, 1, true);
    } else if (this.audio) this.audio.play(item.type === 'quad' ? 'quad' : 'pickup', p.x, p.y, p.z, 0.7);
    if (item.type === 'quad') this.announce(actor.isPlayer ? t('quadYou') : t('quadOther', actor.name), actor.isPlayer ? t('quadYouSub') : t('careful'));
  }

  announce(title, sub) {
    if (!this.hud || this.state !== 'playing') return;
    this.hud.centerMsg(title, 2.2);
    if (sub) this.hud.subMsg(sub, 2.4);
  }

  // silah sesi: yakindaki botlar duyar
  noise(actor, pos, radius) {
    for (const b of this.bots) {
      if (b === actor || !b.alive) continue;
      const bp = b.mover.pos;
      if (Math.hypot(bp.x - pos.x, bp.z - pos.z) < radius) b.hear(actor, actor.mover.pos);
    }
  }

  // Kamp tespiti: oyuncu uzun sure kucuk bir alanda kalirsa konumu en yakin botlara acilir,
  // botlar gelir ve siperini patlatir. (Uzun sure saklanmak mumkun olmasin.)
  updateCamping(dt) {
    const p = this.player;
    if (this.state !== 'playing' || !p.alive) { this.camp = null; return; }
    const pos = p.mover.pos;
    const c = this.camp || (this.camp = { x: pos.x, z: pos.z, t: 0, ping: 0, warned: false });
    if (Math.hypot(pos.x - c.x, pos.z - c.z) > 7) { c.x = pos.x; c.z = pos.z; c.t = 0; c.warned = false; }
    else c.t += dt;
    c.ping -= dt;
    if (c.t > 10 && !c.warned) { c.warned = true; if (this.hud) this.hud.subMsg(t('campWarn'), 2.5); }
    if (c.t > 15 && c.ping <= 0) {
      c.ping = 7;
      const near = this.bots.filter((b) => b.alive).sort((a, b) => a.mover.pos.distanceToSquared(pos) - b.mover.pos.distanceToSquared(pos)).slice(0, 3);
      for (const b of near) {
        const r = b.memory(p);
        r.x = pos.x; r.y = pos.y; r.z = pos.z; r.t = this.time;
        b.breachT = Math.max(b.breachT, 2 + Math.random() * 2);
      }
      if (this.hud) this.hud.centerMsg(t('campReveal'), 1.8);
      if (this.audio) this.audio.play('scan', pos.x, pos.y, pos.z, 1, true);
      this.fx.scanPulse(pos.x, pos.y, pos.z);
    }
  }

  endMatch() {
    this.state = 'matchEnd';
    this.endT = 7;
    const sorted = [...this.actors].sort((a, b) => b.frags - a.frags);
    if (this.hud) { this.hud.centerMsg(sorted[0].isPlayer ? t('youWin') : t('winner', sorted[0].name), 6); this.hud.subMsg(t('newArenaSoon'), 6); }
  }

  // -------------------------------------------------- dongu
  update(dt) {
    this.time += dt;
    this.frame++;
    voxelUniforms.uTime.value = this.time;
    this.sky.uniforms.uTime.value = this.time;
    const st = this.state;
    if (st === 'loading') return;
    const paused = st === 'paused';
    if (!paused) {
      if (st === 'playing') {
        this.player.update(dt, this.input, this.settings);
        this.matchTime -= dt;
        if (this.matchTime <= 0) this.endMatch();
      } else if (this.input) this.input.consumeMouse();
      const P = this.prof || (this.prof = { bots: 0, proj: 0, destr: 0, items: 0, nav: 0, fx: 0, chunks: 0, n: 0 });
      let _t = performance.now(), _t2;
      for (const b of this.bots) b.update(dt);
      _t2 = performance.now(); P.bots = Math.max(P.bots, _t2 - _t); _t = _t2;
      for (const a of this.actors) {
        if (a.alive) {
          a.tickStats(dt);
          this.checkPads(a);
          this.waterEvents(a, dt);
          if (a.mover.pos.y < -4) a.takeDamage(999, null, 'world', null, false);
        } else {
          a.respawnTimer -= dt;
          const want = a.isPlayer ? (this.input && (this.input.mouseHit(0) || this.input.pressed('Space')) && a.respawnTimer <= 0) || a.respawnTimer < -2.5 : a.respawnTimer <= 0;
          if (want && st !== 'matchEnd') { a.spawn(this.pickSpawn(a)); if (this.audio) this.audio.play('respawn', a.mover.pos.x, a.mover.pos.y + 1, a.mover.pos.z, a.isPlayer ? 1 : 0.5, a.isPlayer); }
        }
      }
      _t = performance.now();
      this.updateCamping(dt);
      this.projectiles.update(dt);
      _t2 = performance.now(); P.proj = Math.max(P.proj, _t2 - _t); _t = _t2;
      this.destruction.update(dt);
      _t2 = performance.now(); P.destr = Math.max(P.destr, _t2 - _t); _t = _t2;
      this.items.update(dt);
      _t2 = performance.now(); P.items = Math.max(P.items, _t2 - _t); _t = _t2;
      this.nav.update();
      _t2 = performance.now(); P.nav = Math.max(P.nav, _t2 - _t); _t = _t2;
      this.checkLamps(dt);
      this.fx.update(dt);
      _t2 = performance.now(); P.fx = Math.max(P.fx, _t2 - _t); _t = _t2;
    }
    const _tc = performance.now();
    this.chunks.update(this.camera.position);
    if (this.prof) this.prof.chunks = Math.max(this.prof.chunks, performance.now() - _tc);
    // kamera
    this.fx.shake *= Math.exp(-dt * 6);
    if (st === 'playing' || (paused && this.actors.includes(this.player))) {
      this.player.updateCamera(this.camera, dt, this.settings, this.fx.shake);
    } else {
      this.attractCamera(dt);
    }
    this.camera.updateMatrixWorld();
    if (this.waterSys.active) {
      const med = this.waterSys.update(paused ? 0 : dt, this.camera);
      if (this.audio) this.audio.setUnderwater(this.waterSys.underwater);
      // tamamen su altindayken AO gereksiz (su ici sisin ustune golge dusurmesin)
      if (this.post && this.post.n8) this.post.n8.enabled = !(med && med.mode === 'water');
    }
    // nisangahtaki hedef (ad etiketi icin)
    this.aimTarget = null;
    if (st === 'playing' && this.player.alive && (this.frame & 3) === 0) {
      const o = this.camera.position, d = _v2.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
      const h = this._aimHit || (this._aimHit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 });
      const wd = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 90, h) ? h.dist : 90;
      let best = null, bt = wd;
      for (const a of this.bots) { const r = a.rayHit(o, d, bt); if (r) { bt = r.t; best = a; } }
      this._aimT = best;
    }
    if (st === 'playing') this.aimTarget = this._aimT || null;
    // gorus modeli
    const p = this.player, ws = p.weapons, m = p.mover;
    this.viewmodel.root.visible = st === 'playing' && p.alive;
    if (st === 'playing' && p.alive) {
      this.viewmodel.update(dt, {
        weapon: ws.current, switching: ws.pending >= 0 || m.eyesUnder ? 1 : 0, speed: Math.hypot(m.vel.x, m.vel.z), onGround: m.onGround,
        mdx: p.mdx, mdy: p.mdy, landed: m.events.landed ? m.landSpeed : 0, zoom: p.zoom, ammo: ws.ammo[ws.current],
      }, this.camera);
    }
    if (this.audio) this.audio.setListener(this.camera);
    if (st === 'matchEnd') {
      this.endT -= dt;
      if (this.endT <= 0 && !this._rebuilding) {
        this._rebuilding = true;
        this.buildArena((Math.random() * 1e9) | 0).then(() => { this._rebuilding = false; this.startMatch(true); });
      }
    }
    if (this.hud && st !== 'loading') this.hud.update(dt, this);
  }

  checkPads(a) {
    const m = a.mover;
    if (m.padLock > 0) return;
    for (const pd of this.pads) {
      const dx = m.pos.x - pd.x, dz = m.pos.z - pd.z;
      if (dx * dx + dz * dz > pd.radius * pd.radius) continue;
      if (m.pos.y < pd.y - 0.3 || m.pos.y > pd.y + 0.6) continue;
      padLaunchVelocity(pd, m.vel);
      m.onGround = false; m.groundTime = 1; m.padLock = 0.5;
      this.fx.padBurst(pd.x, pd.y, pd.z);
      if (this.audio) this.audio.play('jumppad', pd.x, pd.y, pd.z, 1, a.isPlayer);
      if (a.isPlayer) a.fovKick = 6;
    }
  }

  checkLamps(dt) {
    this._lampT = (this._lampT || 0) + dt;
    if (this._lampT < 0.4) return;
    this._lampT = 0;
    const w = this.world;
    for (const L of this.staticLights) {
      if (!L.on || !L.lamps.length) continue;
      let alive = 0;
      for (const i of L.lamps) if (w.mat[i] === M.LAMP) alive++;
      if (alive < L.lamps.length * 0.35) {
        L.on = false;
        L.light.intensity = 0;
        const p = L.light.position;
        this.fx.impact(p.x, p.y, p.z, 0, -1, 0, M.LAMP, 3);
        if (this.audio) this.audio.play('imp_glass', p.x, p.y, p.z, 1.5);
      }
    }
  }

  attractCamera(dt) {
    if (!this.benchMode) {
      const A = this.attract;
      A.switchT = (A.switchT ?? 8) - dt;
      if (A.switchT <= 0) {
        A.switchT = this.spectate ? 9 : 11;
        if (this.spectate) this.spectate = null;
        else {
          // en hareketli botu izle: hedefi olan
          const busy = this.bots.filter((b) => b.alive && b.mode === 'engage');
          const pool = busy.length ? busy : this.bots.filter((b) => b.alive);
          this.spectate = pool.length ? pool[(Math.random() * pool.length) | 0] : null;
        }
      }
    }
    const sp = this.spectate;
    if (sp) {
      if (!sp.alive) { const alive = this.bots.filter((b) => b.alive); if (alive.length) this.spectate = alive[(Math.random() * alive.length) | 0]; }
      const s = this.spectate;
      if (s && s.alive && this.benchFirstPerson) {
        const m = s.mover;
        this.camera.position.set(m.pos.x, m.pos.y + m.eyeHeight - m.stepSmooth, m.pos.z);
        this.camera.rotation.set(s.pitch, s.yaw, 0);
        this.setFov(this.settings.fov || 100);
        return;
      }
      if (s && s.alive) {
        const m = s.mover;
        // omuz ustu takip kamerasi (duvara girmesin diye geriye isin)
        const hx = m.pos.x, hy = m.pos.y + m.eyeHeight + 0.35, hz = m.pos.z;
        const sy = Math.sin(s.yaw), cy = Math.cos(s.yaw);
        const bx = sy * 0.9 + cy * 0.55, bz = cy * 0.9 - sy * 0.55; // geri + sag
        const bl = Math.hypot(bx, bz);
        const back = 2.6;
        const h = this._camHit || (this._camHit = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, dist: 0, mat: 0, i: 0 });
        let d = back;
        if (this.world.raycast(hx, hy, hz, bx / bl, 0.12, bz / bl, back + 0.3, h)) d = Math.max(0.2, h.dist - 0.3);
        const tx = hx + bx / bl * d, ty = hy + 0.12 * d, tz = hz + bz / bl * d;
        const cp = this.camera.position;
        const k = Math.min(1, dt * 10);
        if (cp.distanceToSquared(_v.set(tx, ty, tz)) > 25) cp.set(tx, ty, tz); else cp.lerp(_v, k);
        this.camera.rotation.set(s.pitch * 0.85 - 0.06, s.yaw, 0);
        this.setFov(95);
        return;
      }
    }
    const a = this.attract;
    a.t += dt;
    const t = a.t * 0.045;
    const c = this.center;
    // yuksekten genis yorunge: catilarin (11.5 m) ve antenin ustunde, tum arena gorunsun
    // (cayirda buyuk mesenin tacindan disarida, golu ve dereyi gorecek kadar genis)
    const O = this.mapId === 'meadow' ? { r: 31, y: 20, ty: 7, tr: 9 } : { r: 25, y: 19, ty: 2.5, tr: 4 };
    const r = O.r + Math.sin(a.t * 0.11) * 2;
    this.camera.position.set(c.x + Math.cos(t) * r, O.y + Math.sin(a.t * 0.07) * 1.5, c.z + Math.sin(t) * r);
    _v.set(c.x + Math.cos(t + 0.6) * O.tr, O.ty, c.z + Math.sin(t + 0.6) * O.tr);
    this.camera.lookAt(_v);
    this.setFov(this.settings.fov || 100);
  }

  render(dt) {
    this.sky.mesh.position.copy(this.camera.position);
    this.renderer.info.reset();
    this.post.render(dt);
  }
}

function nextFrame() { return new Promise((r) => requestAnimationFrame(() => r())); }
