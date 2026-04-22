import { describe, expect, test } from "bun:test";

import { parseRepoRef } from "../src/lib/repo-ref";

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
});
