import type { FindInput } from '../types'

import { searchSkills } from '../lib/find-skills'

export async function runFind(args: { input: FindInput }) {
	const input = args.input
	return searchSkills(input.query, { limit: input.limit })
}
