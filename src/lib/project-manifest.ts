import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { getProjectManifestPath } from "./paths";

export type ProjectManifest = {
  skills: string[];
};

export async function readProjectManifest(cwd: string): Promise<ProjectManifest> {
  const filePath = getProjectManifestPath(cwd);
  const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  });

  if (raw === null) {
    return { skills: [] };
  }

  const data = JSON.parse(raw) as unknown;
  if (!isProjectManifest(data)) {
    throw new Error(`Invalid project skill manifest at ${filePath}.`);
  }

  return {
    skills: [...new Set(data.skills)].sort(),
  };
}

export async function writeProjectManifest(cwd: string, manifest: ProjectManifest): Promise<void> {
  const filePath = getProjectManifestPath(cwd);
  const next = {
    skills: [...new Set(manifest.skills)].sort(),
  } satisfies ProjectManifest;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function addProjectManifestSkills(cwd: string, skillIds: string[]): Promise<void> {
  const manifest = await readProjectManifest(cwd);
  await writeProjectManifest(cwd, {
    skills: [...manifest.skills, ...skillIds],
  });
}

function isProjectManifest(data: unknown): data is ProjectManifest {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { skills?: unknown }).skills) &&
    (data as { skills: unknown[] }).skills.every((skill) => typeof skill === "string")
  );
}
