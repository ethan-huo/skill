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

export type ProjectManifestV2 = {
  version: 2;
  items: Array<
    | {
        type: "skills";
        repo: string;
        skills: string[];
      }
    | ProjectManifestMapItem
  >;
};

export type ManifestSkill = {
  id: string;
  source?: string;
};

export type ProjectManifestSkillsItem = {
  type: "skills";
  repo: string;
  skills: ManifestSkill[];
};

export type ProjectManifestMapItem = {
  type: "map";
  repo: string;
};

export type ProjectManifestItem = ProjectManifestSkillsItem | ProjectManifestMapItem;

export type ProjectManifest = {
  version: 3;
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
    return { version: 3, items: [] };
  }

  const data = JSON.parse(raw) as unknown;
  if (isProjectManifestV3(data)) {
    return normalizeProjectManifest(data);
  }

  if (isProjectManifestV2(data)) {
    return normalizeProjectManifest(migrateProjectManifestV2(data));
  }

  if (isProjectManifestV1(data)) {
    return normalizeProjectManifest(migrateProjectManifestV1(data));
  }

  if (isEmptyProjectManifest(data)) {
    return { version: 3, items: [] };
  }

  throw new Error(`Invalid ${scope} skill manifest at ${filePath}.`);
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
      rules.push(`/${escapeGitignoreLiteral(getVisibleSkillDirName(repo, skill.id))}`);
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
  repoId: string,
  skills: ManifestSkill[],
): Promise<void> {
  const manifest = await readScopeManifest(scope, cwd);
  await writeScopeManifest(scope, cwd, addSkillsToManifest(manifest, repoId, skills));
}

export async function addProjectManifestSkills(
  cwd: string,
  repoId: string,
  skills: ManifestSkill[],
): Promise<void> {
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, addSkillsToManifest(manifest, repoId, skills));
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
      skillIds.push(`${item.repo}/${skill.id}`);
    }
  }

  return skillIds.sort();
}

export function getProjectManifestSkills(
  manifest: ProjectManifest,
): Array<ManifestSkill & { repo: string }> {
  return manifest.items
    .filter((item): item is ProjectManifestSkillsItem => item.type === "skills")
    .flatMap((item) => item.skills.map((skill) => ({ repo: item.repo, ...skill })))
    .sort(
      (left, right) =>
        left.repo.localeCompare(right.repo) ||
        left.id.localeCompare(right.id) ||
        (left.source ?? "").localeCompare(right.source ?? ""),
    );
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

      const skills = item.skills.filter((skill) => !missing.has(`${item.repo}/${skill.id}`));
      return skills.length > 0 ? { ...item, skills } : null;
    })
    .filter((item): item is ProjectManifestItem => item !== null);

  return normalizeProjectManifest({ version: 3, items: nextItems });
}

export function removeProjectManifestRepo(
  manifest: ProjectManifest,
  repoId: string,
): ProjectManifest {
  return normalizeProjectManifest({
    version: 3,
    items: manifest.items.filter((item) => item.repo !== repoId),
  });
}

export function resolveProjectManifestSkillSources(
  manifest: ProjectManifest,
  repoId: string,
  resolvedSkills: ManifestSkill[],
): ProjectManifest {
  const resolved = new Map(
    resolvedSkills
      .filter((skill): skill is Required<ManifestSkill> => typeof skill.source === "string")
      .map((skill) => [skill.id, skill.source]),
  );
  if (resolved.size === 0) {
    return manifest;
  }

  return normalizeProjectManifest({
    version: 3,
    items: manifest.items.map((item) => {
      if (item.type !== "skills" || item.repo !== repoId) {
        return item;
      }
      return {
        ...item,
        skills: item.skills.map((skill) => {
          const source = resolved.get(skill.id);
          return source ? { id: skill.id, source } : skill;
        }),
      };
    }),
  });
}

function addSkillsToManifest(
  manifest: ProjectManifest,
  repoId: string,
  skills: ManifestSkill[],
): ProjectManifest {
  const repo = parseRepoRef(repoId);
  const normalizedRepoId = `${repo.owner}/${repo.repo}`;
  const nextItems = manifest.items.filter(
    (item) => item.type !== "map" || item.repo !== normalizedRepoId,
  );
  const current = nextItems.find(
    (item): item is ProjectManifestSkillsItem =>
      item.type === "skills" && item.repo === normalizedRepoId,
  );
  if (current) {
    current.skills.push(...skills);
  } else {
    nextItems.push({ type: "skills", repo: normalizedRepoId, skills: [...skills] });
  }

  return normalizeProjectManifest({ version: 3, items: nextItems });
}

function addMapToManifest(manifest: ProjectManifest, repoId: string): ProjectManifest {
  const nextItems = manifest.items.filter((item) => item.repo !== repoId);

  return normalizeProjectManifest({
    version: 3,
    items: [...nextItems, { type: "map", repo: repoId }],
  });
}

function migrateProjectManifestV1(manifest: ProjectManifestV1): ProjectManifest {
  const items: ProjectManifestItem[] = [];
  for (const skillId of manifest.skills) {
    const favorite = parseFavoriteRef(skillId);
    if (!favorite.skill) {
      throw new Error(`Project skill manifest entry must use owner/repo/skill: ${skillId}`);
    }
    const repo = `${favorite.owner}/${favorite.repo}`;
    const current = items.find(
      (item): item is ProjectManifestSkillsItem => item.type === "skills" && item.repo === repo,
    );
    const skill = { id: favorite.skill };
    if (current) {
      current.skills.push(skill);
    } else {
      items.push({ type: "skills", repo, skills: [skill] });
    }
  }
  return normalizeProjectManifest({ version: 3, items });
}

function migrateProjectManifestV2(manifest: ProjectManifestV2): ProjectManifest {
  return {
    version: 3,
    items: manifest.items.map((item) =>
      item.type === "map"
        ? item
        : {
            ...item,
            skills: item.skills.map((id) => ({ id })),
          },
    ),
  };
}

function normalizeProjectManifest(manifest: ProjectManifest): ProjectManifest {
  const skillsByRepo = new Map<string, Map<string, ManifestSkill>>();
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

    const current = skillsByRepo.get(item.repo) ?? new Map<string, ManifestSkill>();
    for (const skill of item.skills) {
      const previous = current.get(skill.id);
      current.set(skill.id, skill.source ? skill : (previous ?? skill));
    }
    skillsByRepo.set(item.repo, current);
  }

  const items: ProjectManifestItem[] = [];
  for (const [repo, skillsById] of [...skillsByRepo.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    const nextSkills = [...skillsById.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    if (nextSkills.length > 0) {
      items.push({ type: "skills", repo, skills: nextSkills });
    }
  }

  for (const repo of [...maps].sort()) {
    items.push({ type: "map", repo });
  }

  return { version: 3, items };
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

function isProjectManifestV3(data: unknown): data is ProjectManifest {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { version?: unknown }).version === 3 &&
    Array.isArray((data as { items?: unknown }).items) &&
    (data as { items: unknown[] }).items.every(isProjectManifestV3Item)
  );
}

function isProjectManifestV3Item(data: unknown): data is ProjectManifestItem {
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
    item.skills.every(
      (skill) =>
        typeof skill === "object" &&
        skill !== null &&
        typeof (skill as { id?: unknown }).id === "string" &&
        ((skill as { source?: unknown }).source === undefined ||
          typeof (skill as { source?: unknown }).source === "string"),
    )
  );
}

function isProjectManifestV2(data: unknown): data is ProjectManifestV2 {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { version?: unknown }).version === 2 &&
    Array.isArray((data as { items?: unknown }).items) &&
    (data as { items: unknown[] }).items.every((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return false;
      }
      const item = entry as { type?: unknown; repo?: unknown; skills?: unknown };
      if (item.type === "map") {
        return typeof item.repo === "string";
      }
      return (
        item.type === "skills" &&
        typeof item.repo === "string" &&
        Array.isArray(item.skills) &&
        item.skills.every((skill) => typeof skill === "string")
      );
    })
  );
}

function isEmptyProjectManifest(data: unknown): boolean {
  return typeof data === "object" && data !== null && Object.keys(data).length === 0;
}
