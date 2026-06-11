import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { runFavoriteRemove } from "../src/commands/favorite/remove";
import { listFavorites, removeFavorites } from "../src/lib/favorites";

describe("favorite remove command", () => {
  test("reports empty favorites instead of silently succeeding", async () => {
    const filePath = await makeFavoritesFile();
    const logs: string[] = [];

    await runFavoriteRemove(
      { input: { ids: [] } },
      {
        listFavorites: () => listFavorites({ filePath }),
        log: (message) => logs.push(message),
      },
    );

    expect(logs.some((line) => line.includes("No favorite refs found."))).toBe(true);
  });

  test("requires explicit refs when favorites exist without a TTY", async () => {
    const filePath = await makeFavoritesFile([
      { id: "ethan-huo/agents", description: "Agent skill collection" },
    ]);

    await expect(
      runFavoriteRemove(
        { input: { ids: [] } },
        {
          listFavorites: () => listFavorites({ filePath }),
          isTty: () => false,
        },
      ),
    ).rejects.toThrow("Interactive favorite removal requires a TTY or explicit refs");
    expect((await listFavorites({ filePath })).map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents",
    ]);
  });

  test("keeps explicit ref removal non-interactive", async () => {
    const filePath = await makeFavoritesFile([
      { id: "ethan-huo/agents", description: "Agent skill collection" },
      { id: "ethan-huo/agents/cx", description: "Semantic code navigation" },
    ]);
    const logs: string[] = [];

    await runFavoriteRemove(
      { input: { ids: ["ethan-huo/agents/cx"] } },
      {
        removeFavorites: (ids) => removeFavorites(ids, { filePath }),
        log: (message) => logs.push(message),
      },
    );

    expect(logs).toContain("Removed favorite ethan-huo/agents/cx");
    expect((await listFavorites({ filePath })).map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents",
    ]);
  });

  test("removes selected favorites from the interactive selector", async () => {
    const filePath = await makeFavoritesFile([
      { id: "ethan-huo/agents", description: "Agent skill collection" },
      { id: "ethan-huo/agents/cx", description: "Semantic code navigation" },
    ]);
    const logs: string[] = [];

    await runFavoriteRemove(
      { input: { ids: [] } },
      {
        listFavorites: () => listFavorites({ filePath }),
        removeFavorites: (ids) => removeFavorites(ids, { filePath }),
        searchableMultiselect: () => Promise.resolve(["ethan-huo/agents/cx"]),
        isTty: () => true,
        log: (message) => logs.push(message),
      },
    );

    expect(logs).toContain("Removed favorite ethan-huo/agents/cx");
    expect((await listFavorites({ filePath })).map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents",
    ]);
  });
});

async function makeFavoritesFile(
  favorites: Array<{ id: string; description: string }> = [],
): Promise<string> {
  const home = join(tmpdir(), `skill-favorite-remove-${crypto.randomUUID()}`);
  const favoritesPath = join(home, "skill-favorites.json");
  await mkdir(home, { recursive: true });
  await writeFile(
    favoritesPath,
    `${JSON.stringify({
      version: 1,
      favorites: favorites.map((favorite, index) => ({
        ...favorite,
        updatedAt: `2026-01-01T00:00:0${index}.000Z`,
      })),
    })}\n`,
  );
  return favoritesPath;
}
