import { readdir, stat } from "node:fs/promises";
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

    const parsed = parseVisibleSkillDirName(entry.name);
    if (parsed === null) {
      continue;
    }

    const installRoot = join(baseDir, entry.name);
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

function parseVisibleSkillDirName(
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
