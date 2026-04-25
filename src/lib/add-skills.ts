import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { linkInstalledSkills, replaceInstalledSkills, upsertInstalledSkills } from "./install";
import {
  getClaudeSkillRoot,
  getClaudeRoot,
  getInstallRoot,
  getInstallScope,
  getSourceInstallRoot,
} from "./paths";
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
  const { cloneDir, selectedSkills } = await selectRepoSkills(options);
  const installRoot = getInstallRoot(scope, options.cwd, options.repo);

  if (scope === "global") {
    const sourceRoot = getSourceInstallRoot(options.repo);
    await upsertInstalledSkills(cloneDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, installRoot, selectedSkills);
    await linkClaudeSkillsIfAvailable({
      claudeRoot: getClaudeRoot(),
      repo: options.repo,
      selectedSkills,
      sourceRoot,
    });
    return { installRoot, selectedSkills };
  }

  await replaceInstalledSkills(cloneDir, installRoot, selectedSkills);
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

export async function linkClaudeSkillsIfAvailable(options: {
  claudeRoot: string;
  repo: RepoRef;
  sourceRoot: string;
  selectedSkills: SkillCandidate[];
}): Promise<string[] | null> {
  const claudeRoot = await stat(options.claudeRoot).catch(() => null);
  if (!claudeRoot?.isDirectory()) {
    return null;
  }

  const installRoots: string[] = [];
  for (const skill of options.selectedSkills) {
    const installRoot = getClaudeSkillRoot(options.claudeRoot, options.repo, skill.relativeDir);
    await mkdir(dirname(installRoot), { recursive: true });
    await rm(installRoot, { force: true, recursive: true });
    await symlink(join(options.sourceRoot, skill.relativeDir), installRoot, "dir");
    installRoots.push(installRoot);
  }

  return installRoots;
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
