import type { Intent, Place, PlayerView, RoleId, RoleSetupError, Seating } from "@lupus/core";
import { joinRoom, selfId } from "trystero";
import { HostEngine, type RolePresets, type StartError } from "./host-engine.ts";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type HostSnapshot,
  type LobbyPlayer,
  type PauseInfo,
  type RejectReason,
  type RolesMode,
  type ServerMessage,
} from "./protocol.ts";
import { VoiceController } from "./voice.ts";

export const APP_ID = "lupus-in-fabula";

/** How long a guest waits for the host to answer before giving up. */
const HOST_TIMEOUT_MS = 20_000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Where the host keeps a game in progress, so a reload does not lose it. */
const RESUME_KEY = "lupus-resume";
const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** How long a guest waits for a lost host (or for the narrator to take over) before giving up. */
const RECONNECT_GRACE_MS = 60_000;
/** How long the narrator waits for the host to come back before taking over. */
const TAKEOVER_DELAY_MS = 5_000;

/** A game this browser was hosting and could pick up again. */
export interface ResumeInfo {
  code: string;
  name: string;
  savedAt: number;
  day: number;
  snapshot: HostSnapshot;
}

function saveResume(code: string, name: string, snapshot: HostSnapshot): void {
  try {
    const info: ResumeInfo = { code, name, savedAt: Date.now(), day: snapshot.game.day, snapshot };
    localStorage.setItem(RESUME_KEY, JSON.stringify(info));
  } catch {
    // Storage can be full or blocked: the game simply cannot be resumed after a reload.
  }
}

export function clearResume(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The game this browser could resume, if there is a recent one. */
export function loadResume(): ResumeInfo | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const info = JSON.parse(raw) as ResumeInfo;
    if (!info.snapshot?.game || Date.now() - info.savedAt > RESUME_MAX_AGE_MS) return null;
    return info;
  } catch {
    return null;
  }
}

/** A secret this tab keeps, to prove who it is when it reconnects to a running game. */
function playerToken(): string {
  const fresh = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    const stored = sessionStorage.getItem("lupus-token");
    if (stored) return stored;
    const token = fresh();
    sessionStorage.setItem("lupus-token", token);
    return token;
  } catch {
    return fresh();
  }
}

export interface ChatMessage {
  /** Increases with every message, so lists can use it as a key. */
  id: number;
  from: string;
  text: string;
}

const MAX_CHAT_HISTORY = 60;

/** The narrator's secret view of the role setup. */
export interface RoleSetup {
  assignment: Record<string, RoleId>;
  errors: RoleSetupError[];
}

export type SessionStatus =
  | "connecting"
  | "lobby"
  | "playing"
  /** The host is gone; waiting to see if it comes back or the narrator takes over. */
  | "reconnecting"
  | "host-left"
  | "host-not-found"
  | "rejected";

export interface SessionSnapshot {
  status: SessionStatus;
  code: string;
  selfId: string;
  isHost: boolean;
  hostId: string | null;
  /** The player chosen as human narrator in the lobby, or null for the automatic narrator. */
  narratorId: string | null;
  rolesMode: RolesMode;
  /** False while a custom role setup is incomplete or invalid. */
  rolesReady: boolean;
  /** Only the human narrator receives this. */
  roleSetup: RoleSetup | null;
  players: LobbyPlayer[];
  view: PlayerView | null;
  /** Where everybody sits or stands. Null until the game starts. */
  seating: Seating | null;
  /** Recent chat messages, oldest first. Only what this player was allowed to read. */
  chat: ChatMessage[];
  /** Set while a resumed game waits for its players to come back. */
  pause: PauseInfo | null;
  /** Epoch ms (local clock) at which the narrator moves on, or null. */
  phaseEndsAt: number | null;
  rejected: RejectReason | null;
}

export interface SessionOptions {
  code: string;
  name: string;
  isHost: boolean;
  presets: RolePresets;
  /** A saved game to pick up again as its host (after a reload). */
  resume?: HostSnapshot;
}

/**
 * One player's connection to a room. The host also runs the game engine; every
 * other player only sends intents and renders the views the host sends back.
 */
export class Session {
  readonly voice: VoiceController;
  private readonly room: ReturnType<typeof joinRoom>;
  private engine: HostEngine | null;
  private readonly token = playerToken();
  /** The narrator's copy of the game, to take over as host if the host leaves. */
  private backup: HostSnapshot | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private takeoverTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly send: (message: unknown, target: string) => void;
  private readonly listeners = new Set<() => void>();
  private hostTimeout: ReturnType<typeof setTimeout> | null = null;
  private snapshot: SessionSnapshot;
  private nextChatId = 1;

  constructor(private readonly options: SessionOptions) {
    this.room = joinRoom({ appId: APP_ID }, options.code);
    this.voice = new VoiceController(this.room);
    const action = this.room.makeAction<never>("msg");
    this.send = (message, target) => {
      try {
        void action.send(message as never, { target });
      } catch {
        // The peer left in the meantime: nobody to tell.
      }
    };

    this.snapshot = {
      status: "connecting",
      code: options.code,
      selfId,
      isHost: options.isHost,
      hostId: options.isHost ? selfId : null,
      narratorId: null,
      rolesMode: "random",
      rolesReady: true,
      roleSetup: null,
      players: [],
      view: null,
      seating: null,
      chat: [],
      pause: null,
      phaseEndsAt: null,
      rejected: null,
    };

    this.engine = options.isHost ? this.createEngine() : null;

    action.onMessage = (data, { peerId }) => this.onMessage(data, peerId);
    this.room.onPeerJoin = (peerId) => {
      this.voice.onPeerJoin(peerId);
      if (!this.engine) this.sendHello(peerId);
    };
    this.room.onPeerLeave = (peerId) => {
      this.voice.onPeerLeave(peerId);
      this.engine?.removePlayer(peerId);
      if (!this.engine && peerId === this.snapshot.hostId) this.hostGone();
    };
    this.room.onPeerStream = (stream, peerId) => this.voice.onPeerStream(stream, peerId);

    if (this.engine) {
      if (options.resume) this.engine.restore(options.resume, "resume");
      else this.engine.addHost(options.name, this.token);
    } else {
      this.hostTimeout = setTimeout(() => {
        if (this.snapshot.status === "connecting") this.update({ status: "host-not-found" });
      }, HOST_TIMEOUT_MS);
    }
  }

  private createEngine(): HostEngine {
    return new HostEngine({
      hostId: selfId,
      presets: this.options.presets,
      send: (to, message) => (to === selfId ? this.receiveFromHost(message) : this.send(message, to)),
      // The game is kept in this browser as it goes, so a reload can pick it up again.
      onSnapshot: (snapshot) =>
        snapshot ? saveResume(this.options.code, this.options.name, snapshot) : clearResume(),
    });
  }

  private sendHello(to: string): void {
    this.send({ v: PROTOCOL_VERSION, type: "hello", name: this.options.name, token: this.token }, to);
  }

  /** The host's connection dropped. A game in progress gets a chance to recover. */
  private hostGone(): void {
    if (this.snapshot.status !== "playing" || !this.snapshot.view) {
      this.update({ status: "host-left" });
      return;
    }
    this.update({ status: "reconnecting" });
    // The narrator already sees everything, so they can carry the game on from their copy.
    if (this.backup && this.snapshot.view.narrator?.id === selfId) {
      this.takeoverTimer = setTimeout(() => this.takeOver(), TAKEOVER_DELAY_MS);
    }
    this.reconnectTimer = setTimeout(() => {
      if (this.snapshot.status === "reconnecting") this.update({ status: "host-left" });
    }, RECONNECT_GRACE_MS);
  }

  private clearRecoveryTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.takeoverTimer) clearTimeout(this.takeoverTimer);
    this.reconnectTimer = null;
    this.takeoverTimer = null;
  }

  /** The narrator becomes the host, with the game exactly where the old host left it. */
  private takeOver(): void {
    const backup = this.backup;
    if (this.engine || !backup || this.snapshot.status !== "reconnecting") return;
    this.clearRecoveryTimers();
    this.engine = this.createEngine();
    this.update({ isHost: true, hostId: selfId, status: "playing" });
    for (const peerId of Object.keys(this.room.getPeers())) {
      this.send({ v: PROTOCOL_VERSION, type: "host", hostId: selfId }, peerId);
    }
    this.engine.restore(backup, "takeover");
  }

  /** Someone else already runs the game this resumed host wanted to resume: join it as a player. */
  private abdicate(hostId: string): void {
    this.engine?.dispose();
    this.engine = null;
    clearResume();
    this.update({ isHost: false, hostId, status: "connecting", view: null, pause: null });
    this.sendHello(hostId);
  }

  /** Host only: carries on a resumed game without waiting for the missing players. */
  continueGame(): void {
    this.engine?.continueGame();
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Host only. Returns why the game cannot start, if it cannot. */
  start(): StartError | "not-host" | null {
    return this.engine ? this.engine.start() : "not-host";
  }

  /** Host only: picks the human narrator among the lobby, or null for the automatic one. */
  setNarrator(id: string | null): void {
    this.engine?.setNarrator(id);
  }

  /** Narrator only: hands roles out at random when the game starts, or sets them by hand. */
  setRolesMode(mode: RolesMode): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "setup", op: { op: "mode", mode } });
  }

  /** Narrator only: gives a player a role (null clears it). Switches to hand-picked roles. */
  assignRole(playerId: string, role: RoleId | null): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "setup", op: { op: "assign", playerId, role } });
  }

  /** Narrator only: deals a fresh random set of roles to start from. */
  generateRoles(): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "setup", op: { op: "generate" } });
  }

  /** Moves the game on: the narrator when there is one, otherwise the host (skipping a timer). */
  advance(): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "advance" });
  }

  sendIntent(intent: Intent): void {
    if (this.engine) {
      this.engine.handleMessage(selfId, { v: PROTOCOL_VERSION, type: "intent", intent });
    } else if (this.snapshot.hostId) {
      this.send({ v: PROTOCOL_VERSION, type: "intent", intent }, this.snapshot.hostId);
    }
  }

  /** Walks to a spot on the floor or sits on a seat. The host decides if it is allowed. */
  move(to: Place): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "move", to });
  }

  /** Writes to the people who can hear you right now (same rules as the voice). */
  chat(text: string): void {
    this.sendToHost({ v: PROTOCOL_VERSION, type: "chat", text });
  }

  private sendToHost(message: object): void {
    if (this.engine) this.engine.handleMessage(selfId, message);
    else if (this.snapshot.hostId) this.send(message, this.snapshot.hostId);
  }

  leave(): void {
    if (this.hostTimeout) clearTimeout(this.hostTimeout);
    this.clearRecoveryTimers();
    // Leaving on purpose ends the game: there is nothing to resume.
    if (this.engine) clearResume();
    this.engine?.dispose();
    this.voice.dispose();
    this.listeners.clear();
    void this.room.leave();
  }

  private onMessage(data: unknown, peerId: string): void {
    if (this.engine) {
      // A resumed host that hears a host: the game already moved on without it. Join as a player.
      if (!(this.engine.isPaused && parseServerMessage(data))) {
        this.engine.handleMessage(peerId, data);
        return;
      }
      this.abdicate(peerId);
    }
    const message = parseServerMessage(data);
    if (!message) return;

    if (message.type === "host") {
      // A new host announces itself. Believed only when it is the narrator, who holds the backup.
      if (peerId === message.hostId && peerId === this.snapshot.view?.narrator?.id) {
        this.clearRecoveryTimers();
        this.update({ hostId: peerId, status: "playing" });
      }
      return;
    }

    // Only the host speaks to guests: pin it on the first lobby message and ignore everyone else.
    const hostId = this.snapshot.hostId;
    if (hostId === null && message.type === "lobby" && message.hostId === peerId) {
      this.snapshot = { ...this.snapshot, hostId: peerId };
    } else if (peerId !== hostId) {
      // A host that comes back after a reload answers from a new connection.
      const returning =
        this.snapshot.status === "reconnecting" && (message.type === "view" || message.type === "seating");
      if (!returning) return;
      this.snapshot = { ...this.snapshot, hostId: peerId };
    }
    this.receiveFromHost(message);
  }

  private receiveFromHost(message: ServerMessage): void {
    if (this.hostTimeout) clearTimeout(this.hostTimeout);
    switch (message.type) {
      case "lobby":
        this.voice.setPermissions(message.voice.speakTo, message.voice.hearFrom);
        this.update({
          status: "lobby",
          players: message.players,
          hostId: message.hostId,
          narratorId: message.narratorId,
          rolesMode: message.rolesMode,
          rolesReady: message.rolesReady,
          roleSetup: message.rolesMode === "custom" ? this.snapshot.roleSetup : null,
        });
        break;
      case "snapshot":
        this.backup = message.snapshot;
        break;
      case "host":
        break;
      case "view":
        this.clearRecoveryTimers();
        this.voice.setPermissions(message.voice.speakTo, message.voice.hearFrom);
        this.update({
          status: "playing",
          view: message.view,
          pause: message.pause,
          phaseEndsAt: message.phaseEndsInMs === null ? null : Date.now() + message.phaseEndsInMs,
        });
        break;
      case "roles":
        this.update({ roleSetup: { assignment: message.assignment, errors: message.errors } });
        break;
      case "seating":
        this.update({ seating: message.seating });
        break;
      case "chat":
        this.update({
          chat: [
            ...this.snapshot.chat,
            { id: this.nextChatId++, from: message.from, text: message.text },
          ].slice(-MAX_CHAT_HISTORY),
        });
        break;
      case "rejected":
        this.update({ status: "rejected", rejected: message.reason });
        break;
    }
  }

  private update(patch: Partial<SessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
