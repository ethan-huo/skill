import { existsSync } from "node:fs";
import { readdir, readlink, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  getManifestPath,
  getSkillsBaseDir,
  getVisibleMapRoot,
  getVisibleSkillDirName,
  hasProjectScope,
} from "./paths";
import {
  addScopeManifestSkills,
  getProjectManifestMaps,
  getProjectManifestSkills,
  readScopeManifest,
} from "./project-manifest";
import { readSkillFrontmatterMetadata } from "./skill-frontmatter";
import { formatManifestSkillId } from "./skill-ref";
import { parseRepoRef } from "./repo-ref";
import type { ManifestSkill } from "./project-manifest";
import type { InstallScope, InstalledSkill } from "../types";

export async function listInstalledSkills(cwd: string): Promise<InstalledSkill[]> {
  const skills = await Promise.all(
    (["local", "global"] as const)
      .filter((scope) => scope === "global" || hasProjectScope(cwd))
      .map((scope) => listSkillsForScope(scope, getSkillsBaseDir(scope, cwd), cwd)),
  );
  return skills
    .flat()
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.scope.localeCompare(right.scope),
    );
}

// Keep routers out of the individual-skill inventory used by install and remove.
export async function listInstalledMaps(
  cwd: string,
): Promise<Pick<InstalledSkill, "name" | "description" | "scope" | "installRoot">[]> {
  const maps: Pick<InstalledSkill, "name" | "description" | "scope" | "installRoot">[] = [];
  for (const scope of ["local", "global"] as const) {
    const manifest = await readScopeManifest(scope, cwd);
    for (const item of getProjectManifestMaps(manifest)) {
      const installRoot = getVisibleMapRoot(scope, cwd, parseRepoRef(item.repo));
      const file = join(installRoot, "SKILL.md");
      if (!(await stat(file).catch(() => null))?.isFile()) {
        continue;
      }
      // Match ordinary skills: damaged metadata does not hide an existing entry.
      const metadata = await readSkillFrontmatterMetadata(file).catch(() => ({
        name: "",
        description: "",
      }));
      maps.push({
        ...metadata,
        description: item.description ?? metadata.description,
        scope,
        installRoot,
      });
    }
  }
  return maps;
}

async function listSkillsForScope(
  scope: InstallScope,
  baseDir: string,
  cwd: string,
): Promise<InstalledSkill[]> {
  const manifestSkills = getProjectManifestSkills(await readScopeManifest(scope, cwd));
  const manifestSkillsByFolder = new Map(
    manifestSkills.map((skill) => [
      getVisibleSkillDirName(parseRepoRef(skill.repo), skill.id),
      skill,
    ]),
  );
  const manifestSkillsById = new Map(
    manifestSkills.map((skill) => [`${skill.repo}/${skill.id}`, skill]),
  );
  const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const skills: InstalledSkill[] = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const installRoot = join(baseDir, entry.name);
    const linkTarget = await readlink(installRoot).catch(() => "");
    const cachedSource = parseSourceSkillLinkTarget(linkTarget);
    const recorded = manifestSkillsByFolder.get(entry.name);
    const parsed = recorded
      ? { ...parseManifestRepo(recorded.repo), skill: recorded.id }
      : (cachedSource ?? parseVisibleSkillDirName(entry.name));
    if (parsed === null) {
      continue;
    }

    const skillFile = await stat(join(installRoot, "SKILL.md")).catch(() => null);
    if (!skillFile?.isFile()) {
      continue;
    }

    const frontmatter = await readSkillFrontmatterMetadata(join(installRoot, "SKILL.md")).catch(
      () => ({ name: "", description: "" }),
    );
    const repoId = `${parsed.owner}/${parsed.repo}`;
    const manifestSkill = manifestSkillsById.get(`${repoId}/${parsed.skill}`);
    skills.push({
      id: manifestSkill
        ? formatManifestSkillId(repoId, manifestSkill)
        : `gh:${repoId}/${parsed.skill}`,
      owner: parsed.owner,
      repo: parsed.repo,
      relativeDir: parsed.skill,
      name: frontmatter.name,
      description: frontmatter.description,
      scope,
      installRoot,
    });
  }

  return skills;
}

const parseManifestRepo = parseRepoRef;

function parseSourceSkillLinkTarget(
  target: string,
): { owner: string; repo: string; skill: string } | null {
  const segments = target.split(/[\\/]+/).filter(Boolean);
  const sourceRootIndex = segments.lastIndexOf(".skills");
  if (sourceRootIndex < 0 || segments.length < sourceRootIndex + 4) {
    return null;
  }

  return {
    owner: segments[sourceRootIndex + 1]!,
    repo: segments[sourceRootIndex + 2]!,
    skill: segments.slice(sourceRootIndex + 3).join("/"),
  };
}

function parseVisibleSkillDirName(
  name: string,
): { owner: string; repo: string; skill: string } | null {
  const skillFirst = parseSkillFirstVisibleSkillDirName(name);
  if (skillFirst !== null) {
    return skillFirst;
  }

  return parseLegacyVisibleSkillDirName(name);
}

function parseSkillFirstVisibleSkillDirName(
  name: string,
): { owner: string; repo: string; skill: string } | null {
  const segments = name.split(".");
  if (segments.length < 3 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  return {
    owner: segments.at(-1)!,
    repo: segments.at(-2)!,
    skill: segments.slice(0, -2).join("/"),
  };
}

function parseLegacyVisibleSkillDirName(
  name: string,
): { owner: string; repo: string; skill: string } | null {
  const firstDot = name.indexOf(".");
  const lastDot = name.lastIndexOf(".");
  if (firstDot <= 0 || lastDot <= firstDot + 1 || lastDot === name.length - 1) {
    return null;
  }

  return {
    owner: name.slice(0, firstDot),
    repo: name.slice(firstDot + 1, lastDot),
    skill: name.slice(lastDot + 1),
  };
}

// Global links can predate the manifest. Record them before the first manifest
// write; once a manifest exists this never runs again, and unrecorded links
// would stay visible but outside update and remove.
export async function seedGlobalManifestFromVisibleLinks(cwd: string): Promise<boolean> {
  if (existsSync(getManifestPath("global", cwd))) {
    return false;
  }

  const installedSkills = (await listInstalledSkills(cwd)).filter(
    (skill) => skill.scope === "global",
  );

  if (installedSkills.length === 0) {
    return false;
  }

  const grouped = groupManifestSkills(installedSkills);
  for (const group of grouped.values()) {
    await addScopeManifestSkills("global", cwd, `${group.owner}/${group.repo}`, group.skills);
  }
  return true;
}

function groupManifestSkills(
  installedSkills: InstalledSkill[],
): Map<string, { owner: string; repo: string; skills: ManifestSkill[] }> {
  const groups = new Map<string, { owner: string; repo: string; skills: ManifestSkill[] }>();

  for (const skill of installedSkills) {
    const key = `${skill.owner}/${skill.repo}`;
    const current: { owner: string; repo: string; skills: ManifestSkill[] } = groups.get(key) ?? {
      owner: skill.owner,
      repo: skill.repo,
      skills: [],
    };
    current.skills.push({ id: skill.relativeDir });
    groups.set(key, current);
  }

  return groups;
}
