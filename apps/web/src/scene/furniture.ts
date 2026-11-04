import * as THREE from "three";
import { fabricTexture } from "./textures.ts";

/** A place where one player can sit, in the local space of its furniture (facing +z). */
export interface SeatSpot {
  x: number;
  y: number;
  z: number;
}

export interface Piece {
  group: THREE.Group;
  seats: SeatSpot[];
}

const wood = (color = 0x6b4426) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
const cloth = (color: string) =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTexture(color), roughness: 1 });

export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  segments = 14,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function legs(group: THREE.Group, material: THREE.Material, w: number, d: number, height: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(cylinder(0.04, 0.03, height, material, (sx * w) / 2, height / 2, (sz * d) / 2, 8));
    }
  }
}

/** A two-seater sofa with a throw pillow and a folded blanket. */
export function makeSofa(fabric: string, blanket: string): Piece {
  const group = new THREE.Group();
  const frame = wood(0x4a2d18);
  const cover = cloth(fabric);
  legs(group, frame, 2.6, 0.9, 0.18);
  group.add(box(2.8, 0.3, 1.0, cover, 0, 0.33, 0));
  for (const x of [-0.62, 0.62]) group.add(box(1.2, 0.16, 0.85, cloth(fabric), x, 0.56, 0.05));
  group.add(box(2.8, 0.75, 0.26, cover, 0, 0.85, -0.4));
  for (const x of [-1.35, 1.35]) group.add(box(0.2, 0.55, 1.0, cover, x, 0.62, 0));
  const pillow = box(0.5, 0.45, 0.14, cloth(blanket), -1.0, 0.95, -0.2);
  pillow.rotation.z = 0.25;
  group.add(pillow);
  group.add(box(0.5, 0.1, 0.9, cloth(blanket), 1.35, 0.92, 0.05));
  return { group, seats: [-0.62, 0.62].map((x) => ({ x, y: 0.64, z: 0.05 })) };
}

export function makeArmchair(fabric: string): Piece {
  const group = new THREE.Group();
  const frame = wood(0x4a2d18);
  const cover = cloth(fabric);
  legs(group, frame, 0.9, 0.8, 0.16);
  group.add(box(1.15, 0.28, 1.0, cover, 0, 0.3, 0));
  group.add(box(0.8, 0.16, 0.8, cloth(fabric), 0, 0.52, 0.05));
  group.add(box(1.15, 0.95, 0.24, cover, 0, 0.8, -0.38));
  for (const x of [-0.5, 0.5]) group.add(box(0.2, 0.5, 0.95, cover, x, 0.55, 0.02));
  return { group, seats: [{ x: 0, y: 0.6, z: 0.05 }] };
}

export function makeChair(): Piece {
  const group = new THREE.Group();
  const frame = wood(0x7a4f2c);
  legs(group, frame, 0.6, 0.6, 0.5);
  group.add(box(0.72, 0.06, 0.7, frame, 0, 0.52, 0));
  group.add(box(0.5, 0.05, 0.5, cloth("#9c3b2e"), 0, 0.58, 0.02));
  for (const x of [-0.3, 0.3]) group.add(box(0.06, 0.8, 0.06, frame, x, 0.9, -0.3));
  for (const y of [0.85, 1.1, 1.3]) group.add(box(0.66, 0.1, 0.04, frame, 0, y, -0.3));
  return { group, seats: [{ x: 0, y: 0.61, z: 0.02 }] };
}

export function makeStool(): Piece {
  const group = new THREE.Group();
  const frame = wood(0x7a4f2c);
  group.add(cylinder(0.34, 0.34, 0.07, frame, 0, 0.5, 0, 20));
  group.add(cylinder(0.3, 0.3, 0.07, cloth("#2f5a3a"), 0, 0.56, 0, 20));
  for (let i = 0; i < 3; i++) {
    const angle = (i * 2 * Math.PI) / 3;
    const leg = cylinder(0.035, 0.03, 0.52, frame, Math.cos(angle) * 0.2, 0.25, Math.sin(angle) * 0.2, 8);
    leg.rotation.set(Math.sin(angle) * 0.12, 0, -Math.cos(angle) * 0.12);
    group.add(leg);
  }
  return { group, seats: [{ x: 0, y: 0.6, z: 0 }] };
}

export function makeRockingChair(): Piece {
  const group = new THREE.Group();
  const frame = wood(0x5c3a20);
  for (const x of [-0.4, 0.4]) {
    const runner = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.035, 8, 24, 0.7), frame);
    runner.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.35);
    runner.position.set(x, 1.4 + 0.04, 0);
    group.add(runner);
    group.add(box(0.05, 0.62, 0.05, frame, x, 0.35, 0.28));
    group.add(box(0.05, 0.62, 0.05, frame, x, 0.35, -0.28));
    group.add(box(0.05, 0.4, 0.05, frame, x, 0.8, 0.28));
  }
  group.add(box(0.85, 0.06, 0.7, frame, 0, 0.55, 0));
  group.add(box(0.7, 0.06, 0.55, cloth("#b0752f"), 0, 0.61, 0.03));
  group.add(box(0.85, 1.0, 0.06, frame, 0, 1.0, -0.32));
  for (const x of [-0.42, 0.42]) group.add(box(0.06, 0.06, 0.6, frame, x, 0.8, 0));
  return { group, seats: [{ x: 0, y: 0.64, z: 0.02 }] };
}

function makeBooks(random: () => number, count: number, width: number): THREE.Group {
  const shelf = new THREE.Group();
  const colors = [0x8c2f2f, 0x2f5d8c, 0x3d6b3a, 0xb58a2f, 0x5b3a6b, 0x7a4f2c, 0xd9c9a3];
  let x = -width / 2;
  for (let i = 0; i < count && x < width / 2 - 0.1; i++) {
    const w = 0.07 + random() * 0.07;
    const h = 0.35 + random() * 0.2;
    const book = box(
      w,
      h,
      0.28,
      new THREE.MeshStandardMaterial({ color: colors[Math.floor(random() * colors.length)], roughness: 0.9 }),
      x + w / 2,
      h / 2,
      0,
    );
    book.rotation.z = random() < 0.08 ? 0.18 : 0;
    shelf.add(book);
    x += w + 0.005;
  }
  return shelf;
}

/** A tall bookshelf, facing +z. */
export function makeBookshelf(): THREE.Group {
  const group = new THREE.Group();
  const frame = wood(0x5c3a20);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  group.add(box(3, 3.6, 0.08, wood(0x3d2514), 0, 1.8, -0.18));
  for (const x of [-1.5, 1.5]) group.add(box(0.1, 3.6, 0.45, frame, x, 1.8, 0));
  for (let row = 0; row <= 4; row++) {
    group.add(box(3, 0.08, 0.45, frame, 0, 0.04 + row * 0.88, 0));
    if (row < 4) {
      const books = makeBooks(random, 30, 2.8);
      books.position.set(0, 0.08 + row * 0.88, 0);
      group.add(books);
    }
  }
  return group;
}

export function makeCupboard(): THREE.Group {
  const group = new THREE.Group();
  const frame = wood(0x6b4426);
  group.add(box(2.4, 1.5, 0.9, frame, 0, 0.75, 0));
  for (const x of [-0.6, 0.6]) {
    group.add(box(1.05, 1.25, 0.04, wood(0x7a4f2c), x, 0.75, 0.46));
    group.add(cylinder(0.04, 0.04, 0.05, wood(0xc9a24a), x + (x < 0 ? 0.4 : -0.4), 0.75, 0.5, 10));
  }
  group.add(box(2.6, 0.08, 1.0, wood(0x4a2d18), 0, 1.54, 0));
  const plate = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 });
  for (const x of [-0.8, -0.3, 0.4, 0.9]) {
    const disc = cylinder(0.26, 0.26, 0.03, plate, x, 1.85, -0.2, 20);
    disc.rotation.x = -0.25;
    group.add(disc);
  }
  group.add(box(2.2, 0.06, 0.4, frame, 0, 1.58, -0.2));
  return group;
}

export function makePlant(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    cylinder(0.32, 0.24, 0.5, new THREE.MeshStandardMaterial({ color: 0xa8582f, roughness: 1 }), 0, 0.25, 0),
  );
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3c7a3a, roughness: 1 });
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1 + (i % 3) * 0.25, 6), leaf);
    blade.position.set(Math.cos(angle) * 0.18, 0.95, Math.sin(angle) * 0.18);
    blade.rotation.set(Math.sin(angle) * 0.35, 0, -Math.cos(angle) * 0.35);
    blade.castShadow = true;
    group.add(blade);
  }
  return group;
}

export function makeCoffeeTable(): THREE.Group {
  const group = new THREE.Group();
  const frame = wood(0x5c3a20);
  group.add(cylinder(0.8, 0.8, 0.08, frame, 0, 0.5, 0, 28));
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    group.add(cylinder(0.05, 0.04, 0.48, frame, Math.cos(angle) * 0.55, 0.24, Math.sin(angle) * 0.55, 8));
  }
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.4 });
  for (const [x, z] of [
    [-0.35, 0.2],
    [0.4, -0.15],
    [0.1, 0.45],
  ] as const) {
    group.add(cylinder(0.07, 0.06, 0.1, ceramic, x, 0.59, z, 12));
  }
  const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), ceramic);
  teapot.position.set(-0.05, 0.64, -0.2);
  teapot.scale.y = 0.8;
  group.add(teapot);
  group.add(cylinder(0.02, 0.03, 0.12, ceramic, 0.12, 0.66, -0.2, 8));
  return group;
}

export function makeFloorLamp(): THREE.Group {
  const group = new THREE.Group();
  group.add(cylinder(0.2, 0.24, 0.05, wood(0x2b1a0e), 0, 0.03, 0, 16));
  group.add(cylinder(0.025, 0.025, 1.6, wood(0x2b1a0e), 0, 0.85, 0, 8));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 0.45, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, side: THREE.DoubleSide }),
  );
  shade.position.y = 1.85;
  group.add(shade);
  return group;
}

export function makeFirewoodStack(): THREE.Group {
  const group = new THREE.Group();
  const bark = wood(0x5a3a22);
  const ends = new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.9 });
  const rows = [4, 3, 2];
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.0, 10), [bark, ends, ends]);
      log.rotation.x = Math.PI / 2;
      log.position.set((i - (count - 1) / 2) * 0.27, 0.14 + row * 0.24, 0);
      log.castShadow = true;
      group.add(log);
    }
  });
  return group;
}

export function makeBasket(): THREE.Group {
  const group = new THREE.Group();
  group.add(
    cylinder(
      0.45,
      0.35,
      0.5,
      new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 1 }),
      0,
      0.25,
      0,
      18,
    ),
  );
  group.add(box(0.7, 0.2, 0.6, cloth("#a8442f"), 0, 0.55, 0));
  return group;
}

/** A framed painting: a wolf howling at the moon, drawn on a canvas. */
export function makePainting(): THREE.Group {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, 320);
    sky.addColorStop(0, "#0e1a33");
    sky.addColorStop(1, "#33466e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = "#f2e6b8";
    ctx.beginPath();
    ctx.arc(150, 90, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#0a0f1c";
    ctx.beginPath();
    ctx.ellipse(110, 360, 190, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(95, 245);
    ctx.lineTo(100, 205);
    ctx.lineTo(118, 168);
    ctx.lineTo(128, 150);
    ctx.lineTo(140, 118);
    ctx.lineTo(150, 130);
    ctx.lineTo(142, 160);
    ctx.lineTo(148, 200);
    ctx.lineTo(170, 215);
    ctx.lineTo(168, 245);
    ctx.closePath();
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const group = new THREE.Group();
  group.add(box(1.7, 2.1, 0.1, wood(0x3d2514)));
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.85),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  art.position.z = 0.06;
  group.add(art);
  return group;
}

/** A candle on a small saucer, with an emissive flame (returned for flickering). */
export function makeCandle(): { group: THREE.Group; flame: THREE.Mesh } {
  const group = new THREE.Group();
  group.add(cylinder(0.05, 0.05, 0.22, new THREE.MeshStandardMaterial({ color: 0xf0e4c4 }), 0, 0.11, 0, 10));
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc766 }),
  );
  flame.scale.y = 1.7;
  flame.position.y = 0.27;
  group.add(flame);
  return { group, flame };
}
