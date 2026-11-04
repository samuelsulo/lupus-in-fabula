import type { Phase } from "@lupus/core";

/** One big icon per phase, so everybody sees at a glance where the game is. */
export const PHASE_ICONS: Record<Phase, string> = {
  ROLE_REVEAL: "🎭",
  NIGHT: "🌙",
  DAWN: "🌅",
  DAY_DISCUSSION: "☀️",
  DAY_VOTE: "🗳️",
  ELIMINATION: "⚖️",
  HUNTER_SHOT: "🏹",
  GAME_OVER: "🏁",
};
