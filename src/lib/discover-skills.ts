import { dirname, posix, relative } from "node:path";

import type { SkillCandidate } from "../types";

const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", ".next", "target"]);

export async function discoverSkills(repoDir: string): Promise<SkillCandidate[]> {
  const glob = new Bun.Glob("**/SKILL.md");
  const seen = new Set<string>();
  const skills: SkillCandidate[] = [];

  for await (const match of glob.scan({
    cwd: repoDir,
    onlyFiles: true,
    absolute: true,
    dot: true,
    followSymlinks: false,
  })) {
    const skillDir = dirname(match);
    const relativeDir = toPortableRelative(repoDir, skillDir);
    if (!relativeDir || shouldIgnore(relativeDir) || seen.has(relativeDir)) {
      continue;
    }

    seen.add(relativeDir);
    skills.push({
      relativeDir,
      displayLabel: relativeDir,
    });
  }

  return skills.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir));
}

function toPortableRelative(rootDir: string, targetDir: string): string {
  const relativePath = relative(rootDir, targetDir);
  if (!relativePath || relativePath.startsWith("..")) {
    return "";
  }

  return relativePath.split("\\").join(posix.sep);
}

function shouldIgnore(relativeDir: string): boolean {
  const segments = relativeDir.split("/");
  return segments.some((segment) => IGNORED_SEGMENTS.has(segment));
}
