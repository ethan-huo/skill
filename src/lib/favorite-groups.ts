import { parseRepoRef } from "./repo-ref";
import type { FavoriteRef, RepoRef } from "../types";

export type FavoriteInstallGroup = {
  repo: RepoRef;
  selectors: string[];
  promptForSelection: boolean;
};

type MutableFavoriteInstallGroup = {
  repo: RepoRef;
  selectors: Set<string>;
  promptForSelection: boolean;
};

export function groupFavoritesForInstall(favorites: FavoriteRef[]): FavoriteInstallGroup[] {
  const grouped = new Map<string, MutableFavoriteInstallGroup>();

  for (const favorite of favorites) {
    const repoId = `${favorite.owner}/${favorite.repo}`;
    const current = grouped.get(repoId) ?? {
      repo: parseRepoRef(repoId),
      selectors: new Set<string>(),
      promptForSelection: false,
    };

    if (favorite.skill) {
      current.selectors.add(favorite.skill);
    } else {
      // Repo-level favorites must drive one repo-scoped install flow; skill-level refs only seed defaults.
      current.promptForSelection = true;
    }

    grouped.set(repoId, current);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => ({
      repo: group.repo,
      selectors: [...group.selectors].sort(),
      promptForSelection: group.promptForSelection,
    }));
}
