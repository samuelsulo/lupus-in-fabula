import type { Phase } from "@lupus/core";

/** How long the automatic narrator waits in each phase before moving on, in seconds. */
export const PHASE_SECONDS: Record<Phase, number | null> = {
  ROLE_REVEAL: 10,
  NIGHT: 30,
  DAWN: 8,
  DAY_DISCUSSION: 120,
  DAY_VOTE: 40,
  ELIMINATION: 8,
  HUNTER_SHOT: 20,
  GAME_OVER: null,
};
