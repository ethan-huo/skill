import { lstat, mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  getConflictingGlobalSkillIds,
  installGlobalSkills,
  installLocalProjectSkills,
} from "../src/lib/add-skills";
import { ensureClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "../src/lib/claude-skills";
import { getSkillsBaseDir, getSourceInstallRoot, getVisibleSkillRoot } from "../src/lib/paths";
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

  test("creates the project claude skills root link when it is absent", async () => {
    const root = join(tmpdir(), `skill-claude-link-${crypto.randomUUID()}`);

    const claudeSkillsRoot = await ensureProjectClaudeSkillsLink(root);

    expect(claudeSkillsRoot).toBe(join(root, ".claude", "skills"));
    expect((await lstat(claudeSkillsRoot)).isSymbolicLink()).toBe(true);
    expect(await readlink(claudeSkillsRoot)).toBe("../.agents/skills");
  });

  test("skips an existing claude skills directory with a valid real path", async () => {
    const root = join(tmpdir(), `skill-claude-valid-dir-${crypto.randomUUID()}`);
    const claudeSkillsRoot = join(root, ".claude", "skills");
    await mkdir(claudeSkillsRoot, { recursive: true });
    await writeFile(join(claudeSkillsRoot, "owned.txt"), "keep");

    expect(await ensureProjectClaudeSkillsLink(root)).toBe(claudeSkillsRoot);
    expect((await lstat(claudeSkillsRoot)).isDirectory()).toBe(true);
    expect(await readFile(join(claudeSkillsRoot, "owned.txt"), "utf8")).toBe("keep");
  });

  test("skips an existing claude skills symlink with a valid real path", async () => {
    const root = join(tmpdir(), `skill-claude-valid-link-${crypto.randomUUID()}`);
    const target = join(root, "custom-skills");
    const claudeSkillsRoot = join(root, ".claude", "skills");
    await mkdir(target, { recursive: true });
    await mkdir(dirname(claudeSkillsRoot), { recursive: true });
    await symlink(target, claudeSkillsRoot, "dir");

    expect(await ensureProjectClaudeSkillsLink(root)).toBe(claudeSkillsRoot);
    expect(await readlink(claudeSkillsRoot)).toBe(target);
  });

  test("repairs an invalid claude skills symlink to the agents skills root", async () => {
    const root = join(tmpdir(), `skill-claude-broken-link-${crypto.randomUUID()}`);
    const claudeSkillsRoot = join(root, ".claude", "skills");
    await mkdir(dirname(claudeSkillsRoot), { recursive: true });
    await symlink(join(root, "missing"), claudeSkillsRoot, "dir");

    expect(await ensureProjectClaudeSkillsLink(root)).toBe(claudeSkillsRoot);
    expect((await lstat(claudeSkillsRoot)).isSymbolicLink()).toBe(true);
    expect(await readlink(claudeSkillsRoot)).toBe("../.agents/skills");
  });

  test("uses the same root-link rule for global-style agents and claude roots", async () => {
    const root = join(tmpdir(), `skill-global-claude-link-${crypto.randomUUID()}`);
    const claudeSkillsRoot = await ensureClaudeSkillsLink({
      agentsSkillsRoot: join(root, ".agents", "skills"),
      claudeRoot: join(root, ".claude"),
    });

    expect(claudeSkillsRoot).toBe(join(root, ".claude", "skills"));
    expect((await lstat(claudeSkillsRoot)).isSymbolicLink()).toBe(true);
    expect(await readlink(claudeSkillsRoot)).toBe("../.agents/skills");
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
    const ensuredClaudeLinks: string[] = [];

    try {
      const result = await installGlobalSkills({
        cloneDir: repoDir,
        cwd: root,
        ensureClaudeSkillsLink: async (cwd) => {
          ensuredClaudeLinks.push(cwd);
          return join(root, ".claude", "skills");
        },
        repo: isolatedRepo,
        selectedSkills,
      });

      expect(result.installRoot).toBe(getSkillsBaseDir("global", root));
      expect(
        (await lstat(getVisibleSkillRoot("global", root, isolatedRepo, "cx"))).isSymbolicLink(),
      ).toBe(true);
      expect(ensuredClaudeLinks).toEqual([root]);
    } finally {
      await rm(getVisibleSkillRoot("global", root, isolatedRepo, "cx"), {
        force: true,
        recursive: true,
      });
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
    }
  });

  test("project install effects write hidden source links, manifest, and claude root link", async () => {
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
      expect((await lstat(join(projectRoot, ".claude", "skills"))).isSymbolicLink()).toBe(true);
      expect(await readlink(join(projectRoot, ".claude", "skills"))).toBe("../.agents/skills");
      expect(
        await readFile(join(projectRoot, ".agents", "skills", "manifest.json"), "utf8"),
      ).toContain(`"repo": "${isolatedRepo.owner}/agents"`);
    } finally {
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
    }
  });
});
