import { installRepoSkills } from "../lib/add-skills";
import { installFilesystemSkills } from "../lib/filesystem-skills";
import { resolveSourceTarget } from "../lib/source-ref";
import { formatFilesystemSkillId, formatGitHubSkillId } from "../lib/skill-ref";
import { parseSkillSelectors } from "../lib/skill-selector";
import type { AddInput } from "../types";

export async function runAdd(args: { input: AddInput }) {
  const input = args.input;
  const target = await resolveSourceTarget(input.repo, process.cwd());
  if (target.kind === "filesystem") {
    const result = await installFilesystemSkills({
      cwd: process.cwd(),
      global: input.global,
      source: target,
      selectors: parseSkillSelectors(input.skills),
    });
    return {
      kind: "skills" as const,
      repo: target.repo.display,
      installRoot: result.installRoot,
      skills: result.selectedSkills.map((skill) =>
        formatFilesystemSkillId(`${target.path}/${skill.sourceDir}`),
      ),
    };
  }
  const repo = target.repo;
  const selectors = normalizeSelectors(input.skills, target.skill);
  const result = await installRepoSkills({
    cwd: process.cwd(),
    global: input.global,
    repo,
    selectors,
    sourcePath: target.sourcePath,
  });

  if (result.kind === "map") {
    return {
      kind: "map" as const,
      repo: repo.display,
      installRoot: result.installRoot,
      skills: result.mappedSkills.map((skill) => skill.relativeDir),
    };
  }

  return {
    kind: "skills" as const,
    repo: repo.display,
    installRoot: result.installRoot,
    skills: result.selectedSkills.map((skill) => formatGitHubSkillId(repo, skill.sourceDir)),
  };
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
