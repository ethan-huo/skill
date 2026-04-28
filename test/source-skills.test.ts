import { lstat, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { updateSourceRepo } from "../src/lib/source-skills";

describe("source skills", () => {
  test("updates hidden source cache without replacing visible links", async () => {
    const root = join(tmpdir(), `skill-source-update-${crypto.randomUUID()}`);
    const cloneDir = join(root, "clone");
    const sourceRoot = join(root, ".agents", ".skills", "ethan-huo", "agents");
    const visibleRoot = join(root, ".agents", "skills", "ethan-huo", "agents");

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
    await symlink(join(sourceRoot, "cx"), join(visibleRoot, "cx"), "dir");

    const diff = await updateSourceRepo({
      cloneDir,
      sourceRoot,
    });

    expect(diff).toEqual({
      updated: ["cx"],
      removed: ["old-skill"],
      added: ["new-skill"],
    });
    expect(await readFile(join(sourceRoot, "cx", "SKILL.md"), "utf8")).toContain("new");
    expect(await stat(join(sourceRoot, "old-skill")).catch(() => null)).toBeNull();
    expect(await stat(join(sourceRoot, "new-skill")).catch(() => null)).toBeNull();
    expect((await lstat(join(visibleRoot, "cx"))).isSymbolicLink()).toBe(true);
  });
});
