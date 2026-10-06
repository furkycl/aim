import * as THREE from 'three';
import { TargetManager } from './targets.js';
import { Weapon } from './weapon.js';

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

const D2R = Math.PI / 180;

export class Game {
  constructor({ view, input, settings, sentinel, effects, audio, guns, hud, viewmodel }) {
    this.view = view;
    this.input = input;
    this.settings = settings;
    this.sentinel = sentinel;
    this.effects = effects;
    this.audio = audio;
    this.guns = guns;
    this.hud = hud;
    this.vm = viewmodel;
    this.state = State.MENU;
    this.mode = null;
    this.style = null;
    this.weaponDef = null;
    this.weapon = null;
    this.targets = null;
    this.listeners = { end: [], state: [] };
    this.stats = null;
    this.countdown = 0;
    this.timeLeft = 0;
    this.runId = 0;
    this.now = 0;
    this.onTargetSince = new Map(); // target -> time the crosshair entered it
    this.lastInputLook = { yaw: 0, pitch: 0 };
    this.lastShotLook = null;
    this.tmpDir = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();

    input.on('fire', () => this._onTriggerDown());
    input.on('release', () => this._onTriggerUp());
    input.on('unlock', () => { if (this.state === State.RUNNING || this.state === State.COUNTDOWN) this.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === State.RUNNING) this.pause();
    });
  }

  on(evt, fn) { this.listeners[evt].push(fn); }
  _emit(evt, ...a) { for (const fn of this.listeners[evt]) fn(...a); }
  _setState(s) { this.state = s; this._emit('state', s); }

  // Recoil-inclusive look angles (what the camera actually shows).
  get lookYaw() { return this.input.yaw + (this.weapon ? this.weapon.recoilYaw : 0); }
  get lookPitch() { return this.input.pitch + (this.weapon ? this.weapon.recoilPitch : 0); }
  get zoom() { return this.weapon && this.weapon.ads ? this.weaponDef.zoom : 1; }

  start(mode, style, weaponDef) {
    this.stop();
    this.mode = mode;
    this.style = style;
    this.weaponDef = weaponDef;
    this.runId++;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.rng = mulberry32(seed);
    this.stats = {
      mode: mode.id, style: style.id, weapon: weaponDef.id, seed,
      score: 0, hits: 0, kills: 0, misses: 0, shots: 0, headshots: 0, damage: 0,
      streak: 0, bestStreak: 0, reactions: [], trackOn: 0, trackTotal: 0,
      startedAt: 0, duration: mode.duration, endedAt: 0,
    };
    this.timeLeft = mode.duration;
    this.countdown = 3;
    this.input.resetView();
    this.onTargetSince.clear();
    this.lastShotLook = null;

    this.weapon = new Weapon(weaponDef, {
      onFire: (info) => this._onShot(info),
      onEmpty: () => this.guns.empty(),
      onReloadStart: (d) => { this.vm.onReloadStart(d); this.guns.reload(d.sound, d.reloadTime); this.hud.reloading(true); },
      onReloadEnd: () => { this.vm.onReloadEnd(); this.hud.reloading(false); this.hud.ammo(this.weapon.ammo, weaponDef.mag); },
      onCycle: (d) => { this.vm.onCycle(); this.guns.shell(d.sound); },
    });
    this.vm.equip(weaponDef);

    this.targets = new TargetManager(this.view.scene, mode, style, this.rng, {
      onSpawn: (t) => this._onSpawn(t),
      onHit: (t, point, info) => this._onHit(t, point, info),
      onKill: (t, point, reaction, info) => this._onKill(t, point, reaction, info),
      onMiss: () => this._onMiss(),
      onExpire: (t) => { this._onMiss(true); this._stopHeliAudio(t); },
      smoke: (p, n) => this.effects.smoke(p, n),
      fire: (p) => this.effects.fire(p),
    }, weaponDef);

    this.sentinel.beginRun({ runId: this.runId, mode: mode.id, kind: mode.kind, seed, style: style.id, weapon: weaponDef.id });
    this.view.showTargetFrame(style.id === 'sphere');
    this.hud.show(mode, style, weaponDef);
    this.hud.ammo(this.weapon.ammo, weaponDef.mag);
    this._setState(State.COUNTDOWN);
    this.input.requestLock();
  }

  stop() {
    if (this.targets) { this.targets.dispose(); this.targets = null; }
    this.guns.heliStopAll();
    this.effects.clear();
    this.vm.clearShells();
    this.vm.hide();
    this.weapon = null;
    this.hud.hide();
    this._setState(State.MENU);
  }

  pause() {
    if (this.state !== State.RUNNING && this.state !== State.COUNTDOWN) return;
    this.pausedFrom = this.state;
    if (this.weapon) this.weapon.release();
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

  reload() {
    if (this.state === State.RUNNING && this.weapon) this.weapon.reload();
  }

  _onTriggerDown() {
    if (this.state !== State.RUNNING || !this.weapon) return;
    this.weapon.press(this.now);
  }
  _onTriggerUp() { if (this.weapon) this.weapon.release(); }

  // A shot has been fired by the weapon state machine.
  _onShot(info) {
    const s = this.stats;
    s.shots++;
    this.vm.onFire(info);
    this.guns.shot(info.def.sound);
    this.effects.muzzle();
    if (info.def.cycle === 'bolt' || info.def.cycle === 'pump') {
      // bolt/pump animation + mechanical sound start right after the shot
      this.vm.onCycleStart(info.def);
      this.guns.cycle(info.def.cycle);
    } else {
      this.guns.shell(info.def.sound);
    }
    this.hud.ammo(info.ammo, info.def.mag);

    // Spread: build one deflected direction per pellet around the camera forward.
    const cam = this.view.camera;
    cam.updateMatrixWorld(true);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const dirs = [];
    const spreadRad = info.spreadDeg * D2R;
    for (let i = 0; i < info.pellets; i++) {
      // uniform in a cone: random angle, radius sqrt-distributed
      const r = spreadRad * Math.sqrt(this.rng());
      const a = this.rng() * Math.PI * 2;
      const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
      const d = fwd.clone().addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();
      dirs.push(d);
    }

    // Sentinel: spray control sample (input delta since previous shot vs recoil applied).
    if (this.lastShotLook && info.sprayIndex > 0) {
      this.sentinel.recordSpray({
        inputPitch: (this.input.pitch - this.lastShotLook.pitch) / D2R,
        inputYaw: (this.input.yaw - this.lastShotLook.yaw) / D2R,
        recoilPitch: this.lastShotLook.recoil.pitch,
        recoilYaw: this.lastShotLook.recoil.yaw,
        index: info.sprayIndex,
        auto: info.def.auto,
      });
    }
    this.lastShotLook = { yaw: this.input.yaw, pitch: this.input.pitch, recoil: info.recoil };

    const res = this.targets.applyShot(cam, info, dirs);
    if (res.hit) {
      s.hits++;
      this.sentinel.recordShotHit();
    }
  }

  _onSpawn(t) {
    this.effects.spawn(t);
    if (this.style.id === 'heli') this.guns.heliStart(t);
  }

  _stopHeliAudio(t) { if (this.style.id === 'heli') this.guns.heliStop(t); }

  _onHit(t, point, info) {
    const s = this.stats;
    const dmg = this.weaponDef.dmg * info.mult;
    s.damage += dmg;
    if (this.style.id !== 'sphere') s.score += Math.round(8 * info.mult);
    this.effects.hit(t, point, info.zone, this.style.id);
    this.guns.impact(this.style.id, info.zone);
    // Sentinel: time between the crosshair entering this target and the hit.
    // No sample means the crosshair arrived and the shot left within one frame.
    const since = this.onTargetSince.get(t);
    this.sentinel.recordHit({
      reaction: this.targets.time - t.born,
      dwell: since != null ? (this.now - since) * 1000 : 0,
      zone: info.zone,
      aimErr: info.aimErr,
      angR: info.angR,
    });
    this.hud.hitmark(info.zone === 'head');
  }

  _onKill(t, point, reaction, info) {
    const s = this.stats;
    s.kills++;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    let gain = this.style.kill;
    if (info.zone === 'head' && this.style.headshotBonus) { gain += this.style.headshotBonus; s.headshots++; }
    if (this.mode.kind === 'flick' || this.mode.kind === 'spider') {
      s.reactions.push(reaction);
      gain += Math.round(Math.max(0, 1 - Math.max(0, reaction - 0.18) / 0.8) * 100);
    } else if (this.mode.kind === 'shrink') {
      gain += Math.round(Math.max(0, 1 - reaction / this.mode.shrinkTime) * 120);
    }
    gain = Math.round(gain * (1 + Math.min(s.streak, 10) * 0.04));
    s.score += gain;
    this.sentinel.recordKill();
    this.effects.kill(t, point, s.streak, this.style.id);
    this.guns.kill(this.style.id, info.zone === 'head');
    this.audio.hit(s.streak);
    this.hud.hit(gain, s.streak, info.zone === 'head');
    this.onTargetSince.delete(t);
    this._stopHeliAudio(t);
  }

  _onMiss(expired = false) {
    const s = this.stats;
    if (!expired) s.misses++;
    s.streak = 0;
    s.score = Math.max(0, s.score - this.mode.missPenalty);
    this.sentinel.recordMiss();
    this.effects.miss();
    this.hud.miss();
  }


  update(dt, now) {
    this.now = now;
    if (this.state === State.COUNTDOWN) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const cur = Math.ceil(this.countdown);
      if (cur !== prev && cur > 0) { this.hud.countdown(cur); this.audio.tick(); }
      if (this.countdown <= 0) {
        this.hud.countdown('');
        if (!this.stats.startedAt) { this.stats.startedAt = now; this.targets.start(); }
        this.runClock = now;
        this._setState(State.RUNNING);
        this.audio.go();
      }
      this.vm.show();
      this.weapon.update(dt, now);
      return;
    }
    if (this.state !== State.RUNNING) return;

    const elapsed = now - this.runClock;
    this.runClock = now;
    const stalled = elapsed > 1;
    this.timeLeft -= stalled ? 0 : elapsed;
    this.sentinel.tickRun(stalled ? 0 : elapsed, stalled ? elapsed : 0);

    this.weapon.ads = this.input.zoomed;
    this.weapon.update(dt, now);
    const camPos = this.view.camera.getWorldPosition(new THREE.Vector3());
    this.targets.update(dt, camPos);

    // crosshair-on-target bookkeeping (triggerbot forensics + tracking stats)
    const h = this.targets.cast(this.view.camera);
    const onTarget = h ? h.target : null;
    for (const t of this.targets.targets) {
      if (t === onTarget) { if (!this.onTargetSince.has(t)) this.onTargetSince.set(t, now); }
      else this.onTargetSince.delete(t);
    }
    if (this.mode.kind === 'tracking') {
      this.stats.trackTotal += dt;
      if (this.input.firing) { this.stats.trackOn += onTarget ? dt : 0; this.sentinel.recordTrack(!!onTarget, dt); }
      this.hud.track(!!onTarget && this.input.firing);
    }

    // heli audio positions
    if (this.style.id === 'heli') {
      for (const t of this.targets.targets) this.guns.heliUpdate(t, t.root.position.x, t.root.position.z, t.root.position.length(), false);
      for (const r of this.targets.retiring) this.guns.heliUpdate(r.t, r.t.root.position.x, r.t.root.position.z, r.t.root.position.length(), true);
    }

    this.hud.update(this.timeLeft, this.stats);
    this.hud.spread(this.weapon.spread + (this.weapon.ads ? 0 : (this.weaponDef.spread.hipfire || 0)), this.weapon.ads);
    if (this.timeLeft <= 0) this._end(now);
  }

  _end(now) {
    const s = this.stats;
    s.endedAt = now;
    s.score = Math.round(s.score);
    s.accuracy = s.shots > 0 ? s.hits / s.shots : 0;
    if (this.mode.kind === 'tracking' && this.style.id === 'sphere') s.accuracy = s.shots > 0 ? s.hits / s.shots : 0;
    s.avgReaction = s.reactions.length ? s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length : null;
    s.kps = s.kills / this.mode.duration;
    s.hsRate = s.kills > 0 ? s.headshots / s.kills : 0;
    s.verdict = this.sentinel.endRun(s);
    this.input.releaseLock();
    this.hud.hide();
    if (this.targets) { this.targets.dispose(); this.targets = null; }
    this.guns.heliStopAll();
    this.effects.clear();
    this.vm.clearShells();
    this.vm.hide();
    this._setState(State.ENDED);
    this.audio.end();
    this._emit('end', s, this.mode, this.style, this.weaponDef);
  }
}
