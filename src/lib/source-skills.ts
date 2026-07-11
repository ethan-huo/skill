import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { pruneEmptyParents, upsertInstalledSkills } from "./install";
import { getSourceInstallRoot, getSourceSkillsBaseDir } from "./paths";
import { diffSkillSets } from "./update-diff";
import type { RepoRef, SkillCandidate, UpdateDiff } from "../types";

export type SourceRepo = {
  owner: string;
  repo: string;
  sourceRoot: string;
};

export async function listSourceRepos(): Promise<SourceRepo[]> {
  const baseDir = getSourceSkillsBaseDir();
  const owners = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const repos: SourceRepo[] = [];

  for (const ownerEntry of owners) {
    if (!ownerEntry.isDirectory()) {
      continue;
    }

    const ownerDir = join(baseDir, ownerEntry.name);
    const repoEntries = await readdir(ownerDir, { withFileTypes: true }).catch(() => []);

    for (const repoEntry of repoEntries) {
      if (!repoEntry.isDirectory()) {
        continue;
      }

      repos.push({
        owner: ownerEntry.name,
        repo: repoEntry.name,
        sourceRoot: join(ownerDir, repoEntry.name),
      });
    }
  }

  return repos.sort((left, right) =>
    `${left.owner}/${left.repo}`.localeCompare(`${right.owner}/${right.repo}`),
  );
}

export async function updateSourceRepo(options: {
  cloneDir: string;
  sourceRoot: string;
  installedIds?: string[];
}): Promise<UpdateDiff> {
  const { cloneDir, sourceRoot } = options;
  const cachedSkills = await discoverSkills(sourceRoot);
  const latestSkills = await discoverSkills(cloneDir);
  const cachedIds = options.installedIds ?? cachedSkills.map((skill) => skill.relativeDir);
  const latestIds = latestSkills.map((skill) => skill.relativeDir);
  const diff = diffSkillSets(cachedIds, latestIds);

  if (diff.updated.length > 0) {
    await upsertInstalledSkills(cloneDir, sourceRoot, filterSkills(latestSkills, diff.updated));
  }

  for (const skill of diff.removed) {
    await rm(join(sourceRoot, skill), { force: true, recursive: true });
  }

  await pruneEmptyParents(sourceRoot, getSourceSkillsBaseDir());
  return diff;
}

export async function removeSourceRepo(
  repo: Pick<RepoRef, "owner" | "repo">,
  options: { sourceRoot?: string; sourceBaseDir?: string } = {},
): Promise<boolean> {
  const sourceRoot = options.sourceRoot ?? getSourceInstallRoot(repo);
  const sourceBaseDir = options.sourceBaseDir ?? getSourceSkillsBaseDir();
  const directory = await stat(sourceRoot).catch(() => null);
  if (!directory?.isDirectory()) {
    return false;
  }

  await rm(sourceRoot, { force: true, recursive: true });
  await pruneEmptyParents(dirname(sourceRoot), sourceBaseDir);
  return true;
}

function filterSkills(skills: SkillCandidate[], relativeDirs: string[]): SkillCandidate[] {
  const wanted = new Set(relativeDirs);
  return skills.filter((skill) => wanted.has(skill.relativeDir));
}
