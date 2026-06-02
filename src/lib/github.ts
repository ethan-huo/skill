import type { RepoRef } from "../types";

type GitHubRepoResponse = {
  description?: unknown;
};

export class GitHubNotFoundError extends Error {}

export async function fetchRepoDescription(repo: RepoRef): Promise<string> {
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
    throw new Error("GitHub CLI is required. Install `gh` and retry.");
  }

  const exitCode = await proc.exited;
  const stderr = (await new Response(proc.stderr as ReadableStream).text()).trim();
  if (exitCode !== 0) {
    if (/\b404\b/.test(stderr)) {
      throw new GitHubNotFoundError(stderr);
    }

    if (
      /authentication failed|not logged into any GitHub hosts|try authenticating with/i.test(stderr)
    ) {
      throw new Error("GitHub CLI is not authenticated. Run `gh auth login` and retry.");
    }

    if (/unknown command|not found|No such file or directory/i.test(stderr)) {
      throw new Error("GitHub CLI is required. Install `gh` and retry.");
    }

    throw new Error(stderr || "gh api failed.");
  }

  return new Response(proc.stdout as ReadableStream).json();
}
