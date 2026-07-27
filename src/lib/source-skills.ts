import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import { discoverSkillGroups, discoverSkills, fingerprintSkillDirectory } from "./discover-skills";
import { pruneEmptyParents, upsertInstalledSkills } from "./install";
import { getSourceInstallRoot, getSourceSkillsBaseDir } from "./paths";
import { diffSkillSets } from "./update-diff";
import type { ManifestSkill } from "./project-manifest";
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
  installedSkills?: ManifestSkill[];
}): Promise<{ diff: UpdateDiff; resolvedSkills: ManifestSkill[] }> {
  const { cloneDir, sourceRoot } = options;
  const installedSkills =
    options.installedSkills ??
    (await discoverSkills(sourceRoot)).map((skill) => ({ id: skill.relativeDir }));
  const latestGroups = await discoverSkillGroups(cloneDir);
  const latestIds = latestGroups.map((group) => group.relativeDir);
  const cachedIds = installedSkills.map((skill) => skill.id);
  const diff = diffSkillSets(cachedIds, latestIds);
  const updated = new Set(diff.updated);
  const resolvedCandidates: SkillCandidate[] = [];

  for (const installed of installedSkills) {
    if (!updated.has(installed.id)) {
      continue;
    }
    const group = latestGroups.find((candidate) => candidate.relativeDir === installed.id)!;
    resolvedCandidates.push(
      await resolveInstalledCandidate(cloneDir, sourceRoot, group.candidates, installed),
    );
  }

  if (resolvedCandidates.length > 0) {
    await upsertInstalledSkills(cloneDir, sourceRoot, resolvedCandidates);
  }

  for (const skill of diff.removed) {
    await rm(join(sourceRoot, skill), { force: true, recursive: true });
  }

  await pruneEmptyParents(sourceRoot, getSourceSkillsBaseDir());
  return {
    diff,
    resolvedSkills: resolvedCandidates.map((candidate) => ({
      id: candidate.relativeDir,
      source: candidate.sourceDir,
    })),
  };
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

async function resolveInstalledCandidate(
  cloneDir: string,
  sourceRoot: string,
  candidates: SkillCandidate[],
  installed: ManifestSkill,
): Promise<SkillCandidate> {
  if (installed.source) {
    const selected = candidates.find((candidate) => candidate.sourceDir === installed.source);
    if (selected) {
      return selected;
    }
  }

  if (!installed.source && candidates.length === 1) {
    return candidates[0]!;
  }

  const matching = await findCandidatesMatchingCache(
    cloneDir,
    sourceRoot,
    candidates,
    installed.id,
  );
  if (matching.length === 1) {
    return matching[0]!;
  }

  if (installed.source) {
    throw new Error(
      `Selected source "${installed.source}" for skill "${installed.id}" no longer exists. Re-run skill add with an explicit variant.`,
    );
  }

  throw new Error(
    `Installed skill "${installed.id}" predates variant tracking and matches multiple sources: ${candidates.map((candidate) => `${candidate.variant}/${candidate.relativeDir}`).join(", ")}. Re-run skill add with an explicit variant.`,
  );
}

async function findCandidatesMatchingCache(
  cloneDir: string,
  sourceRoot: string,
  candidates: SkillCandidate[],
  skillId: string,
): Promise<SkillCandidate[]> {
  const cachedFingerprint = await fingerprintSkillDirectory(join(sourceRoot, skillId)).catch(
    () => null,
  );
  if (cachedFingerprint === null) {
    return [];
  }

  const matching: SkillCandidate[] = [];
  for (const candidate of candidates) {
    const fingerprint = await fingerprintSkillDirectory(join(cloneDir, candidate.sourceDir));
    if (fingerprint === cachedFingerprint) {
      matching.push(candidate);
    }
  }
  return matching;
}
