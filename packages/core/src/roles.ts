import type { RoleId, Team } from "./types.ts";

export interface RoleDefinition {
  id: RoleId;
  team: Team;
  /** Position in the night order, or null if the role does not act at night. */
  nightOrder: number | null;
}

export const ROLES: Record<RoleId, RoleDefinition> = {
  werewolf: { id: "werewolf", team: "werewolves", nightOrder: 1 },
  doctor: { id: "doctor", team: "villagers", nightOrder: 2 },
  bodyguard: { id: "bodyguard", team: "villagers", nightOrder: 3 },
  seer: { id: "seer", team: "villagers", nightOrder: 4 },
  hunter: { id: "hunter", team: "villagers", nightOrder: null },
  villager: { id: "villager", team: "villagers", nightOrder: null },
};

/** Roles that act at night, sorted by night order. */
export const NIGHT_ROLES: RoleId[] = Object.values(ROLES)
  .filter((role) => role.nightOrder !== null)
  .sort((a, b) => (a.nightOrder as number) - (b.nightOrder as number))
  .map((role) => role.id);

/** Every role, in a stable order (the order roles are listed in menus). */
export const ROLE_IDS = [
  "werewolf",
  "villager",
  "seer",
  "doctor",
  "hunter",
  "bodyguard",
] as const satisfies readonly RoleId[];

/** Roles that exist only once per game: two seers or two hunters would break the game. */
export const UNIQUE_ROLES: readonly RoleId[] = ["seer", "doctor", "hunter", "bodyguard"];

/**
 * The most werewolves a game of `playerCount` players can start with. The game ends as soon as
 * they are at least as many as everybody else, so they must stay strictly fewer than half.
 */
export function maxWerewolves(playerCount: number): number {
  return Math.max(1, Math.ceil(playerCount / 2) - 1);
}

export type RoleSetupError =
  | { code: "unassigned"; count: number }
  | { code: "no-werewolf" }
  | { code: "too-many-werewolves"; max: number }
  | { code: "duplicate"; role: RoleId };

/**
 * Checks that a set of roles can be played. `roles` holds one entry per player, null for a player
 * who has none yet. Returns every problem found, so the narrator can fix them all at once.
 */
export function validateRoles(roles: (RoleId | null)[]): RoleSetupError[] {
  const errors: RoleSetupError[] = [];
  const unassigned = roles.filter((role) => role === null).length;
  if (unassigned > 0) errors.push({ code: "unassigned", count: unassigned });
  const count = (role: RoleId) => roles.filter((r) => r === role).length;
  if (count("werewolf") === 0) errors.push({ code: "no-werewolf" });
  const max = maxWerewolves(roles.length);
  if (count("werewolf") > max) errors.push({ code: "too-many-werewolves", max });
  for (const role of UNIQUE_ROLES) if (count(role) > 1) errors.push({ code: "duplicate", role });
  return errors;
}
