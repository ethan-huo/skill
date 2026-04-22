import { describe, expect, test } from "bun:test";

import { searchSkills } from "../src/lib/find-skills";

type MockFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

describe("searchSkills", () => {
  test("calls the search API and sorts results by installs", async () => {
    const requests: string[] = [];
    const fetchImpl: MockFetch = async (input) => {
      requests.push(String(input));

      return new Response(
        JSON.stringify({
          skills: [
            { id: "b", name: "Beta", source: "foo/beta", installs: 3 },
            { id: "a", name: "Alpha", source: "foo/alpha", installs: 12 },
          ],
        }),
      );
    };

    const skills = await searchSkills("prompt engineering", {
      limit: 5,
      apiBaseUrl: "https://skills.sh",
      fetchImpl,
    });

    expect(requests).toEqual(["https://skills.sh/api/search?q=prompt+engineering&limit=5"]);
    expect(skills).toEqual([
      { id: "a", name: "Alpha", source: "foo/alpha", installs: 12 },
      { id: "b", name: "Beta", source: "foo/beta", installs: 3 },
    ]);
  });

  test("normalizes partial payloads", async () => {
    const fetchImpl: MockFetch = async () =>
      new Response(
        JSON.stringify({
          skills: [
            { id: "demo", name: "Demo" },
            { id: 123, name: "Ignored" },
          ],
        }),
      );

    const skills = await searchSkills("demo", {
      apiBaseUrl: "https://skills.sh",
      fetchImpl,
    });

    expect(skills).toEqual([{ id: "demo", name: "Demo", source: "", installs: 0 }]);
  });
});
