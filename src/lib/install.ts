import { cp, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { SkillCandidate } from "../types";

export async function replaceInstalledSkills(
  repoDir: string,
  targetRoot: string,
  selectedSkills: SkillCandidate[],
): Promise<void> {
  const parentDir = dirname(targetRoot);
  await mkdir(parentDir, { recursive: true });

  // Stage beside the destination so the final rename stays on the same filesystem.
  const stagingRoot = await mkdtemp(`${targetRoot}.tmp-`);

  try {
    for (const skill of selectedSkills) {
      const sourceDir = join(repoDir, skill.sourceDir);
      const destDir = join(stagingRoot, skill.relativeDir);
      await mkdir(dirname(destDir), { recursive: true });
      await cp(sourceDir, destDir, { recursive: true });
    }

    await rm(targetRoot, { force: true, recursive: true });
    await rename(stagingRoot, targetRoot);
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    throw error;
  }
}

export async function removeInstalledRepo(targetRoot: string): Promise<boolean> {
  const directory = await stat(targetRoot).catch(() => null);
  if (!directory?.isDirectory()) {
    return false;
  }

  await rm(targetRoot, { recursive: true, force: true });
  return true;
}

export async function pruneEmptyParents(startDir: string, stopDir: string): Promise<void> {
  let currentDir = startDir;

  while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
    const entries = await readdir(currentDir).catch(() => null);
    if (entries === null || entries.length > 0) {
      return;
    }

    await rm(currentDir, { recursive: true, force: true });
    currentDir = dirname(currentDir);
  }
}
