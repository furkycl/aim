// Sentinel must be the first import: it captures pristine browser APIs before
// anything else (including three.js) runs. scripts/check.mjs enforces this.
import { Sentinel } from './anticheat/sentinel.js';
import { pristine } from './anticheat/preload.js';
import { Settings } from './config/settings.js';
import { Input } from './core/input.js';
import { Game, State } from './core/game.js';
import { SceneView } from './render/scene.js';
import { Effects } from './render/effects.js';
import { Sfx } from './audio/sfx.js';
import { GunAudio } from './audio/guns.js';
import { ViewModel } from './render/viewmodel.js';
import { Hud, toast } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { SettingsPanel } from './ui/settings.js';
import { Leaderboard } from './data/leaderboard.js';

(function boot() {
  const canvas = document.getElementById('scene');
  const settings = new Settings();
  const sentinel = new Sentinel(settings);
  const view = new SceneView(canvas, settings);
  const input = new Input(canvas, settings, sentinel);
  const effects = new Effects(view, settings);
  const audio = new Sfx(settings);
  const guns = new GunAudio(audio, settings);
  const viewmodel = new ViewModel(view, settings);
  const hud = new Hud();
  const game = new Game({ view, input, settings, sentinel, effects, audio, guns, hud, viewmodel });
  const board = new Leaderboard(sentinel.signer);
  const menu = new Menu({ game, board, audio, sentinel });
  new SettingsPanel(settings, hud, audio);

  // Sentinel badge
  const bs = sentinel.bootStatus();
  const badge = document.getElementById('sentinel-badge');
  badge.textContent = bs.text;
  badge.className = `badge badge-${bs.level}`;

  // Keyboard
  input.on('key', (e) => {
    const k = e.key;
    if (k === 'Escape') {
      if (game.state === State.RUNNING || game.state === State.COUNTDOWN) { input.releaseLock(); }
      else if (game.state === State.PAUSED) { game.stop(); menu.show('menu'); menu.refreshBests(); }
      else if (game.state === State.ENDED) { game.stop(); menu.show('menu'); menu.refreshBests(); }
      else if (menu.current && menu.current !== 'menu') { menu.show('menu'); menu.refreshBests(); }
      return;
    }
    if (k === ' ' && (menu.current === 'menu' || menu.current === 'results')) { e.preventDefault(); menu.play(); }
    if ((k === 'r' || k === 'R') && (game.state === State.ENDED || game.state === State.PAUSED)) menu.play();
    if ((k === 'r' || k === 'R') && game.state === State.RUNNING) game.reload();
  });

  // Main loop
  let last = pristine.perfNow();
  let fpsAcc = 0, fpsN = 0, fpsT = 0;
  function frame(now) {
    pristine.raf.call(globalThis, frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // tab switch / stall: never let a frame "catch up" the timer
    const t = now / 1000;

    game.update(dt, t);
    view.setLook(game.lookYaw, game.lookPitch, game.zoom);
    sentinel.tick(dt);
    effects.update(dt, view.camera);
    const scoped = game.zoom > 1;
    viewmodel.root.visible = !scoped && game.state !== State.MENU && game.state !== State.ENDED;
    viewmodel.update(dt, game.lookYaw, game.lookPitch, { ads: !!(game.weapon && game.weapon.ads) });
    view.render(dt, t);

    if (settings.data.video.fps) {
      fpsAcc += dt; fpsN++; fpsT += dt;
      if (fpsT >= 0.5) { hud.setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; fpsT = 0; }
    }
  }
  pristine.raf.call(globalThis, frame);

  // Pointer-lock hints
  input.on('lock', () => { if (game.state === State.PAUSED) { menu.hideAll(); game.resume(); } });
  canvas.addEventListener('click', () => {
    if (game.state === State.MENU && !menu.current) menu.show('menu');
  });

  if (!navigator.userActivation) { /* older browsers: nothing to do */ }
  if (!window.isSecureContext) toast('Güvenli bağlam değil: Sentinel imzalama kapalı.', true);

  // Dev-only test handle. `import.meta.env.DEV` is false in production builds,
  // so this block is removed entirely from dist/ (scripts/check.mjs verifies it).
  if (import.meta.env.DEV) {
    window.__flick = { game, view, input, settings, sentinel, board, menu, viewmodel };
  }

  console.log('%cFLICK%c — Sentinel v' + sentinel.version + ' aktif. Hile tespitinde koşu geçersiz sayılır.', 'color:#00f0ff;font-weight:bold;font-size:16px', 'color:#7a8396');
})();
