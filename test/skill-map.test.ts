import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { renderSkillMap, shouldRecommendRepoMap } from "../src/lib/skill-map";
import type { RepoRef, SkillCandidate } from "../src/types";

const repo = {
  owner: "Owl-Listener",
  repo: "designer-skills",
  cloneUrl: "https://github.com/Owl-Listener/designer-skills.git",
  display: "Owl-Listener/designer-skills",
} satisfies RepoRef;

describe("skill map", () => {
  test("recommends maps for repositories with four or more skills", async () => {
    const root = join(tmpdir(), `skill-flat-catalog-${crypto.randomUUID()}`);
    const skills: SkillCandidate[] = [];

    for (let index = 0; index < 4; index += 1) {
      const relativeDir = `skill-${index}`;
      const sourceDir = `skills/${relativeDir}`;
      await mkdir(join(root, sourceDir), { recursive: true });
      await writeFile(join(root, sourceDir, "SKILL.md"), "---\nname: test\n---\n");
      await mkdir(join(root, sourceDir, "references"), { recursive: true });
      await writeFile(join(root, sourceDir, "references", "api.md"), "details\n");
      skills.push({ relativeDir, sourceDir, displayLabel: relativeDir });
    }

    expect(await shouldRecommendRepoMap(root, skills)).toBe(true);
  });

  test("does not recommend maps for repositories with three or fewer skills", async () => {
    const smallRoot = join(tmpdir(), `skill-small-catalog-${crypto.randomUUID()}`);
    const smallSkills: SkillCandidate[] = [];
    for (let index = 0; index < 3; index += 1) {
      const relativeDir = `skill-${index}`;
      const sourceDir = `skills/${relativeDir}`;
      await mkdir(join(smallRoot, sourceDir), { recursive: true });
      await writeFile(join(smallRoot, sourceDir, "SKILL.md"), "---\nname: test\n---\n");
      smallSkills.push({ relativeDir, sourceDir, displayLabel: relativeDir });
    }

    expect(await shouldRecommendRepoMap(smallRoot, smallSkills)).toBe(false);
  });

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
