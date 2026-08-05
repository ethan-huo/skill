import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { installLocalProjectSkills, type RepoInstallResult, selectRepoSkills } from "./add-skills";
import { ensureGlobalClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "./claude-skills";
import { shallowCloneRepo } from "./git";
import { restoreFilesystemSkills } from "./filesystem-skills";
import { linkInstalledSkills, removeVisibleRepoSkills } from "./install";
import { listInstalledSkills } from "./installed-skills";
import {
  getLegacyVisibleSkillRoot,
  getSkillsBaseDir,
  getSourceInstallRoot,
  getVisibleSkillRoot,
} from "./paths";
import {
  addScopeManifestSkills,
  addScopeManifestMap,
  getProjectManifestMapRepos,
  getProjectManifestSkills,
  readScopeManifest,
  removeProjectManifestSkillIds,
  resolveProjectManifestSkillSources,
  writeScopeManifest,
} from "./project-manifest";
import type { ManifestSkill } from "./project-manifest";
import { parseRepoRef } from "./repo-ref";
import { updateSourceRepo } from "./source-skills";
import { writeProjectSkillMap, writeProjectSkillMapFromClone } from "./skill-map";
import type { InstalledSkill, RepoRef, SkillCandidate, SkillSelector } from "../types";

export async function installProjectRepoSkills(options: {
  cwd: string;
  repo: RepoRef;
  selectors: SkillSelector[];
}): Promise<RepoInstallResult> {
  const { cloneDir, selectedSkills, selectedMode } = await selectRepoSkills({
    cwd: options.cwd,
    repo: options.repo,
    selectors: options.selectors,
    global: false,
  });
  if (selectedMode === "map") {
    await removeProjectRepoSkillAliases(options.cwd, options.repo);
    const result = await writeProjectSkillMap({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
    });
    await ensureProjectClaudeSkillsLink(options.cwd);
    await addScopeManifestMap("local", options.cwd, `${options.repo.owner}/${options.repo.repo}`);
    return { kind: "map", installRoot: result.installRoot, mappedSkills: result.mappedSkills };
  }

  const { installRoot } = await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });

  return { kind: "skills", installRoot, selectedSkills };
}

export async function installProjectRepoMap(options: {
  cwd: string;
  repo: RepoRef;
}): Promise<{ installRoot: string; mappedSkills: SkillCandidate[] }> {
  const cloneDir = await shallowCloneRepo(options.repo);
  await removeProjectRepoSkillAliases(options.cwd, options.repo);
  const result = await writeProjectSkillMap({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
  });
  await ensureProjectClaudeSkillsLink(options.cwd);
  await addScopeManifestMap("local", options.cwd, `${options.repo.owner}/${options.repo.repo}`);
  return result;
}

export async function restoreProjectSkills(cwd: string): Promise<{
  restored: string[];
  missing: string[];
}> {
  const manifest = await readScopeManifest("local", cwd);
  const groups = groupManifestEntries(getProjectManifestSkills(manifest));
  const restored: string[] = [];
  const missing: string[] = [];
  let nextManifest = manifest;
  await ensureProjectClaudeSkillsLink(cwd);

  for (const group of groups.values()) {
    const repo = parseRepoRef(`${group.owner}/${group.repo}`);
    if (isFilesystemManifestGroup(group.skills)) {
      const result = await restoreFilesystemSkills({
        cwd,
        global: false,
        repo,
        skills: group.skills,
      });
      restored.push(...result.restored);
      missing.push(...result.missing);
      await removeProjectSkillLinks(
        cwd,
        repo,
        result.missing.map((skillId) => skillId.split("/").at(-1)!),
      );
      continue;
    }
    const cloneDir = await shallowCloneRepo(repo);
    const sourceRoot = getSourceInstallRoot(repo);
    const sourceUpdate = await updateSourceRepo({
      cloneDir,
      sourceRoot,
      installedSkills: group.skills,
    });
    const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills);

    for (const skill of sourceUpdate.diff.removed) {
      const skillId = `${group.owner}/${group.repo}/${skill}`;
      missing.push(skillId);
      await removeProjectSkill(repo, cwd, skill);
    }

    if (selectedSkills.length === 0) {
      continue;
    }

    const installRoot = getSkillsBaseDir("local", cwd);
    await linkInstalledSkills(sourceRoot, installRoot, repo, selectedSkills);
    await ensureProjectClaudeSkillsLink(cwd);
    nextManifest = resolveProjectManifestSkillSources(
      nextManifest,
      `${group.owner}/${group.repo}`,
      sourceUpdate.resolvedSkills,
    );

    for (const skill of selectedSkills) {
      const skillId = `${group.owner}/${group.repo}/${skill.relativeDir}`;
      restored.push(skillId);
    }
  }

  if (missing.length > 0) {
    nextManifest = removeProjectManifestSkillIds(nextManifest, missing);
  }

  for (const repoId of getProjectManifestMapRepos(manifest)) {
    const repo = parseRepoRef(repoId);
    const cloneDir = await shallowCloneRepo(repo);
    const result = await writeProjectSkillMap({ cloneDir, cwd, repo });
    await ensureProjectClaudeSkillsLink(cwd);
    restored.push(`${repoId} (map: ${result.mappedSkills.length} skills)`);
  }

  if (hasProjectManifest(cwd)) {
    await writeScopeManifest("local", cwd, nextManifest);
  }

  return { restored: restored.sort(), missing: missing.sort() };
}

export async function restoreGlobalSkills(cwd: string): Promise<{
  restored: string[];
  missing: string[];
}> {
  await seedGlobalManifestFromVisibleLinks(cwd);
  const manifest = await readScopeManifest("global", cwd);
  const groups = groupManifestEntries(getProjectManifestSkills(manifest));
  const restored: string[] = [];
  const missing: string[] = [];
  let nextManifest = manifest;

  await ensureGlobalClaudeSkillsLink(cwd);

  for (const group of groups.values()) {
    const repo = parseRepoRef(`${group.owner}/${group.repo}`);
    if (isFilesystemManifestGroup(group.skills)) {
      const result = await restoreFilesystemSkills({
        cwd,
        global: true,
        repo,
        skills: group.skills,
      });
      restored.push(...result.restored);
      missing.push(...result.missing);
      for (const skillId of result.missing) {
        await rm(getVisibleSkillRoot("global", cwd, repo, skillId.split("/").at(-1)!), {
          force: true,
          recursive: true,
        });
      }
      continue;
    }
    const cloneDir = await shallowCloneRepo(repo);
    const sourceRoot = getSourceInstallRoot(repo);
    const sourceUpdate = await updateSourceRepo({
      cloneDir,
      sourceRoot,
      installedSkills: group.skills,
    });
    const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills);

    for (const skill of sourceUpdate.diff.removed) {
      missing.push(`${group.owner}/${group.repo}/${skill}`);
      await rm(getVisibleSkillRoot("global", cwd, repo, skill), { force: true, recursive: true });
    }

    if (selectedSkills.length === 0) {
      continue;
    }

    await linkInstalledSkills(sourceRoot, getSkillsBaseDir("global", cwd), repo, selectedSkills);
    nextManifest = resolveProjectManifestSkillSources(
      nextManifest,
      `${group.owner}/${group.repo}`,
      sourceUpdate.resolvedSkills,
    );

    for (const skill of selectedSkills) {
      restored.push(`${group.owner}/${group.repo}/${skill.relativeDir}`);
    }
  }

  if (missing.length > 0) {
    nextManifest = removeProjectManifestSkillIds(nextManifest, missing);
    await writeScopeManifest("global", cwd, nextManifest);
  } else if (hasScopeManifest("global", cwd)) {
    await writeScopeManifest("global", cwd, nextManifest);
  }

  return { restored: restored.sort(), missing: missing.sort() };
}

export async function seedGlobalManifestFromVisibleLinks(cwd: string): Promise<boolean> {
  if (hasScopeManifest("global", cwd)) {
    return false;
  }

  const installedSkills = (await listInstalledSkills(cwd)).filter(
    (skill) => skill.scope === "global",
  );

  if (installedSkills.length === 0) {
    return false;
  }

  const grouped = groupManifestSkills(installedSkills);
  for (const group of grouped.values()) {
    await addScopeManifestSkills("global", cwd, `${group.owner}/${group.repo}`, group.skills);
  }
  return true;
}

export async function syncProjectMaps(cwd: string): Promise<
  {
    repoId: string;
    mappedSkills: number;
  }[]
> {
  const repoIds = await listProjectMapRepoIds(cwd);
  if (repoIds.length === 0) {
    return [];
  }

  const syncedMaps: { repoId: string; mappedSkills: number }[] = [];
  for (const repoId of repoIds) {
    syncedMaps.push(await syncProjectMapRepo({ cwd, repoId }));
  }

  // syncProjectMaps used to rewrite the manifest as a no-op touch. Preserve that
  // by delegating to the same single-repo helper above, which already keeps the
  // manifest in sync via writeProjectSkillMap.
  if (syncedMaps.length > 0) {
    const manifest = await readScopeManifest("local", cwd);
    await writeScopeManifest("local", cwd, manifest);
  }

  return syncedMaps.sort((left, right) => left.repoId.localeCompare(right.repoId));
}

export async function listProjectMapRepoIds(cwd: string): Promise<string[]> {
  if (!hasProjectManifest(cwd)) {
    return [];
  }
  const manifest = await readScopeManifest("local", cwd);
  return [...getProjectManifestMapRepos(manifest)].sort((left, right) => left.localeCompare(right));
}

export async function syncProjectMapRepo(options: { cwd: string; repoId: string }): Promise<{
  repoId: string;
  mappedSkills: number;
}> {
  const { cwd, repoId } = options;
  const repo = parseRepoRef(repoId);
  const cloneDir = await shallowCloneRepo(repo);
  const result = await writeProjectSkillMap({ cloneDir, cwd, repo });
  return { repoId, mappedSkills: result.mappedSkills.length };
}

export async function syncProjectMapFromClone(options: {
  cwd: string;
  repo: RepoRef;
  cloneDir: string;
  repoDescription?: string;
}): Promise<{ repoId: string; mappedSkills: number }> {
  const result = await writeProjectSkillMapFromClone({
    cloneDir: options.cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    repoDescription: options.repoDescription ?? "",
  });
  return {
    repoId: `${options.repo.owner}/${options.repo.repo}`,
    mappedSkills: result.mappedSkills.length,
  };
}

export async function syncProjectSkillLinks(options: {
  cwd: string;
  repo: RepoRef;
  sourceRoot: string;
  installedIds?: string[];
  updated: string[];
  removed: string[];
}): Promise<void> {
  const { cwd, repo, sourceRoot, installedIds = [], updated, removed } = options;
  const selectedSkills = toProjectCandidates(installedIds, updated);

  if (selectedSkills.length > 0) {
    await linkInstalledSkills(sourceRoot, getSkillsBaseDir("local", cwd), repo, selectedSkills);
    await ensureProjectClaudeSkillsLink(cwd);
  }

  await removeProjectSkillLinks(cwd, repo, removed);
}

export async function removeProjectSkillLinks(
  cwd: string,
  repo: RepoRef,
  removed: string[],
): Promise<void> {
  for (const skill of removed) {
    await rm(getVisibleSkillRoot("local", cwd, repo, skill), { force: true, recursive: true });
    await rm(getLegacyVisibleSkillRoot("local", cwd, repo, skill), {
      force: true,
      recursive: true,
    });
  }
}

export async function pruneProjectManifestSkills(
  cwd: string,
  missingSkillIds: string[],
): Promise<void> {
  if (missingSkillIds.length === 0) {
    return;
  }

  const missing = new Set(missingSkillIds);
  const manifest = await readScopeManifest("local", cwd);
  await writeScopeManifest("local", cwd, removeProjectManifestSkillIds(manifest, [...missing]));
}

export function hasProjectManifest(cwd: string): boolean {
  return hasScopeManifest("local", cwd);
}

export function hasScopeManifest(scope: "local" | "global", cwd: string): boolean {
  return existsSync(join(getSkillsBaseDir(scope, cwd), "manifest.json"));
}

function groupManifestSkills(
  installedSkills: InstalledSkill[],
): Map<string, { owner: string; repo: string; skills: ManifestSkill[] }> {
  const groups = new Map<string, { owner: string; repo: string; skills: ManifestSkill[] }>();

  for (const skill of installedSkills) {
    const key = `${skill.owner}/${skill.repo}`;
    const current: { owner: string; repo: string; skills: ManifestSkill[] } = groups.get(key) ?? {
      owner: skill.owner,
      repo: skill.repo,
      skills: [],
    };
    current.skills.push({ id: skill.relativeDir, source: skill.source });
    groups.set(key, current);
  }

  return groups;
}

function groupManifestEntries(
  skills: Array<ManifestSkill & { repo: string }>,
): Map<string, { owner: string; repo: string; skills: ManifestSkill[] }> {
  const groups = new Map<string, { owner: string; repo: string; skills: ManifestSkill[] }>();
  for (const skill of skills) {
    const repo = parseRepoRef(skill.repo);
    const key = `${repo.owner}/${repo.repo}`;
    const current = groups.get(key) ?? {
      owner: repo.owner,
      repo: repo.repo,
      skills: [],
    };
    current.skills.push({ id: skill.id, source: skill.source });
    groups.set(key, current);
  }
  return groups;
}

function isFilesystemManifestGroup(skills: ManifestSkill[]): boolean {
  return skills.length > 0 && skills.every((skill) => skill.source && isAbsolute(skill.source));
}

async function removeProjectSkill(repo: RepoRef, cwd: string, skill: string): Promise<void> {
  await rm(getVisibleSkillRoot("local", cwd, repo, skill), { force: true, recursive: true });
  await rm(getLegacyVisibleSkillRoot("local", cwd, repo, skill), {
    force: true,
    recursive: true,
  });
  await rm(join(getSourceInstallRoot(repo), skill), { force: true, recursive: true });
}

async function removeProjectRepoSkillAliases(cwd: string, repo: RepoRef): Promise<void> {
  await removeVisibleRepoSkills(getSkillsBaseDir("local", cwd), repo);
}

function toProjectCandidates(installedIds: string[], updated: string[]): SkillCandidate[] {
  const updatedSet = new Set(updated);
  return installedIds
    .filter((skill) => updatedSet.has(skill))
    .map((skill) => ({
      relativeDir: skill,
      sourceDir: skill,
      displayLabel: skill,
    }));
}

function toCachedCandidates(skills: ManifestSkill[]): SkillCandidate[] {
  return skills.map((skill) => ({
    relativeDir: skill.id,
    sourceDir: skill.id,
    displayLabel: skill.id,
  }));
}
