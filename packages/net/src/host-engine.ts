import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  advance,
  applyIntent,
  createGame,
  viewFor,
  voiceRouting,
  type GameState,
  type RoleId,
} from "@lupus/core";
import {
  MAX_NAME_LENGTH,
  PROTOCOL_VERSION,
  parseClientMessage,
  type LobbyPlayer,
  type ServerMessage,
} from "./protocol.ts";
import { PHASE_SECONDS } from "./timing.ts";

/** Role lists per player count, e.g. { "6": ["werewolf", ...] }. Loaded from content/. */
export type RolePresets = Record<string, RoleId[]>;

export interface HostEngineOptions {
  hostId: string;
  presets: RolePresets;
  /** Delivers a message to one player. The host's own id is delivered locally. */
  send: (to: string, message: ServerMessage) => void;
  random?: () => number;
  now?: () => number;
}

/**
 * The authoritative side of a room. It knows nothing about WebRTC: it receives
 * messages from peers, runs the game, and sends each player only their own view.
 */
export class HostEngine {
  private readonly players: LobbyPlayer[] = [];
  private game: GameState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerKey = "";
  private phaseEndsAt: number | null = null;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: HostEngineOptions) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
  }

  get isPlaying(): boolean {
    return this.game !== null;
  }

  get lobbyPlayers(): readonly LobbyPlayer[] {
    return this.players;
  }

  /** The host registers itself like any other player. */
  addHost(name: string): void {
    this.addPlayer(this.options.hostId, name);
  }

  handleMessage(from: string, raw: unknown): void {
    const message = parseClientMessage(raw);
    if (!message) return;

    if (message.type === "hello") {
      if (this.game) return this.reject(from, "game-in-progress");
      if (this.players.length >= MAX_PLAYERS) return this.reject(from, "room-full");
      this.addPlayer(from, message.name);
      return;
    }

    if (!this.game) return;
    const result = applyIntent(this.game, from, message.intent);
    if (result.ok) {
      this.game = result.state;
      this.publish();
    }
  }

  removePlayer(id: string): void {
    if (this.game) return;
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) return;
    this.players.splice(index, 1);
    this.broadcastLobby();
  }

  /** Starts the game. Returns an error message if it cannot start. */
  start(): string | null {
    if (this.game) return "The game already started";
    if (this.players.length < MIN_PLAYERS) return `At least ${MIN_PLAYERS} players are needed`;
    const roles = this.options.presets[String(this.players.length)];
    if (!roles) return "No role preset for this number of players";
    this.game = createGame({
      players: this.players,
      roles,
      seed: Math.floor(this.random() * 2 ** 32),
    });
    this.publish();
    return null;
  }

  /** Moves the game on immediately (the host skipping a timer). */
  skip(): void {
    if (!this.game) return;
    this.game = advance(this.game);
    this.publish();
  }

  dispose(): void {
    this.clearTimer();
  }

  private addPlayer(id: string, rawName: string): void {
    if (this.players.some((p) => p.id === id)) return;
    this.players.push({ id, name: this.uniqueName(rawName) });
    this.broadcastLobby();
  }

  private uniqueName(rawName: string): string {
    const base = rawName.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH) || "Player";
    let name = base;
    for (let n = 2; this.players.some((p) => p.name === name); n++) name = `${base} ${n}`;
    return name;
  }

  private reject(to: string, reason: "game-in-progress" | "room-full"): void {
    this.options.send(to, { v: PROTOCOL_VERSION, type: "rejected", reason });
  }

  private broadcastLobby(): void {
    const everyone = this.players.map((p) => p.id);
    for (const player of this.players) {
      this.options.send(player.id, {
        v: PROTOCOL_VERSION,
        type: "lobby",
        hostId: this.options.hostId,
        players: this.players,
        voice: {
          speakTo: everyone.filter((id) => id !== player.id),
          hearFrom: everyone.filter((id) => id !== player.id),
        },
      });
    }
  }

  private publish(): void {
    const game = this.game;
    if (!game) return;
    this.schedule(game);
    const routing = voiceRouting(game);
    const phaseEndsInMs = this.phaseEndsAt === null ? null : Math.max(0, this.phaseEndsAt - this.now());
    for (const player of game.players) {
      this.options.send(player.id, {
        v: PROTOCOL_VERSION,
        type: "view",
        view: viewFor(game, player.id),
        voice: {
          speakTo: routing[player.id] ?? [],
          hearFrom: Object.keys(routing).filter((speaker) => routing[speaker]?.includes(player.id)),
        },
        phaseEndsInMs,
      });
    }
  }

  /** Re-arms the narrator timer whenever the phase (or the night step) changes. */
  private schedule(game: GameState): void {
    const key = `${game.phase}:${game.day}:${game.nightStep}`;
    if (key === this.timerKey) return;
    this.timerKey = key;
    this.clearTimer();
    const seconds = PHASE_SECONDS[game.phase];
    if (seconds === null) {
      this.phaseEndsAt = null;
      return;
    }
    this.phaseEndsAt = this.now() + seconds * 1000;
    this.timer = setTimeout(() => this.skip(), seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
