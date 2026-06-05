import { rm } from "node:fs/promises";
import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, removeVisibleRepoSkills, upsertInstalledSkills } from "./install";
import { listInstalledSkills } from "./installed-skills";
import {
  getLegacyVisibleMapRoot,
  getSkillsBaseDir,
  getInstallScope,
  getProjectClaudeRoot,
  getSourceInstallRoot,
  getVisibleMapRoot,
} from "./paths";
import { addProjectManifestMap, addProjectManifestSkills } from "./project-manifest";
import { selectOne } from "./prompt";
import { selectSkills } from "./select-skills";
import { shouldRecommendRepoMap, writeProjectSkillMap } from "./skill-map";
import type { RepoRef, SkillCandidate } from "../types";

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
  selectors: string[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
}): Promise<RepoInstallResult> {
  const scope = getInstallScope(options.global);
  const { cloneDir, selectedSkills, selectedMode } = await selectRepoSkills({
    ...options,
    global: options.global,
  });
  const installRoot = getSkillsBaseDir(scope, options.cwd);

  if (selectedMode === "map") {
    await removeVisibleRepoSkills(installRoot, options.repo);
    await removeVisibleRepoSkills(join(getProjectClaudeRoot(options.cwd), "skills"), options.repo);
    const result = await writeProjectSkillMap({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
    });
    await addProjectManifestMap(options.cwd, `${options.repo.owner}/${options.repo.repo}`);
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
  repo: RepoRef;
  selectors: string[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
  global?: boolean;
}): Promise<{
  cloneDir: string;
  selectedSkills: SkillCandidate[];
  selectedMode: "skills" | "map";
}> {
  const cloneDir = await shallowCloneRepo(options.repo);

  const discoveredSkills = await discoverSkills(cloneDir);
  if (discoveredSkills.length === 0) {
    throw new Error(`No SKILL.md files found in ${options.repo.display}.`);
  }

  if (
    !options.global &&
    options.selectors.length === 0 &&
    (options.initialSelectors ?? []).length === 0 &&
    (await shouldRecommendRepoMap(cloneDir, discoveredSkills))
  ) {
    const selectedMode = await selectFlatCatalogInstallMode(
      options.repo.display,
      discoveredSkills.length,
    );
    if (selectedMode === "map") {
      return { cloneDir, selectedSkills: [], selectedMode };
    }
  }

  const selectedSkills = await selectSkills(options.repo.display, discoveredSkills, {
    selectors: options.selectors,
    initialSelectors: options.initialSelectors,
    promptForSelection: options.promptForSelection,
  });

  return { cloneDir, selectedSkills, selectedMode: "skills" };
}

export async function installGlobalSkills(options: {
  cloneDir: string;
  cwd: string;
  repo: RepoRef;
  selectedSkills: SkillCandidate[];
}): Promise<{ installRoot: string }> {
  const sourceRoot = getSourceInstallRoot(options.repo);
  const installRoot = getSkillsBaseDir("global", options.cwd);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.selectedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, options.repo, options.selectedSkills);

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
  await addProjectManifestSkills(
    options.cwd,
    options.selectedSkills.map(
      (skill) => `${options.repo.owner}/${options.repo.repo}/${skill.relativeDir}`,
    ),
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

async function selectFlatCatalogInstallMode(
  repoDisplay: string,
  skillCount: number,
): Promise<"map" | "skills"> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return "map";
  }

  return selectOne({
    message: `${repoDisplay} contains ${skillCount} skills.`,
    options: [
      {
        label: "Install repo map (recommended)",
        value: "map",
      },
      {
        label: "Select individual skills",
        value: "skills",
      },
    ],
    initialValue: "map",
  });
}
