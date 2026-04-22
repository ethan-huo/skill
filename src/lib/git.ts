import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RepoRef } from "../types";

export async function shallowCloneRepo(repo: RepoRef): Promise<string> {
  const headHash = await resolveRemoteHeadHash(repo);
  const ownerCacheDir = join(tmpdir(), "skill-clones", repo.owner);
  const cloneDir = join(ownerCacheDir, `${repo.repo}-${headHash}`);
  if (await hasGitCheckout(cloneDir)) {
    return cloneDir;
  }

  await mkdir(ownerCacheDir, { recursive: true });
  const stagingDir = `${cloneDir}.tmp-${crypto.randomUUID()}`;

  try {
    await runGit(["clone", "--depth", "1", repo.cloneUrl, stagingDir], "git clone failed");
    await rename(stagingDir, cloneDir).catch(async (error: unknown) => {
      // Another process may populate the same cache entry concurrently.
      if ((error as NodeJS.ErrnoException).code === "EEXIST" && (await hasGitCheckout(cloneDir))) {
        await rm(stagingDir, { recursive: true, force: true });
        return;
      }

      throw error;
    });
    await pruneStaleRepoClones(ownerCacheDir, repo.repo, `${repo.repo}-${headHash}`);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return cloneDir;
}

async function resolveRemoteHeadHash(repo: RepoRef): Promise<string> {
  const output = await runGit(["ls-remote", repo.cloneUrl, "HEAD"], "git ls-remote failed");
  const match = /^([0-9a-f]{40})\s+HEAD$/m.exec(output.trim());
  if (!match) {
    throw new Error(`Could not resolve remote HEAD for ${repo.display}.`);
  }

  return match[1]!;
}

async function hasGitCheckout(directory: string): Promise<boolean> {
  const gitDir = await stat(join(directory, ".git")).catch(() => null);
  return gitDir?.isDirectory() ?? false;
}

async function pruneStaleRepoClones(
  ownerCacheDir: string,
  repoName: string,
  keepEntry: string,
): Promise<void> {
  const entries = await readdir(ownerCacheDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (
      entry.name === keepEntry ||
      entry.name.includes(".tmp-") ||
      !entry.name.startsWith(`${repoName}-`)
    ) {
      continue;
    }

    await rm(join(ownerCacheDir, entry.name), { recursive: true, force: true });
  }
}

async function runGit(args: string[], failurePrefix: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `${failurePrefix} with exit code ${exitCode}.`);
  }

  return new Response(proc.stdout).text();
}
