import * as THREE from 'three';
import { TargetBase, mat, box, cyl, sphere } from './base.js';

// Light attack helicopter, ~6 m long. Zones: cockpit, hull, engine (rotor
// mast block), tail. Rotors spin; the body banks with its velocity.
// Death: engine fire, spin, fall, then the manager spawns the explosion.

const HULL = 0x2b3038, DARK = 0x16181d, GLASS = 0x2e5f7c, ENGINE = 0x3a3f48, WARN = 0xffe600;

export class HeliTarget extends TargetBase {
  constructor(style, headMult) {
    super(style, headMult);
    this.radius = 3.2;
    const g = this.root;
    const hull = mat.std(HULL, { metalness: 0.5, roughness: 0.45 });
    const dark = mat.std(DARK, { metalness: 0.6, roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: GLASS, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.6, emissive: 0x0a1c26, emissiveIntensity: 0.25 });
    glass.userData.e0 = 0.25;
    const engine = mat.std(ENGINE, { metalness: 0.7, roughness: 0.35 });
    const warn = mat.std(WARN, { emissive: WARN, emissiveIntensity: 0.6 });

    // fuselage (hit: hull)
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 2.2, 6, 14), hull);
    body.rotation.x = Math.PI / 2; body.position.set(0, 0, 0.2);
    g.add(body);
    // underside box + weapon pylons
    g.add(box(1.3, 0.5, 2.0, dark, 0, -0.55, 0.3));
    for (const sx of [-1, 1]) {
      g.add(box(0.12, 0.12, 1.1, dark, sx * 1.15, -0.3, 0.2));
      g.add(cyl(0.16, 0.16, 1.1, dark, sx * 1.15, -0.5, 0.2).rotateX(Math.PI / 2));
      g.add(box(1.2, 0.06, 0.4, hull, sx * 0.6, -0.25, 0.2)); // stub wing
    }
    // cockpit (hit: cockpit)
    const cockpit = sphere(0.78, glass, 0, 0.08, -1.3, 18);
    cockpit.scale.set(0.9, 0.72, 1.25);
    g.add(cockpit);
    g.add(box(0.1, 0.9, 1.0, dark, 0, 0.1, -1.4)); // canopy frame
    // engine / mast block (hit: engine)
    const eng = box(1.1, 0.5, 1.6, engine, 0, 0.85, 0.3);
    g.add(eng);
    g.add(cyl(0.3, 0.35, 0.3, dark, -0.6, 0.8, 0.9).rotateZ(Math.PI / 2)); // exhaust
    g.add(cyl(0.3, 0.35, 0.3, dark, 0.6, 0.8, 0.9).rotateZ(Math.PI / 2));
    g.add(cyl(0.12, 0.12, 0.5, dark, 0, 1.3, 0.2)); // mast
    // main rotor
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 1.55, 0.2);
    this.rotor.add(cyl(0.25, 0.25, 0.14, dark));
    for (let i = 0; i < 4; i++) {
      const blade = box(0.2, 0.04, 5.6, dark, 0, 0, 0);
      blade.rotation.y = (i / 4) * Math.PI;
      this.rotor.add(blade);
      const tip = box(0.2, 0.045, 0.3, warn, 0, 0, 2.7); tip.rotation.y = blade.rotation.y; this.rotor.add(tip);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.85, 40), new THREE.MeshBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; this.rotor.add(disc);
    g.add(this.rotor);
    // tail boom (hit: tail)
    const tail = cyl(0.14, 0.32, 3.4, hull, 0, 0.3, 2.9);
    tail.rotation.x = Math.PI / 2 + 0.06;
    g.add(tail);
    g.add(box(0.08, 1.1, 0.7, hull, 0, 0.9, 4.4)); // vertical fin
    g.add(box(1.2, 0.06, 0.4, hull, 0, 0.45, 3.9)); // horizontal stabiliser
    this.tailRotor = new THREE.Group();
    this.tailRotor.position.set(0.12, 1.0, 4.5);
    for (let i = 0; i < 3; i++) { const b = box(0.03, 0.9, 0.08, dark); b.rotation.x = (i / 3) * Math.PI; this.tailRotor.add(b); }
    g.add(this.tailRotor);
    // skids
    for (const sx of [-1, 1]) {
      g.add(cyl(0.05, 0.05, 2.6, dark, sx * 0.7, -1.15, 0.2).rotateX(Math.PI / 2));
      g.add(cyl(0.04, 0.04, 0.5, dark, sx * 0.7, -0.9, -0.5), cyl(0.04, 0.04, 0.5, dark, sx * 0.7, -0.9, 0.9));
    }
    // nav lights
    g.add(sphere(0.07, mat.std(0xff2a3c, { emissive: 0xff2a3c, emissiveIntensity: 2 }), -1.2, -0.25, 0.2, 8));
    g.add(sphere(0.07, mat.std(0x2aff6a, { emissive: 0x2aff6a, emissiveIntensity: 2 }), 1.2, -0.25, 0.2, 8));
    this.strobe = sphere(0.09, mat.std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 3 }), 0, 1.0, 4.0, 8);
    g.add(this.strobe);

    this._registerHit(body, 'hull');
    this._registerHit(cockpit, 'cockpit');
    this._registerHit(eng, 'engine');
    this._registerHit(tail, 'tail');
    for (const m of [body.material, eng.material, tail.material]) { m.emissive = new THREE.Color(0xff6a2a); m.emissiveIntensity = 0; m.userData.e0 = 0; }

    this.bank = 0;
    this.fallV = 0;
    this.spin = 0;
    this.smokeT = 0;
    this.hpFire = null;
  }

  update(dt, ctx) {
    this._applyFlash(dt);
    const spinRate = this.dying ? Math.max(6, 34 - this.dying * 12) : 34;
    this.rotor.rotation.y += spinRate * dt;
    this.tailRotor.rotation.x += 60 * dt;
    this.strobe.material.emissiveIntensity = (Math.sin(ctx.time * 9) > 0.85) ? 4 : 0.2;

    if (!this.dying) {
      const v = ctx.velocity || null;
      const targetBank = v ? THREE.MathUtils.clamp(-v.x * 0.18, -0.5, 0.5) : 0;
      this.bank += (targetBank - this.bank) * Math.min(1, dt * 3);
      const pitch = v ? THREE.MathUtils.clamp(v.z * 0.05, -0.25, 0.25) : 0;
      this.root.rotation.z = this.bank;
      this.root.rotation.x = -0.06 + pitch + Math.sin(ctx.time * 1.7) * 0.015;
      this.root.position.y += Math.sin(ctx.time * 1.3 + this.radius) * dt * 0.12;
      // damaged → smoke
      if (this.hp < this.maxHp * 0.5) {
        this.smokeT += dt;
        if (this.smokeT > 0.08) { this.smokeT = 0; ctx.smoke?.(this.root.localToWorld(new THREE.Vector3(0.6, 0.9, 0.9)), 1); }
      }
    } else {
      this.dying += dt;
      this.spin += dt * 2.2;
      this.fallV += 9.8 * dt * 0.6;
      this.root.position.y -= this.fallV * dt;
      this.root.rotation.y += this.spin * dt;
      this.root.rotation.z += dt * 0.8;
      this.smokeT += dt;
      if (this.smokeT > 0.05) { this.smokeT = 0; ctx.smoke?.(this.root.localToWorld(new THREE.Vector3(0, 0.9, 0.5)), 2); ctx.fire?.(this.root.localToWorld(new THREE.Vector3(0, 0.9, 0.3))); }
    }
  }

  die() { this.alive = false; this.dying = 0.0001; return 1.6; }
}
