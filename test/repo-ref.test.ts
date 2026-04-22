import { describe, expect, test } from "bun:test";

import { parseAddTarget, parseRepoRef } from "../src/lib/repo-ref";

describe("parseRepoRef", () => {
  test("parses owner/repo shorthand", () => {
    expect(parseRepoRef("ethan-huo/agents")).toEqual({
      owner: "ethan-huo",
      repo: "agents",
      cloneUrl: "https://github.com/ethan-huo/agents.git",
      display: "ethan-huo/agents",
    });
  });

  test("parses https github url", () => {
    expect(parseRepoRef("https://github.com/ethan-huo/agents")).toEqual({
      owner: "ethan-huo",
      repo: "agents",
      cloneUrl: "https://github.com/ethan-huo/agents.git",
      display: "ethan-huo/agents",
    });
  });

  test("parses ssh github url", () => {
    expect(parseRepoRef("git@github.com:ethan-huo/agents.git")).toEqual({
      owner: "ethan-huo",
      repo: "agents",
      cloneUrl: "https://github.com/ethan-huo/agents.git",
      display: "ethan-huo/agents",
    });
  });

  test("parses owner/repo/skill shorthand for add", () => {
    expect(parseAddTarget("pbakaus/impeccable/audit")).toEqual({
      repo: {
        owner: "pbakaus",
        repo: "impeccable",
        cloneUrl: "https://github.com/pbakaus/impeccable.git",
        display: "pbakaus/impeccable",
      },
      skill: "audit",
    });
  });

  test("rejects github urls with extra path segments", () => {
    expect(() =>
      parseRepoRef("https://github.com/pbakaus/impeccable/tree/main/.codex/skills/audit"),
    ).toThrow("GitHub repository URLs must point to the repository root.");
  });
});
