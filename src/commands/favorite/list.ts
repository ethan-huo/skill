import { fmt, printTable, type TableColumn, type TableRow } from "argc/terminal";

import { listFavorites } from "../../lib/favorites";
import type { FavoriteListInput } from "../../types";

export async function runFavoriteList(args: { input: FavoriteListInput }): Promise<void> {
  const favorites = await listFavorites();
  if (args.input.json) {
    console.log(JSON.stringify(favorites, null, 2));
    return;
  }

  if (favorites.length === 0) {
    console.log(fmt.info("No favorite skills found."));
    return;
  }

  const columns: TableColumn[] = [{ key: "id", label: "ID" }];
  const rows: TableRow[] = favorites.map((favorite) => ({ id: favorite.id }));
  printTable(columns, rows);
}
