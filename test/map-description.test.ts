import { describe, expect, test } from 'bun:test'

import type { RepoRef } from '../src/types'

import { runInstall } from '../src/commands/install'
import {
	checkMapDescription,
	resolveMapDescription,
} from '../src/lib/map-description'

const repo = {
	owner: 'rorkai',
	repo: 'app-store-connect-cli-skills',
	cloneUrl: 'https://github.com/rorkai/app-store-connect-cli-skills.git',
	display: 'rorkai/app-store-connect-cli-skills',
} satisfies RepoRef

const good =
	'Operate App Store Connect through the asc CLI. Use when the user mentions TestFlight, review submission, or App Store Connect.'

describe('map description', () => {
	test('accepts what-it-does plus a Use when trigger', () => {
		expect(checkMapDescription(good)).toBeUndefined()
		expect(
			checkMapDescription(
				'通过 asc CLI 操作 App Store Connect;用户提到上架、提审、TestFlight 时使用此路由。',
			),
		).toBeUndefined()
	})

	test('rejects name lists, short text, missing triggers and overlong text', () => {
		expect(checkMapDescription('')).toBe('missing')
		expect(
			checkMapDescription(
				'rorkai/app-store-connect-cli-skills router: asc-ad-hoc-distribution, asc-analytics-reports, asc-app-create-ui',
			),
		).toContain('Use when')
		expect(checkMapDescription('Use when shipping')).toContain('too short')
		expect(checkMapDescription(`${good} ${'x'.repeat(1024)}`)).toContain(
			'too long',
		)
	})

	test('prefers explicit input, then the manifest, never anything else', () => {
		expect(
			resolveMapDescription({
				repo,
				explicit: `  ${good.replace('. Use', '.\n  Use')}  `,
				stored: 'ignored',
			}),
		).toBe(good)
		expect(resolveMapDescription({ repo, stored: good })).toBe(good)
	})

	test('fails with a retry command when nothing was provided or it is invalid', () => {
		for (const options of [
			{ repo },
			{ repo, explicit: 'router: a, b, c, d, e, f, g, h, i, j, k, l, m, n' },
		]) {
			let message = ''
			try {
				resolveMapDescription(options)
			} catch (error) {
				message = (error as Error).message
			}
			expect(message).toContain('Example:')
			expect(message).toContain(
				"skill install \"{ repo: ['rorkai/app-store-connect-cli-skills'], map: true, description:",
			)
		}
	})

	test('rejects a description outside a map install', async () => {
		await expect(
			runInstall({
				input: {
					repo: ['better-auth/skills'],
					skills: '',
					map: false,
					global: false,
					description: good,
				},
			}),
		).rejects.toThrow('Install --description only applies to --map.')
	})
})
