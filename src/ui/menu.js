import { MODES } from '../config/modes.js';
import { WEAPONS, weaponById } from '../config/weapons.js';
import { TARGET_STYLES, targetStyleById } from '../config/targets.js';

const $ = (id) => document.getElementById(id);
const LOADOUT_KEY = 'flick.loadout.v1';

const GLYPH = {
  sphere: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  operator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="6" r="3"/><path d="M6 21v-5a6 6 0 0 1 12 0v5"/></svg>',
  heli: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M12 6v3M6 13h7a4 4 0 0 1 4 4H6a3 3 0 0 1 0-6zM17 17l4-3M5 20h12"/></svg>',
};

// Overlay manager: menu, settings, board, results, pause, sentinel.
export class Menu {
  constructor({ game, board, audio, sentinel }) {
    this.game = game;
    this.board = board;
    this.audio = audio;
    this.sentinel = sentinel;
    this.selected = MODES[0];
    const saved = this._loadLoadout();
    this.weapon = weaponById(saved.weapon);
    this.style = targetStyleById(saved.style);
    this.overlays = ['menu', 'settings', 'board', 'results', 'pause', 'sentinel'].reduce((o, id) => ((o[id] = $(id)), o), {});
    this._buildModes();
    this._buildLoadout();
    this._bind();
    this.show('menu');
  }

  _loadLoadout() {
    try { return JSON.parse(localStorage.getItem(LOADOUT_KEY) || '{}') || {}; } catch { return {}; }
  }
  _saveLoadout() {
    try { localStorage.setItem(LOADOUT_KEY, JSON.stringify({ weapon: this.weapon.id, style: this.style.id, mode: this.selected.id })); } catch { /* ignore */ }
  }

  _buildModes() {
    const list = $('mode-list');
    list.innerHTML = '';
    const saved = this._loadLoadout();
    if (saved.mode) this.selected = MODES.find((m) => m.id === saved.mode) || MODES[0];
    for (const m of MODES) {
      const b = document.createElement('button');
      b.className = 'mode-card' + (m === this.selected ? ' active' : '');
      b.dataset.mode = m.id;
      b.innerHTML = `<h3>${m.name}</h3><p>${m.desc}</p>
        <div class="mode-meta"><span>${m.duration}s</span><span>${m.targets} hedef</span></div>
        <span class="mode-best"></span>`;
      b.addEventListener('click', () => { this.select(m); this.audio.click(); });
      b.addEventListener('dblclick', () => this.play());
      list.appendChild(b);
    }
    this.refreshBests();
  }

  _buildLoadout() {
    const wl = $('weapon-list');
    wl.innerHTML = '';
    for (const w of WEAPONS) {
      const b = document.createElement('button');
      b.className = 'pick' + (w === this.weapon ? ' active' : '');
      b.dataset.weapon = w.id;
      const bars = [['HASAR', w.stats.dmg], ['HIZ', w.stats.rate], ['TEPME', w.stats.recoil], ['MENZİL', w.stats.range]]
        .map(([k, v]) => `<div><div class="bar"><i style="--v:${Math.round(v * 100)}%"></i></div><span>${k}</span></div>`).join('');
      b.innerHTML = `<h5>${w.name}</h5><div class="cls">${w.cls} · ${w.auto ? 'OTOMATİK' : w.cycle === 'bolt' ? 'SÜRGÜLÜ' : w.cycle === 'pump' ? 'POMPALI' : 'YARI OTO'}</div>
        <p>${w.desc}</p><div class="bars">${bars}</div>
        <div class="kv"><b>${w.mag}</b> mermi · <b>${w.rpm}</b> rpm · <b>${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''}</b> hasar · kafa <b>${w.headMult}×</b></div>`;
      b.addEventListener('click', () => { this.weapon = w; this.audio.click(); this._syncLoadout(); });
      wl.appendChild(b);
    }
    const tl = $('target-list');
    tl.innerHTML = '';
    for (const t of TARGET_STYLES) {
      const b = document.createElement('button');
      b.className = 'pick' + (t === this.style ? ' active' : '');
      b.dataset.style = t.id;
      b.innerHTML = `<div class="glyph">${GLYPH[t.id]}</div><h5>${t.name}</h5><div class="cls">${t.hp} HP · ${t.kill} puan</div><p>${t.desc}</p>`;
      b.addEventListener('click', () => { this.style = t; this.audio.click(); this._syncLoadout(); });
      tl.appendChild(b);
    }
  }

  _syncLoadout() {
    for (const el of document.querySelectorAll('[data-weapon]')) el.classList.toggle('active', el.dataset.weapon === this.weapon.id);
    for (const el of document.querySelectorAll('[data-style]')) el.classList.toggle('active', el.dataset.style === this.style.id);
    this._saveLoadout();
    this.refreshBests();
  }

  refreshBests() {
    for (const el of document.querySelectorAll('.mode-card')) {
      const best = this.board.best(el.dataset.mode, this.style.id, this.weapon.id);
      el.querySelector('.mode-best').textContent = best ? `EN İYİ ${best}` : '';
    }
  }

  select(m) {
    this.selected = m;
    for (const el of document.querySelectorAll('.mode-card')) el.classList.toggle('active', el.dataset.mode === m.id);
    this._saveLoadout();
  }

  show(id) {
    for (const k in this.overlays) this.overlays[k].classList.toggle('hidden', k !== id);
    this.current = id;
  }

  hideAll() {
    for (const k in this.overlays) this.overlays[k].classList.add('hidden');
    this.current = null;
  }

  play() {
    this.audio.unlock();
    this.audio.click();
    this.hideAll();
    this.game.start(this.selected, this.style, this.weapon);
  }

  _bind() {
    $('btn-play').addEventListener('click', () => this.play());
    $('btn-settings').addEventListener('click', () => { this.audio.click(); this.show('settings'); });
    $('btn-board').addEventListener('click', () => { this.audio.click(); this.board.render(); this.show('board'); });
    for (const b of document.querySelectorAll('[data-close]')) {
      b.addEventListener('click', () => { this.audio.click(); this.show('menu'); this.refreshBests(); });
    }
    $('btn-retry').addEventListener('click', () => this.play());
    $('btn-menu').addEventListener('click', () => { this.audio.click(); this.game.stop(); this.show('menu'); this.refreshBests(); });
    $('btn-pause-menu').addEventListener('click', () => { this.game.stop(); this.show('menu'); });
    $('btn-sentinel-ok').addEventListener('click', () => { this.show(this._afterSentinel || 'menu'); });

    this.overlays.pause.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.hideAll();
      this.game.resume();
    });

    this.game.on('state', (s) => { if (s === 'paused') this.show('pause'); });
    this.game.on('end', (stats, mode, style, weapon) => this.showResults(stats, mode, style, weapon));

    this.sentinel.onVerdict((v) => {
      if (v.severity === 'fatal') {
        this.game.stop();
        this._afterSentinel = 'menu';
        this.showSentinel(v);
      }
    });
  }

  showResults(s, mode, style, weapon) {
    const grade = gradeFor(s, mode, style);
    $('res-title').textContent = `${mode.name} · ${style.name}`;
    const g = $('res-grade');
    g.textContent = grade;
    g.className = `grade-${grade.toLowerCase()}`;
    $('res-score').textContent = String(s.score);
    $('res-acc').textContent = `${Math.round(s.accuracy * 100)}%`;
    $('res-hits').textContent = `${s.kills} / ${s.misses}`;
    $('res-react').textContent = s.avgReaction ? `${Math.round(s.avgReaction * 1000)} ms` : '—';
    $('res-streak').textContent = String(s.bestStreak);
    $('res-hs').textContent = style.id === 'operator' ? `${s.headshots} (${Math.round(s.hsRate * 100)}%)` : '—';
    $('res-kps').textContent = s.kps.toFixed(2);
    $('res-dmg').textContent = String(Math.round(s.damage));
    $('res-weapon').textContent = weapon.name;

    const v = s.verdict;
    const badge = $('res-verified');
    badge.className = 'badge ' + (v.status === 'verified' ? 'badge-ok' : v.status === 'unverified' ? 'badge-warn' : 'badge-bad');
    badge.textContent = v.status === 'verified' ? 'SENTINEL · DOĞRULANDI' : v.status === 'unverified' ? 'SENTINEL · DOĞRULANAMADI' : 'SENTINEL · GEÇERSİZ';

    const prevBest = this.board.best(mode.id, style.id, weapon.id) || 0;
    const saved = this.board.add(mode.id, s);
    const bestEl = $('res-best');
    if (v.status === 'invalid') bestEl.textContent = 'Bu koşu Sentinel tarafından geçersiz sayıldı: ' + v.reasons.join(' · ');
    else if (v.status === 'unverified') bestEl.textContent = 'Kaydedildi ama doğrulanamadı: ' + v.reasons.join(' · ');
    else if (saved && s.score > prevBest && prevBest > 0) bestEl.textContent = `🏆 Yeni rekor! Önceki: ${prevBest}`;
    else if (saved && prevBest === 0) bestEl.textContent = 'İlk kayıt. Şimdi geç bunu.';
    else bestEl.textContent = `Rekor: ${prevBest}`;

    this.show('results');
    this.refreshBests();
  }

  showSentinel(v) {
    $('sentinel-msg').textContent = v.message;
    const ul = $('sentinel-list');
    ul.innerHTML = '';
    for (const r of v.reasons) { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); }
    this.show('sentinel');
  }
}

function gradeFor(s, mode, style) {
  // Kills/sec reference per (mode, style); accuracy weighs 35%.
  const ref = { sphere: { static: 2.2, flick: 1.6, tracking: 0.5, shrink: 1.1, spider: 1.6 }, operator: { static: 1.1, flick: 0.9, tracking: 0.35, shrink: 0.6, spider: 0.9 }, heli: { static: 0.35, flick: 0.3, tracking: 0.15, shrink: 0.2, spider: 0.3 } };
  const r = (ref[style.id] || ref.sphere)[mode.kind] || 1;
  const perf = Math.min(1, s.kps / r);
  const x = perf * 0.65 + s.accuracy * 0.35;
  if (x >= 0.9) return 'S';
  if (x >= 0.78) return 'A';
  if (x >= 0.62) return 'B';
  if (x >= 0.45) return 'C';
  if (x >= 0.28) return 'D';
  return 'F';
}
