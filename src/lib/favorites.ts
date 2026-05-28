import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import {
  FavoriteMissingError,
  loadFavoriteMetadata,
  type FavoriteMetadata,
} from "./favorite-metadata";
import { favoriteIdentityKey, repoIdentityKey } from "./favorite-key";
import { parseFavoriteRef } from "./repo-ref";
import type { FavoriteRef } from "../types";

const FAVORITES_FILE_VERSION = 1;

type FavoriteFileEntry = {
  id: string;
  description?: string;
  updatedAt?: string;
};

type FavoritesFile = {
  version: number;
  favorites: Array<string | FavoriteFileEntry>;
};

type FavoriteStoreOptions = {
  filePath?: string;
};

type FavoriteServices = {
  loadMetadata?: (favorite: FavoriteRef) => Promise<FavoriteMetadata>;
};

export async function listFavorites(options: FavoriteStoreOptions = {}): Promise<FavoriteRef[]> {
  const file = await readFavoritesFile(options.filePath);
  return normalizeFavorites(file.favorites);
}

export async function addFavorite(
  id: string,
  options: FavoriteStoreOptions = {},
  services: FavoriteServices = {},
): Promise<{ added: boolean; favorite: FavoriteRef }> {
  const baseFavorite = parseFavoriteRef(id);
  const favorites = await listFavorites(options);
  const existing = favorites.find(
    (entry) => favoriteIdentityKey(entry) === favoriteIdentityKey(baseFavorite),
  );
  if (existing) {
    return { added: false, favorite: existing };
  }

  const metadataLoader = services.loadMetadata ?? loadFavoriteMetadata;
  const metadata = await metadataLoader(baseFavorite);
  const favorite = { ...baseFavorite, ...metadata };

  const next = [...favorites, favorite].sort((left, right) => left.id.localeCompare(right.id));
  await writeFavoritesFile(next, options.filePath);
  return { added: true, favorite };
}

export async function addFavorites(
  ids: string[],
  options: FavoriteStoreOptions = {},
  services: FavoriteServices = {},
): Promise<{ added: FavoriteRef[]; existing: FavoriteRef[] }> {
  const favorites = await listFavorites(options);
  const metadataLoader = services.loadMetadata ?? loadFavoriteMetadata;
  const requestedFavorites = dedupeFavorites(ids.map((id) => parseFavoriteRef(id)));
  const existingByKey = new Map(
    favorites.map((favorite) => [favoriteIdentityKey(favorite), favorite]),
  );
  const existing = requestedFavorites
    .filter((favorite) => existingByKey.has(favoriteIdentityKey(favorite)))
    .map((favorite) => existingByKey.get(favoriteIdentityKey(favorite))!);
  const toAdd = requestedFavorites.filter(
    (favorite) => !existingByKey.has(favoriteIdentityKey(favorite)),
  );

  const added = await Promise.all(
    toAdd.map(async (favorite) => ({
      ...favorite,
      ...(await metadataLoader(favorite)),
    })),
  );

  if (added.length > 0) {
    const next = [...favorites, ...added].sort((left, right) => left.id.localeCompare(right.id));
    await writeFavoritesFile(next, options.filePath);
  }

  return { added, existing };
}

export async function removeFavorite(
  id: string,
  options: FavoriteStoreOptions = {},
): Promise<{ removed: boolean; favorite: FavoriteRef }> {
  const favorite = parseFavoriteRef(id);
  const favorites = await listFavorites(options);
  const key = favoriteIdentityKey(favorite);
  const next = favorites.filter((entry) => favoriteIdentityKey(entry) !== key);
  if (next.length === favorites.length) {
    return { removed: false, favorite };
  }

  await writeFavoritesFile(next, options.filePath);
  return { removed: true, favorite };
}

export async function removeFavorites(
  ids: string[],
  options: FavoriteStoreOptions = {},
): Promise<{ removed: FavoriteRef[]; missing: FavoriteRef[] }> {
  const favorites = await listFavorites(options);
  const requestedFavorites = dedupeFavorites(ids.map((id) => parseFavoriteRef(id)));
  const installedByKey = new Map(
    favorites.map((favorite) => [favoriteIdentityKey(favorite), favorite]),
  );
  const removed: FavoriteRef[] = [];
  const missing: FavoriteRef[] = [];

  for (const favorite of requestedFavorites) {
    const key = favoriteIdentityKey(favorite);
    const existing = installedByKey.get(key);
    if (existing) {
      removed.push(existing);
      installedByKey.delete(key);
      continue;
    }

    missing.push(favorite);
  }

  if (removed.length > 0) {
    const next = [...installedByKey.values()].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    await writeFavoritesFile(next, options.filePath);
  }

  return { removed, missing };
}

export async function removeFavoritesForRepo(
  repo: Pick<FavoriteRef, "owner" | "repo">,
  options: FavoriteStoreOptions = {},
): Promise<FavoriteRef[]> {
  const favorites = await listFavorites(options);
  const key = repoIdentityKey(repo);
  const removed = favorites.filter((favorite) => repoIdentityKey(favorite) === key);

  if (removed.length === 0) {
    return [];
  }

  const next = favorites
    .filter((favorite) => repoIdentityKey(favorite) !== key)
    .sort((left, right) => left.id.localeCompare(right.id));
  await writeFavoritesFile(next, options.filePath);
  return removed;
}

export async function refreshFavorites(
  options: FavoriteStoreOptions = {},
  services: FavoriteServices = {},
): Promise<{
  refreshed: FavoriteRef[];
  removed: FavoriteRef[];
  changed: FavoriteRef[];
}> {
  const favorites = await listFavorites(options);
  const metadataLoader = services.loadMetadata ?? loadFavoriteMetadata;
  const refreshed: FavoriteRef[] = [];
  const removed: FavoriteRef[] = [];
  const changed: FavoriteRef[] = [];

  for (const favorite of favorites) {
    try {
      const metadata = await metadataLoader(favorite);
      const nextFavorite = { ...favorite, ...metadata };
      if (
        nextFavorite.description !== favorite.description ||
        nextFavorite.updatedAt !== favorite.updatedAt
      ) {
        changed.push(nextFavorite);
      }
      refreshed.push(nextFavorite);
    } catch (error) {
      if (error instanceof FavoriteMissingError) {
        removed.push(favorite);
        continue;
      }

      throw error;
    }
  }

  await writeFavoritesFile(refreshed, options.filePath);
  return { refreshed, removed, changed };
}

export function getFavoritesFilePath(): string {
  // Favorites are user-level preferences, so keep them in one global file instead of per-project roots.
  return join(homedir(), ".agents", "skill-favorites.json");
}

async function readFavoritesFile(filePath = getFavoritesFilePath()): Promise<FavoritesFile> {
  const raw = await readFile(filePath, "utf8").catch(() => null);
  if (!raw) {
    return { version: FAVORITES_FILE_VERSION, favorites: [] };
  }

  const parsed = JSON.parse(raw) as Partial<FavoritesFile>;
  return {
    version: FAVORITES_FILE_VERSION,
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
  };
}

async function writeFavoritesFile(
  favorites: FavoriteRef[],
  filePath = getFavoritesFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const body = JSON.stringify(
    {
      version: FAVORITES_FILE_VERSION,
      favorites: favorites.map((favorite) => ({
        id: favorite.id,
        description: favorite.description || undefined,
        updatedAt: favorite.updatedAt,
      })),
    } satisfies FavoritesFile,
    null,
    2,
  );
  await writeFile(filePath, `${body}\n`, "utf8");
}

function normalizeFavorites(favorites: Array<string | FavoriteFileEntry>): FavoriteRef[] {
  const seen = new Set<string>();
  const parsedFavorites: Array<FavoriteRef | null> = favorites.map((entry) => {
    try {
      const ref = parseFavoriteRef(getFavoriteId(entry));
      const metadata = isFavoriteEntry(entry)
        ? {
            description: normalizeOptionalString(entry.description),
            updatedAt: normalizeOptionalString(entry.updatedAt) || undefined,
          }
        : { description: "", updatedAt: undefined };

      return { ...ref, ...metadata };
    } catch {
      return null;
    }
  });

  return parsedFavorites
    .filter((favorite): favorite is FavoriteRef => favorite !== null)
    .filter((favorite) => {
      const key = favoriteIdentityKey(favorite);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFavoriteEntry(value: unknown): value is FavoriteFileEntry {
  return typeof value === "object" && value !== null && "id" in value && isString(value.id);
}

function getFavoriteId(value: string | FavoriteFileEntry): string {
  return isString(value) ? value : value.id;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dedupeFavorites(favorites: FavoriteRef[]): FavoriteRef[] {
  const seen = new Set<string>();
  return favorites.filter((favorite) => {
    const key = favoriteIdentityKey(favorite);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
