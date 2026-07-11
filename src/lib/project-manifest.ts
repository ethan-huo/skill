import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  getManifestPath,
  getProjectManifestPath,
  getVisibleMapDirName,
  getVisibleSkillDirName,
} from "./paths";
import { parseFavoriteRef, parseRepoRef } from "./repo-ref";
import type { InstallScope } from "../types";

const GITIGNORE_BEGIN = "# BEGIN skill managed entries";
const GITIGNORE_END = "# END skill managed entries";

export type ProjectManifestV1 = {
  skills: string[];
};

export type ProjectManifestSkillsItem = {
  type: "skills";
  repo: string;
  skills: string[];
};

export type ProjectManifestMapItem = {
  type: "map";
  repo: string;
};

export type ProjectManifestItem = ProjectManifestSkillsItem | ProjectManifestMapItem;

export type ProjectManifest = {
  version: 2;
  items: ProjectManifestItem[];
};

export async function readScopeManifest(
  scope: InstallScope,
  cwd: string,
): Promise<ProjectManifest> {
  return readManifestFile(getManifestPath(scope, cwd), scope);
}

export async function readProjectManifest(cwd: string): Promise<ProjectManifest> {
  return readManifestFile(getProjectManifestPath(cwd), "local");
}

async function readManifestFile(filePath: string, scope: InstallScope): Promise<ProjectManifest> {
  const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (raw === null) {
    return { version: 2, items: [] };
  }

  const data = JSON.parse(raw) as unknown;
  if (isProjectManifestV2(data)) {
    return normalizeProjectManifest(data);
  }

  if (isProjectManifestV1(data)) {
    return normalizeProjectManifest(migrateProjectManifestV1(data));
  }

  if (isEmptyProjectManifest(data)) {
    return { version: 2, items: [] };
  }

  {
    throw new Error(`Invalid ${scope} skill manifest at ${filePath}.`);
  }
}

export async function writeScopeManifest(
  scope: InstallScope,
  cwd: string,
  manifest: ProjectManifest,
): Promise<void> {
  const next = normalizeProjectManifest(manifest);
  const manifestPath = getManifestPath(scope, cwd);
  // Validate user-owned ignore content before committing the manifest mutation.
  const projectGitignore =
    scope === "local" ? await renderProjectGitignore(dirname(manifestPath), next) : null;

  await writeManifestFile(manifestPath, next);
  if (projectGitignore !== null) {
    await writeFile(projectGitignore.path, projectGitignore.contents);
  }
}

export async function writeProjectManifest(cwd: string, manifest: ProjectManifest): Promise<void> {
  await writeScopeManifest("local", cwd, manifest);
}

async function writeManifestFile(filePath: string, manifest: ProjectManifest): Promise<void> {
  const next = normalizeProjectManifest(manifest);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

async function renderProjectGitignore(
  skillsRoot: string,
  manifest: ProjectManifest,
): Promise<{ path: string; contents: string }> {
  const path = `${skillsRoot}/.gitignore`;
  const existing = await readFile(path, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  });
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const lines = existing.length === 0 ? [] : existing.replace(/\r?\n$/, "").split(/\r?\n/);
  const beginIndexes = findLineIndexes(lines, GITIGNORE_BEGIN);
  const endIndexes = findLineIndexes(lines, GITIGNORE_END);

  if (
    beginIndexes.length !== endIndexes.length ||
    beginIndexes.length > 1 ||
    (beginIndexes.length === 1 && beginIndexes[0]! >= endIndexes[0]!)
  ) {
    throw new Error(`Invalid skill managed block at ${path}.`);
  }

  const block = [GITIGNORE_BEGIN, ...getManagedIgnoreRules(manifest), GITIGNORE_END];
  if (beginIndexes.length === 1) {
    lines.splice(beginIndexes[0]!, endIndexes[0]! - beginIndexes[0]! + 1, ...block);
  } else {
    if (lines.length > 0 && lines.at(-1) !== "") {
      lines.push("");
    }
    lines.push(...block);
  }

  return { path, contents: `${lines.join(eol)}${eol}` };
}

function findLineIndexes(lines: string[], target: string): number[] {
  const indexes: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (line === target) {
      indexes.push(index);
    }
  }
  return indexes;
}

function getManagedIgnoreRules(manifest: ProjectManifest): string[] {
  const rules: string[] = [];
  for (const item of manifest.items) {
    const repo = parseRepoRef(item.repo);
    if (item.type === "map") {
      rules.push(`/${escapeGitignoreLiteral(getVisibleMapDirName(repo))}`);
      continue;
    }

    for (const skill of item.skills) {
      rules.push(`/${escapeGitignoreLiteral(getVisibleSkillDirName(repo, skill))}`);
    }
  }
  return rules.sort();
}

function escapeGitignoreLiteral(value: string): string {
  return value.replace(/[\\!#*?[\] ]/g, "\\$&");
}

export async function addScopeManifestSkills(
  scope: InstallScope,
  cwd: string,
  skillIds: string[],
): Promise<void> {
  const manifest = await readScopeManifest(scope, cwd);
  await writeScopeManifest(scope, cwd, addSkillIdsToManifest(manifest, skillIds));
}

export async function addProjectManifestSkills(cwd: string, skillIds: string[]): Promise<void> {
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, addSkillIdsToManifest(manifest, skillIds));
}

export async function addScopeManifestMap(
  scope: InstallScope,
  cwd: string,
  repoId: string,
): Promise<void> {
  const manifest = await readScopeManifest(scope, cwd);
  await writeScopeManifest(scope, cwd, addMapToManifest(manifest, repoId));
}

export async function addProjectManifestMap(cwd: string, repoId: string): Promise<void> {
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, addMapToManifest(manifest, repoId));
}

export function getProjectManifestSkillIds(manifest: ProjectManifest): string[] {
  const skillIds: string[] = [];
  for (const item of manifest.items) {
    if (item.type !== "skills") {
      continue;
    }

    for (const skill of item.skills) {
      skillIds.push(`${item.repo}/${skill}`);
    }
  }

  return skillIds.sort();
}

export function getProjectManifestMapRepos(manifest: ProjectManifest): string[] {
  return manifest.items
    .filter((item): item is ProjectManifestMapItem => item.type === "map")
    .map((item) => item.repo)
    .sort();
}

export function removeProjectManifestSkillIds(
  manifest: ProjectManifest,
  missingSkillIds: string[],
): ProjectManifest {
  if (missingSkillIds.length === 0) {
    return manifest;
  }

  const missing = new Set(missingSkillIds);
  const nextItems = manifest.items
    .map((item): ProjectManifestItem | null => {
      if (item.type !== "skills") {
        return item;
      }

      const skills = item.skills.filter((skill) => !missing.has(`${item.repo}/${skill}`));
      return skills.length > 0 ? { ...item, skills } : null;
    })
    .filter((item): item is ProjectManifestItem => item !== null);

  return normalizeProjectManifest({ version: 2, items: nextItems });
}

export function removeProjectManifestRepo(
  manifest: ProjectManifest,
  repoId: string,
): ProjectManifest {
  return normalizeProjectManifest({
    version: 2,
    items: manifest.items.filter((item) => item.repo !== repoId),
  });
}

function addSkillIdsToManifest(manifest: ProjectManifest, skillIds: string[]): ProjectManifest {
  const skillRepos = new Set<string>();
  for (const skillId of skillIds) {
    const favorite = parseFavoriteRef(skillId);
    if (!favorite.skill) {
      throw new Error(`Project skill manifest entry must use owner/repo/skill: ${skillId}`);
    }

    skillRepos.add(`${favorite.owner}/${favorite.repo}`);
  }

  const nextItems = manifest.items.filter(
    (item) => item.type !== "map" || !skillRepos.has(item.repo),
  );
  for (const skillId of skillIds) {
    const favorite = parseFavoriteRef(skillId);
    if (!favorite.skill) {
      throw new Error(`Project skill manifest entry must use owner/repo/skill: ${skillId}`);
    }

    const repo = `${favorite.owner}/${favorite.repo}`;
    const current = nextItems.find(
      (item): item is ProjectManifestSkillsItem => item.type === "skills" && item.repo === repo,
    );
    if (current) {
      current.skills.push(favorite.skill);
      continue;
    }

    nextItems.push({ type: "skills", repo, skills: [favorite.skill] });
  }

  return normalizeProjectManifest({ version: 2, items: nextItems });
}

function addMapToManifest(manifest: ProjectManifest, repoId: string): ProjectManifest {
  const nextItems = manifest.items.filter((item) => item.repo !== repoId);

  return normalizeProjectManifest({
    version: 2,
    items: [...nextItems, { type: "map", repo: repoId }],
  });
}

function migrateProjectManifestV1(manifest: ProjectManifestV1): ProjectManifest {
  return addSkillIdsToManifest({ version: 2, items: [] }, manifest.skills);
}

function normalizeProjectManifest(manifest: ProjectManifest): ProjectManifest {
  const skillsByRepo = new Map<string, string[]>();
  const maps = new Set<string>();

  for (const item of manifest.items) {
    if (item.type === "map") {
      maps.add(item.repo);
      skillsByRepo.delete(item.repo);
      continue;
    }

    if (maps.has(item.repo)) {
      continue;
    }

    const current = skillsByRepo.get(item.repo) ?? [];
    current.push(...item.skills);
    skillsByRepo.set(item.repo, current);
  }

  const items: ProjectManifestItem[] = [];
  for (const [repo, skills] of [...skillsByRepo.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    const nextSkills = [...new Set(skills)].sort();
    if (nextSkills.length > 0) {
      items.push({ type: "skills", repo, skills: nextSkills });
    }
  }

  for (const repo of [...maps].sort()) {
    items.push({ type: "map", repo });
  }

  return { version: 2, items };
}

function isProjectManifestV1(data: unknown): data is ProjectManifestV1 {
  return (
    typeof data === "object" &&
    data !== null &&
    !("version" in data) &&
    Array.isArray((data as { skills?: unknown }).skills) &&
    (data as { skills: unknown[] }).skills.every((skill) => typeof skill === "string")
  );
}

function isProjectManifestV2(data: unknown): data is ProjectManifest {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { version?: unknown }).version === 2 &&
    Array.isArray((data as { items?: unknown }).items) &&
    (data as { items: unknown[] }).items.every(isProjectManifestItem)
  );
}

function isProjectManifestItem(data: unknown): data is ProjectManifestItem {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  const item = data as { type?: unknown; repo?: unknown; skills?: unknown };
  if (item.type === "map") {
    return typeof item.repo === "string";
  }

  return (
    item.type === "skills" &&
    typeof item.repo === "string" &&
    Array.isArray(item.skills) &&
    item.skills.every((skill) => typeof skill === "string")
  );
}

function isEmptyProjectManifest(data: unknown): boolean {
  return typeof data === "object" && data !== null && Object.keys(data).length === 0;
}
