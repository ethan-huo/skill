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
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { discoverSkills, fingerprintSkillDirectory } from "./discover-skills";
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
  for (const skill of selectedSkills) {
    const sourceDir = join(repoDir, skill.sourceDir);
    const candidateDir = await mkdtemp(join(tmpdir(), "skill-materialized-"));

    try {
      await copySkillDirectory(sourceDir, candidateDir);
      await normalizeSkillFrontmatterFile(
        join(candidateDir, "SKILL.md"),
        getVisibleSkillDirName(repo, skill.relativeDir),
      );

      const revision = await fingerprintSkillDirectory(candidateDir);
      const snapshotParent = join(targetRoot, ".snapshots", skill.relativeDir);
      const snapshotDir = join(snapshotParent, revision);
      if (!(await stat(snapshotDir).catch(() => null))?.isDirectory()) {
        await publishSnapshot(candidateDir, snapshotParent, snapshotDir);
      }

      const currentLink = join(targetRoot, ".current", skill.relativeDir);
      await replaceSymlinkAtomically(currentLink, snapshotDir, join(targetRoot, ".snapshots"));
    } finally {
      await rm(candidateDir, { force: true, recursive: true });
    }
  }
}

async function publishSnapshot(
  candidateDir: string,
  snapshotParent: string,
  snapshotDir: string,
): Promise<void> {
  await mkdir(snapshotParent, { recursive: true });
  const stagingDir = await mkdtemp(join(snapshotParent, ".tmp-"));

  try {
    await cp(candidateDir, stagingDir, { recursive: true });
    await rename(stagingDir, snapshotDir);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    if ((await stat(snapshotDir).catch(() => null))?.isDirectory()) {
      return;
    }
    throw error;
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
    const sourceDir = await resolveInstalledSkillSource(sourceRoot, skill.relativeDir);
    const destDir = join(targetRoot, getVisibleSkillDirName(repo, skill.relativeDir));
    const sourceScopedDestDir = join(
      targetRoot,
      getSourceScopedVisibleSkillDirName(repo, skill.relativeDir),
    );
    const legacyDestDir = join(targetRoot, getLegacyVisibleSkillDirName(repo, skill.relativeDir));
    const bareDestDir = join(targetRoot, normalizeSkillPathForLegacyBareAlias(skill.relativeDir));
    await assertLinkCanBeReplaced(destDir, sourceRoot);
    await rm(sourceScopedDestDir, { force: true, recursive: true });
    await rm(legacyDestDir, { force: true, recursive: true });
    await removeLegacyLink(bareDestDir);
    await replaceSymlinkAtomically(destDir, sourceDir, sourceRoot);
  }
}

export async function resolveInstalledSkillSource(
  sourceRoot: string,
  skill: string,
): Promise<string> {
  const currentLink = join(sourceRoot, ".current", skill);
  const current = await lstat(currentLink).catch(() => null);
  if (current?.isSymbolicLink()) {
    const target = await readlink(currentLink);
    return isAbsolute(target) ? target : resolve(dirname(currentLink), target);
  }

  return join(sourceRoot, skill);
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
    await assertLinkCanBeReplaced(destDir, dirname(skill.sourcePath));
    await rm(sourceScopedDestDir, { force: true, recursive: true });
    await rm(legacyDestDir, { force: true, recursive: true });
    await removeLegacyLink(bareDestDir);
    await replaceSymlinkAtomically(destDir, skill.sourcePath, dirname(skill.sourcePath));
  }
}

async function removeLegacyLink(path: string): Promise<void> {
  const entry = await lstat(path).catch(() => null);
  if (entry?.isSymbolicLink()) {
    await rm(path);
  }
}

async function assertLinkCanBeReplaced(path: string, allowedRoot: string): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing === null) {
    return;
  }
  const target = existing.isSymbolicLink() ? await readlink(path) : null;
  const resolvedTarget = target === null ? null : resolve(dirname(path), target);
  if (resolvedTarget !== null && isPathInside(resolvedTarget, allowedRoot)) {
    return;
  }
  throw new Error(`Skill folder is already occupied: ${path}. Remove it before installing.`);
}

async function replaceSymlinkAtomically(
  path: string,
  target: string,
  allowedRoot: string,
): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing !== null) {
    if (!existing.isSymbolicLink()) {
      throw new Error(`Skill folder is already occupied: ${path}. Remove it before installing.`);
    }
    const existingTarget = resolve(dirname(path), await readlink(path));
    if (existingTarget === target) {
      return;
    }
    if (!isPathInside(existingTarget, allowedRoot)) {
      throw new Error(`Skill folder is already occupied: ${path}. Remove it before installing.`);
    }
  }

  await mkdir(dirname(path), { recursive: true });
  const temporaryLink = join(dirname(path), `.${basename(path)}.tmp-${crypto.randomUUID()}`);
  try {
    await symlink(target, temporaryLink, "dir");
    await rename(temporaryLink, path);
  } catch (error) {
    await rm(temporaryLink, { force: true });
    throw error;
  }
}

function isPathInside(path: string, root: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(path));
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
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
