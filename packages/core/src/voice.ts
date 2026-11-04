import { awakeRole } from "./game.ts";
import type { GameState } from "./types.ts";

/**
 * Who may hear each participant: speaker id -> listener ids (never includes the speaker).
 * The host enforces this by telling each client who it may send audio to,
 * and clients also drop audio from peers they should not hear.
 *
 * A human narrator (not a player) talks to whoever is awake and hears them, so
 * the roles can whisper to the narrator at night without the others listening.
 */
export function voiceRouting(state: GameState): Record<string, string[]> {
  const routing: Record<string, string[]> = {};
  const awake = awakeRole(state);
  const narratorId = state.narrator?.id ?? null;
  // The narrator may be a dead player turned narrator, so they can already be in the list.
  const everyone = [...new Set([...state.players.map((p) => p.id), ...(narratorId ? [narratorId] : [])])];
  const dead = state.players.filter((p) => !p.alive).map((p) => p.id);
  const awakeIds = state.players.filter((p) => p.alive && p.role === awake).map((p) => p.id);

  for (const speaker of state.players) {
    let listeners: string[];
    if (state.phase === "GAME_OVER") {
      listeners = everyone;
    } else if (!speaker.alive) {
      // Ghost channel: the living never hear the dead (the narrator does).
      listeners = narratorId ? [...new Set([...dead, narratorId])] : dead;
    } else if (state.phase === "NIGHT") {
      // Only the roles currently awake can talk: to each other and to the narrator.
      listeners = awake === speaker.role ? (narratorId ? [...awakeIds, narratorId] : awakeIds) : [];
    } else {
      // The dead may listen to the living, they just cannot talk back to them.
      listeners = everyone;
    }
    routing[speaker.id] = listeners.filter((id) => id !== speaker.id);
  }

  if (narratorId) {
    routing[narratorId] = (state.phase === "NIGHT" ? awakeIds : everyone).filter((id) => id !== narratorId);
  }
  return routing;
}
