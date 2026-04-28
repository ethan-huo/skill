import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  installLocalProjectSkills,
  linkClaudeSkillsIfAvailable,
  selectRepoSkills,
} from "./add-skills";
import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, upsertInstalledSkills } from "./install";
import {
  getClaudeSkillRoot,
  getInstallRoot,
  getProjectClaudeRoot,
  getSourceInstallRoot,
} from "./paths";
import { readProjectManifest, writeProjectManifest } from "./project-manifest";
import { parseFavoriteRef, parseRepoRef } from "./repo-ref";
import type { RepoRef, SkillCandidate } from "../types";

export async function installProjectRepoSkills(options: {
  cwd: string;
  repo: RepoRef;
  selectors: string[];
}): Promise<{ installRoot: string; selectedSkills: SkillCandidate[] }> {
  const { cloneDir, selectedSkills } = await selectRepoSkills({
    repo: options.repo,
    selectors: options.selectors,
  });
  const { installRoot } = await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });

  return { installRoot, selectedSkills };
}

export async function restoreProjectSkills(cwd: string): Promise<{
  restored: string[];
  missing: string[];
}> {
  const manifest = await readProjectManifest(cwd);
  const groups = groupManifestSkills(manifest.skills);
  const restored: string[] = [];
  const missing: string[] = [];
  const nextManifestSkills: string[] = [];

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
    const installRoot = getInstallRoot("local", cwd, repo);
    await upsertInstalledSkills(cloneDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, installRoot, selectedSkills);
    await linkProjectClaudeSkillsIfAvailable(cwd, repo, sourceRoot, selectedSkills);

    for (const skill of selectedSkills) {
      const skillId = `${group.owner}/${group.repo}/${skill.relativeDir}`;
      restored.push(skillId);
      nextManifestSkills.push(skillId);
    }
  }

  if (missing.length > 0) {
    await writeProjectManifest(cwd, { skills: nextManifestSkills });
  }

  return { restored: restored.sort(), missing: missing.sort() };
}

export async function listProjectManifestRepoRoots(cwd: string): Promise<Set<string>> {
  const manifest = await readProjectManifest(cwd);
  const roots = new Set<string>();

  for (const skillId of manifest.skills) {
    const favorite = parseFavoriteRef(skillId);
    if (!favorite.skill) {
      continue;
    }

    roots.add(
      getInstallRoot("local", cwd, {
        owner: favorite.owner,
        repo: favorite.repo,
        cloneUrl: `https://github.com/${favorite.owner}/${favorite.repo}.git`,
        display: `${favorite.owner}/${favorite.repo}`,
      }),
    );
  }

  return roots;
}

export async function syncProjectSkillLinks(options: {
  cwd: string;
  repo: RepoRef;
  sourceRoot: string;
  installedIds: string[];
  updated: string[];
  removed: string[];
}): Promise<void> {
  const { cwd, repo, sourceRoot, installedIds, updated, removed } = options;
  const selectedSkills = toProjectCandidates(installedIds, updated);

  if (selectedSkills.length > 0) {
    await linkInstalledSkills(sourceRoot, getInstallRoot("local", cwd, repo), selectedSkills);
    await linkProjectClaudeSkillsIfAvailable(cwd, repo, sourceRoot, selectedSkills);
  }

  for (const skill of removed) {
    await rm(join(getInstallRoot("local", cwd, repo), skill), { force: true, recursive: true });
    await rm(getClaudeSkillRoot(getProjectClaudeRoot(cwd), repo, skill), {
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
  await writeProjectManifest(cwd, {
    skills: manifest.skills.filter((skill) => !missing.has(skill)),
  });
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
  await rm(join(getInstallRoot("local", cwd, repo), skill), { force: true, recursive: true });
  await rm(getClaudeSkillRoot(getProjectClaudeRoot(cwd), repo, skill), {
    force: true,
    recursive: true,
  });
  await rm(join(getSourceInstallRoot(repo), skill), { force: true, recursive: true });
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
