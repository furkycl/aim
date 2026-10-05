import { pristine } from './preload.js';
import { Forensics } from './forensics.js';
import { Integrity } from './integrity.js';
import { Signer } from './signer.js';

// Sentinel — FLICK's anti-cheat layer.
//
//  • Only trusted (hardware-generated) input is accepted; synthetic events are
//    dropped and invalidate the run.
//  • The mouse stream is analysed statistically for aimbots, triggerbots,
//    autoclickers and scripted motion.
//  • Native browser APIs, the DOM and the clock are checked for tampering.
//  • Runs are signed so stored scores cannot be edited by hand.
//
// Everything lives in private fields; the instance and prototype are frozen.

const VERSION = '1.0.0';

export class Sentinel {
  #integrity;
  #signer;
  #forensics = null;
  #run = null;
  #timer = 0;
  #paused = false;
  #verdictHandlers = [];
  #lastMoveT = 0;
  #fatalAnnounced = false;
  #frameTimes = [];
  #settings;

  constructor(settings) {
    this.#settings = settings;
    this.#integrity = new Integrity();
    this.#signer = new Signer();
    this.#integrity.fullScan();
    Object.freeze(this);
  }

  get version() { return VERSION; }
  get signer() { return this.#signer; }

  // Boot-time health for the menu badge.
  bootStatus() {
    const f = this.#integrity.findings;
    if (f.some((x) => x.severity === 'fatal')) return { level: 'bad', text: 'SENTINEL · ortam güvensiz' };
    if (f.length) return { level: 'warn', text: 'SENTINEL · uyarı' };
    return { level: 'ok', text: `SENTINEL · aktif v${VERSION}` };
  }

  onVerdict(fn) { this.#verdictHandlers.push(fn); }

  // ---- input gate -------------------------------------------------------
  acceptEvent(e) {
    let trusted = false;
    try {
      // isTrusted is an unforgeable own accessor on every Event. Verify the
      // accessor is the native one (or at least native code) before trusting it.
      const d = Object.getOwnPropertyDescriptor(e, 'isTrusted');
      const getter = d && d.get;
      const genuine = typeof getter === 'function' && (getter === pristine.isTrustedGetter || this.#integrity.isNative(getter));
      trusted = genuine && getter.call(e) === true;
    } catch { trusted = false; }
    if (!trusted) {
      if (this.#forensics) {
        this.#forensics.untrusted++;
        this.#fatal('synthetic-input', `sentetik ${e.type} olayı`);
      }
      return false;
    }
    return true;
  }

  recordMove(e, dx, dy) {
    if (!this.#forensics || this.#paused) return;
    // movementX/Y read through pristine getters; a mismatch means the event was altered.
    if (pristine.movementXGetter) {
      const rx = pristine.movementXGetter.call(e), ry = pristine.movementYGetter.call(e);
      if (rx !== dx || ry !== dy) { this.#fatal('event-tamper', 'movementX/Y değiştirilmiş'); return; }
    }
    const t = pristine.perfNow();
    this.#lastMoveT = t;
    this.#forensics.move(t, dx, dy);
  }

  recordClick(e, yaw, pitch) {
    if (!this.#forensics || this.#paused) return;
    this.#forensics.click(pristine.perfNow(), yaw, pitch);
  }

  recordHit({ reaction, aimErr, angR }) {
    if (!this.#forensics) return;
    this.#forensics.hit(pristine.perfNow(), reaction, aimErr, angR, this.#settings.degPerCount);
    this.#run.hits++;
  }

  recordMiss() { if (this.#run) this.#run.misses++; }

  recordTrack(on, dt) { if (this.#forensics) this.#forensics.track(on, dt); }

  // ---- run lifecycle ----------------------------------------------------
  beginRun({ runId, mode, seed, kind }) {
    this.#forensics = new Forensics({ id: mode, kind });
    this.#run = { runId, mode, seed, nonce: this.#signer.nonce(), startP: pristine.perfNow(), startD: pristine.dateNow(), pausedMs: 0, pauseAt: 0, hits: 0, misses: 0, probes: 0 };
    this.#paused = false;
    this.#fatalAnnounced = false;
    this.#frameTimes.length = 0;
    this.#integrity.resetWarnings();
    this.#integrity.fullScan();
    this.#integrity.sampleClock();
    this.#announceIfFatal();
    this.#timer = pristine.setInterval.call(globalThis, () => this.#probe(), 2000);
  }

  pause() {
    if (!this.#run || this.#paused) return;
    this.#paused = true;
    this.#run.pauseAt = pristine.perfNow();
  }

  resume() {
    if (!this.#run || !this.#paused) return;
    this.#paused = false;
    this.#run.pausedMs += pristine.perfNow() - this.#run.pauseAt;
  }

  // Called once per animation frame while a run is active.
  tick(dt) {
    if (!this.#run || this.#paused) return;
    this.#frameTimes.push(dt);
    if (this.#frameTimes.length > 600) this.#frameTimes.shift();
  }

  #probe() {
    if (!this.#run || this.#paused) return;
    this.#run.probes++;
    this.#integrity.checkNatives();
    this.#integrity.sampleClock();
    if (this.#run.probes % 2 === 0) this.#integrity.probeDevtools();
    if (this.#run.probes % 5 === 0) this.#integrity.checkEnvironment();
    this.#announceIfFatal();
  }

  #fatal(code, detail) {
    this.#integrity.findings.push({ code, severity: 'fatal', detail });
    this.#announceIfFatal();
  }

  #announceIfFatal() {
    if (this.#fatalAnnounced || !this.#run) return;
    const fatal = this.#integrity.findings.filter((f) => f.severity === 'fatal');
    if (!fatal.length) return;
    this.#fatalAnnounced = true;
    const v = {
      status: 'invalid', severity: 'fatal',
      reasons: fatal.map((f) => `${f.code}: ${f.detail}`),
      message: 'Bu koşu durduruldu. Sentinel, oyunun dışından müdahale ya da insan dışı giriş tespit etti.',
    };
    for (const fn of this.#verdictHandlers) fn(v);
  }

  endRun(stats) {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = 0; }
    const run = this.#run;
    const reasons = [];
    let severity = 'none';
    const bump = (s) => { if (s === 'fatal' || (s === 'warn' && severity !== 'fatal')) severity = s; };

    if (!run) return { status: 'invalid', severity: 'fatal', reasons: ['no-run'], message: '' };

    // Wall-clock duration must match the run duration (speedhack / frame injection).
    const elapsed = (pristine.perfNow() - run.startP - run.pausedMs) / 1000;
    const expected = stats.duration + 3; // + countdown
    if (Math.abs(elapsed - expected) > Math.max(2.5, expected * 0.12)) {
      reasons.push(`timing: beklenen ${expected.toFixed(0)}s, ölçülen ${elapsed.toFixed(1)}s`); bump('fatal');
    }
    // Frame pacing: a frame budget of <2 ms sustained means rAF is being driven artificially.
    if (this.#frameTimes.length > 200) {
      const tiny = this.#frameTimes.filter((d) => d < 0.002).length / this.#frameTimes.length;
      if (tiny > 0.5) { reasons.push('frame-pacing: yapay rAF sürüşü'); bump('fatal'); }
    }
    // Hit bookkeeping must agree with the game's own counters.
    if (run.hits !== stats.hits && stats.mode !== 'tracking') { reasons.push('ledger: vuruş sayacı uyuşmuyor'); bump('fatal'); }

    for (const f of this.#forensics.analyse()) { reasons.push(`${f.code}: ${f.detail}`); bump(f.severity); }
    for (const f of this.#integrity.findings) { reasons.push(`${f.code}: ${f.detail}`); bump(f.severity); }

    const status = severity === 'fatal' ? 'invalid' : severity === 'warn' ? 'unverified' : 'verified';
    this.#forensics = null;
    const nonce = run.nonce;
    this.#run = null;
    return Object.freeze({ status, severity, reasons: Object.freeze(reasons), nonce, version: VERSION });
  }
}

Object.freeze(Sentinel.prototype);
