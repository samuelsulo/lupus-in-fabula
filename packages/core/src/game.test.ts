import { describe, expect, it } from "vitest";
import {
  advance,
  applyIntent,
  awakeRole,
  createGame,
  getPlayer,
  type GameState,
  type RoleId,
} from "./index.ts";

const ROLES_6: RoleId[] = ["werewolf", "werewolf", "seer", "doctor", "villager", "villager"];

function setup(roles: RoleId[] = ROLES_6, seed = 1): GameState {
  const players = roles.map((_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
  return createGame({ players, roles, seed });
}

function byRole(state: GameState, role: RoleId): string[] {
  return state.players.filter((p) => p.role === role).map((p) => p.id);
}

function mustApply(state: GameState, id: string, intent: Parameters<typeof applyIntent>[2]): GameState {
  const result = applyIntent(state, id, intent);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Plays a full night: wolves kill `victim`, doctor protects `saved`, seer inspects `inspected`. */
function playNight(state: GameState, victim: string, saved: string, inspected: string): GameState {
  let s = state;
  if (s.phase === "ROLE_REVEAL" || s.phase === "ELIMINATION") s = advance(s);
  for (const wolf of byRole(s, "werewolf").filter((id) => getPlayer(s, id)?.alive)) {
    s = mustApply(s, wolf, { type: "night-action", target: victim });
  }
  for (const doctor of byRole(s, "doctor").filter((id) => getPlayer(s, id)?.alive)) {
    s = mustApply(s, doctor, { type: "night-action", target: saved });
  }
  for (const seer of byRole(s, "seer").filter((id) => getPlayer(s, id)?.alive)) {
    s = mustApply(s, seer, { type: "night-action", target: inspected });
  }
  return s;
}

describe("createGame", () => {
  it("assigns the given roles deterministically for a seed", () => {
    expect(setup(ROLES_6, 7).players.map((p) => p.role)).toEqual(
      setup(ROLES_6, 7).players.map((p) => p.role),
    );
    expect([...setup().players.map((p) => p.role)].sort()).toEqual([...ROLES_6].sort());
  });

  it("rejects invalid setups", () => {
    expect(() => setup(["werewolf", "villager", "villager"])).toThrow();
    expect(() => setup(["villager", "villager", "villager", "villager"])).toThrow();
  });
});

describe("night", () => {
  it("wakes roles in order and skips roles with no living players", () => {
    let s = advance(setup());
    expect(s.phase).toBe("NIGHT");
    expect(awakeRole(s)).toBe("werewolf");
    const victim = byRole(s, "villager")[0] as string;
    for (const wolf of byRole(s, "werewolf")) {
      s = mustApply(s, wolf, { type: "night-action", target: victim });
    }
    expect(awakeRole(s)).toBe("doctor");
  });

  it("kills the werewolves' victim at dawn", () => {
    const s0 = advance(setup());
    const victim = byRole(s0, "villager")[0] as string;
    const s = playNight(s0, victim, byRole(s0, "seer")[0] as string, byRole(s0, "werewolf")[0] as string);
    expect(s.phase).toBe("DAWN");
    expect(getPlayer(s, victim)?.alive).toBe(false);
    expect(s.events).toContainEqual({ type: "death", day: 1, playerId: victim, cause: "werewolves" });
  });

  it("lets the doctor save the victim", () => {
    const s0 = advance(setup());
    const victim = byRole(s0, "villager")[0] as string;
    const s = playNight(s0, victim, victim, byRole(s0, "werewolf")[0] as string);
    expect(getPlayer(s, victim)?.alive).toBe(true);
    expect(s.events).toContainEqual({ type: "no-death", day: 1 });
  });

  it("records the seer's inspection", () => {
    const s0 = advance(setup());
    const wolf = byRole(s0, "werewolf")[0] as string;
    const s = playNight(s0, byRole(s0, "villager")[0] as string, wolf, wolf);
    expect(s.inspections).toEqual([
      { seerId: byRole(s0, "seer")[0], day: 1, targetId: wolf, isWerewolf: true },
    ]);
  });

  it("rejects invalid night actions", () => {
    const s = advance(setup());
    const [wolf] = byRole(s, "werewolf") as [string];
    const [seer] = byRole(s, "seer") as [string];
    const [villager] = byRole(s, "villager") as [string];
    expect(
      applyIntent(s, wolf, { type: "night-action", target: byRole(s, "werewolf")[1] as string }).ok,
    ).toBe(false);
    expect(applyIntent(s, seer, { type: "night-action", target: villager }).ok).toBe(false);
    expect(applyIntent(s, villager, { type: "night-action", target: wolf }).ok).toBe(false);
  });

  it("skips missing actions when the narrator advances", () => {
    let s = advance(setup());
    s = advance(advance(advance(s)));
    expect(s.phase).toBe("DAWN");
    expect(s.events).toContainEqual({ type: "no-death", day: 1 });
  });
});

describe("day", () => {
  function toVote(): GameState {
    const s0 = advance(setup());
    let s = playNight(
      s0,
      byRole(s0, "villager")[0] as string,
      byRole(s0, "seer")[0] as string,
      byRole(s0, "werewolf")[0] as string,
    );
    s = advance(s);
    s = advance(s);
    expect(s.phase).toBe("DAY_VOTE");
    return s;
  }

  it("eliminates the player with the most votes and finishes when everyone voted", () => {
    let s = toVote();
    const target = byRole(s, "werewolf")[0] as string;
    for (const p of s.players.filter((p) => p.alive)) {
      s = mustApply(s, p.id, {
        type: "vote",
        target: p.id === target ? (byRole(s, "werewolf")[1] as string) : target,
      });
    }
    expect(s.phase).toBe("ELIMINATION");
    expect(getPlayer(s, target)?.alive).toBe(false);
  });

  it("eliminates nobody on a tie", () => {
    let s = toVote();
    const [l0, l1, l2, l3, l4] = s.players.filter((p) => p.alive).map((p) => p.id) as [
      string,
      string,
      string,
      string,
      string,
    ];
    s = mustApply(s, l0, { type: "vote", target: l1 });
    s = mustApply(s, l2, { type: "vote", target: l1 });
    s = mustApply(s, l1, { type: "vote", target: l0 });
    s = mustApply(s, l3, { type: "vote", target: l0 });
    s = mustApply(s, l4, { type: "vote", target: null });
    expect(s.events).toContainEqual({
      type: "vote-result",
      day: 1,
      tally: { [l1]: 2, [l0]: 2 },
      eliminated: null,
    });
    expect(s.players.filter((p) => p.alive)).toHaveLength(5);
  });

  it("rejects votes for dead players or from dead players", () => {
    const s = toVote();
    const dead = s.players.find((p) => !p.alive)?.id as string;
    const alive = s.players.find((p) => p.alive)?.id as string;
    expect(applyIntent(s, alive, { type: "vote", target: dead }).ok).toBe(false);
    expect(applyIntent(s, dead, { type: "vote", target: alive }).ok).toBe(false);
  });
});

describe("victory", () => {
  it("villagers win when the last werewolf is voted out", () => {
    let s = setup(["werewolf", "seer", "doctor", "villager"]);
    s = advance(s);
    const wolf = byRole(s, "werewolf")[0] as string;
    const villager = byRole(s, "villager")[0] as string;
    s = playNight(s, villager, villager, wolf); // saved
    s = advance(advance(s)); // dawn -> discussion -> vote
    for (const p of s.players.filter((p) => p.alive && p.id !== wolf)) {
      s = mustApply(s, p.id, { type: "vote", target: wolf });
    }
    s = mustApply(s, wolf, { type: "vote", target: villager });
    expect(s.winner).toBe("villagers");
    expect(s.phase).toBe("GAME_OVER");
  });

  it("werewolves win when they are at least as many as the others", () => {
    let s = setup(["werewolf", "villager", "villager"].concat(["villager"]) as RoleId[]);
    s = advance(s);
    const wolf = byRole(s, "werewolf")[0] as string;
    const villagers = byRole(s, "villager");
    s = mustApply(s, wolf, { type: "night-action", target: villagers[0] as string });
    expect(s.phase).toBe("DAWN");
    s = advance(advance(s)); // vote, nobody votes
    s = advance(s); // tally: no elimination
    s = advance(s); // night 2
    s = mustApply(s, wolf, { type: "night-action", target: villagers[1] as string });
    expect(s.winner).toBe("werewolves");
  });
});
