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
    expect(await readFile(join(root, ".agents", "skills", ".gitignore"), "utf8")).toBe(
      [
        "# BEGIN skill managed entries",
        "/cx.agents.ethan-huo",
        "/fp-thinking.agents.ethan-huo",
        "/map.designer-skills.owl-listener",
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
      version: 2,
      items: [{ type: "skills", repo: "owner/repo", skills: ["new-skill"] }],
    });

    expect(await readFile(join(skillsRoot, ".gitignore"), "utf8")).toBe(
      [
        "# User-created skill",
        "/private-notes",
        "",
        "# BEGIN skill managed entries",
        "/new-skill.repo.owner",
        "# END skill managed entries",
        "",
        "!/keep-this-rule",
        "",
      ].join("\n"),
    );

    await writeScopeManifest("local", root, { version: 2, items: [] });
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
        version: 2,
        items: [{ type: "skills", repo: "owner/repo", skills: ["new-skill"] }],
      }),
    ).rejects.toThrow("Invalid skill managed block");
    await expect(readFile(join(skillsRoot, "manifest.json"), "utf8")).rejects.toThrow();
  });

  test("projects package links into root .loreignore when present (Lore has no nested ignore)", async () => {
    const root = join(tmpdir(), `skill-project-loreignore-${crypto.randomUUID()}`);
    const skillsRoot = join(root, ".agents", "skills");
    await mkdir(skillsRoot, { recursive: true });
    await writeFile(
      join(root, ".loreignore"),
      ["# hand-written", "node_modules/", ""].join("\n"),
    );

    await writeScopeManifest("local", root, {
      version: 2,
      items: [{ type: "skills", repo: "celados/slack", skills: ["slack"] }],
    });

    expect(await readFile(join(root, ".loreignore"), "utf8")).toBe(
      [
        "# hand-written",
        "node_modules/",
        "",
        "# BEGIN skill managed entries",
        "/.agents/skills/slack.slack.celados",
        "/.claude/skills/slack.slack.celados",
        "# END skill managed entries",
        "",
      ].join("\n"),
    );
  });

  test("skips root .loreignore projection when the file is absent", async () => {
    const root = join(tmpdir(), `skill-project-no-loreignore-${crypto.randomUUID()}`);
    await mkdir(join(root, ".agents", "skills"), { recursive: true });

    await writeScopeManifest("local", root, {
      version: 2,
      items: [{ type: "skills", repo: "celados/slack", skills: ["slack"] }],
    });

    await expect(readFile(join(root, ".loreignore"), "utf8")).rejects.toThrow();
  });

  test("uses the same manifest shape for global scope", async () => {
    const root = join(tmpdir(), `skill-global-manifest-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = root;

    try {
      await addScopeManifestSkills("global", root, [
        "ethan-huo/agents/fp-thinking",
        "ethan-huo/agents/cx",
        "ethan-huo/agents/cx",
      ]);

      expect(await readScopeManifest("global", root)).toEqual({
        version: 2,
        items: [{ type: "skills", repo: "ethan-huo/agents", skills: ["cx", "fp-thinking"] }],
      });

      const raw = await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8");
      expect(raw).toContain('"version": 2');
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
