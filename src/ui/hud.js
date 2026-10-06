// In-run heads-up display.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.time = $('hud-time');
    this.score = $('hud-score');
    this.acc = $('hud-acc');
    this.streak = $('hud-streak');
    this.modeEl = $('hud-mode');
    this.cd = $('hud-countdown');
    this.fps = $('fps');
    this.ammoEl = $('hud-ammo');
    this.ammoMag = $('hud-ammo-mag');
    this.weaponEl = $('hud-weapon');
    this.reloadEl = $('hud-reload');
    this.hs = $('hud-headshot');
    this.xh = $('crosshair');
    this.scope = $('scope');
    this._lastScore = -1;
    this._hsT = 0;
  }

  show(mode, style, weapon) {
    this.root.classList.remove('hidden');
    this.modeEl.textContent = `${mode.name} · ${style.name}`;
    this.weaponEl.textContent = weapon.name;
    this.streak.textContent = '';
    this.score.textContent = '0';
    this.acc.textContent = '100%';
    this.time.textContent = mode.duration.toFixed(1);
    this.reloadEl.classList.add('hidden');
    this.scope.classList.add('hidden');
    this._zoomWeapon = weapon.zoom > 1;
  }

  hide() { this.root.classList.add('hidden'); this.cd.textContent = ''; this.scope.classList.add('hidden'); }

  countdown(v) {
    this.cd.textContent = v === '' ? '' : String(v);
    this.cd.classList.remove('pop'); void this.cd.offsetWidth; this.cd.classList.add('pop');
  }

  ammo(cur, mag) {
    this.ammoEl.textContent = String(cur);
    this.ammoMag.textContent = `/ ${mag}`;
    this.ammoEl.classList.toggle('low', cur <= Math.max(1, Math.floor(mag * 0.2)));
  }

  reloading(on) { this.reloadEl.classList.toggle('hidden', !on); }

  hitmark(head) {
    const hm = $('hitmarker');
    hm.classList.remove('hit'); void hm.offsetWidth; hm.classList.add('hit');
    hm.classList.toggle('kill', false);
    hm.classList.toggle('head', !!head);
  }

  hit(gain, streak, head) {
    this.streak.textContent = streak >= 3 ? `×${streak}  +${gain}` : `+${gain}`;
    this.streak.style.color = streak >= 8 ? '#ff3b6b' : streak >= 4 ? '#ffe600' : '#e8ecf3';
    this.score.style.transform = 'scale(1.18)';
    setTimeout(() => (this.score.style.transform = ''), 90);
    if (head) { this.hs.classList.remove('show'); void this.hs.offsetWidth; this.hs.classList.add('show'); }
  }

  miss() {
    this.streak.textContent = 'ISKA';
    this.streak.style.color = '#7a8396';
  }

  track(on) {
    this.streak.textContent = on ? '● HEDEFTE' : '';
    this.streak.style.color = '#00ff6a';
  }

  // Dynamic crosshair: gap grows with spread; sniper shows a scope when zoomed.
  spread(spreadDeg, ads) {
    const px = Math.min(60, spreadDeg * 9);
    this.xh.style.setProperty('--spread', `${px}px`);
    const scoped = ads && this._zoomWeapon;
    this.scope.classList.toggle('hidden', !scoped);
    this.xh.style.visibility = scoped ? 'hidden' : 'visible';
  }

  update(timeLeft, s) {
    this.time.textContent = Math.max(0, timeLeft).toFixed(1);
    const sc = Math.round(s.score);
    if (sc !== this._lastScore) { this.score.textContent = String(sc); this._lastScore = sc; }
    const acc = s.shots > 0 ? s.hits / s.shots : 1;
    this.acc.textContent = `${Math.round(acc * 100)}%`;
  }

  showFps(on) { this.fps.classList.toggle('hidden', !on); }
  setFps(v) { this.fps.textContent = `${v} FPS`; }
}

let toastTimer = 0;
export function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
