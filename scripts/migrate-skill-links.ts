#!/usr/bin/env bun
import { lstat, readFile, readlink, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  getLegacyVisibleSkillDirName,
  getSourceScopedVisibleSkillDirName,
  getVisibleSkillDirName,
} from "../src/lib/paths";
import { parseRepoRef } from "../src/lib/repo-ref";
import type { ProjectManifest, ProjectManifestSkillsItem } from "../src/lib/project-manifest";

const skillsRoot = await resolveSkillsRoot(Bun.argv[2]);
const manifest = await readManifest(skillsRoot);
const planned = manifest.items
  .filter((item): item is ProjectManifestSkillsItem => item.type === "skills")
  .flatMap((item) => {
    const repo = parseRepoRef(item.repo);
    return item.skills.map((skill) => ({
      id: skill.id,
      repo,
      visibleName: getVisibleSkillDirName(repo, skill.id),
    }));
  });

assertUniqueVisibleNames(planned);

let migrated = 0;
for (const skill of planned) {
  const visiblePath = join(skillsRoot, skill.visibleName);
  const aliases = [
    ...new Set([
      getSourceScopedVisibleSkillDirName(skill.repo, skill.id),
      getLegacyVisibleSkillDirName(skill.repo, skill.id),
      getLegacyBareVisibleSkillDirName(skill.id),
    ]),
  ].map((name) => join(skillsRoot, name));
  const existingAliases = [];
  for (const alias of aliases) {
    if (await lstat(alias).catch(() => null)) {
      existingAliases.push(alias);
    }
  }

  const visible = await lstat(visiblePath).catch(() => null);
  if (visible) {
    if (!visible.isSymbolicLink()) {
      throw new Error(`Normalized skill folder is occupied by a non-link: ${visiblePath}`);
    }
    const visibleTarget = await readlink(visiblePath);
    for (const alias of existingAliases) {
      if (!(await lstat(alias)).isSymbolicLink()) {
        throw new Error(`Legacy skill alias is occupied by a non-link: ${alias}`);
      }
      await rm(alias);
      migrated += 1;
      console.log(`${alias} removed; current link is ${visiblePath} -> ${visibleTarget}`);
    }
    continue;
  }

  if (existingAliases.length === 0) {
    throw new Error(
      `Manifest skill has no visible link to migrate: ${skill.repo.display}/${skill.id}`,
    );
  }
  if (existingAliases.length > 1) {
    const targets = new Set(await Promise.all(existingAliases.map((alias) => readlink(alias))));
    if (targets.size !== 1) {
      throw new Error(`Conflicting legacy aliases exist for ${skill.repo.display}/${skill.id}.`);
    }
  }

  const [sourceAlias, ...duplicateAliases] = existingAliases;
  await rename(sourceAlias!, visiblePath);
  for (const alias of duplicateAliases) {
    await rm(alias);
  }
  migrated += existingAliases.length;
  console.log(`${sourceAlias} -> ${visiblePath}`);
}

console.log(`Normalized ${migrated} skill link(s) in ${skillsRoot}.`);

function getLegacyBareVisibleSkillDirName(skill: string): string {
  return skill
    .split("/")
    .map((segment) => segment.toLowerCase())
    .join(".");
}

async function resolveSkillsRoot(input: string | undefined): Promise<string> {
  if (!input) {
    return join(homedir(), ".agents", "skills");
  }

  const target = resolve(input);
  const projectSkillsRoot = join(target, ".agents", "skills");
  const projectSkills = await lstat(projectSkillsRoot).catch(() => null);
  return projectSkills?.isDirectory() ? projectSkillsRoot : target;
}

async function readManifest(skillsRoot: string): Promise<ProjectManifest> {
  const manifestPath = join(skillsRoot, "manifest.json");
  const data = JSON.parse(await readFile(manifestPath, "utf8")) as Partial<ProjectManifest>;
  if (data.version !== 3 || !Array.isArray(data.items)) {
    throw new Error(`A version 3 manifest is required for safe migration: ${manifestPath}`);
  }
  return data as ProjectManifest;
}

function assertUniqueVisibleNames(planned: Array<{ id: string; visibleName: string }>): void {
  const ids = new Map<string, string>();
  for (const skill of planned) {
    const existing = ids.get(skill.visibleName);
    if (existing && existing !== skill.id) {
      throw new Error(
        `Manifest skills ${existing} and ${skill.id} both claim ${skill.visibleName}; resolve the conflict before migration.`,
      );
    }
    if (existing) {
      throw new Error(
        `Multiple sources claim skill folder ${skill.visibleName}; resolve the manifest conflict before migration.`,
      );
    }
    ids.set(skill.visibleName, skill.id);
  }
}
