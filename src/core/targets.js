import * as THREE from 'three';

// Target wall sits at z = -WALL_Z in front of the player (player at origin).
export const WALL_Z = 18;

const geoCache = new Map();
function sphereGeo(r) {
  const k = r.toFixed(3);
  if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, 28, 20));
  return geoCache.get(k);
}

export class TargetManager {
  constructor(scene, mode, rng, hooks) {
    this.scene = scene;
    this.mode = mode;
    this.rng = rng; // seeded, see game.js
    this.hooks = hooks; // { onSpawn(t), onKill(t, point), onMiss() }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.targets = [];
    this.spawnTimer = 0;
    this.spiderCenter = false;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.color = new THREE.Color();
    this._mat = new THREE.MeshStandardMaterial({
      color: 0x0b1420,
      emissive: new THREE.Color(0x00f0ff),
      emissiveIntensity: 1.6,
      roughness: 0.35,
      metalness: 0.1,
    });
    this._ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  }

  start() {
    this.spawnTimer = 0;
    if (this.mode.kind === 'flick' || this.mode.kind === 'spider') {
      this._scheduleSpawn();
    } else {
      for (let i = 0; i < this.mode.targets; i++) this.spawn();
    }
  }

  dispose() {
    for (const t of this.targets) this.group.remove(t.mesh);
    this.targets.length = 0;
    this.scene.remove(this.group);
  }

  _scheduleSpawn() {
    const [a, b] = this.mode.spawnDelay || [0.3, 0.6];
    this.spawnTimer = a + this.rng() * (b - a);
  }

  _randomPos(avoid) {
    const { w, h } = this.mode.spread;
    const minDist = this.mode.radius * 3.2;
    for (let tries = 0; tries < 40; tries++) {
      const x = (this.rng() - 0.5) * w;
      const y = (this.rng() - 0.5) * h + 0.4;
      let ok = true;
      for (const t of avoid) {
        if (Math.hypot(t.mesh.position.x - x, t.mesh.position.y - y) < minDist) { ok = false; break; }
      }
      if (ok) return new THREE.Vector3(x, y, -WALL_Z);
    }
    return new THREE.Vector3((this.rng() - 0.5) * w, (this.rng() - 0.5) * h, -WALL_Z);
  }

  spawn() {
    const m = this.mode;
    let pos;
    if (m.kind === 'spider') {
      pos = this.spiderCenter ? new THREE.Vector3(0, 0.4, -WALL_Z) : this._randomPos(this.targets);
      this.spiderCenter = !this.spiderCenter;
    } else {
      pos = this._randomPos(this.targets);
    }

    const r = m.radius;
    const mesh = new THREE.Mesh(sphereGeo(r), this._mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.01);

    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 1.45, 40), this._ringMat);
    ring.position.set(0, 0, 0.05);
    mesh.add(ring);

    this.group.add(mesh);

    const t = {
      mesh,
      ring,
      born: this.time,
      radius: r,
      alive: true,
      spawnScale: 0,
      // tracking motion state
      phase: this.rng() * Math.PI * 2,
      speed: 0.8 + this.rng() * 0.5,
      dir: new THREE.Vector3((this.rng() - 0.5) * 2, (this.rng() - 0.5) * 2, 0).normalize(),
      turnTimer: 0,
      base: pos.clone(),
    };
    this.targets.push(t);
    this.hooks.onSpawn?.(t);
    return t;
  }

  update(dt) {
    this.time += dt;
    const m = this.mode;

    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 0; this.spawn(); }
    }

    for (const t of this.targets) {
      // pop-in
      if (t.spawnScale < 1) {
        t.spawnScale = Math.min(1, t.spawnScale + dt * 7);
        const s = 1 - Math.pow(1 - t.spawnScale, 3);
        t.mesh.scale.setScalar(Math.max(0.01, s));
      }
      t.ring.rotation.z += dt * 1.5;

      if (m.kind === 'shrink') {
        const age = this.time - t.born;
        const k = Math.max(0.35, 1 - age / m.shrinkTime);
        t.mesh.scale.setScalar(Math.min(t.mesh.scale.x, k));
        if (t.spawnScale >= 1) t.mesh.scale.setScalar(k);
        if (age > m.shrinkTime + 1.2) {
          // expired: counts as a miss and respawns
          this._remove(t);
          this.hooks.onExpire?.(t);
          this.spawn();
        }
      } else if (m.kind === 'tracking') {
        t.turnTimer -= dt;
        if (t.turnTimer <= 0) {
          t.turnTimer = 0.6 + this.rng() * 1.2;
          t.dir.set((this.rng() - 0.5) * 2, (this.rng() - 0.5) * 1.2, 0).normalize();
          t.speed = 2.2 + this.rng() * 3.2;
        }
        const p = t.mesh.position;
        p.addScaledVector(t.dir, t.speed * dt);
        p.y += Math.sin(this.time * 2.3 + t.phase) * dt * 0.9;
        const { w, h } = m.spread;
        if (p.x < -w / 2 || p.x > w / 2) { t.dir.x *= -1; p.x = THREE.MathUtils.clamp(p.x, -w / 2, w / 2); }
        if (p.y < -h / 2 || p.y > h / 2 + 0.8) { t.dir.y *= -1; p.y = THREE.MathUtils.clamp(p.y, -h / 2, h / 2 + 0.8); }
      }
    }
  }

  _remove(t) {
    t.alive = false;
    this.group.remove(t.mesh);
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
  }

  // Ray from camera centre. Returns { target, point } or null.
  cast(camera) {
    this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const meshes = this.targets.map((t) => t.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const target = this.targets.find((t) => t.mesh === hits[0].object);
    return target ? { target, point: hits[0].point } : null;
  }

  // A shot: resolve hit/miss for click-based modes.
  shoot(camera) {
    const hit = this.cast(camera);
    if (!hit) { this.hooks.onMiss?.(); return null; }
    const t = hit.target;
    const reaction = this.time - t.born;
    this._remove(t);
    this.hooks.onKill?.(t, hit.point, reaction);
    if (this.mode.kind === 'flick' || this.mode.kind === 'spider') this._scheduleSpawn();
    else this.spawn();
    return t;
  }

  // Tracking: how much of this frame the crosshair was on target.
  track(camera, dt) {
    const hit = this.cast(camera);
    return hit ? { on: true, dt, target: hit.target, point: hit.point } : { on: false, dt };
  }
}
