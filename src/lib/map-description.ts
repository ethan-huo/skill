import type { RepoRef } from '../types'

// Agent Skills spec limit for frontmatter descriptions.
const MAP_DESCRIPTION_MAX_LENGTH = 1024
const MAP_DESCRIPTION_MIN_LENGTH = 60

// A routing description must say when to read the skill, not just what it is called.
const TRIGGER_CUE =
	/\buse (?:this |the )?(?:map |router |skill )?(?:when|whenever|if|for)\b|\bwhen (?:the user|you|working|asked|a user|user)\b|\btrigger(?:s|ed)?\b|当|时使用|用于|触发/i

function normalizeMapDescription(value: string): string {
	return value.replace(/\s+/g, ' ').trim()
}

export function getMapRetryCommand(repo: RepoRef): string {
	return `skill install "{ repo: ['${repo.display}'], map: true, description: '<what it does>. Use when <trigger conditions>' }"`
}

// Returns why the description cannot route, or undefined when it is acceptable.
export function checkMapDescription(value: string): string | undefined {
	const description = normalizeMapDescription(value)
	if (!description) {
		return 'missing'
	}
	if (description.length < MAP_DESCRIPTION_MIN_LENGTH) {
		return `too short (${description.length} < ${MAP_DESCRIPTION_MIN_LENGTH} characters)`
	}
	if (description.length > MAP_DESCRIPTION_MAX_LENGTH) {
		return `too long (${description.length} > ${MAP_DESCRIPTION_MAX_LENGTH} characters)`
	}
	if (!TRIGGER_CUE.test(description)) {
		return 'it does not say when to use the map (no "Use when …" trigger)'
	}
	return undefined
}

class MapDescriptionError extends Error {
	constructor(repo: RepoRef, problem: string) {
		super(
			[
				`Repo map for ${repo.display}: ${problem}.`,
				'A map description must be written by you from the repo\'s real contents: what the skills do, then "Use when …" with the situations that should trigger it. It is never derived from GitHub, skill names, or upstream descriptions.',
				'Example: "Operate App Store Connect through the asc CLI: signing, builds, TestFlight, metadata, review submission. Use when the user mentions publishing, TestFlight, or App Store Connect."',
				'Re-run with an explicit description:',
				`  ${getMapRetryCommand(repo)}`,
			].join('\n'),
		)
	}
}

// Sources are only the explicit input and the value pinned in the manifest.
export function resolveMapDescription(options: {
	repo: RepoRef
	explicit?: string
	stored?: string
}): string {
	const explicit = normalizeMapDescription(options.explicit ?? '')
	const stored = normalizeMapDescription(options.stored ?? '')
	const description = explicit || stored
	if (!description) {
		throw new MapDescriptionError(options.repo, 'no description was provided')
	}
	const problem = checkMapDescription(description)
	if (problem) {
		throw new MapDescriptionError(options.repo, `description ${problem}`)
	}
	return description
}
