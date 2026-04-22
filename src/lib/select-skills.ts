import * as p from "@clack/prompts";

import type { SkillCandidate } from "../types";

export async function selectSkills(
  repoDisplay: string,
  skills: SkillCandidate[],
  selectors: string[],
): Promise<SkillCandidate[]> {
  if (skills.length === 0) {
    return [];
  }

  if (skills.length === 1 && selectors.length === 0) {
    return skills;
  }

  if (selectors.length > 0) {
    const wanted = new Set(selectors.map((value) => value.trim()).filter(Boolean));
    const selected = skills.filter((skill) => wanted.has(skill.relativeDir));
    if (selected.length !== wanted.size) {
      const installed = new Set(selected.map((skill) => skill.relativeDir));
      const missing = [...wanted].filter((value) => !installed.has(value));
      throw new Error(
        `Unknown skill selector(s): ${missing.join(", ")}. Use relative skill paths from the prompt list.`,
      );
    }
    return selected;
  }

  if (!process.stdout.isTTY) {
    throw new Error(
      `Repository ${repoDisplay} contains multiple skills. Re-run in a TTY or pass --skill <relative/path>.`,
    );
  }

  const response = await p.multiselect({
    message: `Select skills to install from ${repoDisplay}`,
    options: skills.map((skill) => ({
      label: skill.displayLabel,
      value: skill.relativeDir,
    })),
    required: true,
  });

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  const selectedPaths = new Set(response);
  return skills.filter((skill) => selectedPaths.has(skill.relativeDir));
}
