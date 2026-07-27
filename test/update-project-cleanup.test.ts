import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
      repo,
      globalInstalledIds: [],
      projectInstalledIds: ["a"],
      updated: [],
      removed: ["a"],
      sourceRoot: join(cwd, ".agents", ".skills", "repo", "abc"),
    });

    expect(await lstat(deadLink).catch(() => null)).toBeNull();
  });

  test("reconciles removed skills in global and project scopes in one update pass", async () => {
    const cwd = join(tmpdir(), `skill-update-both-scopes-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = cwd;

    const sourceRoot = join(cwd, ".agents", ".skills", "repo", "abc");
    const projectRoot = join(cwd, "project", ".agents", "skills");
    const globalRoot = join(cwd, ".agents", "skills");
    const projectLink = join(projectRoot, "a.abc.repo");
    const globalLink = join(globalRoot, "a.abc.repo");

    try {
      await mkdir(join(sourceRoot, "a"), { recursive: true });
      await mkdir(projectRoot, { recursive: true });
      await mkdir(globalRoot, { recursive: true });
      await symlink(join(sourceRoot, "a"), projectLink, "dir");
      await symlink(join(sourceRoot, "a"), globalLink, "dir");
      await writeFile(
        join(globalRoot, "manifest.json"),
        JSON.stringify({
          version: 2,
          items: [{ type: "skills", repo: "repo/abc", skills: ["a"] }],
        }),
      );
      await writeFile(
        join(projectRoot, "manifest.json"),
        JSON.stringify({
          version: 2,
          items: [{ type: "skills", repo: "repo/abc", skills: ["a"] }],
        }),
      );

      await syncVisibleLinks({
        cwd: join(cwd, "project"),
        repo,
        globalInstalledIds: ["a"],
        projectInstalledIds: ["a"],
        updated: [],
        removed: ["a"],
        sourceRoot,
      });

      expect(await lstat(projectLink).catch(() => null)).toBeNull();
      expect(await lstat(globalLink).catch(() => null)).toBeNull();
      expect(JSON.parse(await readFile(join(globalRoot, "manifest.json"), "utf8"))).toEqual({
        version: 3,
        items: [],
      });
      expect(JSON.parse(await readFile(join(projectRoot, "manifest.json"), "utf8"))).toEqual({
        version: 3,
        items: [],
      });
      expect(await readFile(join(projectRoot, ".gitignore"), "utf8")).toBe(
        "# BEGIN skill managed entries\n# END skill managed entries\n",
      );
    } finally {
      await rm(cwd, { force: true, recursive: true });
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});
