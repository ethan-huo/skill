import { basename, dirname, join, posix, relative } from "node:path";

import type { SkillCandidate } from "../types";

const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", ".next", "target"]);
const IGNORED_ROOTS = new Set([
  ".agents",
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
const ROOT_SKILL_ID = "root";

export async function discoverSkills(repoDir: string): Promise<SkillCandidate[]> {
  const glob = new Bun.Glob("**/SKILL.md");
  const discovered = new Map<string, SkillCandidate>();

  // `**/SKILL.md` only matches descendants, but a repository root is also a valid skill bundle.
  if (await Bun.file(join(repoDir, "SKILL.md")).exists()) {
    addCandidate(discovered, {
      relativeDir: ROOT_SKILL_ID,
      sourceDir: ".",
      displayLabel: ROOT_SKILL_ID,
    });
  }

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
    addCandidate(discovered, nextSkill);
  }

  return [...discovered.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );
}

function addCandidate(discovered: Map<string, SkillCandidate>, nextSkill: SkillCandidate): void {
  const currentSkill = discovered.get(nextSkill.relativeDir);

  // Some repos duplicate the same skill for multiple agents. Pick one stable source
  // so the installed layout remains `owner/repo/folder` instead of mirroring upstream.
  if (!currentSkill || compareCandidate(nextSkill, currentSkill) < 0) {
    discovered.set(nextSkill.relativeDir, nextSkill);
  }
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

  if (sourceDir.startsWith("skills/")) {
    return 1;
  }

  if (sourceDir.startsWith("source/skills/")) {
    return 2;
  }

  return 3;
}
