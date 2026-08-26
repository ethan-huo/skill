import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  getInstalledInitialSelectors,
  installGlobalSkills,
  installLocalProjectSkills,
  partitionCrossScopeSkills,
} from "../src/lib/add-skills";
import {
  getManifestPath,
  getSkillsBaseDir,
  getSourceInstallRoot,
  getVisibleSkillRoot,
} from "../src/lib/paths";
import { readScopeManifest } from "../src/lib/project-manifest";
import { seedGlobalManifestFromVisibleLinks } from "../src/lib/project-skills";
import type { InstalledSkill, RepoRef, SkillCandidate } from "../src/types";

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
  test("uses only same-repo project installs as local prompt defaults", () => {
    expect(getInstalledInitialSelectors(makeInstalledSkills(), "local", repo)).toEqual(["cx"]);
  });

  test("uses only same-repo global installs as global prompt defaults", () => {
    expect(getInstalledInitialSelectors(makeInstalledSkills(), "global", repo)).toEqual([
      "fp-thinking",
    ]);
  });

  test("partitions cross-scope conflicts symmetrically", () => {
    expect(
      partitionCrossScopeSkills(makeInstalledSkills(), "global", repo, selectedSkills),
    ).toEqual({
      installedSkills: [],
      skipped: [
        {
          skill: "gh:ethan-huo/agents/skills/cx",
          reason: "already-installed-in-project",
        },
      ],
    });

    const fpThinking = {
      relativeDir: "fp-thinking",
      sourceDir: "skills/fp-thinking",
      displayLabel: "fp-thinking",
    } satisfies SkillCandidate;
    expect(partitionCrossScopeSkills(makeInstalledSkills(), "local", repo, [fpThinking])).toEqual({
      installedSkills: [],
      skipped: [
        {
          skill: "gh:ethan-huo/agents/skills/fp-thinking",
          reason: "already-installed-in-global",
        },
      ],
    });
  });

  test("global install effects write hidden source and visible agent links", async () => {
    const root = join(tmpdir(), `skill-global-effects-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const previousHome = process.env.HOME;
    const isolatedRepo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "agents",
      cloneUrl: "https://github.com/example/agents.git",
      display: "example/agents",
    } satisfies RepoRef;

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");
    process.env.HOME = root;

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
      expect(await readScopeManifest("global", root)).toEqual({
        version: 3,
        items: [
          {
            type: "skills",
            repo: `${isolatedRepo.owner}/agents`,
            skills: [{ id: "cx", source: "skills/cx" }],
          },
        ],
      });
      expect(await readFile(getManifestPath("global", root), "utf8")).toContain('"version": 3');
    } finally {
      await rm(getVisibleSkillRoot("global", root, isolatedRepo, "cx"), {
        force: true,
        recursive: true,
      });
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  test("project install effects write hidden source links and manifest", async () => {
    const root = join(tmpdir(), `skill-project-effects-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = root;
    const repoDir = join(root, "repo");
    const projectRoot = join(root, "project");
    const isolatedRepo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "agents",
      cloneUrl: "https://github.com/example/agents.git",
      display: "example/agents",
    } satisfies RepoRef;

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
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
        await readFile(join(projectRoot, ".agents", "skills", "manifest.json"), "utf8"),
      ).toContain(`"repo": "${isolatedRepo.owner}/agents"`);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("project installs non-conflicting skills and reports global conflicts as skipped", async () => {
    const root = join(tmpdir(), `skill-project-cross-scope-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    const repoDir = join(root, "repo");
    const projectRoot = join(root, "project");
    const isolatedRepo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "agents",
      cloneUrl: "https://github.com/example/agents.git",
      display: "example/agents",
    } satisfies RepoRef;
    const conflict = {
      relativeDir: "cx",
      sourceDir: "skills/cx",
      displayLabel: "cx",
    } satisfies SkillCandidate;
    const installable = {
      relativeDir: "design",
      sourceDir: "skills/design",
      displayLabel: "design",
    } satisfies SkillCandidate;

    process.env.HOME = root;
    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await mkdir(join(repoDir, "skills", "design"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");
    await writeFile(join(repoDir, "skills", "design", "SKILL.md"), "---\nname: design\n---\n");

    try {
      await installGlobalSkills({
        cloneDir: repoDir,
        cwd: projectRoot,
        repo: isolatedRepo,
        selectedSkills: [conflict],
      });

      const result = await installLocalProjectSkills({
        cloneDir: repoDir,
        cwd: projectRoot,
        repo: isolatedRepo,
        selectedSkills: [conflict, installable],
      });

      expect(result.installedSkills).toEqual([installable]);
      expect(result.skipped).toEqual([
        {
          skill: `gh:${isolatedRepo.owner}/agents/skills/cx`,
          reason: "already-installed-in-global",
        },
      ]);
      expect(
        (
          await lstat(getVisibleSkillRoot("local", projectRoot, isolatedRepo, "design"))
        ).isSymbolicLink(),
      ).toBe(true);
      await expect(
        lstat(getVisibleSkillRoot("local", projectRoot, isolatedRepo, "cx")),
      ).rejects.toThrow();
      const skippedOnly = await installLocalProjectSkills({
        cloneDir: repoDir,
        cwd: projectRoot,
        repo: isolatedRepo,
        selectedSkills: [conflict],
      });
      expect(skippedOnly).toEqual({
        installRoot: getSkillsBaseDir("local", projectRoot),
        installedSkills: [],
        skipped: [
          {
            skill: `gh:${isolatedRepo.owner}/agents/skills/cx`,
            reason: "already-installed-in-global",
          },
        ],
      });
      expect(await readScopeManifest("local", projectRoot)).toEqual({
        version: 3,
        items: [
          {
            type: "skills",
            repo: `${isolatedRepo.owner}/agents`,
            skills: [{ id: "design", source: "skills/design" }],
          },
        ],
      });
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await rm(root, { force: true, recursive: true });
      await rm(getSourceInstallRoot(isolatedRepo), { force: true, recursive: true });
      await rm(dirname(getSourceInstallRoot(isolatedRepo)), { force: true, recursive: true });
    }
  });

  test("seeds missing global manifest from visible links only", async () => {
    const root = join(tmpdir(), `skill-global-seed-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = root;

    const visibleRepo = {
      owner: "visible-owner",
      repo: "agents",
      cloneUrl: "https://github.com/visible-owner/agents.git",
      display: "visible-owner/agents",
    } satisfies RepoRef;
    const cachedOnlyRepo = {
      owner: "cached-owner",
      repo: "agents",
      cloneUrl: "https://github.com/cached-owner/agents.git",
      display: "cached-owner/agents",
    } satisfies RepoRef;

    try {
      await mkdir(join(getSourceInstallRoot(visibleRepo), "cx"), { recursive: true });
      await writeFile(
        join(getSourceInstallRoot(visibleRepo), "cx", "SKILL.md"),
        "---\nname: cx\n---\n",
      );
      await mkdir(getSkillsBaseDir("global", root), { recursive: true });
      await symlink(
        join(getSourceInstallRoot(visibleRepo), "cx"),
        getVisibleSkillRoot("global", root, visibleRepo, "cx"),
        "dir",
      );

      await mkdir(join(getSourceInstallRoot(cachedOnlyRepo), "audit"), { recursive: true });
      await writeFile(
        join(getSourceInstallRoot(cachedOnlyRepo), "audit", "SKILL.md"),
        "---\nname: audit\n---\n",
      );

      expect(await seedGlobalManifestFromVisibleLinks(root)).toBe(true);
      expect(await readScopeManifest("global", root)).toEqual({
        version: 3,
        items: [
          {
            type: "skills",
            repo: "visible-owner/agents",
            skills: [{ id: "cx" }],
          },
        ],
      });
    } finally {
      await rm(root, { force: true, recursive: true });
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});

function makeInstalledSkills(): InstalledSkill[] {
  return [
    {
      id: "ethan-huo/agents/cx",
      owner: "ethan-huo",
      repo: "agents",
      relativeDir: "cx",
      name: "",
      description: "",
      scope: "local",
      installRoot: "/tmp/local/cx.agents.ethan-huo",
    },
    {
      id: "ethan-huo/agents/fp-thinking",
      owner: "ethan-huo",
      repo: "agents",
      relativeDir: "fp-thinking",
      name: "",
      description: "",
      scope: "global",
      installRoot: "/tmp/global/fp-thinking.agents.ethan-huo",
    },
    {
      id: "other/agents/audit",
      owner: "other",
      repo: "agents",
      relativeDir: "audit",
      name: "",
      description: "",
      scope: "local",
      installRoot: "/tmp/local/audit.agents.other",
    },
  ];
}
