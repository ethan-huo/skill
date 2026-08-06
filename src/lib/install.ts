import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { discoverSkills } from "./discover-skills";
import {
  getLegacyVisibleSkillDirName,
  getSourceScopedVisibleSkillDirName,
  getVisibleMapDirName,
  getVisibleRepoDirPrefix,
  getVisibleSkillDirName,
} from "./paths";
import { normalizeSkillFrontmatterFile } from "./skill-frontmatter-repair";
import type { RepoRef, SkillCandidate } from "../types";

export async function replaceInstalledSkills(
  repoDir: string,
  targetRoot: string,
  repo: RepoRef,
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
      await copySkillDirectory(sourceDir, destDir);
      await normalizeSkillFrontmatterFile(
        join(destDir, "SKILL.md"),
        getVisibleSkillDirName(repo, skill.relativeDir),
      );
    }

    await rm(targetRoot, { force: true, recursive: true });
    await rename(stagingRoot, targetRoot);
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    throw error;
  }
}

export async function upsertInstalledSkills(
  repoDir: string,
  targetRoot: string,
  repo: RepoRef,
  selectedSkills: SkillCandidate[],
): Promise<void> {
  await mkdir(targetRoot, { recursive: true });

  for (const skill of selectedSkills) {
    const sourceDir = join(repoDir, skill.sourceDir);
    const destDir = join(targetRoot, skill.relativeDir);
    await mkdir(dirname(destDir), { recursive: true });
    await rm(destDir, { force: true, recursive: true });
    await copySkillDirectory(sourceDir, destDir);
    await normalizeSkillFrontmatterFile(
      join(destDir, "SKILL.md"),
      getVisibleSkillDirName(repo, skill.relativeDir),
    );
  }
}

async function copySkillDirectory(sourceDir: string, destDir: string): Promise<void> {
  await cp(sourceDir, destDir, {
    recursive: true,
    // Root-level skills use the checkout itself as their bundle; cache metadata is never skill content.
    filter: (source) => source !== join(sourceDir, ".git"),
  });
}

export async function linkInstalledSkills(
  sourceRoot: string,
  targetRoot: string,
  repo: RepoRef,
  selectedSkills: SkillCandidate[],
): Promise<void> {
  await mkdir(targetRoot, { recursive: true });

  for (const skill of selectedSkills) {
    const sourceDir = join(sourceRoot, skill.relativeDir);
    const destDir = join(targetRoot, getVisibleSkillDirName(repo, skill.relativeDir));
    const sourceScopedDestDir = join(
      targetRoot,
      getSourceScopedVisibleSkillDirName(repo, skill.relativeDir),
    );
    const legacyDestDir = join(targetRoot, getLegacyVisibleSkillDirName(repo, skill.relativeDir));
    const bareDestDir = join(targetRoot, normalizeSkillPathForLegacyBareAlias(skill.relativeDir));
    await assertLinkCanBeReplaced(destDir, sourceDir);
    await rm(sourceScopedDestDir, { force: true, recursive: true });
    await rm(legacyDestDir, { force: true, recursive: true });
    await removeLegacyLink(bareDestDir);
    await rm(destDir, { force: true, recursive: true });
    await symlink(sourceDir, destDir, "dir");
  }
}

export async function linkSkillDirectories(
  targetRoot: string,
  repo: RepoRef,
  skills: Array<{ relativeDir: string; sourcePath: string }>,
): Promise<void> {
  await mkdir(targetRoot, { recursive: true });

  for (const skill of skills) {
    const destDir = join(targetRoot, getVisibleSkillDirName(repo, skill.relativeDir));
    const sourceScopedDestDir = join(
      targetRoot,
      getSourceScopedVisibleSkillDirName(repo, skill.relativeDir),
    );
    const legacyDestDir = join(targetRoot, getLegacyVisibleSkillDirName(repo, skill.relativeDir));
    const bareDestDir = join(targetRoot, normalizeSkillPathForLegacyBareAlias(skill.relativeDir));
    await assertLinkCanBeReplaced(destDir, skill.sourcePath);
    await rm(sourceScopedDestDir, { force: true, recursive: true });
    await rm(legacyDestDir, { force: true, recursive: true });
    await removeLegacyLink(bareDestDir);
    await rm(destDir, { force: true, recursive: true });
    await symlink(skill.sourcePath, destDir, "dir");
  }
}

async function removeLegacyLink(path: string): Promise<void> {
  const entry = await lstat(path).catch(() => null);
  if (entry?.isSymbolicLink()) {
    await rm(path);
  }
}

async function assertLinkCanBeReplaced(path: string, sourcePath: string): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing === null) {
    return;
  }
  const target = existing.isSymbolicLink() ? await readlink(path) : null;
  if (target === sourcePath) {
    return;
  }
  throw new Error(`Skill folder is already occupied: ${path}. Remove it before installing.`);
}

export async function removeVisibleRepoSkills(targetRoot: string, repo: RepoRef): Promise<boolean> {
  const entries = await readdir(targetRoot, { withFileTypes: true }).catch(() => []);
  const visibleRepo = getVisibleRepoDirPrefix(repo);
  const legacyPrefix = `${repo.owner}.${repo.repo}.`;
  let removed = false;

  for (const entry of entries) {
    if (!isVisibleRepoEntry(entry.name, repo, visibleRepo, legacyPrefix)) {
      continue;
    }

    await rm(join(targetRoot, entry.name), { recursive: true, force: true });
    removed = true;
  }

  return removed;
}

function isVisibleRepoEntry(
  name: string,
  repo: RepoRef,
  visibleRepo: string,
  legacyPrefix: string,
): boolean {
  if (name.startsWith(legacyPrefix)) {
    return true;
  }

  if (name === getVisibleMapDirName(repo)) {
    return true;
  }

  return name.endsWith(`.${visibleRepo}`);
}

export async function removeInstalledSkill(targetRoot: string): Promise<boolean> {
  const entry = await lstat(targetRoot).catch(() => null);
  if (!entry) {
    return false;
  }

  await rm(targetRoot, { recursive: true, force: true });
  return true;
}

export async function removeVisibleSkillAliases(
  targetRoot: string,
  repo: RepoRef,
  skill: string,
): Promise<boolean> {
  const paths = [
    join(targetRoot, getVisibleSkillDirName(repo, skill)),
    join(targetRoot, normalizeSkillPathForLegacyBareAlias(skill)),
    join(targetRoot, getSourceScopedVisibleSkillDirName(repo, skill)),
    join(targetRoot, getLegacyVisibleSkillDirName(repo, skill)),
  ];
  let removed = false;
  for (const path of paths) {
    removed = (await removeInstalledSkill(path)) || removed;
  }
  return removed;
}

function normalizeSkillPathForLegacyBareAlias(skill: string): string {
  return skill
    .split("/")
    .map((segment) => segment.toLowerCase())
    .join(".");
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
