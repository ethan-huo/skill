import { removeFavorites } from "../../lib/favorites";
import type { FavoriteRemoveInput } from "../../types";

export async function runFavoriteRemove(args: { input: FavoriteRemoveInput }): Promise<void> {
  const result = await removeFavorites(args.input.ids);

  for (const favorite of result.removed) {
    console.log(`Removed favorite ${favorite.id}`);
  }

  if (result.missing.length === 0) {
    return;
  }

  for (const favorite of result.missing) {
    console.log(`Missing favorite ${favorite.id}`);
  }

  throw new Error(
    `Some favorites were not found: ${result.missing.map((favorite) => favorite.id).join(", ")}`,
  );
}
