import { stat } from "node:fs/promises";

import { discoverSkills } from "../lib/discover-skills";
import { shallowCloneRepo } from "../lib/git";
import { replaceInstalledSkills } from "../lib/install";
import { getInstallRoot, getInstallScope } from "../lib/paths";
import { parseAddTarget, parseRepoRef } from "../lib/repo-ref";
import { selectSkills } from "../lib/select-skills";
import type { AddInput } from "../types";

export async function runAdd(args: { input: AddInput }): Promise<void> {
  const input = args.input;
  const target = parseAddTarget(input.repo);
  const repo = target.repo;
  const scope = getInstallScope(input.global);
  await assertNoConflictingGlobalInstall(scope, repo);
  const cloneDir = await shallowCloneRepo(repo);
  const selectors = normalizeSelectors(input.skill, target.skill);

  const discoveredSkills = await discoverSkills(cloneDir);
  if (discoveredSkills.length === 0) {
    throw new Error(`No SKILL.md files found in ${repo.display}.`);
  }

  const selectedSkills = await selectSkills(repo.display, discoveredSkills, selectors);
  const installRoot = getInstallRoot(scope, process.cwd(), repo);

  await replaceInstalledSkills(cloneDir, installRoot, selectedSkills);

  console.log(`Installed ${selectedSkills.length} skill(s) to ${installRoot}`);
  for (const skill of selectedSkills) {
    console.log(`- ${repo.display}/${skill.relativeDir}`);
  }
}

async function assertNoConflictingGlobalInstall(
  scope: ReturnType<typeof getInstallScope>,
  repo: ReturnType<typeof parseRepoRef>,
): Promise<void> {
  if (scope !== "local") {
    return;
  }

  const globalInstallRoot = getInstallRoot("global", process.cwd(), repo);
  const existing = await stat(globalInstallRoot).catch(() => null);
  if (!existing?.isDirectory()) {
    return;
  }

  throw new Error(
    `Global install already exists at ${globalInstallRoot}. Remove it before installing the same repo locally.`,
  );
}

function normalizeSelectors(value: string | string[], shorthandSkill?: string): string[] {
  const explicitSelectors = Array.isArray(value) ? value : value ? [value] : [];
  if (!shorthandSkill) {
    return explicitSelectors;
  }

  if (explicitSelectors.length === 0) {
    return [shorthandSkill];
  }

  const normalizedSelectors = new Set(
    explicitSelectors.map((selector) => selector.trim()).filter(Boolean),
  );
  if (normalizedSelectors.size === 1 && normalizedSelectors.has(shorthandSkill)) {
    return [shorthandSkill];
  }

  throw new Error(
    `Conflicting skill selectors: repo shorthand requested "${shorthandSkill}" but --skill provided ${explicitSelectors.join(", ")}.`,
  );
}
