import { readFile } from "node:fs/promises";

type SkillFrontmatter = {
  name?: unknown;
  description?: unknown;
};

export type SkillFrontmatterMetadata = {
  name: string;
  description: string;
};

export async function readSkillDescription(skillFile: string): Promise<string> {
  return (await readSkillFrontmatterMetadata(skillFile)).description;
}

export async function readSkillFrontmatterMetadata(
  skillFile: string,
): Promise<SkillFrontmatterMetadata> {
  const contents = await readFile(skillFile, "utf8");
  const frontmatter = extractFrontmatter(contents);
  if (!frontmatter) {
    return { name: "", description: "" };
  }

  const parsed = Bun.YAML.parse(frontmatter) as SkillFrontmatter | SkillFrontmatter[] | null;
  const frontmatterDoc = Array.isArray(parsed) ? parsed[0] : parsed;
  return {
    name: normalizeFrontmatterText(frontmatterDoc?.name),
    description: normalizeFrontmatterText(frontmatterDoc?.description),
  };
}

function extractFrontmatter(contents: string): string | null {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents);
  return match?.[1] ?? null;
}

function sanitizeFrontmatterText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeFrontmatterText(value: unknown): string {
  return typeof value === "string" ? sanitizeFrontmatterText(value) : "";
}
