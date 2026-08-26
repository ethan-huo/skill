import { createHash } from "node:crypto";
import { basename, dirname, join, posix, relative } from "node:path";

import { validateSkillSelectorName } from "./skill-selector";
import type { SkillCandidate, SkillGroup } from "../types";

const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", ".next", "target"]);
const ROOT_SKILL_ID = "root";

export async function discoverSkills(repoDir: string): Promise<SkillCandidate[]> {
  const glob = new Bun.Glob("**/SKILL.md");
  const candidates: SkillCandidate[] = [];

  // `**/SKILL.md` only matches descendants, but a repository root is also a valid skill bundle.
  if (await Bun.file(join(repoDir, "SKILL.md")).exists()) {
    candidates.push({
      relativeDir: ROOT_SKILL_ID,
      sourceDir: ".",
      displayLabel: ROOT_SKILL_ID,
    });
  }

  for await (const match of glob.scan({
    cwd: repoDir,
    onlyFiles: true,
    absolute: true,
    dot: true,
    followSymlinks: false,
  })) {
    const skillDir = dirname(match);
    const sourceDir = toPortableRelative(repoDir, skillDir);
    if (!sourceDir || shouldIgnore(sourceDir)) {
      continue;
    }

    const relativeDir = validateSkillSelectorName(basename(skillDir), "skill");
    candidates.push({
      relativeDir,
      sourceDir,
      displayLabel: relativeDir,
    });
  }

  return collapseIdenticalCandidates(repoDir, candidates);
}

export async function discoverSkillGroups(repoDir: string): Promise<SkillGroup[]> {
  return groupSkillCandidates(await discoverSkills(repoDir));
}

export function groupSkillCandidates(candidates: SkillCandidate[]): SkillGroup[] {
  const grouped = Map.groupBy(candidates, (candidate) => candidate.relativeDir);
  return [...grouped.entries()]
    .map(([relativeDir, group]) => {
      const candidatesWithVariants =
        group.length === 1 ? group : assignVariantLabels(group.sort(compareSourceDir));
      return {
        relativeDir,
        displayLabel: relativeDir,
        candidates: candidatesWithVariants,
      };
    })
    .sort((left, right) => left.relativeDir.localeCompare(right.relativeDir));
}

export async function fingerprintSkillDirectory(skillDir: string): Promise<string> {
  const files = [
    ...(await Array.fromAsync(
      new Bun.Glob("**/*").scan({
        cwd: skillDir,
        onlyFiles: true,
        dot: true,
        followSymlinks: false,
      }),
    )),
  ].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    if (file.split(posix.sep).includes(".git")) {
      continue;
    }
    hash.update(file);
    hash.update("\0");
    hash.update(new Uint8Array(await Bun.file(join(skillDir, file)).arrayBuffer()));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function collapseIdenticalCandidates(
  repoDir: string,
  candidates: SkillCandidate[],
): Promise<SkillCandidate[]> {
  const unique: SkillCandidate[] = [];
  const groups = Map.groupBy(
    candidates.sort(compareCandidate),
    (candidate) => candidate.relativeDir,
  );

  for (const group of groups.values()) {
    if (group.length === 1) {
      unique.push(group[0]!);
      continue;
    }

    const fingerprints = new Set<string>();
    for (const candidate of group) {
      const fingerprint = await fingerprintSkillDirectory(join(repoDir, candidate.sourceDir));
      if (fingerprints.has(fingerprint)) {
        continue;
      }
      fingerprints.add(fingerprint);
      unique.push(candidate);
    }
  }

  return unique.sort(compareCandidate);
}

function assignVariantLabels(candidates: SkillCandidate[]): SkillCandidate[] {
  const parentSegments = candidates.map((candidate) =>
    dirname(candidate.sourceDir).split(posix.sep).filter(Boolean),
  );
  const segmentCounts = new Map<string, number>();
  for (const segments of parentSegments) {
    for (const segment of new Set(segments)) {
      segmentCounts.set(segment, (segmentCounts.get(segment) ?? 0) + 1);
    }
  }
  const distinctiveLabels = parentSegments.map((segments) =>
    segments.findLast((segment) => segmentCounts.get(segment) === 1),
  );
  if (distinctiveLabels.every((label): label is string => typeof label === "string")) {
    return withVariantLabels(candidates, distinctiveLabels);
  }

  const suffixLengths = parentSegments.map(() => 1);

  while (true) {
    const labels = parentSegments.map((segments, index) =>
      segments.slice(-suffixLengths[index]!).join("."),
    );
    const duplicates = new Set(labels.filter((label, index) => labels.indexOf(label) !== index));
    if (duplicates.size === 0) {
      return withVariantLabels(
        candidates,
        labels.map((label) => label || "root"),
      );
    }

    let expanded = false;
    for (const [index, label] of labels.entries()) {
      const suffixLength = suffixLengths[index]!;
      if (!duplicates.has(label) || suffixLength >= parentSegments[index]!.length) {
        continue;
      }
      suffixLengths[index] = suffixLength + 1;
      expanded = true;
    }
    if (!expanded) {
      throw new Error(
        `Cannot derive unique variant names for skill "${candidates[0]!.relativeDir}" from: ${candidates.map((candidate) => candidate.sourceDir).join(", ")}.`,
      );
    }
  }
}

function withVariantLabels(candidates: SkillCandidate[], labels: string[]): SkillCandidate[] {
  return candidates
    .map((candidate, index) => ({
      ...candidate,
      variant: validateSkillSelectorName(labels[index]!, "variant"),
    }))
    .sort((left, right) => left.variant!.localeCompare(right.variant!));
}

function toPortableRelative(rootDir: string, targetDir: string): string {
  const relativePath = relative(rootDir, targetDir);
  if (!relativePath || relativePath.startsWith("..")) {
    return "";
  }

  return relativePath.split("\\").join(posix.sep);
}

function shouldIgnore(relativeDir: string): boolean {
  const segments = relativeDir.split("/");
  // Hidden roots are tool-owned configuration, not portable skill catalogs.
  return segments[0]?.startsWith(".") || segments.some((segment) => IGNORED_SEGMENTS.has(segment));
}

function compareCandidate(left: SkillCandidate, right: SkillCandidate): number {
  return (
    left.relativeDir.localeCompare(right.relativeDir) ||
    left.sourceDir.localeCompare(right.sourceDir)
  );
}

function compareSourceDir(left: SkillCandidate, right: SkillCandidate): number {
  return left.sourceDir.localeCompare(right.sourceDir);
}
