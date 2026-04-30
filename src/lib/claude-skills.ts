import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getClaudeSkillRoot } from "./paths";
import type { RepoRef, SkillCandidate } from "../types";

export async function linkClaudeSkillsIfAvailable(options: {
  claudeRoot: string;
  repo: RepoRef;
  sourceRoot: string;
  selectedSkills: SkillCandidate[];
}): Promise<string[] | null> {
  const claudeRoot = await stat(options.claudeRoot).catch(() => null);
  if (!claudeRoot?.isDirectory()) {
    return null;
  }

  const installRoots: string[] = [];
  for (const skill of options.selectedSkills) {
    const installRoot = getClaudeSkillRoot(options.claudeRoot, options.repo, skill.relativeDir);
    await mkdir(dirname(installRoot), { recursive: true });
    await rm(installRoot, { force: true, recursive: true });
    await symlink(join(options.sourceRoot, skill.relativeDir), installRoot, "dir");
    installRoots.push(installRoot);
  }

  return installRoots;
}
