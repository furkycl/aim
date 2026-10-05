import * as THREE from 'three';
import { TargetManager } from './targets.js';

// Deterministic PRNG so a run can be replayed/verified from its seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const State = Object.freeze({ MENU: 'menu', COUNTDOWN: 'countdown', RUNNING: 'running', PAUSED: 'paused', ENDED: 'ended' });

export class Game {
  constructor({ view, input, settings, sentinel, effects, audio, hud }) {
    this.view = view;
    this.input = input;
    this.settings = settings;
    this.sentinel = sentinel;
    this.effects = effects;
    this.audio = audio;
    this.hud = hud;
    this.state = State.MENU;
    this.mode = null;
    this.targets = null;
    this.listeners = { end: [], state: [] };
    this.stats = null;
    this.countdown = 0;
    this.timeLeft = 0;
    this.runId = 0;

    input.on('fire', () => this._onFire());
    input.on('unlock', () => { if (this.state === State.RUNNING || this.state === State.COUNTDOWN) this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === State.RUNNING) this.pause();
    });
  }

  on(evt, fn) { this.listeners[evt].push(fn); }
  _emit(evt, ...a) { for (const fn of this.listeners[evt]) fn(...a); }
  _setState(s) { this.state = s; this._emit('state', s); }

  start(mode) {
    this.stop();
    this.mode = mode;
    this.runId++;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.rng = mulberry32(seed);
    this.stats = {
      mode: mode.id, seed, score: 0, hits: 0, misses: 0, shots: 0, streak: 0, bestStreak: 0,
      reactions: [], trackOn: 0, trackTotal: 0, startedAt: 0, duration: mode.duration, endedAt: 0,
    };
    this.timeLeft = mode.duration;
    this.countdown = 3;
    this.input.resetView();
    this.targets = new TargetManager(this.view.scene, mode, this.rng, {
      onSpawn: (t) => this.effects.spawn(t),
      onKill: (t, point, reaction) => this._onKill(t, point, reaction),
      onMiss: () => this._onMiss(),
      onExpire: () => this._onMiss(true),
    });
    this.sentinel.beginRun({ runId: this.runId, mode: mode.id, kind: mode.kind, seed });
    this.hud.show(mode);
    this._setState(State.COUNTDOWN);
    this.input.requestLock();
  }

  stop() {
    if (this.targets) { this.targets.dispose(); this.targets = null; }
    this.effects.clear();
    this.hud.hide();
    this._setState(State.MENU);
  }

  pause() {
    if (this.state !== State.RUNNING && this.state !== State.COUNTDOWN) return;
    this.pausedFrom = this.state;
    this._setState(State.PAUSED);
    this.sentinel.pause();
  }

  resume() {
    if (this.state !== State.PAUSED) return;
    this.runClock = performance.now() / 1000;
    this.input.requestLock();
    this.countdown = Math.max(this.countdown, 1);
    this._setState(State.COUNTDOWN);
    this.sentinel.resume();
  }

  _onFire() {
    if (this.state !== State.RUNNING) return;
    if (this.mode.kind === 'tracking') return; // handled per-frame
    this.stats.shots++;
    this.effects.muzzle();
    this.audio.shoot();
    this.targets.shoot(this.view.camera);
  }

  _onKill(t, point, reaction) {
    const s = this.stats;
    s.hits++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    let gain = this.mode.hitScore;
    if (this.mode.kind === 'flick' || this.mode.kind === 'spider') {
      s.reactions.push(reaction);
      gain += Math.round(Math.max(0, 1 - Math.max(0, reaction - 0.18) / 0.8) * 100);
    } else if (this.mode.kind === 'shrink') {
      gain += Math.round((1 - t.mesh.scale.x) * 120);
    }
    gain = Math.round(gain * (1 + Math.min(s.streak, 10) * 0.04));
    s.score += gain;
    // Angular error between the aim ray and the target centre, for forensics.
    const cam = this.view.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const toT = t.mesh.position.clone().sub(camPos);
    const dist = toT.length();
    const aimErr = fwd.angleTo(toT);
    const angR = Math.atan2(t.radius * t.mesh.scale.x, dist);
    this.sentinel.recordHit({ reaction, aimErr, angR });
    this.effects.kill(t, point, s.streak);
    this.audio.hit(s.streak);
    this.hud.hit(gain, s.streak);
  }

  _onMiss(expired = false) {
    const s = this.stats;
    if (!expired) s.misses++;
    s.streak = 0;
    s.score = Math.max(0, s.score - this.mode.missPenalty);
    this.sentinel.recordMiss();
    this.effects.miss();
    this.audio.miss();
    this.hud.miss();
  }

  update(dt, now) {
    if (this.state === State.COUNTDOWN) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const cur = Math.ceil(this.countdown);
      if (cur !== prev && cur > 0) { this.hud.countdown(cur); this.audio.tick(); }
      if (this.countdown <= 0) {
        this.hud.countdown('');
        if (!this.stats.startedAt) { this.stats.startedAt = now; this.targets.start(); }
        this.runClock = now; // wall-clock anchor; pauses re-anchor it
        this._setState(State.RUNNING);
        this.audio.go();
      }
      return;
    }
    if (this.state !== State.RUNNING) return;

    // Wall-clock timer: a throttled or stalled renderer never buys extra game time.
    const elapsed = now - this.runClock;
    this.runClock = now;
    this.timeLeft -= elapsed > 1 ? 0 : elapsed; // a >1 s stall is treated as a pause, not free time
    this.targets.update(dt);

    if (this.mode.kind === 'tracking') {
      const r = this.targets.track(this.view.camera, dt);
      this.stats.trackTotal += dt;
      if (this.input.firing) {
        this.stats.shots += dt;
        if (r.on) {
          this.stats.trackOn += dt;
          this.stats.score += this.mode.trackScorePerSec * dt;
          this.stats.streak += dt;
          this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
          this.effects.trackSpark(r.point);
          this.audio.trackTick(dt);
          this.sentinel.recordTrack(true, dt);
        } else {
          this.stats.streak = 0;
          this.sentinel.recordTrack(false, dt);
        }
      } else {
        this.stats.streak = 0;
      }
      this.hud.track(r.on && this.input.firing);
    }

    this.hud.update(this.timeLeft, this.stats);
    if (this.timeLeft <= 0) this._end(now);
  }

  _end(now) {
    const s = this.stats;
    s.endedAt = now;
    s.score = Math.round(s.score);
    if (this.mode.kind === 'tracking') {
      s.accuracy = s.trackTotal > 0 ? s.trackOn / Math.max(1e-6, Math.min(s.trackTotal, s.shots || 1e-6)) : 0;
      s.accuracy = Math.min(1, s.trackOn / Math.max(1e-6, s.shots));
    } else {
      s.accuracy = s.shots > 0 ? s.hits / s.shots : 0;
    }
    s.avgReaction = s.reactions.length ? s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length : null;
    s.kps = s.hits / this.mode.duration;
    s.verdict = this.sentinel.endRun(s);
    this.input.releaseLock();
    this.hud.hide();
    if (this.targets) { this.targets.dispose(); this.targets = null; }
    this.effects.clear();
    this._setState(State.ENDED);
    this.audio.end();
    this._emit('end', s, this.mode);
  }
}
