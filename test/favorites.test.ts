import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import { FavoriteMissingError } from "../src/lib/favorite-metadata";
import {
  addFavorite,
  addFavorites,
  listFavorites,
  refreshFavorites,
  removeFavorite,
  removeFavorites,
} from "../src/lib/favorites";

const metadataById = new Map([
  [
    "ethan-huo/agents",
    { description: "Agent skill collection", updatedAt: "2026-04-23T00:00:00.000Z" },
  ],
  [
    "ethan-huo/agents/cx",
    { description: "Semantic code navigation", updatedAt: "2026-04-23T00:00:01.000Z" },
  ],
  [
    "ethan-huo/agents/fp-thinking",
    { description: "Pragmatic FP review lens", updatedAt: "2026-04-23T00:00:02.000Z" },
  ],
]);

function loadMetadata(favorite: { id: string }) {
  const metadata = metadataById.get(favorite.id);
  if (!metadata) {
    throw new FavoriteMissingError(`Missing ${favorite.id}`);
  }

  return Promise.resolve(metadata);
}

describe("favorite store", () => {
  test("adds favorites as sorted unique refs", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);

    await addFavorite("ethan-huo/agents", { filePath }, { loadMetadata });
    await addFavorite("ethan-huo/agents/fp-thinking", { filePath }, { loadMetadata });
    await addFavorite("ethan-huo/agents/cx", { filePath }, { loadMetadata });
    const duplicate = await addFavorite("ethan-huo/agents/cx", { filePath }, { loadMetadata });

    expect(duplicate.added).toBe(false);
    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents",
        owner: "ethan-huo",
        repo: "agents",
        description: "Agent skill collection",
        updatedAt: "2026-04-23T00:00:00.000Z",
      },
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
        description: "Semantic code navigation",
        updatedAt: "2026-04-23T00:00:01.000Z",
      },
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
        description: "Pragmatic FP review lens",
        updatedAt: "2026-04-23T00:00:02.000Z",
      },
    ]);
  });

  test("adds multiple favorites atomically and reports existing refs separately", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);
    await addFavorite("ethan-huo/agents", { filePath }, { loadMetadata });

    const result = await addFavorites(
      ["ethan-huo/agents", "ethan-huo/agents/cx", "ethan-huo/agents/fp-thinking"],
      { filePath },
      { loadMetadata },
    );

    expect(result.existing.map((favorite) => favorite.id)).toEqual(["ethan-huo/agents"]);
    expect(result.added.map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents/cx",
      "ethan-huo/agents/fp-thinking",
    ]);
    expect(await listFavorites({ filePath })).toHaveLength(3);
  });

  test("removes favorites by canonical ref", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);

    await addFavorite("ethan-huo/agents", { filePath }, { loadMetadata });
    await addFavorite("ethan-huo/agents/cx", { filePath }, { loadMetadata });
    await addFavorite("ethan-huo/agents/fp-thinking", { filePath }, { loadMetadata });

    const removed = await removeFavorite("ethan-huo/agents", { filePath });
    expect(removed.removed).toBe(true);
    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
        description: "Semantic code navigation",
        updatedAt: "2026-04-23T00:00:01.000Z",
      },
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
        description: "Pragmatic FP review lens",
        updatedAt: "2026-04-23T00:00:02.000Z",
      },
    ]);
  });

  test("removes multiple favorites and reports missing refs separately", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);
    await addFavorite("ethan-huo/agents", { filePath }, { loadMetadata });
    await addFavorite("ethan-huo/agents/cx", { filePath }, { loadMetadata });

    const result = await removeFavorites(
      ["ethan-huo/agents", "missing/repo", "ethan-huo/agents/cx"],
      { filePath },
    );

    expect(result.removed.map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents",
      "ethan-huo/agents/cx",
    ]);
    expect(result.missing.map((favorite) => favorite.id)).toEqual(["missing/repo"]);
    expect(await listFavorites({ filePath })).toEqual([]);
  });

  test("ignores invalid and duplicate file entries while reading", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        favorites: [
          "ethan-huo/agents",
          "ethan-huo/agents/cx",
          "invalid",
          "ethan-huo/agents",
          "ethan-huo/agents/cx",
          "ethan-huo/agents/fp-thinking",
        ],
      }),
    );

    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents",
        owner: "ethan-huo",
        repo: "agents",
        description: "",
      },
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
        description: "",
      },
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
        description: "",
      },
    ]);
  });

  test("refreshes metadata and removes missing refs", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        favorites: [
          { id: "ethan-huo/agents", description: "old repo description", updatedAt: "old" },
          { id: "ethan-huo/agents/cx", description: "old skill description", updatedAt: "old" },
          { id: "missing/repo", description: "old missing", updatedAt: "old" },
        ],
      }),
    );

    const result = await refreshFavorites(
      { filePath },
      {
        loadMetadata(favorite) {
          if (favorite.id === "missing/repo") {
            throw new FavoriteMissingError("missing");
          }

          return loadMetadata(favorite);
        },
      },
    );

    expect(result.removed.map((favorite) => favorite.id)).toEqual(["missing/repo"]);
    expect(result.changed.map((favorite) => favorite.id)).toEqual([
      "ethan-huo/agents",
      "ethan-huo/agents/cx",
    ]);
    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents",
        owner: "ethan-huo",
        repo: "agents",
        description: "Agent skill collection",
        updatedAt: "2026-04-23T00:00:00.000Z",
      },
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
        description: "Semantic code navigation",
        updatedAt: "2026-04-23T00:00:01.000Z",
      },
    ]);
  });
});
