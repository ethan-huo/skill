import { lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { runRemove } from "../src/commands/remove";

const originalCwd = process.cwd();

describe("remove command", () => {
  beforeEach(() => {
    process.chdir(originalCwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test("removes a selected project skill from visible links and manifest", async () => {
    const root = join(tmpdir(), `skill-remove-manifest-${crypto.randomUUID()}`);
    const sourceRoot = join(root, ".agents", ".skills", "repo", "abc");
    const visibleRoot = join(root, ".agents", "skills");
    const firstLink = join(visibleRoot, "a.abc.repo");
    const secondLink = join(visibleRoot, "b.abc.repo");

    await mkdir(join(sourceRoot, "a"), { recursive: true });
    await mkdir(join(sourceRoot, "b"), { recursive: true });
    await mkdir(visibleRoot, { recursive: true });
    await symlink(join(sourceRoot, "a"), firstLink, "dir");
    await symlink(join(sourceRoot, "b"), secondLink, "dir");
    await writeManifest(root, [{ type: "skills", repo: "repo/abc", skills: ["a", "b"] }]);

    process.chdir(root);
    await runRemove({ input: { repo: ["repo/abc/a"], global: false } });

    expect(await lstat(firstLink).catch(() => null)).toBeNull();
    expect((await lstat(secondLink)).isSymbolicLink()).toBe(true);
    expect(await readManifest(root)).toEqual({
      version: 3,
      items: [{ type: "skills", repo: "repo/abc", skills: [{ id: "b" }] }],
    });
  });

  test("removes the manifest skills item when the last selected skill is removed", async () => {
    const root = join(tmpdir(), `skill-remove-last-manifest-${crypto.randomUUID()}`);
    const sourceRoot = join(root, ".agents", ".skills", "repo", "abc");
    const visibleRoot = join(root, ".agents", "skills");
    const skillLink = join(visibleRoot, "a.abc.repo");

    await mkdir(join(sourceRoot, "a"), { recursive: true });
    await mkdir(visibleRoot, { recursive: true });
    await symlink(join(sourceRoot, "a"), skillLink, "dir");
    await writeManifest(root, [{ type: "skills", repo: "repo/abc", skills: ["a"] }]);

    process.chdir(root);
    await runRemove({ input: { repo: ["repo/abc/a"], global: false } });

    expect(await lstat(skillLink).catch(() => null)).toBeNull();
    expect(await readManifest(root)).toEqual({ version: 3, items: [] });
  });

  test("removes a GitHub skill by its canonical source ID", async () => {
    const root = join(tmpdir(), `skill-remove-canonical-${crypto.randomUUID()}`);
    const sourceRoot = join(root, ".agents", ".skills", "repo", "abc", "a");
    const skillLink = join(root, ".agents", "skills", "a.abc.repo");

    await mkdir(sourceRoot, { recursive: true });
    await mkdir(join(root, ".agents", "skills"), { recursive: true });
    await symlink(sourceRoot, skillLink, "dir");
    await writeFile(
      join(root, ".agents", "skills", "manifest.json"),
      `${JSON.stringify({
        version: 3,
        items: [
          {
            type: "skills",
            repo: "repo/abc",
            skills: [{ id: "a", source: "skills/a" }],
          },
        ],
      })}\n`,
    );

    process.chdir(root);
    await runRemove({ input: { repo: ["gh:repo/abc/skills/a"], global: false } });

    expect(await lstat(skillLink).catch(() => null)).toBeNull();
    expect(await readManifest(root)).toEqual({ version: 3, items: [] });
  });

  test("removes repo-level project skill and map manifest items", async () => {
    const root = join(tmpdir(), `skill-remove-repo-manifest-${crypto.randomUUID()}`);
    const visibleRoot = join(root, ".agents", "skills");

    await mkdir(join(root, ".agents", ".skills", "repo", "abc", "a"), { recursive: true });
    await mkdir(visibleRoot, { recursive: true });
    await symlink(
      join(root, ".agents", ".skills", "repo", "abc", "a"),
      join(visibleRoot, "a.abc.repo"),
      "dir",
    );
    await writeManifest(root, [
      { type: "skills", repo: "repo/abc", skills: ["a"] },
      { type: "map", repo: "repo/abc" },
      { type: "skills", repo: "other/repo", skills: ["x"] },
    ]);

    process.chdir(root);
    await runRemove({ input: { repo: ["repo/abc"], global: false } });

    expect(await readManifest(root)).toEqual({
      version: 3,
      items: [{ type: "skills", repo: "other/repo", skills: [{ id: "x" }] }],
    });
  });

  test("offers manifest maps in the interactive remove selector", async () => {
    const root = join(tmpdir(), `skill-remove-map-selector-${crypto.randomUUID()}`);
    const visibleMap = join(root, ".agents", "skills", "map.designer-skills.owl-listener");
    const prompts: Array<{ label: string; value: string }[]> = [];

    await mkdir(visibleMap, { recursive: true });
    await writeFile(join(visibleMap, "SKILL.md"), "---\nname: map\ndescription: map\n---\n");
    await writeManifest(root, [{ type: "map", repo: "Owl-Listener/designer-skills" }]);

    process.chdir(root);
    await runRemove(
      { input: { repo: [], global: false } },
      {
        isTty: () => true,
        searchableMultiselect: (options) => {
          prompts.push(options.options);
          return Promise.resolve(["Owl-Listener/designer-skills"]);
        },
      },
    );

    expect(prompts).toEqual([
      [
        {
          label: "Owl-Listener/designer-skills (map)",
          value: "Owl-Listener/designer-skills",
        },
      ],
    ]);
    expect(await lstat(visibleMap).catch(() => null)).toBeNull();
    expect(await readManifest(root)).toEqual({ version: 3, items: [] });
  });

  test("removes a selected global skill from visible links and manifest", async () => {
    const root = join(tmpdir(), `skill-remove-global-manifest-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    const sourceRoot = join(root, ".agents", ".skills", "repo", "abc");
    const visibleRoot = join(root, ".agents", "skills");
    const skillLink = join(visibleRoot, "a.abc.repo");
    process.env.HOME = root;

    try {
      await mkdir(join(sourceRoot, "a"), { recursive: true });
      await mkdir(visibleRoot, { recursive: true });
      await symlink(join(sourceRoot, "a"), skillLink, "dir");
      await writeManifest(root, [{ type: "skills", repo: "repo/abc", skills: ["a"] }]);

      process.chdir(root);
      await runRemove({ input: { repo: ["repo/abc/a"], global: true } });

      expect(await lstat(skillLink).catch(() => null)).toBeNull();
      expect(await readManifest(root)).toEqual({ version: 3, items: [] });
    } finally {
      await rm(root, { force: true, recursive: true });
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});

async function writeManifest(root: string, items: unknown[]): Promise<void> {
  await mkdir(join(root, ".agents", "skills"), { recursive: true });
  await writeFile(
    join(root, ".agents", "skills", "manifest.json"),
    `${JSON.stringify({ version: 2, items }, null, 2)}\n`,
  );
}

async function readManifest(root: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, ".agents", "skills", "manifest.json"), "utf8"));
}
