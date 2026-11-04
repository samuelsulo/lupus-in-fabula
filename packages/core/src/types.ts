export type RoleId = "werewolf" | "villager" | "seer" | "doctor" | "hunter" | "bodyguard";

export type Team = "villagers" | "werewolves";

export type Phase =
  | "ROLE_REVEAL"
  | "NIGHT"
  | "DAWN"
  | "DAY_DISCUSSION"
  | "DAY_VOTE"
  | "ELIMINATION"
  | "HUNTER_SHOT"
  | "GAME_OVER";

export interface GameConfig {
  /** Show who votes for whom while the vote is open. Always shown once it is over. */
  openVotes: boolean;
}

export interface Player {
  id: string;
  name: string;
  role: RoleId;
  alive: boolean;
}

export type DeathCause = "werewolves" | "vote" | "hunter" | "bodyguard";

export type GameEvent =
  | { type: "night-start"; day: number }
  | { type: "death"; day: number; playerId: string; cause: DeathCause }
  | { type: "hunter-pass"; day: number; playerId: string }
  /** The human narrator left. `waiting` is true when nobody could take over yet. */
  | { type: "narrator-left"; day: number; waiting: boolean }
  /** A dead player took over as narrator. */
  | { type: "narrator-new"; day: number; playerId: string }
  | { type: "no-death"; day: number }
  | {
      type: "vote-result";
      day: number;
      tally: Record<string, number>;
      /** voter id -> target id (null means abstain). */
      votes: Record<string, string | null>;
      eliminated: string | null;
    }
  | { type: "game-over"; winner: Team };

export interface Inspection {
  seerId: string;
  day: number;
  targetId: string;
  isWerewolf: boolean;
}

/** A human narrator: sees everything, plays no role and drives the phases. */
export interface Narrator {
  id: string;
  name: string;
}

export interface GameState {
  config: GameConfig;
  /** Null in automatic mode: the timers drive the phases. */
  narrator: Narrator | null;
  /** True after the narrator left with nobody dead to take over: the next death becomes narrator. */
  wantsNarrator: boolean;
  players: Player[];
  phase: Phase;
  /** Starts at 1; increments at every night. */
  day: number;
  /** Roles that wake up tonight, in order. Only roles with at least one living player. */
  nightSteps: RoleId[];
  nightStep: number;
  /** actor id -> target id, for the current night. */
  nightActions: Record<string, string>;
  /** voter id -> target id (null means abstain), for the current vote. */
  votes: Record<string, string | null>;
  inspections: Inspection[];
  /** A dead hunter who has yet to take the revenge shot, and where the game goes afterwards. */
  pendingShot: { playerId: string; resume: "DAY_DISCUSSION" | "NIGHT" } | null;
  events: GameEvent[];
  winner: Team | null;
  rngState: number;
}

export type Intent = { type: "night-action"; target: string } | { type: "vote"; target: string | null };

export type Result<T> = { ok: true; state: T } | { ok: false; error: string };
