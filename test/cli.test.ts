import { mkdir, rm, writeFile } from "node:fs/promises";
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
