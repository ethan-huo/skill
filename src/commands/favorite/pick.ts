import * as p from "@clack/prompts";
import { fmt } from "argc/terminal";

import { installRepoSkills } from "../../lib/add-skills";
import { groupFavoritesForInstall } from "../../lib/favorite-groups";
import { listFavorites } from "../../lib/favorites";
import type { FavoritePickInput } from "../../types";

export async function runFavoritePick(args: { input: FavoritePickInput }): Promise<void> {
  const input = args.input;
  if (!input.add && input.global) {
    throw new Error("--global requires --add.");
  }

  const favorites = await listFavorites();
  if (favorites.length === 0) {
    console.log(fmt.info("No favorite skills found."));
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("favorite pick requires a TTY.");
  }

  const response = await p.multiselect({
    message: "Select favorite skills",
    options: favorites.map((favorite) => ({
      label: favorite.id,
      value: favorite.id,
    })),
    required: true,
  });

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  const selectedIds = new Set(response);
  const selectedFavorites = favorites.filter((favorite) => selectedIds.has(favorite.id));

  if (!input.add) {
    console.log(selectedFavorites.map((favorite) => favorite.id).join("\n"));
    return;
  }

  for (const group of groupFavoritesForInstall(selectedFavorites)) {
    const { installRoot, selectedSkills } = await installRepoSkills({
      cwd: process.cwd(),
      global: input.global,
      repo: group.repo,
      selectors: group.selectors,
    });

    console.log(`Installed ${selectedSkills.length} skill(s) to ${installRoot}`);
    for (const skill of selectedSkills) {
      console.log(`- ${group.repo.display}/${skill.relativeDir}`);
    }
  }
}
