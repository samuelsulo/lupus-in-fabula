import type { Intent, PlayerView } from "@lupus/core";
import { joinRoom, selfId } from "trystero";
import { HostEngine, type RolePresets } from "./host-engine.ts";
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type LobbyPlayer,
  type RejectReason,
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

export type SessionStatus = "connecting" | "lobby" | "playing" | "host-left" | "host-not-found" | "rejected";

export interface SessionSnapshot {
  status: SessionStatus;
  code: string;
  selfId: string;
  isHost: boolean;
  hostId: string | null;
  players: LobbyPlayer[];
  view: PlayerView | null;
  /** Epoch ms (local clock) at which the narrator moves on, or null. */
  phaseEndsAt: number | null;
  rejected: RejectReason | null;
}

export interface SessionOptions {
  code: string;
  name: string;
  isHost: boolean;
  presets: RolePresets;
}

/**
 * One player's connection to a room. The host also runs the game engine; every
 * other player only sends intents and renders the views the host sends back.
 */
export class Session {
  readonly voice: VoiceController;
  private readonly room: ReturnType<typeof joinRoom>;
  private readonly engine: HostEngine | null;
  private readonly send: (message: unknown, target: string) => void;
  private readonly listeners = new Set<() => void>();
  private hostTimeout: ReturnType<typeof setTimeout> | null = null;
  private snapshot: SessionSnapshot;

  constructor(private readonly options: SessionOptions) {
    this.room = joinRoom({ appId: APP_ID }, options.code);
    this.voice = new VoiceController(this.room);
    const action = this.room.makeAction<never>("msg");
    this.send = (message, target) => void action.send(message as never, { target });

    this.snapshot = {
      status: "connecting",
      code: options.code,
      selfId,
      isHost: options.isHost,
      hostId: options.isHost ? selfId : null,
      players: [],
      view: null,
      phaseEndsAt: null,
      rejected: null,
    };

    this.engine = options.isHost
      ? new HostEngine({
          hostId: selfId,
          presets: options.presets,
          send: (to, message) => (to === selfId ? this.receiveFromHost(message) : this.send(message, to)),
        })
      : null;

    action.onMessage = (data, { peerId }) => this.onMessage(data, peerId);
    this.room.onPeerJoin = (peerId) => {
      this.voice.onPeerJoin(peerId);
      if (!this.engine) this.send({ v: PROTOCOL_VERSION, type: "hello", name: options.name }, peerId);
    };
    this.room.onPeerLeave = (peerId) => {
      this.voice.onPeerLeave(peerId);
      this.engine?.removePlayer(peerId);
      if (peerId === this.snapshot.hostId && !options.isHost) this.update({ status: "host-left" });
    };
    this.room.onPeerStream = (stream, peerId) => this.voice.onPeerStream(stream, peerId);

    if (this.engine) {
      this.engine.addHost(options.name);
    } else {
      this.hostTimeout = setTimeout(() => {
        if (this.snapshot.status === "connecting") this.update({ status: "host-not-found" });
      }, HOST_TIMEOUT_MS);
    }
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Host only. Returns an error message if the game cannot start. */
  start(): string | null {
    return this.engine?.start() ?? "Only the host can start the game";
  }

  /** Host only: skip the current timer. */
  skip(): void {
    this.engine?.skip();
  }

  sendIntent(intent: Intent): void {
    if (this.engine) {
      this.engine.handleMessage(selfId, { v: PROTOCOL_VERSION, type: "intent", intent });
    } else if (this.snapshot.hostId) {
      this.send({ v: PROTOCOL_VERSION, type: "intent", intent }, this.snapshot.hostId);
    }
  }

  leave(): void {
    if (this.hostTimeout) clearTimeout(this.hostTimeout);
    this.engine?.dispose();
    this.voice.dispose();
    this.listeners.clear();
    void this.room.leave();
  }

  private onMessage(data: unknown, peerId: string): void {
    if (this.engine) {
      this.engine.handleMessage(peerId, data);
      return;
    }
    const message = parseServerMessage(data);
    if (!message) return;
    // Only the host speaks to guests: pin it on the first lobby message and ignore everyone else.
    const hostId = this.snapshot.hostId;
    if (hostId === null && message.type === "lobby" && message.hostId === peerId) {
      this.snapshot = { ...this.snapshot, hostId: peerId };
    } else if (peerId !== hostId) {
      return;
    }
    this.receiveFromHost(message);
  }

  private receiveFromHost(message: ServerMessage): void {
    if (this.hostTimeout) clearTimeout(this.hostTimeout);
    switch (message.type) {
      case "lobby":
        this.voice.setPermissions(message.voice.speakTo, message.voice.hearFrom);
        this.update({ status: "lobby", players: message.players, hostId: message.hostId });
        break;
      case "view":
        this.voice.setPermissions(message.voice.speakTo, message.voice.hearFrom);
        this.update({
          status: "playing",
          view: message.view,
          phaseEndsAt: message.phaseEndsInMs === null ? null : Date.now() + message.phaseEndsInMs,
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
