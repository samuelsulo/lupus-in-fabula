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
  seer: { id: "seer", team: "villagers", nightOrder: 3 },
  villager: { id: "villager", team: "villagers", nightOrder: null },
};

/** Roles that act at night, sorted by night order. */
export const NIGHT_ROLES: RoleId[] = Object.values(ROLES)
  .filter((role) => role.nightOrder !== null)
  .sort((a, b) => (a.nightOrder as number) - (b.nightOrder as number))
  .map((role) => role.id);
