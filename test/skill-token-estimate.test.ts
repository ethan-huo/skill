import { describe, expect, test } from "bun:test";

import { estimateSkillListTokens, estimateTextTokens } from "../src/lib/skill-token-estimate";

describe("skill token estimates", () => {
  test("estimates ASCII frontmatter text at roughly four chars per token", () => {
    expect(estimateTextTokens("abcd efgh")).toBe(3);
  });

  test("counts CJK text without the ASCII four-character discount", () => {
    expect(estimateTextTokens("技能列表")).toBe(4);
  });

  test("sums skill names and descriptions only", () => {
    expect(
      estimateSkillListTokens([
        { name: "cx", description: "Semantic navigation" },
        { name: "review", description: "" },
      ]),
    ).toBe(8);
  });
});
