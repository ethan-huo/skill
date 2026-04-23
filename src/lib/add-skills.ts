import { stat } from "node:fs/promises";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { replaceInstalledSkills } from "./install";
import { getInstallRoot, getInstallScope } from "./paths";
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
  await assertNoConflictingGlobalInstall(options.cwd, scope, options.repo);
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
  const installRoot = getInstallRoot(scope, options.cwd, options.repo);

  await replaceInstalledSkills(cloneDir, installRoot, selectedSkills);
  return { installRoot, selectedSkills };
}

async function assertNoConflictingGlobalInstall(
  cwd: string,
  scope: ReturnType<typeof getInstallScope>,
  repo: RepoRef,
): Promise<void> {
  if (scope !== "local") {
    return;
  }

  const globalInstallRoot = getInstallRoot("global", cwd, repo);
  const existing = await stat(globalInstallRoot).catch(() => null);
  if (!existing?.isDirectory()) {
    return;
  }

  throw new Error(
    `Global install already exists at ${globalInstallRoot}. Remove it before installing the same repo locally.`,
  );
}
