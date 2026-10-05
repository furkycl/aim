import { pristine, initialScripts } from './preload.js';

// Environment integrity: hooked natives, injected scripts, userscript managers,
// devtools, and clock tampering.

const NATIVE_RE = /\{\s*\[native code\]\s*\}\s*$/;

function cleanRealm() {
  // A fresh about:blank frame gives us a Function.prototype.toString that
  // page-level hooks have not touched. Content scripts rarely run in it.
  try {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    f.setAttribute('sandbox', 'allow-same-origin');
    f.dataset.flick = 'own';
    document.documentElement.appendChild(f);
    const w = f.contentWindow;
    const ts = w.Function.prototype.toString;
    const out = {
      toString: ts,
      raf: w.requestAnimationFrame,
      perfNow: w.performance.now,
      dateNow: w.Date.now,
    };
    // Keep the frame attached: its functions must stay alive for later checks.
    return out;
  } catch {
    return null;
  }
}

export class Integrity {
  constructor() {
    this.findings = [];
    this.realm = cleanRealm();
    this.injected = [];
    this._observeDom();
    this._driftSamples = [];
  }

  // Warnings are per-run; fatal findings (tampering) stick until reload.
  resetWarnings() {
    this.findings = this.findings.filter((f) => f.severity === 'fatal');
  }

  _flag(code, severity, detail) {
    if (this.findings.some((f) => f.code === code)) return;
    this.findings.push({ code, severity, detail });
  }

  isNative(fn) { return this._isNative(fn); }

  _isNative(fn) {
    if (typeof fn !== 'function') return false;
    const ts = (this.realm && this.realm.toString) || pristine.toString;
    try { return NATIVE_RE.test(ts.call(fn)); } catch { return false; }
  }

  _observeDom() {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'IFRAME' || tag === 'OBJECT' || tag === 'EMBED') {
          if (node.dataset && node.dataset.flick === 'own') continue;
          const src = node.src || `inline:${(node.textContent || '').length}`;
          this.injected.push(src);
          this._flag('dom-injection', 'fatal', `${tag.toLowerCase()} enjekte edildi: ${String(src).slice(0, 80)}`);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    this.observer = mo;
  }

  // Cheap checks, safe to run every couple of seconds during a run.
  checkNatives() {
    const g = globalThis;
    const checks = [
      ['requestAnimationFrame', g.requestAnimationFrame, pristine.raf],
      ['performance.now', performance.now, null],
      ['Date.now', Date.now, pristine.dateNow],
      ['Math.random', Math.random, pristine.random],
      ['addEventListener', EventTarget.prototype.addEventListener, pristine.addEventListener],
      ['dispatchEvent', EventTarget.prototype.dispatchEvent, pristine.dispatchEvent],
      ['MouseEvent', g.MouseEvent, pristine.MouseEvent],
      ['requestPointerLock', Element.prototype.requestPointerLock, pristine.requestPointerLock],
      ['Function.prototype.toString', Function.prototype.toString, pristine.toString],
      ['Object.defineProperty', Object.defineProperty, pristine.defineProperty],
    ];
    for (const [name, cur, ref] of checks) {
      if (ref && cur !== ref) this._flag('native-replaced', 'fatal', `${name} değiştirilmiş`);
      else if (!this._isNative(cur)) this._flag('native-hooked', 'fatal', `${name} yerel değil`);
    }
    const getters = [
      ['isTrusted', new Event('probe'), pristine.isTrustedGetter],
      ['movementX', MouseEvent.prototype, pristine.movementXGetter],
      ['movementY', MouseEvent.prototype, pristine.movementYGetter],
      ['pointerLockElement', Document.prototype, pristine.pointerLockElementGetter],
    ];
    for (const [name, proto, ref] of getters) {
      const d = Object.getOwnPropertyDescriptor(proto, name);
      if (!d || !d.get || (ref && d.get !== ref) || !this._isNative(d.get)) this._flag('getter-hooked', 'fatal', `${name} getter değiştirilmiş`);
    }
    // Instance-level shadowing (e.g. Object.defineProperty(event, 'isTrusted', ...)) is caught in acceptEvent.
    {
      const d = Object.getOwnPropertyDescriptor(globalThis, '__THREE_DEVTOOLS__');
      if (!d || d.configurable || d.writable || d.value !== undefined) this._flag('devtools-hook', 'fatal', '__THREE_DEVTOOLS__ açık');
    }
  }

  checkEnvironment() {
    const g = globalThis;
    const markers = ['GM_info', 'GM', 'unsafeWindow', 'GM_getValue', 'tampermonkey', 'violentmonkey', '__REACT_DEVTOOLS_GLOBAL_HOOK__'];
    for (const m of markers) {
      try { if (m in g && g[m] !== undefined) this._flag('userscript-manager', 'warn', `${m} tespit edildi`); } catch { /* ignore */ }
    }
    const now = Array.from(document.scripts).map((s) => (s.src ? new URL(s.src, location.href).href : `inline:${s.textContent.length}`));
    for (const s of now) {
      if (!initialScripts.includes(s)) this._flag('dom-injection', 'fatal', `script: ${s.slice(0, 80)}`);
      if (s.startsWith('http') && !s.startsWith(location.origin)) this._flag('foreign-script', 'fatal', `yabancı script: ${s.slice(0, 80)}`);
    }
    if (g.navigator && g.navigator.webdriver) this._flag('webdriver', 'fatal', 'navigator.webdriver = true (otomasyon)');
  }

  // Devtools probe: only meaningful while a run is active. `debugger` is a
  // no-op without devtools; with devtools it stalls the page, which we measure.
  probeDevtools() {
    const t0 = pristine.perfNow();
    // eslint-disable-next-line no-debugger
    debugger;
    const dt = pristine.perfNow() - t0;
    if (dt > 120) this._flag('devtools-open', 'warn', `debugger duraklaması ${Math.round(dt)} ms`);
    const dw = Math.abs(window.outerWidth - window.innerWidth);
    const dh = Math.abs(window.outerHeight - window.innerHeight);
    if (!document.fullscreenElement && (dw > 260 || dh > 320)) this._flag('devtools-docked', 'warn', `pencere farkı ${dw}×${dh}`);
  }

  // Clock consistency: performance.now vs Date.now vs the clean realm.
  sampleClock() {
    const p = pristine.perfNow();
    const d = pristine.dateNow();
    this._driftSamples.push({ p, d });
    if (this._driftSamples.length > 400) this._driftSamples.shift();
    if (this._driftSamples.length >= 10) {
      const a = this._driftSamples[0], b = this._driftSamples[this._driftSamples.length - 1];
      const dp = b.p - a.p, dd = b.d - a.d;
      if (dp > 3000 && Math.abs(dp - dd) / dp > 0.25) this._flag('clock-tamper', 'fatal', `performance.now / Date.now sapması %${Math.round(Math.abs(dp - dd) / dp * 100)}`);
    }
  }

  // Full pass: cheap native checks + environment scan.
  fullScan() {
    this.checkNatives();
    this.checkEnvironment();
    return this.findings;
  }
}
