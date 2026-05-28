import type { FavoriteRef } from "../types";

type RepoIdentity = Pick<FavoriteRef, "owner" | "repo">;

export function repoIdentityKey(repo: RepoIdentity): string {
  // GitHub routes owner/repo names case-insensitively; keep display casing outside identity keys.
  return `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}`;
}

export function favoriteIdentityKey(favorite: FavoriteRef): string {
  const repoKey = repoIdentityKey(favorite);
  return favorite.skill ? `${repoKey}/${favorite.skill}` : repoKey;
}
