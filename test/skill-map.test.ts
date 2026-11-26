import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { RepoRef } from '../src/types'

import { syncProjectMapFromClone } from '../src/lib/project-skills'
import { renderSkillMap } from '../src/lib/skill-map'

const description =
	'Designer toolkit for taste and color. Use when the user designs or reviews UI visuals.'

const repo = {
	owner: 'Owl-Listener',
	repo: 'designer-skills',
	cloneUrl: 'https://github.com/Owl-Listener/designer-skills.git',
	display: 'Owl-Listener/designer-skills',
} satisfies RepoRef

describe('skill map', () => {
	test('syncs project maps by regenerating the visible map skill', async () => {
		const root = join(tmpdir(), `skill-map-sync-${crypto.randomUUID()}`)
		const cloneDir = join(root, 'repo')
		const cwd = join(root, 'project')
		await mkdir(join(cloneDir, 'skills', 'taste'), { recursive: true })
		const legacyMapRoot = join(
			cwd,
			'.agents',
			'skills',
			'Owl-Listener.designer-skills.map',
		)
		const mapRoot = join(
			cwd,
			'.agents',
			'skills',
			'map-designer-skills-owl-listener',
		)
		await mkdir(legacyMapRoot, { recursive: true })
		await writeFile(
			join(cloneDir, 'skills', 'taste', 'SKILL.md'),
			'---\nname: taste\ndescription: Improve visual taste\n---\n',
		)
		await writeFile(join(legacyMapRoot, 'SKILL.md'), 'stale map\n')

		await syncProjectMapFromClone({
			cloneDir,
			cwd,
			repo,
			description,
		})

		const mapContents = await readFile(join(mapRoot, 'SKILL.md'), 'utf8')
		expect(mapContents).toContain(`description: ${JSON.stringify(description)}`)
		expect(mapContents).toContain(
			'Source: `github://Owl-Listener/designer-skills`',
		)
		expect(mapContents).toContain('- taste: `skills/taste/SKILL.md`')
		expect(mapContents).not.toContain('stale map')
		expect(
			await readFile(join(legacyMapRoot, 'SKILL.md'), 'utf8').catch(() => null),
		).toBeNull()
	})

	test('renders the given description and path-only rows without upstream text', () => {
		expect(
			renderSkillMap({
				repo,
				description,
				skills: [
					{
						relativeDir: 'color-system',
						sourceDir: 'skills/color-system',
						displayLabel: 'color-system',
					},
					{ relativeDir: 'root', sourceDir: '.', displayLabel: 'root' },
				],
			}),
		).toBe(
			[
				'---',
				'name: "map-designer-skills-owl-listener"',
				`description: ${JSON.stringify(description)}`,
				'---',
				'',
				'Source: `github://Owl-Listener/designer-skills`',
				'Use `ctx read github://Owl-Listener/designer-skills/<path>` to read source files before applying them.',
				'',
				'- color-system: `skills/color-system/SKILL.md`',
				'- root: `SKILL.md`',
				'',
			].join('\n'),
		)
	})
})
