import { homedir } from "node:os";
import { join } from "node:path";

import type { InstallScope, RepoRef } from "../types";

export function getInstallScope(global: boolean): InstallScope {
  return global ? "global" : "local";
}

export function getSkillsBaseDir(scope: InstallScope, cwd: string): string {
  if (scope === "global") {
    return join(getHomeDir(), ".agents", "skills");
  }

  return join(cwd, ".agents", "skills");
}

export function getManifestPath(scope: InstallScope, cwd: string): string {
  return join(getSkillsBaseDir(scope, cwd), "manifest.json");
}

export function getVisibleSkillDirName(repo: RepoRef, skill: string): string {
  return `${normalizeSkillPath(skill)}.${normalizeSegment(repo.repo)}.${normalizeSegment(repo.owner)}`;
}

export function getVisibleMapDirName(repo: RepoRef): string {
  return `map.${normalizeSegment(repo.repo)}.${normalizeSegment(repo.owner)}`;
}

export function getLegacyVisibleSkillDirName(repo: RepoRef, skill: string): string {
  return `${repo.owner}.${repo.repo}.${skill}`;
}

export function getLegacyVisibleMapDirName(repo: RepoRef): string {
  return `${repo.owner}.${repo.repo}.map`;
}

export function getVisibleRepoDirPrefix(repo: RepoRef): string {
  return `${normalizeSegment(repo.repo)}.${normalizeSegment(repo.owner)}`;
}

export function getVisibleSkillRoot(
  scope: InstallScope,
  cwd: string,
  repo: RepoRef,
  skill: string,
): string {
  return join(getSkillsBaseDir(scope, cwd), getVisibleSkillDirName(repo, skill));
}

export function getVisibleMapRoot(scope: InstallScope, cwd: string, repo: RepoRef): string {
  return join(getSkillsBaseDir(scope, cwd), getVisibleMapDirName(repo));
}

export function getLegacyVisibleSkillRoot(
  scope: InstallScope,
  cwd: string,
  repo: RepoRef,
  skill: string,
): string {
  return join(getSkillsBaseDir(scope, cwd), getLegacyVisibleSkillDirName(repo, skill));
}

export function getLegacyVisibleMapRoot(scope: InstallScope, cwd: string, repo: RepoRef): string {
  return join(getSkillsBaseDir(scope, cwd), getLegacyVisibleMapDirName(repo));
}

export function getSourceSkillsBaseDir(): string {
  return join(getHomeDir(), ".agents", ".skills");
}

export function getSourceInstallRoot(repo: Pick<RepoRef, "owner" | "repo">): string {
  return join(getSourceSkillsBaseDir(), repo.owner, repo.repo);
}

export function getProjectClaudeRoot(cwd: string): string {
  return join(cwd, ".claude");
}

export function getGlobalClaudeRoot(): string {
  return join(getHomeDir(), ".claude");
}

export function getProjectManifestPath(cwd: string): string {
  return getManifestPath("local", cwd);
}

function normalizeSkillPath(skill: string): string {
  return skill
    .split("/")
    .map((segment) => normalizeSegment(segment))
    .join(".");
}

function normalizeSegment(segment: string): string {
  return segment.toLowerCase();
}

function getHomeDir(): string {
  return process.env.HOME || homedir();
}
