import * as THREE from 'three';

// Common target interface:
//   root: Group        — placed by TargetManager
//   hitMeshes: Mesh[]  — raycast candidates; mesh.userData.zone = 'head' | ...
//   hp, maxHp, alive, radius (for spacing), grounded (bool)
//   update(dt, ctx)    — animation; ctx = { time, mode, rng, bounds }
//   onHit(zone, dmg, point) → { dead, mult }
//   die()              — start death animation; returns seconds until removal
//   dispose()

export class TargetBase {
  constructor(style, weaponHeadMult) {
    this.style = style;
    this.root = new THREE.Group();
    this.hitMeshes = [];
    this.maxHp = style.hp;
    this.hp = style.hp;
    this.alive = true;
    this.dying = 0;
    this.radius = 0.6;
    this.grounded = false;
    this.born = 0;
    this.headMult = weaponHeadMult;
    this.flash = 0;
    this.flashMats = [];
  }

  zoneMult(zone) {
    const z = this.style.zones[zone];
    if (z === 'headMult') return this.headMult;
    return typeof z === 'number' ? z : 1;
  }

  onHit(zone, dmg) {
    const mult = this.zoneMult(zone);
    this.hp -= dmg * mult;
    this.flash = 1;
    return { dead: this.hp <= 0, mult, zone };
  }

  _registerHit(mesh, zone) {
    mesh.userData.zone = zone;
    mesh.userData.target = this;
    this.hitMeshes.push(mesh);
    if (mesh.material && mesh.material.emissive) this.flashMats.push(mesh.material);
  }

  _applyFlash(dt) {
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - dt * 8);
    for (const m of this.flashMats) m.emissiveIntensity = (m.userData.e0 ?? 0) + this.flash * 2.2;
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  }
}

export const mat = {
  std: (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.2, ...extra });
    m.userData.e0 = extra.emissiveIntensity ?? 0;
    return m;
  },
};

export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}
export function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 14) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  return mesh;
}
export function sphere(r, m, x = 0, y = 0, z = 0, seg = 18) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 6)), m);
  mesh.position.set(x, y, z);
  return mesh;
}
export function capsule(r, len, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
  mesh.position.set(x, y, z);
  return mesh;
}
