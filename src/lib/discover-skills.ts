import { basename, dirname, posix, relative } from "node:path";

import type { SkillCandidate } from "../types";

const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", ".next", "target"]);
const IGNORED_ROOTS = new Set([
  ".claude",
  ".claude-plugin",
  ".cursor",
  ".gemini",
  ".kiro",
  ".opencode",
  ".pi",
  ".rovodev",
  ".trae",
  ".trae-cn",
]);

export async function discoverSkills(repoDir: string): Promise<SkillCandidate[]> {
  const glob = new Bun.Glob("**/SKILL.md");
  const discovered = new Map<string, SkillCandidate>();

  for await (const match of glob.scan({
    cwd: repoDir,
    onlyFiles: true,
    absolute: true,
    dot: true,
    followSymlinks: false,
  })) {
    const skillDir = dirname(match);
    const sourceDir = toPortableRelative(repoDir, skillDir);
    if (!sourceDir || shouldIgnore(sourceDir)) {
      continue;
    }

    const relativeDir = basename(skillDir);
    const nextSkill = {
      relativeDir,
      sourceDir,
      displayLabel: relativeDir,
    } satisfies SkillCandidate;
    const currentSkill = discovered.get(relativeDir);

    // Some repos duplicate the same skill for multiple agents. Pick one stable source
    // so the installed layout remains `owner/repo/folder` instead of mirroring upstream.
    if (!currentSkill || compareCandidate(nextSkill, currentSkill) < 0) {
      discovered.set(relativeDir, nextSkill);
    }
  }

  return [...discovered.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );
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
  return (
    segments.some((segment) => IGNORED_SEGMENTS.has(segment)) || IGNORED_ROOTS.has(segments[0]!)
  );
}

function compareCandidate(left: SkillCandidate, right: SkillCandidate): number {
  return (
    sourcePriority(left.sourceDir) - sourcePriority(right.sourceDir) ||
    left.sourceDir.length - right.sourceDir.length ||
    left.sourceDir.localeCompare(right.sourceDir)
  );
}

function sourcePriority(sourceDir: string): number {
  if (sourceDir.startsWith(".codex/skills/")) {
    return 0;
  }

  if (sourceDir.startsWith(".agents/skills/")) {
    return 1;
  }

  if (sourceDir.startsWith("skills/")) {
    return 2;
  }

  if (sourceDir.startsWith("source/skills/")) {
    return 3;
  }

  return 4;
}
