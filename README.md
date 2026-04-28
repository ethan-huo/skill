# skill

Install, update, and curate agent skills from GitHub repositories.

`skill` is a small CLI for managing installable `SKILL.md` bundles across projects. It supports direct installation from GitHub repos, local and global install roots, and a favorites workflow that helps agents and users reuse the same curated skill set across projects.

## The Problem

Agent skills are useful only if they are easy to reuse.

Without a dedicated manager, teams usually end up copying `SKILL.md` files by hand, duplicating the same setup work across repositories, and losing track of which curated skills they actually want to keep using.

`skill` gives that workflow a stable contract:

- install skills directly from GitHub repositories
- keep project-local and global skill roots separate
- save favorite skill refs for repeated use
- refresh installed skills and favorite metadata over time

## Install

Install the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/ethan-huo/skill/main/install.sh | bash
```

By default, the installer downloads the executable JS bundle from GitHub Releases
and installs it to `~/.local/bin/skill`.

Set `SKILL_INSTALL_DIR` to choose another install directory.

Requirements:

- Bun 1.3+
- `git` on `PATH`
- `gh` on `PATH` for favorite metadata refresh and repo validation

## Core Workflow

### 1. Favorite-first project setup

For most real usage, start from favorites and install only what the current project needs.

```bash
skill install owner/repo/skill
skill install owner/repo --skill skill-a --skill skill-b
skill list
```

Agents should prefer this path over broad search when the user's favorites already contain good candidates.
Project installs keep the selected skill list in `.agents/skills/manifest.json` and link visible
project skills from the hidden shared source root under `~/.agents/.skills`.

### 2. Interactive user workflow

When a user wants prompt-driven selection instead of explicit install refs:

```bash
skill favorite pick
skill favorite pick --add
```

`favorite pick --add` merges same-repo selections into one install flow. Repo-level favorites may trigger a second skill-selection prompt when the repo contains multiple skills.

### 3. Search and discovery

When favorites do not cover the task, use the public search index:

```bash
skill find seo
skill find animation --limit 5
```

Search is a discovery path, not the default install path.

### 4. Maintenance

```bash
skill update
skill update --global
skill install

skill remove --global
skill remove owner/repo
skill remove owner/repo/skill

skill favorite refresh
skill favorite remove owner/repo owner/repo/skill
```

## Command Reference

### Install And Remove

| Command                                    | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| `skill add owner/repo/skill`               | Install one known skill directly                             |
| `skill add owner/repo --skill a --skill b` | Install multiple skills from one repo without prompts        |
| `skill add owner/repo`                     | Interactive selection when the repo contains multiple skills |
| `skill remove --global`                    | Interactively remove one or more global skills               |
| `skill remove owner/repo`                  | Remove one installed repo root                               |
| `skill remove owner/repo/skill`            | Remove one installed skill without touching siblings         |

### Project Links

| Command                                        | Purpose                                                      |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `skill install`                                | Rebuild project links from `.agents/skills/manifest.json`    |
| `skill install owner/repo/skill`               | Install a shared source and link one skill into this project |
| `skill install owner/repo --skill a --skill b` | Link multiple selected skills into this project              |

### Favorites

| Command                           | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `skill favorite add <refs...>`    | Save one or more favorite refs                                     |
| `skill favorite remove <refs...>` | Remove one or more favorite refs                                   |
| `skill favorite list`             | Show favorite refs with cached descriptions                        |
| `skill favorite list --json`      | Machine-readable favorite list                                     |
| `skill favorite refresh`          | Refresh descriptions and remove upstream refs that no longer exist |
| `skill favorite pick`             | Interactive favorite selection                                     |
| `skill favorite pick --add`       | Interactive favorite selection followed by install                 |

### Search And Inventory

| Command                 | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `skill find <query>`    | Search published skills on `skills.sh`                           |
| `skill list`            | List installed local and global skills                           |
| `skill update`          | Refresh shared source caches and reconcile current project links |
| `skill update --global` | Refresh shared source caches and reconcile global links only     |

## How Installation Works

- `skill` scans a cloned repository for `SKILL.md`, including common hidden roots such as `.agents/skills` and `.codex/skills`
- discovered skill IDs are normalized to `{owner}/{repo}/{folder}`
- `owner/repo/skill` is shorthand for `skill add owner/repo --skill skill`
- repeated installs reuse shallow clone caches keyed by the remote `HEAD` hash
- local install is blocked only when the selected `{owner}/{repo}/{skill}` is already installed globally
- project installs link selected skills from `~/.agents/.skills` and record them in `.agents/skills/manifest.json`
- project-scope `skill add` and `skill install <ref>` share the same install effects
- `skill update` updates `~/.agents/.skills/{owner}/{repo}` first; visible global and project roots are reconciled from that shared source cache

Install roots:

- local copy: `{cwd}/.agents/skills/{owner}/{repo}/`
- global visible links: `~/.agents/skills/{owner}/{repo}/`
- shared sources: `~/.agents/.skills/{owner}/{repo}/`
- project visible links: `{cwd}/.agents/skills/{owner}/{repo}/`
- Claude visible links: `~/.claude/skills/{owner}.{repo}.{skill}/` when `~/.claude/` already exists
- project Claude visible links: `{cwd}/.claude/skills/{owner}.{repo}.{skill}/` when `{cwd}/.claude/` already exists

Favorites:

- stored at `~/.agents/skill-favorites.json`
- support both `owner/repo` and `owner/repo/skill`
- include cached descriptions and last refresh timestamps

## Agent Integration

This repository ships with an installable agent-facing skill at [skills/skill/SKILL.md](skills/skill/SKILL.md).

That skill is intentionally narrower than this README. It teaches agents the main workflow:

1. inspect `skill --schema` first to learn the command surface
2. read project context
3. inspect favorites
4. pick a small set of relevant skills
5. install locally by default
6. fall back to `find` only when favorites are insufficient

If you want an agent to use this tool in new projects, install this skill into the agent's skill root first.

## Operational Notes

- non-interactive installs that match multiple skills must pass explicit `--skill <folder>` selectors
- `favorite pick` requires a TTY
- `favorite pick --global` is only valid together with `--add`
- `favorite add` validates upstream repo existence before writing the favorite
- `favorite refresh` depends on authenticated `gh` access
- only `github.com` repositories are supported right now
