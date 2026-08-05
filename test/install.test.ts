import { lstat, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  pruneEmptyParents,
  linkInstalledSkills,
  removeInstalledSkill,
  removeVisibleRepoSkills,
  replaceInstalledSkills,
  upsertInstalledSkills,
} from "../src/lib/install";
import { listInstalledSkills } from "../src/lib/installed-skills";
import type { RepoRef } from "../src/types";

const repo = {
  owner: "ethan-huo",
  repo: "agents",
  cloneUrl: "https://github.com/ethan-huo/agents.git",
  display: "ethan-huo/agents",
} satisfies RepoRef;

describe("install helpers", () => {
  test("installs selected skills into flat folder IDs", async () => {
    const root = join(tmpdir(), `skill-install-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const target = join(root, ".agents", "skills", "pbakaus", "impeccable");

    await mkdir(join(repoDir, ".codex", "skills", "adapt"), { recursive: true });
    await writeFile(
      join(repoDir, ".codex", "skills", "adapt", "SKILL.md"),
      "---\nname: adapt\ndescription: Adapt skill\n---\n",
    );

    await replaceInstalledSkills(repoDir, target, [
      {
        relativeDir: "adapt",
        sourceDir: ".codex/skills/adapt",
        displayLabel: "adapt",
      },
    ]);

    expect(await readFile(join(target, "adapt", "SKILL.md"), "utf8")).toContain("name: adapt");
    expect(await stat(join(target, ".codex")).catch(() => null)).toBeNull();
  });

  test("installs a root skill without copying checkout metadata", async () => {
    const root = join(tmpdir(), `skill-root-install-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const target = join(root, ".agents", ".skills", "blader", "humanizer");

    await mkdir(join(repoDir, ".git"), { recursive: true });
    await writeFile(join(repoDir, "SKILL.md"), "---\nname: humanizer\n---\n");
    await writeFile(join(repoDir, "reference.md"), "supporting material");
    await writeFile(join(repoDir, ".git", "HEAD"), "ref: refs/heads/main\n");

    await upsertInstalledSkills(repoDir, target, [
      {
        relativeDir: "root",
        sourceDir: ".",
        displayLabel: "root",
      },
    ]);

    expect(await readFile(join(target, "root", "SKILL.md"), "utf8")).toContain("humanizer");
    expect(await readFile(join(target, "root", "reference.md"), "utf8")).toBe(
      "supporting material",
    );
    expect(await stat(join(target, "root", ".git")).catch(() => null)).toBeNull();
  });

  test("removes installed directory trees", async () => {
    const root = join(tmpdir(), `skill-remove-${crypto.randomUUID()}`);
    const target = join(root, ".agents", "skills");
    await mkdir(join(target, "cx.agents.ethan-huo"), { recursive: true });
    await mkdir(join(target, "fp-thinking.agents.ethan-huo"), { recursive: true });
    await mkdir(join(target, "ethan-huo.agents.legacy"), { recursive: true });

    expect(await removeVisibleRepoSkills(target, repo)).toBe(true);

    expect(await stat(join(target, "cx.agents.ethan-huo")).catch(() => null)).toBeNull();
    expect(await stat(join(target, "fp-thinking.agents.ethan-huo")).catch(() => null)).toBeNull();
    expect(await stat(join(target, "ethan-huo.agents.legacy")).catch(() => null)).toBeNull();
  });

  test("links visible skills to hidden source skills", async () => {
    const root = join(tmpdir(), `skill-link-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(join(repoDir, "skills", "cx", "SKILL.md"), "---\nname: cx\n---\n");

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect((await lstat(join(targetRoot, "cx.agents.ethan-huo"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(targetRoot, "cx.agents.ethan-huo", "SKILL.md"), "utf8")).toContain(
      "name: cx",
    );
  });

  test("repairs malformed skill frontmatter while installing source copies", async () => {
    const root = join(tmpdir(), `skill-repair-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "builderio", "skills");
    const selectedSkills = [
      {
        relativeDir: "efficient-frontier",
        sourceDir: "skills/efficient-frontier",
        displayLabel: "efficient-frontier",
      },
    ];

    await mkdir(join(repoDir, "skills", "efficient-frontier"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "efficient-frontier", "SKILL.md"),
      [
        "---",
        "name: efficient-frontier",
        "description: Apply the same orchestration as `/efficient-fable` to any high-cost frontier model: delegate research",
        "allowed-tools:",
        "  - Read",
        "  - Bash",
        "---",
        "",
        "# Efficient Frontier",
      ].join("\n"),
    );

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);

    const contents = await readFile(join(sourceRoot, "efficient-frontier", "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(contents)?.[1] ?? "";
    const parsed = Bun.YAML.parse(frontmatter) as {
      description?: string;
      "allowed-tools"?: string[];
    };
    expect(parsed.description).toContain("model: delegate research");
    expect(parsed["allowed-tools"]).toEqual(["Read", "Bash"]);
    expect(contents).toContain("# Efficient Frontier");
  });

  test("links nested skill paths with skill-first package names and removes legacy aliases", async () => {
    const root = join(tmpdir(), `skill-link-nested-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "design/taste",
        sourceDir: "skills/design/taste",
        displayLabel: "design/taste",
      },
    ];

    await mkdir(join(repoDir, "skills", "design", "taste"), { recursive: true });
    await mkdir(join(targetRoot, "ethan-huo.agents.design/taste"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "design", "taste", "SKILL.md"),
      "---\nname: taste\n---\n",
    );

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);

    expect((await lstat(join(targetRoot, "design.taste.agents.ethan-huo"))).isSymbolicLink()).toBe(
      true,
    );
    expect(
      await stat(join(targetRoot, "ethan-huo.agents.design", "taste")).catch(() => null),
    ).toBeNull();
  });

  test("lists one-level visible skill links by upstream IDs", async () => {
    const root = join(tmpdir(), `skill-list-flat-${crypto.randomUUID()}`);
    const repoDir = join(root, "repo");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const targetRoot = join(root, ".agents", "skills");
    const selectedSkills = [
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
    ];

    await mkdir(join(repoDir, "skills", "cx"), { recursive: true });
    await writeFile(
      join(repoDir, "skills", "cx", "SKILL.md"),
      "---\nname: cx\ndescription: CX helper\n---\n",
    );

    await upsertInstalledSkills(repoDir, sourceRoot, selectedSkills);
    await linkInstalledSkills(sourceRoot, targetRoot, repo, selectedSkills);
    await writeFile(
      join(targetRoot, "manifest.json"),
      `${JSON.stringify({
        version: 3,
        items: [
          {
            type: "skills",
            repo: "ethan-huo/agents",
            skills: [{ id: "cx", source: "skills/cx" }],
          },
        ],
      })}\n`,
    );

    expect(await listInstalledSkills(root)).toContainEqual({
      id: "gh:ethan-huo/agents/skills/cx",
      owner: "ethan-huo",
      repo: "agents",
      relativeDir: "cx",
      name: "cx",
      description: "CX helper",
      scope: "local",
      installRoot: join(targetRoot, "cx.agents.ethan-huo"),
    });
  });

  test("removes one installed skill without touching siblings", async () => {
    const root = join(tmpdir(), `skill-remove-one-${crypto.randomUUID()}`);
    const target = join(root, "cx.agents.ethan-huo");
    const sibling = join(root, "fp-thinking.agents.ethan-huo");
    await mkdir(target, { recursive: true });
    await mkdir(sibling, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);

    expect(await stat(target).catch(() => null)).toBeNull();
    expect((await stat(sibling)).isDirectory()).toBe(true);
  });

  test("prunes empty owner directories", async () => {
    const root = join(tmpdir(), `skill-prune-${crypto.randomUUID()}`);
    const baseDir = join(root, ".agents", "skills");
    const target = join(baseDir, "cx.agents.ethan-huo");
    await mkdir(target, { recursive: true });

    expect(await removeInstalledSkill(target)).toBe(true);
    await pruneEmptyParents(dirname(target), baseDir);

    const entries = await readdir(baseDir);
    expect(entries).toEqual([]);
  });
});
