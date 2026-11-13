import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { RepoRef, SkillCandidate } from '../types'
import type { ManifestSkill } from './project-manifest'

import { shallowCloneRepo } from './git'
import {
	linkInstalledSkills,
	removeVisibleRepoSkills,
	removeVisibleSkillAliases,
} from './install'
import { seedGlobalManifestFromVisibleLinks } from './installed-skills'
import {
	getSkillsBaseDir,
	getSourceInstallRoot,
	hasProjectScope,
} from './paths'
import {
	addScopeManifestMap,
	getProjectManifestMaps,
	getProjectManifestSkills,
	readScopeManifest,
	removeProjectManifestSkillIds,
	resolveProjectManifestSkillSources,
	writeScopeManifest,
} from './project-manifest'
import { parseRepoRef } from './repo-ref'
import { writeProjectSkillMap } from './skill-map'
import { formatManifestSkillId } from './skill-ref'
import { updateSourceRepo } from './source-skills'

export async function installProjectRepoMap(options: {
	cwd: string
	repo: RepoRef
}): Promise<{ installRoot: string; mappedSkills: SkillCandidate[] }> {
	const cloneDir = await shallowCloneRepo(options.repo)
	await removeProjectRepoSkillAliases(options.cwd, options.repo)
	const result = await writeProjectSkillMap({
		cloneDir,
		cwd: options.cwd,
		repo: options.repo,
	})
	await addScopeManifestMap(
		'local',
		options.cwd,
		`${options.repo.owner}/${options.repo.repo}`,
	)
	return result
}

export async function restoreProjectSkills(cwd: string): Promise<{
	restored: string[]
	missing: string[]
}> {
	const manifest = await readScopeManifest('local', cwd)
	const groups = groupManifestEntries(getProjectManifestSkills(manifest))
	const restored: string[] = []
	const missing: string[] = []
	const missingManifestIds: string[] = []
	let nextManifest = manifest
	for (const group of groups.values()) {
		const repo = parseRepoRef(`${group.owner}/${group.repo}`)
		const cloneDir = await shallowCloneRepo(repo)
		const sourceRoot = getSourceInstallRoot(repo)
		const sourceUpdate = await updateSourceRepo({
			cloneDir,
			repo,
			sourceRoot,
			installedSkills: group.skills,
		})
		const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills)

		for (const skill of sourceUpdate.diff.removed) {
			const skillId = `${group.owner}/${group.repo}/${skill}`
			const manifestSkill = group.skills.find(
				(candidate) => candidate.id === skill,
			)
			missing.push(
				manifestSkill
					? formatManifestSkillId(`${group.owner}/${group.repo}`, manifestSkill)
					: skillId,
			)
			missingManifestIds.push(skillId)
			await removeProjectSkill(repo, cwd, skill)
		}

		if (selectedSkills.length === 0) {
			continue
		}

		const installRoot = getSkillsBaseDir('local', cwd)
		await linkInstalledSkills(sourceRoot, installRoot, repo, selectedSkills)
		nextManifest = resolveProjectManifestSkillSources(
			nextManifest,
			`${group.owner}/${group.repo}`,
			sourceUpdate.resolvedSkills,
		)

		for (const skill of sourceUpdate.resolvedSkills) {
			restored.push(
				formatManifestSkillId(`${group.owner}/${group.repo}`, skill),
			)
		}
	}

	if (missingManifestIds.length > 0) {
		nextManifest = removeProjectManifestSkillIds(
			nextManifest,
			missingManifestIds,
		)
	}

	for (const item of getProjectManifestMaps(manifest)) {
		const repo = parseRepoRef(item.repo)
		const cloneDir = await shallowCloneRepo(repo)
		const result = await writeProjectSkillMap({ cloneDir, cwd, repo })
		restored.push(`${item.repo} (map: ${result.mappedSkills.length} skills)`)
	}

	if (hasProjectManifest(cwd)) {
		await writeScopeManifest('local', cwd, nextManifest)
	}

	return { restored: restored.sort(), missing: missing.sort() }
}

export async function restoreGlobalSkills(cwd: string): Promise<{
	restored: string[]
	missing: string[]
}> {
	await seedGlobalManifestFromVisibleLinks(cwd)
	const manifest = await readScopeManifest('global', cwd)
	const groups = groupManifestEntries(getProjectManifestSkills(manifest))
	const restored: string[] = []
	const missing: string[] = []
	const missingManifestIds: string[] = []
	let nextManifest = manifest

	for (const group of groups.values()) {
		const repo = parseRepoRef(`${group.owner}/${group.repo}`)
		const cloneDir = await shallowCloneRepo(repo)
		const sourceRoot = getSourceInstallRoot(repo)
		const sourceUpdate = await updateSourceRepo({
			cloneDir,
			repo,
			sourceRoot,
			installedSkills: group.skills,
		})
		const selectedSkills = toCachedCandidates(sourceUpdate.resolvedSkills)

		for (const skill of sourceUpdate.diff.removed) {
			const skillId = `${group.owner}/${group.repo}/${skill}`
			const manifestSkill = group.skills.find(
				(candidate) => candidate.id === skill,
			)
			missing.push(
				manifestSkill
					? formatManifestSkillId(`${group.owner}/${group.repo}`, manifestSkill)
					: skillId,
			)
			missingManifestIds.push(skillId)
			await removeVisibleSkillAliases(
				getSkillsBaseDir('global', cwd),
				repo,
				skill,
			)
		}

		if (selectedSkills.length === 0) {
			continue
		}

		await linkInstalledSkills(
			sourceRoot,
			getSkillsBaseDir('global', cwd),
			repo,
			selectedSkills,
		)
		nextManifest = resolveProjectManifestSkillSources(
			nextManifest,
			`${group.owner}/${group.repo}`,
			sourceUpdate.resolvedSkills,
		)

		for (const skill of sourceUpdate.resolvedSkills) {
			restored.push(
				formatManifestSkillId(`${group.owner}/${group.repo}`, skill),
			)
		}
	}

	if (missingManifestIds.length > 0) {
		nextManifest = removeProjectManifestSkillIds(
			nextManifest,
			missingManifestIds,
		)
		await writeScopeManifest('global', cwd, nextManifest)
	} else if (hasScopeManifest('global', cwd)) {
		await writeScopeManifest('global', cwd, nextManifest)
	}

	return { restored: restored.sort(), missing: missing.sort() }
}

export async function syncProjectMapRepo(options: {
	cwd: string
	repoId: string
}): Promise<{
	repoId: string
	mappedSkills: number
}> {
	const { cwd, repoId } = options
	const repo = parseRepoRef(repoId)
	const cloneDir = await shallowCloneRepo(repo)
	const result = await writeProjectSkillMap({ cloneDir, cwd, repo })
	return { repoId, mappedSkills: result.mappedSkills.length }
}

export async function syncProjectMapFromClone(options: {
	cwd: string
	repo: RepoRef
	cloneDir: string
}): Promise<{ repoId: string; mappedSkills: number }> {
	const result = await writeProjectSkillMap({
		cloneDir: options.cloneDir,
		cwd: options.cwd,
		repo: options.repo,
	})
	return {
		repoId: `${options.repo.owner}/${options.repo.repo}`,
		mappedSkills: result.mappedSkills.length,
	}
}

export async function syncProjectSkillLinks(options: {
	cwd: string
	repo: RepoRef
	sourceRoot: string
	installedIds?: string[]
	updated: string[]
	removed: string[]
}): Promise<void> {
	const { cwd, repo, sourceRoot, installedIds = [], updated, removed } = options
	const selectedSkills = toProjectCandidates(installedIds, updated)

	if (selectedSkills.length > 0) {
		await linkInstalledSkills(
			sourceRoot,
			getSkillsBaseDir('local', cwd),
			repo,
			selectedSkills,
		)
	}

	await removeProjectSkillLinks(cwd, repo, removed)
}

export async function removeProjectSkillLinks(
	cwd: string,
	repo: RepoRef,
	removed: string[],
): Promise<void> {
	for (const skill of removed) {
		await removeVisibleSkillAliases(getSkillsBaseDir('local', cwd), repo, skill)
	}
}

export async function pruneProjectManifestSkills(
	cwd: string,
	missingSkillIds: string[],
): Promise<void> {
	if (missingSkillIds.length === 0) {
		return
	}

	const missing = new Set(missingSkillIds)
	const manifest = await readScopeManifest('local', cwd)
	await writeScopeManifest(
		'local',
		cwd,
		removeProjectManifestSkillIds(manifest, [...missing]),
	)
}

export function hasProjectManifest(cwd: string): boolean {
	return hasScopeManifest('local', cwd)
}

export function hasScopeManifest(
	scope: 'local' | 'global',
	cwd: string,
): boolean {
	if (scope === 'local' && !hasProjectScope(cwd)) {
		return false
	}
	return existsSync(join(getSkillsBaseDir(scope, cwd), 'manifest.json'))
}

function groupManifestEntries(
	skills: Array<ManifestSkill & { repo: string }>,
): Map<string, { owner: string; repo: string; skills: ManifestSkill[] }> {
	const groups = new Map<
		string,
		{ owner: string; repo: string; skills: ManifestSkill[] }
	>()
	for (const skill of skills) {
		const repo = parseRepoRef(skill.repo)
		const key = `${repo.owner}/${repo.repo}`
		const current = groups.get(key) ?? {
			owner: repo.owner,
			repo: repo.repo,
			skills: [],
		}
		current.skills.push({ id: skill.id, source: skill.source })
		groups.set(key, current)
	}
	return groups
}

async function removeProjectSkill(
	repo: RepoRef,
	cwd: string,
	skill: string,
): Promise<void> {
	await removeVisibleSkillAliases(getSkillsBaseDir('local', cwd), repo, skill)
}

async function removeProjectRepoSkillAliases(
	cwd: string,
	repo: RepoRef,
): Promise<void> {
	const repoId = `${repo.owner}/${repo.repo}`
	const manifestSkills = getProjectManifestSkills(
		await readScopeManifest('local', cwd),
	).filter((skill) => skill.repo === repoId)
	const skillsRoot = getSkillsBaseDir('local', cwd)
	for (const skill of manifestSkills) {
		await removeVisibleSkillAliases(skillsRoot, repo, skill.id)
	}
	await removeVisibleRepoSkills(skillsRoot, repo)
}

function toProjectCandidates(
	installedIds: string[],
	updated: string[],
): SkillCandidate[] {
	const updatedSet = new Set(updated)
	return installedIds
		.filter((skill) => updatedSet.has(skill))
		.map((skill) => ({
			relativeDir: skill,
			sourceDir: skill,
			displayLabel: skill,
		}))
}

function toCachedCandidates(skills: ManifestSkill[]): SkillCandidate[] {
	return skills.map((skill) => ({
		relativeDir: skill.id,
		sourceDir: skill.id,
		displayLabel: skill.id,
	}))
}
