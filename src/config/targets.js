// Target styles. Geometry and behaviour live in render/targets/*.js.
export const TARGET_STYLES = Object.freeze([
  {
    id: 'sphere',
    name: 'KÜRE',
    desc: 'Klasik aim-trainer küresi. Tek vuruş, saf refleks.',
    hp: 1,
    zones: { body: 1 },
    distance: [18, 18],
    altitude: [-0.8, 3.6],
    spreadYaw: 32,
    minSep: 1.8,
    kill: 100,
  },
  {
    id: 'operator',
    name: 'OPERATÖR',
    desc: 'Zırhlı düşman piyade. Kafa 4×, gövde 1×, uzuv 0.6×.',
    hp: 100,
    zones: { head: 'headMult', torso: 1, limb: 0.6 },
    distance: [8, 19],
    altitude: null, // stands on the floor
    spreadYaw: 44,
    minSep: 2.2,
    kill: 150,
    headshotBonus: 60,
  },
  {
    id: 'heli',
    name: 'HELİKOPTER',
    desc: 'Hafif saldırı helikopteri. 300 HP, motor bloğu 1.5×, kokpit 1.3×.',
    hp: 300,
    zones: { hull: 1, cockpit: 1.3, engine: 1.5, tail: 0.7 },
    distance: [20, 36],
    altitude: [2.5, 8],
    spreadYaw: 40,
    minSep: 7,
    kill: 400,
  },
]);

export function targetStyleById(id) {
  return TARGET_STYLES.find((t) => t.id === id) || TARGET_STYLES[0];
}
