import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { fmt } from "argc/terminal";

import { removeFavoritesForRepo } from "../lib/favorites";
import { pruneEmptyParents, removeInstalledSkill, removeVisibleRepoSkills } from "../lib/install";
import { listInstalledSkills } from "../lib/installed-skills";
import {
  getInstallScope,
  getLegacyVisibleSkillRoot,
  getProjectManifestPath,
  getSkillsBaseDir,
  getVisibleRepoDirPrefix,
  getVisibleSkillRoot,
} from "../lib/paths";
import {
  readProjectManifest,
  removeProjectManifestRepo,
  removeProjectManifestSkillIds,
  writeProjectManifest,
} from "../lib/project-manifest";
import { searchableMultiselect } from "../lib/prompt";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import { removeSourceRepo } from "../lib/source-skills";
import type { RemoveInput } from "../types";

export async function runRemove(args: { input: RemoveInput }): Promise<void> {
  const input = args.input;
  const refs = input.repo.length > 0 ? input.repo : await selectInstalledSkillRefs(input.global);
  for (const ref of refs) {
    await removeRef(ref, input.global);
  }
}

async function removeRef(ref: string, global: boolean): Promise<void> {
  const target = parseRepoSkillTarget(ref);
  const repo = target.repo;
  const scope = getInstallScope(global);
  const skillsBaseDir = getSkillsBaseDir(scope, process.cwd());
  const targetPath = target.skill
    ? getVisibleSkillRoot(scope, process.cwd(), repo, target.skill)
    : `${skillsBaseDir}/${getVisibleRepoDirPrefix(repo)}*`;
  const legacyTargetPath = target.skill
    ? getLegacyVisibleSkillRoot(scope, process.cwd(), repo, target.skill)
    : null;
  const removed = target.skill
    ? (await removeInstalledSkill(targetPath)) ||
      (legacyTargetPath !== null && (await removeInstalledSkill(legacyTargetPath)))
    : await removeVisibleRepoSkills(skillsBaseDir, repo);
  const removedManifest = global
    ? false
    : await removeProjectManifestRef(process.cwd(), `${repo.owner}/${repo.repo}`, target.skill);
  const removedSource = global && !target.skill ? await removeSourceRepo(repo) : false;
  const removedFavorites = global && !target.skill ? await removeFavoritesForRepo(repo) : [];

  if (!removed && !removedManifest && !removedSource && removedFavorites.length === 0) {
    throw new Error(`Nothing installed at ${targetPath}`);
  }

  await pruneEmptyParents(dirname(targetPath), skillsBaseDir);
  if (target.skill) {
    console.log(`Removed ${repo.display}/${target.skill} from ${skillsBaseDir}`);
    return;
  }

  const removedTargets = [
    removed ? `${scope} skills` : null,
    removedManifest ? "project manifest" : null,
    removedSource ? "shared source" : null,
    removedFavorites.length > 0 ? "favorites" : null,
  ].filter((target): target is string => target !== null);
  console.log(`Removed ${repo.display} from ${removedTargets.join(", ")}`);
}

async function removeProjectManifestRef(
  cwd: string,
  repoId: string,
  skill: string | undefined,
): Promise<boolean> {
  if (!existsSync(getProjectManifestPath(cwd))) {
    return false;
  }

  const manifest = await readProjectManifest(cwd);
  const next = skill
    ? removeProjectManifestSkillIds(manifest, [`${repoId}/${skill}`])
    : removeProjectManifestRepo(manifest, repoId);

  if (JSON.stringify(next) === JSON.stringify(manifest)) {
    return false;
  }

  await writeProjectManifest(cwd, next);
  return true;
}

async function selectInstalledSkillRefs(global: boolean): Promise<string[]> {
  const scope = getInstallScope(global);
  const installedSkills = (await listInstalledSkills(process.cwd())).filter(
    (skill) => skill.scope === scope,
  );

  if (installedSkills.length === 0) {
    console.log(fmt.info(`No ${scope} skills are installed.`));
    return [];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive remove requires a TTY or explicit refs.");
  }

  const response = await searchableMultiselect({
    message: `Select ${scope} skills to remove`,
    options: installedSkills.map((skill) => ({
      label: skill.description ? `${skill.id} (${skill.description})` : skill.id,
      value: skill.id,
    })),
    required: true,
  });

  return [...response];
}
