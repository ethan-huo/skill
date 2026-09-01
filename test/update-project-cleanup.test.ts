import { lstat, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { syncVisibleLinks } from "../src/commands/update";
import { getVisibleSkillDirName } from "../src/lib/paths";
import type { RepoRef } from "../src/types";

const repo = {
  owner: "repo",
  repo: "abc",
  cloneUrl: "https://github.com/repo/abc.git",
  display: "repo/abc",
} satisfies RepoRef;

describe("project update cleanup", () => {
  test("removes stale project links for upstream skills that disappeared without requiring a manifest", async () => {
    const cwd = join(tmpdir(), `skill-update-cleanup-${crypto.randomUUID()}`);
    const installRoot = join(cwd, ".agents", "skills");
    const deadLink = join(installRoot, "repo.abc.a");

    await mkdir(installRoot, { recursive: true });
    await symlink(join(cwd, ".agents", ".skills", "repo", "abc", "a"), deadLink, "dir");
    expect((await lstat(deadLink)).isSymbolicLink()).toBe(true);

    await syncVisibleLinks({
      cwd,
      repo,
      globalInstalledIds: [],
      projectInstalledIds: ["a"],
      updated: [],
      removed: ["a"],
      sourceRoot: join(cwd, ".agents", ".skills", "repo", "abc"),
    });

    expect(await lstat(deadLink).catch(() => null)).toBeNull();
  });

  test("reconciles removed skills in global and project scopes in one update pass", async () => {
    const cwd = join(tmpdir(), `skill-update-both-scopes-${crypto.randomUUID()}`);
    const previousHome = process.env.HOME;
    process.env.HOME = cwd;

    const sourceRoot = join(cwd, ".agents", ".skills", "repo", "abc");
    const projectRoot = join(cwd, "project", ".agents", "skills");
    const globalRoot = join(cwd, ".agents", "skills");
    const projectLink = join(projectRoot, "a.abc.repo");
    const globalLink = join(globalRoot, "a.abc.repo");

    try {
      await mkdir(join(sourceRoot, "a"), { recursive: true });
      await mkdir(projectRoot, { recursive: true });
      await mkdir(globalRoot, { recursive: true });
      await symlink(join(sourceRoot, "a"), projectLink, "dir");
      await symlink(join(sourceRoot, "a"), globalLink, "dir");
      await writeFile(
        join(globalRoot, "manifest.json"),
        JSON.stringify({
          version: 2,
          items: [{ type: "skills", repo: "repo/abc", skills: ["a"] }],
        }),
      );
      await writeFile(
        join(projectRoot, "manifest.json"),
        JSON.stringify({
          version: 2,
          items: [{ type: "skills", repo: "repo/abc", skills: ["a"] }],
        }),
      );

      await syncVisibleLinks({
        cwd: join(cwd, "project"),
        repo,
        globalInstalledIds: ["a"],
        projectInstalledIds: ["a"],
        updated: [],
        removed: ["a"],
        sourceRoot,
      });

      expect(await lstat(projectLink).catch(() => null)).toBeNull();
      expect(await lstat(globalLink).catch(() => null)).toBeNull();
      expect(JSON.parse(await readFile(join(globalRoot, "manifest.json"), "utf8"))).toEqual({
        version: 3,
        items: [],
      });
      expect(JSON.parse(await readFile(join(projectRoot, "manifest.json"), "utf8"))).toEqual({
        version: 3,
        items: [],
      });
      expect(await readFile(join(projectRoot, ".gitignore"), "utf8")).toBe(
        "# BEGIN skill managed entries\n# END skill managed entries\n",
      );
    } finally {
      await rm(cwd, { force: true, recursive: true });
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  test("runUpdate collects disappeared repo cache while preserving manifests and valid links", async () => {
    const root = join(tmpdir(), `skill-update-repo-cache-${crypto.randomUUID()}`);
    const owner = `owner-${crypto.randomUUID()}`;
    const project = join(root, "project");
    const remote = join(root, "remote");
    const trackedRepo = { ...repo, owner, display: `${owner}/abc` };
    const sourceRoot = join(root, ".agents", ".skills", owner, "abc");
    const globalRoot = join(root, ".agents", "skills");
    const projectRoot = join(project, ".agents", "skills");
    const visibleSkillDir = getVisibleSkillDirName(trackedRepo, "ask-matt");
    const globalLink = join(globalRoot, visibleSkillDir);
    const projectLink = join(projectRoot, visibleSkillDir);
    const manifest = {
      version: 3,
      items: [
        {
          type: "skills",
          repo: `${owner}/abc`,
          skills: [{ id: "ask-matt", source: "skills/ask-matt" }],
        },
      ],
    };

    try {
      await mkdir(join(remote, "skills", "ask-matt"), { recursive: true });
      await mkdir(join(remote, "skills", "writing-for-agents"), { recursive: true });
      await writeFile(
        join(remote, "skills", "ask-matt", "SKILL.md"),
        "---\nname: ask-matt\n---\nupstream-current",
      );
      await writeFile(
        join(remote, "skills", "writing-for-agents", "SKILL.md"),
        "---\nname: writing-for-agents\n---\nupstream-new",
      );
      await runGit(["init", remote]);
      await runGit(["-C", remote, "add", "."]);
      await runGit([
        "-C",
        remote,
        "-c",
        "user.name=Skill Test",
        "-c",
        "user.email=skill-test@example.com",
        "commit",
        "-m",
        "add upstream skills",
      ]);

      await mkdir(join(sourceRoot, "ask-matt"), { recursive: true });
      await mkdir(join(sourceRoot, "writing-great-skills"), { recursive: true });
      await writeFile(
        join(sourceRoot, "ask-matt", "SKILL.md"),
        "---\nname: ask-matt\n---\ncached-old",
      );
      await writeFile(
        join(sourceRoot, "writing-great-skills", "SKILL.md"),
        "---\nname: writing-great-skills\n---\ncached-removed",
      );
      await mkdir(globalRoot, { recursive: true });
      await mkdir(projectRoot, { recursive: true });
      await writeFile(join(globalRoot, "manifest.json"), JSON.stringify(manifest));
      await writeFile(join(projectRoot, "manifest.json"), JSON.stringify(manifest));
      await symlink(join(sourceRoot, "ask-matt"), globalLink, "dir");
      await symlink(join(sourceRoot, "ask-matt"), projectLink, "dir");

      const result = await runUpdateInSubprocess({ project, root, owner, remote });

      expect(result.repos).toEqual([
        {
          repo: `${owner}/abc`,
          updated: ["ask-matt"],
          removed: [],
          added: ["writing-for-agents"],
        },
      ]);
      // Source cleanup is deferred because another scope may still link the old revision.
      expect((await stat(join(sourceRoot, "writing-great-skills"))).isDirectory()).toBe(true);
      expect(await stat(join(sourceRoot, "writing-for-agents")).catch(() => null)).toBeNull();
      expect((await lstat(globalLink)).isSymbolicLink()).toBe(true);
      expect((await lstat(projectLink)).isSymbolicLink()).toBe(true);
      expect(await readFile(join(globalLink, "SKILL.md"), "utf8")).toContain("upstream-current");
      expect(await readFile(join(projectLink, "SKILL.md"), "utf8")).toContain("upstream-current");
      expect(JSON.parse(await readFile(join(globalRoot, "manifest.json"), "utf8"))).toEqual(
        manifest,
      );
      expect(JSON.parse(await readFile(join(projectRoot, "manifest.json"), "utf8"))).toEqual(
        manifest,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(join(tmpdir(), "skill-clones", owner), { force: true, recursive: true });
    }
  });
});

async function runGit(args: string[]): Promise<void> {
  const command = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([
    command.exited,
    new Response(command.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git ${args.join(" ")} failed`);
  }
}

async function runUpdateInSubprocess(options: {
  project: string;
  root: string;
  owner: string;
  remote: string;
}) {
  const { project, root, owner, remote } = options;
  const updateModule = join(import.meta.dir, "..", "src", "commands", "update.ts");
  const script = [
    `import { runUpdate } from ${JSON.stringify(updateModule)};`,
    "const result = await runUpdate({ input: { concurrency: 1, progress: false } });",
    "console.log(JSON.stringify(result));",
  ].join("\n");
  const command = Bun.spawn(["bun", "-e", script], {
    cwd: project,
    env: {
      ...process.env,
      HOME: root,
      GIT_ALLOW_PROTOCOL: "file",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.file://${remote}.insteadOf`,
      GIT_CONFIG_VALUE_0: `https://github.com/${owner}/abc.git`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    command.exited,
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "runUpdate subprocess failed");
  }

  return JSON.parse(stdout);
}
