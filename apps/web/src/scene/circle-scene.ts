import * as THREE from "three";
import { PLAYER_COLORS } from "../roles-info.ts";

export interface SceneSeat {
  id: string;
  name: string;
  alive: boolean;
  /** Public role label shown under the name, if any. */
  roleLabel: string | null;
}

interface Avatar {
  group: THREE.Group;
  head: THREE.Mesh;
  body: THREE.Mesh;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  id: string;
}

const DAY = { sky: new THREE.Color("#8fc4e8"), ambient: 1.0, sun: 2.4, fire: 0.6, stars: 0 };
const NIGHT = { sky: new THREE.Color("#070b18"), ambient: 0.18, sun: 0.35, fire: 2.4, stars: 1 };
const RADIUS = 3.4;

/** The 3D scene: a circle of chairs around a fire, with day and night lighting. */
export class CircleScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x3a4a2a, 1);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  private readonly fireLight = new THREE.PointLight(0xff8c2a, 2, 14, 1.6);
  private readonly flame: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly seatsGroup = new THREE.Group();
  private readonly avatars = new Map<string, Avatar>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private night = false;
  private mood = 0; // 0 = day, 1 = night (animated)
  private selfSeatAngle = 0;
  private selectable = new Set<string>();
  private onPick: (id: string) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene.fog = new THREE.Fog(0x000000, 14, 40);
    this.scene.add(this.ambient, this.sun, this.fireLight, this.seatsGroup);

    this.sun.position.set(6, 10, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const clearing = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS + 1.4, 48),
      new THREE.MeshStandardMaterial({ color: 0x8a7352, roughness: 1 }),
    );
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.y = 0.01;
    clearing.receiveShadow = true;
    this.scene.add(clearing);

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.9, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa23a }),
    );
    this.flame.position.y = 0.55;
    this.fireLight.position.set(0, 1, 0);
    this.scene.add(this.flame);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a2f1b }),
      );
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i * Math.PI) / 4;
      log.position.y = 0.08;
      this.scene.add(log);
    }

    this.stars = this.makeStars();
    this.scene.add(this.stars);
    this.scene.add(...this.makeTrees());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", this.handlePointer);
    canvas.addEventListener("pointermove", this.handleHover);
    this.resize();
    this.applyMood();
    this.loop();
  }

  setOnPick(handler: (id: string) => void): void {
    this.onPick = handler;
  }

  /** Rebuilds the circle. The local player is always seated closest to the camera. */
  setSeats(seats: SceneSeat[], selfId: string): void {
    for (const avatar of this.avatars.values()) this.disposeAvatar(avatar);
    this.avatars.clear();
    this.seatsGroup.clear();

    const selfIndex = Math.max(
      0,
      seats.findIndex((s) => s.id === selfId),
    );
    this.selfSeatAngle = Math.PI / 2;
    seats.forEach((seat, i) => {
      const angle = this.selfSeatAngle + ((i - selfIndex) * 2 * Math.PI) / seats.length;
      const avatar = this.makeAvatar(seat, i, angle);
      this.avatars.set(seat.id, avatar);
      this.seatsGroup.add(avatar.group);
    });
    this.applyAvatarPose();
  }

  /** Marks which players can be picked as a target (shows a ring and enables clicking). */
  setSelectable(ids: string[], selected: string | null): void {
    this.selectable = new Set(ids);
    for (const [id, avatar] of this.avatars) {
      const material = avatar.ring.material as THREE.MeshBasicMaterial;
      avatar.ring.visible = this.selectable.has(id) || id === selected;
      material.color.set(id === selected ? 0xf3a712 : 0xffffff);
    }
  }

  setNight(night: boolean): void {
    this.night = night;
    this.applyAvatarPose();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.canvas.removeEventListener("pointermove", this.handleHover);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m: THREE.Material) => {
          (m as THREE.SpriteMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
  }

  private makeAvatar(seat: SceneSeat, index: number, angle: number): Avatar {
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS);
    group.lookAt(0, 0, 0);

    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const seatMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), wood);
    seatMesh.position.y = 0.5;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.08), wood);
    back.position.set(0, 0.9, -0.36);
    group.add(seatMesh, back);
    for (const [x, z] of [
      [-0.34, -0.34],
      [0.34, -0.34],
      [-0.34, 0.34],
      [0.34, 0.34],
    ] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), wood);
      leg.position.set(x, 0.25, z);
      group.add(leg);
    }

    const color = new THREE.Color(PLAYER_COLORS[index % PLAYER_COLORS.length]);
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.45, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
    );
    body.position.y = 0.95;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.7 }),
    );
    head.position.set(0, 1.55, 0);
    head.castShadow = true;
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.3 + (index % 3) * 0.08, 10),
      new THREE.MeshStandardMaterial({ color }),
    );
    hat.position.y = 0.26;
    head.add(hat);
    group.add(body, head);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    group.add(ring);

    const label = this.makeLabel(seat);
    label.position.set(0, 2.25, 0);
    group.add(label);

    // Make the whole avatar clickable.
    for (const mesh of [body, head, seatMesh]) mesh.userData.playerId = seat.id;

    if (!seat.alive) {
      body.material = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 1 });
      hat.material = new THREE.MeshStandardMaterial({ color: 0x444851 });
    }
    return { group, head, body, ring, label, id: seat.id };
  }

  private makeLabel(seat: SceneSeat): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.font = "600 52px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = seat.alive ? "#ffffff" : "#8a8f99";
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.lineWidth = 8;
      ctx.strokeText(seat.name, 256, 60);
      ctx.fillText(seat.name, 256, 60);
      if (seat.roleLabel) {
        ctx.font = "500 38px system-ui, sans-serif";
        ctx.fillStyle = "#f3a712";
        ctx.strokeText(seat.roleLabel, 256, 108);
        ctx.fillText(seat.roleLabel, 256, 108);
      }
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }),
    );
    sprite.scale.set(2.2, 0.55, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private disposeAvatar(avatar: Avatar): void {
    avatar.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        (object as THREE.Mesh).geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m: THREE.Material) => {
          (m as THREE.SpriteMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
  }

  /** At night every avatar bows its head, so the scene never reveals who is awake. */
  private applyAvatarPose(): void {
    for (const avatar of this.avatars.values()) {
      avatar.head.rotation.x = this.night ? 0.7 : 0;
      avatar.head.position.z = this.night ? 0.12 : 0;
    }
  }

  private makeStars(): THREE.Points {
    const positions: number[] = [];
    for (let i = 0; i < 400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * 1.2 + 0.1;
      const r = 60;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) + 4,
        r * Math.sin(phi) * Math.sin(theta),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, fog: false, opacity: 0 }),
    );
  }

  private makeTrees(): THREE.Object3D[] {
    const trees: THREE.Object3D[] = [];
    const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3322 });
    const leaves = new THREE.MeshStandardMaterial({ color: 0x24512a, roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.1;
      const distance = 10 + (i % 4) * 1.6;
      const tree = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), trunk);
      stem.position.y = 0.7;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3 + (i % 3) * 0.6, 8), leaves);
      top.position.y = 2.7;
      top.castShadow = true;
      tree.add(stem, top);
      tree.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      trees.push(tree);
    }
    return trees;
  }

  private applyMood(): void {
    const t = this.mood;
    const sky = DAY.sky.clone().lerp(NIGHT.sky, t);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.ambient.intensity = THREE.MathUtils.lerp(DAY.ambient, NIGHT.ambient, t);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sun, NIGHT.sun, t);
    this.sun.color.set(t > 0.5 ? 0x9bb4ff : 0xfff3d6);
    (this.stars.material as THREE.PointsMaterial).opacity = THREE.MathUtils.lerp(DAY.stars, NIGHT.stars, t);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    // Pull back on narrow screens so the whole circle stays visible.
    const distance = this.camera.aspect < 1 ? 11 : 8;
    this.camera.position.set(0, 5.6 + (distance - 8) * 0.5, RADIUS + distance - 3);
    this.camera.lookAt(0, 1, 0);
    this.camera.updateProjectionMatrix();
  }

  private pickAt(event: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.seatsGroup.children, true);
    for (const hit of hits) {
      const id = hit.object.userData.playerId as string | undefined;
      if (id && this.selectable.has(id)) return id;
    }
    return null;
  }

  private readonly handlePointer = (event: PointerEvent): void => {
    const id = this.pickAt(event);
    if (id) this.onPick(id);
  };

  private readonly handleHover = (event: PointerEvent): void => {
    this.canvas.style.cursor = this.pickAt(event) ? "pointer" : "default";
  };

  private readonly loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const target = this.night ? 1 : 0;
    this.mood += (target - this.mood) * 0.04;
    this.applyMood();

    const time = performance.now() / 1000;
    const flicker = 0.85 + Math.sin(time * 11) * 0.1 + Math.sin(time * 7.3) * 0.08;
    this.fireLight.intensity = THREE.MathUtils.lerp(DAY.fire, NIGHT.fire, this.mood) * flicker;
    this.flame.scale.set(1, flicker * 1.1, 1);

    // A slow drift keeps the scene alive without disorienting the player.
    this.camera.position.x = Math.sin(time * 0.15) * 0.5;
    this.camera.lookAt(0, 1, 0);

    for (const avatar of this.avatars.values()) {
      avatar.body.position.y = 0.95 + Math.sin(time * 1.6 + avatar.group.position.x) * 0.012;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
