import { parseRepoSkillTarget } from "./repo-ref";
import { parseCanonicalGitHubSkillRef } from "./skill-ref";
import type { RepoRef } from "../types";

export type GitHubSourceTarget = {
  kind: "github";
  repo: RepoRef;
  skill?: string;
  sourcePath?: string;
};

export function resolveSourceTarget(raw: string): GitHubSourceTarget {
  const value = raw.trim();
  const canonicalGitHubSkill = parseCanonicalGitHubSkillRef(value);
  if (canonicalGitHubSkill !== null) {
    return canonicalGitHubSkill;
  }
  return { kind: "github", ...parseRepoSkillTarget(value) };
}
