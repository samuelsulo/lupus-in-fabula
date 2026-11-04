import { describe, expect, it } from "vitest";
import { advance, createGame, viewFor, voiceRouting, type RoleId } from "./index.ts";

const ROLES: RoleId[] = ["werewolf", "werewolf", "seer", "doctor", "villager", "villager"];
const game = () =>
  createGame({
    players: ROLES.map((_, i) => ({ id: `p${i}`, name: `P${i}` })),
    roles: ROLES,
    seed: 3,
  });

describe("viewFor", () => {
  it("only reveals the player's own role while the game runs", () => {
    const s = game();
    const view = viewFor(s, "p0");
    expect(view.players.filter((p) => p.role !== null).map((p) => p.id)).toEqual(["p0"]);
    expect(JSON.stringify(view)).not.toContain("seed");
  });

  it("shows allies only to werewolves", () => {
    const s = game();
    const wolves = s.players.filter((p) => p.role === "werewolf").map((p) => p.id);
    const villager = s.players.find((p) => p.role === "villager")!.id;
    expect(viewFor(s, wolves[0]!).allies).toEqual([wolves[1]]);
    expect(viewFor(s, villager).allies).toEqual([]);
  });

  it("puts sleeping players behind a dark screen at night", () => {
    const s = advance(game());
    const wolf = s.players.find((p) => p.role === "werewolf")!.id;
    const villager = s.players.find((p) => p.role === "villager")!.id;
    expect(viewFor(s, wolf).asleep).toBe(false);
    expect(viewFor(s, villager).asleep).toBe(true);
    expect(viewFor(s, wolf).action?.kind).toBe("night-action");
    expect(viewFor(s, villager).action).toBeNull();
  });
});

describe("voiceRouting", () => {
  it("lets only werewolves talk, and only to each other, in their night step", () => {
    const s = advance(game());
    const routing = voiceRouting(s);
    const wolves = s.players.filter((p) => p.role === "werewolf").map((p) => p.id);
    expect(routing[wolves[0]!]).toEqual([wolves[1]]);
    const villager = s.players.find((p) => p.role === "villager")!.id;
    expect(routing[villager]).toEqual([]);
  });

  it("lets everyone hear everyone during the day", () => {
    const s = advance(advance(advance(advance(advance(game())))));
    expect(s.phase).toBe("DAY_DISCUSSION");
    const routing = voiceRouting(s);
    const alive = s.players.filter((p) => p.alive);
    for (const p of alive) {
      expect(routing[p.id]).toHaveLength(s.players.length - 1);
    }
  });
});
