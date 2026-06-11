import { favoriteIdentityKey } from "./favorite-key";
import { parseFavoriteRef } from "./repo-ref";
import type { FavoriteRef } from "../types";

export type ResolveFavoriteRefsResult = {
  matched: FavoriteRef[];
  unmatched: string[];
};

/**
 * Resolves a list of raw id strings against the known favorites list.
 * Matching uses `favoriteIdentityKey` (case-insensitive owner/repo) so
 * callers don't need to know the normalisation details.
 */
export function resolveFavoriteRefs(
  favorites: FavoriteRef[],
  ids: string[],
): ResolveFavoriteRefsResult {
  const byKey = new Map(favorites.map((f) => [favoriteIdentityKey(f), f]));
  const matched: FavoriteRef[] = [];
  const unmatched: string[] = [];

  for (const id of ids) {
    let key: string;
    try {
      key = favoriteIdentityKey(parseFavoriteRef(id));
    } catch {
      unmatched.push(id);
      continue;
    }

    const favorite = byKey.get(key);
    if (favorite) {
      matched.push(favorite);
    } else {
      unmatched.push(id);
    }
  }

  return { matched, unmatched };
}
