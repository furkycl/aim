// Runs before any other module (sentinel.js imports it first, and main.js
// imports sentinel.js first). It captures pristine references to the browser
// APIs the game depends on, so later hooks can be detected, and pins a few
// globals that debugging tools use to reach into the scene graph.

const g = globalThis;

export const pristine = Object.freeze({
  toString: Function.prototype.toString,
  addEventListener: EventTarget.prototype.addEventListener,
  removeEventListener: EventTarget.prototype.removeEventListener,
  dispatchEvent: EventTarget.prototype.dispatchEvent,
  raf: g.requestAnimationFrame,
  caf: g.cancelAnimationFrame,
  setTimeout: g.setTimeout,
  setInterval: g.setInterval,
  perfNow: performance.now.bind(performance),
  dateNow: Date.now,
  random: Math.random,
  MouseEvent: g.MouseEvent,
  PointerEvent: g.PointerEvent,
  KeyboardEvent: g.KeyboardEvent,
  defineProperty: Object.defineProperty,
  getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
  freeze: Object.freeze,
  // isTrusted is [LegacyUnforgeable]: an own accessor on every Event instance.
  isTrustedGetter: Object.getOwnPropertyDescriptor(new Event('probe'), 'isTrusted')?.get || null,
  movementXGetter: Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'movementX')?.get || null,
  movementYGetter: Object.getOwnPropertyDescriptor(MouseEvent.prototype, 'movementY')?.get || null,
  requestPointerLock: Element.prototype.requestPointerLock,
  pointerLockElementGetter: Object.getOwnPropertyDescriptor(Document.prototype, 'pointerLockElement')?.get || null,
  getContext: HTMLCanvasElement.prototype.getContext,
  toDataURL: HTMLCanvasElement.prototype.toDataURL,
  subtle: g.crypto?.subtle || null,
  getRandomValues: g.crypto ? g.crypto.getRandomValues.bind(g.crypto) : null,
  loadedAt: performance.now(),
  epoch: Date.now(),
});

// three.js looks for window.__THREE_DEVTOOLS__ to publish its scene graph.
// Pin it to undefined so the scene cannot be inspected that way.
try {
  Object.defineProperty(g, '__THREE_DEVTOOLS__', { value: undefined, writable: false, configurable: false, enumerable: false });
} catch { /* already defined — integrity check will notice */ }

// Fingerprint of the scripts present at load time: anything added later is injected.
export const initialScripts = Object.freeze(
  Array.from(document.scripts).map((s) => (s.src ? new URL(s.src, location.href).href : `inline:${s.textContent.length}`)),
);
