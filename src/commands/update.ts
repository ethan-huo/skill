import { dirname, join } from "node:path";
import { rm, stat } from "node:fs/promises";

import { fmt } from "argc/terminal";

import { shallowCloneRepo } from "../lib/git";
import { linkInstalledSkills, pruneEmptyParents } from "../lib/install";
import { listInstalledSkills } from "../lib/installed-skills";
import { getClaudeRoot, getClaudeSkillRoot, getInstallRoot, getSkillsBaseDir } from "../lib/paths";
import {
  hasProjectManifest,
  pruneProjectManifestSkills,
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
    console.log(fmt.info("No shared source skills are cached."));
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
      globalInstalledIds:
        installedByRepo.get(getInstallRoot("global", process.cwd(), repoRef)) ?? [],
      projectInstalledIds:
        installedByRepo.get(getInstallRoot("local", process.cwd(), repoRef)) ?? [],
      updated: diff.updated,
      removed: diff.removed,
      sourceRoot: sourceRepo.sourceRoot,
    });

    printDiff(diff);
  }
}

function groupInstalledSkills(
  skills: Awaited<ReturnType<typeof listInstalledSkills>>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const skill of skills) {
    const current = grouped.get(skill.installRoot) ?? [];
    current.push(skill.relativeDir);
    grouped.set(skill.installRoot, current);
  }

  return grouped;
}

async function syncVisibleLinks(options: {
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
    await relinkClaudeSkills(repo, getClaudeRoot(), sourceRoot, globalInstalledIds, updated);
  }

  for (const skill of removed) {
    await rm(join(getInstallRoot("global", cwd, repo), skill), {
      force: true,
      recursive: true,
    });
    await removeVisibleClaudeSkill(getClaudeRoot(), repo, skill);
  }

  await pruneEmptyParents(
    dirname(getInstallRoot("global", cwd, repo)),
    getSkillsBaseDir("global", cwd),
  );

  if (input.global || !hasProjectManifest(cwd)) {
    return;
  }

  await syncProjectSkillLinks({
    cwd,
    repo,
    sourceRoot,
    installedIds: projectInstalledIds,
    updated,
    removed,
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

  await linkInstalledSkills(sourceRoot, getInstallRoot(scope, cwd, repo), selectedSkills);
}

async function relinkClaudeSkills(
  repo: RepoRef,
  claudeRoot: string,
  sourceRoot: string,
  installedIds: string[],
  updated: string[],
): Promise<void> {
  const existingClaudeRoot = await stat(claudeRoot).catch(() => null);
  if (!existingClaudeRoot?.isDirectory()) {
    return;
  }

  const selectedSkills = toInstalledCandidates(installedIds, updated);
  if (selectedSkills.length === 0) {
    return;
  }

  for (const skill of selectedSkills) {
    await linkInstalledSkills(
      sourceRoot,
      dirname(getClaudeSkillRoot(claudeRoot, repo, skill.relativeDir)),
      [
        {
          relativeDir: `${repo.owner}.${repo.repo}.${skill.relativeDir}`,
          sourceDir: skill.relativeDir,
          displayLabel: skill.displayLabel,
        },
      ],
    );
  }
}

async function removeVisibleClaudeSkill(
  claudeRoot: string,
  repo: RepoRef,
  skill: string,
): Promise<void> {
  const existingClaudeRoot = await stat(claudeRoot).catch(() => null);
  if (!existingClaudeRoot?.isDirectory()) {
    return;
  }

  await rm(getClaudeSkillRoot(claudeRoot, repo, skill), { force: true, recursive: true });
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
