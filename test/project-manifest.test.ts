import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  addProjectManifestMap,
  addProjectManifestSkills,
  readProjectManifest,
} from "../src/lib/project-manifest";

describe("project manifest", () => {
  test("migrates versionless skill lists to grouped v2 items", async () => {
    const root = join(tmpdir(), `skill-project-manifest-v1-${crypto.randomUUID()}`);
    await mkdir(join(root, ".agents", "skills"), { recursive: true });
    await writeFile(
      join(root, ".agents", "skills", "manifest.json"),
      JSON.stringify({
        skills: ["ethan-huo/agents/fp-thinking", "ethan-huo/agents/cx", "ethan-huo/agents/cx"],
      }),
    );

    expect(await readProjectManifest(root)).toEqual({
      version: 2,
      items: [{ type: "skills", repo: "ethan-huo/agents", skills: ["cx", "fp-thinking"] }],
    });
  });

  test("writes sorted unique skill and map items", async () => {
    const root = join(tmpdir(), `skill-project-manifest-${crypto.randomUUID()}`);

    await addProjectManifestSkills(root, [
      "ethan-huo/agents/fp-thinking",
      "ethan-huo/agents/cx",
      "ethan-huo/agents/cx",
    ]);
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");

    expect(await readProjectManifest(root)).toEqual({
      version: 2,
      items: [
        { type: "skills", repo: "ethan-huo/agents", skills: ["cx", "fp-thinking"] },
        { type: "map", repo: "Owl-Listener/designer-skills" },
      ],
    });
    const raw = await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8");
    expect(raw).toContain('"version": 2');
    expect(raw).toContain('"items"');
  });

  test("keeps repo skill installs and map installs mutually exclusive", async () => {
    const root = join(tmpdir(), `skill-project-manifest-exclusive-${crypto.randomUUID()}`);

    await addProjectManifestSkills(root, [
      "Owl-Listener/designer-skills/color-system",
      "Owl-Listener/designer-skills/design-brief",
    ]);
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");

    expect(await readProjectManifest(root)).toEqual({
      version: 2,
      items: [{ type: "map", repo: "Owl-Listener/designer-skills" }],
    });

    await addProjectManifestSkills(root, ["Owl-Listener/designer-skills/color-system"]);

    expect(await readProjectManifest(root)).toEqual({
      version: 2,
      items: [
        {
          type: "skills",
          repo: "Owl-Listener/designer-skills",
          skills: ["color-system"],
        },
      ],
    });
  });
});
