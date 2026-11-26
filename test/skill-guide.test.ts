import { selectSchema } from '@celados/argc'
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { schema } from '../src/schema'

const srcDir = join(import.meta.dir, '..', 'src')

describe('agent guide (src/index.md)', () => {
	test('every section names an @schema selector built from real commands', async () => {
		const guide = await readFile(join(srcDir, 'index.md'), 'utf8')
		const roots = new Set(Object.keys(schema))
		const matches = [...guide.matchAll(/^## .+ — (.+)$/gm)].map((m) => m[1]!)
		expect(matches.length).toBeGreaterThan(0)
		for (const raw of matches) {
			const needsQuotes = /[*{}]/.test(raw)
			if (needsQuotes) {
				expect(raw.startsWith("'") && raw.endsWith("'")).toBe(true)
			}
			const selector = needsQuotes ? raw.slice(1, -1) : raw
			for (const name of selector.replace(/^\{|\}$/g, '').split(',')) {
				expect(roots.has(name.replace(/\.\*$/, ''))).toBe(true)
			}
			expect(() => selectSchema(schema, selector)).not.toThrow()
		}
	})
})
