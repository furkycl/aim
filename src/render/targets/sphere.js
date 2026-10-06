import * as THREE from 'three';
import { TargetBase } from './base.js';

const geoCache = new Map();
function sphereGeo(r) {
  const k = r.toFixed(3);
  if (!geoCache.has(k)) { const g = new THREE.SphereGeometry(r, 28, 20); g.userData.shared = true; geoCache.set(k, g); }
  return geoCache.get(k);
}
const ringGeoCache = new Map();
function ringGeo(r) {
  const k = r.toFixed(3);
  if (!ringGeoCache.has(k)) { const g = new THREE.RingGeometry(r * 1.25, r * 1.45, 40); g.userData.shared = true; ringGeoCache.set(k, g); }
  return ringGeoCache.get(k);
}

export class SphereTarget extends TargetBase {
  constructor(style, headMult, radius, movingHp) {
    super(style, headMult);
    this.radius = radius;
    if (movingHp) { this.hp = this.maxHp = movingHp; }
    const m = new THREE.MeshStandardMaterial({ color: 0x0b1420, emissive: new THREE.Color(0x00f0ff), emissiveIntensity: 1.6, roughness: 0.35, metalness: 0.1 });
    m.userData.e0 = 1.6;
    this.mesh = new THREE.Mesh(sphereGeo(radius), m);
    this.ring = new THREE.Mesh(ringGeo(radius), new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    this.ring.position.z = 0.05;
    this.mesh.add(this.ring);
    this.root.add(this.mesh);
    this._registerHit(this.mesh, 'body');
    this.scale = 0.01;
    this.root.scale.setScalar(0.01);
  }

  update(dt, ctx) {
    if (this.scale < 1 && !this.dying) {
      this.scale = Math.min(1, this.scale + dt * 7);
      this.root.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - this.scale, 3)) * (this.shrink ?? 1));
    } else if (this.shrink != null) {
      this.root.scale.setScalar(this.shrink);
    }
    this.ring.rotation.z += dt * 1.5;
    this.ring.lookAt(ctx.cameraPos);
    this._applyFlash(dt);
    if (this.maxHp > 1) {
      // damaged spheres cool from cyan to red
      const k = 1 - this.hp / this.maxHp;
      this.mesh.material.emissive.setRGB(k, 0.94 * (1 - k) + 0.2 * k, 1 - k);
    }
    if (this.dying) {
      this.dying += dt;
      this.root.scale.setScalar(Math.max(0.001, (1 - this.dying * 6)));
    }
  }

  die() { this.alive = false; this.dying = 0.0001; return 0.16; }
}
