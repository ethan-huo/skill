import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { addProjectManifestSkills, readProjectManifest } from "../src/lib/project-manifest";

describe("project manifest", () => {
  test("writes sorted unique skill ids", async () => {
    const root = join(tmpdir(), `skill-project-manifest-${crypto.randomUUID()}`);

    await addProjectManifestSkills(root, [
      "ethan-huo/agents/fp-thinking",
      "ethan-huo/agents/cx",
      "ethan-huo/agents/cx",
    ]);

    expect(await readProjectManifest(root)).toEqual({
      skills: ["ethan-huo/agents/cx", "ethan-huo/agents/fp-thinking"],
    });
    expect(await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8")).toContain(
      '"skills"',
    );
  });
});
