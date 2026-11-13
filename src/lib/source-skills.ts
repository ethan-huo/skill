import { rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { RepoRef, SkillCandidate, UpdateDiff } from '../types'
import type { ManifestSkill } from './project-manifest'

import {
	discoverSkillGroups,
	discoverSkills,
	fingerprintSkillDirectory,
} from './discover-skills'
import {
	pruneEmptyParents,
	resolveInstalledSkillSource,
	upsertInstalledSkills,
} from './install'
import { getSourceInstallRoot, getSourceSkillsBaseDir } from './paths'
import { diffSkillSets } from './update-diff'

export async function updateSourceRepo(options: {
	cloneDir: string
	repo: RepoRef
	sourceRoot: string
	installedSkills?: ManifestSkill[]
}): Promise<{ diff: UpdateDiff; resolvedSkills: ManifestSkill[] }> {
	const { cloneDir, repo, sourceRoot } = options
	const installedSkills =
		options.installedSkills ??
		(await discoverSkills(sourceRoot)).map((skill) => ({
			id: skill.relativeDir,
		}))
	const latestGroups = await discoverSkillGroups(cloneDir)
	const latestIds = latestGroups.map((group) => group.relativeDir)
	const installedIds = installedSkills.map((skill) => skill.id)
	const diff = diffSkillSets(installedIds, latestIds)
	const updated = new Set(diff.updated)
	const resolvedCandidates: SkillCandidate[] = []

	for (const installed of installedSkills) {
		if (!updated.has(installed.id)) {
			continue
		}
		const group = latestGroups.find(
			(candidate) => candidate.relativeDir === installed.id,
		)!
		resolvedCandidates.push(
			await resolveInstalledCandidate(
				cloneDir,
				sourceRoot,
				group.candidates,
				installed,
			),
		)
	}

	if (resolvedCandidates.length > 0) {
		await upsertInstalledSkills(cloneDir, sourceRoot, repo, resolvedCandidates)
	}

	// Unselected sources may belong to another project; updating this scope must not
	// uninstall them. Selected sources are shared and update in place.
	await pruneEmptyParents(sourceRoot, getSourceSkillsBaseDir())
	return {
		diff,
		resolvedSkills: resolvedCandidates.map((candidate) => ({
			id: candidate.relativeDir,
			source: candidate.sourceDir,
		})),
	}
}

export async function removeSourceRepo(
	repo: Pick<RepoRef, 'owner' | 'repo'>,
	options: { sourceRoot?: string; sourceBaseDir?: string } = {},
): Promise<boolean> {
	const sourceRoot = options.sourceRoot ?? getSourceInstallRoot(repo)
	const sourceBaseDir = options.sourceBaseDir ?? getSourceSkillsBaseDir()
	const directory = await stat(sourceRoot).catch(() => null)
	if (!directory?.isDirectory()) {
		return false
	}

	await rm(sourceRoot, { force: true, recursive: true })
	await pruneEmptyParents(dirname(sourceRoot), sourceBaseDir)
	return true
}

async function resolveInstalledCandidate(
	cloneDir: string,
	sourceRoot: string,
	candidates: SkillCandidate[],
	installed: ManifestSkill,
): Promise<SkillCandidate> {
	if (installed.source) {
		const selected = candidates.find(
			(candidate) => candidate.sourceDir === installed.source,
		)
		if (selected) {
			return selected
		}
	}

	if (!installed.source && candidates.length === 1) {
		return candidates[0]!
	}

	const matching = await findCandidatesMatchingCache(
		cloneDir,
		sourceRoot,
		candidates,
		installed.id,
	)
	if (matching.length === 1) {
		return matching[0]!
	}

	if (installed.source) {
		throw new Error(
			`Selected source "${installed.source}" for skill "${installed.id}" no longer exists. Re-run skill add with an explicit variant.`,
		)
	}

	throw new Error(
		`Installed skill "${installed.id}" predates variant tracking and matches multiple sources: ${candidates.map((candidate) => `${candidate.variant}/${candidate.relativeDir}`).join(', ')}. Re-run skill add with an explicit variant.`,
	)
}

async function findCandidatesMatchingCache(
	cloneDir: string,
	sourceRoot: string,
	candidates: SkillCandidate[],
	skillId: string,
): Promise<SkillCandidate[]> {
	const cachedSource = await resolveInstalledSkillSource(sourceRoot, skillId)
	const cachedFingerprint = await fingerprintSkillDirectory(cachedSource).catch(
		() => null,
	)
	if (cachedFingerprint === null) {
		return []
	}

	const matching: SkillCandidate[] = []
	for (const candidate of candidates) {
		const fingerprint = await fingerprintSkillDirectory(
			join(cloneDir, candidate.sourceDir),
		)
		if (fingerprint === cachedFingerprint) {
			matching.push(candidate)
		}
	}
	return matching
}
