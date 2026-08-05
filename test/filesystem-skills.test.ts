import { lstat, mkdir, readFile, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { installFilesystemSkills } from "../src/lib/filesystem-skills";
import { getVisibleSkillRoot } from "../src/lib/paths";
import { readScopeManifest } from "../src/lib/project-manifest";
import { restoreProjectSkills } from "../src/lib/project-skills";
import { resolveSourceTarget } from "../src/lib/source-ref";

describe("filesystem skills", () => {
  test("links selected skills directly from their origin and records absolute sources", async () => {
    const root = join(tmpdir(), `skill-fs-install-${crypto.randomUUID()}`);
    const sourceRoot = join(root, "agents", "skills");
    const projectRoot = join(root, "project");
    await mkdir(join(sourceRoot, "cx"), { recursive: true });
    await mkdir(join(sourceRoot, "typescript"), { recursive: true });
    await writeFile(join(sourceRoot, "cx", "SKILL.md"), "---\nname: cx\n---\n");
    await writeFile(join(sourceRoot, "typescript", "SKILL.md"), "---\nname: typescript\n---\n");

    try {
      const source = await resolveSourceTarget(sourceRoot, projectRoot);
      if (source.kind !== "filesystem") throw new Error("Expected filesystem source");
      const canonicalSourceRoot = await realpath(sourceRoot);
      const result = await installFilesystemSkills({
        cwd: projectRoot,
        global: false,
        source,
        selectors: [{ skill: "cx" }],
      });
      const visible = getVisibleSkillRoot("local", projectRoot, source.repo, "cx");

      expect(result.selectedSkills.map((skill) => skill.relativeDir)).toEqual(["cx"]);
      expect((await lstat(visible)).isSymbolicLink()).toBe(true);
      expect(await readlink(visible)).toBe(join(canonicalSourceRoot, "cx"));
      expect(await readScopeManifest("local", projectRoot)).toEqual({
        version: 3,
        items: [
          {
            type: "skills",
            repo: `${source.repo.owner}/${source.repo.repo}`,
            skills: [{ id: "cx", source: join(canonicalSourceRoot, "cx") }],
          },
        ],
      });
      expect(
        await readFile(join(projectRoot, ".agents", "skills", ".gitignore"), "utf8"),
      ).toContain(`/cx.${source.repo.repo}.fs`);

      await rm(visible, { force: true });
      expect(await restoreProjectSkills(projectRoot)).toEqual({
        restored: [`${source.repo.owner}/${source.repo.repo}/cx`],
        missing: [],
      });
      expect(await readlink(visible)).toBe(join(canonicalSourceRoot, "cx"));

      await rm(join(sourceRoot, "cx", "SKILL.md"));
      expect(await restoreProjectSkills(projectRoot)).toEqual({
        restored: [],
        missing: [`${source.repo.owner}/${source.repo.repo}/cx`],
      });
      expect(await readScopeManifest("local", projectRoot)).toEqual({ version: 3, items: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
