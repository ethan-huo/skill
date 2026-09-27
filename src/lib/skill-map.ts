import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { getLegacyVisibleMapRoot, getVisibleMapRoot, getVisibleMapDirName } from "./paths";
import { readSkillFrontmatterMetadata } from "./skill-frontmatter";
import type { RepoRef, SkillCandidate } from "../types";

const INTENT_MAX_LENGTH = 180;

export async function writeProjectSkillMap(options: {
  cloneDir: string;
  cwd: string;
  repo: RepoRef;
}): Promise<{ installRoot: string; mappedSkills: SkillCandidate[] }> {
  const cloneDir = options.cloneDir;
  const repo = options.repo;
  const mappedSkills = await discoverSkills(cloneDir);
  if (mappedSkills.length === 0) {
    throw new Error(`No SKILL.md files found in ${repo.display}.`);
  }

  const installRoot = getVisibleMapRoot("local", options.cwd, repo);
  const legacyInstallRoot = getLegacyVisibleMapRoot("local", options.cwd, repo);
  const contents = await renderSkillMap({
    cloneDir,
    repo,
    skills: mappedSkills,
  });

  await rm(legacyInstallRoot, { force: true, recursive: true });
  await mkdir(installRoot, { recursive: true });
  await writeFile(join(installRoot, "SKILL.md"), contents);
  return { installRoot, mappedSkills };
}

// Agent Skills spec limit for frontmatter descriptions.
const DESCRIPTION_MAX_LENGTH = 1024;

// Derived from repository contents only: GitHub descriptions are often missing or
// off-target. Listing skill names lets prompts mention a specific routed skill.
export function getMapDescription(repo: RepoRef, skills: SkillCandidate[]): string {
  const prefix = `${repo.repo} skills router`;
  const names = [...new Set(skills.map((skill) => skill.displayLabel))];
  if (names.length === 0) {
    return prefix;
  }

  for (let count = names.length; count > 0; count--) {
    const omitted = names.length - count;
    const suffix = omitted > 0 ? `, +${omitted} more` : "";
    const description = `${prefix}: ${names.slice(0, count).join(", ")}${suffix}`;
    if (description.length <= DESCRIPTION_MAX_LENGTH) {
      return description;
    }
  }
  return prefix;
}

export async function renderSkillMap(options: {
  cloneDir: string;
  repo: RepoRef;
  skills: SkillCandidate[];
}): Promise<string> {
  const lines = [
    "---",
    `name: ${JSON.stringify(getVisibleMapDirName(options.repo))}`,
    `description: ${JSON.stringify(getMapDescription(options.repo, options.skills))}`,
    "---",
    "",
    `Source: \`github://${options.repo.owner}/${options.repo.repo}\``,
    `Use \`ctx read github://${options.repo.owner}/${options.repo.repo}/<path>\` to read source files before applying them.`,
    "",
  ];

  for (const skill of options.skills) {
    const metadata = await readSkillFrontmatterMetadata(
      join(options.cloneDir, skill.sourceDir, "SKILL.md"),
    ).catch(() => ({ name: "", description: "" }));
    const intent = summarizeIntent(metadata.description, skill);
    lines.push(`- When ${intent}, read \`${getSkillFilePath(skill)}\`.`);
  }

  return `${lines.join("\n")}\n`;
}

function getSkillFilePath(skill: SkillCandidate): string {
  return skill.sourceDir === "." ? "SKILL.md" : `${skill.sourceDir}/SKILL.md`;
}

function summarizeIntent(description: string, skill: SkillCandidate): string {
  const normalized = description
    .replace(/\s+/g, " ")
    .replace(/^use this skill when\s+/i, "")
    .replace(/^activate this skill when\s+/i, "")
    .trim();
  const fallback = `working with ${skill.displayLabel.replace(/[-_]+/g, " ")}`;
  const source = normalized || fallback;
  if (source.length <= INTENT_MAX_LENGTH) {
    return trimTrailingPunctuation(source);
  }

  const sentenceBoundary = source.slice(0, INTENT_MAX_LENGTH).search(/[.!?](?=\s|$)/);
  if (sentenceBoundary >= 40) {
    return trimTrailingPunctuation(source.slice(0, sentenceBoundary + 1));
  }

  return `${source.slice(0, INTENT_MAX_LENGTH - 1).trim()}...`;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.!?:;]+$/g, "").trim();
}
