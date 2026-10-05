// Input forensics: statistical analysis of the mouse stream during a run.
// Every signal returns { code, severity: 'fatal' | 'warn', detail } or null.

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function stddev(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }
function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

export class Forensics {
  constructor(mode) {
    this.mode = mode;
    this.moves = []; // { t, dx, dy }
    this.clicks = []; // { t, yaw, pitch }
    this.hits = []; // { t, reaction, errRatio, jumpCounts, preWindowEvents, approachRatio }
    this.untrusted = 0;
    this.trackOn = 0;
    this.trackTotal = 0;
    this.lastMove = null;
  }

  move(t, dx, dy) {
    this.moves.push({ t, dx, dy });
    if (this.moves.length > 60000) this.moves.splice(0, 20000);
  }

  click(t, yaw, pitch) {
    this.clicks.push({ t, yaw, pitch });
  }

  // Called right after a kill is registered. `aimErr` is the angular distance
  // between the ray and target centre (radians); `angR` is the target's angular radius.
  hit(t, reaction, aimErr, angR, degPerCount) {
    const win = this.moves.filter((m) => m.t >= t - 160 && m.t <= t);
    let maxMag = 0, lastMag = 0, sumMag = 0;
    for (const m of win) {
      const mag = Math.hypot(m.dx, m.dy);
      sumMag += mag;
      if (mag > maxMag) maxMag = mag;
      lastMag = mag;
    }
    // A single event carrying almost the whole flick => teleport-like motion.
    const jumpShare = sumMag > 0 ? maxMag / sumMag : 0;
    this.hits.push({
      t, reaction,
      errRatio: angR > 0 ? aimErr / angR : 1,
      maxCounts: maxMag,
      maxDeg: maxMag * degPerCount,
      events: win.length,
      jumpShare,
      approachRatio: maxMag > 0 ? lastMag / maxMag : 0,
    });
  }

  track(on, dt) {
    this.trackTotal += dt;
    if (on) this.trackOn += dt;
  }

  analyse() {
    const out = [];
    const push = (code, severity, detail) => out.push({ code, severity, detail });

    if (this.untrusted > 0) push('synthetic-input', 'fatal', `${this.untrusted} sentetik (isTrusted=false) olay`);

    const hits = this.hits;
    const n = hits.length;

    // 1. Aim precision: humans land off-centre. Bots land dead centre.
    if (n >= 12) {
      const med = median(hits.map((h) => h.errRatio));
      const tight = hits.filter((h) => h.errRatio < 0.06).length / n;
      if (med < 0.07 || tight > 0.75) push('perfect-aim', 'fatal', `medyan hata ${med.toFixed(3)}r, merkez isabet %${Math.round(tight * 100)}`);
      else if (med < 0.14 || tight > 0.5) push('suspicious-aim', 'warn', `medyan hata ${med.toFixed(3)}r`);
    }

    // 2. Teleport flicks: one event carries the whole move AND lands on target.
    if (n >= 8) {
      const tele = hits.filter((h) => h.jumpShare > 0.9 && h.maxDeg > 3.5 && h.errRatio < 0.5).length / n;
      if (tele > 0.45) push('snap-aim', 'fatal', `vuruşların %${Math.round(tele * 100)}'i tek olayda ışınlanma`);
      else if (tele > 0.25) push('snap-aim-partial', 'warn', `vuruşların %${Math.round(tele * 100)}'i tek olayda ışınlanma`);
      // Humans decelerate into the target; the last event is small vs the peak.
      const noDecel = hits.filter((h) => h.events >= 4 && h.approachRatio > 0.9 && h.maxDeg > 2).length / n;
      if (noDecel > 0.6) push('no-deceleration', 'warn', `yavaşlamasız yaklaşım %${Math.round(noDecel * 100)}`);
    }

    // 3. Inhuman reaction times (flick / spider).
    const reacts = hits.map((h) => h.reaction).filter((r) => r != null && r > 0);
    if (reacts.length >= 8) {
      const fast = reacts.filter((r) => r < 0.12).length / reacts.length;
      const vfast = reacts.filter((r) => r < 0.08).length;
      if (fast > 0.3 || vfast >= 3) push('inhuman-reaction', 'fatal', `tepkilerin %${Math.round(fast * 100)}'i < 120 ms`);
      else if (fast > 0.12) push('fast-reaction', 'warn', `tepkilerin %${Math.round(fast * 100)}'i < 120 ms`);
    }

    // 4. Autoclicker: metronomic click intervals or impossible click rate.
    if (this.clicks.length >= 20) {
      const iv = [];
      for (let i = 1; i < this.clicks.length; i++) iv.push(this.clicks[i].t - this.clicks[i - 1].t);
      const cv = stddev(iv) / Math.max(1e-6, mean(iv));
      const fastest = Math.min(...iv);
      if (cv < 0.03) push('autoclicker', 'fatal', `tıklama aralığı CV ${cv.toFixed(3)}`);
      if (fastest < 30 && iv.filter((x) => x < 30).length > 5) push('click-rate', 'fatal', `${iv.filter((x) => x < 30).length} tıklama < 30 ms aralıkla`);
    }

    // 5. Mouse stream shape.
    const mv = this.moves;
    if (mv.length >= 400) {
      const mags = mv.map((m) => Math.hypot(m.dx, m.dy)).filter((x) => x > 0);
      // Scripted motion uses a handful of fixed step sizes; a hand on a mouse does not.
      const uniq = new Set(mags.map((x) => x.toFixed(2))).size;
      if (uniq < 6) push('quantised-motion', 'warn', `yalnızca ${uniq} farklı hareket büyüklüğü`);
      // Perfectly straight lines across many events (dy exactly 0 or dx exactly 0 for long stretches).
      let straight = 0, run = 0;
      for (const m of mv) {
        if ((m.dx === 0) !== (m.dy === 0) && Math.abs(m.dx + m.dy) > 2) { run++; if (run > 25) straight++; } else run = 0;
      }
      if (straight > 40) push('axis-locked-motion', 'warn', `${straight} olay boyunca eksen kilitli hareket`);
      const iv = [];
      for (let i = 1; i < mv.length; i++) iv.push(mv[i].t - mv[i - 1].t);
      const cv = stddev(iv) / Math.max(1e-6, mean(iv));
      if (cv < 0.01) push('metronomic-input', 'warn', `olay aralığı CV ${cv.toFixed(4)}`);
    }

    // 6. Tracking: nobody stays glued to a randomly turning target.
    if (this.mode.kind === 'tracking' && this.trackTotal > 20) {
      const r = this.trackOn / this.trackTotal;
      if (r > 0.985) push('perfect-tracking', 'fatal', `hedefte kalma %${(r * 100).toFixed(1)}`);
      else if (r > 0.95) push('suspicious-tracking', 'warn', `hedefte kalma %${(r * 100).toFixed(1)}`);
    }

    return out;
  }
}
