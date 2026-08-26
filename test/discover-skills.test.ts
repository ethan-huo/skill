import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { discoverSkillGroups, discoverSkills } from "../src/lib/discover-skills";

describe("discoverSkills", () => {
  test("finds a skill at the repository root", async () => {
    const root = await mkTempDir();
    await writeFile(join(root, "SKILL.md"), "---\nname: demo\ndescription: Demo skill\n---\n");

    expect(await discoverSkills(root)).toEqual([
      {
        relativeDir: "root",
        sourceDir: ".",
        displayLabel: "root",
      },
    ]);
  });

  test("finds nested skills and normalizes them to folder IDs", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "skills/cx");
    await writeSkill(root, "skills/group/fp-thinking");
    await writeSkill(root, ".agents/skills/local/demo");
    await writeSkill(root, ".agents/skills/internal");
    await writeSkill(root, "node_modules/fake");

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
      {
        relativeDir: "fp-thinking",
        sourceDir: "skills/group/fp-thinking",
        displayLabel: "fp-thinking",
      },
    ]);
  });

  test("ignores hidden configuration roots and collapses visible duplicates", async () => {
    const root = await mkTempDir();
    await writeSkill(root, ".agents/skills/adapt");
    await writeSkill(root, ".codex/skills/adapt");
    await writeSkill(root, "catalog/skills/adapt");
    await writeSkill(root, "source/skills/adapt");
    await writeSkill(root, ".cursor/skills/optimize");

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "adapt",
        sourceDir: "catalog/skills/adapt",
        displayLabel: "adapt",
      },
    ]);
  });

  test("keeps different same-name bundles as ordered variants", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "apps/skills/core/adapt", "core");
    await writeSkill(root, "apps/skills/codex/adapt", "codex");

    expect(await discoverSkillGroups(root)).toEqual([
      {
        relativeDir: "adapt",
        displayLabel: "adapt",
        candidates: [
          {
            relativeDir: "adapt",
            sourceDir: "apps/skills/codex/adapt",
            displayLabel: "adapt",
            variant: "codex",
          },
          {
            relativeDir: "adapt",
            sourceDir: "apps/skills/core/adapt",
            displayLabel: "adapt",
            variant: "core",
          },
        ],
      },
    ]);
  });

  test("uses the nearest distinctive parent segment as the variant label", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "apps/skills/core/adapt", "core");
    await writeSkill(root, "apps/skills/codex/adapt", "codex");
    await writeSkill(root, "apps/kiro-cli/skills/adapt", "kiro");

    const groups = await discoverSkillGroups(root);
    expect(groups[0]!.candidates.map((candidate) => candidate.variant)).toEqual([
      "codex",
      "core",
      "kiro-cli",
    ]);
  });

  test("ignores symlinked skill files and directories", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "real/demo");
    await mkdir(join(root, "links", "file"), { recursive: true });
    await mkdir(join(root, "links", "dir"), { recursive: true });

    await symlink(join(root, "real", "demo", "SKILL.md"), join(root, "links", "file", "SKILL.md"));
    await symlink(join(root, "real", "demo"), join(root, "links", "dir", "demo"));

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "demo",
        sourceDir: "real/demo",
        displayLabel: "demo",
      },
    ]);
  });
});

async function mkTempDir(): Promise<string> {
  const root = join(tmpdir(), `skill-test-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeSkill(root: string, relativeDir: string, body = ""): Promise<void> {
  const skillDir = join(root, relativeDir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: demo\ndescription: Demo skill\n---\n${body}`,
  );
}
