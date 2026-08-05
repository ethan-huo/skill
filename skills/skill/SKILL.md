---
name: skill
description: >
  Manage agent skills with the `skill` CLI when installing suitable skills,
  inspecting favorites, or maintaining GitHub and filesystem-backed installs.
---

# skill — Skill Manager

`skill` installs agent skills from GitHub or live filesystem origins into the current project or the user's global skill root.

For agents, the main job is not to expose every command. The main job is to help the user get the right skills into the current project with the least machinery.

## First Step (REQUIRED)

Before using this tool, inspect its command surface once:

```bash
skill @schema
```

Commands use dotted paths and one quoted object literal. Use the schema output
to learn the exact input type instead of guessing it from memory.

## Primary Workflow (REQUIRED)

1. Read the current project context first.
   Look at the stack, runtime, framework, repo shape, and any existing `.agents/skills` state before deciding what to install.
2. Start from favorites, not search.
   Use `skill favorite.list` to inspect the user's curated refs.
3. Pick a small set of relevant skills from the user's favorites.
   Prefer canonical IDs from `skill list`, such as `gh:owner/repo/path/to/skill` or
   `fs:/absolute/path/to/skill`, when they already exist.
4. Install locally by default.
   Use `--global` only when the user explicitly wants a cross-project install.
5. Verify the result.
   Run `skill list` after installation when the user asked for concrete setup work.

## Install Paths For Agents

Prefer non-interactive installs whenever you already know the exact skill IDs:

```bash
skill add "{ repo: 'owner/repo/skill' }"
skill add "{ repo: 'gh:owner/repo/path/to/skill' }"
skill add "{ repo: 'owner/repo', skills: 'skill-a,skill-b' }"
skill add "{ repo: 'owner/repo', skills: 'core/{skill-a,skill-b},claude/skill-c' }"
skill add "{ repo: 'fs:../agents/skills', skills: 'skill-a,skill-b' }"
```

Filesystem sources must use deterministic path syntax: an absolute path, `./`, `../`, `~/`,
`fs:<path>`, or a `file://` URL. A bare `owner/repo` is always GitHub syntax even if that
relative directory exists. Filesystem skills are linked directly from their canonical origin,
so edits are live and `skill update` does not copy or fetch them.
`skill list` exposes filesystem skills as `fs:<absolute-skill-path>` and GitHub skills as
`gh:<owner>/<repo>/<source-path>`; both forms can be passed back to add, install, or remove.

Use a repo map when the repo is a broad skill catalog and you do not need specific local bundles:

```bash
skill install "{ repo: ['owner/repo'], map: true }"
```

Use repo-level favorites as broader hints, not as the first choice for automation.

- `gh:owner/repo/path/to/skill`: strongest signal, install the exact discovered source
- `owner/repo/skill`: convenient shorthand when the logical folder ID is unambiguous
- `owner/repo`: broader signal, may install a repo map or require a second selection step

If repo-level and skill-level favorites for the same repo are both selected, treat the repo-level favorite as the install scope and the skill-level favorites as default selections within that repo.

## Repo Maps

Repo maps are project-local synthetic skills for broad catalogs. They keep one visible skill folder and route to upstream source files with `ctx read github://owner/repo/<path>`.

Use a map when the user wants coverage from a repo that has multiple skills and no obvious single target. Do not install a pile of separate skills just because the repo exposes them separately.

Interactive project installs offer a repo map alongside individual skills. The two modes are mutually exclusive. Non-interactive installs must choose explicitly with `--map` or `--skills`.

Project-scope `skill update` regenerates maps recorded in `.agents/skills/manifest.json`.

## When To Use `find`

Use `skill find "{ query: '<query>' }"` only when at least one of these is true:

- the user's favorites do not cover the task
- the user explicitly asks to browse or discover new skills
- you need a new candidate before recommending it be favorited

Do not start with `find` if the favorites already contain a good match.

## Interactive vs Non-Interactive

- Prefer non-interactive commands for agent work.
- Start from `skill @schema` for command discovery, then use structured object input.
- Successful commands return YAML on stdout; progress and interactive UI use stderr.
- `skill favorite.install` and `skill favorite.remove` without ids are interactive flows. Use them only when prompt-driven selection is acceptable in the current session.
- `skill add "{ repo: 'owner/repo' }"` may prompt. Non-interactive installs must pass `skills` or explicitly use `map` through `install`.

## Maintenance Commands

These are valid tools, but they are not the default agent path.

- `skill favorite.refresh`: refresh cached descriptions and remove upstream refs that no longer exist
- `skill update`: refresh GitHub installs; filesystem origins are already live
- `skill remove "{ repo: ['gh:owner/repo/path/to/skill'] }"`: remove an installed skill by canonical ID
- `skill favorite.add` / `skill favorite.remove`: manage the user's favorite refs

Use maintenance commands when the user asks for maintenance. Do not churn installed skills or favorites unprompted.

## Failure Modes

- If `favorite add` or `favorite refresh` fails because `gh` is not authenticated, tell the user to run `gh auth login` and retry.
- If non-interactive install hits multiple logical skills or variants, rerun with `--skills 'skill,variant/{skill,...}'` or use `--map` when a repo-level index is the right outcome.
- If local install conflicts with an existing global install of the same repo, ask whether the global install should remain the source of truth.
