export type RoleId = "werewolf" | "villager" | "seer" | "doctor";

export type Team = "villagers" | "werewolves";

export type Phase =
  "ROLE_REVEAL" | "NIGHT" | "DAWN" | "DAY_DISCUSSION" | "DAY_VOTE" | "ELIMINATION" | "GAME_OVER";

export interface GameConfig {
  /** Reveal the role of a player when they die. Roles are always revealed at game over. */
  revealRoleOnDeath: boolean;
}

export interface Player {
  id: string;
  name: string;
  role: RoleId;
  alive: boolean;
}

export type GameEvent =
  | { type: "night-start"; day: number }
  | { type: "death"; day: number; playerId: string; cause: "werewolves" | "vote" }
  | { type: "no-death"; day: number }
  | { type: "vote-result"; day: number; tally: Record<string, number>; eliminated: string | null }
  | { type: "game-over"; winner: Team };

export interface Inspection {
  seerId: string;
  day: number;
  targetId: string;
  isWerewolf: boolean;
}

export interface GameState {
  config: GameConfig;
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
  events: GameEvent[];
  winner: Team | null;
  rngState: number;
}

export type Intent = { type: "night-action"; target: string } | { type: "vote"; target: string | null };

export type Result<T> = { ok: true; state: T } | { ok: false; error: string };
