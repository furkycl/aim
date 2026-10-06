import * as THREE from 'three';
import { buildWeaponMesh, buildHands, makeShell } from './weaponmesh.js';

// First-person viewmodel: weapon + hands parented to the camera, with sway,
// breathing, recoil kick, ADS, reload/cycle/equip animations, muzzle flash and
// shell ejection. Everything here is cosmetic; hit logic lives in game.js.

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,240,180,0.95)');
  grd.addColorStop(0.45, 'rgba(255,170,60,0.55)');
  grd.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // star spikes
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,220,140,0.8)';
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export class ViewModel {
  constructor(view, settings) {
    this.view = view;
    this.settings = settings;
    this.camera = view.camera;
    this.root = new THREE.Group();
    this.root.name = 'viewmodel';
    this.camera.add(this.root);

    this.hands = buildHands();
    this.weapon = null;
    this.def = null;
    this.parts = {};
    this.t = 0;

    // animation state
    this.kick = 0; // 0..1 recoil kick
    this.kickRot = 0;
    this.sway = new THREE.Vector2();
    this.swayVel = new THREE.Vector2();
    this.lastLook = new THREE.Vector2();
    this.adsT = 0; // 0 hip .. 1 ads
    this.reloadT = -1; this.reloadDur = 1;
    this.cycleT = -1; this.cycleDur = 1;
    this.equipT = -1;
    this.lowered = false;

    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.flashSprite.scale.setScalar(0.0001);
    this.flashSprite.renderOrder = 10;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 6, 2);
    this.flashT = 0;

    this.shells = [];
    this.scope = null;
  }

  equip(def) {
    if (this.weapon) this.root.remove(this.weapon);
    this.def = def;
    this.weapon = buildWeaponMesh(def);
    // Smaller model close to the lens keeps the perspective distortion of a
    // wide FOV under control (a cheap stand-in for a separate viewmodel FOV).
    this.weapon.scale.setScalar(def.view.scale * 0.62);
    this.weapon.traverse((o) => { if (o.material && o.material.emissive && o.material.emissiveIntensity > 1) o.material.emissiveIntensity = 0.55; });
    this.parts = {};
    this.weapon.traverse((o) => { if (o.name) this.parts[o.name] = o; });
    const muzzle = this.parts.muzzle;
    muzzle.add(this.flashSprite);
    muzzle.add(this.flashLight);
    this.root.add(this.weapon);
    this._placeHands();
    this.equipT = 0; this.equipDur = 0.45;
    this.reloadT = -1; this.cycleT = -1; this.kick = 0;
    this.root.visible = true;
  }

  _placeHands() {
    const k = this.weapon.userData.kind;
    const r = this.hands.getObjectByName('handR');
    const l = this.hands.getObjectByName('handL');
    if (this.hands.parent !== this.weapon) this.weapon.add(this.hands);
    r.position.set(0.0, -0.09, 0.1); r.rotation.set(-0.3, 0, 0);
    if (k === 'pistol') { r.position.set(0, -0.09, 0.07); l.position.set(-0.02, -0.1, 0.055); l.rotation.set(-0.3, 0, 0.4); }
    else if (k === 'smg') { l.position.set(-0.01, -0.06, -0.1); l.rotation.set(0, 0, 0.5); }
    else if (k === 'rifle') { l.position.set(-0.01, -0.05, -0.3); l.rotation.set(0, 0, 0.55); }
    else if (k === 'sniper') { l.position.set(-0.01, -0.05, -0.35); l.rotation.set(0, 0, 0.55); }
    else if (k === 'shotgun') { l.position.set(-0.01, -0.05, -0.28); l.rotation.set(0, 0, 0.55); }
  }

  hide() { this.root.visible = false; }
  show() { if (this.weapon) this.root.visible = true; }

  onFire(info) {
    this.kick = 1;
    this.kickRot = 1;
    this.flashT = 1;
    const base = this.def.sound === 'sniper' || this.def.sound === 'shotgun' ? 0.32 : this.def.sound === 'pistol' ? 0.16 : 0.22;
    this.flashSprite.scale.setScalar(base * (0.8 + Math.random() * 0.5));
    this.flashSprite.material.rotation = Math.random() * Math.PI * 2;
    if (this.def.cycle !== 'bolt' && this.def.cycle !== 'pump') this._ejectShell();
  }

  onCycle() {
    // bolt/pump: the shell comes out mid-cycle
    this._ejectShell();
  }

  onReloadStart(def) { this.reloadT = 0; this.reloadDur = def.reloadTime; }
  onReloadEnd() { this.reloadT = -1; }
  onCycleStart(def) { this.cycleT = 0; this.cycleDur = def.cycleTime; }

  _ejectShell() {
    if (!this.settings.data.video.particles) return;
    const m = makeShell(this.weapon.userData.kind);
    const p = new THREE.Vector3();
    this.parts.eject.getWorldPosition(p);
    this.view.scene.add(m);
    m.position.copy(p);
    const camQ = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const v = new THREE.Vector3(1.6 + Math.random() * 0.8, 1.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.4).applyQuaternion(camQ);
    this.shells.push({ m, v, w: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), life: 1.4 });
  }

  // look: current yaw/pitch (radians) to derive sway from mouse velocity.
  update(dt, yaw, pitch, { ads, sprinting = false }) {
    if (!this.weapon) return;
    this.t += dt;
    const v = this.def.view;

    // mouse sway (lag behind the look direction)
    const dyaw = yaw - this.lastLook.x, dpitch = pitch - this.lastLook.y;
    this.lastLook.set(yaw, pitch);
    this.swayVel.x += (-dyaw * 0.35 - this.sway.x) * Math.min(1, dt * 18);
    this.swayVel.y += (dpitch * 0.25 - this.sway.y) * Math.min(1, dt * 18);
    this.sway.addScaledVector(this.swayVel, Math.min(1, dt * 14));
    this.sway.x = THREE.MathUtils.clamp(this.sway.x, -0.06, 0.06);
    this.sway.y = THREE.MathUtils.clamp(this.sway.y, -0.05, 0.05);

    // ADS blend
    const target = ads && this.reloadT < 0 ? 1 : 0;
    this.adsT += (target - this.adsT) * Math.min(1, dt * 11);

    // breathing / idle bob
    const breathe = (1 - this.adsT * 0.85);
    const bobX = Math.sin(this.t * 1.3) * 0.004 * breathe;
    const bobY = Math.sin(this.t * 2.6) * 0.003 * breathe;

    // recoil kick
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    const kz = this.kick * v.kick;
    const kr = this.kickRot * v.kick * 1.6;

    // base position: lerp hip → ads
    const px = THREE.MathUtils.lerp(v.pos[0], v.ads[0], this.adsT);
    const py = THREE.MathUtils.lerp(v.pos[1], v.ads[1], this.adsT);
    const pz = THREE.MathUtils.lerp(v.pos[2], v.ads[2], this.adsT);

    let x = px + this.sway.x + bobX, y = py + this.sway.y + bobY, z = pz + kz;
    // hip: muzzle angled slightly toward the centre; ads: dead straight
    let rx = -kr + this.sway.y * 1.5, ry = this.sway.x * 1.2 + 0.08 * (1 - this.adsT), rz = this.sway.x * 0.6 - 0.03 * (1 - this.adsT);

    // equip: rise from below
    if (this.equipT >= 0) {
      this.equipT += dt;
      const k = Math.min(1, this.equipT / this.equipDur);
      const e = 1 - easeOut(k);
      y -= 0.35 * e; rx -= 0.9 * e; rz += 0.3 * e;
      if (k >= 1) this.equipT = -1;
    }

    // reload: lower + tilt, mag drops and returns
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const k = Math.min(1, this.reloadT / this.reloadDur);
      const env = Math.sin(Math.min(1, k) * Math.PI); // 0→1→0
      y -= 0.08 * env; rx -= 0.35 * env; rz += 0.45 * env; x += 0.03 * env;
      const mag = this.parts.mag;
      if (mag) {
        // drop between 15%–55%, slam back 55%–75%
        let drop = 0;
        if (k < 0.15) drop = 0;
        else if (k < 0.55) drop = easeOut((k - 0.15) / 0.4);
        else if (k < 0.75) drop = 1 - easeInOut((k - 0.55) / 0.2);
        mag.position.y = (mag.userData.y0 ??= mag.position.y) - drop * 0.18;
        mag.visible = drop < 0.95;
        if (k > 0.78 && !mag.userData.slammed) { mag.userData.slammed = true; this.kick = Math.max(this.kick, 0.35); }
      }
      if (k >= 1) { this.reloadT = -1; if (mag) { mag.position.y = mag.userData.y0; mag.visible = true; mag.userData.slammed = false; } }
    }

    // bolt / pump cycle
    if (this.cycleT >= 0) {
      this.cycleT += dt;
      const k = Math.min(1, this.cycleT / this.cycleDur);
      const back = Math.sin(k * Math.PI); // out and back
      if (this.parts.pump) {
        this.parts.pump.position.z = 0.09 * back;
        rz += 0.08 * back; y -= 0.015 * back;
      } else if (this.parts.bolt && this.def.cycle === 'bolt') {
        const b = this.parts.bolt;
        b.rotation.z = -1.2 * Math.min(1, back * 1.4);
        b.position.z = 0.06 * back;
        rx -= 0.12 * back; rz += 0.25 * back; x += 0.02 * back;
      }
      if (k >= 1) { this.cycleT = -1; if (this.parts.pump) this.parts.pump.position.z = 0; if (this.parts.bolt) { this.parts.bolt.rotation.z = 0; this.parts.bolt.position.z = 0; } }
    }

    // slide / bolt blowback for self-loaders
    if (this.parts.slide) this.parts.slide.position.z = this.kick * 0.03;
    if (this.parts.bolt && this.def.cycle !== 'bolt') this.parts.bolt.position.z = 0.04 + this.kick * 0.035;

    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);

    // muzzle flash
    this.flashT = Math.max(0, this.flashT - dt * 22);
    this.flashSprite.material.opacity = this.flashT;
    this.flashSprite.visible = this.flashT > 0.02;
    this.flashLight.intensity = this.flashT * 10;

    // shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.v.y -= 9.8 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      if (s.m.position.y < -1.95) { s.m.position.y = -1.95; s.v.set(s.v.x * 0.4, -s.v.y * 0.3, s.v.z * 0.4); s.w.multiplyScalar(0.5); }
      if (s.life <= 0) { this.view.scene.remove(s.m); this.shells.splice(i, 1); }
    }
  }

  clearShells() {
    for (const s of this.shells) this.view.scene.remove(s.m);
    this.shells.length = 0;
  }
}
