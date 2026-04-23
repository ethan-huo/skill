import type { FavoriteSkill, RepoRef, RepoSkillTarget } from "../types";

const GITHUB_HOST = "github.com";

export function parseRepoRef(raw: string): RepoRef {
  const value = raw.trim();
  if (!value) {
    throw new Error("Repository cannot be empty.");
  }

  const httpMatch = parseHttpRepo(value);
  if (httpMatch) {
    return httpMatch;
  }

  const sshMatch = parseSshRepo(value);
  if (sshMatch) {
    return sshMatch;
  }

  const shortMatch = parseShortRepo(value);
  if (shortMatch) {
    return shortMatch;
  }

  throw new Error(
    "Unsupported repository format. Use owner/repo, https://github.com/owner/repo, or git@github.com:owner/repo.git.",
  );
}

export function parseRepoSkillTarget(raw: string): RepoSkillTarget {
  const value = raw.trim();
  if (!value) {
    throw new Error("Repository cannot be empty.");
  }

  const skillMatch = parseShortSkillRef(value);
  if (!skillMatch) {
    return { repo: parseRepoRef(value) };
  }

  return {
    repo: {
      owner: assertSafeSegment(skillMatch.owner, "Owner"),
      repo: assertSafeSegment(skillMatch.repo, "Repository"),
      cloneUrl: `https://${GITHUB_HOST}/${skillMatch.owner}/${skillMatch.repo}.git`,
      display: `${skillMatch.owner}/${skillMatch.repo}`,
    },
    skill: assertSafeSegment(skillMatch.skill, "Skill"),
  };
}

export function parseSkillId(raw: string): FavoriteSkill {
  const value = raw.trim();
  if (!value) {
    throw new Error("Skill ID cannot be empty.");
  }

  const match = parseShortSkillRef(value);
  if (!match) {
    throw new Error("Skill ID must use owner/repo/skill format.");
  }

  const owner = assertSafeSegment(match.owner, "Owner");
  const repo = assertSafeSegment(match.repo, "Repository");
  const skill = assertSafeSegment(match.skill, "Skill");

  return {
    id: `${owner}/${repo}/${skill}`,
    owner,
    repo,
    skill,
  };
}

function parseHttpRepo(value: string): RepoRef | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname !== GITHUB_HOST) {
    throw new Error("Only github.com repositories are supported right now.");
  }

  const segments = url.pathname
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length < 2) {
    throw new Error("GitHub repository URLs must include owner and repo.");
  }

  if (segments.length > 2) {
    throw new Error(
      "GitHub repository URLs must point to the repository root. Use owner/repo/skill shorthand to target a specific skill.",
    );
  }

  const owner = assertSafeSegment(segments[0]!, "Owner");
  const repo = assertSafeSegment(segments[1]!, "Repository");

  return {
    owner,
    repo,
    cloneUrl: `https://${GITHUB_HOST}/${owner}/${repo}.git`,
    display: `${owner}/${repo}`,
  };
}

function parseSshRepo(value: string): RepoRef | null {
  const match = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(value);
  if (!match) {
    return null;
  }

  const owner = assertSafeSegment(match[1]!, "Owner");
  const repo = assertSafeSegment(match[2]!, "Repository");

  return {
    owner,
    repo,
    cloneUrl: `https://${GITHUB_HOST}/${owner}/${repo}.git`,
    display: `${owner}/${repo}`,
  };
}

function parseShortRepo(value: string): RepoRef | null {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(value);
  if (!match) {
    return null;
  }

  const owner = assertSafeSegment(match[1]!, "Owner");
  const repo = assertSafeSegment(match[2]!, "Repository");

  return {
    owner,
    repo,
    cloneUrl: `https://${GITHUB_HOST}/${owner}/${repo}.git`,
    display: `${owner}/${repo}`,
  };
}

function parseShortSkillRef(value: string): { owner: string; repo: string; skill: string } | null {
  const match = /^([^/\s]+)\/([^/\s]+)\/([^/\s]+)$/.exec(value);
  if (!match) {
    return null;
  }

  return {
    owner: match[1]!,
    repo: match[2]!,
    skill: match[3]!,
  };
}

function assertSafeSegment(value: string, label: string): string {
  if (value === "." || value === "..") {
    throw new Error(`${label} cannot be "." or "..".`);
  }

  return value;
}
