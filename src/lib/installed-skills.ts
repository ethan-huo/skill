import { readdir, readlink, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { getSkillsBaseDir } from "./paths";
import { getProjectManifestSkills, readScopeManifest } from "./project-manifest";
import { readSkillFrontmatterMetadata } from "./skill-frontmatter";
import { formatManifestSkillId } from "./skill-ref";
import type { InstallScope, InstalledSkill } from "../types";

export async function listInstalledSkills(cwd: string): Promise<InstalledSkill[]> {
  const skills = await Promise.all(
    (["local", "global"] as const).map((scope) =>
      listSkillsForScope(scope, getSkillsBaseDir(scope, cwd), cwd),
    ),
  );
  return skills
    .flat()
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.scope.localeCompare(right.scope),
    );
}

async function listSkillsForScope(
  scope: InstallScope,
  baseDir: string,
  cwd: string,
): Promise<InstalledSkill[]> {
  const manifestSkills = new Map(
    getProjectManifestSkills(await readScopeManifest(scope, cwd)).map((skill) => [
      `${skill.repo}/${skill.id}`,
      skill,
    ]),
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
    const parsed = cachedSource ?? parseVisibleSkillDirName(entry.name);
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
    const manifestSkill = manifestSkills.get(`${repoId}/${parsed.skill}`);
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
      source: cachedSource === null && isAbsolute(linkTarget) ? linkTarget : undefined,
    });
  }

  return skills;
}

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
