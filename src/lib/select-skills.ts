import { exclusiveMultiselect, searchableMultiselect, selectOne } from "./prompt";
import { formatSkillSelector } from "./skill-selector";
import type { SkillCandidate, SkillGroup, SkillSelector } from "../types";

const MAP_SELECTION = "__skill_map__";

type SelectSkillsOptions = {
  selectors?: SkillSelector[];
  initialSelectors?: string[];
  initialMap?: boolean;
  offerMap?: boolean;
  promptForSelection?: boolean;
};

type SelectSkillsDependencies = {
  isTty?: () => boolean;
  selectVariant?: (message: string, variants: string[]) => Promise<string>;
};

export type SkillSelection =
  | { mode: "map"; skills: [] }
  | { mode: "skills"; skills: SkillCandidate[] };

export async function selectSkills(
  repoDisplay: string,
  groups: SkillGroup[],
  options: SelectSkillsOptions = {},
  dependencies: SelectSkillsDependencies = {},
): Promise<SkillSelection> {
  if (groups.length === 0) {
    return { mode: "skills", skills: [] };
  }

  const selectors = options.selectors ?? [];
  const initialSelectors = new Set(
    (options.initialSelectors ?? []).map((value) => value.trim()).filter(Boolean),
  );

  if (selectors.length > 0) {
    const selectedGroups = selectGroupsByExpression(groups, selectors);
    return {
      mode: "skills",
      skills: await resolveSelectedCandidates(repoDisplay, selectedGroups, selectors, dependencies),
    };
  }

  if (groups.length === 1) {
    return {
      mode: "skills",
      skills: await resolveSelectedCandidates(repoDisplay, groups, [], dependencies),
    };
  }

  if (!options.promptForSelection && initialSelectors.size === 0 && groups.length > 1) {
    if (!(dependencies.isTty ?? defaultIsTty)()) {
      throw new Error(
        `Repository ${repoDisplay} contains multiple skills. Re-run in a TTY or pass --skills '<skill,...>'.`,
      );
    }
  }

  if (!(dependencies.isTty ?? defaultIsTty)()) {
    throw new Error(
      `Repository ${repoDisplay} contains multiple skills. Re-run in a TTY or pass --skills '<skill,...>'.`,
    );
  }

  const skillOptions = groups.map((group) => ({
    label:
      group.candidates.length > 1
        ? `${group.displayLabel} (${group.candidates.length} variants)`
        : group.displayLabel,
    value: group.relativeDir,
  }));
  const initialValues = groups
    .map((group) => group.relativeDir)
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
  const selectedGroups = groups.filter((group) => selectedPaths.has(group.relativeDir));
  return {
    mode: "skills",
    skills: await resolveSelectedCandidates(repoDisplay, selectedGroups, [], dependencies),
  };
}

function selectGroupsByExpression(groups: SkillGroup[], selectors: SkillSelector[]): SkillGroup[] {
  const byId = new Map(groups.map((group) => [group.relativeDir, group]));
  const missing = selectors.filter((selector) => !byId.has(selector.skill));
  if (missing.length > 0) {
    throw new Error(
      `Unknown skill selector(s): ${missing.map(formatSkillSelector).join(", ")}. Use skill IDs from the prompt list.`,
    );
  }
  return selectors.map((selector) => byId.get(selector.skill)!);
}

async function resolveSelectedCandidates(
  repoDisplay: string,
  groups: SkillGroup[],
  selectors: SkillSelector[],
  dependencies: SelectSkillsDependencies,
): Promise<SkillCandidate[]> {
  const selectorBySkill = new Map(selectors.map((selector) => [selector.skill, selector]));
  const resolved: SkillCandidate[] = [];
  const ambiguous: SkillGroup[] = [];

  for (const group of groups) {
    const selector = selectorBySkill.get(group.relativeDir);
    if (selector?.variant) {
      const candidate = group.candidates.find(
        (candidate) => candidate.variant === selector.variant,
      );
      if (!candidate) {
        throw new Error(
          `Variant "${selector.variant}" does not provide skill "${selector.skill}". Available selectors: ${formatCandidates(group).join(", ")}.`,
        );
      }
      resolved.push(candidate);
      continue;
    }
    if (group.candidates.length === 1) {
      resolved.push(group.candidates[0]!);
      continue;
    }
    ambiguous.push(group);
  }

  if (ambiguous.length === 0) {
    return sortCandidates(resolved);
  }
  if (!(dependencies.isTty ?? defaultIsTty)()) {
    throw new Error(
      `Repository ${repoDisplay} has variant choices for: ${ambiguous.map((group) => group.relativeDir).join(", ")}. Pass explicit selectors such as ${formatCandidates(ambiguous[0]!).join(" or ")}.`,
    );
  }

  const sharedVariants = getSharedVariantSet(ambiguous);
  if (sharedVariants !== null) {
    const variant = await (dependencies.selectVariant ?? selectVariant)(
      `Choose a variant for ${ambiguous.length} selected skill${ambiguous.length === 1 ? "" : "s"}`,
      sharedVariants,
    );
    for (const group of ambiguous) {
      resolved.push(group.candidates.find((candidate) => candidate.variant === variant)!);
    }
    return sortCandidates(resolved);
  }

  for (const group of ambiguous) {
    const variants = group.candidates.map((candidate) => candidate.variant!);
    const variant = await (dependencies.selectVariant ?? selectVariant)(
      `Choose a variant for ${group.relativeDir}`,
      variants,
    );
    resolved.push(group.candidates.find((candidate) => candidate.variant === variant)!);
  }
  return sortCandidates(resolved);
}

function getSharedVariantSet(groups: SkillGroup[]): string[] | null {
  const first = groups[0]!.candidates.map((candidate) => candidate.variant!);
  return groups.every((group) => {
    const variants = group.candidates.map((candidate) => candidate.variant!);
    return (
      variants.length === first.length &&
      variants.every((variant, index) => variant === first[index])
    );
  })
    ? first
    : null;
}

async function selectVariant(message: string, variants: string[]): Promise<string> {
  return selectOne({
    message,
    options: variants.map((variant) => ({ label: variant, value: variant })),
    initialValue: variants[0]!,
  });
}

function formatCandidates(group: SkillGroup): string[] {
  return group.candidates.map((candidate) => `${candidate.variant}/${candidate.relativeDir}`);
}

function sortCandidates(candidates: SkillCandidate[]): SkillCandidate[] {
  return candidates.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir));
}

function defaultIsTty(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
