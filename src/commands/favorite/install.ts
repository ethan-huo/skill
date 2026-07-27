import { installRepoSkills } from "../../lib/add-skills";
import { groupFavoritesForInstall } from "../../lib/favorite-groups";
import { listFavorites } from "../../lib/favorites";
import { resolveFavoriteRefs } from "../../lib/resolve-favorite-refs";
import { searchableMultiselect } from "../../lib/prompt";
import type { FavoriteInstallInput } from "../../types";

export async function runFavoriteInstall(args: { input: FavoriteInstallInput }) {
  const { ids, global: isGlobal } = args.input;
  const favorites = await listFavorites();

  let selectedFavorites;

  if (ids.length > 0) {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, ids);
    if (unmatched.length > 0) {
      throw new Error(
        `The following ids were not found in your favorites: ${unmatched.join(", ")}\nRun \`skill favorite list\` to see available favorites.`,
      );
    }
    selectedFavorites = matched;
  } else if (process.stdin.isTTY && process.stdout.isTTY) {
    if (favorites.length === 0) {
      return { installed: [] };
    }

    const response = await searchableMultiselect({
      message: "Select favorite repositories or skills",
      options: favorites.map((favorite) => ({
        label: favorite.description ? `${favorite.id} (${favorite.description})` : favorite.id,
        value: favorite.id,
      })),
      required: true,
    });

    const selectedIds = new Set(response);
    selectedFavorites = favorites.filter((favorite) => selectedIds.has(favorite.id));
  } else {
    throw new Error(
      "No ids provided and stdin is not a TTY. Pass favorite ids directly, e.g.: skill favorite install owner/repo owner/repo/skill",
    );
  }

  const installed = [];
  for (const group of groupFavoritesForInstall(selectedFavorites)) {
    const result = await installRepoSkills({
      cwd: process.cwd(),
      global: isGlobal,
      repo: group.repo,
      selectors: group.selectors,
      initialSelectors: group.selectors.map((selector) => selector.skill),
      promptForSelection: group.promptForSelection,
    });

    if (result.kind === "map") {
      installed.push({
        kind: "map" as const,
        repo: group.repo.display,
        installRoot: result.installRoot,
        skills: result.mappedSkills.map((skill) => skill.relativeDir),
      });
      continue;
    }

    installed.push({
      kind: "skills" as const,
      repo: group.repo.display,
      installRoot: result.installRoot,
      skills: result.selectedSkills.map((skill) => skill.relativeDir),
    });
  }

  return { installed };
}
