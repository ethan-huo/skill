import { rm } from "node:fs/promises";

import { ensureGlobalClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "./claude-skills";
import { discoverSkillGroups } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, removeVisibleRepoSkills, upsertInstalledSkills } from "./install";
import { listInstalledSkills } from "./installed-skills";
import {
  getLegacyVisibleMapRoot,
  getSkillsBaseDir,
  getInstallScope,
  getSourceInstallRoot,
  getVisibleMapRoot,
} from "./paths";
import {
  addScopeManifestMap,
  addScopeManifestSkills,
  getProjectManifestMapRepos,
  readScopeManifest,
} from "./project-manifest";
import { selectSkills } from "./select-skills";
import { writeProjectSkillMap } from "./skill-map";
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
  selectedSkills: SkillCandidate[];
};

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
  const installRoot = getSkillsBaseDir(scope, options.cwd);

  if (selectedMode === "map") {
    await removeVisibleRepoSkills(installRoot, options.repo);
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
    await installGlobalSkills({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
      selectedSkills,
    });
    return { kind: "skills", installRoot, selectedSkills };
  }

  await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });
  return { kind: "skills", installRoot, selectedSkills };
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
}): Promise<{ installRoot: string }> {
  const sourceRoot = getSourceInstallRoot(options.repo);
  const installRoot = getSkillsBaseDir("global", options.cwd);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.selectedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, options.repo, options.selectedSkills);
  await (options.ensureClaudeSkillsLink ?? ensureGlobalClaudeSkillsLink)(options.cwd);
  await addScopeManifestSkills(
    "global",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    options.selectedSkills.map((skill) => ({
      id: skill.relativeDir,
      source: skill.sourceDir,
    })),
  );

  return { installRoot };
}

export async function installLocalProjectSkills(options: {
  cloneDir: string;
  cwd: string;
  repo: RepoRef;
  selectedSkills: SkillCandidate[];
}): Promise<{ installRoot: string }> {
  await assertNoConflictingGlobalSkills(options.cwd, "local", options.repo, options.selectedSkills);

  const sourceRoot = getSourceInstallRoot(options.repo);
  const installRoot = getSkillsBaseDir("local", options.cwd);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.selectedSkills);
  await removeProjectMapAliases(options.cwd, options.repo);
  await linkInstalledSkills(sourceRoot, installRoot, options.repo, options.selectedSkills);
  await ensureProjectClaudeSkillsLink(options.cwd);
  await addScopeManifestSkills(
    "local",
    options.cwd,
    `${options.repo.owner}/${options.repo.repo}`,
    options.selectedSkills.map((skill) => ({
      id: skill.relativeDir,
      source: skill.sourceDir,
    })),
  );

  return { installRoot };
}

async function removeProjectMapAliases(cwd: string, repo: RepoRef): Promise<void> {
  await rm(getVisibleMapRoot("local", cwd, repo), { force: true, recursive: true });
  await rm(getLegacyVisibleMapRoot("local", cwd, repo), { force: true, recursive: true });
}

export function getConflictingGlobalSkillIds(
  installedSkills: Awaited<ReturnType<typeof listInstalledSkills>>,
  repo: RepoRef,
  selectedSkills: SkillCandidate[],
): string[] {
  const selected = new Set(selectedSkills.map((skill) => skill.relativeDir));

  return installedSkills
    .filter(
      (skill) =>
        skill.scope === "global" &&
        skill.owner === repo.owner &&
        skill.repo === repo.repo &&
        selected.has(skill.relativeDir),
    )
    .map((skill) => skill.id)
    .sort();
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

async function assertNoConflictingGlobalSkills(
  cwd: string,
  scope: ReturnType<typeof getInstallScope>,
  repo: RepoRef,
  selectedSkills: SkillCandidate[],
): Promise<void> {
  if (scope !== "local") {
    return;
  }

  const conflicts = getConflictingGlobalSkillIds(
    await listInstalledSkills(cwd),
    repo,
    selectedSkills,
  );
  if (conflicts.length === 0) {
    return;
  }

  throw new Error(
    `Global install already contains selected skill(s): ${conflicts.join(", ")}. Remove them before installing the same skill locally.`,
  );
}

async function hasInstalledRepoMap(cwd: string, repo: RepoRef): Promise<boolean> {
  const repoId = `${repo.owner}/${repo.repo}`;
  return getProjectManifestMapRepos(await readScopeManifest("local", cwd)).includes(repoId);
}
