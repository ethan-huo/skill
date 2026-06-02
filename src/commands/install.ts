import { fmt } from "argc/terminal";

import { installRepoSkills } from "../lib/add-skills";
import { installProjectRepoMap, restoreProjectSkills } from "../lib/project-skills";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import type { InstallInput } from "../types";

export async function runInstall(args: { input: InstallInput }): Promise<void> {
  const input = args.input;
  if (input.map && input.repo.length === 0) {
    throw new Error("Install --map requires a repository ref.");
  }

  if (input.repo.length === 0) {
    await restoreProjectLinks();
    return;
  }

  if (input.repo.length > 1) {
    throw new Error("Install accepts at most one repository ref. Use --skill for multiple skills.");
  }

  const target = parseRepoSkillTarget(input.repo[0]!);
  if (input.map) {
    if (target.skill || normalizeSelectors(input.skill).length > 0) {
      throw new Error("Install --map accepts a repository ref only; do not pass a skill selector.");
    }

    const { installRoot, mappedSkills } = await installProjectRepoMap({
      cwd: process.cwd(),
      repo: target.repo,
    });
    console.log(`Linked map for ${mappedSkills.length} skill(s) to ${installRoot}`);
    console.log(`- ${target.repo.display} (map)`);
    return;
  }

  const repo = target.repo;
  const selectors = normalizeSelectors(input.skill, target.skill);
  const result = await installRepoSkills({
    cwd: process.cwd(),
    global: false,
    repo,
    selectors,
  });

  if (result.kind === "map") {
    console.log(`Linked map for ${result.mappedSkills.length} skill(s) to ${result.installRoot}`);
    console.log(`- ${repo.display} (map)`);
    return;
  }

  console.log(`Linked ${result.selectedSkills.length} skill(s) to ${result.installRoot}`);
  for (const skill of result.selectedSkills) {
    console.log(`- ${repo.display}/${skill.relativeDir}`);
  }
}

async function restoreProjectLinks(): Promise<void> {
  const result = await restoreProjectSkills(process.cwd());

  if (result.restored.length === 0 && result.missing.length === 0) {
    console.log(fmt.info("No project skills are recorded in .agents/skills/manifest.json."));
    return;
  }

  for (const skill of result.restored) {
    console.log(fmt.green(`~ ${skill}`));
  }

  for (const skill of result.missing) {
    console.log(fmt.red(`- ${skill} (missing upstream)`));
  }
}

function normalizeSelectors(value: string | string[], shorthandSkill?: string): string[] {
  const explicitSelectors = Array.isArray(value) ? value : value ? [value] : [];
  if (!shorthandSkill) {
    return explicitSelectors;
  }

  if (explicitSelectors.length === 0) {
    return [shorthandSkill];
  }

  const normalizedSelectors = new Set(
    explicitSelectors.map((selector) => selector.trim()).filter(Boolean),
  );
  if (normalizedSelectors.size === 1 && normalizedSelectors.has(shorthandSkill)) {
    return [shorthandSkill];
  }

  throw new Error(
    `Conflicting skill selectors: repo shorthand requested "${shorthandSkill}" but --skill provided ${explicitSelectors.join(", ")}.`,
  );
}
