import { rm } from "node:fs/promises";

import { fmt } from "argc/terminal";

import { ensureProjectClaudeSkillsLink } from "../lib/claude-skills";
import { shallowCloneRepo } from "../lib/git";
import { linkInstalledSkills } from "../lib/install";
import { listInstalledSkills } from "../lib/installed-skills";
import { getSkillsBaseDir, getVisibleSkillRoot } from "../lib/paths";
import {
  hasProjectManifest,
  pruneProjectManifestSkills,
  removeProjectSkillLinks,
  syncProjectMaps,
  syncProjectSkillLinks,
} from "../lib/project-skills";
import { parseRepoRef } from "../lib/repo-ref";
import { listSourceRepos, updateSourceRepo } from "../lib/source-skills";
import { diffSkillSets } from "../lib/update-diff";
import type { RepoRef, SkillCandidate, UpdateInput } from "../types";

export async function runUpdate(args: { input: UpdateInput }): Promise<void> {
  const input = args.input;
  const sourceRepos = await listSourceRepos();

  if (sourceRepos.length === 0) {
    const syncedMaps = input.global ? [] : await syncProjectMaps(process.cwd());
    if (syncedMaps.length === 0) {
      console.log(fmt.info("No shared source skills are cached."));
      return;
    }

    printSyncedMaps(syncedMaps);
    return;
  }

  const installedSkills = await listInstalledSkills(process.cwd());
  const installedByRepo = groupInstalledSkills(installedSkills);

  for (const sourceRepo of sourceRepos) {
    const repoRef = parseRepoRef(`${sourceRepo.owner}/${sourceRepo.repo}`);
    const cloneDir = await shallowCloneRepo(repoRef);
    const diff = await updateSourceRepo({
      cloneDir,
      sourceRoot: sourceRepo.sourceRoot,
    });
    console.log(fmt.info(`${sourceRepo.owner}/${sourceRepo.repo} (source)`));

    await syncVisibleLinks({
      cwd: process.cwd(),
      input,
      repo: repoRef,
      globalInstalledIds: installedByRepo.get(getInstalledGroupKey("global", repoRef)) ?? [],
      projectInstalledIds: installedByRepo.get(getInstalledGroupKey("local", repoRef)) ?? [],
      updated: diff.updated,
      removed: diff.removed,
      sourceRoot: sourceRepo.sourceRoot,
    });

    printDiff(diff);
  }

  if (!input.global) {
    printSyncedMaps(await syncProjectMaps(process.cwd()));
  }
}

function groupInstalledSkills(
  skills: Awaited<ReturnType<typeof listInstalledSkills>>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const skill of skills) {
    const current = grouped.get(getInstalledGroupKey(skill.scope, skill)) ?? [];
    current.push(skill.relativeDir);
    grouped.set(getInstalledGroupKey(skill.scope, skill), current);
  }

  return grouped;
}

function getInstalledGroupKey(scope: "local" | "global", repo: Pick<RepoRef, "owner" | "repo">) {
  return `${scope}:${repo.owner}/${repo.repo}`;
}

export async function syncVisibleLinks(options: {
  cwd: string;
  input: UpdateInput;
  repo: RepoRef;
  globalInstalledIds: string[];
  projectInstalledIds: string[];
  updated: string[];
  removed: string[];
  sourceRoot: string;
}): Promise<void> {
  const {
    cwd,
    input,
    repo,
    globalInstalledIds,
    projectInstalledIds,
    updated,
    removed,
    sourceRoot,
  } = options;

  if (updated.length > 0) {
    await relinkExistingSkills(repo, "global", cwd, sourceRoot, globalInstalledIds, updated);
  }

  for (const skill of removed) {
    await rm(getVisibleSkillRoot("global", cwd, repo, skill), {
      force: true,
      recursive: true,
    });
  }

  if (input.global) {
    return;
  }

  await ensureProjectClaudeSkillsLink(cwd);
  await removeProjectSkillLinks(cwd, repo, removed);

  if (!hasProjectManifest(cwd)) {
    return;
  }

  await syncProjectSkillLinks({
    cwd,
    repo,
    sourceRoot,
    installedIds: projectInstalledIds,
    updated,
    removed: [],
  });
  await pruneProjectManifestSkills(
    cwd,
    removed.map((skill) => `${repo.owner}/${repo.repo}/${skill}`),
  );
}

async function relinkExistingSkills(
  repo: RepoRef,
  scope: "global",
  cwd: string,
  sourceRoot: string,
  installedIds: string[],
  updated: string[],
): Promise<void> {
  const selectedSkills = toInstalledCandidates(installedIds, updated);
  if (selectedSkills.length === 0) {
    return;
  }

  await linkInstalledSkills(sourceRoot, getSkillsBaseDir(scope, cwd), repo, selectedSkills);
}

function toInstalledCandidates(installedIds: string[], updated: string[]): SkillCandidate[] {
  const updatedSet = new Set(updated);
  return installedIds
    .filter((skill) => updatedSet.has(skill))
    .map((skill) => ({
      relativeDir: skill,
      sourceDir: skill,
      displayLabel: skill,
    }));
}

function printDiff(diff: ReturnType<typeof diffSkillSets>): void {
  if (diff.updated.length === 0 && diff.removed.length === 0 && diff.added.length === 0) {
    console.log(fmt.dim("  no changes"));
    return;
  }

  for (const skill of diff.updated) {
    console.log(fmt.yellow(`  ~ ${skill}`));
  }

  for (const skill of diff.removed) {
    console.log(fmt.red(`  - ${skill}`));
  }

  for (const skill of diff.added) {
    console.log(fmt.green(`  + ${skill} (available, not installed)`));
  }
}

function printSyncedMaps(maps: { repoId: string; mappedSkills: number }[]): void {
  for (const map of maps) {
    console.log(fmt.info(`${map.repoId} (map)`));
    console.log(fmt.yellow(`  ~ regenerated ${map.mappedSkills} skill(s)`));
  }
}
