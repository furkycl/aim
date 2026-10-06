import * as THREE from 'three';

// Procedural first-person weapon meshes. Each builder returns a Group with
// named parts the viewmodel animates: slide, bolt, pump, mag, muzzle (Object3D
// marking the muzzle position), eject (shell ejection point).
//
// Axis convention: weapon points down -Z (toward the target), +X is right.

const M = {
  metal: () => new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.85, roughness: 0.32 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.7, roughness: 0.45 }),
  polymer: () => new THREE.MeshStandardMaterial({ color: 0x2c313b, metalness: 0.15, roughness: 0.75 }),
  grip: () => new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.05, roughness: 0.95 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x4a3222, metalness: 0.05, roughness: 0.8 }),
  accent: () => new THREE.MeshStandardMaterial({ color: 0x0b1a1f, emissive: 0x00f0ff, emissiveIntensity: 1.4, roughness: 0.4 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x66ccff, metalness: 0, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.7, thickness: 0.2 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.35 }),
};

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
// Cylinder along Z (barrel-like)
function tube(r, len, mat, x = 0, y = 0, z = 0, seg = 18) {
  const m = cyl(r, r, len, mat, x, y, z, seg);
  m.rotation.x = Math.PI / 2;
  return m;
}
function marker(x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); return o; }
function named(o, name) { o.name = name; return o; }

function ironSights(g, y, zFront, zRear, mat) {
  g.add(box(0.006, 0.02, 0.006, mat, 0, y, zFront)); // front post
  const rear = box(0.03, 0.016, 0.008, mat, 0, y - 0.002, zRear);
  g.add(rear);
  g.add(box(0.004, 0.012, 0.006, M.accent(), 0, y + 0.012, zFront)); // glowing tip
}

export function buildPistol() {
  const g = new THREE.Group();
  const frame = M.polymer(), metal = M.metal();
  // frame + grip
  g.add(box(0.034, 0.045, 0.17, frame, 0, -0.005, 0));
  const grip = box(0.032, 0.11, 0.055, M.grip(), 0, -0.075, 0.06);
  grip.rotation.x = -0.28;
  g.add(grip);
  g.add(box(0.03, 0.018, 0.06, frame, 0, -0.045, -0.01)); // trigger guard base
  g.add(box(0.006, 0.03, 0.006, metal, 0, -0.045, 0.012)); // trigger
  // slide
  const slide = new THREE.Group();
  slide.add(box(0.036, 0.034, 0.185, metal, 0, 0.03, -0.01));
  for (let i = 0; i < 5; i++) slide.add(box(0.038, 0.012, 0.004, M.dark(), 0, 0.03, 0.05 + i * 0.012)); // serrations
  slide.add(tube(0.008, 0.03, M.dark(), 0, 0.03, -0.115)); // barrel tip
  ironSights(slide, 0.055, -0.095, 0.07, metal);
  slide.name = 'slide';
  g.add(slide);
  // magazine
  const mag = box(0.024, 0.09, 0.034, M.dark(), 0, -0.08, 0.06);
  mag.rotation.x = -0.28; mag.name = 'mag';
  g.add(mag);
  g.add(box(0.03, 0.006, 0.08, M.accent(), 0, -0.02, -0.03)); // accent rail
  g.add(named(marker(0, 0.03, -0.13), 'muzzle'));
  g.add(named(marker(0.02, 0.045, 0.0), 'eject'));
  g.userData.kind = 'pistol';
  return g;
}

export function buildSmg() {
  const g = new THREE.Group();
  const metal = M.metal(), poly = M.polymer();
  g.add(box(0.05, 0.06, 0.3, poly, 0, 0, 0)); // receiver
  g.add(box(0.052, 0.02, 0.18, metal, 0, 0.04, -0.03)); // top rail
  for (let i = 0; i < 9; i++) g.add(box(0.054, 0.006, 0.006, M.dark(), 0, 0.052, -0.11 + i * 0.02));
  g.add(tube(0.012, 0.12, metal, 0, 0.012, -0.21)); // barrel
  g.add(tube(0.022, 0.05, M.dark(), 0, 0.012, -0.26)); // suppressor-ish muzzle
  const mag = box(0.03, 0.17, 0.045, M.dark(), 0, -0.12, -0.03);
  mag.rotation.x = 0.1; mag.name = 'mag';
  g.add(mag);
  const grip = box(0.034, 0.1, 0.05, M.grip(), 0, -0.075, 0.09);
  grip.rotation.x = -0.3; g.add(grip);
  g.add(box(0.03, 0.02, 0.06, poly, 0, -0.04, 0.05)); // trigger guard
  // folding stock (two rods + pad)
  g.add(tube(0.006, 0.16, metal, 0.016, 0.01, 0.23));
  g.add(tube(0.006, 0.16, metal, -0.016, 0.01, 0.23));
  g.add(box(0.045, 0.06, 0.02, M.grip(), 0, 0.0, 0.31));
  g.add(box(0.012, 0.012, 0.3, M.accent(), 0.031, 0.0, 0.0)); // side accent strip
  const bolt = box(0.014, 0.014, 0.05, metal, 0.03, 0.02, 0.04);
  bolt.name = 'bolt'; g.add(bolt);
  ironSights(g, 0.07, -0.12, 0.08, metal);
  g.add(named(marker(0, 0.012, -0.29), 'muzzle'));
  g.add(named(marker(0.03, 0.02, 0.02), 'eject'));
  g.userData.kind = 'smg';
  return g;
}

export function buildRifle() {
  const g = new THREE.Group();
  const metal = M.metal(), poly = M.polymer();
  g.add(box(0.05, 0.07, 0.26, poly, 0, 0, 0.02)); // upper/lower receiver
  g.add(box(0.044, 0.044, 0.28, poly, 0, 0.0, -0.25)); // handguard
  for (let i = 0; i < 6; i++) g.add(box(0.05, 0.004, 0.012, M.dark(), 0, 0.0, -0.16 - i * 0.04)); // vents
  g.add(box(0.05, 0.016, 0.5, metal, 0, 0.045, -0.12)); // top rail
  for (let i = 0; i < 20; i++) g.add(box(0.052, 0.005, 0.006, M.dark(), 0, 0.055, -0.35 + i * 0.022));
  g.add(tube(0.011, 0.16, metal, 0, 0.012, -0.46)); // barrel
  g.add(box(0.03, 0.03, 0.05, M.dark(), 0, 0.012, -0.55)); // flash hider
  // curved magazine (3 segments)
  const mag = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const seg = box(0.03, 0.065, 0.055, M.dark(), 0, -0.06 - i * 0.058, -0.02 + i * 0.012);
    seg.rotation.x = 0.12 * (i + 1); mag.add(seg);
  }
  mag.name = 'mag'; g.add(mag);
  const grip = box(0.034, 0.11, 0.05, M.grip(), 0, -0.08, 0.1);
  grip.rotation.x = -0.32; g.add(grip);
  g.add(box(0.03, 0.02, 0.07, poly, 0, -0.045, 0.04)); // trigger guard
  // stock
  g.add(box(0.04, 0.045, 0.2, poly, 0, 0.0, 0.25));
  g.add(box(0.05, 0.085, 0.03, M.grip(), 0, -0.015, 0.36));
  // optic block (holo)
  const optic = new THREE.Group();
  optic.add(box(0.034, 0.03, 0.07, M.dark(), 0, 0.075, -0.02));
  optic.add(box(0.03, 0.03, 0.004, M.glass(), 0, 0.085, -0.055));
  optic.add(box(0.004, 0.004, 0.004, M.accent(), 0, 0.085, -0.045));
  g.add(optic);
  const bolt = box(0.012, 0.012, 0.04, metal, 0.032, 0.02, 0.03);
  bolt.name = 'bolt'; g.add(bolt);
  g.add(box(0.008, 0.008, 0.25, M.accent(), -0.027, -0.005, -0.25)); // accent strip
  g.add(named(marker(0, 0.012, -0.58), 'muzzle'));
  g.add(named(marker(0.03, 0.02, 0.02), 'eject'));
  g.userData.kind = 'rifle';
  return g;
}

export function buildSniper() {
  const g = new THREE.Group();
  const metal = M.metal(), poly = M.polymer();
  g.add(box(0.046, 0.06, 0.34, poly, 0, -0.01, 0.0)); // chassis
  g.add(box(0.04, 0.04, 0.3, poly, 0, -0.01, -0.3)); // forend
  g.add(tube(0.014, 0.5, metal, 0, 0.012, -0.55)); // long barrel
  g.add(tube(0.022, 0.07, M.dark(), 0, 0.012, -0.8)); // muzzle brake
  g.add(box(0.03, 0.02, 0.04, M.dark(), 0, 0.012, -0.8));
  // scope
  const scope = new THREE.Group();
  scope.add(tube(0.018, 0.2, M.dark(), 0, 0.075, -0.05));
  scope.add(tube(0.026, 0.05, M.dark(), 0, 0.075, -0.16));
  scope.add(tube(0.022, 0.04, M.dark(), 0, 0.075, 0.06));
  scope.add(tube(0.02, 0.004, M.glass(), 0, 0.075, -0.185));
  scope.add(box(0.012, 0.012, 0.02, metal, 0, 0.1, -0.02)); // turret
  scope.add(box(0.012, 0.012, 0.02, metal, 0.028, 0.075, -0.02));
  scope.add(box(0.03, 0.012, 0.02, metal, 0, 0.05, -0.1)); // mounts
  scope.add(box(0.03, 0.012, 0.02, metal, 0, 0.05, 0.02));
  g.add(scope);
  // bolt handle
  const bolt = new THREE.Group();
  bolt.add(tube(0.008, 0.07, metal, 0.0, 0.02, 0.08));
  const handle = cyl(0.005, 0.005, 0.05, metal, 0.04, 0.012, 0.1);
  handle.rotation.z = Math.PI / 2; bolt.add(handle);
  bolt.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), metal)).position.set(0.065, 0.012, 0.1);
  bolt.name = 'bolt'; g.add(bolt);
  const mag = box(0.03, 0.05, 0.07, M.dark(), 0, -0.06, -0.06);
  mag.name = 'mag'; g.add(mag);
  const grip = box(0.034, 0.1, 0.05, M.grip(), 0, -0.08, 0.1);
  grip.rotation.x = -0.3; g.add(grip);
  g.add(box(0.03, 0.02, 0.07, poly, 0, -0.045, 0.05));
  g.add(box(0.04, 0.06, 0.22, poly, 0, -0.005, 0.28)); // stock
  g.add(box(0.05, 0.09, 0.03, M.grip(), 0, -0.02, 0.4));
  g.add(box(0.04, 0.02, 0.06, poly, 0, 0.035, 0.3)); // cheek riser
  // bipod (folded)
  g.add(tube(0.004, 0.12, metal, 0.016, -0.035, -0.4));
  g.add(tube(0.004, 0.12, metal, -0.016, -0.035, -0.4));
  g.add(box(0.008, 0.008, 0.3, M.accent(), 0.024, -0.03, -0.25));
  g.add(named(marker(0, 0.012, -0.84), 'muzzle'));
  g.add(named(marker(0.03, 0.03, 0.06), 'eject'));
  g.userData.kind = 'sniper';
  return g;
}

export function buildShotgun() {
  const g = new THREE.Group();
  const metal = M.metal(), wood = M.wood();
  g.add(box(0.05, 0.065, 0.22, metal, 0, 0, 0.02)); // receiver
  g.add(tube(0.016, 0.5, metal, 0, 0.02, -0.33)); // barrel
  g.add(tube(0.013, 0.46, M.dark(), 0, -0.012, -0.33)); // tube magazine
  g.add(box(0.03, 0.016, 0.01, metal, 0, 0.045, -0.56)); // bead base
  g.add(box(0.006, 0.006, 0.006, M.accent(), 0, 0.055, -0.56)); // bead
  const pump = new THREE.Group();
  pump.add(box(0.05, 0.05, 0.14, wood, 0, 0.004, -0.28));
  for (let i = 0; i < 6; i++) pump.add(box(0.052, 0.004, 0.004, M.dark(), 0, 0.03, -0.33 + i * 0.02));
  pump.name = 'pump'; g.add(pump);
  g.add(box(0.03, 0.02, 0.07, metal, 0, -0.045, 0.06)); // trigger guard
  g.add(box(0.006, 0.028, 0.006, metal, 0, -0.045, 0.045)); // trigger
  // stock (pistol-grip style, wood)
  const grip = box(0.036, 0.1, 0.05, wood, 0, -0.08, 0.12);
  grip.rotation.x = -0.3; g.add(grip);
  g.add(box(0.042, 0.055, 0.22, wood, 0, -0.005, 0.25));
  g.add(box(0.05, 0.09, 0.03, M.grip(), 0, -0.02, 0.37));
  // shell holder on the side (brass caps)
  for (let i = 0; i < 4; i++) {
    const s = tube(0.009, 0.045, new THREE.MeshStandardMaterial({ color: 0xb8303a, roughness: 0.6 }), -0.034, 0.01, -0.02 + i * 0.03);
    s.rotation.x = 0; s.rotation.z = Math.PI / 2; s.rotation.y = Math.PI / 2;
    g.add(s);
    g.add(cyl(0.0095, 0.0095, 0.012, M.brass(), -0.034, 0.01, -0.02 + i * 0.03).rotateZ(Math.PI / 2));
  }
  g.add(box(0.008, 0.008, 0.18, M.accent(), 0.027, 0.0, 0.02));
  g.add(named(marker(0, 0.02, -0.58), 'muzzle'));
  g.add(named(marker(0.03, 0.02, 0.0), 'eject'));
  g.userData.kind = 'shotgun';
  return g;
}

export function buildWeaponMesh(def) {
  switch (def.sound) {
    case 'pistol': return buildPistol();
    case 'smg': return buildSmg();
    case 'sniper': return buildSniper();
    case 'shotgun': return buildShotgun();
    default: return buildRifle();
  }
}

// Low-poly hands (gloves) so the weapon is not floating.
export function buildHands() {
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0x1f2227, roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a3a2e, roughness: 0.95 });
  const right = new THREE.Group();
  right.add(box(0.05, 0.045, 0.07, glove, 0, 0, 0));
  right.add(box(0.06, 0.06, 0.16, sleeve, 0.02, -0.02, 0.12));
  right.name = 'handR';
  const left = new THREE.Group();
  left.add(box(0.05, 0.045, 0.07, glove, 0, 0, 0));
  left.add(box(0.06, 0.06, 0.16, sleeve, -0.03, -0.03, 0.1));
  left.name = 'handL';
  g.add(right, left);
  return g;
}

// Shell casing mesh (shared geometry).
const shellGeo = new THREE.CylinderGeometry(0.004, 0.0045, 0.022, 8);
const shellGeoShot = new THREE.CylinderGeometry(0.0085, 0.0085, 0.05, 8);
const brass = M.brass();
const red = new THREE.MeshStandardMaterial({ color: 0xb8303a, roughness: 0.6 });
export function makeShell(kind) {
  return new THREE.Mesh(kind === 'shotgun' ? shellGeoShot : shellGeo, kind === 'shotgun' ? red : brass);
}
