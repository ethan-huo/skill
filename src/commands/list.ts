import { listInstalledSkills } from "../lib/installed-skills";
import { estimateSkillListTokens } from "../lib/skill-token-estimate";

export async function runList() {
  const skills = await listInstalledSkills(process.cwd());
  return {
    skills: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      scope: skill.scope,
    })),
    summary: {
      count: skills.length,
      estimatedTokens: estimateSkillListTokens(skills),
    },
  };
}
