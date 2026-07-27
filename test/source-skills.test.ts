import { lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { removeSourceRepo, updateSourceRepo } from "../src/lib/source-skills";

describe("source skills", () => {
  test("updates hidden source cache without replacing visible links", async () => {
    const root = join(tmpdir(), `skill-source-update-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const visibleRoot = join(root, ".agents", "skills");

    await mkdir(join(cloneDir, "skills", "cx"), { recursive: true });
    await mkdir(join(cloneDir, "skills", "new-skill"), { recursive: true });
    await writeFile(join(cloneDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\nnew");
    await writeFile(
      join(cloneDir, "skills", "new-skill", "SKILL.md"),
      "---\nname: new-skill\n---\n",
    );

    await mkdir(join(sourceRoot, "cx"), { recursive: true });
    await mkdir(join(sourceRoot, "old-skill"), { recursive: true });
    await writeFile(join(sourceRoot, "cx", "SKILL.md"), "---\nname: cx\n---\nold");
    await writeFile(join(sourceRoot, "old-skill", "SKILL.md"), "---\nname: old-skill\n---\n");

    await mkdir(visibleRoot, { recursive: true });
    await symlink(join(sourceRoot, "cx"), join(visibleRoot, "cx.agents.ethan-huo"), "dir");

    const result = await updateSourceRepo({
      cloneDir,
      sourceRoot,
    });

    expect(result).toEqual({
      diff: {
        updated: ["cx"],
        removed: ["old-skill"],
        added: ["new-skill"],
      },
      resolvedSkills: [{ id: "cx", source: "skills/cx" }],
    });
    expect(await readFile(join(sourceRoot, "cx", "SKILL.md"), "utf8")).toContain("new");
    expect(await stat(join(sourceRoot, "old-skill")).catch(() => null)).toBeNull();
    expect(await stat(join(sourceRoot, "new-skill")).catch(() => null)).toBeNull();
    expect((await lstat(join(visibleRoot, "cx.agents.ethan-huo"))).isSymbolicLink()).toBe(true);
  });

  test("repairs malformed frontmatter during source updates", async () => {
    const root = join(tmpdir(), `skill-source-repair-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, ".agents", ".skills", "builderio", "skills");

    await mkdir(join(cloneDir, "skills", "efficient-frontier"), { recursive: true });
    await writeFile(
      join(cloneDir, "skills", "efficient-frontier", "SKILL.md"),
      [
        "---",
        "name: efficient-frontier",
        "description: Use the frontier model only where it matters: delegate bounded work",
        "---",
        "",
        "# Efficient Frontier",
      ].join("\n"),
    );

    await mkdir(join(sourceRoot, "efficient-frontier"), { recursive: true });
    await writeFile(
      join(sourceRoot, "efficient-frontier", "SKILL.md"),
      "---\nname: efficient-frontier\n---\nold",
    );

    await updateSourceRepo({
      cloneDir,
      sourceRoot,
    });

    const contents = await readFile(join(sourceRoot, "efficient-frontier", "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(contents)?.[1] ?? "";
    expect(() => Bun.YAML.parse(frontmatter)).not.toThrow();
    expect(contents).toContain("# Efficient Frontier");
  });

  test("updates the exact persisted variant instead of choosing by path order", async () => {
    const root = join(tmpdir(), `skill-source-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "claude", "claude");
    await writeVariant(cloneDir, "core", "core");

    const result = await updateSourceRepo({
      cloneDir,
      sourceRoot,
      installedSkills: [
        {
          id: "annotate",
          source: "apps/skills/claude/annotate",
        },
      ],
    });

    expect(result.resolvedSkills).toEqual([
      { id: "annotate", source: "apps/skills/claude/annotate" },
    ]);
    expect(await readFile(join(sourceRoot, "annotate", "SKILL.md"), "utf8")).toContain("claude");
  });

  test("migrates a legacy manifest source only when cached content matches exactly", async () => {
    const root = join(tmpdir(), `skill-source-legacy-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "claude", "claude");
    await writeVariant(cloneDir, "core", "core");
    await mkdir(join(sourceRoot, "annotate"), { recursive: true });
    await writeFile(join(sourceRoot, "annotate", "SKILL.md"), "---\nname: annotate\n---\ncore");

    const result = await updateSourceRepo({
      cloneDir,
      sourceRoot,
      installedSkills: [{ id: "annotate" }],
    });

    expect(result.resolvedSkills).toEqual([
      { id: "annotate", source: "apps/skills/core/annotate" },
    ]);
  });

  test("refuses to switch variants when a persisted source disappears", async () => {
    const root = join(tmpdir(), `skill-source-missing-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "core", "core");

    await expect(
      updateSourceRepo({
        cloneDir,
        sourceRoot,
        installedSkills: [
          {
            id: "annotate",
            source: "apps/skills/claude/annotate",
          },
        ],
      }),
    ).rejects.toThrow("no longer exists");
  });

  test("moves a persisted source only when the surviving bundle matches the cache", async () => {
    const root = join(tmpdir(), `skill-source-moved-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "core-v2", "same");
    await mkdir(join(sourceRoot, "annotate"), { recursive: true });
    await writeFile(join(sourceRoot, "annotate", "SKILL.md"), "---\nname: annotate\n---\nsame");

    const result = await updateSourceRepo({
      cloneDir,
      sourceRoot,
      installedSkills: [
        {
          id: "annotate",
          source: "apps/skills/core/annotate",
        },
      ],
    });

    expect(result.resolvedSkills).toEqual([
      { id: "annotate", source: "apps/skills/core-v2/annotate" },
    ]);
  });

  test("removes a hidden source repo and prunes empty owner directories", async () => {
    const root = join(tmpdir(), `skill-source-remove-${crypto.randomUUID()}`);
    const sourceBase = join(root, ".agents", ".skills");
    const sourceRoot = join(sourceBase, "jackwener", "opencli");

    await mkdir(join(sourceRoot, "opencli-browser"), { recursive: true });
    await writeFile(
      join(sourceRoot, "opencli-browser", "SKILL.md"),
      "---\nname: opencli-browser\n---\n",
    );

    const removed = await removeSourceRepo(
      { owner: "jackwener", repo: "opencli" },
      { sourceBaseDir: sourceBase, sourceRoot },
    );

    expect(removed).toBe(true);
    expect(await stat(sourceRoot).catch(() => null)).toBeNull();
    expect(await readdir(sourceBase).catch(() => [])).toEqual([]);
  });
});

async function writeVariant(root: string, variant: string, body: string): Promise<void> {
  const skillDir = join(root, "apps", "skills", variant, "annotate");
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: annotate\n---\n${body}`);
}
