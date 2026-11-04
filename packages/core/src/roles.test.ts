import { describe, expect, it } from "vitest";
import { maxWerewolves, validateRoles } from "./roles.ts";
import type { RoleId } from "./types.ts";

const roles = (...list: RoleId[]): RoleId[] => list;

describe("maxWerewolves", () => {
  it("keeps the pack strictly smaller than the rest of the village", () => {
    expect([4, 5, 6, 7, 8, 9, 10].map(maxWerewolves)).toEqual([1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("validateRoles", () => {
  it("accepts a sensible game", () => {
    expect(validateRoles(roles("werewolf", "seer", "doctor", "villager", "villager"))).toEqual([]);
  });

  it("needs at least one werewolf", () => {
    expect(validateRoles(roles("villager", "seer", "doctor", "villager"))).toContainEqual({
      code: "no-werewolf",
    });
  });

  it("limits the werewolves by the number of players", () => {
    const four = roles("werewolf", "werewolf", "villager", "villager");
    expect(validateRoles(four)).toContainEqual({ code: "too-many-werewolves", max: 1 });
    const ten = roles(
      "werewolf",
      "werewolf",
      "werewolf",
      "werewolf",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
      "villager",
    );
    expect(validateRoles(ten)).toEqual([]);
  });

  it("allows only one of each special role, but any number of villagers", () => {
    const errors = validateRoles(
      roles("werewolf", "seer", "seer", "hunter", "hunter", "villager", "villager", "villager"),
    );
    expect(errors).toContainEqual({ code: "duplicate", role: "seer" });
    expect(errors).toContainEqual({ code: "duplicate", role: "hunter" });
    expect(errors).toHaveLength(2);
  });

  it("reports players without a role", () => {
    expect(validateRoles(["werewolf", null, "villager", null, "villager"])).toContainEqual({
      code: "unassigned",
      count: 2,
    });
  });
});
