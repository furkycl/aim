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
    this._lastScore = -1;
    this._streakT = 0;
  }

  show(mode) {
    this.root.classList.remove('hidden');
    this.modeEl.textContent = mode.name;
    this.streak.textContent = '';
    this.score.textContent = '0';
    this.acc.textContent = '100%';
    this.time.textContent = mode.duration.toFixed(1);
  }

  hide() { this.root.classList.add('hidden'); this.cd.textContent = ''; }

  countdown(v) {
    this.cd.textContent = v === '' ? '' : String(v);
    this.cd.classList.remove('pop'); void this.cd.offsetWidth; this.cd.classList.add('pop');
  }

  hit(gain, streak) {
    this.streak.textContent = streak >= 3 ? `×${streak}  +${gain}` : `+${gain}`;
    this.streak.style.color = streak >= 8 ? '#ff3b6b' : streak >= 4 ? '#ffe600' : '#e8ecf3';
    this.score.style.transform = 'scale(1.18)';
    setTimeout(() => (this.score.style.transform = ''), 90);
  }

  miss() {
    this.streak.textContent = 'ISKA';
    this.streak.style.color = '#7a8396';
  }

  track(on) {
    this.streak.textContent = on ? '● HEDEFTE' : '';
    this.streak.style.color = '#00ff6a';
  }

  update(timeLeft, s) {
    this.time.textContent = Math.max(0, timeLeft).toFixed(1);
    const sc = Math.round(s.score);
    if (sc !== this._lastScore) { this.score.textContent = String(sc); this._lastScore = sc; }
    let acc;
    if (s.mode === 'tracking') acc = s.shots > 0 ? s.trackOn / s.shots : 1;
    else acc = s.shots > 0 ? s.hits / s.shots : 1;
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
