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

skill list
skill update
skill update --global

skill remove ethan-huo/agents
skill remove ethan-huo/agents --global
```

## Behavior

- `add` shallow-clones the target repository into a temporary directory
- `add owner/repo/skill` is supported as shorthand for `add owner/repo --skill skill`
- `find` queries the public `skills.sh` search API and prints the results in a compact table
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
- known foreign agent roots such as `.claude/` and `.cursor/` are ignored during discovery

## Notes

- non-interactive installs that match multiple skills must pass one or more `--skill <folder>` selectors
- when `owner/repo/skill` shorthand is used, `--skill` must be omitted or match the same folder
- only `github.com` repositories are supported right now
