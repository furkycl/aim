// Weapon state machine: ammo, fire cadence, reload, cycling (bolt/pump),
// recoil offsets applied to the camera, and dynamic spread.
//
// Recoil is an *offset* on top of the player's look angles — the aim ray
// uses camera direction (input + recoil), so spray control is real.

const D2R = Math.PI / 180;

export class Weapon {
  constructor(def, hooks = {}) {
    this.def = def;
    this.hooks = hooks; // onFire(info), onEmpty(), onReloadStart(), onReloadEnd(), onCycle()
    this.ammo = def.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.cycleT = 0;
    this.lastShotAt = -1;
    this.sprayIndex = 0;
    this.recoilPitch = 0; // radians
    this.recoilYaw = 0;
    this.recoilRecover = 12;
    this.spread = def.spread.base; // degrees
    this.ads = false;
    this.triggerHeld = false;
    this.triggerPressed = false;
    this.equipT = 0.45;
  }

  get interval() { return 60 / this.def.rpm; }
  get ready() { return !this.reloading && this.cycleT <= 0 && this.equipT <= 0; }

  reset() {
    this.ammo = this.def.mag;
    this.reloading = false; this.reloadT = 0; this.cycleT = 0;
    this.sprayIndex = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.spread = this.def.spread.base; this.equipT = 0.45;
    this.lastShotAt = -1;
  }

  reload() {
    if (this.reloading || this.ammo === this.def.mag || this.equipT > 0) return false;
    this.reloading = true;
    this.reloadT = this.def.reloadTime;
    this.cycleT = 0;
    this.hooks.onReloadStart?.(this.def);
    return true;
  }

  press(now) { this.triggerHeld = true; this.triggerPressed = true; this._tryFire(now, true); }
  release() { this.triggerHeld = false; }

  _tryFire(now, fromPress) {
    if (!this.ready) return false;
    if (now - this.lastShotAt < this.interval - 1e-4) return false;
    if (this.ammo <= 0) {
      if (fromPress) { this.hooks.onEmpty?.(); this.reload(); }
      return false;
    }
    if (!this.def.auto && !fromPress) return false;
    this._fire(now);
    return true;
  }

  _fire(now) {
    const d = this.def;
    this.ammo--;
    // Spray index resets if the gap since the last shot is long enough.
    if (now - this.lastShotAt > this.interval * 2.2 + 0.08) this.sprayIndex = 0;
    const r = d.recoil(this.sprayIndex);
    this.recoilRecover = r.recover;
    this.recoilPitch += r.pitch * D2R;
    this.recoilYaw += r.yaw * D2R * (0.7 + Math.random() * 0.6);
    const spreadNow = (this.ads && d.spread.hipfire != null) ? this.spread : (this.ads ? this.spread * 0.6 : this.spread + (d.spread.hipfire || 0));
    const info = {
      def: d,
      sprayIndex: this.sprayIndex,
      recoil: r,
      spreadDeg: spreadNow,
      pellets: d.pellets,
      ammo: this.ammo,
      ads: this.ads,
    };
    this.spread = Math.min(d.spread.max, this.spread + d.spread.perShot);
    this.sprayIndex++;
    this.lastShotAt = now;
    if (d.cycle === 'bolt' || d.cycle === 'pump') this.cycleT = d.cycleTime;
    this.hooks.onFire?.(info);
    if (this.ammo === 0 && d.cycle !== 'bolt' && d.cycle !== 'pump') { /* click on next press */ }
  }

  update(dt, now) {
    const d = this.def;
    if (this.equipT > 0) this.equipT -= dt;
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloading = false; this.ammo = d.mag; this.hooks.onReloadEnd?.(d); }
    }
    if (this.cycleT > 0) {
      const was = this.cycleT;
      this.cycleT -= dt;
      if (was > d.cycleTime * 0.5 && this.cycleT <= d.cycleTime * 0.5) this.hooks.onCycle?.(d);
      if (this.cycleT <= 0 && this.ammo === 0) this.reload();
    }
    // Continuous fire for automatics.
    if (this.triggerHeld && d.auto) this._tryFire(now, false);
    this.triggerPressed = false;

    // Recoil recovery (exponential) and spread recovery.
    const k = Math.exp(-this.recoilRecover * dt);
    this.recoilPitch *= k;
    this.recoilYaw *= k;
    if (Math.abs(this.recoilPitch) < 1e-5) this.recoilPitch = 0;
    if (Math.abs(this.recoilYaw) < 1e-5) this.recoilYaw = 0;
    this.spread = Math.max(d.spread.base, this.spread - d.spread.recover * dt * (this.spread - d.spread.base + 0.2));
  }
}
