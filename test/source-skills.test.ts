import { lstat, mkdir, readdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { resolveInstalledSkillSource } from "../src/lib/install";
import { removeSourceRepo, updateSourceRepo } from "../src/lib/source-skills";
import { parseRepoRef } from "../src/lib/repo-ref";

const repo = parseRepoRef("ethan-huo/agents");

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
      repo,
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
    expect(await readCachedSkill(sourceRoot, "cx")).toContain("new");
    // Removed legacy materializations are retained until snapshot GC can prove no scope links them.
    expect((await stat(join(sourceRoot, "old-skill"))).isDirectory()).toBe(true);
    expect(await stat(join(sourceRoot, "new-skill")).catch(() => null)).toBeNull();
    expect((await lstat(join(visibleRoot, "cx.agents.ethan-huo"))).isSymbolicLink()).toBe(true);
  });

  test("garbage-collects disappeared cache entries outside the installed manifest", async () => {
    const root = join(tmpdir(), `skill-source-orphan-gc-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceBase = join(root, ".agents", ".skills");
    const sourceRoot = join(sourceBase, "mattpocock", "skills");
    const otherRepoRoot = join(sourceBase, "other", "skills");

    await writeSkill(cloneDir, "skills/ask-matt", "ask-matt", "upstream-current");
    await writeSkill(cloneDir, "skills/still-upstream", "still-upstream", "upstream-unselected");
    await writeSkill(cloneDir, "skills/writing-for-agents", "writing-for-agents", "upstream-new");
    await writeSkill(sourceRoot, "ask-matt", "ask-matt", "cached-current");
    await writeSkill(sourceRoot, "still-upstream", "still-upstream", "cached-unselected");
    await writeSkill(sourceRoot, "writing-great-skills", "writing-great-skills", "cached-removed");
    await writeSkill(otherRepoRoot, "user-owned", "user-owned", "keep-other-repo");
    await writeFile(join(sourceRoot, "README.md"), "keep repo-local user file");

    const result = await updateSourceRepo({
      cloneDir,
      repo,
      sourceRoot,
      installedSkills: [{ id: "ask-matt", source: "skills/ask-matt" }],
    });

    expect(result).toEqual({
      diff: {
        updated: ["ask-matt"],
        removed: [],
        added: ["still-upstream", "writing-for-agents"],
      },
      resolvedSkills: [{ id: "ask-matt", source: "skills/ask-matt" }],
    });
    expect(await readCachedSkill(sourceRoot, "ask-matt")).toContain("upstream-current");
    expect(await readFile(join(sourceRoot, "still-upstream", "SKILL.md"), "utf8")).toContain(
      "cached-unselected",
    );
    expect((await stat(join(sourceRoot, "writing-great-skills"))).isDirectory()).toBe(true);
    expect(await stat(join(sourceRoot, "writing-for-agents")).catch(() => null)).toBeNull();
    expect(await readFile(join(sourceRoot, "README.md"), "utf8")).toBe("keep repo-local user file");
    expect(await readFile(join(otherRepoRoot, "user-owned", "SKILL.md"), "utf8")).toContain(
      "keep-other-repo",
    );
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
      repo,
      sourceRoot,
    });

    const contents = await readCachedSkill(sourceRoot, "efficient-frontier");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(contents)?.[1] ?? "";
    expect(() => Bun.YAML.parse(frontmatter)).not.toThrow();
    expect(contents).toContain("# Efficient Frontier");
  });

  test("updates the exact persisted variant instead of choosing by path order", async () => {
    const root = join(tmpdir(), `skill-source-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "codex", "codex");
    await writeVariant(cloneDir, "core", "core");

    const result = await updateSourceRepo({
      cloneDir,
      repo,
      sourceRoot,
      installedSkills: [
        {
          id: "annotate",
          source: "apps/skills/codex/annotate",
        },
      ],
    });

    expect(result.resolvedSkills).toEqual([
      { id: "annotate", source: "apps/skills/codex/annotate" },
    ]);
    expect(await readCachedSkill(sourceRoot, "annotate")).toContain("codex");
  });

  test("migrates a legacy manifest source only when cached content matches exactly", async () => {
    const root = join(tmpdir(), `skill-source-legacy-variant-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, "source");
    await writeVariant(cloneDir, "codex", "codex");
    await writeVariant(cloneDir, "core", "core");
    await mkdir(join(sourceRoot, "annotate"), { recursive: true });
    await writeFile(join(sourceRoot, "annotate", "SKILL.md"), "---\nname: annotate\n---\ncore");

    const result = await updateSourceRepo({
      cloneDir,
      repo,
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
        repo,
        sourceRoot,
        installedSkills: [
          {
            id: "annotate",
            source: "apps/skills/codex/annotate",
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
      repo,
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

async function writeSkill(root: string, path: string, name: string, body: string): Promise<void> {
  const skillDir = join(root, path);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n${body}`);
}

async function readCachedSkill(sourceRoot: string, skill: string): Promise<string> {
  const installedRoot = await resolveInstalledSkillSource(sourceRoot, skill);
  return readFile(join(installedRoot, "SKILL.md"), "utf8");
}
