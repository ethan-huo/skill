import { lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  pruneEmptyParents,
  linkInstalledSkills,
  removeInstalledSkill,
  removeVisibleRepoSkills,
  replaceInstalledSkills,
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

    await replaceInstalledSkills(repoDir, target, [
      {
        relativeDir: "adapt",
        sourceDir: ".codex/skills/adapt",
        displayLabel: "adapt",
      },
    ]);

    expect(await readFile(join(target, "adapt", "SKILL.md"), "utf8")).toContain("name: adapt");
    expect(await stat(join(target, ".codex")).catch(() => null)).toBeNull();
  });

  test("removes installed directory trees", async () => {
    const root = join(tmpdir(), `skill-remove-${crypto.randomUUID()}`);
    const target = join(root, ".agents", "skills");
    await mkdir(join(target, "ethan-huo.agents.cx"), { recursive: true });
    await mkdir(join(target, "ethan-huo.agents.fp-thinking"), { recursive: true });

    expect(await removeVisibleRepoSkills(target, repo)).toBe(true);

    expect(await stat(join(target, "ethan-huo.agents.cx")).catch(() => null)).toBeNull();
    expect(await stat(join(target, "ethan-huo.agents.fp-thinking")).catch(() => null)).toBeNull();
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

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect((await lstat(join(targetRoot, "ethan-huo.agents.cx"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(targetRoot, "ethan-huo.agents.cx", "SKILL.md"), "utf8")).toContain(
      "name: cx",
    );
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

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect(await listInstalledSkills(root)).toContainEqual({
      id: "ethan-huo/agents/cx",
      owner: "ethan-huo",
      repo: "agents",
      relativeDir: "cx",
      description: "CX helper",
      scope: "local",
      installRoot: join(targetRoot, "ethan-huo.agents.cx"),
    });
  });

  test("removes one installed skill without touching siblings", async () => {
    const root = join(tmpdir(), `skill-remove-one-${crypto.randomUUID()}`);
    const target = join(root, "ethan-huo.agents.cx");
    const sibling = join(root, "ethan-huo.agents.fp-thinking");
    await mkdir(target, { recursive: true });
    await mkdir(sibling, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);

    expect(await stat(target).catch(() => null)).toBeNull();
    expect((await stat(sibling)).isDirectory()).toBe(true);
  });

  test("prunes empty owner directories", async () => {
    const root = join(tmpdir(), `skill-prune-${crypto.randomUUID()}`);
    const baseDir = join(root, ".agents", "skills");
    const target = join(baseDir, "ethan-huo.agents.cx");
    await mkdir(target, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);
    await pruneEmptyParents(dirname(target), baseDir);

    const entries = await readdir(baseDir);
    expect(entries).toEqual([]);
  });
});
