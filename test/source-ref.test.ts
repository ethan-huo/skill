import { mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createFilesystemRepoRef, resolveSourceTarget } from "../src/lib/source-ref";

describe("resolve source target", () => {
  test("keeps owner/repo deterministic as GitHub syntax even when that path exists", async () => {
    const cwd = join(tmpdir(), `skill-source-ref-${crypto.randomUUID()}`);
    await mkdir(join(cwd, "owner", "repo"), { recursive: true });
    try {
      expect(await resolveSourceTarget("owner/repo", cwd)).toMatchObject({
        kind: "github",
        repo: { display: "owner/repo" },
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("resolves explicit relative filesystem syntax to a canonical source", async () => {
    const cwd = join(tmpdir(), `skill-source-ref-${crypto.randomUUID()}`);
    const source = join(cwd, "agents", "skills");
    await mkdir(source, { recursive: true });
    try {
      const target = await resolveSourceTarget("fs:agents/skills", cwd);
      const canonicalSource = await realpath(source);
      expect(target).toEqual({
        kind: "filesystem",
        path: canonicalSource,
        repo: createFilesystemRepoRef(canonicalSource),
      });
      expect(target.repo.owner).toBe("fs");
      expect(target.repo.repo).toMatch(/^agents-[0-9a-f]{10}$/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("parses a canonical GitHub skill ID as an exact repository source path", async () => {
    expect(await resolveSourceTarget("gh:owner/repo/skills/cx", "/tmp")).toMatchObject({
      kind: "github",
      repo: { display: "owner/repo" },
      sourcePath: "skills/cx",
    });
  });

  test("rejects gh: refs without a skill source path", async () => {
    await expect(resolveSourceTarget("gh:owner/repo", "/tmp")).rejects.toThrow(
      "gh:<owner>/<repo>/<source-path>",
    );
  });

  test("rejects a missing filesystem source without reinterpreting it as GitHub", async () => {
    const cwd = join(tmpdir(), `skill-source-ref-${crypto.randomUUID()}`);
    await expect(resolveSourceTarget("./missing", cwd)).rejects.toThrow(
      "Filesystem skill source does not exist",
    );
  });
});
