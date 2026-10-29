// Ag aktorleri.
//  NetActor    (konuk tarafi): ev sahibinden gelen anlik goruntuyle cizilen bot ya da baska insan. Yapay zeka, yikim ve
//              hasar mantigi calismaz; yalniz konum / yon / animasyon.
//  RemotePlayer (ev sahibi tarafi): bir konugun oyundaki aktoru. Konugun komutlari mover'i surer; botlar ve eşyalar onu
//              yerel oyuncu gibi gorur (Actor).
import { Actor } from '../game/actor.js';
import { BotModel } from '../game/botModel.js';

export class NetActor extends Actor {
  constructor(game, id, name, color, human) {
    super(game, id, name, color, false);
    this.human = !!human;
    this.model = new BotModel(color);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    this.firing = false;
    this.flagsHP = 0;
  }

  // s: enterpole edilmis durum {x,y,z,vx,vy,vz,yaw,pitch,flags,health,weapon,frags,deaths}
  setState(s, F) {
    const m = this.mover;
    m.pos.set(s.x, s.y, s.z); m.vel.set(s.vx, s.vy, s.vz);
    this.yaw = s.yaw; this.pitch = s.pitch;
    m.crouching = !!(s.flags & F.CROUCH); m.h = m.crouching ? 1.15 : 1.8;
    m.onGround = !!(s.flags & F.GROUND);
    this.alive = !!(s.flags & F.ALIVE);
    this.quad = (s.flags & F.QUAD) ? 1 : 0;
    this.protect = (s.flags & F.PROTECT) ? 1 : 0;
    this.health = s.health;
    this.weapons.current = Math.min(4, s.weapon);
    this.frags = s.frags; this.deaths = s.deaths;
    if (s.flags & F.FIRE) this.firing = true;
  }

  // her karede: modeli surup animasyonu ilerlet
  updateModel(dt) {
    const r = this.model.root, m = this.mover;
    if (!this.alive) { r.visible = false; return; }
    r.visible = true;
    r.position.set(m.pos.x, m.pos.y, m.pos.z);
    this.model.update({ dt, yaw: this.yaw, pitch: this.pitch, vx: m.vel.x, vz: m.vel.z, vy: m.vel.y, onGround: m.onGround, crouch: m.crouching, protect: this.protect, firing: this.firing });
    this.firing = false;
  }

  onHurt() { this.model.hit(); }

  dispose() { this.game.scene.remove(this.model.root); }
}

export class RemotePlayer extends Actor {
  constructor(game, id, name, color, guestId) {
    super(game, id, name, color, false);
    this.human = true;
    this.remote = guestId;      // konugun ag kimligi
    this.model = new BotModel(color);
    this.model.root.visible = false;
    game.scene.add(this.model.root);
    this.firing = false;
  }

  spawn(sp) {
    super.spawn(sp);
    this.model.root.visible = true;
    this.model.root.position.copy(this.mover.pos);
  }

  // her karede (ev sahibi): silah zamanlayicilari + model
  update(dt) {
    if (!this.alive) { this.model.root.visible = false; return; }
    this.weapons.update(dt);
    const m = this.mover, r = this.model.root;
    r.visible = true;
    r.position.set(m.pos.x, m.pos.y - m.stepSmooth, m.pos.z);
    this.model.update({ dt, yaw: this.yaw, pitch: this.pitch, vx: m.vel.x, vz: m.vel.z, vy: m.vel.y, onGround: m.onGround, crouch: m.crouching, protect: this.protect, firing: this.firing });
    this.firing = false;
  }

  onHurt() { this.model.hit(); }

  dispose() { this.game.scene.remove(this.model.root); }
}
