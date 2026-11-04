import {
  ROLE_IDS,
  type GameState,
  type PlayerView,
  type RoleId,
  type RoleSetupError,
  type Seating,
} from "@lupus/core";
import { z } from "zod";

/** Bump when a change to the messages breaks compatibility between peers. */
export const PROTOCOL_VERSION = 1;

export const MAX_NAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 200;

/** Messages sent by clients to the host. Validated at runtime: the host never trusts a client. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("hello"),
    /** A secret this browser keeps, so the host can tell a returning player from a stranger. */
    token: z.string().min(8).max(64).optional(),
    name: z
      .string()
      .min(1)
      .max(MAX_NAME_LENGTH * 2),
  }),
  z.object({ v: z.literal(PROTOCOL_VERSION), type: z.literal("advance") }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("move"),
    to: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("seat"), seat: z.number().int().min(0).max(99) }),
      z.object({ kind: z.literal("stand"), x: z.number().finite(), z: z.number().finite() }),
    ]),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("setup"),
    op: z.discriminatedUnion("op", [
      z.object({ op: z.literal("mode"), mode: z.enum(["random", "custom"]) }),
      z.object({ op: z.literal("assign"), playerId: z.string().max(100), role: z.enum(ROLE_IDS).nullable() }),
      z.object({ op: z.literal("generate") }),
    ]),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("chat"),
    text: z.string().min(1).max(MAX_CHAT_LENGTH),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("intent"),
    intent: z.discriminatedUnion("type", [
      z.object({ type: z.literal("night-action"), target: z.string().max(100) }),
      z.object({ type: z.literal("vote"), target: z.string().max(100).nullable() }),
    ]),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface LobbyPlayer {
  id: string;
  name: string;
}

/** How roles are handed out: shuffled by the game at the start, or set by the human narrator. */
export type RolesMode = "random" | "custom";

/** Who the host is waiting for while a resumed game is paused. */
export interface PauseInfo {
  waitingFor: string[];
}

/**
 * Everything needed to carry on a game: kept by the host in its own browser (to resume after a
 * reload) and sent to the human narrator, who already sees everything and can take over as host.
 */
export interface HostSnapshot {
  game: GameState;
  seating: Seating;
  /** Everybody in the room, with the secret that proves who they are when they reconnect. */
  players: { id: string; name: string; token: string }[];
  hostId: string;
}

export type RejectReason = "game-in-progress" | "room-full" | "version-mismatch";

/** Who a player may send audio to and hear audio from, decided by the host from the game phase. */
export interface VoicePermissions {
  speakTo: string[];
  hearFrom: string[];
}

/** Messages sent by the host to clients. */
export type ServerMessage =
  | {
      v: number;
      type: "lobby";
      hostId: string;
      /** The player chosen as human narrator, or null for the automatic narrator. */
      narratorId: string | null;
      rolesMode: RolesMode;
      /** False while a custom role setup is incomplete or invalid. Says nothing about who has what. */
      rolesReady: boolean;
      players: LobbyPlayer[];
      voice: VoicePermissions;
    }
  | {
      v: number;
      type: "view";
      view: PlayerView;
      voice: VoicePermissions;
      phaseEndsInMs: number | null;
      /** Set while a resumed game waits for its players to come back. */
      pause: PauseInfo | null;
    }
  /** Sent to the human narrator only: the backup that lets them take over if the host leaves. */
  | { v: number; type: "snapshot"; snapshot: HostSnapshot }
  /** The narrator took over as host. Only believed when it comes from the narrator. */
  | { v: number; type: "host"; hostId: string }
  | {
      v: number;
      type: "roles";
      /** Sent to the human narrator only: who plays what, and what is wrong with it. */
      assignment: Record<string, RoleId>;
      errors: RoleSetupError[];
    }
  | { v: number; type: "seating"; seating: Seating }
  | { v: number; type: "chat"; from: string; text: string }
  | { v: number; type: "rejected"; reason: RejectReason };

/** Parses an incoming message from an untrusted peer. Returns null if invalid. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  const parsed = clientMessageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Light check on host messages: the host is trusted, but the shape and version are verified. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as { v?: unknown; type?: unknown };
  if (message.v !== PROTOCOL_VERSION) return null;
  const known = ["lobby", "view", "roles", "seating", "chat", "snapshot", "host", "rejected"];
  if (typeof message.type !== "string" || !known.includes(message.type)) return null;
  return raw as ServerMessage;
}
