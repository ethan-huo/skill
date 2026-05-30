import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { shallowCloneRepo } from "../src/lib/git";
import type { RepoRef } from "../src/types";

describe("shallowCloneRepo", () => {
  test("replaces corrupt cache directories that are not usable git checkouts", async () => {
    const root = join(tmpdir(), `skill-git-test-${crypto.randomUUID()}`);
    const remoteDir = join(root, "remote");
    await mkdir(join(remoteDir, "skills", "ctx"), { recursive: true });
    await writeFile(join(remoteDir, "skills", "ctx", "SKILL.md"), "---\nname: ctx\n---\n");

    await runGit(["init", remoteDir]);
    await runGit(["-C", remoteDir, "add", "."]);
    await runGit([
      "-C",
      remoteDir,
      "-c",
      "user.name=Skill Test",
      "-c",
      "user.email=skill-test@example.com",
      "commit",
      "-m",
      "add skill",
    ]);

    const headHash = (await runGit(["-C", remoteDir, "rev-parse", "HEAD"])).trim();
    const repo = {
      owner: `owner-${crypto.randomUUID()}`,
      repo: "ctx",
      cloneUrl: remoteDir,
      display: "owner/ctx",
    } satisfies RepoRef;

    const cacheDir = join(tmpdir(), "skill-clones", repo.owner, `${repo.repo}-${headHash}`);
    await mkdir(join(cacheDir, ".git"), { recursive: true });
    await mkdir(join(cacheDir, "skills", "ctx"), { recursive: true });

    try {
      const cloneDir = await shallowCloneRepo(repo);

      expect(cloneDir).toBe(cacheDir);
      expect(await Bun.file(join(cloneDir, "skills", "ctx", "SKILL.md")).exists()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(join(tmpdir(), "skill-clones", repo.owner), { recursive: true, force: true });
    }
  });
});

async function runGit(args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return stdout;
}
