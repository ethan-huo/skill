import { rm } from "node:fs/promises";

import { fmt } from "argc/terminal";

import { ensureGlobalClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "../lib/claude-skills";
import { pMapLimit } from "../lib/concurrency";
import { shallowCloneRepo } from "../lib/git";
import { linkInstalledSkills } from "../lib/install";
import { createLiveGrid, type GridStage, type LiveGrid } from "../lib/live-grid";
import { getSkillsBaseDir, getSourceInstallRoot, getVisibleSkillRoot } from "../lib/paths";
import {
  getProjectManifestMapRepos,
  getProjectManifestSkills,
  readScopeManifest,
  removeProjectManifestSkillIds,
  resolveProjectManifestSkillSources,
  writeScopeManifest,
} from "../lib/project-manifest";
import type { ManifestSkill, ProjectManifest } from "../lib/project-manifest";
import {
  hasProjectManifest,
  hasScopeManifest,
  pruneProjectManifestSkills,
  removeProjectSkillLinks,
  seedGlobalManifestFromVisibleLinks,
  syncProjectMapRepo,
  syncProjectSkillLinks,
} from "../lib/project-skills";
import { parseRepoRef } from "../lib/repo-ref";
import { updateSourceRepo } from "../lib/source-skills";
import { diffSkillSets } from "../lib/update-diff";
import type { InstallScope, RepoRef, SkillCandidate, UpdateDiff, UpdateInput } from "../types";

type RepoOutcome = {
  kind: "repo";
  repo: { owner: string; repo: string };
  diff: UpdateDiff;
  resolvedSkills: ManifestSkill[];
};

type MapOutcome = {
  kind: "map";
  repoId: string;
  mappedSkills: number;
};

type FailOutcome = {
  kind: "error";
  id: string;
  title: string;
  error: unknown;
};

type Outcome = RepoOutcome | MapOutcome | FailOutcome;

const REPO_ID = (repo: { owner: string; repo: string }) => `repo:${repo.owner}/${repo.repo}`;
const MAP_ID = (repoId: string) => `map:${repoId}`;
const EMPTY_MANIFEST_MESSAGE =
  "No global or project skills are recorded in ~/.agents/skills/manifest.json or .agents/skills/manifest.json.";

export async function runUpdate(args: { input: UpdateInput }): Promise<void> {
  const input = args.input;
  const concurrency = Math.max(1, input.concurrency ?? 8);

  await seedGlobalManifestFromVisibleLinks(process.cwd());

  const globalManifest = await readScopeManifest("global", process.cwd());
  const projectManifest = await readScopeManifest("local", process.cwd());
  const installedByRepo = mergeInstalledByRepo(
    groupManifestSkills("global", getProjectManifestSkills(globalManifest)),
    groupManifestSkills("local", getProjectManifestSkills(projectManifest)),
  );
  const sourceRepos = getManifestSourceRepos([globalManifest, projectManifest]);
  const mapRepoIds = getProjectManifestMapRepos(projectManifest);

  if (sourceRepos.length === 0 && mapRepoIds.length === 0) {
    console.log(fmt.info(EMPTY_MANIFEST_MESSAGE));
    return;
  }

  const rows = [
    ...sourceRepos.map((repo) => ({
      id: REPO_ID(repo),
      title: `${repo.owner}/${repo.repo}`,
    })),
    ...mapRepoIds.map((repoId) => ({
      id: MAP_ID(repoId),
      title: `${repoId} (map)`,
    })),
  ];

  const grid = createLiveGrid({
    rows,
    enabled: input.progress === false ? false : undefined,
  });

  const tasks: Array<() => Promise<Outcome>> = [
    ...sourceRepos.map((repo) => () => updateRepo({ repo, grid, installedByRepo })),
    ...mapRepoIds.map((repoId) => () => updateMap({ repoId, grid })),
  ];

  const settled = await pMapLimit(tasks, concurrency, (task) => task());
  grid.stop();

  const repoOutcomes: RepoOutcome[] = [];
  const mapOutcomes: MapOutcome[] = [];
  const failures: FailOutcome[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      // pMapLimit captures fn rejections, but our task wrappers also catch and
      // return FailOutcome; this branch only fires on bugs in our own code.
      failures.push({
        kind: "error",
        id: `task#${result.index}`,
        title: `task #${result.index}`,
        error: result.reason,
      });
      continue;
    }
    const value = result.value;
    if (value.kind === "repo") {
      repoOutcomes.push(value);
    } else if (value.kind === "map") {
      mapOutcomes.push(value);
    } else {
      failures.push(value);
    }
  }

  // The plan promises stable ordering on stdout regardless of completion
  // order — keep it sorted by owner/repo (and repoId for maps) so output stays
  // grep-friendly across runs.
  repoOutcomes.sort((left, right) =>
    `${left.repo.owner}/${left.repo.repo}`.localeCompare(`${right.repo.owner}/${right.repo.repo}`),
  );
  mapOutcomes.sort((left, right) => left.repoId.localeCompare(right.repoId));

  await persistResolvedSources(process.cwd(), repoOutcomes);

  for (const outcome of repoOutcomes) {
    console.log(fmt.info(`${outcome.repo.owner}/${outcome.repo.repo} (source)`));
    printDiff(outcome.diff);
  }

  for (const outcome of mapOutcomes) {
    console.log(fmt.info(`${outcome.repoId} (map)`));
    console.log(fmt.yellow(`  ~ regenerated ${outcome.mappedSkills} skill(s)`));
  }

  // Match the old syncProjectMaps no-op manifest rewrite so any in-tree
  // touch-on-update consumers (timestamps, formatters) keep firing.
  if (mapOutcomes.length > 0 && hasProjectManifest(process.cwd())) {
    const manifest = await readScopeManifest("local", process.cwd());
    await writeScopeManifest("local", process.cwd(), manifest);
  }

  for (const failure of failures) {
    const detail = failure.error instanceof Error ? failure.error.message : String(failure.error);
    console.log(fmt.error(`${failure.title}: ${detail}`));
  }

  printSummary({ repoOutcomes, mapOutcomes, failures });

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function updateRepo(options: {
  repo: { owner: string; repo: string; sourceRoot: string };
  grid: LiveGrid;
  installedByRepo: Map<string, ManifestSkill[]>;
}): Promise<Outcome> {
  const { repo, grid, installedByRepo } = options;
  const id = REPO_ID(repo);
  const setStage = (stage: GridStage) => grid.set(id, stage);

  try {
    setStage({ kind: "running", label: "cloning" });
    const repoRef = parseRepoRef(`${repo.owner}/${repo.repo}`);
    const cloneDir = await shallowCloneRepo(repoRef);

    setStage({ kind: "running", label: "diffing" });
    const sourceUpdate = await updateSourceRepo({
      cloneDir,
      sourceRoot: repo.sourceRoot,
      installedSkills: mergeManifestSkills(
        installedByRepo.get(getInstalledGroupKey("global", repoRef)) ?? [],
        installedByRepo.get(getInstalledGroupKey("local", repoRef)) ?? [],
      ),
    });
    const { diff, resolvedSkills } = sourceUpdate;

    setStage({ kind: "running", label: "linking" });
    await syncVisibleLinks({
      cwd: process.cwd(),
      repo: repoRef,
      globalInstalledIds: (installedByRepo.get(getInstalledGroupKey("global", repoRef)) ?? []).map(
        (skill) => skill.id,
      ),
      projectInstalledIds: (installedByRepo.get(getInstalledGroupKey("local", repoRef)) ?? []).map(
        (skill) => skill.id,
      ),
      updated: diff.updated,
      removed: diff.removed,
      sourceRoot: repo.sourceRoot,
    });

    setStage({ kind: "done", label: summarizeDiff(diff) });
    return { kind: "repo", repo, diff, resolvedSkills };
  } catch (error) {
    setStage({ kind: "error", label: error instanceof Error ? error.message : String(error) });
    return {
      kind: "error",
      id,
      title: `${repo.owner}/${repo.repo}`,
      error,
    };
  }
}

async function updateMap(options: { repoId: string; grid: LiveGrid }): Promise<Outcome> {
  const { repoId, grid } = options;
  const id = MAP_ID(repoId);
  const setStage = (stage: GridStage) => grid.set(id, stage);

  try {
    setStage({ kind: "running", label: "cloning" });
    const result = await syncProjectMapRepo({ cwd: process.cwd(), repoId });
    setStage({ kind: "done", label: `${result.mappedSkills} skill(s)` });
    return { kind: "map", repoId, mappedSkills: result.mappedSkills };
  } catch (error) {
    setStage({ kind: "error", label: error instanceof Error ? error.message : String(error) });
    return {
      kind: "error",
      id,
      title: `${repoId} (map)`,
      error,
    };
  }
}

function summarizeDiff(diff: UpdateDiff): string {
  const parts: string[] = [];
  if (diff.updated.length > 0) parts.push(`~${diff.updated.length}`);
  if (diff.removed.length > 0) parts.push(`-${diff.removed.length}`);
  if (diff.added.length > 0) parts.push(`+${diff.added.length}`);
  return parts.length === 0 ? "no changes" : parts.join(" ");
}

function printSummary(options: {
  repoOutcomes: RepoOutcome[];
  mapOutcomes: MapOutcome[];
  failures: FailOutcome[];
}): void {
  const { repoOutcomes, mapOutcomes, failures } = options;
  const totalUpdated = repoOutcomes.reduce((sum, outcome) => sum + outcome.diff.updated.length, 0);
  const totalRemoved = repoOutcomes.reduce((sum, outcome) => sum + outcome.diff.removed.length, 0);
  const totalAdded = repoOutcomes.reduce((sum, outcome) => sum + outcome.diff.added.length, 0);
  const repoCount = repoOutcomes.length;
  const mapCount = mapOutcomes.length;

  const segments = [
    `${repoCount} repo${repoCount === 1 ? "" : "s"}`,
    mapCount > 0 ? `${mapCount} map${mapCount === 1 ? "" : "s"}` : null,
    `~${totalUpdated} -${totalRemoved} +${totalAdded}`,
    failures.length > 0 ? fmt.red(`✗${failures.length}`) : null,
  ].filter(Boolean);

  console.log(fmt.dim(`updated ${segments.join(" · ")}`));
}

function groupManifestSkills(
  scope: InstallScope,
  skills: Array<ManifestSkill & { repo: string }>,
): Map<string, ManifestSkill[]> {
  const grouped = new Map<string, ManifestSkill[]>();

  for (const skill of skills) {
    const parsed = parseRepoRef(skill.repo);
    const current = grouped.get(getInstalledGroupKey(scope, parsed)) ?? [];
    current.push(skill);
    grouped.set(getInstalledGroupKey(scope, parsed), current);
  }

  return grouped;
}

function mergeInstalledByRepo(
  ...maps: Array<Map<string, ManifestSkill[]>>
): Map<string, ManifestSkill[]> {
  const merged = new Map<string, ManifestSkill[]>();

  for (const map of maps) {
    for (const [key, skills] of map.entries()) {
      merged.set(key, mergeManifestSkills(merged.get(key) ?? [], skills));
    }
  }

  return merged;
}

function getManifestSourceRepos(
  manifests: ProjectManifest[],
): Array<{ owner: string; repo: string; sourceRoot: string }> {
  const repos = new Map<string, { owner: string; repo: string; sourceRoot: string }>();

  for (const manifest of manifests) {
    for (const item of manifest.items.filter((item) => item.type === "skills")) {
      const repo = parseRepoRef(item.repo);
      repos.set(`${repo.owner}/${repo.repo}`, {
        owner: repo.owner,
        repo: repo.repo,
        sourceRoot: getSourceInstallRoot(repo),
      });
    }
  }

  return [...repos.values()].sort((left, right) =>
    `${left.owner}/${left.repo}`.localeCompare(`${right.owner}/${right.repo}`),
  );
}

function mergeManifestSkills(...groups: ManifestSkill[][]): ManifestSkill[] {
  const merged = new Map<string, ManifestSkill>();
  for (const skill of groups.flat()) {
    const current = merged.get(skill.id);
    if (current?.source && skill.source && current.source !== skill.source) {
      throw new Error(
        `Installed skill "${skill.id}" selects conflicting sources "${current.source}" and "${skill.source}" across scopes.`,
      );
    }
    merged.set(skill.id, current?.source ? current : skill);
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

async function persistResolvedSources(cwd: string, outcomes: RepoOutcome[]): Promise<void> {
  if (outcomes.length === 0) {
    return;
  }

  for (const scope of ["global", "local"] as const) {
    if (!hasScopeManifest(scope, cwd)) {
      continue;
    }
    let manifest = await readScopeManifest(scope, cwd);
    for (const outcome of outcomes) {
      manifest = resolveProjectManifestSkillSources(
        manifest,
        `${outcome.repo.owner}/${outcome.repo.repo}`,
        outcome.resolvedSkills,
      );
    }
    await writeScopeManifest(scope, cwd, manifest);
  }
}

function getInstalledGroupKey(scope: "local" | "global", repo: Pick<RepoRef, "owner" | "repo">) {
  return `${scope}:${repo.owner}/${repo.repo}`;
}

export async function syncVisibleLinks(options: {
  cwd: string;
  repo: RepoRef;
  globalInstalledIds: string[];
  projectInstalledIds: string[];
  updated: string[];
  removed: string[];
  sourceRoot: string;
}): Promise<void> {
  const { cwd, repo, globalInstalledIds, projectInstalledIds, updated, removed, sourceRoot } =
    options;

  if (globalInstalledIds.length > 0) {
    if (updated.length > 0) {
      await relinkExistingSkills(repo, "global", cwd, sourceRoot, globalInstalledIds, updated);
    }

    const removedGlobalSkills = filterInstalled(removed, globalInstalledIds);
    for (const skill of removedGlobalSkills) {
      await rm(getVisibleSkillRoot("global", cwd, repo, skill), {
        force: true,
        recursive: true,
      });
    }

    await ensureGlobalClaudeSkillsLink(cwd);

    if (removedGlobalSkills.length > 0) {
      const manifest = await readScopeManifest("global", cwd);
      await writeScopeManifest(
        "global",
        cwd,
        removeProjectManifestSkillIds(
          manifest,
          removedGlobalSkills.map((skill) => `${repo.owner}/${repo.repo}/${skill}`),
        ),
      );
    }
  }

  if (projectInstalledIds.length === 0) {
    return;
  }

  await ensureProjectClaudeSkillsLink(cwd);
  const removedProjectSkills = filterInstalled(removed, projectInstalledIds);
  await removeProjectSkillLinks(cwd, repo, removedProjectSkills);

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
    removedProjectSkills.map((skill) => `${repo.owner}/${repo.repo}/${skill}`),
  );
}

function filterInstalled(skills: string[], installedIds: string[]): string[] {
  const installed = new Set(installedIds);
  return skills.filter((skill) => installed.has(skill));
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
