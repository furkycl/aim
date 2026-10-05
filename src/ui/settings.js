import { renderCrosshair } from './crosshair.js';

const $ = (id) => document.getElementById(id);

// Binds the settings panel controls to the Settings store.
export class SettingsPanel {
  constructor(settings, hud, audio) {
    this.s = settings;
    this.hud = hud;
    this.audio = audio;
    this.xh = $('crosshair');
    this.xhPrev = $('xh-preview-el');
    this._bindTabs();
    this._bindMouse();
    this._bindCrosshair();
    this._bindVideo();
    this._bindAudio();
    $('btn-reset-settings').addEventListener('click', () => { this.s.reset(); this.sync(); });
    this.s.onChange(() => this.sync());
    this.sync();
  }

  _bindTabs() {
    for (const t of document.querySelectorAll('#settings .tab')) {
      t.addEventListener('click', () => {
        for (const x of document.querySelectorAll('#settings .tab')) x.classList.toggle('active', x === t);
        for (const p of document.querySelectorAll('#settings .tab-page')) p.classList.toggle('hidden', p.dataset.page !== t.dataset.tab);
        this.audio.click();
      });
    }
  }

  _num(id, path, parse = parseFloat) {
    const el = $(id);
    el.addEventListener('input', () => { const v = parse(el.value); if (Number.isFinite(v)) this.s.set(path, v); });
    el.addEventListener('change', () => this.sync());
  }
  _chk(id, path) {
    $(id).addEventListener('change', (e) => this.s.set(path, !!e.target.checked));
  }

  _bindMouse() {
    this._num('s-sens', 'mouse.sens');
    this._num('s-sens-r', 'mouse.sens');
    this._num('s-dpi', 'mouse.dpi', (v) => parseInt(v, 10));
    this._num('s-zoomsens', 'mouse.zoomSens');
    this._chk('s-invert', 'mouse.invert');
    this._chk('s-raw', 'mouse.raw');
  }

  _bindCrosshair() {
    $('xh-style').addEventListener('change', (e) => this.s.set('crosshair.style', e.target.value));
    this._num('xh-size', 'crosshair.size');
    this._num('xh-thick', 'crosshair.thick');
    this._num('xh-gap', 'crosshair.gap');
    $('xh-color').addEventListener('input', (e) => this.s.set('crosshair.color', e.target.value));
    this._chk('xh-outline', 'crosshair.outline');
    this._num('xh-alpha', 'crosshair.alpha');
    for (const chip of document.querySelectorAll('.chip[data-xh]')) {
      chip.addEventListener('click', () => {
        const parts = chip.dataset.xh.split(';');
        if (parts.length === 5) {
          const [style, size, thick, gap, color] = parts;
          this.s.data.crosshair = { ...this.s.data.crosshair, style, size: +size, thick: +thick, gap: +gap, color };
        } else {
          this.s.data.crosshair = { ...this.s.data.crosshair, style: 'dot', size: 3, thick: 3, gap: 0, color: '#00f0ff' };
        }
        this.s.save();
      });
    }
  }

  _bindVideo() {
    this._num('v-fov', 'video.fov', (v) => parseInt(v, 10));
    this._chk('v-bloom', 'video.bloom');
    this._chk('v-particles', 'video.particles');
    this._chk('v-shake', 'video.shake');
    $('v-scale').addEventListener('change', (e) => this.s.set('video.scale', parseFloat(e.target.value)));
    this._chk('v-fps', 'video.fps');
  }

  _bindAudio() {
    this._num('a-master', 'audio.master');
    this._num('a-sfx', 'audio.sfx');
    this._chk('a-hit', 'audio.hit');
    this._chk('a-amb', 'audio.ambient');
  }

  sync() {
    const d = this.s.data;
    const setIf = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
    setIf('s-sens', d.mouse.sens);
    setIf('s-sens-r', d.mouse.sens);
    setIf('s-dpi', d.mouse.dpi);
    setIf('s-zoomsens', d.mouse.zoomSens);
    $('s-invert').checked = d.mouse.invert;
    $('s-raw').checked = d.mouse.raw;
    $('s-edpi').textContent = this.s.edpi.toFixed(0);
    $('s-cm360').textContent = this.s.cmPer360.toFixed(1);
    $('s-in360').textContent = this.s.inPer360.toFixed(2);

    $('xh-style').value = d.crosshair.style;
    setIf('xh-size', d.crosshair.size);
    setIf('xh-thick', d.crosshair.thick);
    setIf('xh-gap', d.crosshair.gap);
    $('xh-color').value = d.crosshair.color;
    $('xh-outline').checked = d.crosshair.outline;
    setIf('xh-alpha', d.crosshair.alpha);
    renderCrosshair(this.xh, d.crosshair);
    renderCrosshair(this.xhPrev, d.crosshair);

    setIf('v-fov', d.video.fov);
    $('v-fov-val').textContent = `${d.video.fov}°`;
    $('v-bloom').checked = d.video.bloom;
    $('v-particles').checked = d.video.particles;
    $('v-shake').checked = d.video.shake;
    $('v-scale').value = String(d.video.scale);
    $('v-fps').checked = d.video.fps;
    this.hud.showFps(d.video.fps);

    setIf('a-master', d.audio.master);
    setIf('a-sfx', d.audio.sfx);
    $('a-hit').checked = d.audio.hit;
    $('a-amb').checked = d.audio.ambient;
  }
}
