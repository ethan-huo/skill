import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { linkClaudeSkillsIfAvailable, selectRepoSkills } from "./add-skills";
import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, upsertInstalledSkills } from "./install";
import { getInstallRoot, getProjectClaudeRoot, getSourceInstallRoot } from "./paths";
import {
  addProjectManifestSkills,
  readProjectManifest,
  writeProjectManifest,
} from "./project-manifest";
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
  const sourceRoot = getSourceInstallRoot(options.repo);
  const installRoot = getInstallRoot("local", options.cwd, options.repo);

  await upsertInstalledSkills(cloneDir, sourceRoot, selectedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, selectedSkills);
  await linkProjectClaudeSkillsIfAvailable(options.cwd, options.repo, sourceRoot, selectedSkills);
  await addProjectManifestSkills(
    options.cwd,
    selectedSkills.map(
      (skill) => `${options.repo.owner}/${options.repo.repo}/${skill.relativeDir}`,
    ),
  );

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
  await rm(join(getProjectClaudeRoot(cwd), "skills", repo.owner, repo.repo, skill), {
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
