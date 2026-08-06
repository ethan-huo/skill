import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { resolveSourceTarget } from "../src/lib/source-ref";

describe("resolve source target", () => {
  test("keeps owner/repo deterministic as GitHub syntax even when that path exists", async () => {
    const cwd = join(tmpdir(), `skill-source-ref-${crypto.randomUUID()}`);
    await mkdir(join(cwd, "owner", "repo"), { recursive: true });
    try {
      expect(resolveSourceTarget("owner/repo")).toMatchObject({
        kind: "github",
        repo: { display: "owner/repo" },
      });
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("parses a canonical GitHub skill ID as an exact repository source path", async () => {
    expect(resolveSourceTarget("gh:owner/repo/skills/cx")).toMatchObject({
      kind: "github",
      repo: { display: "owner/repo" },
      sourcePath: "skills/cx",
    });
  });

  test("rejects gh: refs without a skill source path", async () => {
    expect(() => resolveSourceTarget("gh:owner/repo")).toThrow("gh:<owner>/<repo>/<source-path>");
  });

  test("rejects filesystem syntax as an invalid GitHub repository ref", () => {
    expect(() => resolveSourceTarget("fs:agents/skills")).toThrow();
    expect(() => resolveSourceTarget("./missing")).toThrow();
  });
});
