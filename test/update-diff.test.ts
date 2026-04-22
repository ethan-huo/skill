import { describe, expect, test } from "bun:test";

import { diffSkillSets } from "../src/lib/update-diff";

describe("diffSkillSets", () => {
  test("splits updated removed and added skills", () => {
    expect(diffSkillSets(["skills/a", "skills/b"], ["skills/b", "skills/c"])).toEqual({
      updated: ["skills/b"],
      removed: ["skills/a"],
      added: ["skills/c"],
    });
  });
});
