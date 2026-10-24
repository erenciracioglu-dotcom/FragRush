// Klavye/fare girisi + pointer lock. Fiziksel tus kodlari (event.code) kullanilir -> klavye duzeninden bagimsiz.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouseButtons = 0;
    this.mousePressed = 0;
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    this.enabled = true;
    this.virtual = new Set();      // test icin sanal tuslar
    this.virtualMouse = 0;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && e.code === 'KeyW')) e.preventDefault();
      if (e.code === 'F3' || e.code === 'F1') e.preventDefault();
      if (!e.repeat) this.pressedSet.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseButtons = 0; });
    const onMove = (e) => {
      if (!this.locked) return;
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    };
    // pointerrawupdate daha dusuk gecikme verir (Chrome)
    if ('onpointerrawupdate' in window) window.addEventListener('pointerrawupdate', onMove);
    else window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseButtons |= 1 << e.button;
      this.mousePressed |= 1 << e.button;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => { this.mouseButtons &= ~(1 << e.button); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.locked) { this.wheel += Math.sign(e.deltaY); } }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.keys.clear(); this.mouseButtons = 0; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { if (this.onLockChange) this.onLockChange(false, true); });
  }

  async lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) await p.catch(() => this.canvas.requestPointerLock());
    } catch (e) {
      try { this.canvas.requestPointerLock(); } catch (e2) { /* yok */ }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code) || this.virtual.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  mouseDown(b = 0) { return ((this.mouseButtons | this.virtualMouse) & (1 << b)) !== 0; }
  mouseHit(b = 0) { return (this.mousePressed & (1 << b)) !== 0; }
  consumeMouse() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.pressedSet.clear(); this.mousePressed = 0; }
}
