import { lstat, mkdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { syncVisibleLinks } from "../src/commands/update";
import type { RepoRef } from "../src/types";

const repo = {
  owner: "repo",
  repo: "abc",
  cloneUrl: "https://github.com/repo/abc.git",
  display: "repo/abc",
} satisfies RepoRef;

describe("project update cleanup", () => {
  test("removes stale project links for upstream skills that disappeared without requiring a manifest", async () => {
    const cwd = join(tmpdir(), `skill-update-cleanup-${crypto.randomUUID()}`);
    const installRoot = join(cwd, ".agents", "skills");
    const deadLink = join(installRoot, "repo.abc.a");

    await mkdir(installRoot, { recursive: true });
    await symlink(join(cwd, ".agents", ".skills", "repo", "abc", "a"), deadLink, "dir");
    expect((await lstat(deadLink)).isSymbolicLink()).toBe(true);

    await syncVisibleLinks({
      cwd,
      input: { global: false },
      repo,
      globalInstalledIds: [],
      projectInstalledIds: [],
      updated: [],
      removed: ["a"],
      sourceRoot: join(cwd, ".agents", ".skills", "repo", "abc"),
    });

    expect(await lstat(deadLink).catch(() => null)).toBeNull();
  });
});
