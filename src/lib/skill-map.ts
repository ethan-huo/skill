import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { RepoRef, SkillCandidate } from '../types'

import { discoverSkills } from './discover-skills'
import {
	getLegacyVisibleMapRoot,
	getVisibleMapRoot,
	getVisibleMapDirName,
} from './paths'

export async function writeProjectSkillMap(options: {
	cloneDir: string
	cwd: string
	repo: RepoRef
	description: string
}): Promise<{ installRoot: string; mappedSkills: SkillCandidate[] }> {
	const cloneDir = options.cloneDir
	const repo = options.repo
	const mappedSkills = await discoverSkills(cloneDir)
	if (mappedSkills.length === 0) {
		throw new Error(`No SKILL.md files found in ${repo.display}.`)
	}

	const installRoot = getVisibleMapRoot('local', options.cwd, repo)
	const legacyInstallRoot = getLegacyVisibleMapRoot('local', options.cwd, repo)
	const contents = renderSkillMap({
		repo,
		description: options.description,
		skills: mappedSkills,
	})

	await rm(legacyInstallRoot, { force: true, recursive: true })
	await mkdir(installRoot, { recursive: true })
	await writeFile(join(installRoot, 'SKILL.md'), contents)
	return { installRoot, mappedSkills }
}

export function renderSkillMap(options: {
	repo: RepoRef
	description: string
	skills: SkillCandidate[]
}): string {
	const lines = [
		'---',
		`name: ${JSON.stringify(getVisibleMapDirName(options.repo))}`,
		`description: ${JSON.stringify(options.description)}`,
		'---',
		'',
		`Source: \`github://${options.repo.owner}/${options.repo.repo}\``,
		`Use \`ctx read github://${options.repo.owner}/${options.repo.repo}/<path>\` to read source files before applying them.`,
		'',
	]

	// Pointers only: upstream descriptions are read from the source, never paraphrased here.
	for (const skill of options.skills) {
		lines.push(`- ${skill.displayLabel}: \`${getSkillFilePath(skill)}\``)
	}

	return `${lines.join('\n')}\n`
}

function getSkillFilePath(skill: SkillCandidate): string {
	return skill.sourceDir === '.' ? 'SKILL.md' : `${skill.sourceDir}/SKILL.md`
}
