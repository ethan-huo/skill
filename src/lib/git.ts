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
  // Clone into a private staging dir and publish it with one rename. The cache
  // dir is shared by every concurrent caller (parallel worktrees, agents), so
  // never delete it up front: another caller may have just published it.
  const stagingDir = `${cloneDir}.tmp-${crypto.randomUUID()}`;

  try {
    await runGit(["clone", "--depth", "1", repo.cloneUrl, stagingDir], "git clone failed");
    await publishClone(stagingDir, cloneDir);
    await pruneStaleRepoClones(ownerCacheDir, repo.repo, `${repo.repo}-${headHash}`);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    throw error;
  }

  return cloneDir;
}

// rename() onto an existing directory fails with EEXIST or ENOTEMPTY depending
// on the platform. A usable checkout already there means another caller won the
// race; anything else is a corrupt leftover we replace once.
async function publishClone(stagingDir: string, cloneDir: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await rename(stagingDir, cloneDir);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
      if (await hasGitCheckout(cloneDir)) {
        await rm(stagingDir, { recursive: true, force: true });
        return;
      }
      if (attempt === 0) await rm(cloneDir, { recursive: true, force: true });
      else throw error;
    }
  }
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
  const checkoutDir = await stat(directory).catch(() => null);
  if (!checkoutDir?.isDirectory()) {
    return false;
  }

  try {
    const isWorkTree = await runGit(
      ["-C", directory, "rev-parse", "--is-inside-work-tree"],
      "git checkout validation failed",
    );
    if (isWorkTree.trim() !== "true") {
      return false;
    }

    await runGit(
      ["-C", directory, "rev-parse", "--verify", "HEAD"],
      "git checkout validation failed",
    );
    return true;
  } catch {
    // A previous clone can leave a directory that looks cacheable but has no
    // usable HEAD. Treat it as missing so the caller replaces it atomically.
    return false;
  }
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
