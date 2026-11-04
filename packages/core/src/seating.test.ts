import { describe, expect, it } from "vitest";
import { SEAT_COUNT, WALK_BOUNDS, initialSeating, moveTo, seatStanding } from "./seating.ts";

const ids = ["a", "b", "c", "d"];

describe("seating", () => {
  it("spreads players over distinct seats", () => {
    const seats = Object.values(initialSeating(ids)).map((p) => (p.kind === "seat" ? p.seat : -1));
    expect(new Set(seats).size).toBe(ids.length);
    expect(Math.max(...seats)).toBeLessThan(SEAT_COUNT);
  });

  it("uses every seat when the room is full", () => {
    const full = initialSeating(Array.from({ length: SEAT_COUNT }, (_, i) => `p${i}`));
    expect(new Set(Object.values(full).map((p) => (p.kind === "seat" ? p.seat : -1))).size).toBe(SEAT_COUNT);
  });

  it("refuses taken seats, unknown players and bad seat numbers", () => {
    const seating = initialSeating(ids);
    const taken = seating.b;
    expect(taken?.kind === "seat" && moveTo(seating, "a", taken)).toBeNull();
    expect(moveTo(seating, "ghost", { kind: "seat", seat: 0 })).toBeNull();
    expect(moveTo(seating, "a", { kind: "seat", seat: SEAT_COUNT })).toBeNull();
    expect(moveTo(seating, "a", { kind: "seat", seat: 1.5 })).toBeNull();
  });

  it("lets a player walk anywhere on the floor, clamped to the walkable area", () => {
    const moved = moveTo(initialSeating(ids), "a", { kind: "stand", x: 99, z: -99 });
    expect(moved?.a).toEqual({ kind: "stand", x: WALK_BOUNDS.maxX, z: WALK_BOUNDS.minZ });
  });

  it("frees a seat when its owner stands up", () => {
    const seating = initialSeating(ids);
    const before = seating.a;
    const standing = moveTo(seating, "a", { kind: "stand", x: 0, z: 2 }) ?? seating;
    expect(before?.kind === "seat" && moveTo(standing, "b", before)).not.toBeNull();
  });

  it("sits down everyone who is standing at night, on free seats", () => {
    const standing = moveTo(initialSeating(ids), "a", { kind: "stand", x: 0, z: 2 }) ?? {};
    const seated = seatStanding(standing);
    const seats = Object.values(seated).map((p) => (p.kind === "seat" ? p.seat : -1));
    expect(seats.every((seat) => seat >= 0)).toBe(true);
    expect(new Set(seats).size).toBe(ids.length);
  });

  it("lists a human narrator standing, who may walk but never sit", () => {
    const seating = initialSeating(ids, "n");
    expect(seating.n?.kind).toBe("stand");
    expect(moveTo(seating, "n", { kind: "seat", seat: 0 }, true)).toBeNull();
    expect(moveTo(seating, "n", { kind: "stand", x: 1, z: 1 }, true)?.n).toEqual({
      kind: "stand",
      x: 1,
      z: 1,
    });
  });

  it("does not sit the narrator down at night", () => {
    expect(seatStanding(initialSeating(ids, "n"), "n").n?.kind).toBe("stand");
  });
});
