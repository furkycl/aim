import * as THREE from 'three';
import { TargetBase, mat, box, cyl, sphere, capsule } from './base.js';

// Hostile infantry figure: balaclava + plate carrier + rifle, ~1.8 m tall.
// Hitboxes: head (sphere), torso (box), arms/legs (capsules). Root sits on
// the floor; the figure faces the player (TargetManager orients it).

const SKIN = 0x9a7b63, MASK = 0x1b1d20, UNIFORM = 0x2f3a2e, VEST = 0x1e2126, BOOT = 0x15161a, GUN = 0x202329, RED = 0xff2a3c;

export class OperatorTarget extends TargetBase {
  constructor(style, headMult) {
    super(style, headMult);
    this.grounded = true;
    this.radius = 0.55;
    const g = this.root;

    const uniform = mat.std(UNIFORM, { roughness: 0.9, metalness: 0.05 });
    const vest = mat.std(VEST, { roughness: 0.8, metalness: 0.1 });
    const mask = mat.std(MASK, { roughness: 0.95 });
    const skin = mat.std(SKIN, { roughness: 0.8 });
    const boot = mat.std(BOOT, { roughness: 0.9 });
    const gun = mat.std(GUN, { roughness: 0.4, metalness: 0.7 });
    const band = mat.std(RED, { emissive: RED, emissiveIntensity: 0.8, roughness: 0.6 });

    // legs
    const legL = capsule(0.11, 0.62, uniform, -0.13, 0.5, 0);
    const legR = capsule(0.11, 0.62, uniform, 0.13, 0.5, 0);
    g.add(legL, legR);
    g.add(box(0.2, 0.1, 0.3, boot, -0.13, 0.05, 0.03), box(0.2, 0.1, 0.3, boot, 0.13, 0.05, 0.03));
    // kneepads
    g.add(sphere(0.085, vest, -0.13, 0.5, 0.07, 10), sphere(0.085, vest, 0.13, 0.5, 0.07, 10));
    this.legL = legL; this.legR = legR;

    // pelvis / belt
    g.add(box(0.4, 0.16, 0.26, vest, 0, 0.9, 0));
    // torso (hit zone)
    const torso = box(0.46, 0.58, 0.28, vest, 0, 1.27, 0);
    g.add(torso);
    // plate carrier details
    g.add(box(0.3, 0.26, 0.05, mat.std(0x2a2f36, { roughness: 0.7 }), 0, 1.3, 0.165));
    g.add(box(0.1, 0.1, 0.04, uniform, -0.1, 1.15, 0.175), box(0.1, 0.1, 0.04, uniform, 0.1, 1.15, 0.175), box(0.1, 0.1, 0.04, uniform, 0, 1.15, 0.175));
    g.add(box(0.48, 0.1, 0.3, uniform, 0, 1.56, 0)); // shoulders
    // arms
    const armL = capsule(0.075, 0.5, uniform, -0.33, 1.25, 0.05);
    const armR = capsule(0.075, 0.5, uniform, 0.33, 1.25, 0.05);
    armL.rotation.set(-1.1, 0, 0.2); armR.rotation.set(-1.2, 0, -0.25);
    armL.position.set(-0.3, 1.3, 0.2); armR.position.set(0.3, 1.3, 0.15);
    g.add(armL, armR);
    g.add(sphere(0.07, mask, -0.22, 1.2, 0.45, 10), sphere(0.07, mask, 0.18, 1.25, 0.32, 10)); // gloves
    // rifle prop held across the chest
    const rifle = new THREE.Group();
    rifle.add(box(0.06, 0.09, 0.7, gun, 0, 0, 0));
    rifle.add(box(0.05, 0.2, 0.06, gun, 0, -0.13, 0.02));
    rifle.add(cyl(0.015, 0.015, 0.4, gun, 0, 0.0, -0.5).rotateX(Math.PI / 2));
    rifle.position.set(0.0, 1.2, 0.42);
    rifle.rotation.set(0.1, -0.5, 0);
    g.add(rifle);
    // neck + head (hit zone)
    g.add(cyl(0.07, 0.08, 0.1, skin, 0, 1.65, 0));
    const head = sphere(0.16, mask, 0, 1.8, 0, 16);
    g.add(head);
    // eye slit + skin, red headband
    g.add(box(0.2, 0.05, 0.06, skin, 0, 1.82, 0.13));
    g.add(sphere(0.02, mat.std(0x111111), -0.05, 1.82, 0.16, 6), sphere(0.02, mat.std(0x111111), 0.05, 1.82, 0.16, 6));
    const hb = cyl(0.165, 0.165, 0.045, band, 0, 1.9, 0);
    g.add(hb);
    // helmet-ish cap
    g.add(sphere(0.165, vest, 0, 1.86, -0.02, 14).translateY(0.02));

    this._registerHit(head, 'head');
    this._registerHit(torso, 'torso');
    for (const m of [legL, legR, armL, armR]) this._registerHit(m, 'limb');
    // head/torso emissive flash
    for (const m of [head.material, torso.material]) { m.emissive = new THREE.Color(RED); m.emissiveIntensity = 0; m.userData.e0 = 0; }

    this.walk = 0;
    this.deathSpin = (Math.random() - 0.5) * 0.8;
    this.root.scale.setScalar(0.001);
    this.pop = 0;
    this.crouch = Math.random() < 0.25 ? 1 : 0;
    this.crouchK = 0;
  }

  update(dt, ctx) {
    this._applyFlash(dt);
    if (this.pop < 1 && !this.dying) {
      this.pop = Math.min(1, this.pop + dt * 6);
      const s = 1 - Math.pow(1 - this.pop, 3);
      this.root.scale.set(s, s, s);
    }
    // crouch blend (makes head a smaller/lower target sometimes)
    this.crouchK += (this.crouch - this.crouchK) * Math.min(1, dt * 4);
    this.root.scale.y = this.root.scale.x * (1 - this.crouchK * 0.22);

    // walk cycle when moving
    const moving = ctx.velocity ? ctx.velocity.lengthSq() > 0.01 : false;
    if (moving) {
      this.walk += dt * 9;
      const a = Math.sin(this.walk) * 0.5;
      this.legL.rotation.x = a; this.legR.rotation.x = -a;
    } else {
      this.legL.rotation.x *= 0.85; this.legR.rotation.x *= 0.85;
    }
    // idle breathing
    this.root.position.y += 0; // handled by manager
    if (this.dying) {
      this.dying += dt;
      const k = Math.min(1, this.dying / 0.45);
      const e = 1 - Math.pow(1 - k, 2);
      this.root.rotation.x = -Math.PI / 2 * e * 0.95;
      this.root.rotation.y += this.deathSpin * dt;
      if (this.dying > 0.9) this.root.position.y -= dt * 2.5; // sink
    }
  }

  die() { this.alive = false; this.dying = 0.0001; return 1.3; }
}
