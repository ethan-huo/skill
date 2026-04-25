import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { linkClaudeSkillsIfAvailable } from "../src/lib/add-skills";
import { upsertInstalledSkills } from "../src/lib/install";
import type { RepoRef, SkillCandidate } from "../src/types";

const repo = {
  owner: "ethan-huo",
  repo: "agents",
  cloneUrl: "https://github.com/ethan-huo/agents.git",
  display: "ethan-huo/agents",
} satisfies RepoRef;

const selectedSkills = [
  {
    relativeDir: "cx",
    sourceDir: "skills/cx",
    displayLabel: "cx",
  },
] satisfies SkillCandidate[];

describe("add skills", () => {
  test("links global installs into claude skills when claude root exists", async () => {
    const root = join(tmpdir(), `skill-claude-link-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const claudeRoot = join(root, ".claude");

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await mkdir(claudeRoot, { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");
    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);

    const installRoots = await linkClaudeSkillsIfAvailable({
      claudeRoot,
      repo,
      selectedSkills,
      sourceRoot,
    });

    expect(installRoots).toEqual([join(claudeRoot, "skills", "ethan-huo.agents.cx")]);
    expect((await lstat(installRoots![0]!)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(installRoots![0]!, "SKILL.md"), "utf8")).toContain("name: cx");
  });

  test("skips claude links when claude root is absent", async () => {
    const root = join(tmpdir(), `skill-no-claude-link-${crypto.randomUUID()}`);
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const claudeRoot = join(root, ".claude");

    const installRoots = await linkClaudeSkillsIfAvailable({
      claudeRoot,
      repo,
      selectedSkills,
      sourceRoot,
    });

    expect(installRoots).toBeNull();
    expect(await stat(join(claudeRoot, "skills")).catch(() => null)).toBeNull();
  });

  test("links project installs into project claude skills when project claude root exists", async () => {
    const root = join(tmpdir(), `skill-project-claude-link-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const projectRoot = join(root, "project");
    const claudeRoot = join(projectRoot, ".claude");

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await mkdir(claudeRoot, { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");
    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);

    const installRoots = await linkClaudeSkillsIfAvailable({
      claudeRoot,
      repo,
      selectedSkills,
      sourceRoot,
    });

    expect(installRoots).toEqual([join(projectRoot, ".claude", "skills", "ethan-huo.agents.cx")]);
    expect((await lstat(installRoots![0]!)).isSymbolicLink()).toBe(true);
    expect(await readFile(join(installRoots![0]!, "SKILL.md"), "utf8")).toContain("name: cx");
  });
});
