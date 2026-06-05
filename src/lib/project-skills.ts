import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { installLocalProjectSkills, type RepoInstallResult, selectRepoSkills } from "./add-skills";
import { linkClaudeSkillsIfAvailable } from "./claude-skills";
import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, removeVisibleRepoSkills, upsertInstalledSkills } from "./install";
import {
  getClaudeSkillRoot,
  getLegacyVisibleSkillDirName,
  getLegacyVisibleSkillRoot,
  getSkillsBaseDir,
  getProjectClaudeRoot,
  getSourceInstallRoot,
  getVisibleSkillRoot,
} from "./paths";
import {
  addProjectManifestMap,
  getProjectManifestMapRepos,
  getProjectManifestSkillIds,
  readProjectManifest,
  removeProjectManifestSkillIds,
  writeProjectManifest,
} from "./project-manifest";
import { parseFavoriteRef, parseRepoRef } from "./repo-ref";
import { writeProjectSkillMap, writeProjectSkillMapFromClone } from "./skill-map";
import type { RepoRef, SkillCandidate } from "../types";

export async function installProjectRepoSkills(options: {
  cwd: string;
  repo: RepoRef;
  selectors: string[];
}): Promise<RepoInstallResult> {
  const { cloneDir, selectedSkills, selectedMode } = await selectRepoSkills({
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
    await addProjectManifestMap(options.cwd, `${options.repo.owner}/${options.repo.repo}`);
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
  await addProjectManifestMap(options.cwd, `${options.repo.owner}/${options.repo.repo}`);
  return result;
}

export async function restoreProjectSkills(cwd: string): Promise<{
  restored: string[];
  missing: string[];
}> {
  const manifest = await readProjectManifest(cwd);
  const groups = groupManifestSkills(getProjectManifestSkillIds(manifest));
  const restored: string[] = [];
  const missing: string[] = [];
  let manifestWritten = false;

  for (const group of groups.values()) {
    const repo = parseRepoRef(`${group.owner}/${group.repo}`);
    const cloneDir = await shallowCloneRepo(repo);
    const latestSkills = await discoverSkills(cloneDir);
    const wanted = new Set(group.skills);
    const selectedSkills = latestSkills.filter((skill) => wanted.has(skill.relativeDir));
    const selectedIds = new Set(selectedSkills.map((skill) => skill.relativeDir));

    for (const skill of group.skills) {
      if (!selectedIds.has(skill)) {
        const skillId = `${group.owner}/${group.repo}/${skill}`;
        missing.push(skillId);
        await removeProjectSkill(repo, cwd, skill);
      }
    }

    if (selectedSkills.length === 0) {
      continue;
    }

    const sourceRoot = getSourceInstallRoot(repo);
    const installRoot = getSkillsBaseDir("local", cwd);
    await upsertInstalledSkills(cloneDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, installRoot, repo, selectedSkills);
    await linkProjectClaudeSkillsIfAvailable(cwd, repo, sourceRoot, selectedSkills);

    for (const skill of selectedSkills) {
      const skillId = `${group.owner}/${group.repo}/${skill.relativeDir}`;
      restored.push(skillId);
    }
  }

  if (missing.length > 0) {
    await writeProjectManifest(cwd, removeProjectManifestSkillIds(manifest, missing));
    manifestWritten = true;
  }

  for (const repoId of getProjectManifestMapRepos(manifest)) {
    const repo = parseRepoRef(repoId);
    const cloneDir = await shallowCloneRepo(repo);
    const result = await writeProjectSkillMap({ cloneDir, cwd, repo });
    restored.push(`${repoId} (map: ${result.mappedSkills.length} skills)`);
  }

  if (!manifestWritten && hasProjectManifest(cwd)) {
    await writeProjectManifest(cwd, manifest);
  }

  return { restored: restored.sort(), missing: missing.sort() };
}

export async function syncProjectMaps(cwd: string): Promise<
  {
    repoId: string;
    mappedSkills: number;
  }[]
> {
  if (!hasProjectManifest(cwd)) {
    return [];
  }

  const manifest = await readProjectManifest(cwd);
  const syncedMaps: { repoId: string; mappedSkills: number }[] = [];

  for (const repoId of getProjectManifestMapRepos(manifest)) {
    const repo = parseRepoRef(repoId);
    const cloneDir = await shallowCloneRepo(repo);
    const result = await writeProjectSkillMap({ cloneDir, cwd, repo });
    syncedMaps.push({ repoId, mappedSkills: result.mappedSkills.length });
  }

  if (syncedMaps.length > 0) {
    await writeProjectManifest(cwd, manifest);
  }

  return syncedMaps.sort((left, right) => left.repoId.localeCompare(right.repoId));
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
    await linkProjectClaudeSkillsIfAvailable(cwd, repo, sourceRoot, selectedSkills);
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
    await rm(getClaudeSkillRoot(getProjectClaudeRoot(cwd), repo, skill), {
      force: true,
      recursive: true,
    });
    await rm(join(getProjectClaudeRoot(cwd), "skills", getLegacyVisibleSkillDirName(repo, skill)), {
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
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, removeProjectManifestSkillIds(manifest, [...missing]));
}

export function hasProjectManifest(cwd: string): boolean {
  return existsSync(`${cwd}/.agents/skills/manifest.json`);
}

function groupManifestSkills(
  skillIds: string[],
): Map<string, { owner: string; repo: string; skills: string[] }> {
  const groups = new Map<string, { owner: string; repo: string; skills: string[] }>();

  for (const skillId of skillIds) {
    const favorite = parseFavoriteRef(skillId);
    if (!favorite.skill) {
      throw new Error(`Project skill manifest entry must use owner/repo/skill: ${skillId}`);
    }

    const key = `${favorite.owner}/${favorite.repo}`;
    const current = groups.get(key) ?? {
      owner: favorite.owner,
      repo: favorite.repo,
      skills: [],
    };
    current.skills.push(favorite.skill);
    groups.set(key, current);
  }

  return groups;
}

async function removeProjectSkill(repo: RepoRef, cwd: string, skill: string): Promise<void> {
  await rm(getVisibleSkillRoot("local", cwd, repo, skill), { force: true, recursive: true });
  await rm(getLegacyVisibleSkillRoot("local", cwd, repo, skill), {
    force: true,
    recursive: true,
  });
  await rm(getClaudeSkillRoot(getProjectClaudeRoot(cwd), repo, skill), {
    force: true,
    recursive: true,
  });
  await rm(join(getProjectClaudeRoot(cwd), "skills", getLegacyVisibleSkillDirName(repo, skill)), {
    force: true,
    recursive: true,
  });
  await rm(join(getSourceInstallRoot(repo), skill), { force: true, recursive: true });
}

async function removeProjectRepoSkillAliases(cwd: string, repo: RepoRef): Promise<void> {
  await removeVisibleRepoSkills(getSkillsBaseDir("local", cwd), repo);
  await removeVisibleRepoSkills(join(getProjectClaudeRoot(cwd), "skills"), repo);
}

async function linkProjectClaudeSkillsIfAvailable(
  cwd: string,
  repo: RepoRef,
  sourceRoot: string,
  selectedSkills: SkillCandidate[],
): Promise<void> {
  await linkClaudeSkillsIfAvailable({
    claudeRoot: getProjectClaudeRoot(cwd),
    repo,
    selectedSkills,
    sourceRoot,
  });
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
