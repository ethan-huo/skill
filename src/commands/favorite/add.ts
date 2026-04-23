import { addFavorite } from "../../lib/favorites";
import type { FavoriteAddInput } from "../../types";

export async function runFavoriteAdd(args: { input: FavoriteAddInput }): Promise<void> {
  const result = await addFavorite(args.input.id);
  if (!result.added) {
    console.log(`Already favorited ${result.favorite.id}`);
    return;
  }

  console.log(
    `Favorited ${result.favorite.id}${result.favorite.description ? ` ${result.favorite.description}` : ""}`,
  );
}
