import { refreshFavorites } from "../../lib/favorites";
import type { FavoriteRefreshInput } from "../../types";

export async function runFavoriteRefresh(_: { input: FavoriteRefreshInput }) {
  return refreshFavorites();
}
