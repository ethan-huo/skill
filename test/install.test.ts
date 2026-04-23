import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  pruneEmptyParents,
  removeInstalledRepo,
  removeInstalledSkill,
  replaceInstalledSkills,
} from "../src/lib/install";

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
    const target = join(root, "ethan-huo", "agents");
    await mkdir(join(target, "skills", "cx"), { recursive: true });

    expect(await removeInstalledRepo(target)).toBe(true);

    const remaining = await stat(target).catch(() => null);
    expect(remaining).toBeNull();
  });

  test("removes one installed skill without touching siblings", async () => {
    const root = join(tmpdir(), `skill-remove-one-${crypto.randomUUID()}`);
    const target = join(root, "ethan-huo", "agents");
    await mkdir(join(target, "cx"), { recursive: true });
    await mkdir(join(target, "fp-thinking"), { recursive: true });

    expect(await removeInstalledSkill(target, "cx")).toBe(true);

    expect(await stat(join(target, "cx")).catch(() => null)).toBeNull();
    expect((await stat(join(target, "fp-thinking"))).isDirectory()).toBe(true);
  });

  test("prunes empty owner directories", async () => {
    const root = join(tmpdir(), `skill-prune-${crypto.randomUUID()}`);
    const baseDir = join(root, ".agents", "skills");
    const target = join(baseDir, "ethan-huo", "agents");
    await mkdir(join(target, "skills", "cx"), { recursive: true });

    expect(await removeInstalledRepo(target)).toBe(true);
    await pruneEmptyParents(dirname(target), baseDir);

    const entries = await readdir(baseDir);
    expect(entries).toEqual([]);
  });
});
