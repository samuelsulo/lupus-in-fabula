import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  advance,
  applyIntent,
  createGame,
  initialSeating,
  NARRATOR_SPOT,
  eligibleNarrators,
  moveTo,
  promoteNarrator,
  remapIds,
  replaceNarrator,
  seatStanding,
  shuffle,
  validateRoles,
  viewFor,
  voiceRouting,
  type GameState,
  type RoleSetupError,
  type Seating,
  type RoleId,
} from "@lupus/core";
import {
  MAX_CHAT_LENGTH,
  MAX_NAME_LENGTH,
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type HostSnapshot,
  type LobbyPlayer,
  type PauseInfo,
  type RolesMode,
  type ServerMessage,
} from "./protocol.ts";
import { PHASE_SECONDS } from "./timing.ts";

/** The narrator takes a seat in the room but not in the game. */
export const MAX_ROOM_SIZE = MAX_PLAYERS + 1;

/** Why a game could not start. The client words it in the player's language. */
export type StartError = "already-started" | "too-few" | "too-many" | "no-preset" | "invalid-roles";

/** Role lists per player count, e.g. { "6": ["werewolf", ...] }. Loaded from content/. */
export type RolePresets = Record<string, RoleId[]>;

export interface HostEngineOptions {
  hostId: string;
  presets: RolePresets;
  /** Delivers a message to one player. The host's own id is delivered locally. */
  send: (to: string, message: ServerMessage) => void;
  random?: () => number;
  now?: () => number;
  /**
   * Called when the game state changed, with what is needed to carry on the game (null once it
   * is over). The host keeps it in its browser so a reload does not lose the game.
   */
  onSnapshot?: (snapshot: HostSnapshot | null) => void;
}

/**
 * The authoritative side of a room. It knows nothing about WebRTC: it receives
 * messages from peers, runs the game, and sends each player only their own view.
 */
export class HostEngine {
  private readonly players: LobbyPlayer[] = [];
  private narratorId: string | null = null;
  private rolesMode: RolesMode = "random";
  private assignment: Record<string, RoleId> = {};
  private game: GameState | null = null;
  /** What each player (and the seating) was last sent, so unchanged state is not sent again. */
  private lastSeating = "";
  private readonly lastView = new Map<string, string>();
  private seating: Seating = {};
  private readonly lastChatAt = new Map<string, number>();
  /** The secret each player presented: it proves who is coming back after a disconnection. */
  private readonly tokens = new Map<string, string>();
  /** A resumed game is paused until its players are back (or the host carries on without them). */
  private paused = false;
  /** Players seen since a resume. */
  private online = new Set<string>();
  private lastSnapshot = "";
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

  get narrator(): string | null {
    return this.narratorId;
  }

  get lobbyPlayers(): readonly LobbyPlayer[] {
    return this.players;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The host registers itself like any other player. */
  addHost(name: string, token?: string): void {
    this.addPlayer(this.options.hostId, name, token);
  }

  handleMessage(from: string, raw: unknown): void {
    const message = parseClientMessage(raw);
    if (!message) return;

    if (message.type === "hello") {
      if (this.game) return this.reconnect(from, message.token);
      if (this.players.length >= MAX_ROOM_SIZE) return this.reject(from, "room-full");
      this.addPlayer(from, message.name, message.token);
      return;
    }

    if (!this.game) {
      if (message.type === "chat") this.chatInLobby(from, message.text);
      if (message.type === "setup" && from === this.narratorId) this.handleSetupOp(message.op);
      return;
    }
    // A resumed game waits for its players: only chat and walking go on meanwhile.
    if (this.paused && (message.type === "advance" || message.type === "intent")) return;
    if (message.type === "advance") {
      // With a human narrator only they drive the game; otherwise the host can skip a timer.
      if (from === (this.game.narrator?.id ?? this.options.hostId)) this.advanceGame();
      return;
    }
    if (message.type === "setup") return;
    if (message.type === "move") {
      this.move(from, message.to);
      return;
    }
    if (message.type === "chat") {
      this.chat(from, message.text);
      return;
    }
    const result = applyIntent(this.game, from, message.intent);
    if (result.ok) {
      this.game = result.state;
      this.publish();
    }
  }

  /** What is needed to carry this game on elsewhere. Null while still in the lobby. */
  snapshot(): HostSnapshot | null {
    if (!this.game) return null;
    return {
      game: this.game,
      seating: this.seating,
      players: this.players.map((p) => ({ id: p.id, name: p.name, token: this.tokens.get(p.id) ?? "" })),
      hostId: this.options.hostId,
    };
  }

  /**
   * Carries on a game from a snapshot. "resume": the host came back (e.g. after a page reload) and
   * waits, paused, for its players to reconnect. "takeover": the narrator replaces a host that
   * left, and the game goes on at once.
   */
  restore(snapshot: HostSnapshot, mode: "resume" | "takeover"): void {
    const data = mode === "resume" ? remapIds(snapshot, snapshot.hostId, this.options.hostId) : snapshot;
    this.game = data.game;
    this.seating = data.seating;
    this.players.splice(0, this.players.length, ...data.players.map(({ id, name }) => ({ id, name })));
    this.tokens.clear();
    for (const { id, token } of data.players) if (token) this.tokens.set(id, token);
    this.narratorId = data.game.narrator?.id ?? null;
    this.paused = mode === "resume";
    this.online = new Set([this.options.hostId]);
    this.lastView.clear();
    this.lastSeating = "";
    this.timerKey = "";
    this.publish();
  }

  /** The host decides not to wait any longer for the missing players. */
  continueGame(): void {
    if (!this.paused) return;
    this.paused = false;
    this.publish();
  }

  /** A known player says hello again, from a new connection or the same one. */
  private reconnect(from: string, token: string | undefined): void {
    const known = token ? [...this.tokens].find(([, t]) => t === token)?.[0] : undefined;
    if (!known) return this.reject(from, "game-in-progress");
    this.rebind(known, from);
  }

  /** Gives a returning player's seat in the game to their new connection. */
  private rebind(oldId: string, newId: string): void {
    if (!this.game) return;
    if (oldId !== newId) {
      const moved = remapIds(
        { game: this.game, seating: this.seating, narratorId: this.narratorId },
        oldId,
        newId,
      );
      this.game = moved.game;
      this.seating = moved.seating;
      this.narratorId = moved.narratorId;
      for (const player of this.players) if (player.id === oldId) player.id = newId;
      const token = this.tokens.get(oldId);
      this.tokens.delete(oldId);
      if (token) this.tokens.set(newId, token);
      this.lastView.delete(oldId);
      this.lastChatAt.delete(oldId);
      this.online.delete(oldId);
      this.lastSeating = "";
    }
    this.online.add(newId);
    // Once everybody is back there is nothing left to wait for.
    if (this.paused && this.waitingFor().length === 0) this.paused = false;
    this.lastView.delete(newId);
    this.publish();
  }

  /** Names of the people a paused game still waits for. */
  private waitingFor(): string[] {
    const game = this.game;
    if (!game) return [];
    return this.recipients(game)
      .filter((p) => !this.online.has(p.id))
      .map((p) => this.players.find((q) => q.id === p.id)?.name ?? "?");
  }

  removePlayer(id: string): void {
    if (this.game) {
      if (this.game.narrator?.id === id) this.handOverNarrator();
      return;
    }
    const index = this.players.findIndex((p) => p.id === id);
    if (index === -1) return;
    this.players.splice(index, 1);
    if (this.narratorId === id) this.narratorId = null;
    this.syncRoleSetup();
    this.broadcastLobby();
  }

  /** Picks the human narrator among the people in the lobby, or null for the automatic one. */
  setNarrator(id: string | null): void {
    if (this.game) return;
    if (id !== null && !this.players.some((p) => p.id === id)) return;
    this.narratorId = id;
    this.syncRoleSetup();
    this.broadcastLobby();
  }

  /** Starts the game. Returns why it cannot start, if it cannot. */
  start(): StartError | null {
    if (this.game) return "already-started";
    const narrator = this.players.find((p) => p.id === this.narratorId);
    const players = this.players.filter((p) => p !== narrator);
    if (players.length < MIN_PLAYERS) return "too-few";
    if (players.length > MAX_PLAYERS) return "too-many";
    const custom = this.rolesMode === "custom" && narrator !== undefined;
    const roles = custom
      ? players.map((p) => this.assignment[p.id])
      : this.options.presets[String(players.length)];
    if (!roles) return "no-preset";
    if (custom && validateRoles(roles.map((role) => role ?? null)).length > 0) return "invalid-roles";
    this.game = createGame({
      players,
      narrator,
      roles: roles as RoleId[],
      assignment: custom ? this.assignment : undefined,
      seed: Math.floor(this.random() * 2 ** 32),
    });
    this.seating = initialSeating(
      players.map((p) => p.id),
      narrator?.id ?? null,
    );
    this.publish();
    return null;
  }

  dispose(): void {
    this.clearTimer();
  }

  /**
   * Walking around and changing seats. Players move only while the village is awake (at night
   * everyone sits); the narrator may walk at any time, since the others cannot see them then.
   */
  private move(from: string, to: Parameters<typeof moveTo>[2]): void {
    const game = this.game;
    if (!game || game.phase === "GAME_OVER") return;
    const isNarrator = game.narrator?.id === from;
    if (game.phase === "NIGHT" && !isNarrator) return;
    const next = moveTo(this.seating, from, to, isNarrator);
    if (!next) return;
    this.seating = next;
    this.broadcastSeating();
  }

  /** Text chat follows the voice rules: you can only write to the people who could hear you. */
  private chat(from: string, rawText: string): void {
    const game = this.game;
    if (!game || !this.allowChat(from)) return;
    const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    const audience = voiceRouting(game)[from];
    if (!audience) return;
    for (const to of [from, ...audience]) {
      this.options.send(to, { v: PROTOCOL_VERSION, type: "chat", from, text });
    }
  }

  private chatInLobby(from: string, rawText: string): void {
    if (!this.allowChat(from) || !this.players.some((p) => p.id === from)) return;
    const text = rawText.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_LENGTH);
    if (!text) return;
    for (const player of this.players) {
      this.options.send(player.id, { v: PROTOCOL_VERSION, type: "chat", from, text });
    }
  }

  /** At most one message every half second per sender. */
  private allowChat(from: string): boolean {
    const now = this.now();
    if (now - (this.lastChatAt.get(from) ?? -Infinity) < 500) return false;
    this.lastChatAt.set(from, now);
    return true;
  }

  /** Everybody in the game, narrator included (who may be one of the players, once dead). */
  private recipients(game: GameState): { id: string }[] {
    const all = game.narrator ? [...game.players, game.narrator] : game.players;
    return [...new Map(all.map((p) => [p.id, p])).values()];
  }

  /** Sends the seating, but only when it differs from what everybody already has. */
  private broadcastSeating(): void {
    const game = this.game;
    if (!game) return;
    const key = JSON.stringify(this.seating);
    if (key === this.lastSeating) return;
    this.lastSeating = key;
    const recipients = this.recipients(game);
    for (const player of recipients) {
      this.options.send(player.id, { v: PROTOCOL_VERSION, type: "seating", seating: this.seating });
    }
  }

  /**
   * The human narrator left. A random dead player takes over; with nobody dead the game runs on
   * its own and the next death becomes narrator (see `promoteWaitingNarrator`).
   */
  private handOverNarrator(): void {
    const game = this.game;
    if (!game?.narrator) return;
    const leaver = game.narrator.id;
    const candidates = eligibleNarrators(game).filter((p) => p.id !== leaver);
    const pick = candidates[Math.floor(this.random() * candidates.length)];
    this.game = replaceNarrator(game, pick?.id ?? null);
    this.dropFromSeating(leaver);
    this.publish();
  }

  /** After a death, a game that lost its narrator gives the job to the person who just died. */
  private promoteWaitingNarrator(): void {
    const game = this.game;
    if (!game?.wantsNarrator || game.narrator) return;
    const candidates = eligibleNarrators(game);
    const pick = candidates[Math.floor(this.random() * candidates.length)];
    if (pick) this.game = promoteNarrator(game, pick.id);
  }

  /** Forgets a player who left, and stands a new narrator by the fireplace instead of on a seat. */
  private dropFromSeating(leaverId: string): void {
    const rest = { ...this.seating };
    delete rest[leaverId];
    this.seating = rest;
  }

  /** The people who will play: everyone in the room except a human narrator. */
  private participants(): LobbyPlayer[] {
    return this.players.filter((p) => p.id !== this.narratorId);
  }

  private roleErrors(): RoleSetupError[] {
    return validateRoles(this.participants().map((p) => this.assignment[p.id] ?? null));
  }

  /** Only the narrator sets roles up, so a custom setup needs one. */
  private handleSetupOp(op: Extract<ClientMessage, { type: "setup" }>["op"]): void {
    if (op.op === "mode") {
      this.rolesMode = op.mode;
      if (op.mode === "custom" && Object.keys(this.assignment).length === 0) this.generateAssignment();
    } else if (op.op === "generate") {
      this.rolesMode = "custom";
      this.generateAssignment();
    } else if (this.participants().some((p) => p.id === op.playerId)) {
      this.rolesMode = "custom";
      if (op.role) this.assignment[op.playerId] = op.role;
      else delete this.assignment[op.playerId];
    }
    this.sendRoles();
    this.broadcastLobby();
  }

  /** Deals a fresh, valid set of roles for the current number of players. */
  private generateAssignment(): void {
    const players = this.participants();
    const count = players.length;
    const preset = this.options.presets[String(Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, count)))] ?? [];
    const roles = shuffle(preset.slice(0, count), Math.floor(this.random() * 2 ** 32)).items;
    this.assignment = {};
    players.forEach((player, i) => {
      const role = roles[i];
      if (role) this.assignment[player.id] = role;
    });
  }

  /** Keeps the custom setup in step with who is in the room, and drops it without a narrator. */
  private syncRoleSetup(): void {
    const ids = new Set(this.participants().map((p) => p.id));
    for (const id of Object.keys(this.assignment)) if (!ids.has(id)) delete this.assignment[id];
    if (this.narratorId === null) {
      this.rolesMode = "random";
      this.assignment = {};
    }
    this.sendRoles();
  }

  /** The assignment is secret: it goes to the narrator alone. */
  private sendRoles(): void {
    if (this.narratorId === null || this.rolesMode !== "custom") return;
    this.options.send(this.narratorId, {
      v: PROTOCOL_VERSION,
      type: "roles",
      assignment: this.assignment,
      errors: this.roleErrors(),
    });
  }

  private advanceGame(): void {
    if (!this.game) return;
    this.game = advance(this.game);
    this.publish();
  }

  private addPlayer(id: string, rawName: string, token?: string): void {
    if (this.players.some((p) => p.id === id)) return;
    this.players.push({ id, name: this.uniqueName(rawName) });
    if (token) this.tokens.set(id, token);
    this.syncRoleSetup();
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
        narratorId: this.narratorId,
        rolesMode: this.rolesMode,
        rolesReady: this.rolesMode === "random" || this.roleErrors().length === 0,
        players: this.players,
        voice: {
          speakTo: everyone.filter((id) => id !== player.id),
          hearFrom: everyone.filter((id) => id !== player.id),
        },
      });
    }
  }

  private publish(): void {
    this.promoteWaitingNarrator();
    const game = this.game;
    if (!game) return;
    this.schedule(game);
    const narratorId = game.narrator?.id;
    if (narratorId && this.seating[narratorId]?.kind !== "stand") {
      // A dead player who became narrator leaves their seat to walk the room.
      this.seating = { ...this.seating, [narratorId]: { kind: "stand", ...NARRATOR_SPOT } };
    }
    if (game.phase === "NIGHT") this.seating = seatStanding(this.seating, game.narrator?.id ?? null);
    this.broadcastSeating();
    const routing = voiceRouting(game);
    const phaseEndsInMs = this.phaseEndsAt === null ? null : Math.max(0, this.phaseEndsAt - this.now());
    const pause: PauseInfo | null = this.paused ? { waitingFor: this.waitingFor() } : null;
    const recipients = this.recipients(game);
    for (const player of recipients) {
      const view = viewFor(game, player.id);
      const voice = {
        speakTo: routing[player.id] ?? [],
        hearFrom: Object.keys(routing).filter((speaker) => routing[speaker]?.includes(player.id)),
      };
      // The deadline is fixed per phase, so an unchanged view needs no message: most intents
      // (a night action, a vote) are invisible to most players.
      const key = JSON.stringify([view, voice, this.phaseEndsAt, pause]);
      if (this.lastView.get(player.id) === key) continue;
      this.lastView.set(player.id, key);
      this.options.send(player.id, { v: PROTOCOL_VERSION, type: "view", view, voice, phaseEndsInMs, pause });
    }
    this.persist(game);
  }

  /** Hands the state out: to the host's browser storage, and to the narrator as a backup. */
  private persist(game: GameState): void {
    const snapshot = game.phase === "GAME_OVER" ? null : this.snapshot();
    const key = JSON.stringify(snapshot);
    if (key === this.lastSnapshot) return;
    this.lastSnapshot = key;
    this.options.onSnapshot?.(snapshot);
    const narratorId = game.narrator?.id;
    if (snapshot && narratorId && narratorId !== this.options.hostId) {
      this.options.send(narratorId, { v: PROTOCOL_VERSION, type: "snapshot", snapshot });
    }
  }

  /** Re-arms the narrator timer whenever the phase (or the night step) changes. */
  private schedule(game: GameState): void {
    if (this.paused) {
      this.timerKey = "";
      this.clearTimer();
      this.phaseEndsAt = null;
      return;
    }
    const key = `${game.phase}:${game.day}:${game.nightStep}:${game.narrator ? "narrated" : "auto"}`;
    if (key === this.timerKey) return;
    this.timerKey = key;
    this.clearTimer();
    const seconds = game.narrator ? null : PHASE_SECONDS[game.phase];
    if (seconds === null) {
      this.phaseEndsAt = null;
      return;
    }
    this.phaseEndsAt = this.now() + seconds * 1000;
    this.timer = setTimeout(() => this.advanceGame(), seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
