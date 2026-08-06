import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  addProjectManifestMap,
  addProjectManifestSkills,
  addScopeManifestSkills,
  readProjectManifest,
  readScopeManifest,
  writeScopeManifest,
} from "../src/lib/project-manifest";

describe("project manifest", () => {
  test("migrates versionless skill lists to grouped v3 items", async () => {
    const root = join(tmpdir(), `skill-project-manifest-v1-${crypto.randomUUID()}`);
    await mkdir(join(root, ".agents", "skills"), { recursive: true });
    await writeFile(
      join(root, ".agents", "skills", "manifest.json"),
      JSON.stringify({
        skills: ["ethan-huo/agents/fp-thinking", "ethan-huo/agents/cx", "ethan-huo/agents/cx"],
      }),
    );

    expect(await readProjectManifest(root)).toEqual({
      version: 3,
      items: [
        {
          type: "skills",
          repo: "ethan-huo/agents",
          skills: [{ id: "cx" }, { id: "fp-thinking" }],
        },
      ],
    });
  });

  test("migrates v2 skills without inventing an upstream source", async () => {
    const root = join(tmpdir(), `skill-project-manifest-v2-${crypto.randomUUID()}`);
    await mkdir(join(root, ".agents", "skills"), { recursive: true });
    await writeFile(
      join(root, ".agents", "skills", "manifest.json"),
      JSON.stringify({
        version: 2,
        items: [{ type: "skills", repo: "owner/repo", skills: ["annotate"] }],
      }),
    );

    expect(await readProjectManifest(root)).toEqual({
      version: 3,
      items: [{ type: "skills", repo: "owner/repo", skills: [{ id: "annotate" }] }],
    });
  });

  test("writes sorted unique skill sources and map items", async () => {
    const root = join(tmpdir(), `skill-project-manifest-${crypto.randomUUID()}`);

    await addProjectManifestSkills(root, "ethan-huo/agents", [
      { id: "fp-thinking", source: "skills/fp-thinking" },
      { id: "cx", source: "skills/cx" },
      { id: "cx", source: "skills/cx" },
    ]);
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");

    expect(await readProjectManifest(root)).toEqual({
      version: 3,
      items: [
        {
          type: "skills",
          repo: "ethan-huo/agents",
          skills: [
            { id: "cx", source: "skills/cx" },
            { id: "fp-thinking", source: "skills/fp-thinking" },
          ],
        },
        { type: "map", repo: "Owl-Listener/designer-skills" },
      ],
    });
    const raw = await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8");
    expect(raw).toContain('"version": 3');
    expect(raw).toContain('"items"');
    expect(await readFile(join(root, ".agents", "skills", ".gitignore"), "utf8")).toBe(
      [
        "# BEGIN skill managed entries",
        "/cx-ethan-huo",
        "/fp-thinking-ethan-huo",
        "/map-designer-skills-owl-listener",
        "# END skill managed entries",
        "",
      ].join("\n"),
    );
  });

  test("preserves user rules while replacing the managed block from the final manifest", async () => {
    const root = join(tmpdir(), `skill-project-gitignore-${crypto.randomUUID()}`);
    const skillsRoot = join(root, ".agents", "skills");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(
      join(skillsRoot, ".gitignore"),
      [
        "# User-created skill",
        "/private-notes",
        "",
        "# BEGIN skill managed entries",
        "/stale.repo.owner",
        "# END skill managed entries",
        "",
        "!/keep-this-rule",
        "",
      ].join("\n"),
    );

    await writeScopeManifest("local", root, {
      version: 3,
      items: [{ type: "skills", repo: "owner/repo", skills: [{ id: "new-skill" }] }],
    });

    expect(await readFile(join(skillsRoot, ".gitignore"), "utf8")).toBe(
      [
        "# User-created skill",
        "/private-notes",
        "",
        "# BEGIN skill managed entries",
        "/new-skill-owner",
        "# END skill managed entries",
        "",
        "!/keep-this-rule",
        "",
      ].join("\n"),
    );

    await writeScopeManifest("local", root, { version: 3, items: [] });
    expect(await readFile(join(skillsRoot, ".gitignore"), "utf8")).toBe(
      [
        "# User-created skill",
        "/private-notes",
        "",
        "# BEGIN skill managed entries",
        "# END skill managed entries",
        "",
        "!/keep-this-rule",
        "",
      ].join("\n"),
    );
  });

  test("rejects malformed managed blocks before mutating the manifest", async () => {
    const root = join(tmpdir(), `skill-project-gitignore-invalid-${crypto.randomUUID()}`);
    const skillsRoot = join(root, ".agents", "skills");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(join(skillsRoot, ".gitignore"), "# BEGIN skill managed entries\n/stale\n");

    await expect(
      writeScopeManifest("local", root, {
        version: 3,
        items: [{ type: "skills", repo: "owner/repo", skills: [{ id: "new-skill" }] }],
      }),
    ).rejects.toThrow("Invalid skill managed block");
    await expect(readFile(join(skillsRoot, "manifest.json"), "utf8")).rejects.toThrow();
  });

  test("rejects skills from different sources that claim the same visible folder", async () => {
    const root = join(tmpdir(), `skill-project-manifest-conflict-${crypto.randomUUID()}`);

    await expect(
      writeScopeManifest("local", root, {
        version: 3,
        items: [
          { type: "skills", repo: "owner/first", skills: [{ id: "cx" }] },
          { type: "skills", repo: "owner/second", skills: [{ id: "cx" }] },
        ],
      }),
    ).rejects.toThrow('Skill folder "cx-owner" is already claimed');
  });

  test("uses the same manifest shape for global scope", async () => {
    const root = join(tmpdir(), `skill-global-manifest-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = root;

    try {
      await addScopeManifestSkills("global", root, "ethan-huo/agents", [
        { id: "fp-thinking", source: "skills/fp-thinking" },
        { id: "cx", source: "skills/cx" },
        { id: "cx", source: "skills/cx" },
      ]);

      expect(await readScopeManifest("global", root)).toEqual({
        version: 3,
        items: [
          {
            type: "skills",
            repo: "ethan-huo/agents",
            skills: [
              { id: "cx", source: "skills/cx" },
              { id: "fp-thinking", source: "skills/fp-thinking" },
            ],
          },
        ],
      });

      const raw = await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8");
      expect(raw).toContain('"version": 3');
      await expect(
        readFile(join(root, ".agents", "skills", ".gitignore"), "utf8"),
      ).rejects.toThrow();
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      await rm(root, { force: true, recursive: true });
    }
  });

  test("keeps repo skill installs and map installs mutually exclusive", async () => {
    const root = join(tmpdir(), `skill-project-manifest-exclusive-${crypto.randomUUID()}`);

    await addProjectManifestSkills(root, "Owl-Listener/designer-skills", [
      { id: "color-system", source: "skills/color-system" },
      { id: "design-brief", source: "skills/design-brief" },
    ]);
    await addProjectManifestMap(root, "Owl-Listener/designer-skills");

    expect(await readProjectManifest(root)).toEqual({
      version: 3,
      items: [{ type: "map", repo: "Owl-Listener/designer-skills" }],
    });

    await addProjectManifestSkills(root, "Owl-Listener/designer-skills", [
      { id: "color-system", source: "skills/color-system" },
    ]);

    expect(await readProjectManifest(root)).toEqual({
      version: 3,
      items: [
        {
          type: "skills",
          repo: "Owl-Listener/designer-skills",
          skills: [{ id: "color-system", source: "skills/color-system" }],
        },
      ],
    });
  });
});
