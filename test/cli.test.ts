import { describe, expect, test } from "bun:test";

async function runSkill(args: string[]) {
  const process = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    cwd: import.meta.dir.replace(/\/test$/, ""),
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
});
