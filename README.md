# skill

Install or remove agent skills from GitHub repositories.

## Commands

```bash
skill add ethan-huo/agents
skill add pbakaus/impeccable/audit
skill add https://github.com/ethan-huo/agents --global
skill add ethan-huo/agents --skill cx --skill fp-thinking

skill find seo
skill find animation --limit 5

skill favorite add ethan-huo/agents
skill favorite add ethan-huo/agents/cx
skill favorite add ethan-huo/agents ethan-huo/agents/cx
skill favorite remove ethan-huo/agents
skill favorite remove ethan-huo/agents/cx
skill favorite remove ethan-huo/agents ethan-huo/agents/cx
skill favorite list
skill favorite list --json
skill favorite refresh
skill favorite pick
skill favorite pick --add

skill list
skill update
skill update --global

skill remove ethan-huo/agents
skill remove ethan-huo/agents/cx
skill remove ethan-huo/agents --global
```

## Behavior

- `add` shallow-clones the target repository into a temporary directory
- `add owner/repo/skill` is supported as shorthand for `add owner/repo --skill skill`
- `remove owner/repo/skill` removes one installed skill by ID; `remove owner/repo` still removes the whole installed repo
- `find` queries the public `skills.sh` search API and prints the results in a compact table
- `favorite add/remove/list` manages a global list of canonical `owner/repo` and `owner/repo/skill` refs
- `favorite add` validates that the upstream repository exists before saving the ref
- `favorite refresh` refreshes cached metadata and removes favorites that no longer exist upstream
- `favorite pick` opens an interactive multiselect prompt; by default it prints the selected IDs, one per line
- `favorite pick --add` installs the selected favorites; repo-level picks may trigger a second skill-selection prompt, and same-repo picks are merged into one install flow
- it scans the clone for `SKILL.md`, including hidden skill roots such as `.agents/skills` and `.codex/skills`
- shallow clones are cached under the system temp directory by remote `HEAD` hash, so repeated installs/updates can reuse the same checkout
- discovered skills are keyed by the folder that contains each `SKILL.md`, so installed IDs are always `{owner}/{repo}/{folder}`
- when multiple skills are found, it prompts the user to select which ones to install
- local install is blocked when the same `{owner}/{repo}` is already installed globally
- `list` scans both local and global installed skills and prints a compact table
- `update` refreshes one scope at a time:
  - `~` updates skills that still exist upstream
  - `-` removes skills that were installed before but no longer exist upstream
  - `+` reports newly available upstream skills without auto-installing them
- installed skills are written under:
  - local: `{cwd}/.agents/skills/{owner}/{repo}/`
  - global: `~/.agents/skills/{owner}/{repo}/`
- installs copy each selected skill into `{owner}/{repo}/{folder}` instead of preserving the upstream path
- re-installing the same repository replaces the whole `{owner}/{repo}` install root in place
- favorites are stored globally at `~/.agents/skill-favorites.json` with cached descriptions
- known foreign agent roots such as `.claude/` and `.cursor/` are ignored during discovery

## Notes

- non-interactive installs that match multiple skills must pass one or more `--skill <folder>` selectors
- when `owner/repo/skill` shorthand is used, `--skill` must be omitted or match the same folder
- `favorite pick` requires a TTY; use `favorite list --json` for non-interactive tooling
- `favorite pick --global` is only valid together with `--add`
- only `github.com` repositories are supported right now
