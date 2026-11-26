import { resolve } from 'node:path'

import type { ListInput } from '../types'

import { listInstalledMaps, listInstalledSkills } from '../lib/installed-skills'
import { estimateSkillListTokens } from '../lib/skill-token-estimate'

export async function runList(args: { input: ListInput }) {
	const installed = (
		await Promise.all([
			listInstalledSkills(process.cwd()),
			listInstalledMaps(process.cwd()),
		])
	).flat()
	const skills = installed.filter(
		(skill) => !args.input.scope || skill.scope === args.input.scope,
	)
	const problems = skills.flatMap((skill) =>
		'problem' in skill && skill.problem
			? [
					{
						file: resolve(skill.installRoot, 'SKILL.md'),
						problem: skill.problem,
						fix: skill.fix,
					},
				]
			: [],
	)
	return {
		skills: skills.map((skill) => ({
			file: resolve(skill.installRoot, 'SKILL.md'),
			description: skill.description,
		})),
		...(problems.length > 0 ? { problems } : {}),
		summary: {
			count: skills.length,
			estimatedTokens: estimateSkillListTokens(skills),
		},
	}
}
