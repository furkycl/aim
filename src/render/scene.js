import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WALL_Z, FLOOR_Y } from '../core/targets.js';

const ACCENT = 0x00f0ff;

function gridTexture(size = 512, cells = 8, color = '#00f0ff', bg = '#0a0d14') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = color;
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  g.globalAlpha = 0.6;
  g.fillStyle = color;
  for (let i = 0; i <= cells; i++) for (let j = 0; j <= cells; j++) {
    g.beginPath(); g.arc(i * step, j * step, 3, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class SceneView {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // No readback of the drawn frame: toDataURL/readPixels return nothing useful.
      preserveDrawingBuffer: false,
      alpha: false,
    });
    this.renderer.setClearColor(0x07080c, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x07080c, 45, 110);

    this.camera = new THREE.PerspectiveCamera(settings.verticalFov, 1, 0.1, 200);
    this.camera.position.set(0, 0, 0);
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    this._buildArena();
    this._buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    settings.onChange(() => this.applySettings());
    this.applySettings();
  }

  _buildArena() {
    const s = this.scene;
    s.add(new THREE.AmbientLight(0x8899cc, 1.1));
    s.add(new THREE.HemisphereLight(0x3a4a77, 0x0a0c12, 1.6));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(5, 10, 8); // from behind the shooter's right shoulder, lights target faces
    s.add(key);
    const kick = new THREE.DirectionalLight(0x9ad8ff, 0.9);
    kick.position.set(-8, 6, -20); // rim from the far wall
    s.add(kick);
    const rim = new THREE.PointLight(ACCENT, 18, 60, 2);
    rim.position.set(0, 6, -WALL_Z + 6);
    s.add(rim);
    const warm = new THREE.PointLight(0xff3b6b, 8, 40, 2);
    warm.position.set(-14, 2, -8);
    s.add(warm);
    const fill = new THREE.PointLight(0xffffff, 6, 30, 2);
    fill.position.set(2, 1, 2);
    s.add(fill);

    const grid = gridTexture();
    const W = 56, H = 14, D = 70;
    const floorY = FLOOR_Y, ceilY = FLOOR_Y + H;

    // floor
    const floorTex = grid.clone(); floorTex.repeat.set(8, 10); floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.1, color: 0xc8d4e8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, floorY, -D / 2 + 10);
    s.add(floor);

    // ceiling
    const ceil = floor.clone();
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = ceilY;
    s.add(ceil);

    // back wall (target wall) — slightly further than targets so they never clip
    const wallTex = grid.clone(); wallTex.repeat.set(8, 4); wallTex.needsUpdate = true;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8, metalness: 0.1, color: 0xc0ccdf }),
    );
    wall.position.set(0, floorY + H / 2, -D + 10);
    s.add(wall);

    // side walls
    const sideTex = grid.clone(); sideTex.repeat.set(10, 4); sideTex.needsUpdate = true;
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.85, metalness: 0.1, color: 0xaab6cc });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, H), sideMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-W / 2, floorY + H / 2, -D / 2 + 10);
    s.add(left);
    const right = left.clone();
    right.rotation.y = -Math.PI / 2;
    right.position.x = W / 2;
    s.add(right);

    // glowing frame around the target zone
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(26, 13)),
      new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }),
    );
    frame.position.set(0, 1.4, -WALL_Z - 1.1);
    frame.name = 'targetFrame';
    this.targetFrame = frame;
    s.add(frame);
    // range lane markers on the floor (distance bands)
    const laneMat = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.25 });
    for (const d of [10, 20, 30, 40]) {
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, 0.08), laneMat);
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(0, floorY + 0.01, -d);
      s.add(lane);
    }

    // neon strips along the floor edges
    const stripGeo = new THREE.BoxGeometry(0.12, 0.12, D);
    const stripMat = new THREE.MeshBasicMaterial({ color: ACCENT });
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) {
      const st = new THREE.Mesh(stripGeo, stripMat);
      st.position.set(x, floorY + 0.06, -D / 2 + 10);
      s.add(st);
    }

    // floating dust for depth
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * W;
      pos[i * 3 + 1] = floorY + Math.random() * H;
      pos[i * 3 + 2] = -Math.random() * D + 8;
    }
    const dust = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)),
      new THREE.PointsMaterial({ color: 0x88ccff, size: 0.06, transparent: true, opacity: 0.35, sizeAttenuation: true }),
    );
    this.dust = dust;
    s.add(dust);
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.6, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  applySettings() {
    const v = this.settings.data.video;
    this.camera.fov = this.settings.verticalFov;
    this.camera.updateProjectionMatrix();
    this.bloom.enabled = !!v.bloom;
    this.resize();
  }

  resize() {
    const scale = this.settings.data.video.scale || 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setLook(yaw, pitch, zoom = 1) {
    this.cameraRig.rotation.set(0, yaw, 0, 'YXZ');
    this.camera.rotation.set(pitch, 0, 0, 'YXZ');
    const fov = this.settings.verticalFov / zoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  showTargetFrame(on) { if (this.targetFrame) this.targetFrame.visible = on; }

  render(dt, t) {
    if (this.dust) this.dust.rotation.y = Math.sin(t * 0.05) * 0.03;
    this.composer.render(dt);
  }
}
