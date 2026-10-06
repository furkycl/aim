// Weapon archetypes. All designs, names and sounds are original.
// Angles in degrees, times in seconds.
//
// recoil(i): kick for the i-th shot of a continuous spray. Patterns climb first,
// then drift sideways — the player must pull down and counter the drift.

const deg = (x) => x;

export const WEAPONS = Object.freeze([
  {
    id: 'p9',
    name: 'P9 COMPACT',
    cls: 'TABANCA',
    desc: 'Hafif, hızlı, dürüst. Her mermi bir karar.',
    auto: false,
    rpm: 420,
    mag: 12,
    reloadTime: 1.55,
    cycle: 'semi',
    cycleTime: 0,
    dmg: 34,
    headMult: 4,
    pellets: 1,
    spread: { base: 0.25, perShot: 0.55, max: 2.6, recover: 9 },
    zoom: 1,
    recoil(i) { return { pitch: deg(1.3 + Math.min(i, 4) * 0.12), yaw: deg((i % 2 ? 1 : -1) * 0.35), recover: 16 }; },
    sound: 'pistol',
    view: { pos: [0.16, -0.15, -0.34], ads: [0, -0.095, -0.3], kick: 0.06, scale: 1 },
    stats: { dmg: 0.4, rate: 0.5, recoil: 0.25, range: 0.45 },
  },
  {
    id: 'vk9',
    name: 'VK-9',
    cls: 'SMG',
    desc: 'Dakikada 900. Yakında ölümcül, uzakta dağınık.',
    auto: true,
    rpm: 900,
    mag: 30,
    reloadTime: 2.2,
    cycle: 'auto',
    cycleTime: 0,
    dmg: 26,
    headMult: 3.2,
    pellets: 1,
    spread: { base: 0.45, perShot: 0.22, max: 3.4, recover: 8 },
    zoom: 1,
    recoil(i) {
      const climb = i < 6 ? 0.75 + i * 0.08 : 0.85;
      const drift = i < 6 ? 0.1 : 0.55 * Math.sin((i - 6) * 0.55);
      return { pitch: deg(climb), yaw: deg(drift), recover: 13 };
    },
    sound: 'smg',
    view: { pos: [0.17, -0.155, -0.36], ads: [0, -0.1, -0.3], kick: 0.045, scale: 1 },
    stats: { dmg: 0.3, rate: 1, recoil: 0.45, range: 0.4 },
  },
  {
    id: 'ar7',
    name: 'AR-7',
    cls: 'KARABİNA',
    desc: 'Önce dik tırmanır, sonra sağa-sola yatar. Deseni öğren.',
    auto: true,
    rpm: 600,
    mag: 30,
    reloadTime: 2.45,
    cycle: 'auto',
    cycleTime: 0,
    dmg: 33,
    headMult: 4,
    pellets: 1,
    spread: { base: 0.3, perShot: 0.28, max: 3.8, recover: 7 },
    zoom: 1,
    recoil(i) {
      // Classic 'T' pattern: 1–8 straight up, 9–16 right, 17–24 left, then jitter.
      const climb = i < 8 ? 1.05 + i * 0.14 : i < 11 ? 1.6 - (i - 8) * 0.25 : 0.65;
      let yaw;
      if (i < 8) yaw = (i % 3 === 0 ? -1 : 1) * 0.12;
      else if (i < 16) yaw = 0.9;
      else if (i < 24) yaw = -1.05;
      else yaw = Math.sin(i * 1.3) * 0.8;
      return { pitch: deg(climb), yaw: deg(yaw), recover: 11 };
    },
    sound: 'rifle',
    view: { pos: [0.17, -0.155, -0.36], ads: [0, -0.104, -0.31], kick: 0.07, scale: 1 },
    stats: { dmg: 0.55, rate: 0.7, recoil: 0.7, range: 0.75 },
  },
  {
    id: 'scout',
    name: 'SCOUT-M',
    cls: 'KESKİN NİŞANCI',
    desc: 'Sürgülü. Tek atış, 4× dürbün, mazeret yok.',
    auto: false,
    rpm: 50,
    mag: 5,
    reloadTime: 2.9,
    cycle: 'bolt',
    cycleTime: 1.15,
    dmg: 90,
    headMult: 2.5,
    pellets: 1,
    spread: { base: 0.05, perShot: 3, max: 3, recover: 6, hipfire: 5.5 },
    zoom: 4,
    recoil() { return { pitch: deg(4.5), yaw: deg(0.6), recover: 9 }; },
    sound: 'sniper',
    view: { pos: [0.17, -0.16, -0.36], ads: [0, -0.104, -0.32], kick: 0.14, scale: 1 },
    stats: { dmg: 1, rate: 0.12, recoil: 0.9, range: 1 },
  },
  {
    id: 'h12',
    name: 'HAMMER-12',
    cls: 'POMPALI',
    desc: 'Dokuz saçma, bir pompa. Yakın mesafe hakimiyeti.',
    auto: false,
    rpm: 72,
    mag: 7,
    reloadTime: 3.4,
    cycle: 'pump',
    cycleTime: 0.78,
    dmg: 12,
    headMult: 2.5,
    pellets: 9,
    spread: { base: 3.6, perShot: 0.4, max: 5, recover: 8 },
    zoom: 1,
    recoil() { return { pitch: deg(5.2), yaw: deg(0.9), recover: 10 }; },
    sound: 'shotgun',
    view: { pos: [0.17, -0.16, -0.36], ads: [0, -0.107, -0.32], kick: 0.16, scale: 1 },
    stats: { dmg: 0.85, rate: 0.18, recoil: 1, range: 0.2 },
  },
]);

export function weaponById(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[2];
}
