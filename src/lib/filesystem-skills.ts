import { stat } from "node:fs/promises";
import { basename, join } from "node:path";

import { ensureGlobalClaudeSkillsLink, ensureProjectClaudeSkillsLink } from "./claude-skills";
import { discoverSkillGroups, groupSkillCandidates } from "./discover-skills";
import { linkSkillDirectories } from "./install";
import { listInstalledSkills } from "./installed-skills";
import { getInstallScope, getSkillsBaseDir } from "./paths";
import { addScopeManifestSkills } from "./project-manifest";
import { selectSkills } from "./select-skills";
import { formatFilesystemSkillId } from "./skill-ref";
import { validateSkillSelectorName } from "./skill-selector";
import type { FilesystemSourceTarget } from "./source-ref";
import type { ManifestSkill } from "./project-manifest";
import type { RepoRef } from "../types";
import type { SkillCandidate, SkillGroup, SkillSelector } from "../types";

export async function installFilesystemSkills(options: {
  cwd: string;
  global: boolean;
  source: FilesystemSourceTarget;
  selectors: SkillSelector[];
}): Promise<{ installRoot: string; selectedSkills: SkillCandidate[] }> {
  const groups = normalizeRootSkill(
    await discoverSkillGroups(options.source.path),
    basename(options.source.path),
  );
  if (groups.length === 0) {
    throw new Error(`No SKILL.md files found in ${options.source.path}.`);
  }

  const scope = getInstallScope(options.global);
  const initialSelectors =
    options.selectors.length > 0
      ? []
      : (await listInstalledSkills(options.cwd))
          .filter(
            (skill) =>
              skill.scope === scope &&
              skill.owner === options.source.repo.owner &&
              skill.repo === options.source.repo.repo,
          )
          .map((skill) => skill.relativeDir);
  const selection = await selectSkills(options.source.repo.display, groups, {
    selectors: options.selectors,
    initialSelectors,
    offerMap: false,
  });
  if (selection.mode !== "skills") {
    throw new Error("Filesystem sources do not support repo maps.");
  }

  if (scope === "local") {
    const selectedIds = new Set(selection.skills.map((skill) => skill.relativeDir));
    const conflicts = (await listInstalledSkills(options.cwd))
      .filter(
        (skill) =>
          skill.scope === "global" &&
          skill.owner === options.source.repo.owner &&
          skill.repo === options.source.repo.repo &&
          selectedIds.has(skill.relativeDir),
      )
      .map((skill) => skill.id)
      .sort();
    if (conflicts.length > 0) {
      throw new Error(
        `Global install already contains selected skill(s): ${conflicts.join(", ")}. Remove them before installing the same skill locally.`,
      );
    }
  }

  const installRoot = getSkillsBaseDir(scope, options.cwd);
  const links = selection.skills.map((skill) => ({
    relativeDir: skill.relativeDir,
    sourcePath: join(options.source.path, skill.sourceDir),
  }));
  await linkSkillDirectories(installRoot, options.source.repo, links);
  await (scope === "global"
    ? ensureGlobalClaudeSkillsLink(options.cwd)
    : ensureProjectClaudeSkillsLink(options.cwd));
  // Absolute skill origins let restore rebuild direct links without inventing a second cache.
  await addScopeManifestSkills(
    scope,
    options.cwd,
    `${options.source.repo.owner}/${options.source.repo.repo}`,
    links.map((skill) => ({ id: skill.relativeDir, source: skill.sourcePath })),
  );

  return { installRoot, selectedSkills: selection.skills };
}

export async function isUsableFilesystemSkill(path: string): Promise<boolean> {
  return (await stat(join(path, "SKILL.md")).catch(() => null))?.isFile() === true;
}

export async function restoreFilesystemSkills(options: {
  cwd: string;
  global: boolean;
  repo: RepoRef;
  skills: ManifestSkill[];
}): Promise<{ restored: string[]; missing: string[] }> {
  const scope = getInstallScope(options.global);
  const restored: string[] = [];
  const missing: string[] = [];
  const links: Array<{ relativeDir: string; sourcePath: string }> = [];

  for (const skill of options.skills) {
    const id = skill.source
      ? formatFilesystemSkillId(skill.source)
      : `${options.repo.owner}/${options.repo.repo}/${skill.id}`;
    if (!skill.source || !(await isUsableFilesystemSkill(skill.source))) {
      missing.push(id);
      continue;
    }
    links.push({ relativeDir: skill.id, sourcePath: skill.source });
    restored.push(id);
  }

  if (links.length > 0) {
    await linkSkillDirectories(getSkillsBaseDir(scope, options.cwd), options.repo, links);
    await (scope === "global"
      ? ensureGlobalClaudeSkillsLink(options.cwd)
      : ensureProjectClaudeSkillsLink(options.cwd));
  }

  return { restored, missing };
}

function normalizeRootSkill(groups: SkillGroup[], sourceName: string): SkillGroup[] {
  const root = groups.find((group) => group.relativeDir === "root");
  if (!root) {
    return groups;
  }
  const skillId = validateSkillSelectorName(sourceName.toLowerCase(), "skill");
  return groupSkillCandidates(
    groups.flatMap((group) =>
      group === root
        ? group.candidates.map((candidate) => ({
            ...candidate,
            relativeDir: skillId,
            displayLabel: skillId,
          }))
        : group.candidates,
    ),
  );
}
