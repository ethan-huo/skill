import { describe, expect, test } from "bun:test";

import { normalizeArgv } from "../src/lib/normalize-argv";

describe("CLI argv normalization", () => {
  test("maps nested favorite commands to argc dotted paths", () => {
    expect(normalizeArgv(["favorite", "list"])).toEqual(["favorite.list"]);
  });

  test("preserves variadic favorite refs as repeated array flags", () => {
    expect(normalizeArgv(["favorite", "add", "owner/repo", "owner/repo/skill"])).toEqual([
      "favorite.add",
      "--ids",
      "owner/repo",
      "--ids",
      "owner/repo/skill",
    ]);
  });

  test("preserves install flags while rewriting repo positionals", () => {
    expect(normalizeArgv(["install", "owner/repo", "--skills", "core/{a,b}", "--global"])).toEqual([
      "install",
      "--repo",
      "owner/repo",
      "--skills",
      "core/{a,b}",
      "--global",
    ]);
  });

  test("keeps whole-object input untouched", () => {
    const input = "{ repo: ['owner/repo'], global: true }";
    expect(normalizeArgv(["install", input])).toEqual(["install", input]);
  });

  test("keeps native repeated array flags untouched", () => {
    expect(
      normalizeArgv(["favorite.add", "--ids", "owner/repo", "--ids=owner/repo/skill"]),
    ).toEqual(["favorite.add", "--ids", "owner/repo", "--ids=owner/repo/skill"]);
  });

  test("normalizes retained human aliases", () => {
    expect(normalizeArgv(["update", "--no-progress"])).toEqual(["update", "--progress=false"]);
    expect(normalizeArgv(["remove", "-g"])).toEqual(["remove", "--global"]);
  });
});
