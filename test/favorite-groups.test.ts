import { describe, expect, test } from "bun:test";

import { groupFavoritesForInstall } from "../src/lib/favorite-groups";

describe("groupFavoritesForInstall", () => {
  test("merges same-repo favorites into one install group", () => {
    expect(
      groupFavoritesForInstall([
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
        {
          id: "pbakaus/impeccable/audit",
          owner: "pbakaus",
          repo: "impeccable",
          skill: "audit",
        },
      ]),
    ).toEqual([
      {
        repo: {
          owner: "ethan-huo",
          repo: "agents",
          cloneUrl: "https://github.com/ethan-huo/agents.git",
          display: "ethan-huo/agents",
        },
        selectors: ["cx", "fp-thinking"],
      },
      {
        repo: {
          owner: "pbakaus",
          repo: "impeccable",
          cloneUrl: "https://github.com/pbakaus/impeccable.git",
          display: "pbakaus/impeccable",
        },
        selectors: ["audit"],
      },
    ]);
  });
});
