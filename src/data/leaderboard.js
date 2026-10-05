import { MODES } from '../config/modes.js';

// Local, signed leaderboard. Each record is HMAC-signed by Sentinel's signer;
// records whose signature no longer verifies are shown as invalid and never
// count as a best score.
const KEY = 'flick.board.v1';
const MAX = 10;

const $ = (id) => document.getElementById(id);

export class Leaderboard {
  constructor(signer) {
    this.signer = signer;
    this.data = this._read();
    this.verified = {}; // id -> boolean, filled asynchronously
    this.activeMode = MODES[0].id;
    this._verifyAll();
    $('btn-clear-board').addEventListener('click', () => { if (confirm('Tüm skorlar silinsin mi?')) { this.data = {}; this._write(); this.render(); } });
  }

  _read() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || '{}'); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
  }
  _write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ } }

  async _verifyAll() {
    for (const mode of Object.keys(this.data)) for (const r of this.data[mode]) this.verified[r.id] = await this.signer.verify(r);
  }

  best(modeId) {
    const list = this.data[modeId] || [];
    let b = 0;
    for (const r of list) if (this.verified[r.id] !== false && r.status !== 'invalid' && r.score > b) b = r.score;
    return b;
  }

  // Returns true if the record was stored.
  add(modeId, s) {
    const v = s.verdict;
    if (v.status === 'invalid') return false;
    const rec = {
      id: v.nonce, mode: modeId, score: s.score, acc: Math.round(s.accuracy * 1000) / 1000,
      react: s.avgReaction ? Math.round(s.avgReaction * 1000) : null,
      date: Date.now(), status: v.status, seed: s.seed, sv: v.version,
    };
    const list = this.data[modeId] || (this.data[modeId] = []);
    list.push(rec);
    list.sort((a, b) => b.score - a.score);
    list.splice(MAX);
    this.verified[rec.id] = true;
    this._write();
    this.signer.sign(rec).then((signed) => {
      const i = list.findIndex((r) => r.id === rec.id);
      if (i >= 0) { list[i] = signed; this._write(); }
    });
    return true;
  }

  render() {
    const tabs = $('board-tabs');
    tabs.innerHTML = '';
    for (const m of MODES) {
      const b = document.createElement('button');
      b.className = 'tab' + (m.id === this.activeMode ? ' active' : '');
      b.textContent = m.name;
      b.addEventListener('click', () => { this.activeMode = m.id; this.render(); });
      tabs.appendChild(b);
    }
    const body = $('board-body');
    body.innerHTML = '';
    const list = this.data[this.activeMode] || [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6" class="board-empty">Henüz kayıt yok.</td></tr>';
      return;
    }
    list.forEach((r, i) => {
      const tr = document.createElement('tr');
      const ok = this.verified[r.id] !== false;
      const label = !ok ? '<span class="bad">İMZA BOZUK</span>' : r.status === 'verified' ? '<span class="ok">DOĞRULANDI</span>' : '<span style="color:#ffe600">DOĞRULANAMADI</span>';
      tr.innerHTML = `<td>${i + 1}</td><td>${r.score}</td><td>${Math.round(r.acc * 100)}%</td><td>${r.react ? r.react + ' ms' : '—'}</td><td>${new Date(r.date).toLocaleDateString('tr-TR')}</td><td>${label}</td>`;
      body.appendChild(tr);
    });
  }
}
