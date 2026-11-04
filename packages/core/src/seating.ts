/** Seats in the cabin: sofas, armchairs, chairs and a stool. The 3D room has exactly this many. */
export const SEAT_COUNT = 10;

/** The floor area people may walk on (room coordinates), clear of the fireplace and the walls. */
export const WALK_BOUNDS = { minX: -7.2, maxX: 7.2, minZ: -3.6, maxZ: 7.6 } as const;

export type Place = { kind: "seat"; seat: number } | { kind: "stand"; x: number; z: number };

/** Where every player is: sitting on a seat, or standing on the floor. The narrator is not listed. */
export type Seating = Record<string, Place>;

/** Where a human narrator starts: standing by the fireplace. */
export const NARRATOR_SPOT = { x: -2.9, z: -4.5 } as const;

/**
 * Spreads the players evenly over the seats, so sofas, armchairs and chairs all get used.
 * A human narrator is listed too, standing by the fireplace.
 */
export function initialSeating(ids: string[], narratorId: string | null = null): Seating {
  const seating: Seating = narratorId ? { [narratorId]: { kind: "stand", ...NARRATOR_SPOT } } : {};
  ids.forEach((id, i) => {
    seating[id] = { kind: "seat", seat: Math.floor(((i + 0.5) * SEAT_COUNT) / ids.length) };
  });
  return seating;
}

function isFree(seating: Seating, seat: number, except: string): boolean {
  return !Object.entries(seating).some(
    ([id, place]) => id !== except && place.kind === "seat" && place.seat === seat,
  );
}

/**
 * Validates a move. Returns the new seating, or null if it is not allowed (unknown player,
 * taken seat, or a narrator trying to sit: they only walk).
 */
export function moveTo(seating: Seating, playerId: string, to: Place, isNarrator = false): Seating | null {
  if (!(playerId in seating)) return null;
  if (to.kind === "seat") {
    if (isNarrator) return null;
    if (!Number.isInteger(to.seat) || to.seat < 0 || to.seat >= SEAT_COUNT) return null;
    if (!isFree(seating, to.seat, playerId)) return null;
    return { ...seating, [playerId]: { kind: "seat", seat: to.seat } };
  }
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    ...seating,
    [playerId]: {
      kind: "stand",
      x: clamp(to.x, WALK_BOUNDS.minX, WALK_BOUNDS.maxX),
      z: clamp(to.z, WALK_BOUNDS.minZ, WALK_BOUNDS.maxZ),
    },
  };
}

/** At night every player sits down: whoever is standing takes a free seat. The narrator keeps walking. */
export function seatStanding(seating: Seating, narratorId: string | null = null): Seating {
  const next: Seating = { ...seating };
  const taken = new Set(
    Object.values(seating).flatMap((place) => (place.kind === "seat" ? [place.seat] : [])),
  );
  for (const [id, place] of Object.entries(seating)) {
    if (place.kind === "seat" || id === narratorId) continue;
    let seat = 0;
    while (taken.has(seat)) seat++;
    taken.add(seat);
    next[id] = { kind: "seat", seat };
  }
  return next;
}
