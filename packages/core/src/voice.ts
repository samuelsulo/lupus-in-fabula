import { awakeRole } from "./game.ts";
import type { GameState } from "./types.ts";

/**
 * Who may hear each player: speaker id -> listener ids (never includes the speaker).
 * The host enforces this by telling each client who it may send audio to,
 * and clients also drop audio from peers they should not hear.
 */
export function voiceRouting(state: GameState): Record<string, string[]> {
  const routing: Record<string, string[]> = {};
  const awake = awakeRole(state);

  for (const speaker of state.players) {
    let listeners: string[];
    if (state.phase === "GAME_OVER") {
      listeners = state.players.map((p) => p.id);
    } else if (!speaker.alive) {
      // Ghost channel: the living never hear the dead.
      listeners = state.players.filter((p) => !p.alive).map((p) => p.id);
    } else if (state.phase === "NIGHT") {
      // Only the roles currently awake can talk, and only to each other.
      listeners =
        awake === speaker.role
          ? state.players.filter((p) => p.alive && p.role === awake).map((p) => p.id)
          : [];
    } else {
      // The dead may listen to the living, they just cannot talk back to them.
      listeners = state.players.map((p) => p.id);
    }
    routing[speaker.id] = listeners.filter((id) => id !== speaker.id);
  }
  return routing;
}
