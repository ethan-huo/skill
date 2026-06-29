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
  getProjectManifestSkillIds,
  readScopeManifest,
  removeProjectManifestSkillIds,
  writeScopeManifest,
} from "../lib/project-manifest";
import {
  hasProjectManifest,
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

export async function runUpdate(args: { input: UpdateInput }): Promise<void> {
  const input = args.input;
  const concurrency = Math.max(1, input.concurrency ?? 8);
  const scope = input.global ? "global" : "local";

  if (scope === "global") {
    await seedGlobalManifestFromVisibleLinks(process.cwd());
  }

  const manifest = await readScopeManifest(scope, process.cwd());
  const installedByRepo = groupManifestSkillIds(scope, getProjectManifestSkillIds(manifest));
  const sourceRepos = getManifestSourceRepos(manifest);
  const mapRepoIds = input.global ? [] : getProjectManifestMapRepos(manifest);

  if (sourceRepos.length === 0 && mapRepoIds.length === 0) {
    const manifestPath = input.global
      ? "~/.agents/skills/manifest.json"
      : ".agents/skills/manifest.json";
    console.log(fmt.info(`No ${scope} skills are recorded in ${manifestPath}.`));
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
    ...sourceRepos.map((repo) => () => updateRepo({ repo, input, grid, installedByRepo })),
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
  input: UpdateInput;
  grid: LiveGrid;
  installedByRepo: Map<string, string[]>;
}): Promise<Outcome> {
  const { repo, input, grid, installedByRepo } = options;
  const id = REPO_ID(repo);
  const setStage = (stage: GridStage) => grid.set(id, stage);

  try {
    setStage({ kind: "running", label: "cloning" });
    const repoRef = parseRepoRef(`${repo.owner}/${repo.repo}`);
    const cloneDir = await shallowCloneRepo(repoRef);

    setStage({ kind: "running", label: "diffing" });
    const diff = await updateSourceRepo({
      cloneDir,
      sourceRoot: repo.sourceRoot,
    });

    setStage({ kind: "running", label: "linking" });
    await syncVisibleLinks({
      cwd: process.cwd(),
      input,
      repo: repoRef,
      globalInstalledIds: installedByRepo.get(getInstalledGroupKey("global", repoRef)) ?? [],
      projectInstalledIds: installedByRepo.get(getInstalledGroupKey("local", repoRef)) ?? [],
      updated: diff.updated,
      removed: diff.removed,
      sourceRoot: repo.sourceRoot,
    });

    setStage({ kind: "done", label: summarizeDiff(diff) });
    return { kind: "repo", repo, diff };
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

function groupManifestSkillIds(scope: InstallScope, skillIds: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const skillId of skillIds) {
    const parsed = parseRepoRef(skillId.split("/").slice(0, 2).join("/"));
    const skill = skillId.split("/").slice(2).join("/");
    const current = grouped.get(getInstalledGroupKey(scope, parsed)) ?? [];
    current.push(skill);
    grouped.set(getInstalledGroupKey(scope, parsed), current);
  }

  return grouped;
}

function getManifestSourceRepos(manifest: {
  items: Array<{ type: "skills" | "map"; repo: string; skills?: string[] }>;
}): Array<{ owner: string; repo: string; sourceRoot: string }> {
  return manifest.items
    .filter((item) => item.type === "skills")
    .map((item) => {
      const repo = parseRepoRef(item.repo);
      return {
        owner: repo.owner,
        repo: repo.repo,
        sourceRoot: getSourceInstallRoot(repo),
      };
    });
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

  if (input.global) {
    if (updated.length > 0) {
      await relinkExistingSkills(repo, "global", cwd, sourceRoot, globalInstalledIds, updated);
    }

    for (const skill of removed) {
      await rm(getVisibleSkillRoot("global", cwd, repo, skill), {
        force: true,
        recursive: true,
      });
    }

    if (globalInstalledIds.length > 0) {
      await ensureGlobalClaudeSkillsLink(cwd);
    }

    if (removed.length > 0) {
      const manifest = await readScopeManifest("global", cwd);
      await writeScopeManifest(
        "global",
        cwd,
        removeProjectManifestSkillIds(
          manifest,
          removed.map((skill) => `${repo.owner}/${repo.repo}/${skill}`),
        ),
      );
    }
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
