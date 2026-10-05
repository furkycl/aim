// Procedural sound effects via WebAudio — no asset files, nothing to fetch.
export class Sfx {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.amb = null;
    this._trackAcc = 0;
    settings.onChange(() => this._applyVolumes());
  }

  _ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._applyVolumes();
    this._startAmbient();
    return true;
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const a = this.settings.data.audio;
    this.master.gain.value = a.master;
    this.sfx.gain.value = a.sfx;
    if (this.ambGain) this.ambGain.gain.value = a.ambient ? 0.12 : 0;
  }

  unlock() { this._ensure(); }

  _startAmbient() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = 48;
    const oscG = c.createGain(); oscG.gain.value = 0.35;
    this.ambGain = c.createGain(); this.ambGain.gain.value = this.settings.data.audio.ambient ? 0.12 : 0;
    src.connect(lp).connect(this.ambGain);
    osc.connect(oscG).connect(this.ambGain);
    this.ambGain.connect(this.master);
    src.start(); osc.start();
  }

  _tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.1, gain = 0.3, attack = 0.003, curve = 'exp' }) {
    if (!this._ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur = 0.08, gain = 0.25, hp = 800) {
    if (!this._ensure()) return;
    const c = this.ctx, t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t);
  }

  shoot() {
    this._noise(0.07, 0.35, 1200);
    this._tone({ type: 'square', f0: 180, f1: 60, dur: 0.07, gain: 0.18 });
  }

  hit(streak = 1) {
    if (!this.settings.data.audio.hit) return;
    const base = 880 + Math.min(streak, 12) * 45;
    this._tone({ type: 'sine', f0: base, f1: base * 1.5, dur: 0.09, gain: 0.32, curve: 'lin' });
    this._tone({ type: 'triangle', f0: base * 2, f1: base * 2.2, dur: 0.05, gain: 0.12, curve: 'lin' });
    this._noise(0.05, 0.12, 3000);
  }

  miss() { this._tone({ type: 'sawtooth', f0: 140, f1: 70, dur: 0.12, gain: 0.12 }); }

  trackTick(dt) {
    this._trackAcc += dt;
    if (this._trackAcc > 0.1) { this._trackAcc = 0; this._tone({ type: 'sine', f0: 660, f1: 700, dur: 0.05, gain: 0.07, curve: 'lin' }); }
  }

  tick() { this._tone({ type: 'sine', f0: 520, f1: 520, dur: 0.08, gain: 0.2, curve: 'lin' }); }
  go() { this._tone({ type: 'sine', f0: 780, f1: 1040, dur: 0.18, gain: 0.3, curve: 'lin' }); }
  end() {
    this._tone({ type: 'sine', f0: 660, f1: 440, dur: 0.35, gain: 0.25, curve: 'lin' });
    setTimeout(() => this._tone({ type: 'sine', f0: 440, f1: 330, dur: 0.4, gain: 0.22, curve: 'lin' }), 160);
  }
  click() { this._tone({ type: 'square', f0: 900, f1: 700, dur: 0.03, gain: 0.08, curve: 'lin' }); }
}
