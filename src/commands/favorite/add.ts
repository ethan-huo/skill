import { addFavorites } from "../../lib/favorites";
import type { FavoriteAddInput } from "../../types";

export async function runFavoriteAdd(args: { input: FavoriteAddInput }) {
  return addFavorites(args.input.ids);
}
