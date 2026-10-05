// Settings store: defaults, persistence and CS-style derived values.
// The CS2 model: yaw degrees per mouse count = sensitivity × 0.022 (m_yaw).

const KEY = 'flick.settings.v1';
const M_YAW = 0.022;

export const DEFAULTS = Object.freeze({
  mouse: { sens: 1.0, dpi: 800, zoomSens: 1.0, invert: false, raw: true },
  crosshair: { style: 'cross', size: 6, thick: 2, gap: 4, color: '#00f0ff', outline: true, alpha: 1 },
  video: { fov: 90, bloom: true, particles: true, shake: true, scale: 1, fps: false },
  audio: { master: 0.7, sfx: 0.9, hit: true, ambient: true },
});

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function merge(base, over) {
  const out = clone(base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(base)) {
    if (over[k] && typeof base[k] === 'object') {
      for (const kk of Object.keys(base[k])) {
        if (kk in over[k] && typeof over[k][kk] === typeof base[k][kk]) out[k][kk] = over[k][kk];
      }
    }
  }
  return out;
}

function clampAll(s) {
  s.mouse.sens = Math.min(10, Math.max(0.05, +s.mouse.sens || 1));
  s.mouse.dpi = Math.min(32000, Math.max(100, Math.round(+s.mouse.dpi || 800)));
  s.mouse.zoomSens = Math.min(2, Math.max(0.1, +s.mouse.zoomSens || 1));
  s.crosshair.size = Math.min(30, Math.max(1, +s.crosshair.size));
  s.crosshair.thick = Math.min(8, Math.max(1, +s.crosshair.thick));
  s.crosshair.gap = Math.min(20, Math.max(0, +s.crosshair.gap));
  s.crosshair.alpha = Math.min(1, Math.max(0.2, +s.crosshair.alpha));
  s.video.fov = Math.min(120, Math.max(60, Math.round(+s.video.fov)));
  s.video.scale = [0.75, 1, 1.5].includes(+s.video.scale) ? +s.video.scale : 1;
  s.audio.master = Math.min(1, Math.max(0, +s.audio.master));
  s.audio.sfx = Math.min(1, Math.max(0, +s.audio.sfx));
  return s;
}

export class Settings {
  constructor() {
    this.listeners = new Set();
    this.data = clampAll(merge(DEFAULTS, this._read()));
  }

  _read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage may be unavailable */ }
    for (const fn of this.listeners) fn(this.data);
  }

  set(path, value) {
    const [a, b] = path.split('.');
    if (!(a in this.data) || !(b in this.data[a])) return;
    this.data[a][b] = value;
    clampAll(this.data);
    this.save();
  }

  reset() {
    this.data = clone(DEFAULTS);
    this.save();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ---- derived (CS2 scale) ----
  get degPerCount() { return this.data.mouse.sens * M_YAW; }
  get edpi() { return this.data.mouse.sens * this.data.mouse.dpi; }
  get inPer360() { return 360 / (this.degPerCount * this.data.mouse.dpi); }
  get cmPer360() { return this.inPer360 * 2.54; }

  // Horizontal FOV at 4:3 → vertical FOV (what three.js wants), as in Source engine.
  get verticalFov() {
    const h = (this.data.video.fov * Math.PI) / 180;
    return (2 * Math.atan(Math.tan(h / 2) * (3 / 4)) * 180) / Math.PI;
  }
}
