import { addFavorites } from "../../lib/favorites";
import type { FavoriteAddInput } from "../../types";

export async function runFavoriteAdd(args: { input: FavoriteAddInput }): Promise<void> {
  const result = await addFavorites(args.input.ids);

  for (const favorite of result.added) {
    console.log(
      `Favorited ${favorite.id}${favorite.description ? ` ${favorite.description}` : ""}`,
    );
  }

  for (const favorite of result.existing) {
    console.log(`Already favorited ${favorite.id}`);
  }
}
