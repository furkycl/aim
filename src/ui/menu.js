import { MODES } from '../config/modes.js';

const $ = (id) => document.getElementById(id);

// Overlay manager: menu, settings, board, results, pause, sentinel.
export class Menu {
  constructor({ game, board, audio, sentinel }) {
    this.game = game;
    this.board = board;
    this.audio = audio;
    this.sentinel = sentinel;
    this.selected = MODES[0];
    this.overlays = ['menu', 'settings', 'board', 'results', 'pause', 'sentinel'].reduce((o, id) => ((o[id] = $(id)), o), {});
    this._buildModes();
    this._bind();
    this.show('menu');
  }

  _buildModes() {
    const list = $('mode-list');
    list.innerHTML = '';
    for (const m of MODES) {
      const b = document.createElement('button');
      b.className = 'mode-card' + (m === this.selected ? ' active' : '');
      b.dataset.mode = m.id;
      b.innerHTML = `<h3>${m.name}</h3><p>${m.desc}</p>
        <div class="mode-meta"><span>${m.duration}s</span><span>${m.targets} hedef</span><span>r=${m.radius}</span></div>
        <span class="mode-best"></span>`;
      b.addEventListener('click', () => { this.select(m); this.audio.click(); });
      b.addEventListener('dblclick', () => this.play());
      list.appendChild(b);
    }
    this.refreshBests();
  }

  refreshBests() {
    for (const el of document.querySelectorAll('.mode-card')) {
      const best = this.board.best(el.dataset.mode);
      el.querySelector('.mode-best').textContent = best ? `EN İYİ ${best}` : '';
    }
  }

  select(m) {
    this.selected = m;
    for (const el of document.querySelectorAll('.mode-card')) el.classList.toggle('active', el.dataset.mode === m.id);
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
    this.game.start(this.selected);
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

    // Click anywhere on pause overlay resumes
    this.overlays.pause.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      this.hideAll();
      this.game.resume();
    });

    this.game.on('state', (s) => {
      if (s === 'paused') this.show('pause');
    });

    this.game.on('end', (stats, mode) => {
      this.showResults(stats, mode);
    });

    this.sentinel.onVerdict((v) => {
      if (v.severity === 'fatal') {
        this.game.stop();
        this._afterSentinel = 'menu';
        this.showSentinel(v);
      }
    });
  }

  showResults(s, mode) {
    const grade = gradeFor(s, mode);
    $('res-title').textContent = mode.name;
    const g = $('res-grade');
    g.textContent = grade;
    g.className = `grade-${grade.toLowerCase()}`;
    $('res-score').textContent = String(s.score);
    $('res-acc').textContent = `${Math.round(s.accuracy * 100)}%`;
    $('res-hits').textContent = mode.kind === 'tracking'
      ? `${s.trackOn.toFixed(1)}s / ${Math.max(0, s.shots - s.trackOn).toFixed(1)}s`
      : `${s.hits} / ${s.misses}`;
    $('res-react').textContent = s.avgReaction ? `${Math.round(s.avgReaction * 1000)} ms` : '—';
    $('res-streak').textContent = mode.kind === 'tracking' ? `${s.bestStreak.toFixed(1)}s` : String(s.bestStreak);
    $('res-kps').textContent = mode.kind === 'tracking' ? `${(s.trackOn / mode.duration * 100).toFixed(0)}%` : s.kps.toFixed(2);

    const v = s.verdict;
    const badge = $('res-verified');
    badge.className = 'badge ' + (v.status === 'verified' ? 'badge-ok' : v.status === 'unverified' ? 'badge-warn' : 'badge-bad');
    badge.textContent = v.status === 'verified' ? 'SENTINEL · DOĞRULANDI' : v.status === 'unverified' ? 'SENTINEL · DOĞRULANAMADI' : 'SENTINEL · GEÇERSİZ';

    const prevBest = this.board.best(mode.id) || 0;
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

function gradeFor(s, mode) {
  // Rough calibration against decent hits/sec and accuracy for each mode.
  const acc = s.accuracy;
  let perf;
  if (mode.kind === 'tracking') perf = s.trackOn / mode.duration;
  else perf = Math.min(1, s.kps / (mode.kind === 'shrink' ? 1.1 : mode.kind === 'static' ? 2.2 : 1.6));
  const x = perf * 0.65 + acc * 0.35;
  if (x >= 0.9) return 'S';
  if (x >= 0.78) return 'A';
  if (x >= 0.62) return 'B';
  if (x >= 0.45) return 'C';
  if (x >= 0.28) return 'D';
  return 'F';
}
