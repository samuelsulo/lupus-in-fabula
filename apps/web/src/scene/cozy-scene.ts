import { NARRATOR_SPOT, WALK_BOUNDS, type Place, type Seating } from "@lupus/core";
import * as THREE from "three";
import { PLAYER_COLORS } from "../roles-info.ts";
import {
  makeNarratorAvatar,
  makeSeatedAvatar,
  makeStandingAvatar,
  sharedGeometry,
  type Avatar,
} from "./avatar.ts";
import { FIRE_POSITION, buildRoom, type Room } from "./room.ts";

export interface ScenePerson {
  id: string;
  name: string;
  alive: boolean;
  /** Short text under the name (public role, vote count), if any. */
  subtitle: string | null;
}

/** An avatar with everything the scene attaches to it. */
interface Model extends Avatar {
  standing: boolean;
  ring: THREE.Mesh;
  marker: THREE.Mesh;
  label: THREE.Sprite;
  hit: THREE.Mesh;
}

interface Person {
  data: ScenePerson;
  index: number;
  model: Model;
  /** The seat the person is on, or null while standing or walking. */
  seat: number | null;
  /** World position while standing (floor level). */
  position: THREE.Vector3;
  heading: number;
  /** Where a walking person is headed, and the seat they will sit on when they get there. */
  target: THREE.Vector3 | null;
  sitOn: number | null;
}

/** Light settings for the two moods; the scene blends between them. */
const DAY = {
  sky: new THREE.Color(0xfff1d6),
  ground: new THREE.Color(0x7a5535),
  ambient: 1.25,
  sun: new THREE.Color(0xfff0d0),
  sunPower: 2.6,
  fire: 16,
  lamp: 5,
  pane: new THREE.Color(0x7fb0dc),
  paneGlow: 0.7,
  bulbs: new THREE.Color(0x8c7a55),
};
const NIGHT = {
  sky: new THREE.Color(0x5a6a9c),
  ground: new THREE.Color(0x24160d),
  ambient: 0.32,
  sun: new THREE.Color(0x7f95d6),
  sunPower: 0.35,
  fire: 48,
  lamp: 14,
  pane: new THREE.Color(0x16224a),
  paneGlow: 0.5,
  bulbs: new THREE.Color(0xffd58a),
};

const SPARK_COUNT = 40;
/** Little moves, so 30 frames per second look the same as 60 and halve the work. */
const FRAME_MS = 1000 / 30;
const WALK_SPEED = 2.8;
const CENTER = new THREE.Vector3(0, 0, 0.4);

/**
 * The 3D scene: a cozy log-cabin living room. People sit on sofas, armchairs,
 * chairs and a stool around a rug and a crackling fireplace, and can stand up
 * and walk around. Daylight comes through the windows; at night only the fire
 * and the lamps are lit.
 */
export class CozyScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x553a22, 1);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  private readonly fireLight = new THREE.PointLight(0xff8a2a, 30, 22, 1.5);
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly room: Room;
  private readonly peopleGroup = new THREE.Group();
  private readonly people = new Map<string, Person>();
  private readonly seatHits: THREE.Mesh[] = [];
  private readonly seatMarks: THREE.Mesh[] = [];
  private readonly floor: THREE.Mesh;
  private narratorFigure: THREE.Group | null = null;
  private narratorId: string | null = null;
  private narratorPosition = new THREE.Vector3(NARRATOR_SPOT.x, 0, NARRATOR_SPOT.z);
  private narratorTarget: THREE.Vector3 | null = null;
  private narratorHeading = 0;
  private canSit = true;
  private readonly sparkAges = new Float32Array(SPARK_COUNT);
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private lastTime = performance.now();
  private shadowsDirty = true;
  /** True while anybody is walking, which moves their shadow. */
  private walking = false;
  private night = false;
  private mood = 0; // 0 = day, 1 = night (animated)
  private selfId = "";
  private seating: Seating | null = null;
  private moveMode = false;
  private selectable = new Set<string>();
  private selected: string | null = null;
  private hovered: string | null = null;
  private onPick: (id: string) => void = () => {};
  private onMove: (place: Place) => void = () => {};

  constructor(private readonly canvas: HTMLCanvasElement) {
    // Dense screens already look smooth: skip antialiasing there and cap the pixel ratio.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2 });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    // Shadows are redrawn only when somebody moves, not every frame.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(0x120a06);
    this.room = buildRoom();
    this.scene.add(this.room.group, this.peopleGroup, this.ambient, this.sun, this.fireLight);
    this.scene.add(this.sun.target);
    this.room.group.updateMatrixWorld(true);
    // The furniture never moves: freeze its matrices so they are not recomputed every frame.
    this.room.group.traverse((object) => {
      object.matrixAutoUpdate = false;
      object.updateMatrix();
    });
    for (const animated of [...this.room.flames, ...this.room.candleFlames]) animated.matrixAutoUpdate = true;

    // Daylight comes in through the windows on the right.
    this.sun.position.set(7, 11, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0005;
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, far: 40 });

    this.fireLight.position.copy(FIRE_POSITION).add(new THREE.Vector3(0, 0.9, 0.7));
    for (const position of this.room.lampPositions) {
      const light = new THREE.PointLight(0xffb866, 6, 9, 1.5);
      light.position.copy(position);
      this.lampLights.push(light);
      this.scene.add(light);
    }

    // An invisible floor to click on, and a hit area plus a glowing mark for every seat.
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);
    this.room.seats.forEach((seat, index) => {
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.position.set(seat.spot.x, 0.6, seat.spot.z);
      hit.userData.seatIndex = index;
      seat.piece.add(hit);
      this.seatHits.push(hit);

      const mark = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.55, 28),
        new THREE.MeshBasicMaterial({
          color: 0x9be37f,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        }),
      );
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(seat.spot.x, 0.05, seat.spot.z + 0.5);
      mark.visible = false;
      seat.piece.add(mark);
      this.seatMarks.push(mark);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    canvas.addEventListener("pointerdown", this.handlePointer);
    canvas.addEventListener("pointermove", this.handleHover);
    canvas.addEventListener("pointerleave", this.handleLeave);
    this.resize();
    this.applyMood();
    this.loop();
  }

  setOnPick(handler: (id: string) => void): void {
    this.onPick = handler;
  }

  setOnMove(handler: (place: Place) => void): void {
    this.onMove = handler;
  }

  /**
   * Sets who is in the room. People who are already there keep their place, so a
   * new vote count or a death never makes anybody jump.
   */
  setPeople(
    people: ScenePerson[],
    selfId: string,
    narrator: { id: string; name: string; caption: string } | null,
  ): void {
    this.selfId = selfId;
    const ids = new Set(people.map((p) => p.id));
    for (const [id, person] of this.people) {
      if (ids.has(id)) continue;
      this.disposeObject(person.model.group);
      this.people.delete(id);
    }
    people.forEach((data, index) => {
      const existing = this.people.get(data.id);
      if (!existing) {
        this.people.set(data.id, {
          data,
          index,
          model: this.makeModel(data, index, false, 0),
          seat: null,
          position: new THREE.Vector3(),
          heading: 0,
          target: null,
          sitOn: null,
        });
        const created = this.people.get(data.id);
        if (created) this.placeStanding(created);
        return;
      }
      const rebuild = existing.data.name !== data.name || existing.data.alive !== data.alive;
      const relabel = existing.data.subtitle !== data.subtitle;
      existing.data = data;
      existing.index = index;
      if (rebuild) this.rebuild(existing);
      else if (relabel) this.relabel(existing);
    });

    const previous = this.narratorFigure;
    if (previous) this.disposeObject(previous);
    this.narratorFigure = null;
    this.narratorId = narrator?.id ?? null;
    if (narrator) {
      const figure = makeNarratorAvatar();
      figure.position.copy(this.narratorPosition);
      figure.rotation.y = this.narratorHeading;
      figure.add(this.makeLabel(narrator.name, narrator.caption, false, true, 2.35));
      this.narratorFigure = figure;
      this.peopleGroup.add(figure);
    }
    if (this.seating) this.setSeating(this.seating, true);
    this.applyPose();
    this.applySelection();
  }

  /** Moves people to where the host says they are: they walk there and sit down. */
  setSeating(seating: Seating, instant = false): void {
    const first = this.seating === null;
    this.seating = seating;
    const narratorPlace = this.narratorId ? seating[this.narratorId] : undefined;
    if (narratorPlace?.kind === "stand") {
      const spot = new THREE.Vector3(narratorPlace.x, 0, narratorPlace.z);
      if (first || instant) this.narratorPosition.copy(spot);
      if (first) this.narratorFigure?.position.copy(spot);
      else if (!instant) this.narratorTarget = spot;
    }
    for (const [id, person] of this.people) {
      const place = seating[id];
      if (!place) continue;
      if (place.kind === "seat") {
        if (person.seat === place.seat || person.sitOn === place.seat) continue;
        if (first || (instant && person.seat === null && person.target === null)) {
          this.sitDown(person, place.seat);
        } else {
          this.standUp(person);
          person.sitOn = place.seat;
          person.target = this.seatFloorPosition(place.seat);
        }
      } else if (first) {
        this.standUp(person);
        person.position.set(place.x, 0, place.z);
        person.model.group.position.copy(person.position);
      } else if (!instant) {
        this.standUp(person);
        person.sitOn = null;
        person.target = new THREE.Vector3(place.x, 0, place.z);
      }
    }
    this.refreshSeatMarks();
  }

  /** Marks which players can be picked (shows a ring and enables clicking). */
  setSelectable(ids: string[], selected: string | null): void {
    this.selectable = new Set(ids);
    this.selected = selected;
    this.applySelection();
  }

  /** In move mode, clicks walk to the floor or to a free seat (unless `canSit` is false) instead of picking people. */
  setMoveMode(on: boolean, canSit = true): void {
    this.moveMode = on;
    this.canSit = canSit;
    this.refreshSeatMarks();
    this.applySelection();
    this.canvas.style.cursor = "default";
  }

  setNight(night: boolean): void {
    this.night = night;
    this.applyPose();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.canvas.removeEventListener("pointermove", this.handleHover);
    this.canvas.removeEventListener("pointerleave", this.handleLeave);
    this.disposeObject(this.scene);
    this.renderer.dispose();
  }

  private seatFloorPosition(index: number): THREE.Vector3 {
    const seat = this.room.seats[index];
    if (!seat) return new THREE.Vector3();
    return seat.piece.localToWorld(new THREE.Vector3(seat.spot.x, 0, seat.spot.z + 0.3));
  }

  private makeModel(data: ScenePerson, index: number, seated: boolean, seatHeight: number): Model {
    const look = {
      color: PLAYER_COLORS[index % PLAYER_COLORS.length] ?? "#c4a484",
      index,
      alive: data.alive,
    };
    const avatar = seated ? makeSeatedAvatar(look, seatHeight) : makeStandingAvatar(look);
    const isSelf = data.id === this.selfId;
    const floorY = seated ? -seatHeight : 0;

    const ring = new THREE.Mesh(
      sharedGeometry("ring", () => new THREE.RingGeometry(0.5, 0.58, 32)),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, floorY + 0.04, seated ? 0.35 : 0);
    ring.visible = false;

    const top = seated ? 1.35 : 2.2;
    const marker = new THREE.Mesh(
      sharedGeometry("marker", () => new THREE.OctahedronGeometry(0.1)),
      new THREE.MeshBasicMaterial({ color: 0xf3a712 }),
    );
    marker.scale.y = 1.5;
    marker.position.y = top;
    marker.visible = false;

    const text = isSelf ? `${data.name} (you)` : data.name;
    const label = this.makeLabel(text, data.subtitle, isSelf, data.alive, top - 0.15);
    // An invisible, generous hit area makes the whole person easy to click.
    const hit = new THREE.Mesh(
      sharedGeometry(`hit:${seated}`, () => new THREE.CylinderGeometry(0.5, 0.5, seated ? 1.5 : 1.9, 10)),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.set(0, seated ? 0.5 : 0.95, seated ? 0.1 : 0);
    hit.userData.playerId = data.id;
    label.userData.playerId = data.id;

    avatar.group.add(ring, marker, label, hit);
    return { ...avatar, standing: !seated, ring, marker, label, hit };
  }

  /** Only the text under the name changed (a vote count): swap the label, keep the body. */
  private relabel(person: Person): void {
    const { model, data } = person;
    const height = model.label.position.y;
    this.disposeObject(model.label);
    model.label = this.makeLabel(
      data.id === this.selfId ? `${data.name} (you)` : data.name,
      data.subtitle,
      data.id === this.selfId,
      data.alive,
      height,
    );
    model.label.userData.playerId = data.id;
    model.group.add(model.label);
  }

  /** Rebuilds a person after their name, subtitle or life changed, keeping them where they are. */
  private rebuild(person: Person): void {
    const seat = person.seat;
    if (seat !== null) {
      this.sitDown(person, seat);
      return;
    }
    this.disposeObject(person.model.group);
    person.model = this.makeModel(person.data, person.index, false, 0);
    this.placeStanding(person);
    this.applyPose();
    this.applySelection();
  }

  private sitDown(person: Person, seatIndex: number): void {
    this.shadowsDirty = true;
    const seat = this.room.seats[seatIndex];
    if (!seat) return;
    this.disposeObject(person.model.group);
    person.model = this.makeModel(person.data, person.index, true, seat.spot.y);
    person.model.group.position.set(seat.spot.x, seat.spot.y, seat.spot.z);
    seat.piece.add(person.model.group);
    person.seat = seatIndex;
    person.target = null;
    person.sitOn = null;
    this.applyPose();
    this.applySelection();
  }

  /** Gets up from the seat (or keeps standing), leaving a standing model where the person is. */
  private standUp(person: Person): void {
    this.shadowsDirty = true;
    if (person.seat === null && person.model.standing) return;
    if (person.seat !== null) person.position.copy(this.seatFloorPosition(person.seat));
    person.seat = null;
    this.disposeObject(person.model.group);
    person.model = this.makeModel(person.data, person.index, false, 0);
    this.placeStanding(person);
    this.applyPose();
    this.applySelection();
  }

  private placeStanding(person: Person): void {
    this.shadowsDirty = true;
    person.model.group.position.copy(person.position);
    person.model.group.rotation.y = person.heading;
    this.peopleGroup.add(person.model.group);
  }

  private makeLabel(
    name: string,
    subtitle: string | null,
    isSelf: boolean,
    alive: boolean,
    height: number,
  ): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textAlign = "center";
      ctx.font = "600 60px Georgia, 'Iowan Old Style', serif";
      ctx.fillStyle = !alive ? "#9a8f86" : isSelf ? "#ffd27a" : "#fff6e6";
      ctx.strokeStyle = "rgba(20,10,4,0.85)";
      ctx.lineWidth = 9;
      ctx.lineJoin = "round";
      ctx.strokeText(name, 256, 62);
      ctx.fillText(name, 256, 62);
      if (subtitle) {
        ctx.font = "500 40px Georgia, serif";
        ctx.fillStyle = "#f3a712";
        ctx.strokeText(subtitle, 256, 112);
        ctx.fillText(subtitle, 256, 112);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
    );
    sprite.scale.set(2, 0.5, 1);
    sprite.position.y = height;
    sprite.renderOrder = 10;
    return sprite;
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      const item = object as THREE.Mesh;
      if (!item.geometry?.userData.shared) item.geometry?.dispose();
      const materials = Array.isArray(item.material) ? item.material : item.material ? [item.material] : [];
      for (const material of materials) {
        (material as THREE.SpriteMaterial).map?.dispose();
        material.dispose();
      }
    });
    root.removeFromParent();
  }

  /** At night every seated person bows their head, so the scene never reveals who is awake. */
  private applyPose(): void {
    this.shadowsDirty = true;
    for (const person of this.people.values()) {
      const bowed = this.night && !person.model.standing;
      person.model.head.rotation.x = bowed ? 0.75 : 0;
      if (!person.model.standing) person.model.head.position.z = bowed ? 0.02 : -0.02;
    }
  }

  private applySelection(): void {
    for (const [id, person] of this.people) {
      const picked = id === this.selected;
      const { ring, marker, tinted } = person.model;
      const material = ring.material as THREE.MeshBasicMaterial;
      ring.visible = !this.moveMode && (this.selectable.has(id) || picked);
      material.color.set(picked ? 0xf3a712 : 0xffffff);
      marker.visible = picked;
      const glow = !this.moveMode && id === this.hovered && this.selectable.has(id) ? 0x5a3510 : 0x000000;
      for (const tint of tinted) tint.emissive.set(glow);
    }
  }

  /** Free seats glow green while the player is choosing where to go. */
  private refreshSeatMarks(): void {
    const taken = new Set<number>();
    for (const place of Object.values(this.seating ?? {})) if (place.kind === "seat") taken.add(place.seat);
    this.seatMarks.forEach(
      (mark, index) => (mark.visible = this.moveMode && this.canSit && !taken.has(index)),
    );
  }

  private applyMood(): void {
    const t = this.mood;
    this.ambient.color.copy(DAY.sky).lerp(NIGHT.sky, t);
    this.ambient.groundColor.copy(DAY.ground).lerp(NIGHT.ground, t);
    this.ambient.intensity = THREE.MathUtils.lerp(DAY.ambient, NIGHT.ambient, t);
    this.sun.color.copy(DAY.sun).lerp(NIGHT.sun, t);
    this.sun.intensity = THREE.MathUtils.lerp(DAY.sunPower, NIGHT.sunPower, t);
    const pane = this.room.panes;
    pane.color.copy(DAY.pane).lerp(NIGHT.pane, t);
    pane.emissive.copy(pane.color);
    pane.emissiveIntensity = THREE.MathUtils.lerp(DAY.paneGlow, NIGHT.paneGlow, t);
    this.room.stringLights.color.copy(DAY.bulbs).lerp(NIGHT.bulbs, t);
    const lamp = THREE.MathUtils.lerp(DAY.lamp, NIGHT.lamp, t);
    for (const light of this.lampLights) light.intensity = lamp;
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    // Pull back on narrow screens so the whole room stays visible.
    const distance = Math.max(14.6, 14 / (2 * Math.tan(THREE.MathUtils.degToRad(23)) * this.camera.aspect));
    const direction = new THREE.Vector3(0, 6.4, 13.1).normalize().multiplyScalar(distance);
    this.camera.position.set(0, 1 + direction.y, -1.6 + direction.z);
    this.camera.updateProjectionMatrix();
  }

  private rayAt(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
  }

  private pickPerson(): string | null {
    const targets = [...this.people.values()].flatMap((p) => [p.model.hit, p.model.label]);
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      const id = hit.object.userData.playerId as string | undefined;
      if (id && this.selectable.has(id)) return id;
    }
    return null;
  }

  /** In move mode: a seat if one is under the pointer, otherwise a spot on the floor. */
  private pickPlace(): Place | null {
    const seat = this.canSit ? this.raycaster.intersectObjects(this.seatHits, false)[0] : undefined;
    const index = seat?.object.userData.seatIndex as number | undefined;
    if (index !== undefined) return { kind: "seat", seat: index };
    const floor = this.raycaster.intersectObject(this.floor, false)[0];
    if (!floor) return null;
    const { x, z } = floor.point;
    const inside =
      x >= WALK_BOUNDS.minX && x <= WALK_BOUNDS.maxX && z >= WALK_BOUNDS.minZ && z <= WALK_BOUNDS.maxZ;
    return inside ? { kind: "stand", x, z } : null;
  }

  private readonly handlePointer = (event: PointerEvent): void => {
    this.rayAt(event);
    if (this.moveMode) {
      const place = this.pickPlace();
      if (place) this.onMove(place);
      return;
    }
    const id = this.pickPerson();
    if (id) this.onPick(id);
  };

  private readonly handleHover = (event: PointerEvent): void => {
    this.rayAt(event);
    if (this.moveMode) {
      this.canvas.style.cursor = this.pickPlace() ? "pointer" : "default";
      return;
    }
    const id = this.pickPerson();
    this.canvas.style.cursor = id ? "pointer" : "default";
    if (id !== this.hovered) {
      this.hovered = id;
      this.applySelection();
    }
  };

  private readonly handleLeave = (): void => {
    this.hovered = null;
    this.applySelection();
  };

  private updateSparks(dt: number): void {
    const positions = this.room.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < SPARK_COUNT; i++) {
      this.sparkAges[i] = (this.sparkAges[i] ?? 0) + dt;
      if ((this.sparkAges[i] ?? 0) > 1.2 + (i % 5) * 0.3) {
        this.sparkAges[i] = 0;
        positions.setXYZ(
          i,
          FIRE_POSITION.x + (Math.random() - 0.5) * 1.0,
          0.5,
          FIRE_POSITION.z + (Math.random() - 0.5) * 0.5,
        );
      } else {
        positions.setXYZ(
          i,
          positions.getX(i) + Math.sin((this.sparkAges[i] ?? 0) * 6 + i) * dt * 0.3,
          positions.getY(i) + dt * (0.8 + (i % 4) * 0.3),
          positions.getZ(i),
        );
      }
    }
    positions.needsUpdate = true;
  }

  /** Walks the people who are on their way somewhere, and sits down those who arrive at a seat. */
  private updateWalkers(dt: number, time: number): void {
    for (const person of this.people.values()) {
      const model = person.model;
      if (!model.standing) continue;
      const target = person.target;
      let walking = false;
      if (target) {
        const delta = target.clone().sub(person.position);
        delta.y = 0;
        const distance = delta.length();
        if (distance < 0.08) {
          person.position.copy(target);
          person.target = null;
          if (person.sitOn !== null) {
            this.sitDown(person, person.sitOn);
            continue;
          }
          person.heading = Math.atan2(CENTER.x - person.position.x, CENTER.z - person.position.z);
        } else {
          walking = true;
          person.position.addScaledVector(delta.normalize(), Math.min(distance, WALK_SPEED * dt));
          person.heading = Math.atan2(delta.x, delta.z);
        }
      }
      model.group.position.copy(person.position);
      // Turn smoothly towards the walking direction.
      const diff = Math.atan2(
        Math.sin(person.heading - model.group.rotation.y),
        Math.cos(person.heading - model.group.rotation.y),
      );
      model.group.rotation.y += diff * Math.min(1, dt * 10);
      const swing = walking ? Math.sin(time * 9) * 0.6 : 0;
      const { legs, arms } = model;
      if (legs && arms) {
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
        arms[0].rotation.x = -swing * 0.7;
        arms[1].rotation.x = swing * 0.7;
      }
      model.body.position.y = 1.15 + (walking ? Math.abs(Math.sin(time * 9)) * 0.03 : 0);
    }
  }

  /** The narrator strolls around the room, bobbing gently as they go. */
  private updateNarrator(dt: number, time: number): void {
    const figure = this.narratorFigure;
    if (!figure) return;
    let walking = false;
    const target = this.narratorTarget;
    if (target) {
      const delta = target.clone().sub(this.narratorPosition);
      const distance = delta.length();
      if (distance < 0.08) {
        this.narratorPosition.copy(target);
        this.narratorTarget = null;
        this.narratorHeading = Math.atan2(CENTER.x - target.x, CENTER.z - target.z);
      } else {
        walking = true;
        this.narratorPosition.addScaledVector(delta.normalize(), Math.min(distance, WALK_SPEED * dt));
        this.narratorHeading = Math.atan2(delta.x, delta.z);
      }
    }
    const diff = Math.atan2(
      Math.sin(this.narratorHeading - figure.rotation.y),
      Math.cos(this.narratorHeading - figure.rotation.y),
    );
    figure.rotation.y += diff * Math.min(1, dt * 10);
    figure.position.copy(this.narratorPosition);
    figure.position.y = walking ? Math.abs(Math.sin(time * 8)) * 0.05 : 0;
  }

  private readonly loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (now - this.lastTime < FRAME_MS - 2) return;
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const time = now / 1000;

    this.mood += ((this.night ? 1 : 0) - this.mood) * 0.04;
    this.applyMood();

    const flicker = 0.85 + Math.sin(time * 11) * 0.1 + Math.sin(time * 7.3) * 0.08;
    this.fireLight.intensity = THREE.MathUtils.lerp(DAY.fire, NIGHT.fire, this.mood) * flicker;
    this.room.flames.forEach((flame, i) => {
      const wave = 1 + Math.sin(time * (9 + i * 1.7) + i) * 0.18;
      flame.scale.set(1 + Math.sin(time * 6 + i) * 0.08, wave, 1);
      flame.position.y = 0.2 + 0.45 * wave;
    });
    this.room.candleFlames.forEach((flame, i) => {
      flame.scale.set(1, 1.7 + Math.sin(time * 13 + i * 2) * 0.25, 1);
    });
    this.updateSparks(dt);
    this.walking = this.narratorTarget !== null || [...this.people.values()].some((p) => p.target !== null);
    this.updateWalkers(dt, time);
    this.updateNarrator(dt, time);

    // A slow drift keeps the scene alive without disorienting the player.
    this.camera.position.x = Math.sin(time * 0.15) * 0.5;
    this.camera.lookAt(0, 1, -1.6);

    for (const person of this.people.values()) {
      const model = person.model;
      if (!model.standing) model.body.position.y = 0.42 + Math.sin(time * 1.6 + person.index) * 0.008;
      model.marker.position.y = (model.standing ? 2.2 : 1.35) + Math.sin(time * 3) * 0.05;
      model.marker.rotation.y = time * 2;
    }
    if (this.shadowsDirty || this.walking) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
