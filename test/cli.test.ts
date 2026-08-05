import { lstat, mkdir, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const repositoryRoot = import.meta.dir.replace(/\/test$/, "");

async function runSkill(args: string[], cwd = repositoryRoot) {
  const process = Bun.spawn(["bun", "run", join(repositoryRoot, "src", "cli.ts"), ...args], {
    cwd,
    env: {
      ...Bun.env,
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("argc v7 CLI contract", () => {
  test("@schema exposes dotted commands and structured input", async () => {
    const result = await runSkill(["@schema"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('call: skill <path> "<object>"');
    expect(result.stdout).toContain("favorite: {");
    expect(result.stdout).toContain("install(input: { repo?: string[]");
  });

  test("legacy favorite path reaches the dotted command", async () => {
    const result = await runSkill(["favorite", "list", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(expect.any(Array));
  });

  test("handler results are emitted on stdout as YAML", async () => {
    const result = await runSkill(["list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("skills:");
    expect(result.stdout).toContain("summary:");
    expect(result.stdout).toContain("estimatedTokens:");
  });

  test("add accepts an absolute filesystem source through the real CLI", async () => {
    const root = join(tmpdir(), `skill-cli-fs-${crypto.randomUUID()}`);
    const source = join(root, "agents", "skills", "cx");
    const project = join(root, "project");
    await mkdir(source, { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(source, "SKILL.md"), "---\nname: cx\n---\n");

    try {
      const result = await runSkill(
        ["add", join(root, "agents", "skills"), "--skills", "cx"],
        project,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("kind: skills");
      expect(result.stdout).toContain("- cx");
      const entries = await readdir(join(project, ".agents", "skills"), {
        withFileTypes: true,
      });
      const visible = entries.find(
        (entry) => entry.isSymbolicLink() && entry.name.startsWith("cx."),
      );
      expect(visible).toBeDefined();
      const visiblePath = join(project, ".agents", "skills", visible!.name);
      expect((await lstat(visiblePath)).isSymbolicLink()).toBe(true);
      expect(await readlink(visiblePath)).toBe(await realpath(source));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
