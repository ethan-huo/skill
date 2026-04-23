import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { parseSkillId } from "./repo-ref";
import type { FavoriteSkill } from "../types";

const FAVORITES_FILE_VERSION = 1;

type FavoritesFile = {
  version: number;
  favorites: string[];
};

type FavoriteStoreOptions = {
  filePath?: string;
};

export async function listFavorites(options: FavoriteStoreOptions = {}): Promise<FavoriteSkill[]> {
  const file = await readFavoritesFile(options.filePath);
  return normalizeFavorites(file.favorites);
}

export async function addFavorite(
  id: string,
  options: FavoriteStoreOptions = {},
): Promise<{ added: boolean; favorite: FavoriteSkill }> {
  const favorite = parseSkillId(id);
  const favorites = await listFavorites(options);
  if (favorites.some((entry) => entry.id === favorite.id)) {
    return { added: false, favorite };
  }

  const next = [...favorites.map((entry) => entry.id), favorite.id].sort();
  await writeFavoritesFile(next, options.filePath);
  return { added: true, favorite };
}

export async function removeFavorite(
  id: string,
  options: FavoriteStoreOptions = {},
): Promise<{ removed: boolean; favorite: FavoriteSkill }> {
  const favorite = parseSkillId(id);
  const favorites = await listFavorites(options);
  const next = favorites.filter((entry) => entry.id !== favorite.id);
  if (next.length === favorites.length) {
    return { removed: false, favorite };
  }

  await writeFavoritesFile(
    next.map((entry) => entry.id),
    options.filePath,
  );
  return { removed: true, favorite };
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
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(isString) : [],
  };
}

async function writeFavoritesFile(
  favorites: string[],
  filePath = getFavoritesFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const body = JSON.stringify(
    {
      version: FAVORITES_FILE_VERSION,
      favorites,
    } satisfies FavoritesFile,
    null,
    2,
  );
  await writeFile(filePath, `${body}\n`, "utf8");
}

function normalizeFavorites(favorites: string[]): FavoriteSkill[] {
  const seen = new Set<string>();

  return favorites
    .map((id) => {
      try {
        return parseSkillId(id);
      } catch {
        return null;
      }
    })
    .filter((favorite): favorite is FavoriteSkill => favorite !== null)
    .filter((favorite) => {
      if (seen.has(favorite.id)) {
        return false;
      }

      seen.add(favorite.id);
      return true;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
