import { describe, expect, it } from "vitest";
import { remapIds } from "./remap.ts";

describe("remapIds", () => {
  it("replaces an id in values and keys, everywhere", () => {
    const state = { players: [{ id: "old-id-123" }], votes: { "old-id-123": "x", y: "old-id-123" } };
    expect(remapIds(state, "old-id-123", "new-id-456")).toEqual({
      players: [{ id: "new-id-456" }],
      votes: { "new-id-456": "x", y: "new-id-456" },
    });
  });

  it("leaves the value alone when nothing changes", () => {
    const state = { a: 1 };
    expect(remapIds(state, "same", "same")).toBe(state);
  });
});
