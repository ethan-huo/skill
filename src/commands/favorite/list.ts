import { fmt, printTable, type TableColumn, type TableRow } from "argc/terminal";

import { listFavorites } from "../../lib/favorites";
import { truncateText } from "../../lib/truncate";
import type { FavoriteListInput } from "../../types";

const DESCRIPTION_WIDTH = 72;

export async function runFavoriteList(args: { input: FavoriteListInput }): Promise<void> {
  const favorites = await listFavorites();
  if (args.input.json) {
    console.log(JSON.stringify(favorites, null, 2));
    return;
  }

  if (favorites.length === 0) {
    console.log(fmt.info("No favorite refs found."));
    return;
  }

  const columns: TableColumn[] = [
    { key: "id", label: "ID" },
    { key: "description", label: "Description", width: DESCRIPTION_WIDTH },
  ];
  const rows: TableRow[] = favorites.map((favorite) => ({
    id: favorite.id,
    description: truncateText(favorite.description || "-", DESCRIPTION_WIDTH),
  }));
  printTable(columns, rows);
}
