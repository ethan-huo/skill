#!/usr/bin/env bun
import { lstat, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const skillsRoot = await resolveSkillsRoot(Bun.argv[2]);

const owners = await readdir(skillsRoot, { withFileTypes: true }).catch(() => []);
let migrated = 0;

for (const ownerEntry of owners) {
  if (!ownerEntry.isDirectory()) {
    continue;
  }

  const ownerDir = join(skillsRoot, ownerEntry.name);
  if (await hasSkillFile(ownerDir)) {
    continue;
  }

  const repos = await readdir(ownerDir, { withFileTypes: true }).catch(() => []);

  for (const repoEntry of repos) {
    if (!repoEntry.isDirectory()) {
      continue;
    }

    const repoDir = join(ownerDir, repoEntry.name);
    const skills = await collectLegacySkills(repoDir);
    if (skills.length === 0) {
      continue;
    }

    for (const skillEntry of skills) {
      const nextPath = join(skillsRoot, `${ownerEntry.name}.${repoEntry.name}.${skillEntry.name}`);
      await rm(nextPath, { force: true, recursive: true });
      await mkdir(dirname(nextPath), { recursive: true });
      await rename(skillEntry.path, nextPath);
      migrated += 1;
      console.log(`${skillEntry.path} -> ${nextPath}`);
    }

    await rm(repoDir, { force: true, recursive: true }).catch(() => {});
  }

  const remaining = await readdir(ownerDir).catch(() => []);
  if (remaining.length === 0) {
    await rm(ownerDir, { force: true, recursive: true });
  }
}

const root = await lstat(skillsRoot).catch(() => null);
if (!root?.isDirectory()) {
  console.log(`Skills root does not exist: ${skillsRoot}`);
} else {
  console.log(`Migrated ${migrated} skill link(s) in ${skillsRoot}.`);
}

async function resolveSkillsRoot(input: string | undefined): Promise<string> {
  if (!input) {
    return join(homedir(), ".agents", "skills");
  }

  const target = resolve(input);
  const projectSkillsRoot = join(target, ".agents", "skills");
  const projectSkills = await lstat(projectSkillsRoot).catch(() => null);
  if (projectSkills?.isDirectory()) {
    return projectSkillsRoot;
  }

  return target;
}

async function collectLegacySkills(root: string): Promise<{ name: string; path: string }[]> {
  const directEntries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const directSkills: { name: string; path: string }[] = [];

  for (const entry of directEntries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const path = join(root, entry.name);
    if (await hasSkillFile(path)) {
      directSkills.push({ name: entry.name, path });
    }
  }

  if (directSkills.length > 0) {
    return directSkills;
  }

  // Some early installs mirrored upstream `skills/<folder>` before IDs were normalized.
  const nestedRoot = join(root, "skills");
  const nestedEntries = await readdir(nestedRoot, { withFileTypes: true }).catch(() => []);
  const nestedSkills: { name: string; path: string }[] = [];

  for (const entry of nestedEntries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    const path = join(nestedRoot, entry.name);
    if (await hasSkillFile(path)) {
      nestedSkills.push({ name: entry.name, path });
    }
  }

  return nestedSkills;
}

async function hasSkillFile(path: string): Promise<boolean> {
  const skillFile = await stat(join(path, "SKILL.md")).catch(() => null);
  return skillFile?.isFile() ?? false;
}
