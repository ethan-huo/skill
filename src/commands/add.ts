import { rm, stat } from "node:fs/promises";

import { discoverSkills } from "../lib/discover-skills";
import { shallowCloneRepo } from "../lib/git";
import { replaceInstalledSkills } from "../lib/install";
import { getInstallRoot, getInstallScope } from "../lib/paths";
import { parseRepoRef } from "../lib/repo-ref";
import { selectSkills } from "../lib/select-skills";
import type { AddInput } from "../types";

export async function runAdd(args: { input: AddInput }): Promise<void> {
  const input = args.input;
  const repo = parseRepoRef(input.repo);
  const scope = getInstallScope(input.global);
  await assertNoConflictingGlobalInstall(scope, repo);
  const cloneDir = await shallowCloneRepo(repo);
  const selectors = normalizeSelectors(input.skill);

  try {
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
  } finally {
    await rm(cloneDir, { recursive: true, force: true });
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

function normalizeSelectors(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}
