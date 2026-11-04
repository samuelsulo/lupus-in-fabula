import * as THREE from "three";

export interface AvatarLook {
  /** Sweater colour, stable per seat so every client agrees. */
  color: string;
  index: number;
  alive: boolean;
}

export interface Avatar {
  group: THREE.Group;
  head: THREE.Group;
  body: THREE.Mesh;
  /** Materials whose emissive colour is raised when hovered. */
  tinted: THREE.MeshStandardMaterial[];
  /** Swinging limbs, only on standing people (they walk). */
  legs?: [THREE.Group, THREE.Group];
  arms?: [THREE.Group, THREE.Group];
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

/**
 * Geometries are identical from one person to the next, so they are built once and shared.
 * They are marked so the scene does not dispose them with the person who happens to use them.
 */
export function sharedGeometry<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = make();
    geometry.userData.shared = true;
    geometryCache.set(key, geometry);
  }
  return geometry as T;
}

type MakeMaterial = (color: number | string, roughness?: number) => THREE.MeshStandardMaterial;

const SKIN = [0xf1c9a5, 0xe0ac86, 0xc58c63, 0x8d5a3b, 0xf4d2b6];
const HAIR = [0x2b1a10, 0x6b3f1d, 0xc99a4b, 0x1a1a1a, 0x8a8a8a, 0x9c3b1f];
const TROUSERS = [0x2f3e57, 0x4a3b2a, 0x3b3b3b, 0x56452d];

function limb(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = to.clone().sub(from);
  const length = Math.max(0.01, direction.length() - radius * 2);
  const geometry = sharedGeometry(
    `capsule:${radius.toFixed(3)}:${length.toFixed(2)}`,
    () => new THREE.CapsuleGeometry(radius, length, 4, 8),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

/** The head pivots at the neck so it can bow at night. */
function makeHead(look: AvatarLook, material: MakeMaterial, skin: THREE.Material): THREE.Group {
  const head = new THREE.Group();
  const skull = new THREE.Mesh(
    sharedGeometry("Sphere:0.18, 16, 12", () => new THREE.SphereGeometry(0.18, 16, 12)),
    skin,
  );
  skull.position.y = 0.2;
  skull.castShadow = true;
  head.add(skull);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: look.alive ? 0x1a1208 : 0x30343a });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      sharedGeometry("Sphere:0.02, 6, 4", () => new THREE.SphereGeometry(0.02, 6, 4)),
      eyeMaterial,
    );
    eye.position.set(side * 0.065, 0.22, 0.165);
    head.add(eye);
  }

  const style = look.index % 3;
  if (style === 1) {
    // A woolly beanie with a pompom.
    const beanie = new THREE.Mesh(
      sharedGeometry(
        "Sphere:0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55",
        () => new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
      ),
      material(look.index % 2 ? 0xe9d9b5 : 0xa8442f, 1),
    );
    beanie.position.y = 0.22;
    beanie.rotation.x = -0.15;
    head.add(beanie);
    const pompom = new THREE.Mesh(
      sharedGeometry("Sphere:0.05, 8, 6", () => new THREE.SphereGeometry(0.05, 8, 6)),
      material(0xe9d9b5, 1),
    );
    pompom.position.set(0, 0.43, -0.03);
    head.add(pompom);
  } else {
    const hairColor = HAIR[look.index % HAIR.length] ?? HAIR[0]!;
    const hair = new THREE.Mesh(
      sharedGeometry(
        `Sphere:hair:${style}`,
        () =>
          new THREE.SphereGeometry(0.195, 14, 10, 0, Math.PI * 2, 0, Math.PI * (style === 2 ? 0.75 : 0.5)),
      ),
      material(hairColor, 1),
    );
    hair.position.set(0, 0.22, style === 2 ? -0.03 : -0.015);
    hair.rotation.x = -0.25;
    head.add(hair);
  }
  return head;
}

/**
 * A seated person, facing +z, whose lap is at y = 0. Heads, hair and clothes vary
 * by seat; the dead turn grey.
 */
export function makeSeatedAvatar(look: AvatarLook, seatHeight: number): Avatar {
  const group = new THREE.Group();
  const tinted: THREE.MeshStandardMaterial[] = [];
  const material: MakeMaterial = (color, roughness = 0.8) => {
    const m = new THREE.MeshStandardMaterial({ color: look.alive ? color : 0x6a6e76, roughness });
    tinted.push(m);
    return m;
  };

  const sweater = material(look.color, 0.9);
  const trousers = material(TROUSERS[look.index % TROUSERS.length] ?? 0x333333);
  const skin = material(SKIN[look.index % SKIN.length] ?? SKIN[0]!, 0.7);

  const body = new THREE.Mesh(
    sharedGeometry("Capsule:0.21, 0.32, 6, 12", () => new THREE.CapsuleGeometry(0.21, 0.32, 6, 12)),
    sweater,
  );
  body.position.set(0, 0.42, -0.04);
  body.castShadow = true;
  group.add(body);

  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(side * 0.12, 0.08, -0.02);
    const knee = new THREE.Vector3(side * 0.13, 0.1, 0.42);
    const foot = new THREE.Vector3(side * 0.13, -seatHeight + 0.06, 0.5);
    group.add(limb(hip, knee, 0.085, trousers));
    group.add(limb(knee, foot, 0.075, trousers));
    const shoulder = new THREE.Vector3(side * 0.24, 0.6, -0.04);
    const elbow = new THREE.Vector3(side * 0.27, 0.32, 0.08);
    const hand = new THREE.Vector3(side * 0.15, 0.16, 0.3);
    group.add(limb(shoulder, elbow, 0.058, sweater));
    group.add(limb(elbow, hand, 0.052, sweater));
    const handMesh = new THREE.Mesh(
      sharedGeometry("Sphere:0.05, 8, 6", () => new THREE.SphereGeometry(0.05, 8, 6)),
      skin,
    );
    handMesh.position.copy(hand);
    group.add(handMesh);
  }

  const head = makeHead(look, material, skin);
  head.position.set(0, 0.72, -0.02);
  group.add(head);

  return { group, head, body, tinted };
}

/** A person on their feet, facing +z, standing on the floor at y = 0. Arms and legs can swing to walk. */
export function makeStandingAvatar(look: AvatarLook): Avatar {
  const group = new THREE.Group();
  const tinted: THREE.MeshStandardMaterial[] = [];
  const material: MakeMaterial = (color, roughness = 0.8) => {
    const m = new THREE.MeshStandardMaterial({ color: look.alive ? color : 0x6a6e76, roughness });
    tinted.push(m);
    return m;
  };
  const sweater = material(look.color, 0.9);
  const trousers = material(TROUSERS[look.index % TROUSERS.length] ?? 0x333333);
  const skin = material(SKIN[look.index % SKIN.length] ?? SKIN[0]!, 0.7);

  const body = new THREE.Mesh(
    sharedGeometry("Capsule:0.21, 0.4, 6, 12", () => new THREE.CapsuleGeometry(0.21, 0.4, 6, 12)),
    sweater,
  );
  body.position.y = 1.15;
  body.castShadow = true;
  group.add(body);

  const pivot = (x: number, y: number, to: THREE.Vector3, radius: number, mat: THREE.Material) => {
    const holder = new THREE.Group();
    holder.position.set(x, y, 0);
    holder.add(limb(new THREE.Vector3(0, 0, 0), to, radius, mat));
    group.add(holder);
    return holder;
  };
  const legs: [THREE.Group, THREE.Group] = [
    pivot(-0.12, 0.88, new THREE.Vector3(0, -0.86, 0), 0.085, trousers),
    pivot(0.12, 0.88, new THREE.Vector3(0, -0.86, 0), 0.085, trousers),
  ];
  const arms: [THREE.Group, THREE.Group] = [
    pivot(-0.27, 1.42, new THREE.Vector3(0, -0.55, 0.02), 0.058, sweater),
    pivot(0.27, 1.42, new THREE.Vector3(0, -0.55, 0.02), 0.058, sweater),
  ];

  const head = makeHead(look, material, skin);
  head.position.set(0, 1.5, 0);
  group.add(head);
  return { group, head, body, tinted, legs, arms };
}

/** The narrator: a standing figure in a long hooded cloak, holding a lantern. */
export function makeNarratorAvatar(): THREE.Group {
  const group = new THREE.Group();
  const cloak = new THREE.MeshStandardMaterial({ color: 0x3c2a52, roughness: 1 });
  const robe = new THREE.Mesh(
    sharedGeometry("Cone:0.42, 1.5, 14", () => new THREE.ConeGeometry(0.42, 1.5, 14)),
    cloak,
  );
  robe.position.y = 0.75;
  robe.castShadow = true;
  group.add(robe);
  const head = new THREE.Mesh(
    sharedGeometry("Sphere:0.17, 14, 10", () => new THREE.SphereGeometry(0.17, 14, 10)),
    new THREE.MeshStandardMaterial({ color: 0xe0ac86 }),
  );
  head.position.y = 1.62;
  group.add(head);
  const hood = new THREE.Mesh(
    sharedGeometry(
      "Sphere:0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62",
      () => new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    ),
    cloak,
  );
  hood.position.set(0, 1.65, -0.02);
  hood.rotation.x = -0.35;
  group.add(hood);
  const lantern = new THREE.Mesh(
    sharedGeometry("Box:0.16, 0.2, 0.16", () => new THREE.BoxGeometry(0.16, 0.2, 0.16)),
    new THREE.MeshBasicMaterial({ color: 0xffc766 }),
  );
  lantern.position.set(0.42, 0.95, 0.25);
  group.add(lantern);
  const arm = limb(new THREE.Vector3(0.22, 1.3, 0), new THREE.Vector3(0.42, 1.08, 0.25), 0.05, cloak);
  group.add(arm);
  return group;
}
