# skill

Install or remove agent skills from GitHub repositories.

## Commands

```bash
skill add ethan-huo/agents
skill add https://github.com/ethan-huo/agents --global
skill add ethan-huo/agents --skill skills/cx --skill skills/fp-thinking

skill list
skill update
skill update --global

skill remove ethan-huo/agents
skill remove ethan-huo/agents --global
```

## Behavior

- `add` shallow-clones the target repository into a temporary directory
- it scans the clone for `SKILL.md`, including hidden skill roots such as `.agents/skills` and `.codex/skills`
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
- installs preserve each selected skill folder's relative path inside the source repo to avoid collisions
- re-installing the same repository replaces the whole `{owner}/{repo}` install root in place

## Notes

- non-interactive installs that match multiple skills must pass one or more `--skill <relative/path>` selectors
- only `github.com` repositories are supported right now
