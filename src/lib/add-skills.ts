import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, upsertInstalledSkills } from "./install";
import { listInstalledSkills } from "./installed-skills";
import { getInstallRoot, getInstallScope, getSourceInstallRoot } from "./paths";
import { addProjectManifestSkills } from "./project-manifest";
import { selectSkills } from "./select-skills";
import type { RepoRef, SkillCandidate } from "../types";

export async function installRepoSkills(options: {
  cwd: string;
  global: boolean;
  repo: RepoRef;
  selectors: string[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
}): Promise<{ installRoot: string; selectedSkills: SkillCandidate[] }> {
  const scope = getInstallScope(options.global);
  const { cloneDir, selectedSkills } = await selectRepoSkills(options);
  const installRoot = getInstallRoot(scope, options.cwd, options.repo);

  if (scope === "global") {
    await installGlobalSkills({
      cloneDir,
      cwd: options.cwd,
      repo: options.repo,
      selectedSkills,
    });
    return { installRoot, selectedSkills };
  }

  await installLocalProjectSkills({
    cloneDir,
    cwd: options.cwd,
    repo: options.repo,
    selectedSkills,
  });
  return { installRoot, selectedSkills };
}

export async function selectRepoSkills(options: {
  repo: RepoRef;
  selectors: string[];
  initialSelectors?: string[];
  promptForSelection?: boolean;
}): Promise<{ cloneDir: string; selectedSkills: SkillCandidate[] }> {
  const cloneDir = await shallowCloneRepo(options.repo);

  const discoveredSkills = await discoverSkills(cloneDir);
  if (discoveredSkills.length === 0) {
    throw new Error(`No SKILL.md files found in ${options.repo.display}.`);
  }

  const selectedSkills = await selectSkills(options.repo.display, discoveredSkills, {
    selectors: options.selectors,
    initialSelectors: options.initialSelectors,
    promptForSelection: options.promptForSelection,
  });

  return { cloneDir, selectedSkills };
}

export async function installGlobalSkills(options: {
  cloneDir: string;
  cwd: string;
  repo: RepoRef;
  selectedSkills: SkillCandidate[];
}): Promise<{ installRoot: string }> {
  const sourceRoot = getSourceInstallRoot(options.repo);
  const installRoot = getInstallRoot("global", options.cwd, options.repo);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.selectedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, options.selectedSkills);

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
  const installRoot = getInstallRoot("local", options.cwd, options.repo);
  await upsertInstalledSkills(options.cloneDir, sourceRoot, options.selectedSkills);
  await linkInstalledSkills(sourceRoot, installRoot, options.selectedSkills);
  await addProjectManifestSkills(
    options.cwd,
    options.selectedSkills.map(
      (skill) => `${options.repo.owner}/${options.repo.repo}/${skill.relativeDir}`,
    ),
  );

  return { installRoot };
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
