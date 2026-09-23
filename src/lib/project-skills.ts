import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  getInstalledMapDescription,
  installLocalProjectSkills,
  type RepoInstallResult,
  selectRepoSkills,
} from "./add-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, removeVisibleRepoSkills, removeVisibleSkillAliases } from "./install";
import { seedGlobalManifestFromVisibleLinks } from "./installed-skills";
import { getSkillsBaseDir, getSourceInstallRoot, hasProjectScope } from "./paths";
import {
  addScopeManifestMap,
  getProjectManifestMapRepos,
  getProjectManifestMaps,
  getProjectManifestSkills,
  readScopeManifest,
  removeProjectManifestSkillIds,
  resolveProjectManifestSkillSources,
  writeScopeManifest,
} from "./project-manifest";
import type { ManifestSkill } from "./project-manifest";
import { parseRepoRef } from "./repo-ref";
import { formatManifestSkillId } from "./skill-ref";
import { updateSourceRepo } from "./source-skills";
import { resolveMapDescription } from "./map-description";
import { writeProjectSkillMap } from "./skill-map";
import type { RepoRef, SkillCandidate, SkillSelector } from "../types";

export async function installProjectRepoSkills(options: {
  cwd: string;
  repo: RepoRef;
  selectors: SkillSelector[];
  description?: string;
}): Promise<RepoInstallResult> {
  const { cloneDir, selectedSkills, selectedMode } = await selectRepoSkills({
    cwd: options.cwd,
    repo: options.repo,
    selectors: options.selectors,
    global: false,
  });
  if (selectedMode === "map") {
    const description = await resolveMapDescription({
      repo: options.repo,
      explicit: options.description,
      stored: await getInstalledMapDescription(options.cwd, options.repo),
    });
    await removeProjectRepoSkillAliases(options.cwd, options.repo);
    const result = await writeProjectSkillMap({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
      description,
    });
    await addScopeManifestMap(
      "local",
      options.cwd,
      `${options.repo.owner}/${options.repo.repo}`,
      description,
    );
    return { kind: "map", installRoot: result.installRoot, mappedSkills: result.mappedSkills };
  }

  const result = await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });

  return { kind: "skills", ...result };
}

export async function installProjectRepoMap(options: {
  cwd: string;
  repo: RepoRef;
  description?: string;
}): Promise<{ installRoot: string; mappedSkills: SkillCandidate[] }> {
  // Resolve the description before cloning so a missing one fails fast.
  const description = await resolveMapDescription({
    repo: options.repo,
    explicit: options.description,
    stored: await getInstalledMapDescription(options.cwd, options.repo),
  });
  const cloneDir = await shallowCloneRepo(options.repo);
  await removeProjectRepoSkillAliases(options.cwd, options.repo);
  const result = await writeProjectSkillMap({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    description,
  });
  await addScopeManifestMap(
    "local",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    description,
  );
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
  const missingManifestIds: string[] = [];
  let nextManifest = manifest;
  for (const group of groups.values()) {
    const repo = parseRepoRef(`${group.owner}/${group.repo}`);
    const cloneDir = await shallowCloneRepo(repo);
    const sourceRoot = getSourceInstallRoot(repo);
    const sourceUpdate = await updateSourceRepo({
      cloneDir,
      repo,
      sourceRoot,
      installedSkills: group.skills,
    });
    const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills);

    for (const skill of sourceUpdate.diff.removed) {
      const skillId = `${group.owner}/${group.repo}/${skill}`;
      const manifestSkill = group.skills.find((candidate) => candidate.id === skill);
      missing.push(
        manifestSkill
          ? formatManifestSkillId(`${group.owner}/${group.repo}`, manifestSkill)
          : skillId,
      );
      missingManifestIds.push(skillId);
      await removeProjectSkill(repo, cwd, skill);
    }

    if (selectedSkills.length === 0) {
      continue;
    }

    const installRoot = getSkillsBaseDir("local", cwd);
    await linkInstalledSkills(sourceRoot, installRoot, repo, selectedSkills);
    nextManifest = resolveProjectManifestSkillSources(
      nextManifest,
      `${group.owner}/${group.repo}`,
      sourceUpdate.resolvedSkills,
    );

    for (const skill of sourceUpdate.resolvedSkills) {
      restored.push(formatManifestSkillId(`${group.owner}/${group.repo}`, skill));
    }
  }

  if (missingManifestIds.length > 0) {
    nextManifest = removeProjectManifestSkillIds(nextManifest, missingManifestIds);
  }

  for (const item of getProjectManifestMaps(manifest)) {
    const repo = parseRepoRef(item.repo);
    const description = await resolveMapDescription({ repo, stored: item.description });
    const cloneDir = await shallowCloneRepo(repo);
    const result = await writeProjectSkillMap({ cloneDir, cwd, repo, description });
    restored.push(`${item.repo} (map: ${result.mappedSkills.length} skills)`);
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
  const missingManifestIds: string[] = [];
  let nextManifest = manifest;

  for (const group of groups.values()) {
    const repo = parseRepoRef(`${group.owner}/${group.repo}`);
    const cloneDir = await shallowCloneRepo(repo);
    const sourceRoot = getSourceInstallRoot(repo);
    const sourceUpdate = await updateSourceRepo({
      cloneDir,
      repo,
      sourceRoot,
      installedSkills: group.skills,
    });
    const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills);

    for (const skill of sourceUpdate.diff.removed) {
      const skillId = `${group.owner}/${group.repo}/${skill}`;
      const manifestSkill = group.skills.find((candidate) => candidate.id === skill);
      missing.push(
        manifestSkill
          ? formatManifestSkillId(`${group.owner}/${group.repo}`, manifestSkill)
          : skillId,
      );
      missingManifestIds.push(skillId);
      await removeVisibleSkillAliases(getSkillsBaseDir("global", cwd), repo, skill);
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

    for (const skill of sourceUpdate.resolvedSkills) {
      restored.push(formatManifestSkillId(`${group.owner}/${group.repo}`, skill));
    }
  }

  if (missingManifestIds.length > 0) {
    nextManifest = removeProjectManifestSkillIds(nextManifest, missingManifestIds);
    await writeScopeManifest("global", cwd, nextManifest);
  } else if (hasScopeManifest("global", cwd)) {
    await writeScopeManifest("global", cwd, nextManifest);
  }

  return { restored: restored.sort(), missing: missing.sort() };
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
  const description = await resolveMapDescription({
    repo,
    stored: await getInstalledMapDescription(cwd, repo),
  });
  const cloneDir = await shallowCloneRepo(repo);
  const result = await writeProjectSkillMap({ cloneDir, cwd, repo, description });
  return { repoId, mappedSkills: result.mappedSkills.length };
}

export async function syncProjectMapFromClone(options: {
  cwd: string;
  repo: RepoRef;
  cloneDir: string;
  description: string;
}): Promise<{ repoId: string; mappedSkills: number }> {
  const result = await writeProjectSkillMap({
    cloneDir: options.cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    description: options.description,
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
  }

  await removeProjectSkillLinks(cwd, repo, removed);
}

export async function removeProjectSkillLinks(
  cwd: string,
  repo: RepoRef,
  removed: string[],
): Promise<void> {
  for (const skill of removed) {
    await removeVisibleSkillAliases(getSkillsBaseDir("local", cwd), repo, skill);
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
  if (scope === "local" && !hasProjectScope(cwd)) {
    return false;
  }
  return existsSync(join(getSkillsBaseDir(scope, cwd), "manifest.json"));
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

async function removeProjectSkill(repo: RepoRef, cwd: string, skill: string): Promise<void> {
  await removeVisibleSkillAliases(getSkillsBaseDir("local", cwd), repo, skill);
}

async function removeProjectRepoSkillAliases(cwd: string, repo: RepoRef): Promise<void> {
  const repoId = `${repo.owner}/${repo.repo}`;
  const manifestSkills = getProjectManifestSkills(await readScopeManifest("local", cwd)).filter(
    (skill) => skill.repo === repoId,
  );
  const skillsRoot = getSkillsBaseDir("local", cwd);
  for (const skill of manifestSkills) {
    await removeVisibleSkillAliases(skillsRoot, repo, skill.id);
  }
  await removeVisibleRepoSkills(skillsRoot, repo);
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
