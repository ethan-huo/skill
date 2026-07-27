import { describe, expect, test } from "bun:test";

import { groupFavoritesForInstall } from "../src/lib/favorite-groups";

describe("groupFavoritesForInstall", () => {
  test("merges same-repo favorites into one install group", () => {
    expect(
      groupFavoritesForInstall([
        {
          id: "ethan-huo/agents",
          owner: "ethan-huo",
          repo: "agents",
          description: "",
        },
        {
          id: "Ethan-Huo/Agents/cx",
          owner: "Ethan-Huo",
          repo: "Agents",
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
        {
          id: "pbakaus/impeccable/audit",
          owner: "pbakaus",
          repo: "impeccable",
          skill: "audit",
          description: "",
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
        selectors: [{ skill: "cx" }, { skill: "fp-thinking" }],
        promptForSelection: true,
      },
      {
        repo: {
          owner: "pbakaus",
          repo: "impeccable",
          cloneUrl: "https://github.com/pbakaus/impeccable.git",
          display: "pbakaus/impeccable",
        },
        selectors: [{ skill: "audit" }],
        promptForSelection: false,
      },
    ]);
  });
});
