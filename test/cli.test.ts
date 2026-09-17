import { mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { colorizeYaml } from "../src/lib/human-output";
const repositoryRoot = import.meta.dir.replace(/\/test$/, "");

async function runSkill(args: string[], cwd = repositoryRoot, env: Record<string, string> = {}) {
  const process = Bun.spawn(["bun", "run", join(repositoryRoot, "src", "cli.ts"), ...args], {
    cwd,
    env: {
      ...Bun.env,
      ...env,
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

  test("list exposes readable absolute SKILL.md paths for local and global skills", async () => {
    const root = join(tmpdir(), `skill-cli-list-${crypto.randomUUID()}`);
    const project = join(root, "project");
    const home = join(root, "home");
    const source = join(root, "source");
    const content = "---\nname: example\ndescription: Example skill\n---\n";
    try {
      await mkdir(source, { recursive: true });
      await writeFile(join(source, "SKILL.md"), content);
      for (const base of [project, home]) {
        const skills = join(base, ".agents", "skills");
        await mkdir(skills, { recursive: true });
        await symlink(source, join(skills, "example.repo.owner"));
      }
      const localFile = join(
        await realpath(project),
        ".agents",
        "skills",
        "example.repo.owner",
        "SKILL.md",
      );
      const globalFile = join(home, ".agents", "skills", "example.repo.owner", "SKILL.md");
      for (const [args, files] of [
        [["list"], [globalFile, localFile]],
        [["list", "--scope", "local"], [localFile]],
        [["list", "--scope", "global"], [globalFile]],
        [["list", "{ scope: 'global' }"], [globalFile]],
      ] as const) {
        const result = await runSkill([...args], project, { HOME: home });
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(Bun.YAML.parse(result.stdout)).toEqual({
          skills: files.map((file) => ({ file, name: "example", description: "Example skill" })),
          summary: { count: files.length, estimatedTokens: 6 * files.length },
        });
        for (const file of files) {
          expect(await readFile(file, "utf8")).toBe(content);
        }
      }
      await rm(join(project, ".agents", "skills", "example.repo.owner"));
      const empty = await runSkill(["list", "--scope", "local"], project, { HOME: home });
      expect(empty.exitCode).toBe(0);
      expect(Bun.YAML.parse(empty.stdout)).toEqual({
        skills: [],
        summary: { count: 0, estimatedTokens: 0 },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("list rejects unsupported scopes", async () => {
    for (const args of [
      ["list", "--scope", "all"],
      ["list", "{ scope: 'all' }"],
    ]) {
      const result = await runSkill(args);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("scope");
    }
  });

  test("accepts --no-color on human command syntax", async () => {
    const result = await runSkill(["list", "--no-color"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("summary:");
    expect(result.stdout).not.toContain("\x1b[");
  });

  test("renders YAML scalars with terminal colors", () => {
    const rendered = colorizeYaml("skills:\n  - id: gh:owner/repo/skill\nsummary:\n  count: 3\n");

    expect(rendered).toContain("\x1b[36m 3\x1b[0m");
  });

  test("enables colored output when the CLI runs inside a PTY", async () => {
    let output = "";
    await using terminal = new Bun.Terminal({
      cols: 120,
      rows: 40,
      data(_terminal, data) {
        output += data;
      },
    });
    const process = Bun.spawn(["bun", "run", join(repositoryRoot, "src", "cli.ts"), "list"], {
      cwd: repositoryRoot,
      env: {
        ...Bun.env,
        NO_COLOR: "",
        TERM: "xterm-256color",
      },
      terminal,
    });

    expect(await process.exited).toBe(0);
    expect(output).toContain("\x1b[2mskills:\x1b[0m");
  });

  test("add rejects local paths through the real CLI", async () => {
    const root = join(tmpdir(), `skill-cli-fs-${crypto.randomUUID()}`);
    const source = join(root, "agents", "skills", "cx");
    const project = join(root, "project");
    await mkdir(source, { recursive: true });
    await mkdir(project, { recursive: true });
    await writeFile(join(source, "SKILL.md"), "---\nname: cx\n---\n");

    try {
      const result = await runSkill(["add", join(root, "agents", "skills")], project, {
        HOME: root,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Unsupported repository format");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
