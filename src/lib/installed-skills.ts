import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { getSkillsBaseDir } from "./paths";
import { readSkillDescription } from "./skill-frontmatter";
import type { InstalledRepo, InstalledSkill } from "../types";

export async function listInstalledSkills(cwd: string): Promise<InstalledSkill[]> {
  const repos = await listInstalledRepos(cwd);
  const skills = await Promise.all(repos.map((repo) => listSkillsForRepo(repo)));
  return skills
    .flat()
    .sort(
      (left, right) => left.id.localeCompare(right.id) || left.scope.localeCompare(right.scope),
    );
}

export async function listInstalledRepos(cwd: string): Promise<InstalledRepo[]> {
  const scopes = [
    { scope: "local" as const, baseDir: getSkillsBaseDir("local", cwd) },
    { scope: "global" as const, baseDir: getSkillsBaseDir("global", cwd) },
  ];

  const repos: InstalledRepo[] = [];

  for (const scopeEntry of scopes) {
    const owners = await readdir(scopeEntry.baseDir, { withFileTypes: true }).catch(() => []);

    for (const ownerEntry of owners) {
      if (!ownerEntry.isDirectory()) {
        continue;
      }

      const ownerDir = join(scopeEntry.baseDir, ownerEntry.name);
      const repoEntries = await readdir(ownerDir, { withFileTypes: true }).catch(() => []);

      for (const repoEntry of repoEntries) {
        if (!repoEntry.isDirectory()) {
          continue;
        }

        repos.push({
          owner: ownerEntry.name,
          repo: repoEntry.name,
          scope: scopeEntry.scope,
          installRoot: join(ownerDir, repoEntry.name),
        });
      }
    }
  }

  return repos.sort(
    (left, right) =>
      `${left.owner}/${left.repo}`.localeCompare(`${right.owner}/${right.repo}`) ||
      left.scope.localeCompare(right.scope),
  );
}

async function listSkillsForRepo(repo: InstalledRepo): Promise<InstalledSkill[]> {
  const relativeSkills = await discoverInstalledSkills(repo.installRoot);
  const skills = await Promise.all(
    relativeSkills.map(async (skill) => {
      const description = await readSkillDescription(
        join(repo.installRoot, skill.sourceDir, "SKILL.md"),
      ).catch(() => "");

      return {
        id: `${repo.owner}/${repo.repo}/${skill.relativeDir}`,
        owner: repo.owner,
        repo: repo.repo,
        relativeDir: skill.relativeDir,
        description,
        scope: repo.scope,
        installRoot: repo.installRoot,
      } satisfies InstalledSkill;
    }),
  );

  return skills;
}

async function discoverInstalledSkills(installRoot: string) {
  const discovered = await discoverSkills(installRoot);
  const byRelativeDir = new Map(discovered.map((skill) => [skill.relativeDir, skill]));
  const entries = await readdir(installRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const skillFile = await stat(join(installRoot, entry.name, "SKILL.md")).catch(() => null);
    if (!skillFile?.isFile()) {
      continue;
    }

    byRelativeDir.set(entry.name, {
      relativeDir: entry.name,
      sourceDir: entry.name,
      displayLabel: entry.name,
    });
  }

  return [...byRelativeDir.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );
}
