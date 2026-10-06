import * as THREE from 'three';
import { SphereTarget } from '../render/targets/sphere.js';
import { OperatorTarget } from '../render/targets/operator.js';
import { HeliTarget } from '../render/targets/heli.js';

export const FLOOR_Y = -2.0; // eye height is 0
export const WALL_Z = 18;

// Spawns, moves, hit-tests and retires targets for a (mode × style) pair.
export class TargetManager {
  constructor(scene, mode, style, rng, hooks, weaponDef) {
    this.scene = scene;
    this.mode = mode;
    this.style = style;
    this.rng = rng;
    this.hooks = hooks; // onSpawn(t), onKill(t, point, reaction, info), onMiss(), onExpire(t), onHit(t, point, info), smoke(pos, n), fire(pos)
    this.weaponDef = weaponDef;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.targets = [];
    this.retiring = [];
    this.spawnTimer = 0;
    this.spiderCenter = false;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    this.tmpV = new THREE.Vector3();
  }

  start() {
    if (this.mode.kind === 'flick' || this.mode.kind === 'spider') this._scheduleSpawn();
    else for (let i = 0; i < this.mode.targets; i++) this.spawn();
  }

  dispose() {
    for (const t of this.targets) { this.group.remove(t.root); t.dispose(); }
    for (const r of this.retiring) { this.group.remove(r.t.root); r.t.dispose(); }
    this.targets.length = 0; this.retiring.length = 0;
    this.scene.remove(this.group);
  }

  _scheduleSpawn() {
    const [a, b] = this.mode.spawnDelay || [0.3, 0.6];
    this.spawnTimer = a + this.rng() * (b - a);
  }

  _makeTarget() {
    const s = this.style;
    const hm = this.weaponDef.headMult;
    switch (s.id) {
      case 'operator': return new OperatorTarget(s, hm);
      case 'heli': return new HeliTarget(s, hm);
      default: {
        const r = this.mode.radius;
        const moving = this.mode.kind === 'tracking';
        return new SphereTarget(s, hm, r, moving ? 120 : 0);
      }
    }
  }

  // Angular placement: yaw within ±spreadYaw/2 (scaled by mode spread), distance
  // from the style range, altitude from the style range or on the floor.
  _randomPlacement(target, avoid) {
    const s = this.style;
    const modeScale = this.mode.spread.w / 14; // gridshot = 1
    const yawRange = s.spreadYaw * modeScale;
    let distMul = 1;
    if (this.mode.kind === 'shrink' && s.id !== 'sphere') distMul = 1.5;
    const [d0, d1] = s.distance;
    for (let tries = 0; tries < 40; tries++) {
      const yaw = (this.rng() - 0.5) * yawRange * Math.PI / 180;
      let d = (d0 + this.rng() * (d1 - d0)) * distMul;
      if (s.id === 'sphere') d = WALL_Z;
      let y;
      if (target.grounded) y = FLOOR_Y;
      else {
        const [a0, a1] = s.altitude;
        const hScale = this.mode.spread.h / 7;
        const mid = (a0 + a1) / 2, half = (a1 - a0) / 2 * Math.min(1.3, hScale);
        y = mid + (this.rng() * 2 - 1) * half;
      }
      const p = new THREE.Vector3(Math.sin(yaw) * d, y, -Math.cos(yaw) * d);
      let ok = true;
      for (const o of avoid) {
        // angular separation matters more than metres: compare directions
        const a = Math.atan2(o.root.position.x, -o.root.position.z), b = Math.atan2(p.x, -p.z);
        const dy = Math.abs(o.root.position.y - p.y);
        const minAng = Math.atan2(s.minSep, Math.min(d, o.root.position.length()));
        if (Math.abs(a - b) < minAng && dy < s.minSep) { ok = false; break; }
      }
      if (ok) return p;
    }
    const yaw = (this.rng() - 0.5) * yawRange * Math.PI / 180;
    const d = s.id === 'sphere' ? WALL_Z : d0;
    return new THREE.Vector3(Math.sin(yaw) * d, target.grounded ? FLOOR_Y : s.altitude[0], -Math.cos(yaw) * d);
  }

  spawn() {
    const t = this._makeTarget();
    let pos;
    if (this.mode.kind === 'spider' && this.spiderCenter) {
      const d = this.style.id === 'sphere' ? WALL_Z : this.style.distance[0] + 3;
      pos = new THREE.Vector3(0, t.grounded ? FLOOR_Y : (this.style.id === 'heli' ? 4 : 1.2), -d);
      this.spiderCenter = false;
    } else {
      pos = this._randomPlacement(t, this.targets);
      if (this.mode.kind === 'spider') this.spiderCenter = true;
    }
    t.root.position.copy(pos);
    t.born = this.time;
    t.velocity = new THREE.Vector3();
    t.wander = 0;
    t.phase = this.rng() * Math.PI * 2;
    this._face(t);
    this.group.add(t.root);
    this.targets.push(t);
    this.hooks.onSpawn?.(t);
    return t;
  }

  _face(t) {
    // operators face the player; helis face their travel direction (or player when still)
    const p = t.root.position;
    // Operator front is local +z; heli nose is local -z.
    if (this.style.id === 'operator') {
      t.root.rotation.y = Math.atan2(-p.x, -p.z);
    } else if (this.style.id === 'heli') {
      const v = t.velocity;
      if (v && v.lengthSq() > 0.05) t.root.rotation.y = Math.atan2(-v.x, -v.z);
      else t.root.rotation.y = Math.atan2(p.x, p.z) + 0.35;
    }
  }

  update(dt, cameraPos) {
    this.time += dt;
    const m = this.mode;
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 0; this.spawn(); }
    }

    const ctx = { time: this.time, cameraPos, smoke: this.hooks.smoke, fire: this.hooks.fire };
    for (const t of [...this.targets]) {
      const age = this.time - t.born;
      // movement
      if (m.kind === 'tracking') this._move(t, dt);
      else if (this.style.id === 'heli') {
        // hover drift so a stationary heli still breathes
        t.root.position.x += Math.sin(this.time * 0.7 + t.phase) * dt * 0.4;
      }
      ctx.velocity = t.velocity;
      t.update(dt, ctx);

      if (m.kind === 'shrink') {
        if (this.style.id === 'sphere') {
          t.shrink = Math.max(0.35, 1 - age / m.shrinkTime);
        }
        if (age > m.shrinkTime + 1.2) {
          this._retire(t, 0);
          this.hooks.onExpire?.(t);
          this.spawn();
        }
      }
    }

    for (let i = this.retiring.length - 1; i >= 0; i--) {
      const r = this.retiring[i];
      r.left -= dt;
      ctx.velocity = null;
      r.t.update(dt, ctx);
      if (r.left <= 0) { this.group.remove(r.t.root); r.t.dispose(); this.retiring.splice(i, 1); }
    }
  }

  _move(t, dt) {
    const s = this.style;
    t.wander -= dt;
    const speed = s.id === 'heli' ? 7 : s.id === 'operator' ? 3.2 : 3.5;
    if (t.wander <= 0) {
      t.wander = 0.7 + this.rng() * 1.3;
      const dir = new THREE.Vector3((this.rng() - 0.5) * 2, s.id === 'sphere' || s.id === 'heli' ? (this.rng() - 0.5) * 0.9 : 0, (this.rng() - 0.5) * (s.id === 'heli' ? 0.8 : 0.3)).normalize();
      t.targetVel = dir.multiplyScalar(speed * (0.6 + this.rng() * 0.6));
    }
    if (!t.targetVel) t.targetVel = new THREE.Vector3();
    t.velocity.lerp(t.targetVel, Math.min(1, dt * (s.id === 'heli' ? 1.5 : 6)));
    const p = t.root.position;
    p.addScaledVector(t.velocity, dt);
    if (s.id === 'sphere') p.y += Math.sin(this.time * 2.3 + t.phase) * dt * 0.9;

    // keep inside an angular corridor and a distance band
    const yaw = Math.atan2(p.x, -p.z);
    const maxYaw = (s.spreadYaw * (this.mode.spread.w / 14)) / 2 * Math.PI / 180;
    const d = Math.hypot(p.x, p.z);
    if (Math.abs(yaw) > maxYaw) { t.targetVel.x *= -1; t.velocity.x *= -1; const cy = Math.sign(yaw) * maxYaw; p.x = Math.sin(cy) * d; p.z = -Math.cos(cy) * d; }
    const [d0, d1] = s.id === 'sphere' ? [WALL_Z - 1, WALL_Z + 1] : s.distance;
    if (d < d0 || d > d1) { t.targetVel.z *= -1; t.velocity.z *= -1; const cd = THREE.MathUtils.clamp(d, d0, d1); p.x = Math.sin(yaw) * cd; p.z = -Math.cos(yaw) * cd; }
    if (t.grounded) p.y = FLOOR_Y;
    else {
      const [a0, a1] = s.id === 'sphere' ? [-0.8, 3.6] : s.altitude;
      if (p.y < a0 || p.y > a1) { t.targetVel.y *= -1; t.velocity.y *= -1; p.y = THREE.MathUtils.clamp(p.y, a0, a1); }
    }
    this._face(t);
  }

  _retire(t, seconds) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
    t.alive = false;
    if (seconds > 0) this.retiring.push({ t, left: seconds });
    else { this.group.remove(t.root); t.dispose(); }
  }

  // Ray from camera centre, optionally deflected by spread (radians). Returns
  // { target, zone, point, distance } or null.
  cast(camera, dirOverride = null) {
    if (dirOverride) {
      camera.getWorldPosition(this.tmpV);
      this.raycaster.set(this.tmpV, dirOverride);
    } else {
      this.raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    }
    const meshes = [];
    for (const t of this.targets) for (const m of t.hitMeshes) meshes.push(m);
    if (!meshes.length) return null;
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    return { target: h.object.userData.target, zone: h.object.userData.zone, point: h.point, distance: h.distance, mesh: h.object };
  }

  // Apply a shot. Returns { hit: bool, kills: [...], hits: [...] }
  applyShot(camera, shotInfo, spreadDirs) {
    const result = { hit: false, kills: [], hits: [], headshot: false };
    const dirs = spreadDirs && spreadDirs.length ? spreadDirs : [null];
    for (const dir of dirs) {
      const h = this.cast(camera, dir);
      if (!h || !h.target.alive) continue;
      result.hit = true;
      const t = h.target;
      const r = t.onHit(h.zone, shotInfo.def.dmg, h.point);
      // Angular error between the *undeflected* aim and the centre of the zone that was hit.
      const mesh = h.mesh;
      mesh.geometry.computeBoundingSphere();
      const centre = mesh.localToWorld(mesh.geometry.boundingSphere.center.clone());
      const camPos = camera.getWorldPosition(new THREE.Vector3());
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const toC = centre.sub(camPos);
      const scale = mesh.getWorldScale(new THREE.Vector3()).x;
      const info = { zone: h.zone, mult: r.mult, point: h.point, distance: h.distance, aimErr: fwd.angleTo(toC), angR: Math.atan2(mesh.geometry.boundingSphere.radius * scale, toC.length()) };
      result.hits.push({ target: t, ...info });
      this.hooks.onHit?.(t, h.point, info);
      if (r.dead) {
        const reaction = this.time - t.born;
        const dur = t.die();
        this._retire(t, dur);
        if (h.zone === 'head') result.headshot = true;
        result.kills.push({ target: t, reaction, info });
        this.hooks.onKill?.(t, h.point, reaction, info);
        if (this.mode.kind === 'flick' || this.mode.kind === 'spider') this._scheduleSpawn();
        else this.spawn();
      }
    }
    if (!result.hit) this.hooks.onMiss?.();
    return result;
  }
}
