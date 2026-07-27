import { fmt } from "argc/terminal";

import { installRepoSkills } from "../lib/add-skills";
import {
  installProjectRepoMap,
  restoreGlobalSkills,
  restoreProjectSkills,
} from "../lib/project-skills";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import { parseSkillSelectors } from "../lib/skill-selector";
import type { InstallInput } from "../types";

export async function runInstall(args: { input: InstallInput }): Promise<void> {
  const input = args.input;
  if (input.map && input.repo.length === 0) {
    throw new Error("Install --map requires a repository ref.");
  }

  if (input.global && input.map) {
    throw new Error("Install --global does not support --map.");
  }

  if (input.repo.length === 0) {
    await restoreLinks(input.global);
    return;
  }

  if (input.repo.length > 1) {
    throw new Error(
      "Install accepts at most one repository ref. Use --skills for multiple skills.",
    );
  }

  const target = parseRepoSkillTarget(input.repo[0]!);
  if (input.map) {
    if (target.skill || normalizeSelectors(input.skills).length > 0) {
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
  const selectors = normalizeSelectors(input.skills, target.skill);
  const result = await installRepoSkills({
    cwd: process.cwd(),
    global: input.global,
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

async function restoreLinks(global: boolean): Promise<void> {
  const result = global
    ? await restoreGlobalSkills(process.cwd())
    : await restoreProjectSkills(process.cwd());

  if (result.restored.length === 0 && result.missing.length === 0) {
    const scope = global ? "global" : "project";
    const manifest = global ? "~/.agents/skills/manifest.json" : ".agents/skills/manifest.json";
    console.log(fmt.info(`No ${scope} skills are recorded in ${manifest}.`));
    return;
  }

  for (const skill of result.restored) {
    console.log(fmt.green(`~ ${skill}`));
  }

  for (const skill of result.missing) {
    console.log(fmt.red(`- ${skill} (missing upstream)`));
  }
}

function normalizeSelectors(value: string, shorthandSkill?: string) {
  const explicitSelectors = parseSkillSelectors(value);
  if (!shorthandSkill) {
    return explicitSelectors;
  }

  if (explicitSelectors.length === 0) {
    return [{ skill: shorthandSkill }];
  }

  if (
    explicitSelectors.length === 1 &&
    explicitSelectors[0]!.skill === shorthandSkill &&
    !explicitSelectors[0]!.variant
  ) {
    return explicitSelectors;
  }

  throw new Error(
    `Conflicting skill selectors: repo shorthand requested "${shorthandSkill}" but --skills provided "${value}".`,
  );
}
