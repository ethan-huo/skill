import { readdir, readlink, stat } from "node:fs/promises";
import { join } from "node:path";

import { getSkillsBaseDir } from "./paths";
import { readSkillFrontmatterMetadata } from "./skill-frontmatter";
import type { InstallScope, InstalledSkill } from "../types";

export async function listInstalledSkills(cwd: string): Promise<InstalledSkill[]> {
  const skills = await Promise.all(
    (["local", "global"] as const).map((scope) =>
      listSkillsForScope(scope, getSkillsBaseDir(scope, cwd)),
    ),
  );
  return skills
    .flat()
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.scope.localeCompare(right.scope),
    );
}

async function listSkillsForScope(scope: InstallScope, baseDir: string): Promise<InstalledSkill[]> {
  const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => []);
  const skills: InstalledSkill[] = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const installRoot = join(baseDir, entry.name);
    const parsed =
      parseSourceSkillLinkTarget(await readlink(installRoot).catch(() => "")) ??
      parseVisibleSkillDirName(entry.name);
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
    skills.push({
      id: `${parsed.owner}/${parsed.repo}/${parsed.skill}`,
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
