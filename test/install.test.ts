import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  pruneEmptyParents,
  linkInstalledSkills,
  removeInstalledSkill,
  removeVisibleRepoSkills,
  replaceInstalledSkills,
  resolveInstalledSkillSource,
  upsertInstalledSkills,
} from "../src/lib/install";
import { listInstalledSkills } from "../src/lib/installed-skills";
import type { RepoRef } from "../src/types";

const repo = {
  owner: "ethan-huo",
  repo: "agents",
  cloneUrl: "https://github.com/ethan-huo/agents.git",
  display: "ethan-huo/agents",
} satisfies RepoRef;

describe("install helpers", () => {
  test("installs selected skills into flat folder IDs", async () => {
    const root = join(tmpdir(), `skill-install-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const target = join(root, ".agents", "skills", "pbakaus", "impeccable");

    await mkdir(join(repoDir, ".codex", "skills", "adapt"), { recursive: true });
    await writeFile(
      join(repoDir, ".codex", "skills", "adapt", "SKILL.md"),
      "---\nname: adapt\ndescription: Adapt skill\n---\n",
    );

    await replaceInstalledSkills(repoDir, target, repo, [
      {
        relativeDir: "adapt",
        sourceDir: ".codex/skills/adapt",
        displayLabel: "adapt",
      },
    ]);

    expect(await readFile(join(target, "adapt", "SKILL.md"), "utf8")).toContain(
      "name: adapt-ethan-huo",
    );
    expect(await stat(join(target, ".codex")).catch(() => null)).toBeNull();
  });

  test("installs a root skill without copying checkout metadata", async () => {
    const root = join(tmpdir(), `skill-root-install-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const target = join(root, ".agents", ".skills", "blader", "humanizer");

    await mkdir(join(repoDir, ".git"), { recursive: true });
    await writeFile(join(repoDir, "SKILL.md"), "---\nname: humanizer\n---\n");
    await writeFile(join(repoDir, "reference.md"), "supporting material");
    await writeFile(join(repoDir, ".git", "HEAD"), "ref: refs/heads/main\n");

    await upsertInstalledSkills(repoDir, target, repo, [
      {
        relativeDir: "root",
        sourceDir: ".",
        displayLabel: "root",
      },
    ]);

    const installedRoot = await resolveInstalledSkillSource(target, "root");
    expect(await readFile(join(installedRoot, "SKILL.md"), "utf8")).toContain(
      "name: root-ethan-huo",
    );
    expect(await readFile(join(installedRoot, "reference.md"), "utf8")).toBe("supporting material");
    expect(await stat(join(installedRoot, ".git")).catch(() => null)).toBeNull();
  });

  test("removes installed directory trees", async () => {
    const root = join(tmpdir(), `skill-remove-${crypto.randomUUID()}`);
    const target = join(root, ".agents", "skills");
    await mkdir(join(target, "cx.agents.ethan-huo"), { recursive: true });
    await mkdir(join(target, "fp-thinking.agents.ethan-huo"), { recursive: true });
    await mkdir(join(target, "ethan-huo.agents.legacy"), { recursive: true });

    expect(await removeVisibleRepoSkills(target, repo)).toBe(true);

    expect(await stat(join(target, "cx.agents.ethan-huo")).catch(() => null)).toBeNull();
    expect(await stat(join(target, "fp-thinking.agents.ethan-huo")).catch(() => null)).toBeNull();
    expect(await stat(join(target, "ethan-huo.agents.legacy")).catch(() => null)).toBeNull();
  });

  test("links visible skills to hidden source skills", async () => {
    const root = join(tmpdir(), `skill-link-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");

    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect((await lstat(join(targetRoot, "cx-ethan-huo"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(targetRoot, "cx-ethan-huo", "SKILL.md"), "utf8")).toContain(
      "name: cx-ethan-huo",
    );
  });

  test("keeps visible skills readable while atomically switching immutable snapshots", async () => {
    const root = join(tmpdir(), `skill-atomic-update-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const visibleSkill = join(targetRoot, "cx-ethan-huo");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\nold");
    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    const oldSnapshot = await readlink(visibleSkill);

    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\nnew");
    const readFailures: unknown[] = [];
    let reading = true;
    const reader = (async () => {
      while (reading) {
        try {
          await readFile(join(visibleSkill, "SKILL.md"), "utf8");
        } catch (error) {
          readFailures.push(error);
        }
      }
    })();

    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    reading = false;
    await reader;

    const newSnapshot = await readlink(visibleSkill);
    expect(readFailures).toEqual([]);
    expect(newSnapshot).not.toBe(oldSnapshot);
    expect(await readFile(join(oldSnapshot, "SKILL.md"), "utf8")).toContain("old");
    expect(await readFile(join(newSnapshot, "SKILL.md"), "utf8")).toContain("new");

    const linkBeforeNoop = await lstat(visibleSkill);
    const snapshotBeforeNoop = await stat(newSnapshot);
    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    const linkAfterNoop = await lstat(visibleSkill);
    const snapshotAfterNoop = await stat(newSnapshot);
    expect(await readlink(visibleSkill)).toBe(newSnapshot);
    expect(linkAfterNoop.ino).toBe(linkBeforeNoop.ino);
    expect(linkAfterNoop.mtimeMs).toBe(linkBeforeNoop.mtimeMs);
    expect(snapshotAfterNoop.ino).toBe(snapshotBeforeNoop.ino);
    expect(snapshotAfterNoop.mtimeMs).toBe(snapshotBeforeNoop.mtimeMs);
  });

  test("keeps the existing visible snapshot when candidate materialization fails", async () => {
    const root = join(tmpdir(), `skill-interrupted-update-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const visibleSkill = join(targetRoot, "cx-ethan-huo");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\nstable");
    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    const stableSnapshot = await readlink(visibleSkill);

    await rm(join(repoDir, "skills", "cx", "SKILL.md"));
    await expect(
      upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills),
    ).rejects.toThrow();

    expect(await readlink(visibleSkill)).toBe(stableSnapshot);
    expect(await readFile(join(visibleSkill, "SKILL.md"), "utf8")).toContain("stable");
  });

  test("changes revisions when a materialized resource symlink changes", async () => {
    const root = join(tmpdir(), `skill-symlink-revision-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const skillDir = join(repoDir, "skills", "cx");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const visibleSkill = join(targetRoot, "cx-ethan-huo");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), "---\nname: cx\n---\nstable");
    await writeFile(join(skillDir, "v1.txt"), "one");
    await writeFile(join(skillDir, "v2.txt"), "two");
    await symlink("v1.txt", join(skillDir, "resource.txt"));
    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    const firstSnapshot = await readlink(visibleSkill);

    await rm(join(skillDir, "resource.txt"));
    await symlink("v2.txt", join(skillDir, "resource.txt"));
    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect(await readlink(visibleSkill)).not.toBe(firstSnapshot);
    expect(await readFile(join(visibleSkill, "resource.txt"), "utf8")).toBe("two");
  });

  test("repairs malformed skill frontmatter while installing source copies", async () => {
    const root = join(tmpdir(), `skill-repair-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "builderio", "skills");
    const selectedSkills = [
      {
        relativeDir: "efficient-frontier",
        sourceDir: "skills/efficient-frontier",
        displayLabel: "efficient-frontier",
      },
    ];

    await mkdir(join(repoDir, "skills", "efficient-frontier"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "efficient-frontier", "SKILL.md"),
      [
        "---",
        "name: efficient-frontier",
        "description: Apply the same orchestration as `/efficient-fable` to any high-cost frontier model: delegate research",
        "allowed-tools:",
        "  - Read",
        "  - Bash",
        "---",
        "",
        "# Efficient Frontier",
      ].join("\n"),
    );

    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);

    const installedRoot = await resolveInstalledSkillSource(sourceRoot, "efficient-frontier");
    const contents = await readFile(join(installedRoot, "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(contents)?.[1] ?? "";
    const parsed = Bun.YAML.parse(frontmatter) as {
      description?: string;
      "allowed-tools"?: string[];
    };
    expect(parsed.description).toContain("model: delegate research");
    expect(parsed["allowed-tools"]).toEqual(["Read", "Bash"]);
    expect(contents).toContain("# Efficient Frontier");
  });

  test("links nested skill paths with skill-first package names and removes legacy aliases", async () => {
    const root = join(tmpdir(), `skill-link-nested-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "design/taste",
        sourceDir: "skills/design/taste",
        displayLabel: "design/taste",
      },
    ];

    await mkdir(join(repoDir, "skills", "design", "taste"), { recursive: true });
    await mkdir(join(targetRoot, "ethan-huo.agents.design/taste"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "design", "taste", "SKILL.md"),
      "---\nname: taste\n---\n",
    );

    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await symlink(join(sourceRoot, "design", "taste"), join(targetRoot, "design.taste"), "dir");
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect((await lstat(join(targetRoot, "design-taste-ethan-huo"))).isSymbolicLink()).toBe(true);
    expect(await lstat(join(targetRoot, "design.taste")).catch(() => null)).toBeNull();
    expect(
      await stat(join(targetRoot, "ethan-huo.agents.design", "taste")).catch(() => null),
    ).toBeNull();
  });

  test("lists one-level visible skill links by upstream IDs", async () => {
    const root = join(tmpdir(), `skill-list-flat-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "cx", "SKILL.md"),
      "---\nname: cx\ndescription: CX helper\n---\n",
    );

    await upsertInstalledSkills(repoDir, sourceRoot, repo, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    await writeFile(
      join(targetRoot, "manifest.json"),
      `${JSON.stringify({
        version: 3,
        items: [
          {
            type: "skills",
            repo: "ethan-huo/agents",
            skills: [{ id: "cx", source: "skills/cx" }],
          },
        ],
      })}\n`,
    );

    expect(await listInstalledSkills(root)).toContainEqual({
      id: "gh:ethan-huo/agents/skills/cx",
      owner: "ethan-huo",
      repo: "agents",
      relativeDir: "cx",
      name: "cx-ethan-huo",
      description: "CX helper",
      scope: "local",
      installRoot: join(targetRoot, "cx-ethan-huo"),
    });
  });

  test("removes one installed skill without touching siblings", async () => {
    const root = join(tmpdir(), `skill-remove-one-${crypto.randomUUID()}`);
    const target = join(root, "cx.agents.ethan-huo");
    const sibling = join(root, "fp-thinking.agents.ethan-huo");
    await mkdir(target, { recursive: true });
    await mkdir(sibling, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);

    expect(await stat(target).catch(() => null)).toBeNull();
    expect((await stat(sibling)).isDirectory()).toBe(true);
  });

  test("prunes empty owner directories", async () => {
    const root = join(tmpdir(), `skill-prune-${crypto.randomUUID()}`);
    const baseDir = join(root, ".agents", "skills");
    const target = join(baseDir, "cx.agents.ethan-huo");
    await mkdir(target, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);
    await pruneEmptyParents(dirname(target), baseDir);

    const entries = await readdir(baseDir);
    expect(entries).toEqual([]);
  });
});
