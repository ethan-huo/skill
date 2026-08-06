import { parseRepoRef } from "./repo-ref";
import type { ManifestSkill } from "./project-manifest";
import type { RepoRef } from "../types";

export type CanonicalGitHubSkillRef = {
  kind: "github";
  repo: RepoRef;
  sourcePath: string;
};

export function formatManifestSkillId(repoId: string, skill: ManifestSkill): string {
  return formatGitHubSkillId(parseRepoRef(repoId), skill.source ?? skill.id);
}

export function formatGitHubSkillId(repo: RepoRef, sourcePath: string): string {
  return `gh:${repo.owner}/${repo.repo}/${normalizeGitHubSourcePath(sourcePath)}`;
}

export function parseCanonicalGitHubSkillRef(value: string): CanonicalGitHubSkillRef | null {
  if (!value.startsWith("gh:")) {
    return null;
  }

  const segments = value.slice(3).split("/");
  if (segments.length < 3 || segments.some((segment) => segment.length === 0)) {
    throw new Error("GitHub skill IDs use gh:<owner>/<repo>/<source-path>.");
  }

  const repo = parseRepoRef(`${segments[0]}/${segments[1]}`);
  return {
    kind: "github",
    repo,
    sourcePath: normalizeGitHubSourcePath(segments.slice(2).join("/")),
  };
}

function normalizeGitHubSourcePath(value: string): string {
  if (value === ".") {
    return value;
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Invalid GitHub skill source path: ${value}`);
  }
  return segments.join("/");
}
