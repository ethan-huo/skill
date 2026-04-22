import { readFile } from "node:fs/promises";

type SkillFrontmatter = {
  description?: string;
};

export async function readSkillDescription(skillFile: string): Promise<string> {
  const contents = await readFile(skillFile, "utf8");
  const frontmatter = extractFrontmatter(contents);
  if (!frontmatter) {
    return "";
  }

  const parsed = Bun.YAML.parse(frontmatter) as SkillFrontmatter | SkillFrontmatter[] | null;
  const frontmatterDoc = Array.isArray(parsed) ? parsed[0] : parsed;
  return sanitizeDescription(frontmatterDoc?.description ?? "");
}

function extractFrontmatter(contents: string): string | null {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents);
  return match?.[1] ?? null;
}

function sanitizeDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
