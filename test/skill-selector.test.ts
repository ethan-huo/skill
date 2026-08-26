import { describe, expect, test } from "bun:test";

import { parseSkillSelectors } from "../src/lib/skill-selector";

describe("skill selector expressions", () => {
  test("parses unqualified, qualified, and grouped selectors", () => {
    expect(parseSkillSelectors("abc, core/{dec,efg}, codex/last")).toEqual([
      { skill: "abc" },
      { skill: "dec", variant: "core" },
      { skill: "efg", variant: "core" },
      { skill: "last", variant: "codex" },
    ]);
  });

  test("rejects duplicate logical skills across variants", () => {
    expect(() => parseSkillSelectors("core/abc,codex/abc")).toThrow(
      'Skill "abc" is selected more than once',
    );
  });

  test("rejects malformed and nested groups", () => {
    expect(() => parseSkillSelectors("core/{abc,{dec}}")).toThrow(
      "nested groups are not supported",
    );
    expect(() => parseSkillSelectors("core/{abc,}")).toThrow('Invalid skill name ""');
    expect(() => parseSkillSelectors("abc,,dec")).toThrow("empty selectors are not allowed");
  });
});
