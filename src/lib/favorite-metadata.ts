import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { shallowCloneRepo } from "./git";
import { parseRepoRef } from "./repo-ref";
import { readSkillDescription } from "./skill-frontmatter";
import type { FavoriteRef, RepoRef } from "../types";

type GitHubRepoResponse = {
  description?: unknown;
};

export type FavoriteMetadata = {
  description: string;
  updatedAt: string;
};

export class FavoriteMissingError extends Error {}

export async function loadFavoriteMetadata(favorite: FavoriteRef): Promise<FavoriteMetadata> {
  const repo = parseRepoRef(`${favorite.owner}/${favorite.repo}`);
  const repoDescription = await fetchRepoDescription(repo);

  if (!favorite.skill) {
    return {
      description: repoDescription,
      updatedAt: new Date().toISOString(),
    };
  }

  const cloneDir = await shallowCloneRepo(repo);
  const discoveredSkills = await discoverSkills(cloneDir);
  const skill = discoveredSkills.find((candidate) => candidate.relativeDir === favorite.skill);
  if (!skill) {
    throw new FavoriteMissingError(`Favorite no longer exists: ${favorite.id}`);
  }

  const skillDescription =
    (await readSkillDescription(join(cloneDir, skill.sourceDir, "SKILL.md")).catch(() => "")) ||
    repoDescription;

  return {
    description: skillDescription,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchRepoDescription(repo: RepoRef): Promise<string> {
  const payload = (await runGhApi([
    "api",
    `repos/${repo.owner}/${repo.repo}`,
  ])) as GitHubRepoResponse;
  return sanitizeDescription(typeof payload.description === "string" ? payload.description : "");
}

function sanitizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function runGhApi(args: string[]): Promise<unknown> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["gh", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    throw new Error("GitHub CLI is required for favorite metadata. Install `gh` and retry.");
  }

  const exitCode = await proc.exited;
  const stderr = (await new Response(proc.stderr as ReadableStream).text()).trim();
  if (exitCode !== 0) {
    if (/\b404\b/.test(stderr)) {
      throw new FavoriteMissingError(stderr);
    }

    if (
      /authentication failed|not logged into any GitHub hosts|try authenticating with/i.test(stderr)
    ) {
      throw new Error("GitHub CLI is not authenticated. Run `gh auth login` and retry.");
    }

    if (/unknown command|not found|No such file or directory/i.test(stderr)) {
      throw new Error("GitHub CLI is required for favorite metadata. Install `gh` and retry.");
    }

    throw new Error(stderr || "gh api failed.");
  }

  return new Response(proc.stdout as ReadableStream).json();
}
