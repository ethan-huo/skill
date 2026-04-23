import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { parseRepoRef } from "./repo-ref";
import { readSkillDescription } from "./skill-frontmatter";
import type { FavoriteRef, RepoRef } from "../types";

const GITHUB_API_BASE = "https://api.github.com";

type GitHubRepoResponse = {
  description?: unknown;
};

export type FavoriteMetadata = {
  description: string;
  updatedAt: string;
};

export class FavoriteMissingError extends Error {}

export async function loadFavoriteMetadata(favorite: FavoriteRef): Promise<FavoriteMetadata> {
  const repo = parseRepoRef(`${favorite.owner}/${favorite.repo}`);
  const repoDescription = await fetchRepoDescription(repo);

  if (!favorite.skill) {
    return {
      description: repoDescription,
      updatedAt: new Date().toISOString(),
    };
  }

  const cloneDir = await shallowCloneRepo(repo);
  const discoveredSkills = await discoverSkills(cloneDir);
  const skill = discoveredSkills.find((candidate) => candidate.relativeDir === favorite.skill);
  if (!skill) {
    throw new FavoriteMissingError(`Favorite no longer exists: ${favorite.id}`);
  }

  const skillDescription =
    (await readSkillDescription(join(cloneDir, skill.sourceDir, "SKILL.md")).catch(() => "")) ||
    repoDescription;

  return {
    description: skillDescription,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchRepoDescription(repo: RepoRef): Promise<string> {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repo.owner}/${repo.repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "skill-cli",
    },
  });

  if (response.status === 404) {
    throw new FavoriteMissingError(`Favorite no longer exists: ${repo.display}`);
  }

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as GitHubRepoResponse;
  return sanitizeDescription(typeof payload.description === "string" ? payload.description : "");
}

function sanitizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
