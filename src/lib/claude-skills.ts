import { mkdir, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";

import { getSkillsBaseDir, getProjectClaudeRoot, getGlobalClaudeRoot } from "./paths";

export async function ensureProjectClaudeSkillsLink(cwd: string): Promise<string> {
  return ensureClaudeSkillsLink({
    agentsSkillsRoot: getSkillsBaseDir("local", cwd),
    claudeRoot: getProjectClaudeRoot(cwd),
  });
}

export async function ensureGlobalClaudeSkillsLink(cwd: string): Promise<string> {
  return ensureClaudeSkillsLink({
    agentsSkillsRoot: getSkillsBaseDir("global", cwd),
    claudeRoot: getGlobalClaudeRoot(),
  });
}

export async function ensureClaudeSkillsLink(options: {
  agentsSkillsRoot: string;
  claudeRoot: string;
}): Promise<string> {
  const claudeSkillsRoot = join(options.claudeRoot, "skills");
  const existingTarget = await stat(claudeSkillsRoot).catch(() => null);
  if (existingTarget?.isDirectory()) {
    return claudeSkillsRoot;
  }

  await mkdir(options.agentsSkillsRoot, { recursive: true });
  await mkdir(options.claudeRoot, { recursive: true });
  await rm(claudeSkillsRoot, { force: true, recursive: true });
  // Keep roots relocatable; .claude/skills should be an entrypoint, not a second root.
  await symlink("../.agents/skills", claudeSkillsRoot, "dir");
  return claudeSkillsRoot;
}
