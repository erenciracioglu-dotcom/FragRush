// HUD: can/zirh/cephane, nisangah, isabet isareti, hasar yonu, olum akisi, mesajlar, skor tablosu.
import { WEAPONS } from '../game/weapons.js';
import { WATER } from '../config.js';
import { t } from '../i18n.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), hp: $('hpVal'), hpBar: $('hpBar'), ar: $('arVal'), arBar: $('arBar'),
      ammo: $('ammoVal'), wname: $('weaponName'), wlist: $('weaponList'),
      frag: $('fragVal'), rank: $('rankVal'), time: $('timeVal'),
      feed: $('killfeed'), center: $('center-msg'), sub: $('sub-msg'), power: $('powerup'),
      fps: $('fps'), cross: $('crosshair'), hit: $('hitmarker'), dmg: $('dmgdir'),
      nt: $('nametag'), ntName: $('ntName'), ntHp: $('ntHp'),
      sb: $('scoreboard'), sbt: $('sbTable'), death: $('death'), deathBy: $('deathBy'), deathTimer: $('deathTimer'), deathTitle: $('deathTitle'),
      air: $('air'), airLbl: $('airLbl'), airBar: $('airBar'), frost: $('frost'),
    };
    this.cache = {};
    this.wSpans = WEAPONS.map((W, i) => {
      const s = document.createElement('span');
      s.textContent = (i + 1) + ' ' + t('k.' + W.id);
      this.el.wlist.appendChild(s);
      return s;
    });
    this.centerT = 0; this.subT = 0; this.hitT = 0;
    this.showFps = false;
    this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; this.fpsText = '';
    this.worst = 0;
  }

  // dil degisince silah listesi ve onbellekli metinler yenilensin
  relabel() {
    WEAPONS.forEach((W, i) => { this.wSpans[i].textContent = (i + 1) + ' ' + t('k.' + W.id); });
    this.cache = {}; this._sbKey = null;
  }

  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    el[prop] = val;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }

  update(dt, game) {
    const p = game.player;
    const e = this.el;
    this.set('hp', e.hp, String(Math.max(0, Math.ceil(p.health))));
    this.set('hpw', e.hpBar.style, Math.max(0, Math.min(100, p.health / 2)) + '%', 'width');
    this.set('ar', e.ar, String(Math.max(0, Math.ceil(p.armor))));
    this.set('arw', e.arBar.style, Math.max(0, Math.min(100, p.armor / 1.5)) + '%', 'width');
    const low = p.alive && p.health <= 30;
    if (this.cache.low !== low) { this.cache.low = low; e.hp.parentElement.classList.toggle('low', low); }
    const ws = p.weapons;
    const cur = ws.pending >= 0 ? ws.pending : ws.current;
    const ammo = ws.ammo[cur];
    this.set('ammo', e.ammo, String(ammo));
    const al = ammo <= Math.max(2, WEAPONS[cur].ammoStart * 0.15);
    if (this.cache.al !== al) { this.cache.al = al; e.ammo.classList.toggle('low', al); }
    this.set('wn', e.wname, t('w.' + WEAPONS[cur].id));
    for (let i = 0; i < this.wSpans.length; i++) {
      const cls = (i === cur ? 'on' : '') + (ws.ammo[i] <= 0 ? ' empty' : '');
      this.set('ws' + i, this.wSpans[i], cls, 'className');
    }
    this.set('frag', e.frag, String(p.frags));
    this.rankT = (this.rankT || 0) - dt;
    if (this.rankT <= 0 || !this.sorted) {
      this.rankT = 0.25;
      this.sorted = [...game.actors].sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    }
    const sorted = this.sorted;
    const rank = sorted.indexOf(p) + 1;
    this.set('rank', e.rank, rank + '. / ' + sorted.length);
    const tl = Math.max(0, game.matchTime);
    const mm = Math.floor(tl / 60), ss = Math.floor(tl % 60);
    this.set('time', e.time, mm + ':' + String(ss).padStart(2, '0'));
    this.set('pw', e.power, p.quad > 0 ? t('quadHud', Math.ceil(p.quad)) : '');
    // nefes: su altindayken ya da dolarken
    const under = p.alive && p.mover.eyesUnder;
    const showAir = p.alive && (under || p.air < WATER.air);
    if (this.cache.air !== showAir) { this.cache.air = showAir; e.air.classList.toggle('hidden', !showAir); }
    if (showAir) {
      const out = p.air <= 0;
      this.set('airw', e.airBar.style, (p.air / WATER.air * 100).toFixed(1) + '%', 'width');
      this.set('airl', e.airLbl, out ? t('drowning') : t('air'));
      this.set('airc', e.air, out ? 'out' : p.air < 4 ? 'low' : '', 'className');
    }
    if (this.cache.nofire !== under) { this.cache.nofire = under; e.cross.classList.toggle('nofire', under); }
    // buz gibi su: ekran kenarinda kiragi
    const frost = game.iceSys && game.iceSys.active && p.alive ? Math.round((p.cold || 0) * 20) / 20 : 0;
    if (e.frost && this.cache.frost !== frost) { this.cache.frost = frost; e.frost.style.opacity = String(frost); }
    // nisangah acikligi
    const W = WEAPONS[cur];
    const spread = W.pellets > 1 ? W.spread : Math.min(W.spreadMax || 0, (W.spread || 0) + ws.heat);
    const gap = Math.round(5 + spread * 260 + (p.zoom ? -3 : 0));
    if (this.cache.gapv !== gap) { this.cache.gapv = gap; e.cross.style.setProperty('--gap', gap + 'px'); }
    // hedef ad etiketi
    const at = game.aimTarget;
    const showNt = !!(at && at.alive && p.alive);
    if (this.cache.nt !== showNt) { this.cache.nt = showNt; e.nt.classList.toggle('show', showNt); }
    if (showNt) {
      this.set('ntn', e.ntName, at.name);
      this.set('ntc', e.ntName.style, '#' + at.color.toString(16).padStart(6, '0'), 'color');
      this.set('nth', e.ntHp.style, Math.max(0, Math.min(100, at.health / 1.25)) + '%', 'width');
    }
    // zamanlayicilar
    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) e.center.classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) e.sub.classList.remove('show'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) e.hit.className = ''; }
    // olum ekrani
    const dead = !p.alive && game.state === 'playing';
    if (this.cache.dead !== dead) { this.cache.dead = dead; e.death.classList.toggle('hidden', !dead); }
    if (dead) {
      const rt = Math.max(0, p.respawnTimer);
      this.set('dt', e.deathTimer, rt > 0 ? t('respawnIn', rt.toFixed(1)) : t('respawnClick'));
    }
    // FPS
    this.fpsAcc += dt; this.fpsN++; this.fpsT += dt; this.worst = Math.max(this.worst, dt);
    if (this.fpsT >= 0.5) {
      const fps = this.fpsN / this.fpsAcc;
      const info = game.renderer.info.render;
      if (!this.gpuName) {
        try {
          const gl = game.renderer.getContext();
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          const raw = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
          const m = raw.match(/(NVIDIA[^(,]*|AMD[^(,]*|Radeon[^(,]*|Intel[^(,]*)/);
          this.gpuName = (m ? m[1] : raw).replace(/\s+\(0x[0-9A-Fa-f]+\)/, '').trim() || '?';
        } catch (e) { this.gpuName = '?'; }
      }
      this.fpsText = t('fps', fps.toFixed(0), (this.worst * 1000).toFixed(1), (info.triangles / 1000).toFixed(0), info.calls, this.gpuName, game.fx.debris.count, game.fx.add.count + game.fx.smoke.count, game.destruction.bodies.length, (game.renderScale * 100).toFixed(0));
      this.fpsAcc = 0; this.fpsN = 0; this.fpsT = 0; this.worst = 0;
      game.lastFps = fps;
    }
    this.set('fps', e.fps, this.showFps ? this.fpsText : '');
    // skor tablosu
    const showSb = game.input && game.input.down('Tab') && game.state === 'playing' || game.state === 'matchEnd';
    if (this.cache.sb !== showSb) { this.cache.sb = showSb; e.sb.classList.toggle('hidden', !showSb); }
    if (showSb) this.renderScoreboard(game, sorted);
  }

  renderScoreboard(game, sorted) {
    const key = sorted.map((a) => a.id + ':' + a.frags + ':' + a.deaths).join('|') + game.state;
    if (this.cache.sbKey === key) return;
    this.cache.sbKey = key;
    const rows = [`<tr><td></td><td>${t('sbPlayer')}</td><td class="n">${t('sbFrags')}</td><td class="n">${t('sbDeaths')}</td></tr>`];
    sorted.forEach((a, i) => {
      const c = '#' + a.color.toString(16).padStart(6, '0');
      rows.push(`<tr class="${a.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${c}"></span>${a.name}</td><td class="n">${a.frags}</td><td class="n">${a.deaths}</td></tr>`);
    });
    this.el.sbt.innerHTML = rows.join('');
  }

  centerMsg(text, t = 1.6) { const e = this.el.center; e.textContent = text; e.classList.add('show'); this.centerT = t; }
  subMsg(text, t = 2) { const e = this.el.sub; e.textContent = text; e.classList.add('show'); this.subT = t; }

  hitmarker(kind) {
    const e = this.el.hit;
    e.className = 'show' + (kind === 'kill' ? ' kill' : kind === 'head' ? ' head' : '');
    this.hitT = kind === 'kill' ? 0.25 : 0.12;
  }

  // hasar yonu: dunya acisi -> ekran donusu
  damageDir(angle) {
    const d = document.createElement('div');
    d.className = 'arc';
    d.style.transform = `rotate(${angle}rad)`;
    this.el.dmg.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; }, 350);
    setTimeout(() => d.remove(), 1000);
  }

  feed(killer, victim, weaponLabel, involvesPlayer) {
    const d = document.createElement('div');
    if (involvesPlayer) d.className = 'me';
    const col = (a) => '#' + a.color.toString(16).padStart(6, '0');
    if (!killer || killer === victim) d.innerHTML = `<b style="color:${col(victim)}">${victim.name}</b><span class="w">${weaponLabel || t('selfFeed')}</span>`;
    else d.innerHTML = `<b style="color:${col(killer)}">${killer.name}</b><span class="w">[${weaponLabel}]</span><b style="color:${col(victim)}">${victim.name}</b>`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  death(killerName, weaponLabel, self, weaponId) {
    const drown = weaponId === 'drown', lava = weaponId === 'lava', cold = weaponId === 'cold', icicle = weaponId === 'icicle', spaced = weaponId === 'spaced', domino = weaponId === 'domino';
    this.el.deathTitle.textContent = drown ? t('youDrowned') : lava ? t('youBurned') : cold ? t('youFroze') : icicle ? t('youIcicle') : spaced ? t('youSpaced') : domino ? t('youDomino') : self ? t('selfKill') : t('youDied');
    // ortam olumu: kendin dustuysen -1 notu, biri dusurduyse (buzu kirdiysa, ittiyse, kubbeyi deldiyse, dominoyu vurduysa) onun adi
    this.el.deathBy.textContent = (drown || lava || cold || icicle || spaced || domino) && self ? t('selfFragNote') : self ? '' : `${killerName} · ${weaponLabel}`;
  }
}
