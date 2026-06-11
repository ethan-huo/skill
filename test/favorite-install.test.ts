import { describe, expect, test } from "bun:test";

import { resolveFavoriteRefs } from "../src/lib/resolve-favorite-refs";
import type { FavoriteRef } from "../src/types";

const favorites: FavoriteRef[] = [
  { id: "ethan-huo/agents", owner: "ethan-huo", repo: "agents", description: "" },
  {
    id: "ethan-huo/agents/cx",
    owner: "ethan-huo",
    repo: "agents",
    skill: "cx",
    description: "",
  },
  {
    id: "pbakaus/impeccable/audit",
    owner: "pbakaus",
    repo: "impeccable",
    skill: "audit",
    description: "",
  },
];

describe("resolveFavoriteRefs", () => {
  test("exact repo-level match", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, ["ethan-huo/agents"]);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe("ethan-huo/agents");
    expect(unmatched).toHaveLength(0);
  });

  test("exact skill-level match", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, ["ethan-huo/agents/cx"]);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe("ethan-huo/agents/cx");
    expect(unmatched).toHaveLength(0);
  });

  test("case-insensitive match uses favoriteIdentityKey normalisation", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, ["Ethan-Huo/Agents"]);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe("ethan-huo/agents");
    expect(unmatched).toHaveLength(0);
  });

  test("unmatched id is reported, not silently dropped", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, ["ethan-huo/missing"]);
    expect(matched).toHaveLength(0);
    expect(unmatched).toEqual(["ethan-huo/missing"]);
  });

  test("all unmatched ids are collected before returning", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, [
      "ethan-huo/agents/cx",
      "ethan-huo/missing",
      "nobody/nowhere",
    ]);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.id).toBe("ethan-huo/agents/cx");
    expect(unmatched).toEqual(["ethan-huo/missing", "nobody/nowhere"]);
  });

  test("repo-level and skill-level refs can be mixed", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, [
      "ethan-huo/agents",
      "pbakaus/impeccable/audit",
    ]);
    expect(matched).toHaveLength(2);
    expect(matched.map((f) => f.id)).toEqual(["ethan-huo/agents", "pbakaus/impeccable/audit"]);
    expect(unmatched).toHaveLength(0);
  });

  test("empty ids returns empty result", () => {
    const { matched, unmatched } = resolveFavoriteRefs(favorites, []);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(0);
  });
});
