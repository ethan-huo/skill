import { readFile, writeFile } from "node:fs/promises";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;
const TOP_LEVEL_KEY_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/;

export async function repairSkillFrontmatterFile(skillFile: string): Promise<boolean> {
  const contents = await readFile(skillFile, "utf8");
  const repaired = repairSkillFrontmatter(contents);
  if (repaired === contents) {
    return false;
  }

  await writeFile(skillFile, repaired);
  return true;
}

export async function normalizeSkillFrontmatterFile(
  skillFile: string,
  name: string,
): Promise<boolean> {
  const contents = await readFile(skillFile, "utf8");
  const repaired = repairSkillFrontmatter(contents);
  const normalized = rewriteSkillName(repaired, name);
  if (normalized === contents) {
    return false;
  }

  await writeFile(skillFile, normalized);
  return true;
}

export function repairSkillFrontmatter(contents: string): string {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) {
    return contents;
  }

  const frontmatter = match[1]!;
  if (canParseYaml(frontmatter)) {
    return contents;
  }

  const repaired = parseLooseTopLevelFrontmatter(frontmatter);
  if (repaired === null) {
    return contents;
  }

  const yaml = Bun.YAML.stringify(repaired, null, 2).trimEnd();
  return `---\n${yaml}\n---${match[2]!}${contents.slice(match[0].length)}`;
}

export function rewriteSkillName(contents: string, name: string): string {
  const match = FRONTMATTER_PATTERN.exec(contents);
  if (!match) {
    throw new Error("SKILL.md must start with YAML frontmatter.");
  }
  const frontmatter = match[1]!;
  if (!/^name:[^\r\n]*$/m.test(frontmatter)) {
    throw new Error("SKILL.md frontmatter must contain a top-level name field.");
  }
  // A surgical replacement preserves author-owned comments and formatting in otherwise valid YAML.
  const rewritten = frontmatter.replace(/^name:[^\r\n]*$/m, `name: ${name}`);
  return `${contents.slice(0, match.index)}---\n${rewritten}\n---${match[2]!}${contents.slice(match[0].length)}`;
}

function canParseYaml(frontmatter: string): boolean {
  try {
    Bun.YAML.parse(frontmatter);
    return true;
  } catch {
    return false;
  }
}

function parseLooseTopLevelFrontmatter(
  frontmatter: string,
): Record<string, string | string[]> | null {
  const result: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }

    const keyValue = TOP_LEVEL_KEY_PATTERN.exec(line);
    if (keyValue) {
      currentKey = keyValue[1]!;
      result[currentKey] = normalizeLooseScalar(keyValue[2] ?? "");
      continue;
    }

    const listItem = /^\s*-\s+(.+)$/.exec(line);
    if (
      listItem &&
      currentKey &&
      (result[currentKey] === "" || Array.isArray(result[currentKey]))
    ) {
      const currentValue = result[currentKey];
      result[currentKey] = [
        ...(Array.isArray(currentValue) ? currentValue : []),
        normalizeLooseScalar(listItem[1]!),
      ];
      continue;
    }

    if (/^\s/.test(line) && currentKey && typeof result[currentKey] === "string") {
      result[currentKey] = `${result[currentKey]} ${line.trim()}`.trim();
      continue;
    }

    // Invalid structured YAML is too ambiguous to rewrite without risking data loss.
    return null;
  }

  return Object.keys(result).length > 0 ? result : null;
}

function normalizeLooseScalar(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted?.[2] ?? trimmed;
}
