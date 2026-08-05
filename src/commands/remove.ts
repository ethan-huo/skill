import { existsSync } from "node:fs";
import { dirname } from "node:path";

import { removeFavoritesForRepo } from "../lib/favorites";
import { pruneEmptyParents, removeInstalledSkill, removeVisibleRepoSkills } from "../lib/install";
import { listInstalledSkills } from "../lib/installed-skills";
import {
  getInstallScope,
  getLegacyVisibleSkillRoot,
  getManifestPath,
  getSkillsBaseDir,
  getVisibleRepoDirPrefix,
  getVisibleSkillRoot,
} from "../lib/paths";
import {
  getProjectManifestMapRepos,
  readScopeManifest,
  removeProjectManifestRepo,
  removeProjectManifestSkillIds,
  writeScopeManifest,
} from "../lib/project-manifest";
import { searchableMultiselect } from "../lib/prompt";
import { resolveSourceTarget } from "../lib/source-ref";
import { removeSourceRepo } from "../lib/source-skills";
import type { RemoveInput } from "../types";

type RemovePrompt = (options: {
  message: string;
  options: Array<{ label: string; value: string }>;
  required?: boolean;
}) => Promise<string[]>;

type RemoveServices = {
  searchableMultiselect?: RemovePrompt;
  isTty?: () => boolean;
};

export async function runRemove(
  args: { input: RemoveInput },
  services: RemoveServices = {},
): Promise<{ removed: Array<Awaited<ReturnType<typeof removeRef>>> }> {
  const input = args.input;
  const refs =
    input.repo.length > 0 ? input.repo : await selectInstalledSkillRefs(input.global, services);
  const removed = [];
  for (const ref of refs) {
    // Manifest writes share one file, so removals stay sequential to avoid lost updates.
    removed.push(await removeRef(ref, input.global));
  }
  return { removed };
}

async function removeRef(ref: string, global: boolean) {
  const target = await resolveSourceTarget(ref, process.cwd());
  const repo = target.repo;
  const filesystemSource = target.kind === "filesystem";
  const skill = target.kind === "github" ? target.skill : undefined;
  const scope = getInstallScope(global);
  const skillsBaseDir = getSkillsBaseDir(scope, process.cwd());
  const targetPath = skill
    ? getVisibleSkillRoot(scope, process.cwd(), repo, skill)
    : `${skillsBaseDir}/${getVisibleRepoDirPrefix(repo)}*`;
  const legacyTargetPath = skill
    ? getLegacyVisibleSkillRoot(scope, process.cwd(), repo, skill)
    : null;
  const removed = skill
    ? (await removeInstalledSkill(targetPath)) ||
      (legacyTargetPath !== null && (await removeInstalledSkill(legacyTargetPath)))
    : await removeVisibleRepoSkills(skillsBaseDir, repo);
  const removedManifest = await removeManifestRef(
    scope,
    process.cwd(),
    `${repo.owner}/${repo.repo}`,
    skill,
  );
  const removedSource =
    global && !skill && !filesystemSource ? await removeSourceRepo(repo) : false;
  const removedFavorites =
    global && !skill && !filesystemSource ? await removeFavoritesForRepo(repo) : [];

  if (!removed && !removedManifest && !removedSource && removedFavorites.length === 0) {
    throw new Error(`Nothing installed at ${targetPath}`);
  }

  await pruneEmptyParents(dirname(targetPath), skillsBaseDir);
  if (skill) {
    return {
      repo: repo.display,
      skill,
      scope,
      removed: ["visible skill", ...(removedManifest ? ["manifest"] : [])],
    };
  }

  const removedTargets = [
    removed ? `${scope} skills` : null,
    removedManifest ? "project manifest" : null,
    removedSource ? "shared source" : null,
    removedFavorites.length > 0 ? "favorites" : null,
  ].filter((target): target is string => target !== null);
  return {
    repo: repo.display,
    scope,
    removed: removedTargets,
  };
}

async function removeManifestRef(
  scope: "local" | "global",
  cwd: string,
  repoId: string,
  skill: string | undefined,
): Promise<boolean> {
  if (!existsSync(getManifestPath(scope, cwd))) {
    return false;
  }

  const manifest = await readScopeManifest(scope, cwd);
  const next = skill
    ? removeProjectManifestSkillIds(manifest, [`${repoId}/${skill}`])
    : removeProjectManifestRepo(manifest, repoId);

  if (JSON.stringify(next) === JSON.stringify(manifest)) {
    return false;
  }

  await writeScopeManifest(scope, cwd, next);
  return true;
}

async function selectInstalledSkillRefs(
  global: boolean,
  services: RemoveServices,
): Promise<string[]> {
  const scope = getInstallScope(global);
  const installedSkills = (await listInstalledSkills(process.cwd())).filter(
    (skill) => skill.scope === scope,
  );
  const mapRepos = getProjectManifestMapRepos(await readScopeManifest(scope, process.cwd()));
  const options = [
    ...installedSkills.map((skill) => ({
      label: skill.description ? `${skill.id} (${skill.description})` : skill.id,
      value: skill.id,
    })),
    // Maps are generated directories rather than source-cache symlinks, so the manifest is
    // the installed-state source of truth for exposing them in the remove selector.
    ...mapRepos.map((repo) => ({ label: `${repo} (map)`, value: repo })),
  ].sort((left, right) => left.value.localeCompare(right.value));

  if (options.length === 0) {
    return [];
  }

  const isTty = services.isTty ?? (() => Boolean(process.stdin.isTTY && process.stdout.isTTY));
  if (!isTty()) {
    throw new Error("Interactive remove requires a TTY or explicit refs.");
  }

  const selectMany =
    services.searchableMultiselect ?? ((promptOptions) => searchableMultiselect(promptOptions));
  const response = await selectMany({
    message: `Select ${scope} skills to remove`,
    options,
    required: true,
  });

  return [...response];
}
