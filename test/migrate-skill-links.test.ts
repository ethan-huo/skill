import { lstat, mkdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const repositoryRoot = import.meta.dir.replace(/\/test$/, "");

describe("skill link migration", () => {
  test("normalizes GitHub aliases from manifest ownership", async () => {
    const root = join(tmpdir(), `skill-migrate-links-${crypto.randomUUID()}`);
    const skillsRoot = join(root, ".agents", "skills");
    const githubSource = join(root, ".agents", ".skills", "owner", "repo", "cx");
    await mkdir(githubSource, { recursive: true });
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(join(githubSource, "SKILL.md"), "---\nname: cx\n---\n");
    await symlink(githubSource, join(skillsRoot, "cx.repo.cx"), "dir");
    await writeFile(
      join(skillsRoot, "manifest.json"),
      `${JSON.stringify({
        version: 3,
        items: [
          {
            type: "skills",
            // This shape intentionally makes both historical alias formulas identical.
            repo: "cx/repo",
            skills: [{ id: "cx", source: "skills/cx" }],
          },
        ],
      })}\n`,
    );

    try {
      const process = Bun.spawn(
        ["bun", "run", join(repositoryRoot, "scripts", "migrate-skill-links.ts"), skillsRoot],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("Normalized 1 skill link(s)");
      expect(await readlink(join(skillsRoot, "cx-cx"))).toBe(githubSource);
      expect(await lstat(join(skillsRoot, "cx.repo.cx")).catch(() => null)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
