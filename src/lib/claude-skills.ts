import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

import { getSkillsBaseDir, getProjectClaudeRoot } from "./paths";

export async function ensureProjectClaudeSkillsLink(cwd: string): Promise<string> {
  const agentsSkillsRoot = getSkillsBaseDir("local", cwd);
  const claudeRoot = getProjectClaudeRoot(cwd);
  const claudeSkillsRoot = join(claudeRoot, "skills");
  const existingTarget = await stat(claudeSkillsRoot).catch(() => null);
  if (existingTarget?.isDirectory()) {
    return claudeSkillsRoot;
  }

  await mkdir(agentsSkillsRoot, { recursive: true });
  await mkdir(claudeRoot, { recursive: true });
  await rm(claudeSkillsRoot, { force: true, recursive: true });
  // Keep project checkouts relocatable; .claude/skills should be an entrypoint, not a second root.
  await symlink("../.agents/skills", claudeSkillsRoot, "dir");
  return claudeSkillsRoot;
}
