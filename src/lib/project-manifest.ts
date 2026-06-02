import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { getProjectManifestPath } from "./paths";
import { parseFavoriteRef } from "./repo-ref";

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

export async function readProjectManifest(cwd: string): Promise<ProjectManifest> {
  const filePath = getProjectManifestPath(cwd);
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
    throw new Error(`Invalid project skill manifest at ${filePath}.`);
  }
}

export async function writeProjectManifest(cwd: string, manifest: ProjectManifest): Promise<void> {
  const filePath = getProjectManifestPath(cwd);
  const next = normalizeProjectManifest(manifest);

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function addProjectManifestSkills(cwd: string, skillIds: string[]): Promise<void> {
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, addSkillIdsToManifest(manifest, skillIds));
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

function addSkillIdsToManifest(manifest: ProjectManifest, skillIds: string[]): ProjectManifest {
  const nextItems = [...manifest.items];
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
  if (manifest.items.some((item) => item.type === "map" && item.repo === repoId)) {
    return normalizeProjectManifest(manifest);
  }

  return normalizeProjectManifest({
    version: 2,
    items: [...manifest.items, { type: "map", repo: repoId }],
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
