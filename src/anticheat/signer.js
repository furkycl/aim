import { pristine } from './preload.js';

// HMAC-SHA256 signatures for run records. The key is derived from a random
// per-installation secret plus a build constant, so records in localStorage
// cannot be edited by hand without breaking their signature.
const SID_KEY = 'flick.sid';
const BUILD_SALT = 'flick/sentinel/v1/2026-10';

function hex(buf) { return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''); }

function installSecret() {
  let s = null;
  try { s = localStorage.getItem(SID_KEY); } catch { /* ignore */ }
  if (!s || s.length < 32) {
    const bytes = new Uint8Array(32);
    if (pristine.getRandomValues) pristine.getRandomValues(bytes);
    else for (let i = 0; i < 32; i++) bytes[i] = (Math.random() * 256) | 0;
    s = hex(bytes);
    try { localStorage.setItem(SID_KEY, s); } catch { /* ignore */ }
  }
  return s;
}

export class Signer {
  constructor() {
    this.ready = this._init();
  }

  async _init() {
    const subtle = pristine.subtle;
    if (!subtle) { this.key = null; return; }
    const raw = new TextEncoder().encode(installSecret() + '|' + BUILD_SALT);
    this.key = await subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }

  // Canonical JSON: sorted keys so the signature is stable.
  canonical(obj) {
    const keys = Object.keys(obj).filter((k) => k !== 'sig').sort();
    return JSON.stringify(keys.map((k) => [k, obj[k]]));
  }

  async sign(record) {
    await this.ready;
    if (!this.key) return { ...record, sig: 'nosubtle' };
    const data = new TextEncoder().encode(this.canonical(record));
    const sig = await pristine.subtle.sign('HMAC', this.key, data);
    return { ...record, sig: hex(sig) };
  }

  async verify(record) {
    await this.ready;
    if (!this.key) return record.sig === 'nosubtle';
    if (typeof record.sig !== 'string' || record.sig.length !== 64) return false;
    const data = new TextEncoder().encode(this.canonical(record));
    const sig = Uint8Array.from(record.sig.match(/../g).map((h) => parseInt(h, 16)));
    try { return await pristine.subtle.verify('HMAC', this.key, sig, data); } catch { return false; }
  }

  nonce() {
    const b = new Uint8Array(8);
    if (pristine.getRandomValues) pristine.getRandomValues(b); else for (let i = 0; i < 8; i++) b[i] = (Math.random() * 256) | 0;
    return hex(b);
  }
}
