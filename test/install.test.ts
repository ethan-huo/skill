import { mkdir, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import { pruneEmptyParents, removeInstalledRepo } from "../src/lib/install";

describe("removeInstalledRepo", () => {
  test("removes installed directory trees", async () => {
    const root = join(tmpdir(), `skill-remove-${crypto.randomUUID()}`);
    const target = join(root, "ethan-huo", "agents");
    await mkdir(join(target, "skills", "cx"), { recursive: true });

    expect(await removeInstalledRepo(target)).toBe(true);

    const remaining = await stat(target).catch(() => null);
    expect(remaining).toBeNull();
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
