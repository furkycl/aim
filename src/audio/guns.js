// Procedural weapon, impact and vehicle audio built on the shared Sfx context.
// A gunshot = transient crack (HP noise) + body thump (sine drop) + mid bark
// (BP noise) + room tail (convolver with a synthesised impulse response).

const PROFILES = {
  pistol: { crack: 0.9, crackHp: 1800, body: 0.45, bodyF: 140, mid: 0.5, midF: 1200, dur: 0.18, tail: 0.5 },
  smg: { crack: 0.8, crackHp: 2200, body: 0.35, bodyF: 160, mid: 0.45, midF: 1500, dur: 0.14, tail: 0.4 },
  rifle: { crack: 1.0, crackHp: 1400, body: 0.7, bodyF: 110, mid: 0.6, midF: 900, dur: 0.24, tail: 0.75 },
  sniper: { crack: 1.2, crackHp: 900, body: 1.0, bodyF: 70, mid: 0.7, midF: 600, dur: 0.42, tail: 1.0 },
  shotgun: { crack: 1.1, crackHp: 700, body: 1.0, bodyF: 80, mid: 0.8, midF: 500, dur: 0.36, tail: 0.95 },
};

export class GunAudio {
  constructor(sfx, settings) {
    this.sfx = sfx;
    this.settings = settings;
    this.ready = false;
    this.heliNodes = new Map();
  }

  _ctx() {
    if (!this.sfx._ensure()) return null;
    const c = this.sfx.ctx;
    if (!this.ready) this._build(c);
    return c;
  }

  _build(c) {
    this.ready = true;
    // reverb bus
    this.verb = c.createConvolver();
    this.verb.buffer = this._impulse(c, 1.4, 2.6);
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.sfx.sfx);
    // master compressor for punch
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 6; this.comp.attack.value = 0.002; this.comp.release.value = 0.12;
    this.comp.connect(this.sfx.sfx);
    this.comp.connect(this.verb);
    // noise buffer (reused)
    this.noise = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  _impulse(c, seconds, decay) {
    const n = c.sampleRate * seconds;
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // early reflections then exponential tail
        const early = i < c.sampleRate * 0.06 && Math.random() < 0.02 ? 1.2 : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early;
      }
    }
    return buf;
  }

  _noiseSrc(c, dur) {
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loopStart = Math.random() * 0.8; s.loop = false;
    s.start(c.currentTime, Math.random() * 0.7, dur);
    return s;
  }

  _env(c, g, peak, attack, dur, t0 = c.currentTime) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  shot(kind, { distance = 0, suppressed = false } = {}) {
    const c = this._ctx(); if (!c) return;
    const p = PROFILES[kind] || PROFILES.rifle;
    const t = c.currentTime;
    const vol = 0.9;

    // transient crack
    const n1 = this._noiseSrc(c, p.dur);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.crackHp * (0.9 + Math.random() * 0.2);
    const g1 = c.createGain(); this._env(c, g1, p.crack * vol, 0.001, p.dur * 0.45);
    n1.connect(hp).connect(g1).connect(this.comp);

    // mid bark
    const n2 = this._noiseSrc(c, p.dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.midF; bp.Q.value = 0.8;
    const g2 = c.createGain(); this._env(c, g2, p.mid * vol, 0.004, p.dur);
    n2.connect(bp).connect(g2).connect(this.comp);

    // body thump
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(p.bodyF * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(p.bodyF * 0.55, t + p.dur * 0.9);
    const g3 = c.createGain(); this._env(c, g3, p.body * vol, 0.003, p.dur * 1.1);
    o.connect(g3).connect(this.comp);
    o.start(t); o.stop(t + p.dur * 1.2);

    // mechanical click layer (bolt carrier)
    if (kind !== 'sniper' && kind !== 'shotgun') {
      const n3 = this._noiseSrc(c, 0.03);
      const hp2 = c.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 4000;
      const g4 = c.createGain(); this._env(c, g4, 0.25, 0.001, 0.03, t + 0.03);
      n3.connect(hp2).connect(g4).connect(this.sfx.sfx);
    }
    void distance; void suppressed;
  }

  _click(f, dur = 0.03, gain = 0.3, when = 0) {
    const c = this._ctx(); if (!c) return;
    const t = c.currentTime + when;
    const n = this._noiseSrc(c, dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.5;
    const g = c.createGain(); this._env(c, g, gain, 0.001, dur, t);
    n.connect(bp).connect(g).connect(this.sfx.sfx);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f * 0.5;
    const g2 = c.createGain(); this._env(c, g2, gain * 0.4, 0.001, dur * 0.8, t);
    o.connect(g2).connect(this.sfx.sfx); o.start(t); o.stop(t + dur);
  }

  empty() { this._click(2600, 0.04, 0.35); }

  reload(kind, duration) {
    // mag out, pause, mag in, chamber
    this._click(1800, 0.05, 0.3, 0.1);
    this._click(900, 0.08, 0.25, duration * 0.5);
    this._click(2200, 0.05, 0.4, duration * 0.72);
    if (kind === 'shotgun') { for (let i = 0; i < 4; i++) this._click(1500, 0.05, 0.3, 0.3 + i * (duration - 0.5) / 4); }
    if (kind === 'sniper') { this._click(1200, 0.07, 0.35, duration * 0.85); this._click(2400, 0.05, 0.35, duration * 0.95); }
    this._click(3000, 0.03, 0.3, duration * 0.92);
  }

  cycle(kind) {
    if (kind === 'pump') { this._click(900, 0.08, 0.5); this._click(1300, 0.06, 0.45, 0.16); }
    else { this._click(2000, 0.05, 0.4); this._click(1500, 0.07, 0.4, 0.22); this._click(2600, 0.04, 0.35, 0.42); }
  }

  shell(kind) {
    const c = this._ctx(); if (!c) return;
    const t = c.currentTime + 0.25 + Math.random() * 0.2;
    const f = kind === 'shotgun' ? 1800 : 5200 + Math.random() * 1500;
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (1 + i * 0.013);
      const g = c.createGain(); this._env(c, g, 0.06, 0.002, 0.09, t + i * 0.06);
      o.connect(g).connect(this.sfx.sfx); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.1);
    }
  }

  impact(kind, zone) {
    const c = this._ctx(); if (!c) return;
    const t = c.currentTime;
    if (kind === 'operator') {
      if (zone === 'head') {
        // helmet dink
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(1900, t + 0.12);
        const g = c.createGain(); this._env(c, g, 0.5, 0.002, 0.16);
        o.connect(g).connect(this.comp); o.start(t); o.stop(t + 0.18);
      }
      const n = this._noiseSrc(c, 0.08);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = zone === 'head' ? 900 : 500;
      const g = c.createGain(); this._env(c, g, zone === 'limb' ? 0.3 : 0.45, 0.002, 0.08);
      n.connect(lp).connect(g).connect(this.comp);
    } else if (kind === 'heli') {
      const n = this._noiseSrc(c, 0.1);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + Math.random() * 1500; bp.Q.value = 9;
      const g = c.createGain(); this._env(c, g, 0.5, 0.001, 0.12);
      n.connect(bp).connect(g).connect(this.comp);
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 180 + Math.random() * 60;
      const g2 = c.createGain(); this._env(c, g2, 0.15, 0.001, 0.05);
      o.connect(g2).connect(this.comp); o.start(t); o.stop(t + 0.06);
    } else {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.07);
      const g = c.createGain(); this._env(c, g, 0.3, 0.002, 0.1);
      o.connect(g).connect(this.sfx.sfx); o.start(t); o.stop(t + 0.12);
    }
  }

  kill(kind, headshot) {
    const c = this._ctx(); if (!c) return;
    const t = c.currentTime;
    if (kind === 'heli') return this.explosion();
    if (kind === 'operator') {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(headshot ? 1400 : 900, t); o.frequency.exponentialRampToValueAtTime(headshot ? 2100 : 1300, t + 0.1);
      const g = c.createGain(); this._env(c, g, 0.35, 0.003, 0.14);
      o.connect(g).connect(this.sfx.sfx); o.start(t); o.stop(t + 0.16);
      // body drop
      const n = this._noiseSrc(c, 0.3);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      const g2 = c.createGain(); this._env(c, g2, 0.35, 0.01, 0.3, t + 0.35);
      n.connect(lp).connect(g2).connect(this.comp);
    }
  }

  explosion() {
    const c = this._ctx(); if (!c) return;
    const t = c.currentTime;
    const n = this._noiseSrc(c, 1.4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.3);
    const g = c.createGain(); this._env(c, g, 1.2, 0.01, 1.4);
    n.connect(lp).connect(g).connect(this.comp);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    const g2 = c.createGain(); this._env(c, g2, 1.0, 0.01, 1.3);
    o.connect(g2).connect(this.comp); o.start(t); o.stop(t + 1.4);
    // debris tinkles
    for (let i = 0; i < 6; i++) this._click(2000 + Math.random() * 3000, 0.04, 0.15, 0.3 + Math.random() * 0.9);
  }

  // Helicopter rotor loop with stereo pan by target position.
  heliStart(id) {
    const c = this._ctx(); if (!c || this.heliNodes.has(id)) return;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const chop = c.createGain(); chop.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 17;
    const lfoG = c.createGain(); lfoG.gain.value = 0.4;
    lfo.connect(lfoG).connect(chop.gain);
    const turbine = c.createOscillator(); turbine.type = 'sawtooth'; turbine.frequency.value = 160;
    const tG = c.createGain(); tG.gain.value = 0.05;
    const tf = c.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1300; tf.Q.value = 3;
    const pan = c.createStereoPanner();
    const vol = c.createGain(); vol.gain.value = 0;
    src.connect(lp).connect(chop).connect(pan);
    turbine.connect(tG).connect(tf).connect(pan);
    pan.connect(vol).connect(this.sfx.sfx);
    src.start(); lfo.start(); turbine.start();
    vol.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.6);
    this.heliNodes.set(id, { src, lfo, turbine, pan, vol, lp });
  }

  heliUpdate(id, x, z, distance, dying) {
    const n = this.heliNodes.get(id); if (!n) return;
    const c = this.sfx.ctx;
    const ang = Math.atan2(x, -z);
    n.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, Math.sin(ang) * 1.3)), c.currentTime, 0.1);
    n.vol.gain.setTargetAtTime(Math.min(0.6, 14 / Math.max(6, distance)), c.currentTime, 0.2);
    if (dying) { n.lfo.frequency.setTargetAtTime(7, c.currentTime, 0.4); n.turbine.frequency.setTargetAtTime(60, c.currentTime, 0.5); }
  }

  heliStop(id) {
    const n = this.heliNodes.get(id); if (!n) return;
    const c = this.sfx.ctx;
    n.vol.gain.setTargetAtTime(0, c.currentTime, 0.15);
    setTimeout(() => { try { n.src.stop(); n.lfo.stop(); n.turbine.stop(); } catch { /* already stopped */ } }, 700);
    this.heliNodes.delete(id);
  }

  heliStopAll() { for (const id of [...this.heliNodes.keys()]) this.heliStop(id); }
}
