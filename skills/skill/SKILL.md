---
name: skill
description: Manage agent skills with the `skill` CLI. Use when the user asks to install suitable skills into the current project, inspect or refresh favorite skills, or manage installed skills from GitHub repositories.
---

# skill — Skill Manager

`skill` installs agent skills from GitHub into the current project or the user's global skill root.

For agents, the main job is not to expose every command. The main job is to help the user get the right skills into the current project with the least machinery.

## First Step (REQUIRED)

Before using this tool, inspect its command surface once:

```bash
skill --schema
```

Use the schema output to understand the available commands, arguments, and flags in one pass. Do not guess the command surface from memory.

## Primary Workflow (REQUIRED)

1. Read the current project context first.
   Look at the stack, runtime, framework, repo shape, and any existing `.agents/skills` state before deciding what to install.
2. Start from favorites, not search.
   Use `skill favorite list` to inspect the user's curated refs.
3. Pick a small set of relevant skills from the user's favorites.
   Prefer skill-level refs such as `owner/repo/skill` when they already exist.
4. Install locally by default.
   Use `--global` only when the user explicitly wants a cross-project install.
5. Verify the result.
   Run `skill list` after installation when the user asked for concrete setup work.

## Install Paths For Agents

Prefer non-interactive installs whenever you already know the exact skill IDs:

```bash
skill add owner/repo/skill
skill add owner/repo --skill skill-a --skill skill-b
```

Use repo-level favorites as broader hints, not as the first choice for automation.

- `owner/repo/skill`: strongest signal, install directly
- `owner/repo`: broader signal, may require a second selection step if the repo contains multiple skills

If repo-level and skill-level favorites for the same repo are both selected, treat the repo-level favorite as the install scope and the skill-level favorites as default selections within that repo.

## When To Use `find`

Use `skill find <query>` only when at least one of these is true:

- the user's favorites do not cover the task
- the user explicitly asks to browse or discover new skills
- you need a new candidate before recommending it be favorited

Do not start with `find` if the favorites already contain a good match.

## Interactive vs Non-Interactive

- Prefer non-interactive commands for agent work.
- Start from `skill --schema` for command discovery, then use normal CLI commands directly.
- `skill favorite list --json` is optional. Use it only when structured output is genuinely useful for piping or external processing.
- `skill favorite pick` and `skill add owner/repo` without explicit `--skill` are interactive flows. Use them only when prompt-driven selection is acceptable in the current session.

## Maintenance Commands

These are valid tools, but they are not the default agent path.

- `skill favorite refresh`: refresh cached descriptions and remove upstream refs that no longer exist
- `skill update`: refresh installed skills from upstream
- `skill remove owner/repo[/skill]`: remove installed skills
- `skill favorite add/remove`: manage the user's favorite refs

Use maintenance commands when the user asks for maintenance. Do not churn installed skills or favorites unprompted.

## Failure Modes

- If `favorite add` or `favorite refresh` fails because `gh` is not authenticated, tell the user to run `gh auth login` and retry.
- If non-interactive install hits a repo with multiple skills, rerun with explicit `--skill` selectors instead of relying on prompts.
- If local install conflicts with an existing global install of the same repo, ask whether the global install should remain the source of truth.
