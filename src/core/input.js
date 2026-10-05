// Pointer-lock mouse input. Converts raw mouse counts into yaw/pitch deltas with
// the CS2 formula and feeds every event to Sentinel for forensics.

const PITCH_LIMIT = (89 * Math.PI) / 180;

export class Input {
  constructor(canvas, settings, sentinel) {
    this.canvas = canvas;
    this.settings = settings;
    this.sentinel = sentinel;
    this.locked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.firing = false;
    this.zoomed = false;
    this.lockedAt = 0;
    this.handlers = { fire: [], release: [], lock: [], unlock: [], key: [] };
    this._bind();
  }

  on(evt, fn) { this.handlers[evt].push(fn); }
  _emit(evt, ...args) { for (const fn of this.handlers[evt]) fn(...args); }

  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: this.settings.data.mouse.raw });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resetView() {
    this.yaw = 0;
    this.pitch = 0;
  }

  _bind() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockedAt = performance.now();
      document.body.classList.toggle('locked', this.locked);
      this.firing = false;
      this._emit(this.locked ? 'lock' : 'unlock');
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (!this.sentinel.acceptEvent(e)) return;
      const dx = e.movementX;
      const dy = e.movementY;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      // Browsers emit a bogus absolute-sized delta right after locking; drop the
      // first 120 ms of motion and any implausible single event.
      if (performance.now() - this.lockedAt < 120) return;
      if (Math.abs(dx) > 600 || Math.abs(dy) > 600) return;

      const s = this.settings;
      const mult = this.zoomed ? s.data.mouse.zoomSens : 1;
      const k = (s.degPerCount * Math.PI) / 180 * mult;
      this.yaw -= dx * k;
      this.pitch += (s.data.mouse.invert ? dy : -dy) * k;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      this.sentinel.recordMove(e, dx, dy, this.yaw, this.pitch);
    }, { passive: true });

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.sentinel.acceptEvent(e)) return;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) {
        this.firing = true;
        this.sentinel.recordClick(e, this.yaw, this.pitch);
        this._emit('fire', e);
      } else if (e.button === 2) {
        this.zoomed = true;
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (!this.sentinel.acceptEvent(e)) return;
      if (e.button === 0) { this.firing = false; this._emit('release', e); }
      if (e.button === 2) this.zoomed = false;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (!this.sentinel.acceptEvent(e)) return;
      if (e.repeat) return;
      this._emit('key', e);
    });
  }
}
