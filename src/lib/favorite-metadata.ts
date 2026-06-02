import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { fetchRepoDescription, GitHubNotFoundError } from "./github";
import { parseRepoRef } from "./repo-ref";
import { readSkillDescription } from "./skill-frontmatter";
import type { FavoriteRef } from "../types";

export type FavoriteMetadata = {
  description: string;
  updatedAt: string;
};

export class FavoriteMissingError extends Error {}

export async function loadFavoriteMetadata(favorite: FavoriteRef): Promise<FavoriteMetadata> {
  const repo = parseRepoRef(`${favorite.owner}/${favorite.repo}`);
  const repoDescription = await fetchRepoDescription(repo).catch((error: unknown) => {
    if (error instanceof GitHubNotFoundError) {
      throw new FavoriteMissingError(error.message);
    }

    throw error;
  });

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
