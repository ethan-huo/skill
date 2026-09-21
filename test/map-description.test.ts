import { describe, expect, test } from "bun:test";

import { resolveMapDescription } from "../src/lib/map-description";
import { runInstall } from "../src/commands/install";
import type { RepoRef } from "../src/types";

const repo = {
  owner: "better-auth",
  repo: "skills",
  cloneUrl: "https://github.com/better-auth/skills.git",
  display: "better-auth/skills",
} satisfies RepoRef;

describe("map description", () => {
  test("prefers an explicit description and normalizes whitespace", async () => {
    expect(
      await resolveMapDescription(
        { repo, explicit: "  Better Auth\n  setup  ", stored: "stored" },
        { fetchDescription: unreachableFetch },
      ),
    ).toBe("Better Auth setup");
  });

  test("keeps the stored description instead of re-reading GitHub", async () => {
    expect(
      await resolveMapDescription(
        { repo, stored: "Stored intent" },
        { fetchDescription: unreachableFetch },
      ),
    ).toBe("Stored intent");
  });

  test("falls back to the GitHub repo description", async () => {
    expect(
      await resolveMapDescription({ repo }, { fetchDescription: async () => "Upstream intent" }),
    ).toBe("Upstream intent");
  });

  test("fails when the GitHub description is empty", async () => {
    const error = (await resolveMapDescription(
      { repo },
      { fetchDescription: async () => "" },
    ).catch((thrown: unknown) => thrown)) as Error;
    expect(error.message).toContain("GitHub repo description is empty");
    expect(error.message).toContain(
      `skill install "{ repo: ['better-auth/skills'], map: true, description:`,
    );
  });

  test("reports why the GitHub description could not be read", async () => {
    const error = (await resolveMapDescription(
      { repo },
      {
        fetchDescription: async () => {
          throw new Error("GitHub CLI is not authenticated. Run `gh auth login` and retry.");
        },
      },
    ).catch((thrown: unknown) => thrown)) as Error;
    expect(error.message).toContain("could not read GitHub repo description");
    expect(error.message).toContain("gh auth login");
  });

  test("rejects a description outside a map install", async () => {
    await expect(
      runInstall({
        input: {
          repo: ["better-auth/skills"],
          skills: "",
          map: false,
          global: false,
          description: "Better Auth setup",
        },
      }),
    ).rejects.toThrow("Install --description only applies to --map.");
  });
});

async function unreachableFetch(): Promise<string> {
  throw new Error("GitHub should not be queried when a description is already known.");
}
