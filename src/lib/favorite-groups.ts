import { parseRepoRef } from "./repo-ref";
import type { FavoriteSkill, RepoRef } from "../types";

export type FavoriteInstallGroup = {
  repo: RepoRef;
  selectors: string[];
};

export function groupFavoritesForInstall(favorites: FavoriteSkill[]): FavoriteInstallGroup[] {
  const grouped = new Map<string, Set<string>>();

  for (const favorite of favorites) {
    const repoId = `${favorite.owner}/${favorite.repo}`;
    const current = grouped.get(repoId) ?? new Set<string>();
    current.add(favorite.skill);
    grouped.set(repoId, current);
  }

  // `add` replaces one repo install root at a time, so same-repo picks must be installed together.
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([repoId, selectors]) => ({
      repo: parseRepoRef(repoId),
      selectors: [...selectors].sort(),
    }));
}
