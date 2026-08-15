import { rm } from "node:fs/promises";

import { ensureGlobalClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "./claude-skills";
import { discoverSkillGroups } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import {
  linkInstalledSkills,
  removeVisibleRepoSkills,
  removeVisibleSkillAliases,
  upsertInstalledSkills,
} from "./install";
import { listInstalledSkills } from "./installed-skills";
import {
  getLegacyVisibleMapRoot,
  getSkillsBaseDir,
  getInstallScope,
  getSourceInstallRoot,
  getVisibleMapRoot,
  getVisibleSkillDirName,
} from "./paths";
import {
  addScopeManifestMap,
  addScopeManifestSkills,
  assertScopeManifestSkillsAvailable,
  getProjectManifestMapRepos,
  getProjectManifestSkills,
  readScopeManifest,
} from "./project-manifest";
import { selectSkills } from "./select-skills";
import { writeProjectSkillMap } from "./skill-map";
import { formatGitHubSkillId } from "./skill-ref";
import type {
  InstallScope,
  InstalledSkill,
  RepoRef,
  SkillCandidate,
  SkillSelector,
} from "../types";

export type RepoSkillsInstallResult = {
  kind: "skills";
  installRoot: string;
  installedSkills: SkillCandidate[];
  skipped: SkippedSkill[];
};

export type SkippedSkill = {
  skill: string;
  reason: "already-installed-in-global" | "already-installed-in-project";
};

type SkillsInstallEffectResult = Omit<RepoSkillsInstallResult, "kind">;

export type RepoMapInstallResult = {
  kind: "map";
  installRoot: string;
  mappedSkills: SkillCandidate[];
};

export type RepoInstallResult = RepoSkillsInstallResult | RepoMapInstallResult;

export async function installRepoSkills(options: {
  cwd: string;
  global: boolean;
  repo: RepoRef;
  selectors: SkillSelector[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
  sourcePath?: string;
}): Promise<RepoInstallResult> {
  const scope = getInstallScope(options.global);
  const { cloneDir, selectedSkills, selectedMode } = await selectRepoSkills({
    ...options,
    global: options.global,
  });
  if (selectedMode === "map") {
    await removeScopeRepoSkillAliases("local", options.cwd, options.repo);
    const result = await writeProjectSkillMap({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
    });
    await ensureProjectClaudeSkillsLink(options.cwd);
    await addScopeManifestMap("local", options.cwd, `${options.repo.owner}/${options.repo.repo}`);
    return { kind: "map", installRoot: result.installRoot, mappedSkills: result.mappedSkills };
  }

  if (scope === "global") {
    const result = await installGlobalSkills({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
      selectedSkills,
    });
    return { kind: "skills", ...result };
  }

  const result = await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });
  return { kind: "skills", ...result };
}

export async function selectRepoSkills(options: {
  cwd: string;
  repo: RepoRef;
  selectors: SkillSelector[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
  global?: boolean;
  sourcePath?: string;
}): Promise<{
  cloneDir: string;
  selectedSkills: SkillCandidate[];
  selectedMode: "skills" | "map";
}> {
  const cloneDir = await shallowCloneRepo(options.repo);

  const discoveredGroups = await discoverSkillGroups(cloneDir);
  if (discoveredGroups.length === 0) {
    throw new Error(`No SKILL.md files found in ${options.repo.display}.`);
  }

  if (options.sourcePath !== undefined) {
    if (options.selectors.length > 0) {
      throw new Error("A canonical gh: skill ID cannot be combined with --skills.");
    }
    const selectedSkill = discoveredGroups
      .flatMap((group) => group.candidates)
      .find((skill) => skill.sourceDir === options.sourcePath);
    if (!selectedSkill) {
      throw new Error(`No skill found at ${options.repo.display}/${options.sourcePath}.`);
    }
    return { cloneDir, selectedSkills: [selectedSkill], selectedMode: "skills" };
  }

  const initialSelectors =
    options.selectors.length === 0
      ? mergeInitialSelectors(
          await getInstalledInitialSelectorsForScope(
            options.cwd,
            options.global ?? false,
            options.repo,
          ),
          options.initialSelectors ?? [],
        )
      : (options.initialSelectors ?? []);

  const selection = await selectSkills(options.repo.display, discoveredGroups, {
    selectors: options.selectors,
    initialSelectors,
    initialMap:
      !options.global &&
      options.selectors.length === 0 &&
      initialSelectors.length === 0 &&
      (await hasInstalledRepoMap(options.cwd, options.repo)),
    offerMap: !options.global,
    promptForSelection: options.promptForSelection,
  });

  return {
    cloneDir,
    selectedSkills: selection.skills,
    selectedMode: selection.mode,
  };
}

export async function installGlobalSkills(options: {
  cloneDir: string;
  cwd: string;
  ensureClaudeSkillsLink?: (cwd: string) => Promise<string>;
  repo: RepoRef;
  selectedSkills: SkillCandidate[];
}): Promise<SkillsInstallEffectResult> {
  const installRoot = getSkillsBaseDir("global", options.cwd);
  const { installedSkills, skipped } = partitionCrossScopeSkills(
    await listInstalledSkills(options.cwd),
    "global",
    options.repo,
    options.selectedSkills,
  );
  if (installedSkills.length === 0) {
    return { installRoot, installedSkills, skipped };
  }

  const manifestSkills = installedSkills.map((skill) => ({
    id: skill.relativeDir,
    source: skill.sourceDir,
  }));
  await assertScopeManifestSkillsAvailable(
    "global",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    manifestSkills,
  );
  const sourceRoot = getSourceInstallRoot(options.repo);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.repo, installedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, options.repo, installedSkills);
  await (options.ensureClaudeSkillsLink ?? ensureGlobalClaudeSkillsLink)(options.cwd);
  await addScopeManifestSkills(
    "global",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    manifestSkills,
  );

  return { installRoot, installedSkills, skipped };
}

export async function installLocalProjectSkills(options: {
  cloneDir: string;
  cwd: string;
  repo: RepoRef;
  selectedSkills: SkillCandidate[];
}): Promise<SkillsInstallEffectResult> {
  const installRoot = getSkillsBaseDir("local", options.cwd);
  const { installedSkills, skipped } = partitionCrossScopeSkills(
    await listInstalledSkills(options.cwd),
    "local",
    options.repo,
    options.selectedSkills,
  );
  if (installedSkills.length === 0) {
    return { installRoot, installedSkills, skipped };
  }

  const manifestSkills = installedSkills.map((skill) => ({
    id: skill.relativeDir,
    source: skill.sourceDir,
  }));
  await assertScopeManifestSkillsAvailable(
    "local",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    manifestSkills,
  );

  const sourceRoot = getSourceInstallRoot(options.repo);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.repo, installedSkills);
  await removeProjectMapAliases(options.cwd, options.repo);
  await linkInstalledSkills(sourceRoot, installRoot, options.repo, installedSkills);
  await ensureProjectClaudeSkillsLink(options.cwd);
  await addScopeManifestSkills(
    "local",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    manifestSkills,
  );

  return { installRoot, installedSkills, skipped };
}

async function removeProjectMapAliases(cwd: string, repo: RepoRef): Promise<void> {
  await rm(getVisibleMapRoot("local", cwd, repo), { force: true, recursive: true });
  await rm(getLegacyVisibleMapRoot("local", cwd, repo), { force: true, recursive: true });
}

async function removeScopeRepoSkillAliases(
  scope: InstallScope,
  cwd: string,
  repo: RepoRef,
): Promise<void> {
  const repoId = `${repo.owner}/${repo.repo}`;
  const installedSkills = getProjectManifestSkills(await readScopeManifest(scope, cwd)).filter(
    (skill) => skill.repo === repoId,
  );
  const skillsRoot = getSkillsBaseDir(scope, cwd);
  for (const skill of installedSkills) {
    await removeVisibleSkillAliases(skillsRoot, repo, skill.id);
  }
  // Pre-manifest aliases and the source-scoped map still need structural cleanup.
  await removeVisibleRepoSkills(skillsRoot, repo);
}

export function partitionCrossScopeSkills(
  installedSkills: InstalledSkill[],
  targetScope: InstallScope,
  repo: RepoRef,
  selectedSkills: SkillCandidate[],
): Pick<SkillsInstallEffectResult, "installedSkills" | "skipped"> {
  const otherScope = targetScope === "global" ? "local" : "global";
  const conflictingAliases = new Set(
    installedSkills
      .filter((skill) => skill.scope === otherScope)
      .map((skill) => getVisibleSkillDirName(toInstalledRepo(skill), skill.relativeDir)),
  );

  const installable: SkillCandidate[] = [];
  const skipped: SkippedSkill[] = [];
  for (const skill of selectedSkills) {
    if (conflictingAliases.has(getVisibleSkillDirName(repo, skill.relativeDir))) {
      skipped.push({
        skill: formatGitHubSkillId(repo, skill.sourceDir),
        reason:
          otherScope === "global" ? "already-installed-in-global" : "already-installed-in-project",
      });
    } else {
      installable.push(skill);
    }
  }

  return { installedSkills: installable, skipped };
}

function toInstalledRepo(skill: InstalledSkill): RepoRef {
  return {
    owner: skill.owner,
    repo: skill.repo,
    cloneUrl: "",
    display: `${skill.owner}/${skill.repo}`,
  };
}

export function getInstalledInitialSelectors(
  installedSkills: InstalledSkill[],
  scope: InstallScope,
  repo: RepoRef,
): string[] {
  return installedSkills
    .filter(
      (skill) => skill.scope === scope && skill.owner === repo.owner && skill.repo === repo.repo,
    )
    .map((skill) => skill.relativeDir)
    .sort();
}

async function getInstalledInitialSelectorsForScope(
  cwd: string,
  global: boolean,
  repo: RepoRef,
): Promise<string[]> {
  return getInstalledInitialSelectors(
    await listInstalledSkills(cwd),
    getInstallScope(global),
    repo,
  );
}

function mergeInitialSelectors(left: string[], right: string[]): string[] {
  return [
    ...new Set([...left, ...right].map((selector) => selector.trim()).filter(Boolean)),
  ].sort();
}

async function hasInstalledRepoMap(cwd: string, repo: RepoRef): Promise<boolean> {
  const repoId = `${repo.owner}/${repo.repo}`;
  return getProjectManifestMapRepos(await readScopeManifest("local", cwd)).includes(repoId);
}
