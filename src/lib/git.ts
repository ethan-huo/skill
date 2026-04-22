import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RepoRef } from "../types";

export async function shallowCloneRepo(repo: RepoRef): Promise<string> {
  const cloneDir = join(tmpdir(), `skill-${repo.owner}-${repo.repo}-${crypto.randomUUID()}`);

  const proc = Bun.spawn(["git", "clone", "--depth", "1", repo.cloneUrl, cloneDir], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `git clone failed with exit code ${exitCode}.`);
  }

  return cloneDir;
}
