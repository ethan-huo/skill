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
skill install gh:owner/repo/path/to/skill
skill install owner/repo --skills 'skill-a,skill-b'
skill install owner/repo --skills 'core/{skill-a,skill-b},codex/skill-c'
skill install owner/repo --map
skill list
```

Agents should prefer this path over broad search when the user's favorites already contain good candidates.
Project and global installs keep source-scoped items in the scope's `manifest.json` and expose
one-level links from the shared `~/.agents/.skills` cache.

### 2. Install from favorites

Install specific favorites by id, or open an interactive selector when no ids are given:

```bash
skill favorite install
skill favorite install ethan-huo/agents/cx
skill favorite install ethan-huo/agents --global
```

`favorite install` merges same-repo selections into one install flow. Repo-level favorites may trigger a second skill-selection prompt when the repo contains multiple skills.

### 3. Search and discovery

When favorites do not cover the task, use the public search index:

```bash
skill find seo
skill find animation --limit 5
```

Search is a discovery path, not the default install path.
Results are emitted as a YAML list so agents and pipelines receive the complete
records without terminal-width truncation.

### 4. Maintenance

```bash
skill update
skill install
skill install --global

skill remove --global
skill remove owner/repo
skill remove owner/repo/skill

skill favorite refresh
skill favorite remove
skill favorite remove owner/repo owner/repo/skill
```

## Command Reference

`skill @schema` is the agent contract. Agent calls use dotted command paths and one
quoted object literal:

```bash
skill favorite.list
skill install "{ repo: ['owner/repo'], skills: 'skill-a,skill-b' }"
```

The positional and flag forms below remain the shorter human-facing surface.

### Install And Remove

| Command                                              | Purpose                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `skill add owner/repo/skill`                         | Install one known skill directly                             |
| `skill add gh:owner/repo/path/to/skill`              | Install one exact GitHub skill ID from `skill list`          |
| `skill add owner/repo --skills 'a,b'`                | Install multiple skills from one repo without prompts        |
| `skill add owner/repo --skills 'core/{a,b},other/c'` | Select exact variants without expanding repeated selectors   |
| `skill add owner/repo`                               | Interactive selection when the repo contains multiple skills |
| `skill remove`                                       | Interactively remove local skills or repo maps               |
| `skill remove --global`                              | Interactively remove one or more global skills               |
| `skill remove owner/repo`                            | Remove all installed skills from one repo                    |
| `skill remove owner/repo/skill`                      | Remove one installed skill without touching siblings         |
| `skill remove gh:owner/repo/path/to/skill`           | Remove one GitHub skill by its canonical ID                  |
| `skill remove owner/repo --global`                   | Purge global links, shared source cache, and repo favorites  |

### Project Links

| Command                                   | Purpose                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `skill install`                           | Rebuild project links and maps from `.agents/skills/manifest.json` |
| `skill install --global`                  | Rebuild global links from `~/.agents/skills/manifest.json`         |
| `skill install owner/repo/skill`          | Install a shared source and link one skill into this project       |
| `skill install gh:owner/repo/path/skill`  | Round-trip an exact GitHub ID emitted by `skill list`              |
| `skill install owner/repo/skill --global` | Install a shared source and link one skill globally                |
| `skill install owner/repo --skills 'a,b'` | Link multiple selected skills into this project                    |
| `skill install owner/repo --map`          | Generate one repo-level map skill with ctx-read routing rows       |

### Favorites

| Command                           | Purpose                                                            |
| --------------------------------- | ------------------------------------------------------------------ |
| `skill favorite add <refs...>`    | Save one or more favorite refs                                     |
| `skill favorite remove`           | Remove favorites with an interactive selector in TTY               |
| `skill favorite remove <refs...>` | Remove one or more favorite refs non-interactively                 |
| `skill favorite list`             | Show favorite refs with cached descriptions                        |
| `skill favorite list --json`      | Machine-readable favorite list                                     |
| `skill favorite refresh`          | Refresh descriptions and remove upstream refs that no longer exist |
| `skill favorite install`          | Install favorites (interactive selector in TTY, or pass ids)       |
| `skill favorite install <ids...>` | Install specific favorites by id non-interactively                 |

### Search And Inventory

| Command              | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `skill find <query>` | Search published skills on `skills.sh`                                 |
| `skill list`         | List installed skills and estimate frontmatter name/description tokens |

| `skill update` | Refresh shared source caches and reconcile global plus project links |
| `skill update --concurrency <n>` | Run repo updates in parallel (default `8`, `1` matches old behavior) |
| `skill update --no-progress` | Disable the live progress grid (auto-disabled on non-TTY/CI) |
Human-facing output is ANSI-highlighted when stdout is an interactive terminal. YAML keys, list markers, and scalar types receive lightweight colors; Markdown and schema output keep argc's existing formatting. Piped output, `NO_COLOR=1`, `TERM=dumb`, and `--no-color` remain byte-plain for agents and scripts.

## How Installation Works

- `skill` scans a cloned GitHub repository for `SKILL.md`, including nested catalogs, while ignoring agent config roots such as `.agents`; a root-level skill has the stable folder ID `root`
- public skill IDs preserve their origin as `gh:{owner}/{repo}/{source-path}`
- same-name bundles with identical files are safely collapsed; bundles with different content remain distinct variants
- interactive installs select logical skills first, then use one repo-level variant radio when the selected conflicts share the same variants; mismatched variant sets are resolved per skill
- non-interactive installs use `--skills 'skill,variant/skill,variant/{skill,...}'`; unqualified ambiguous skills fail with the available qualified selectors
- copied `SKILL.md` files with repairable malformed YAML frontmatter are repaired before entering the shared source cache
- `owner/repo/skill` is shorthand for `skill add owner/repo --skills 'skill'`
- visible skill folders and cached `SKILL.md` names use the Agent Skills-compatible `{skill-path}-{owner}` form; the manifest retains the repo and exact source path, and conflicting sources cannot claim the same visible folder
- `skill install owner/repo --map` writes `.agents/skills/map-{repo}-{owner}/SKILL.md` with a `ctx read github://owner/repo/<path>` rule and `When ..., read path/SKILL.md` rows
- interactive project installs show "Install as repo map" above individual skills; selecting either mode disables the other
- interactive repo skill selection preselects already installed skills from the target scope; `--global` preselects global installs, while project installs preselect project links
- repo maps and selected skill installs are mutually exclusive per repo; installing one mode removes the other mode from the manifest and visible aliases
- project-scope `skill update` regenerates map items recorded in `.agents/skills/manifest.json`
- versionless and version 2 manifests migrate to version 3; new installs persist each logical skill ID with its exact upstream source path
- repeated installs reuse shallow clone caches keyed by the remote `HEAD` hash
- local and global installs skip selected skills whose normalized visible folder is already claimed in the other scope, install the remaining selection, and report each skip with a canonical skill ID plus a stable reason
- installs link selected skills from `~/.agents/.skills` and record repo-scoped manifest items in the target scope's manifest
- project-scope `skill add` and `skill install <ref>` share the same install effects; `--global` targets the global manifest and visible root
- `skill update` updates the union of repos recorded in the global manifest and current project's manifest, then reconciles both visible roots
- `skill update` runs all source repos in parallel (default 8 in flight), renders a live progress grid on stderr, and returns stable-order YAML records for repo diffs, regenerated maps, and failures on stdout
- `skill update` migrates source-scoped and legacy visible aliases to manifest-backed skill IDs
- project-scope `skill update` removes visible links for upstream skills that disappeared, including stale symlinks whose source target is already gone
- interactive `skill remove` includes repo maps recorded in the target scope manifest alongside visible skill links
- `skill remove` removes matching visible aliases and manifest entries from the target scope; empty repo skill items are pruned
- `skill remove owner/repo --global` removes that shared source cache and all matching favorite refs, so future `skill update` runs stop tracking the repo

Install roots:

- local visible links: `{cwd}/.agents/skills/{skill-path}-{owner}/`
- global visible links: `~/.agents/skills/{skill-path}-{owner}/`
- local map skills: `{cwd}/.agents/skills/map-{repo}-{owner}/`
- shared sources: `~/.agents/.skills/{owner}/{repo}/`
- local manifest: `{cwd}/.agents/skills/manifest.json` stores versioned `skills` with exact source paths and `map` items, not visible link names
- local manifest writes maintain an exact-name block in `{cwd}/.agents/skills/.gitignore`; entries outside that block, including user-created skills, are preserved
- generated ignore rules prevent new links from entering Git but do not untrack links already present in the index; existing projects must remove those generated entries from the index once
- global manifest: `~/.agents/skills/manifest.json` stores versioned `skills` with exact source paths, not visible link names

To normalize an existing global install to the current `{skill-path}-{owner}` layout:

```bash
bun run migrate:global-skills
```

To migrate a project-local skill root:

```bash
bun run migrate:skills /path/to/project
bun run migrate:skills /path/to/project/.agents/skills
```

Favorites:

- stored at `~/.agents/skill-favorites.json`
- support both `owner/repo` and `owner/repo/skill`
- include cached descriptions and last refresh timestamps

## Agent Integration

This repository ships with an agent-facing skill. [src/SKILL.md](src/SKILL.md)
is the source of truth, served by `skill @skill`.
[skills/skill/SKILL.md](skills/skill/SKILL.md) routes matching intent directly
to that command; its body is only a harness fallback.

That skill is intentionally narrower than this README. It teaches agents the main workflow:

1. inspect `skill @schema` first to learn the command surface
2. read project context
3. inspect favorites
4. pick a small set of relevant skills
5. install locally by default
6. fall back to `find` only when favorites are insufficient

If you want an agent to use this tool in new projects, install this skill into the agent's skill root first.

## Operational Notes

- non-interactive installs that match multiple skills must pass a `--skills '<selector,...>'` expression
- `favorite install` without ids requires a TTY; in non-TTY environments pass ids explicitly
- `favorite remove` without ids requires a TTY; in non-TTY environments pass ids explicitly
- `favorite install --global` installs into the global skill root
- `favorite add` validates upstream repo existence before writing the favorite
- `favorite refresh` depends on authenticated `gh` access
- only `github.com` repositories are supported right now
