import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { discoverSkills } from "../src/lib/discover-skills";

describe("discoverSkills", () => {
  test("finds nested skills and normalizes them to folder IDs", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "skills/cx");
    await writeSkill(root, "skills/group/fp-thinking");
    await writeSkill(root, ".agents/skills/local/demo");
    await writeSkill(root, "node_modules/fake");

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "cx",
        sourceDir: "skills/cx",
        displayLabel: "cx",
      },
      {
        relativeDir: "demo",
        sourceDir: ".agents/skills/local/demo",
        displayLabel: "demo",
      },
      {
        relativeDir: "fp-thinking",
        sourceDir: "skills/group/fp-thinking",
        displayLabel: "fp-thinking",
      },
    ]);
  });

  test("dedupes repeated skill folders and prefers codex sources", async () => {
    const root = await mkTempDir();
    await writeSkill(root, ".claude/skills/adapt");
    await writeSkill(root, ".agents/skills/adapt");
    await writeSkill(root, ".codex/skills/adapt");
    await writeSkill(root, "source/skills/adapt");
    await writeSkill(root, ".cursor/skills/optimize");

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "adapt",
        sourceDir: ".codex/skills/adapt",
        displayLabel: "adapt",
      },
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

async function writeSkill(root: string, relativeDir: string): Promise<void> {
  const skillDir = join(root, relativeDir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: Demo skill\n---\n");
}
