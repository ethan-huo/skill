import { installRepoSkills } from "../lib/add-skills";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import type { AddInput } from "../types";

export async function runAdd(args: { input: AddInput }): Promise<void> {
  const input = args.input;
  const target = parseRepoSkillTarget(input.repo);
  const repo = target.repo;
  const selectors = normalizeSelectors(input.skill, target.skill);
  const result = await installRepoSkills({
    cwd: process.cwd(),
    global: input.global,
    repo,
    selectors,
  });

  if (result.kind === "map") {
    console.log(
      `Installed map for ${result.mappedSkills.length} skill(s) to ${result.installRoot}`,
    );
    console.log(`- ${repo.display} (map)`);
    return;
  }

  console.log(`Installed ${result.selectedSkills.length} skill(s) to ${result.installRoot}`);
  for (const skill of result.selectedSkills) {
    console.log(`- ${repo.display}/${skill.relativeDir}`);
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
