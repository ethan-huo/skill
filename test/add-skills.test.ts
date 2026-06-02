import { lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  getConflictingGlobalSkillIds,
  installGlobalSkills,
  installLocalProjectSkills,
} from "../src/lib/add-skills";
import { linkClaudeSkillsIfAvailable } from "../src/lib/claude-skills";
import { upsertInstalledSkills } from "../src/lib/install";
import {
  getClaudeRoot,
  getClaudeSkillRoot,
  getSkillsBaseDir,
  getSourceInstallRoot,
  getVisibleSkillRoot,
} from "../src/lib/paths";
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
  test("detects only overlapping global skills for the same repo", () => {
    expect(
      getConflictingGlobalSkillIds(
        [
          {
            id: "ethan-huo/agents/cx",
            owner: "ethan-huo",
            repo: "agents",
            relativeDir: "cx",
            name: "",
            description: "",
            scope: "global",
            installRoot: "/tmp/global/ethan-huo/agents",
          },
          {
            id: "ethan-huo/agents/fp-thinking",
            owner: "ethan-huo",
            repo: "agents",
            relativeDir: "fp-thinking",
            name: "",
            description: "",
            scope: "local",
            installRoot: "/tmp/local/ethan-huo/agents",
          },
        ],
        repo,
        [
          {
            relativeDir: "fp-thinking",
            sourceDir: "skills/fp-thinking",
            displayLabel: "fp-thinking",
          },
        ],
      ),
    ).toEqual([]);

    expect(
      getConflictingGlobalSkillIds(
        [
          {
            id: "ethan-huo/agents/cx",
            owner: "ethan-huo",
            repo: "agents",
            relativeDir: "cx",
            name: "",
            description: "",
            scope: "global",
            installRoot: "/tmp/global/ethan-huo/agents",
          },
        ],
        repo,
        selectedSkills,
      ),
    ).toEqual(["ethan-huo/agents/cx"]);
  });

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

  test("global install effects write hidden source and visible agents links without claude links", async () => {
    const root = join(tmpdir(), `skill-global-effects-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const isolatedRepo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "agents",
      cloneUrl: "https://github.com/example/agents.git",
      display: "example/agents",
    } satisfies RepoRef;

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");

    try {
      const result = await installGlobalSkills({
        cloneDir: repoDir,
        cwd: root,
        repo: isolatedRepo,
        selectedSkills,
      });

      expect(result.installRoot).toBe(getSkillsBaseDir("global", root));
      expect(
        (await lstat(getVisibleSkillRoot("global", root, isolatedRepo, "cx"))).isSymbolicLink(),
      ).toBe(true);
      expect(
        await stat(getClaudeSkillRoot(getClaudeRoot(), isolatedRepo, "cx")).catch(() => null),
      ).toBeNull();
    } finally {
      await rm(getVisibleSkillRoot("global", root, isolatedRepo, "cx"), {
        force: true,
        recursive: true,
      });
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
    }
  });

  test("project install effects write hidden source links and manifest without claude links", async () => {
    const root = join(tmpdir(), `skill-project-effects-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const projectRoot = join(root, "project");
    const isolatedRepo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "agents",
      cloneUrl: "https://github.com/example/agents.git",
      display: "example/agents",
    } satisfies RepoRef;

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await mkdir(join(projectRoot, ".claude"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");

    try {
      const result = await installLocalProjectSkills({
        cloneDir: repoDir,
        cwd: projectRoot,
        repo: isolatedRepo,
        selectedSkills,
      });

      expect(result.installRoot).toBe(join(projectRoot, ".agents", "skills"));
      expect(
        (
          await lstat(getVisibleSkillRoot("local", projectRoot, isolatedRepo, "cx"))
        ).isSymbolicLink(),
      ).toBe(true);
      expect(
        await stat(join(projectRoot, ".claude", "skills", `${isolatedRepo.owner}.agents.cx`)).catch(
          () => null,
        ),
      ).toBeNull();
      expect(
        await readFile(join(projectRoot, ".agents", "skills", "manifest.json"), "utf8"),
      ).toContain(`"repo": "${isolatedRepo.owner}/agents"`);
    } finally {
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
    }
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
