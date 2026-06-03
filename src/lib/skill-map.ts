import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { discoverSkills } from "./discover-skills";
import { fetchRepoDescription } from "./github";
import { getVisibleMapRoot } from "./paths";
import { readSkillFrontmatterMetadata } from "./skill-frontmatter";
import type { RepoRef, SkillCandidate } from "../types";

const INTENT_MAX_LENGTH = 180;
const MAP_RECOMMENDATION_MIN_SKILLS = 4;

export async function shouldRecommendRepoMap(
  _repoDir: string,
  skills: SkillCandidate[],
): Promise<boolean> {
  return skills.length >= MAP_RECOMMENDATION_MIN_SKILLS;
}

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

  const repoDescription = await fetchRepoDescription(repo).catch(() => "");
  const installRoot = getVisibleMapRoot("local", options.cwd, repo);
  const contents = await renderSkillMap({
    cloneDir,
    repo,
    repoDescription,
    skills: mappedSkills,
  });

  await mkdir(installRoot, { recursive: true });
  await writeFile(join(installRoot, "SKILL.md"), contents);
  return { installRoot, mappedSkills };
}

export async function renderSkillMap(options: {
  cloneDir: string;
  repo: RepoRef;
  repoDescription: string;
  skills: SkillCandidate[];
}): Promise<string> {
  const lines = [
    "---",
    `name: ${JSON.stringify(`${options.repo.owner}.${options.repo.repo}`)}`,
    `description: ${JSON.stringify(options.repoDescription)}`,
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
    lines.push(`- When ${intent}, read \`${skill.sourceDir}/SKILL.md\`.`);
  }

  return `${lines.join("\n")}\n`;
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
