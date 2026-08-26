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
  return formatSkillPackageName(skill, repo.owner);
}

export function getSourceScopedVisibleSkillDirName(repo: RepoRef, skill: string): string {
  return `${normalizeSkillPath(skill)}.${normalizeSegment(repo.repo)}.${normalizeSegment(repo.owner)}`;
}

export function getVisibleMapDirName(repo: RepoRef): string {
  return formatSkillPackageName("map", repo.repo, repo.owner);
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

export function getSourceScopedVisibleSkillRoot(
  scope: InstallScope,
  cwd: string,
  repo: RepoRef,
  skill: string,
): string {
  return join(getSkillsBaseDir(scope, cwd), getSourceScopedVisibleSkillDirName(repo, skill));
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

export function getProjectManifestPath(cwd: string): string {
  return getManifestPath("local", cwd);
}

function normalizeSkillPath(skill: string): string {
  return normalizeSkillNamePart(skill);
}

function normalizeSegment(segment: string): string {
  return segment.toLowerCase();
}

function formatSkillPackageName(...parts: string[]): string {
  const name = parts.map(normalizeSkillNamePart).join("-");
  if (name.length > 64) {
    throw new Error(`Generated skill name exceeds the 64-character specification limit: ${name}`);
  }
  return name;
}

function normalizeSkillNamePart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error(`Cannot generate a valid skill name from: ${value}`);
  }
  return normalized;
}

function getHomeDir(): string {
  return process.env.HOME || homedir();
}
