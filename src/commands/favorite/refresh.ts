import { fmt } from "argc/terminal";

import { refreshFavorites } from "../../lib/favorites";
import type { FavoriteRefreshInput } from "../../types";

export async function runFavoriteRefresh(_: { input: FavoriteRefreshInput }): Promise<void> {
  const result = await refreshFavorites();

  for (const favorite of result.changed) {
    console.log(`~ ${favorite.id}${favorite.description ? ` ${favorite.description}` : ""}`);
  }

  for (const favorite of result.removed) {
    console.log(`- ${favorite.id} missing upstream; removed from favorites`);
  }

  if (result.changed.length === 0 && result.removed.length === 0) {
    console.log(fmt.info("Favorite metadata already up to date."));
  }
}
