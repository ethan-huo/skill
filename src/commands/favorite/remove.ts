import { fmt } from "argc/terminal";

import { listFavorites, removeFavorites } from "../../lib/favorites";
import { searchableMultiselect } from "../../lib/prompt";
import type { FavoriteRef, FavoriteRemoveInput } from "../../types";

type FavoriteRemovePrompt = (options: {
  message: string;
  options: Array<{ label: string; value: string }>;
  required?: boolean;
}) => Promise<string[]>;

type FavoriteRemoveServices = {
  listFavorites?: () => Promise<FavoriteRef[]>;
  removeFavorites?: (ids: string[]) => Promise<{ removed: FavoriteRef[]; missing: FavoriteRef[] }>;
  searchableMultiselect?: FavoriteRemovePrompt;
  isTty?: () => boolean;
  log?: (message: string) => void;
};

export async function runFavoriteRemove(
  args: { input: FavoriteRemoveInput },
  services: FavoriteRemoveServices = {},
): Promise<void> {
  const removeFavoriteRefs = services.removeFavorites ?? removeFavorites;
  const ids =
    args.input.ids.length > 0 ? args.input.ids : await selectFavoriteRefsForRemoval(services);

  if (ids.length === 0) {
    return;
  }

  const result = await removeFavoriteRefs(ids);
  const log = services.log ?? console.log;

  for (const favorite of result.removed) {
    log(`Removed favorite ${favorite.id}`);
  }

  if (result.missing.length === 0) {
    return;
  }

  for (const favorite of result.missing) {
    log(`Missing favorite ${favorite.id}`);
  }

  throw new Error(
    `Some favorites were not found: ${result.missing.map((favorite) => favorite.id).join(", ")}`,
  );
}

async function selectFavoriteRefsForRemoval(services: FavoriteRemoveServices): Promise<string[]> {
  const listFavoriteRefs = services.listFavorites ?? listFavorites;
  const selectMany =
    services.searchableMultiselect ?? ((options) => searchableMultiselect(options));
  const isTty = services.isTty ?? (() => Boolean(process.stdin.isTTY && process.stdout.isTTY));
  const log = services.log ?? console.log;
  const favorites = await listFavoriteRefs();

  if (favorites.length === 0) {
    log(fmt.info("No favorite refs found."));
    return [];
  }

  if (!isTty()) {
    throw new Error(
      "Interactive favorite removal requires a TTY or explicit refs, e.g.: skill favorite remove owner/repo owner/repo/skill",
    );
  }

  const response = await selectMany({
    message: "Select favorite repositories or skills to remove",
    options: favorites.map((favorite) => ({
      label: favorite.description ? `${favorite.id} (${favorite.description})` : favorite.id,
      value: favorite.id,
    })),
    required: true,
  });

  return [...response];
}
