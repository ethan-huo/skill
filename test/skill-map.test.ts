import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { renderSkillMap } from "../src/lib/skill-map";
import type { RepoRef, SkillCandidate } from "../src/types";

const repo = {
  owner: "Owl-Listener",
  repo: "designer-skills",
  cloneUrl: "https://github.com/Owl-Listener/designer-skills.git",
  display: "Owl-Listener/designer-skills",
} satisfies RepoRef;

describe("skill map", () => {
  test("renders a single source line and path-only intent rows", async () => {
    const root = join(tmpdir(), `skill-map-${crypto.randomUUID()}`);
    const skillDir = join(root, "skills", "color-system");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: color-system",
        "description: |",
        "  Use this skill when designing color systems, semantic palettes,",
        "  accessibility contrast, or tokenized brand themes.",
        "---",
      ].join("\n"),
    );

    const skills = [
      {
        relativeDir: "color-system",
        sourceDir: "skills/color-system",
        displayLabel: "color-system",
      },
    ] satisfies SkillCandidate[];

    expect(
      await renderSkillMap({
        cloneDir: root,
        repo,
        repoDescription: "Design skill collection",
        skills,
      }),
    ).toBe(
      [
        "---",
        'name: "Owl-Listener.designer-skills"',
        'description: "Design skill collection"',
        "---",
        "",
        "Source: `github://Owl-Listener/designer-skills`",
        "Use `ctx read github://Owl-Listener/designer-skills/<path>` to read source files before applying them.",
        "",
        "- When designing color systems, semantic palettes, accessibility contrast, or tokenized brand themes, read `skills/color-system/SKILL.md`.",
        "",
      ].join("\n"),
    );
  });
});
