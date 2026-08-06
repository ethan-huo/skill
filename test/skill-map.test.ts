import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { renderSkillMap } from "../src/lib/skill-map";
import { syncProjectMapFromClone } from "../src/lib/project-skills";
import type { RepoRef, SkillCandidate } from "../src/types";

const repo = {
  owner: "Owl-Listener",
  repo: "designer-skills",
  cloneUrl: "https://github.com/Owl-Listener/designer-skills.git",
  display: "Owl-Listener/designer-skills",
} satisfies RepoRef;

describe("skill map", () => {
  test("syncs project maps by regenerating the visible map skill", async () => {
    const root = join(tmpdir(), `skill-map-sync-${crypto.randomUUID()}`);
    const cloneDir = join(root, "repo");
    const cwd = join(root, "project");
    await mkdir(join(cloneDir, "skills", "taste"), { recursive: true });
    const legacyMapRoot = join(cwd, ".agents", "skills", "Owl-Listener.designer-skills.map");
    const mapRoot = join(cwd, ".agents", "skills", "map-designer-skills-owl-listener");
    await mkdir(legacyMapRoot, { recursive: true });
    await writeFile(
      join(cloneDir, "skills", "taste", "SKILL.md"),
      "---\nname: taste\ndescription: Improve visual taste\n---\n",
    );
    await writeFile(join(legacyMapRoot, "SKILL.md"), "stale map\n");

    await syncProjectMapFromClone({
      cloneDir,
      cwd,
      repo,
      repoDescription: "Design skill collection",
    });

    const mapContents = await readFile(join(mapRoot, "SKILL.md"), "utf8");
    expect(mapContents).toContain("Source: `github://Owl-Listener/designer-skills`");
    expect(mapContents).toContain("- When Improve visual taste, read `skills/taste/SKILL.md`.");
    expect(mapContents).not.toContain("stale map");
    expect(await readFile(join(legacyMapRoot, "SKILL.md"), "utf8").catch(() => null)).toBeNull();
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
        'name: "map-designer-skills-owl-listener"',
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

  test("renders root skills with a repository-relative file path", async () => {
    const root = join(tmpdir(), `skill-map-root-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "SKILL.md"),
      "---\nname: root\ndescription: Work from the repository root\n---\n",
    );

    expect(
      await renderSkillMap({
        cloneDir: root,
        repo,
        repoDescription: "Root skill repository",
        skills: [
          {
            relativeDir: "root",
            sourceDir: ".",
            displayLabel: "root",
          },
        ],
      }),
    ).toContain("- When Work from the repository root, read `SKILL.md`.");
  });
});
