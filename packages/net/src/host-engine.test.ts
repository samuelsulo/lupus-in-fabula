import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostEngine, type RolePresets } from "./host-engine.ts";
import { PROTOCOL_VERSION, type ServerMessage } from "./protocol.ts";

const presets: RolePresets = {
  "4": ["werewolf", "seer", "doctor", "villager"],
  "5": ["werewolf", "seer", "doctor", "villager", "villager"],
};

function setup() {
  const sent: { to: string; message: ServerMessage }[] = [];
  const engine = new HostEngine({
    hostId: "host",
    presets,
    send: (to, message) => sent.push({ to, message }),
    random: () => 0.42,
  });
  engine.addHost("Host");
  const join = (id: string, name = id) =>
    engine.handleMessage(id, { v: PROTOCOL_VERSION, type: "hello", name });
  // The backup sent to the narrator is not a view: skip it when looking for the last message.
  const lastTo = (id: string) =>
    sent.filter((s) => s.to === id && s.message.type !== "snapshot").at(-1)?.message;
  return { engine, sent, join, lastTo };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("HostEngine lobby", () => {
  it("collects players and broadcasts the lobby with unique names", () => {
    const { join, lastTo } = setup();
    join("a", "Anna");
    join("b", "Anna");
    const lobby = lastTo("a");
    expect(lobby?.type).toBe("lobby");
    if (lobby?.type === "lobby") {
      expect(lobby.players.map((p) => p.name)).toEqual(["Host", "Anna", "Anna 2"]);
      expect(lobby.hostId).toBe("host");
    }
  });

  it("ignores malformed messages", () => {
    const { engine, sent } = setup();
    const before = sent.length;
    engine.handleMessage("x", { type: "hello" });
    engine.handleMessage("x", "garbage");
    expect(sent.length).toBe(before);
  });

  it("refuses to start with too few players", () => {
    const { engine, join } = setup();
    join("a");
    expect(engine.start()).toBe("too-few");
  });

  it("rejects late joiners once the game started", () => {
    const { engine, join, lastTo } = setup();
    ["a", "b", "c"].forEach((id) => join(id));
    expect(engine.start()).toBeNull();
    join("late");
    expect(lastTo("late")).toEqual({ v: PROTOCOL_VERSION, type: "rejected", reason: "game-in-progress" });
  });
});

describe("HostEngine game", () => {
  function started() {
    const ctx = setup();
    ["a", "b", "c"].forEach((id) => ctx.join(id));
    ctx.engine.start();
    return ctx;
  }

  it("sends every player a view with only their own role", () => {
    const { lastTo } = started();
    for (const id of ["host", "a", "b", "c"]) {
      const message = lastTo(id);
      expect(message?.type).toBe("view");
      if (message?.type === "view") {
        const known = message.view.players.filter((p) => p.role !== null);
        expect(known.map((p) => p.id)).toEqual([id]);
      }
    }
  });

  it("advances phases on the narrator timer", () => {
    const { lastTo } = started();
    vi.advanceTimersByTime(10_000);
    const message = lastTo("a");
    expect(message?.type === "view" && message.view.phase).toBe("NIGHT");
  });

  it("sends voice permissions that mirror each other", () => {
    const { lastTo } = started();
    vi.advanceTimersByTime(10_000);
    const views = ["host", "a", "b", "c"].map((id) => ({ id, message: lastTo(id) }));
    for (const { id, message } of views) {
      if (message?.type !== "view") throw new Error("expected a view");
      for (const listener of message.voice.speakTo) {
        const other = views.find((v) => v.id === listener)?.message;
        expect(other?.type === "view" && other.voice.hearFrom).toContain(id);
      }
    }
  });

  it("ignores invalid intents", () => {
    const { engine, sent } = started();
    const before = sent.length;
    engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "intent", intent: { type: "vote", target: "b" } });
    expect(sent.length).toBe(before);
  });
});

describe("HostEngine human narrator", () => {
  function narrated() {
    const ctx = setup();
    ["a", "b", "c", "d"].forEach((id) => ctx.join(id));
    ctx.engine.setNarrator("a");
    return ctx;
  }

  it("announces the narrator in the lobby and counts only the other players", () => {
    const { engine, lastTo, join } = setup();
    ["a", "b", "c"].forEach((id) => join(id));
    engine.setNarrator("a");
    const lobby = lastTo("b");
    expect(lobby?.type === "lobby" && lobby.narratorId).toBe("a");
    expect(engine.start()).toBe("too-few");
  });

  it("ignores a narrator who is not in the room", () => {
    const { engine } = setup();
    engine.setNarrator("ghost");
    expect(engine.narrator).toBeNull();
  });

  it("gives the narrator a view with every role, and the others only their own", () => {
    const ctx = narrated();
    expect(ctx.engine.start()).toBeNull();
    const narrator = ctx.lastTo("a");
    expect(narrator?.type === "view" && narrator.view.players.every((p) => p.role !== null)).toBe(true);
    const player = ctx.lastTo("b");
    expect(player?.type === "view" && player.view.players.filter((p) => p.role !== null)).toHaveLength(1);
  });

  it("has no timers: only the narrator moves the game on", () => {
    const ctx = narrated();
    ctx.engine.start();
    vi.advanceTimersByTime(60_000);
    const phase = () => {
      const m = ctx.lastTo("b");
      return m?.type === "view" ? m.view.phase : null;
    };
    expect(phase()).toBe("ROLE_REVEAL");
    ctx.engine.handleMessage("b", { v: PROTOCOL_VERSION, type: "advance" });
    expect(phase()).toBe("ROLE_REVEAL");
    ctx.engine.handleMessage("host", { v: PROTOCOL_VERSION, type: "advance" });
    expect(phase()).toBe("ROLE_REVEAL");
    ctx.engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    expect(phase()).toBe("NIGHT");
  });

  it("lets the host skip a timer in automatic mode", () => {
    const { engine, join, lastTo } = setup();
    ["a", "b", "c"].forEach((id) => join(id));
    engine.start();
    engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    engine.handleMessage("host", { v: PROTOCOL_VERSION, type: "advance" });
    const message = lastTo("a");
    expect(message?.type === "view" && message.view.phase).toBe("NIGHT");
  });
});

describe("HostEngine seating and chat", () => {
  function started(narrator = false) {
    const ctx = setup();
    ["a", "b", "c", "d"].forEach((id) => ctx.join(id));
    if (narrator) ctx.engine.setNarrator("a");
    ctx.engine.start();
    return ctx;
  }
  const seatingOf = (ctx: ReturnType<typeof started>, id: string) => {
    const m = ctx.sent.filter((s) => s.to === id && s.message.type === "seating").at(-1)?.message;
    return m?.type === "seating" ? m.seating : null;
  };
  const move = (ctx: ReturnType<typeof started>, id: string, to: object) =>
    ctx.engine.handleMessage(id, { v: PROTOCOL_VERSION, type: "move", to });
  const chatTo = (ctx: ReturnType<typeof started>, id: string) =>
    ctx.sent.filter((s) => s.to === id && s.message.type === "chat").map((s) => s.message);

  it("seats everybody when the game starts and tells all of them", () => {
    const ctx = started();
    expect(Object.keys(seatingOf(ctx, "b") ?? {}).sort()).toEqual(["a", "b", "c", "d", "host"]);
  });

  it("lets a player stand up and walk, and sit somewhere free", () => {
    const ctx = started();
    move(ctx, "b", { kind: "stand", x: 1, z: 2 });
    expect(seatingOf(ctx, "c")?.b).toEqual({ kind: "stand", x: 1, z: 2 });
    move(ctx, "b", { kind: "seat", seat: 0 });
    expect(seatingOf(ctx, "c")?.b).toEqual({ kind: "seat", seat: 0 });
  });

  it("ignores moves onto a taken seat and moves at night", () => {
    const ctx = started();
    const taken = seatingOf(ctx, "c")?.a;
    move(ctx, "b", taken ?? {});
    expect(seatingOf(ctx, "c")?.b).not.toEqual(taken);
    vi.advanceTimersByTime(10_000);
    move(ctx, "b", { kind: "stand", x: 0, z: 0 });
    expect(seatingOf(ctx, "c")?.b?.kind).toBe("seat");
  });

  it("sits everybody down when the night falls", () => {
    const ctx = started();
    move(ctx, "b", { kind: "stand", x: 1, z: 2 });
    vi.advanceTimersByTime(10_000);
    expect(Object.values(seatingOf(ctx, "c") ?? {}).every((p) => p.kind === "seat")).toBe(true);
  });

  it("delivers chat only to the people who could hear it", () => {
    const ctx = started(true);
    vi.advanceTimersByTime(0);
    ctx.engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    // First night, narrated: only the wolf step is awake. Everyone else hears nothing.
    const view = ctx.lastTo("a");
    const wolf = view?.type === "view" ? view.view.players.find((p) => p.role === "werewolf")?.id : undefined;
    const villager =
      view?.type === "view" ? view.view.players.find((p) => p.role === "villager")?.id : undefined;
    expect(wolf).toBeDefined();
    ctx.engine.handleMessage(wolf as string, { v: PROTOCOL_VERSION, type: "chat", text: "  pssst  " });
    expect(chatTo(ctx, wolf as string)).toHaveLength(1);
    expect(chatTo(ctx, "a")).toEqual([{ v: PROTOCOL_VERSION, type: "chat", from: wolf, text: "pssst" }]);
    if (villager) expect(chatTo(ctx, villager)).toHaveLength(0);
  });

  it("rate limits chat", () => {
    const ctx = started();
    for (let i = 0; i < 3; i++) {
      ctx.engine.handleMessage("b", { v: PROTOCOL_VERSION, type: "chat", text: `hi ${i}` });
    }
    expect(chatTo(ctx, "b")).toHaveLength(1);
  });

  it("lets the narrator walk, even at night, but not sit; players still cannot walk at night", () => {
    const ctx = started(true);
    const narratorPlace = () => seatingOf(ctx, "b")?.a;
    expect(narratorPlace()?.kind).toBe("stand");
    move(ctx, "a", { kind: "stand", x: 2, z: 2 });
    expect(narratorPlace()).toEqual({ kind: "stand", x: 2, z: 2 });
    move(ctx, "a", { kind: "seat", seat: 0 });
    expect(narratorPlace()?.kind).toBe("stand");
    ctx.engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    move(ctx, "a", { kind: "stand", x: -1, z: 1 });
    expect(narratorPlace()).toEqual({ kind: "stand", x: -1, z: 1 });
    move(ctx, "b", { kind: "stand", x: 0, z: 0 });
    expect(seatingOf(ctx, "c")?.b?.kind).toBe("seat");
  });
});

describe("HostEngine role setup", () => {
  function lobby() {
    const ctx = setup();
    ["a", "b", "c", "d"].forEach((id) => ctx.join(id));
    ctx.engine.setNarrator("a");
    const op = (from: string, op: object) =>
      ctx.engine.handleMessage(from, { v: PROTOCOL_VERSION, type: "setup", op });
    const rolesFor = (id: string) => {
      const m = ctx.sent.filter((s) => s.to === id && s.message.type === "roles").at(-1)?.message;
      return m?.type === "roles" ? m : null;
    };
    const roleOf = (id: string) => {
      const m = ctx.lastTo("a");
      return m?.type === "view" ? m.view.players.find((p) => p.id === id)?.role : undefined;
    };
    return { ...ctx, op, rolesFor, roleOf };
  }

  it("deals a valid starting assignment when the narrator goes custom, and tells only them", () => {
    const { op, rolesFor, sent } = lobby();
    op("a", { op: "mode", mode: "custom" });
    const roles = rolesFor("a");
    expect(roles?.errors).toEqual([]);
    expect(Object.keys(roles?.assignment ?? {}).sort()).toEqual(["b", "c", "d", "host"]);
    expect(sent.some((s) => s.to !== "a" && s.message.type === "roles")).toBe(false);
  });

  it("ignores setup from anybody but the narrator", () => {
    const { op, rolesFor } = lobby();
    op("b", { op: "mode", mode: "custom" });
    expect(rolesFor("a")).toBeNull();
  });

  it("reports problems and blocks the start until they are fixed", () => {
    const { engine, op, rolesFor, lastTo } = lobby();
    op("a", { op: "mode", mode: "custom" });
    op("a", { op: "assign", playerId: "b", role: "seer" });
    op("a", { op: "assign", playerId: "c", role: "seer" });
    expect(rolesFor("a")?.errors).toContainEqual({ code: "duplicate", role: "seer" });
    const state = lastTo("b");
    expect(state?.type === "lobby" && state.rolesReady).toBe(false);
    expect(engine.start()).toBe("invalid-roles");
  });

  it("starts with exactly the roles the narrator picked", () => {
    const { engine, op, roleOf } = lobby();
    op("a", { op: "mode", mode: "custom" });
    const picks = { b: "werewolf", c: "seer", d: "villager", host: "villager" } as const;
    for (const [playerId, role] of Object.entries(picks)) op("a", { op: "assign", playerId, role });
    expect(engine.start()).toBeNull();
    for (const [id, role] of Object.entries(picks)) expect(roleOf(id)).toBe(role);
  });

  it("flags unassigned players and too many werewolves", () => {
    const { op, rolesFor } = lobby();
    op("a", { op: "mode", mode: "custom" });
    op("a", { op: "assign", playerId: "b", role: null });
    expect(rolesFor("a")?.errors).toContainEqual({ code: "unassigned", count: 1 });
    for (const id of ["b", "c", "d"]) op("a", { op: "assign", playerId: id, role: "werewolf" });
    expect(rolesFor("a")?.errors).toContainEqual({ code: "too-many-werewolves", max: 1 });
  });

  it("forgets a custom setup when the narrator steps down", () => {
    const { engine, op, lastTo } = lobby();
    op("a", { op: "mode", mode: "custom" });
    engine.setNarrator(null);
    const message = lastTo("b");
    expect(message?.type === "lobby" && message.rolesMode).toBe("random");
  });

  it("keeps the setup in step when players leave", () => {
    const { engine, op, rolesFor } = lobby();
    op("a", { op: "mode", mode: "custom" });
    engine.removePlayer("d");
    expect(Object.keys(rolesFor("a")?.assignment ?? {})).not.toContain("d");
  });
});

describe("HostEngine traffic", () => {
  it("does not send views when only the seating changes", () => {
    const ctx = setup();
    ["a", "b", "c"].forEach((id) => ctx.join(id));
    ctx.engine.start();
    const views = () => ctx.sent.filter((s) => s.to === "b" && s.message.type === "view").length;
    const before = views();
    // An invalid intent changes nothing; a repeated skip in the same phase would still move on,
    // so use the seating, which republishes nothing for views.
    ctx.engine.handleMessage("b", { v: PROTOCOL_VERSION, type: "move", to: { kind: "stand", x: 0, z: 0 } });
    expect(views()).toBe(before);
  });

  it("sends the seating only when it changes", () => {
    const ctx = setup();
    ["a", "b", "c"].forEach((id) => ctx.join(id));
    ctx.engine.start();
    const seatings = () => ctx.sent.filter((s) => s.to === "b" && s.message.type === "seating").length;
    const before = seatings();
    ctx.engine.handleMessage("b", { v: PROTOCOL_VERSION, type: "move", to: { kind: "stand", x: 1, z: 1 } });
    expect(seatings()).toBe(before + 1);
    ctx.engine.handleMessage("b", { v: PROTOCOL_VERSION, type: "move", to: { kind: "stand", x: 1, z: 1 } });
    expect(seatings()).toBe(before + 1);
  });
});

describe("HostEngine narrator handover", () => {
  function narratedGame() {
    const ctx = setup();
    ["a", "b", "c", "d"].forEach((id) => ctx.join(id));
    ctx.engine.setNarrator("a");
    ctx.engine.start();
    const view = (id: string) => {
      const m = ctx.lastTo(id);
      return m?.type === "view" ? m.view : null;
    };
    return { ...ctx, view };
  }

  it("runs on its own when the narrator leaves and nobody is dead", () => {
    const { engine, view } = narratedGame();
    vi.advanceTimersByTime(60_000);
    expect(view("b")?.phase).toBe("ROLE_REVEAL");
    engine.removePlayer("a");
    expect(view("b")?.narrator).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(view("b")?.phase).toBe("NIGHT");
  });

  it("makes the first player who dies the new narrator, with full visibility", () => {
    const { engine, view } = narratedGame();
    engine.removePlayer("a");
    vi.advanceTimersByTime(10_000);
    const ids = ["host", "b", "c", "d"];
    const wolf = ids.find((id) => view(id)?.me.role === "werewolf") as string;
    const victim = ids.find((id) => id !== wolf) as string;
    engine.handleMessage(wolf, {
      v: PROTOCOL_VERSION,
      type: "intent",
      intent: { type: "night-action", target: victim },
    });
    vi.advanceTimersByTime(70_000);
    const promoted = view(victim);
    expect(promoted?.me.role).toBeNull();
    expect(promoted?.narrator?.id).toBe(victim);
    expect(promoted?.players.every((p) => p.role !== null)).toBe(true);
    const other = ids.find((id) => id !== wolf && id !== victim) as string;
    expect(view(other)?.narrator?.id).toBe(victim);
    expect(view(other)?.players.map((p) => p.id)).not.toContain(victim);
  });

  it("hands over to a dead player when the narrator leaves and somebody is dead", () => {
    const ctx = narratedGame();
    const advance = () => ctx.engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    advance(); // the night begins
    const ids = ["host", "b", "c", "d"];
    const wolf = ids.find((id) => ctx.view(id)?.me.role === "werewolf") as string;
    const victim = ids.find((id) => id !== wolf) as string;
    ctx.engine.handleMessage(wolf, {
      v: PROTOCOL_VERSION,
      type: "intent",
      intent: { type: "night-action", target: victim },
    });
    advance();
    advance();
    advance(); // wolves, doctor and seer are done: dawn
    expect(ctx.view(victim)?.me.alive).toBe(false);
    ctx.engine.removePlayer("a");
    expect(ctx.view(victim)?.narrator?.id).toBe(victim);
    expect(ctx.view(victim)?.me.role).toBeNull();
    expect(ctx.view(wolf)?.narrator?.id).toBe(victim);
  });
});

describe("HostEngine recovery", () => {
  const hello = (id: string, token: string) => ({ v: PROTOCOL_VERSION, type: "hello", name: id, token });

  function hosted(narrator = false) {
    const sent: { to: string; message: ServerMessage }[] = [];
    const snapshots: unknown[] = [];
    const engine = new HostEngine({
      hostId: "host",
      presets,
      send: (to, message) => sent.push({ to, message }),
      random: () => 0.42,
      onSnapshot: (s) => snapshots.push(s),
    });
    engine.addHost("Host", "token-host-1");
    const ids = narrator ? ["a", "b", "c", "d"] : ["a", "b", "c"];
    for (const id of ids) engine.handleMessage(id, hello(id, `token-${id}-xx`));
    if (narrator) engine.setNarrator("a");
    engine.start();
    return { engine, sent, snapshots };
  }

  const viewOf = (sent: { to: string; message: ServerMessage }[], id: string) => {
    const m = sent.filter((s) => s.to === id && s.message.type === "view").at(-1)?.message;
    return m?.type === "view" ? m : null;
  };

  it("has nothing to carry on before the game starts, and saves it once it does", () => {
    const sent: { to: string; message: ServerMessage }[] = [];
    const engine = new HostEngine({
      hostId: "host",
      presets,
      send: (to, message) => sent.push({ to, message }),
    });
    expect(engine.snapshot()).toBeNull();
    const { snapshots } = hosted();
    expect(snapshots.at(-1)).not.toBeNull();
  });

  it("resumes paused after the host came back with a new connection id", () => {
    const first = hosted();
    const saved = JSON.parse(JSON.stringify(first.engine.snapshot()));
    const sent: { to: string; message: ServerMessage }[] = [];
    const engine = new HostEngine({
      hostId: "host2",
      presets,
      send: (to, message) => sent.push({ to, message }),
    });
    engine.restore(saved, "resume");
    expect(engine.isPaused).toBe(true);
    const mine = viewOf(sent, "host2");
    expect(mine?.view.me.id).toBe("host2");
    expect(mine?.pause?.waitingFor.sort()).toEqual(["a", "b", "c"]);
    // Nothing moves while paused, neither by timer nor by order.
    vi.advanceTimersByTime(60_000);
    engine.handleMessage("host2", { v: PROTOCOL_VERSION, type: "advance" });
    expect(viewOf(sent, "host2")?.view.phase).toBe("ROLE_REVEAL");
    // Players come back, each with their secret; the last one unpauses the game.
    for (const id of ["a", "b", "c"]) engine.handleMessage(id, hello(id, `token-${id}-xx`));
    expect(engine.isPaused).toBe(false);
    expect(viewOf(sent, "a")?.pause).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(viewOf(sent, "a")?.view.phase).toBe("NIGHT");
  });

  it("lets the host carry on without the missing players", () => {
    const first = hosted();
    const engine = new HostEngine({ hostId: "host2", presets, send: () => {} });
    engine.restore(JSON.parse(JSON.stringify(first.engine.snapshot())), "resume");
    engine.continueGame();
    expect(engine.isPaused).toBe(false);
  });

  it("gives a returning player their seat back on a new connection id", () => {
    const { engine, sent } = hosted();
    const roleBefore = viewOf(sent, "b")?.view.me.role;
    engine.handleMessage("b2", hello("b2", "token-b-xx"));
    const view = viewOf(sent, "b2");
    expect(view?.view.me.id).toBe("b2");
    expect(view?.view.me.role).toBe(roleBefore);
    expect(view?.view.players.map((p) => p.id)).not.toContain("b");
  });

  it("does not let a stranger, or a wrong secret, take a seat in a running game", () => {
    const { engine, sent } = hosted();
    engine.handleMessage("x", hello("x", "token-nobody-yy"));
    engine.handleMessage("y", { v: PROTOCOL_VERSION, type: "hello", name: "y" });
    expect(sent.filter((s) => s.to === "x" || s.to === "y").map((s) => s.message.type)).toEqual([
      "rejected",
      "rejected",
    ]);
  });

  it("sends the narrator, and only the narrator, a backup that lets them take over", () => {
    const { sent, snapshots } = hosted(true);
    const toNarrator = sent.filter((s) => s.to === "a" && s.message.type === "snapshot");
    expect(toNarrator.length).toBeGreaterThan(0);
    expect(sent.some((s) => s.to !== "a" && s.message.type === "snapshot")).toBe(false);
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("lets the narrator take over as host with the game exactly where it was", () => {
    const first = hosted(true);
    const backup = [...first.sent]
      .reverse()
      .find((s) => s.to === "a" && s.message.type === "snapshot")?.message;
    expect(backup?.type).toBe("snapshot");
    if (backup?.type !== "snapshot") return;
    const sent: { to: string; message: ServerMessage }[] = [];
    const engine = new HostEngine({
      hostId: "a",
      presets,
      send: (to, message) => sent.push({ to, message }),
    });
    engine.restore(backup.snapshot, "takeover");
    expect(engine.isPaused).toBe(false);
    expect(viewOf(sent, "a")?.view.me.role).toBeNull();
    expect(viewOf(sent, "b")?.view.players.length).toBeGreaterThan(0);
    engine.handleMessage("a", { v: PROTOCOL_VERSION, type: "advance" });
    expect(viewOf(sent, "b")?.view.phase).toBe("NIGHT");
  });
});
