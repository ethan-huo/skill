import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { getMapDescription, renderSkillMap } from "../src/lib/skill-map";
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
    });

    const mapContents = await readFile(join(mapRoot, "SKILL.md"), "utf8");
    expect(mapContents).toContain('description: "Owl-Listener/designer-skills router: taste"');
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
        skills,
      }),
    ).toBe(
      [
        "---",
        'name: "map-designer-skills-owl-listener"',
        'description: "Owl-Listener/designer-skills router: color-system"',
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

  test("lists every skill name in the derived description within the spec limit", () => {
    const skill = (name: string) =>
      ({
        relativeDir: name,
        sourceDir: `skills/${name}`,
        displayLabel: name,
      }) satisfies SkillCandidate;

    expect(getMapDescription(repo, [])).toBe("Owl-Listener/designer-skills router");
    expect(getMapDescription(repo, [skill("taste"), skill("color-system"), skill("taste")])).toBe(
      "Owl-Listener/designer-skills router: taste, color-system",
    );

    const many = Array.from({ length: 200 }, (_, index) => skill(`skill-${index}`));
    const description = getMapDescription(repo, many);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).toStartWith("Owl-Listener/designer-skills router: skill-0, skill-1, ");
    expect(description).toMatch(/, \+\d+ more$/);
  });

  test("names the router by owner/repo without repeating a trailing skills noun", () => {
    const skills = [
      { relativeDir: "a", sourceDir: "skills/a", displayLabel: "a" },
    ] satisfies SkillCandidate[];
    const ref = (owner: string, name: string) => ({
      owner,
      repo: name,
      cloneUrl: `https://github.com/${owner}/${name}.git`,
      display: `${owner}/${name}`,
    });

    expect(getMapDescription(ref("better-auth", "skills"), skills)).toBe(
      "better-auth/skills router: a",
    );
    expect(getMapDescription(ref("get-convex", "agent-skills"), skills)).toBe(
      "get-convex/agent-skills router: a",
    );
    expect(getMapDescription(ref("ethan-huo", "agents"), skills)).toBe(
      "ethan-huo/agents skills router: a",
    );
  });
});
