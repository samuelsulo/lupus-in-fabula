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

describe("human narrator", () => {
  const narrated = () =>
    createGame({
      players: ROLES.map((_, i) => ({ id: `p${i}`, name: `P${i}` })),
      narrator: { id: "n", name: "Nara" },
      roles: ROLES,
      seed: 3,
    });

  it("sees every role and the night choices, without playing", () => {
    const view = viewFor(advance(narrated()), "n");
    expect(view.me.role).toBeNull();
    expect(view.players.every((p) => p.role !== null)).toBe(true);
    expect(view.narratorInfo?.awake).toBe("werewolf");
    expect(view.action).toBeNull();
    expect(view.asleep).toBe(false);
  });

  it("does not leak roles to players", () => {
    const view = viewFor(narrated(), "p0");
    expect(view.narratorInfo).toBeNull();
    expect(view.players.filter((p) => p.role !== null).map((p) => p.id)).toEqual(["p0"]);
  });

  it("lets the awake role whisper with the narrator at night, and nobody else", () => {
    const s = advance(narrated());
    const routing = voiceRouting(s);
    const wolves = s.players.filter((p) => p.role === "werewolf").map((p) => p.id);
    expect([...routing[wolves[0]!]!].sort()).toEqual([wolves[1]!, "n"].sort());
    expect([...routing.n!].sort()).toEqual([...wolves].sort());
    const villager = s.players.find((p) => p.role === "villager")!.id;
    expect(routing[villager]).toEqual([]);
  });

  it("lets the narrator speak to and hear everyone by day", () => {
    const s = { ...advance(narrated()), phase: "DAY_DISCUSSION" as const };
    const routing = voiceRouting(s);
    expect(routing.n).toHaveLength(ROLES.length);
    expect(routing.p0).toContain("n");
  });
});

describe("open votes", () => {
  it("shows who votes for whom while the vote is open, unless the config hides it", () => {
    const base = { ...game(), phase: "DAY_VOTE" as const, votes: { p0: "p1" } };
    expect(viewFor(base, "p2").votes).toEqual({ p0: "p1" });
    const secret = { ...base, config: { ...base.config, openVotes: false } };
    expect(viewFor(secret, "p2").votes).toEqual({});
  });
});

describe("ghost channel", () => {
  it("lets the dead talk and hear each other, day and night, and never the living", () => {
    for (const phase of ["NIGHT", "DAY_DISCUSSION"] as const) {
      const base = advance(game());
      const s = {
        ...base,
        phase,
        players: base.players.map((p, i) => (i < 2 ? { ...p, alive: false } : p)),
      };
      const routing = voiceRouting(s);
      expect(routing.p0).toEqual(["p1"]);
      expect(routing.p1).toEqual(["p0"]);
    }
  });
});
