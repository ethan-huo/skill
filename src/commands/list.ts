import { resolve } from "node:path";

import { listInstalledSkills } from "../lib/installed-skills";
import { estimateSkillListTokens } from "../lib/skill-token-estimate";
import type { ListInput } from "../types";

export async function runList(args: { input: ListInput }) {
  const installed = await listInstalledSkills(process.cwd());
  const skills = installed.filter((skill) => !args.input.scope || skill.scope === args.input.scope);
  return {
    skills: skills.map((skill) => ({
      file: resolve(skill.installRoot, "SKILL.md"),
      name: skill.name,
      description: skill.description,
    })),
    summary: {
      count: skills.length,
      estimatedTokens: estimateSkillListTokens(skills),
    },
  };
}
