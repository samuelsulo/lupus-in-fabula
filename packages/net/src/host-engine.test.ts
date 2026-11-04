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
  const lastTo = (id: string) => sent.filter((s) => s.to === id).at(-1)?.message;
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
    expect(engine.start()).toMatch(/At least/);
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
