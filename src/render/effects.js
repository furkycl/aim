import * as THREE from 'three';

// Hit bursts, shockwave rings, muzzle flash, camera kick, tracking sparks.
const MAX_PARTICLES = 1400;

export class Effects {
  constructor(view, settings) {
    this.view = view;
    this.settings = settings;
    this.scene = view.scene;
    this.rings = [];
    this.kick = 0;
    this.shake = 0;
    this.flashT = 0;

    // particle pool
    this.n = MAX_PARTICLES;
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n);
    this.col = new Float32Array(this.n * 3);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 2] = 999; // park off-screen

    // muzzle flash light + sprite
    this.flash = new THREE.PointLight(0x00f0ff, 0, 10, 2);
    this.flash.position.set(0.25, -0.25, -0.8);
    view.camera.add(this.flash);

    this.ringGeo = new THREE.RingGeometry(0.2, 0.3, 48);
    this.ringMatBase = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    this.palette = [new THREE.Color(0x00f0ff), new THREE.Color(0xffffff), new THREE.Color(0xffe600), new THREE.Color(0xff3b6b)];
  }

  _emit(origin, count, speed, colorA, colorB, spread = 1) {
    if (!this.settings.data.video.particles) return;
    for (let k = 0; k < count; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
      const o = i * 3;
      this.pos[o] = origin.x; this.pos[o + 1] = origin.y; this.pos[o + 2] = origin.z;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.vel[o] = Math.sin(ph) * Math.cos(th) * sp * spread;
      this.vel[o + 1] = Math.sin(ph) * Math.sin(th) * sp * spread;
      this.vel[o + 2] = Math.cos(ph) * sp;
      this.life[i] = 0.5 + Math.random() * 0.6;
      const c = colorA.clone().lerp(colorB, Math.random());
      this.col[o] = c.r; this.col[o + 1] = c.g; this.col[o + 2] = c.b;
    }
  }

  spawn(t) {
    this._emit(t.mesh.position, 14, 2.2, this.palette[0], this.palette[1], 1);
  }

  kill(t, point, streak) {
    const hot = streak >= 8 ? this.palette[3] : streak >= 4 ? this.palette[2] : this.palette[0];
    this._emit(point, 90, 7, hot, this.palette[1], 1);
    this._emit(t.mesh.position, 40, 3, hot, hot, 1);
    this._ring(t.mesh.position, hot);
    if (this.settings.data.video.shake) this.shake = Math.max(this.shake, 0.35);
    const hm = document.getElementById('hitmarker');
    hm.classList.remove('hit'); void hm.offsetWidth; hm.classList.add('hit');
    hm.classList.toggle('kill', streak >= 4);
  }

  _ring(position, color) {
    const m = new THREE.Mesh(this.ringGeo, this.ringMatBase.clone());
    m.material.color.copy(color);
    m.position.copy(position);
    m.position.z += 0.1;
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0 });
  }

  muzzle() {
    this.flashT = 1;
    if (this.settings.data.video.shake) this.kick = 1;
  }

  miss() {
    const v = document.getElementById('damage-vignette');
    v.classList.add('flash'); void v.offsetWidth; v.classList.remove('flash');
  }

  trackSpark(point) {
    if (Math.random() < 0.5) this._emit(point, 2, 1.4, this.palette[0], this.palette[1], 1);
  }

  clear() {
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.rings.length = 0;
    for (let i = 0; i < this.n; i++) { this.life[i] = 0; this.pos[i * 3 + 2] = 999; }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  update(dt, camera) {
    // particles
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] -= 6 * dt;
      this.vel[o] *= 0.985; this.vel[o + 1] *= 0.985; this.vel[o + 2] *= 0.985;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.life[i] <= 0) this.pos[o + 2] = 999;
    }
    if (any) this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt * 2.6;
      const s = 1 + r.t * 6;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = Math.max(0, 0.9 * (1 - r.t));
      if (r.t >= 1) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(i, 1); }
    }

    // muzzle flash + camera kick/shake (applied on top of look rotation)
    this.flashT = Math.max(0, this.flashT - dt * 10);
    this.flash.intensity = this.flashT * 14;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const kickX = this.kick * 0.012;
    const sx = (Math.random() - 0.5) * this.shake * 0.02;
    const sy = (Math.random() - 0.5) * this.shake * 0.02;
    camera.rotation.x += kickX + sy;
    camera.rotation.y += sx;
    camera.rotation.z = sx * 0.6;
  }
}
