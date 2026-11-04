import type { PlayerView } from "@lupus/core";
import { z } from "zod";

/** Bump when a change to the messages breaks compatibility between peers. */
export const PROTOCOL_VERSION = 1;

export const MAX_NAME_LENGTH = 20;

/** Messages sent by clients to the host. Validated at runtime: the host never trusts a client. */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal("hello"),
    name: z
      .string()
      .min(1)
      .max(MAX_NAME_LENGTH * 2),
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

export type RejectReason = "game-in-progress" | "room-full" | "version-mismatch";

/** Who a player may send audio to and hear audio from, decided by the host from the game phase. */
export interface VoicePermissions {
  speakTo: string[];
  hearFrom: string[];
}

/** Messages sent by the host to clients. */
export type ServerMessage =
  | { v: number; type: "lobby"; hostId: string; players: LobbyPlayer[]; voice: VoicePermissions }
  | { v: number; type: "view"; view: PlayerView; voice: VoicePermissions; phaseEndsInMs: number | null }
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
  if (message.type !== "lobby" && message.type !== "view" && message.type !== "rejected") return null;
  return raw as ServerMessage;
}
