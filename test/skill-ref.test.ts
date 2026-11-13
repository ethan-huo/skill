import { describe, expect, test } from 'bun:test'

import { parseRepoRef } from '../src/lib/repo-ref'
import {
	formatGitHubSkillId,
	formatManifestSkillId,
	parseCanonicalGitHubSkillRef,
} from '../src/lib/skill-ref'

describe('canonical skill refs', () => {
	test('preserves the repository-relative GitHub source path', () => {
		const repo = parseRepoRef('celados/agents')
		const id = formatGitHubSkillId(repo, 'skills/fullstack')

		expect(id).toBe('gh:celados/agents/skills/fullstack')
		expect(parseCanonicalGitHubSkillRef(id)).toMatchObject({
			kind: 'github',
			repo: { owner: 'celados', repo: 'agents' },
			sourcePath: 'skills/fullstack',
		})
	})

	test('formats manifest skills as canonical GitHub source refs', () => {
		expect(
			formatManifestSkillId('celados/agents', {
				id: 'fullstack',
				source: 'skills/fullstack',
			}),
		).toBe('gh:celados/agents/skills/fullstack')
	})
})
