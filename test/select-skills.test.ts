import { describe, expect, test } from "bun:test";

import { selectSkills } from "../src/lib/select-skills";
import type { SkillGroup } from "../src/types";

const groups = [
  {
    relativeDir: "annotate",
    displayLabel: "annotate",
    candidates: [
      {
        relativeDir: "annotate",
        sourceDir: "apps/skills/codex/annotate",
        displayLabel: "annotate",
        variant: "codex",
      },
      {
        relativeDir: "annotate",
        sourceDir: "apps/skills/core/annotate",
        displayLabel: "annotate",
        variant: "core",
      },
    ],
  },
] satisfies SkillGroup[];

describe("skill selection", () => {
  test("resolves an explicit variant without prompting", async () => {
    expect(
      await selectSkills("owner/repo", groups, {
        selectors: [{ skill: "annotate", variant: "core" }],
      }),
    ).toEqual({
      mode: "skills",
      skills: [groups[0]!.candidates[1]!],
    });
  });

  test("rejects an ambiguous unqualified selector outside a TTY", async () => {
    await expect(
      selectSkills("owner/repo", groups, {
        selectors: [{ skill: "annotate" }],
      }),
    ).rejects.toThrow("codex/annotate or core/annotate");
  });

  test("rejects a variant that does not provide the selected skill", async () => {
    await expect(
      selectSkills("owner/repo", groups, {
        selectors: [{ skill: "annotate", variant: "gemini" }],
      }),
    ).rejects.toThrow('Variant "gemini" does not provide skill "annotate"');
  });

  test("uses one repo-level radio when selected skills share the same variants", async () => {
    const review = {
      relativeDir: "review",
      displayLabel: "review",
      candidates: [
        {
          relativeDir: "review",
          sourceDir: "apps/skills/codex/review",
          displayLabel: "review",
          variant: "codex",
        },
        {
          relativeDir: "review",
          sourceDir: "apps/skills/core/review",
          displayLabel: "review",
          variant: "core",
        },
      ],
    } satisfies SkillGroup;
    const prompts: Array<{ message: string; variants: string[] }> = [];

    const result = await selectSkills(
      "owner/repo",
      [...groups, review],
      {
        selectors: [{ skill: "annotate" }, { skill: "review" }],
      },
      {
        isTty: () => true,
        selectVariant: (message, variants) => {
          prompts.push({ message, variants });
          return Promise.resolve(variants[0]!);
        },
      },
    );

    expect(prompts).toEqual([
      {
        message: "Choose a variant for 2 selected skills",
        variants: ["codex", "core"],
      },
    ]);
    expect(result).toEqual({
      mode: "skills",
      skills: [groups[0]!.candidates[0]!, review.candidates[0]!],
    });
  });
});
