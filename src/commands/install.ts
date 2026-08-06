import { installRepoSkills } from "../lib/add-skills";
import {
  installProjectRepoMap,
  restoreGlobalSkills,
  restoreProjectSkills,
} from "../lib/project-skills";
import { resolveSourceTarget } from "../lib/source-ref";
import { formatGitHubSkillId } from "../lib/skill-ref";
import { parseSkillSelectors } from "../lib/skill-selector";
import type { InstallInput } from "../types";

export async function runInstall(args: { input: InstallInput }) {
  const input = args.input;
  if (input.map && input.repo.length === 0) {
    throw new Error("Install --map requires a repository ref.");
  }

  if (input.global && input.map) {
    throw new Error("Install --global does not support --map.");
  }

  if (input.repo.length === 0) {
    return restoreLinks(input.global);
  }

  if (input.repo.length > 1) {
    throw new Error(
      "Install accepts at most one repository ref. Use --skills for multiple skills.",
    );
  }

  const target = resolveSourceTarget(input.repo[0]!);
  if (input.map) {
    if (target.skill || target.sourcePath || normalizeSelectors(input.skills).length > 0) {
      throw new Error("Install --map accepts a repository ref only; do not pass a skill selector.");
    }

    const { installRoot, mappedSkills } = await installProjectRepoMap({
      cwd: process.cwd(),
      repo: target.repo,
    });
    return {
      kind: "map" as const,
      repo: target.repo.display,
      installRoot,
      skills: mappedSkills.map((skill) => skill.relativeDir),
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

async function restoreLinks(global: boolean) {
  const result = global
    ? await restoreGlobalSkills(process.cwd())
    : await restoreProjectSkills(process.cwd());
  return {
    kind: "restore" as const,
    scope: global ? ("global" as const) : ("local" as const),
    ...result,
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
