import { rm } from "node:fs/promises";
import { dirname } from "node:path";

import { fmt } from "argc/terminal";

import { discoverSkills } from "../lib/discover-skills";
import { shallowCloneRepo } from "../lib/git";
import { pruneEmptyParents, removeInstalledRepo, replaceInstalledSkills } from "../lib/install";
import { listInstalledRepos, listInstalledSkills } from "../lib/installed-skills";
import { getInstallScope, getSkillsBaseDir } from "../lib/paths";
import { parseRepoRef } from "../lib/repo-ref";
import { diffSkillSets } from "../lib/update-diff";
import type { UpdateInput } from "../types";

export async function runUpdate(args: { input: UpdateInput }): Promise<void> {
  const input = args.input;
  const scope = getInstallScope(input.global);
  const installedRepos = (await listInstalledRepos(process.cwd())).filter(
    (repo) => repo.scope === scope,
  );

  if (installedRepos.length === 0) {
    console.log(fmt.info(`No ${scope} skills are installed.`));
    return;
  }

  const installedSkills = await listInstalledSkills(process.cwd());
  const installedByRepo = groupInstalledSkills(
    installedSkills.filter((skill) => skill.scope === scope),
  );
  const skillsBaseDir = getSkillsBaseDir(scope, process.cwd());

  for (const repo of installedRepos) {
    const repoRef = parseRepoRef(`${repo.owner}/${repo.repo}`);
    const cloneDir = await shallowCloneRepo(repoRef);

    try {
      const latestSkills = await discoverSkills(cloneDir);
      const installedIds = installedByRepo.get(repo.installRoot) ?? [];
      const latestIds = latestSkills.map((skill) => skill.relativeDir);
      const diff = diffSkillSets(installedIds, latestIds);

      console.log(fmt.info(`${repo.owner}/${repo.repo} (${scope})`));

      if (diff.updated.length > 0) {
        const selectedSkills = latestSkills.filter((skill) =>
          diff.updated.includes(skill.relativeDir),
        );
        await replaceInstalledSkills(cloneDir, repo.installRoot, selectedSkills);
      } else if (diff.removed.length > 0) {
        await removeInstalledRepo(repo.installRoot);
      }

      await pruneEmptyParents(dirname(repo.installRoot), skillsBaseDir);
      printDiff(diff);
    } finally {
      await rm(cloneDir, { recursive: true, force: true });
    }
  }
}

function groupInstalledSkills(
  skills: Awaited<ReturnType<typeof listInstalledSkills>>,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const skill of skills) {
    const current = grouped.get(skill.installRoot) ?? [];
    current.push(skill.relativeDir);
    grouped.set(skill.installRoot, current);
  }

  return grouped;
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
