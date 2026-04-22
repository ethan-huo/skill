import type { UpdateDiff } from "../types";

export function diffSkillSets(installed: string[], latest: string[]): UpdateDiff {
  const installedSet = new Set(installed);
  const latestSet = new Set(latest);

  const updated = installed.filter((skill) => latestSet.has(skill)).sort();
  const removed = installed.filter((skill) => !latestSet.has(skill)).sort();
  const added = latest.filter((skill) => !installedSet.has(skill)).sort();

  return {
    updated,
    removed,
    added,
  };
}
