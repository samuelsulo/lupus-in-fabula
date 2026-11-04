import * as THREE from "three";
import {
  box,
  cylinder,
  makeArmchair,
  makeBasket,
  makeBookshelf,
  makeCandle,
  makeChair,
  makeCoffeeTable,
  makeCupboard,
  makeFirewoodStack,
  makeFloorLamp,
  makePainting,
  makePlant,
  makeRockingChair,
  makeSofa,
  makeStool,
  type Piece,
  type SeatSpot,
} from "./furniture.ts";
import { floorTexture, logWallTexture, rugTexture, stoneTexture } from "./textures.ts";

/** Where the people sit: the middle of the rug. Every piece of furniture faces it. */
const CENTER = new THREE.Vector2(0, 0.4);

/** Where the fire burns, inside the chimney. */
export const FIRE_POSITION = new THREE.Vector3(0, 0.25, -6.1);

export interface Seat {
  piece: THREE.Group;
  spot: SeatSpot;
}

export interface Room {
  group: THREE.Group;
  /** Seats in a fixed order that spreads sofas, armchairs and chairs around the rug. */
  seats: Seat[];
  flames: THREE.Mesh[];
  sparks: THREE.Points;
  candleFlames: THREE.Mesh[];
  /** Window glass: bright by day, dark and moonlit at night. */
  panes: THREE.MeshStandardMaterial;
  stringLights: THREE.MeshBasicMaterial;
  lampPositions: THREE.Vector3[];
  /** Where a standing narrator is placed. */
  narratorSpot: THREE.Vector3;
}

function place(piece: THREE.Object3D, x: number, z: number, faceCenter = true): void {
  piece.position.set(x, 0, z);
  if (faceCenter) piece.rotation.y = Math.atan2(CENTER.x - x, CENTER.y - z);
}

function stoneBlock(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  return box(w, h, d, material, x, y, z);
}

function buildFireplace(room: THREE.Group): { flames: THREE.Mesh[]; sparks: THREE.Points } {
  const stoneMaterial = (repeatX: number, repeatY: number) => {
    const texture = stoneTexture();
    texture.repeat.set(repeatX, repeatY);
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
  };
  const frontZ = -5.55;
  const depth = 1.4;
  const centerZ = frontZ - depth / 2;
  // Two pillars, a lintel and a dark recess make a real opening for the fire.
  room.add(stoneBlock(1.3, 6, depth, -1.65, 3, centerZ, stoneMaterial(0.8, 2.4)));
  room.add(stoneBlock(1.3, 6, depth, 1.65, 3, centerZ, stoneMaterial(0.8, 2.4)));
  room.add(stoneBlock(2, 4.5, depth, 0, 3.75, centerZ, stoneMaterial(1.2, 2)));
  const recess = box(
    2,
    1.5,
    0.1,
    new THREE.MeshStandardMaterial({ color: 0x140b07, roughness: 1 }),
    0,
    0.75,
    -6.9,
  );
  room.add(recess);
  room.add(box(2, 0.05, 1.4, new THREE.MeshStandardMaterial({ color: 0x241710 }), 0, 0.03, centerZ));
  room.add(stoneBlock(3.8, 0.14, 1.1, 0, 0.07, -5.0, stoneMaterial(2, 0.5)));

  const mantel = box(
    5.2,
    0.24,
    0.62,
    new THREE.MeshStandardMaterial({ color: 0x4a2d18, roughness: 0.8 }),
    0,
    1.9,
    -5.3,
  );
  room.add(mantel);

  const painting = makePainting();
  painting.position.set(0, 3.5, -5.5);
  room.add(painting);

  // Logs and embers.
  const logMaterial = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 1, emissive: 0x5a1a05 });
  for (let i = 0; i < 3; i++) {
    const log = cylinder(0.1, 0.1, 1.5, logMaterial, 0, 0.18 + (i === 2 ? 0.18 : 0), -6.1);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = [0.35, -0.35, 0][i] ?? 0;
    room.add(log);
  }
  const embers = box(1.5, 0.08, 0.9, new THREE.MeshBasicMaterial({ color: 0xff5a14 }), 0, 0.06, -6.1);
  room.add(embers);

  const flames: THREE.Mesh[] = [];
  const colors = [0xff7a1a, 0xffa31f, 0xffd24a, 0xff5a14, 0xffb83a];
  for (let i = 0; i < 5; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.2 - Math.abs(i - 2) * 0.03, 0.9 - Math.abs(i - 2) * 0.12, 8),
      new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.position.set((i - 2) * 0.28, 0.5, -6.1 + (i % 2) * 0.1);
    flames.push(flame);
    room.add(flame);
  }

  const positions = new Float32Array(40 * 3);
  const sparks = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)),
    new THREE.PointsMaterial({
      color: 0xffc766,
      size: 0.07,
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sparks.frustumCulled = false;
  room.add(sparks);
  return { flames, sparks };
}

function buildMantelDecor(room: THREE.Group): THREE.Mesh[] {
  const flames: THREE.Mesh[] = [];
  for (const x of [-2.1, -1.7, 1.9]) {
    const candle = makeCandle();
    candle.group.position.set(x, 2.02, -5.25);
    room.add(candle.group);
    flames.push(candle.flame);
  }
  const bookColors = [0x8c2f2f, 0x2f5d8c, 0x3d6b3a];
  bookColors.forEach((color, i) => {
    room.add(box(0.42, 0.09, 0.3, new THREE.MeshStandardMaterial({ color }), 1.2, 2.07 + i * 0.09, -5.3));
  });
  const plant = makePlant();
  plant.scale.setScalar(0.42);
  plant.position.set(2.15, 2.02, -5.3);
  room.add(plant);
  return flames;
}

function buildWindows(room: THREE.Group): THREE.MeshStandardMaterial {
  const panes = new THREE.MeshStandardMaterial({
    color: 0x9cc9f0,
    emissive: 0x9cc9f0,
    emissiveIntensity: 1,
    roughness: 0.3,
  });
  const frame = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.8 });
  const curtain = new THREE.MeshStandardMaterial({ color: 0xa8442f, roughness: 1 });
  for (const x of [-5.6, 5.6]) {
    const window = new THREE.Group();
    window.position.set(x, 3.0, -6.82);
    window.add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.2), panes));
    window.add(box(2.0, 0.15, 0.2, frame, 0, 1.15, 0.02));
    window.add(box(2.0, 0.15, 0.2, frame, 0, -1.15, 0.02));
    for (const sx of [-1, 1]) window.add(box(0.15, 2.4, 0.2, frame, sx * 0.93, 0, 0.02));
    window.add(box(0.07, 2.2, 0.1, frame, 0, 0, 0.04));
    window.add(box(1.7, 0.07, 0.1, frame, 0, 0, 0.04));
    for (const sx of [-1, 1]) {
      window.add(box(0.55, 2.7, 0.18, curtain, sx * 1.25, -0.05, 0.12));
    }
    const rod = cylinder(0.04, 0.04, 3.2, frame, 0, 1.45, 0.15, 8);
    rod.rotation.z = Math.PI / 2;
    window.add(rod);
    room.add(window);
  }
  return panes;
}

function buildStringLights(room: THREE.Group): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffd58a });
  const points: THREE.Vector3[] = [];
  const count = 22;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = -8.2 + t * 16.4;
    const sag = Math.sin(t * Math.PI * 3);
    points.push(new THREE.Vector3(x, 5.2 - Math.abs(sag) * 0.45, -6.75));
  }
  const wire = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x1a0f08 }),
  );
  room.add(wire);
  const bulb = new THREE.SphereGeometry(0.07, 8, 6);
  for (const point of points) {
    const mesh = new THREE.Mesh(bulb, material);
    mesh.position.copy(point).add(new THREE.Vector3(0, -0.08, 0.02));
    room.add(mesh);
  }
  return material;
}

export function buildRoom(): Room {
  const group = new THREE.Group();

  const floorMap = floorTexture();
  floorMap.repeat.set(5, 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 22),
    new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 4);
  floor.receiveShadow = true;
  group.add(floor);

  const wallMaterial = (repeatX: number) => {
    const map = logWallTexture();
    map.repeat.set(repeatX, 1.5);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  };
  group.add(box(18, 6, 0.3, wallMaterial(3), 0, 3, -7.1));
  group.add(box(0.3, 6, 14, wallMaterial(2.4), -9, 3, 0));
  group.add(box(0.3, 6, 14, wallMaterial(2.4), 9, 3, 0));
  // Skirting boards and a ceiling beam give the room its frame.
  const trim = new THREE.MeshStandardMaterial({ color: 0x3d2514, roughness: 0.85 });
  group.add(box(18, 0.25, 0.1, trim, 0, 0.12, -6.9));
  group.add(box(18, 0.4, 0.5, trim, 0, 5.8, -6.8));

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1, transparent: true }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.scale.set(4.4, 3.4, 1);
  rug.position.set(CENTER.x, 0.012, CENTER.y);
  rug.receiveShadow = true;
  group.add(rug);

  const { flames, sparks } = buildFireplace(group);
  const candleFlames = buildMantelDecor(group);
  const panes = buildWindows(group);
  const stringLights = buildStringLights(group);

  // The seats are listed in an order that keeps any prefix balanced around the rug.
  const pieces: { piece: Piece; x: number; z: number }[] = [
    { piece: makeArmchair("#7a2c24"), x: -2.9, z: -2.5 },
    { piece: makeRockingChair(), x: 0, z: -3.0 },
    { piece: makeArmchair("#3f5a3a"), x: 2.9, z: -2.5 },
    { piece: makeSofa("#b0752f", "#7a2c24"), x: 5.0, z: 0.4 },
    { piece: makeChair(), x: 2.7, z: 3.3 },
    { piece: makeStool(), x: 0, z: 3.7 },
    { piece: makeChair(), x: -2.7, z: 3.3 },
    { piece: makeSofa("#3f5a3a", "#e9d9b5"), x: -5.0, z: 0.4 },
  ];
  const seats: Seat[] = [];
  for (const { piece, x, z } of pieces) {
    place(piece.group, x, z);
    group.add(piece.group);
  }
  // Seat order: armchair, rocker, armchair, sofa (2), chair, stool, chair, sofa (2).
  const order = [0, 1, 2, 3, 3, 4, 5, 6, 7, 7];
  const spotIndex = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  order.forEach((pieceIndex, i) => {
    const entry = pieces[pieceIndex];
    const spot = entry?.piece.seats[spotIndex[i] ?? 0];
    if (entry && spot) seats.push({ piece: entry.piece.group, spot });
  });

  const table = makeCoffeeTable();
  table.position.set(CENTER.x, 0, CENTER.y);
  group.add(table);

  const bookshelf = makeBookshelf();
  bookshelf.position.set(-8.7, 0, -3.6);
  bookshelf.rotation.y = Math.PI / 2;
  group.add(bookshelf);

  const cupboard = makeCupboard();
  cupboard.position.set(8.5, 0, -3.8);
  cupboard.rotation.y = -Math.PI / 2;
  group.add(cupboard);

  for (const [x, z] of [
    [-8.1, -6.3],
    [8.1, -6.3],
    [7.8, 3.4],
  ] as const) {
    const plant = makePlant();
    plant.position.set(x, 0, z);
    group.add(plant);
  }

  const firewood = makeFirewoodStack();
  firewood.position.set(3.9, 0, -6.2);
  group.add(firewood);
  const basket = makeBasket();
  basket.position.set(-4.0, 0, -6.1);
  group.add(basket);

  const lampPositions = [new THREE.Vector3(6.4, 1.8, -1.6), new THREE.Vector3(-6.4, 1.8, -1.6)];
  for (const position of lampPositions) {
    const lamp = makeFloorLamp();
    lamp.position.set(position.x, 0, position.z);
    group.add(lamp);
  }

  return {
    group,
    seats,
    flames,
    sparks,
    candleFlames,
    panes,
    stringLights,
    lampPositions,
    narratorSpot: new THREE.Vector3(-2.9, 0, -4.5),
  };
}
