import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRepoSkillTarget } from "./repo-ref";
import { parseCanonicalGitHubSkillRef } from "./skill-ref";
import type { RepoRef } from "../types";

export type GitHubSourceTarget = {
  kind: "github";
  repo: RepoRef;
  skill?: string;
  sourcePath?: string;
};

export type FilesystemSourceTarget = {
  kind: "filesystem";
  path: string;
  repo: RepoRef;
};

export type SourceTarget = GitHubSourceTarget | FilesystemSourceTarget;

export async function resolveSourceTarget(raw: string, cwd: string): Promise<SourceTarget> {
  const value = raw.trim();
  const canonicalGitHubSkill = parseCanonicalGitHubSkillRef(value);
  if (canonicalGitHubSkill !== null) {
    return canonicalGitHubSkill;
  }
  // Classification must not depend on cwd contents: an existing `owner/repo` directory is
  // still GitHub syntax unless the caller uses an explicit path form.
  const path = parseFilesystemPath(value, cwd);
  if (path === null) {
    return { kind: "github", ...parseRepoSkillTarget(value) };
  }

  const canonicalPath = await realpath(path).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Filesystem skill source does not exist: ${path}`);
    }
    throw error;
  });
  const sourceStat = await stat(canonicalPath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`Filesystem skill source must be a directory: ${canonicalPath}`);
  }

  return {
    kind: "filesystem",
    path: canonicalPath,
    repo: createFilesystemRepoRef(canonicalPath),
  };
}

export function createFilesystemRepoRef(path: string): RepoRef {
  const normalizedPath = normalize(path);
  const directoryName = basename(normalizedPath);
  const label =
    directoryName.toLowerCase() === "skills" ? basename(dirname(normalizedPath)) : directoryName;
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "source";
  const hash = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 10);
  const repo = `${slug}-${hash}`;

  return {
    owner: "fs",
    repo,
    cloneUrl: "",
    display: `fs:${normalizedPath}`,
  };
}

function parseFilesystemPath(value: string, cwd: string): string | null {
  if (!value) {
    throw new Error("Skill source cannot be empty.");
  }
  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }
  if (value.startsWith("fs:")) {
    const path = value.slice(3);
    if (!path) {
      throw new Error("Filesystem skill source cannot be empty. Use fs:<path>.");
    }
    return resolvePath(path, cwd);
  }
  if (value.startsWith("~/")) {
    return resolve(homedir(), value.slice(2));
  }
  if (isAbsolute(value) || value.startsWith("./") || value.startsWith("../")) {
    return resolvePath(value, cwd);
  }
  return null;
}

function resolvePath(path: string, cwd: string): string {
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return isAbsolute(path) ? normalize(path) : resolve(cwd, path);
}
