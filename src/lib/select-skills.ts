import { exclusiveMultiselect, searchableMultiselect } from "./prompt";
import type { SkillCandidate } from "../types";

const MAP_SELECTION = "__skill_map__";

type SelectSkillsOptions = {
  selectors?: string[];
  initialSelectors?: string[];
  initialMap?: boolean;
  offerMap?: boolean;
  promptForSelection?: boolean;
};

export type SkillSelection =
  | { mode: "map"; skills: [] }
  | { mode: "skills"; skills: SkillCandidate[] };

export async function selectSkills(
  repoDisplay: string,
  skills: SkillCandidate[],
  options: SelectSkillsOptions = {},
): Promise<SkillSelection> {
  if (skills.length === 0) {
    return { mode: "skills", skills: [] };
  }

  const selectors = options.selectors ?? [];
  const initialSelectors = new Set(
    (options.initialSelectors ?? []).map((value) => value.trim()).filter(Boolean),
  );

  if (skills.length === 1 && selectors.length === 0) {
    return { mode: "skills", skills };
  }

  if (selectors.length > 0) {
    const wanted = new Set(selectors.map((value) => value.trim()).filter(Boolean));
    const selected = skills.filter((skill) => wanted.has(skill.relativeDir));
    if (selected.length !== wanted.size) {
      const installed = new Set(selected.map((skill) => skill.relativeDir));
      const missing = [...wanted].filter((value) => !installed.has(value));
      throw new Error(
        `Unknown skill selector(s): ${missing.join(", ")}. Use skill folder IDs from the prompt list.`,
      );
    }
    return { mode: "skills", skills: selected };
  }

  if (!options.promptForSelection && initialSelectors.size === 0 && skills.length > 1) {
    if (!process.stdout.isTTY) {
      throw new Error(
        `Repository ${repoDisplay} contains multiple skills. Re-run in a TTY or pass --skill <folder>.`,
      );
    }
  }

  if (!process.stdout.isTTY) {
    throw new Error(
      `Repository ${repoDisplay} contains multiple skills. Re-run in a TTY or pass --skill <folder>.`,
    );
  }

  const skillOptions = skills.map((skill) => ({
    label: skill.displayLabel,
    value: skill.relativeDir,
  }));
  const initialValues = skills
    .map((skill) => skill.relativeDir)
    .filter((relativeDir) => initialSelectors.has(relativeDir));
  const response = options.offerMap
    ? await exclusiveMultiselect({
        message: `Select skills to install from ${repoDisplay}`,
        exclusiveValue: MAP_SELECTION,
        options: [{ label: "Install as repo map", value: MAP_SELECTION }, ...skillOptions],
        initialValues: options.initialMap ? [MAP_SELECTION] : initialValues,
      })
    : await searchableMultiselect({
        message: `Select skills to install from ${repoDisplay}`,
        options: skillOptions,
        initialValues,
        required: true,
      });

  if (response.includes(MAP_SELECTION)) {
    return { mode: "map", skills: [] };
  }

  const selectedPaths = new Set(response);
  return {
    mode: "skills",
    skills: skills.filter((skill) => selectedPaths.has(skill.relativeDir)),
  };
}
