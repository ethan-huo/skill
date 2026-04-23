import { removeFavorite } from "../../lib/favorites";
import type { FavoriteRemoveInput } from "../../types";

export async function runFavoriteRemove(args: { input: FavoriteRemoveInput }): Promise<void> {
  const result = await removeFavorite(args.input.id);
  if (!result.removed) {
    throw new Error(`Favorite not found: ${result.favorite.id}`);
  }

  console.log(`Removed favorite ${result.favorite.id}`);
}
