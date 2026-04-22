import { mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { discoverSkills } from "../src/lib/discover-skills";

describe("discoverSkills", () => {
  test("finds nested skills in visible and hidden roots and ignores node_modules", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "skills/cx");
    await writeSkill(root, "skills/group/fp-thinking");
    await writeSkill(root, ".agents/skills/local/demo");
    await writeSkill(root, "node_modules/fake");

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: ".agents/skills/local/demo",
        displayLabel: ".agents/skills/local/demo",
      },
      { relativeDir: "skills/cx", displayLabel: "skills/cx" },
      {
        relativeDir: "skills/group/fp-thinking",
        displayLabel: "skills/group/fp-thinking",
      },
    ]);
  });

  test("ignores symlinked skill files and directories", async () => {
    const root = await mkTempDir();
    await writeSkill(root, "real/demo");
    await mkdir(join(root, "links", "file"), { recursive: true });
    await mkdir(join(root, "links", "dir"), { recursive: true });

    await symlink(
      join(root, "real", "demo", "SKILL.md"),
      join(root, "links", "file", "SKILL.md"),
    );
    await symlink(join(root, "real", "demo"), join(root, "links", "dir", "demo"));

    const skills = await discoverSkills(root);
    expect(skills).toEqual([
      {
        relativeDir: "real/demo",
        displayLabel: "real/demo",
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
