import { homedir } from "node:os";
import { join } from "node:path";

import type { InstallScope, RepoRef } from "../types";

export function getInstallScope(global: boolean): InstallScope {
  return global ? "global" : "local";
}

export function getSkillsBaseDir(scope: InstallScope, cwd: string): string {
  if (scope === "global") {
    return join(homedir(), ".agents", "skills");
  }

  return join(cwd, ".agents", "skills");
}

export function getInstallRoot(scope: InstallScope, cwd: string, repo: RepoRef): string {
  return join(getSkillsBaseDir(scope, cwd), repo.owner, repo.repo);
}

export function getSourceSkillsBaseDir(): string {
  return join(homedir(), ".agents", ".skills");
}

export function getSourceInstallRoot(repo: RepoRef): string {
  return join(getSourceSkillsBaseDir(), repo.owner, repo.repo);
}

export function getClaudeRoot(): string {
  return join(homedir(), ".claude");
}

export function getProjectClaudeRoot(cwd: string): string {
  return join(cwd, ".claude");
}

export function getClaudeSkillRoot(claudeRoot: string, repo: RepoRef, skill: string): string {
  return join(claudeRoot, "skills", `${repo.owner}.${repo.repo}.${skill}`);
}

export function getProjectManifestPath(cwd: string): string {
  return join(cwd, ".agents", "skills", "manifest.json");
}
