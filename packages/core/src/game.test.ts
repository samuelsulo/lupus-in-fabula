import { describe, expect, it } from "vitest";
import {
  advance,
  applyIntent,
  awakeRole,
  createGame,
  eligibleNarrators,
  promoteNarrator,
  replaceNarrator,
  viewFor,
  voiceRouting,
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

describe("werewolf agreement", () => {
  it("keeps the step open until the whole pack picks the same victim", () => {
    let s = advance(setup());
    const [w1, w2] = byRole(s, "werewolf") as [string, string];
    const [a, b] = byRole(s, "villager") as [string, string];
    s = mustApply(s, w1, { type: "night-action", target: a });
    s = mustApply(s, w2, { type: "night-action", target: b });
    expect(awakeRole(s)).toBe("werewolf");
    s = mustApply(s, w2, { type: "night-action", target: a });
    expect(awakeRole(s)).not.toBe("werewolf");
  });

  it("falls back to the plurality pick when the timer runs out", () => {
    let s = advance(setup());
    const [w1, w2] = byRole(s, "werewolf") as [string, string];
    const [a, b] = byRole(s, "villager") as [string, string];
    s = mustApply(s, w1, { type: "night-action", target: a });
    s = mustApply(s, w2, { type: "night-action", target: b });
    s = advance(advance(advance(s)));
    expect(s.events.filter((e) => e.type === "death")).toHaveLength(1);
  });
});

describe("human narrator", () => {
  const narrated = () => {
    const roles = ROLES_6;
    return createGame({
      players: roles.map((_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
      narrator: { id: "n", name: "Nara" },
      roles,
      seed: 1,
    });
  };

  it("keeps the step open after the action: only the narrator moves on", () => {
    let s = advance(narrated());
    const wolves = byRole(s, "werewolf");
    const [villager] = byRole(s, "villager") as [string];
    for (const wolf of wolves) s = mustApply(s, wolf, { type: "night-action", target: villager });
    expect(awakeRole(s)).toBe("werewolf");
    s = advance(s);
    expect(awakeRole(s)).toBe(s.nightSteps[1]);
  });

  it("does not treat the narrator as a player", () => {
    const s = narrated();
    expect(getPlayer(s, "n")).toBeUndefined();
    expect(applyIntent(s, "n", { type: "vote", target: "p0" }).ok).toBe(false);
  });

  it("does not tally votes by itself", () => {
    let s: GameState = { ...narrated(), phase: "DAY_VOTE" };
    for (const p of s.players) {
      const target = s.players.find((o) => o.id !== p.id)!.id;
      s = mustApply(s, p.id, { type: "vote", target });
    }
    expect(s.phase).toBe("DAY_VOTE");
    expect(advance(s).phase).toBe("ELIMINATION");
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
      votes: { [l0]: l1, [l2]: l1, [l1]: l0, [l3]: l0, [l4]: null },
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

describe("bodyguard", () => {
  const ROLES: RoleId[] = ["werewolf", "bodyguard", "seer", "villager", "villager"];

  it("dies in place of the protected player", () => {
    let s = advance(setup(ROLES));
    const [wolf] = byRole(s, "werewolf") as [string];
    const [guard] = byRole(s, "bodyguard") as [string];
    const [target] = byRole(s, "villager") as [string];
    s = mustApply(s, wolf, { type: "night-action", target });
    s = mustApply(s, guard, { type: "night-action", target });
    s = advance(advance(s));
    expect(s.events).toContainEqual({ type: "death", day: 1, playerId: guard, cause: "bodyguard" });
    expect(getPlayer(s, target)?.alive).toBe(true);
  });

  it("cannot protect themselves", () => {
    const s = advance(advance(setup(ROLES)));
    const [guard] = byRole(s, "bodyguard") as [string];
    expect(applyIntent(s, guard, { type: "night-action", target: guard }).ok).toBe(false);
  });
});

describe("hunter", () => {
  const ROLES: RoleId[] = ["werewolf", "hunter", "seer", "villager", "villager", "villager"];

  function huntedAtNight(): GameState {
    let s = advance(setup(ROLES));
    const [wolf] = byRole(s, "werewolf") as [string];
    const [hunter] = byRole(s, "hunter") as [string];
    s = mustApply(s, wolf, { type: "night-action", target: hunter });
    return advance(s);
  }

  it("takes a revenge shot after the night, then the day goes on", () => {
    let s = huntedAtNight();
    expect(s.phase).toBe("DAWN");
    s = advance(s);
    expect(s.phase).toBe("HUNTER_SHOT");
    const [hunter] = byRole(s, "hunter") as [string];
    const [wolf] = byRole(s, "werewolf") as [string];
    s = mustApply(s, hunter, { type: "night-action", target: wolf });
    expect(s.events).toContainEqual({ type: "death", day: 1, playerId: wolf, cause: "hunter" });
    expect(s.winner).toBe("villagers");
    expect(s.phase).toBe("GAME_OVER");
  });

  it("only the dead hunter can shoot, and only living players", () => {
    const s = advance(huntedAtNight());
    const [hunter] = byRole(s, "hunter") as [string];
    const [wolf] = byRole(s, "werewolf") as [string];
    expect(applyIntent(s, wolf, { type: "night-action", target: hunter }).ok).toBe(false);
    expect(applyIntent(s, hunter, { type: "night-action", target: hunter }).ok).toBe(false);
  });

  it("passes when nobody is picked in time", () => {
    let s = advance(huntedAtNight());
    expect(s.phase).toBe("HUNTER_SHOT");
    s = advance(s);
    expect(s.phase).toBe("DAY_DISCUSSION");
    expect(s.events.some((e) => e.type === "hunter-pass")).toBe(true);
  });

  it("does not end the game before the hunter has fired", () => {
    let s = advance(setup(["werewolf", "hunter", "villager", "villager"]));
    const [wolf] = byRole(s, "werewolf") as [string];
    const [hunter] = byRole(s, "hunter") as [string];
    s = mustApply(s, wolf, { type: "night-action", target: hunter });
    expect(s.phase).toBe("DAWN");
    expect(s.winner).toBeNull();
  });
});

describe("votes", () => {
  it("records who voted for whom in the result", () => {
    let s: GameState = { ...setup(), phase: "DAY_VOTE" };
    const [a, b] = s.players.map((p) => p.id) as [string, string];
    s = mustApply(s, a, { type: "vote", target: b });
    s = advance(s);
    const result = s.events.find((e) => e.type === "vote-result");
    expect(result?.type === "vote-result" && result.votes).toEqual({ [a]: b });
  });
});

describe("assignment", () => {
  it("hands out the roles the narrator picked, to the players they picked", () => {
    const players = ["a", "b", "c", "d"].map((id) => ({ id, name: id }));
    const assignment: Record<string, RoleId> = { a: "villager", b: "seer", c: "werewolf", d: "villager" };
    const s = createGame({ players, roles: Object.values(assignment), assignment, seed: 1 });
    expect(Object.fromEntries(s.players.map((p) => [p.id, p.role]))).toEqual(assignment);
  });

  it("refuses an assignment that leaves somebody without a role", () => {
    const players = ["a", "b", "c", "d"].map((id) => ({ id, name: id }));
    expect(() =>
      createGame({
        players,
        roles: ["werewolf", "villager", "villager", "villager"],
        assignment: { a: "werewolf", b: "villager", c: "villager" },
        seed: 1,
      }),
    ).toThrow();
  });
});

describe("narrator handover", () => {
  const narrated = () =>
    createGame({
      players: ROLES_6.map((_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
      narrator: { id: "n", name: "Nara" },
      roles: ROLES_6,
      seed: 1,
    });
  const withDead = (s: GameState, ids: string[]): GameState => ({
    ...s,
    players: s.players.map((p) => (ids.includes(p.id) ? { ...p, alive: false } : p)),
  });

  it("hands over to a dead player, who then sees everything", () => {
    const s = replaceNarrator(withDead(narrated(), ["p2"]), "p2");
    expect(s.narrator).toEqual({ id: "p2", name: "Player 2" });
    expect(s.events.map((e) => e.type)).toEqual(["narrator-left", "narrator-new"]);
    const view = viewFor(s, "p2");
    expect(view.me.role).toBeNull();
    expect(view.players.map((p) => p.id)).not.toContain("p2");
    expect(view.players.every((p) => p.role !== null)).toBe(true);
    expect(viewFor(s, "p0").players.map((p) => p.id)).not.toContain("p2");
  });

  it("only a dead player can take over, and not a hunter who still has to shoot", () => {
    const s = withDead(narrated(), ["p1", "p2"]);
    expect(eligibleNarrators(s).map((p) => p.id)).toEqual(["p1", "p2"]);
    const pending = { ...s, pendingShot: { playerId: "p1", resume: "DAY_DISCUSSION" as const } };
    expect(eligibleNarrators(pending).map((p) => p.id)).toEqual(["p2"]);
    expect(replaceNarrator(narrated(), "p0").narrator).toBeNull();
  });

  it("runs on its own when nobody is dead, and the next death becomes narrator", () => {
    let s = replaceNarrator(narrated(), null);
    expect(s.narrator).toBeNull();
    expect(s.wantsNarrator).toBe(true);
    expect(promoteNarrator(s, "p0").narrator).toBeNull();
    s = withDead(s, ["p3"]);
    s = promoteNarrator(s, "p3");
    expect(s.narrator?.id).toBe("p3");
    expect(s.wantsNarrator).toBe(false);
  });

  it("keeps the voice routing sane when the narrator is a dead player", () => {
    const s = replaceNarrator(withDead(narrated(), ["p2"]), "p2");
    const routing = voiceRouting({ ...s, phase: "DAY_DISCUSSION" });
    expect(new Set(routing.p0).size).toBe(routing.p0?.length);
    expect(routing.p0).toContain("p2");
    expect(routing.p2).not.toContain("p2");
  });
});
