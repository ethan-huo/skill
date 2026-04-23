import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import { addFavorite, listFavorites, removeFavorite } from "../src/lib/favorites";

describe("favorite store", () => {
  test("adds favorites as sorted unique skill ids", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);

    await addFavorite("ethan-huo/agents/fp-thinking", { filePath });
    await addFavorite("ethan-huo/agents/cx", { filePath });
    const duplicate = await addFavorite("ethan-huo/agents/cx", { filePath });

    expect(duplicate.added).toBe(false);
    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
      },
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
      },
    ]);
  });

  test("removes favorites by canonical id", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);

    await addFavorite("ethan-huo/agents/cx", { filePath });
    await addFavorite("ethan-huo/agents/fp-thinking", { filePath });

    const removed = await removeFavorite("ethan-huo/agents/cx", { filePath });
    expect(removed.removed).toBe(true);
    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
      },
    ]);
  });

  test("ignores invalid and duplicate file entries while reading", async () => {
    const filePath = join(tmpdir(), `skill-favorites-${crypto.randomUUID()}.json`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        favorites: [
          "ethan-huo/agents/cx",
          "invalid",
          "ethan-huo/agents/cx",
          "ethan-huo/agents/fp-thinking",
        ],
      }),
    );

    expect(await listFavorites({ filePath })).toEqual([
      {
        id: "ethan-huo/agents/cx",
        owner: "ethan-huo",
        repo: "agents",
        skill: "cx",
      },
      {
        id: "ethan-huo/agents/fp-thinking",
        owner: "ethan-huo",
        repo: "agents",
        skill: "fp-thinking",
      },
    ]);
  });
});
