import { listFavorites } from "../../lib/favorites";
import type { FavoriteListInput } from "../../types";

export async function runFavoriteList(args: { input: FavoriteListInput }) {
  const favorites = await listFavorites();
  if (args.input.json) {
    return `${JSON.stringify(favorites, null, 2)}\n`;
  }

  return favorites;
}
