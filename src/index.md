# skill

Installs agent skills from GitHub into the current project (`.agents/skills`) or the user's global root. The job is to get the right few skills into this project with the least machinery, not to exercise every command.

Read the section for your task, then only that slice: `skill @schema .add`, or several at once with `skill @schema '.{add,list}'`. Success is YAML on stdout; progress and prompts go to stderr.

## Choosing what to install — .{favorite,list,find}

- Read the project first: stack, runtime, framework, and what `.agents/skills` already holds. `list` returns each installed skill's `file` path; read it before installing a duplicate.
- Start from the user's favorites (`favorite.list`), not search. Pick a small relevant set.
- `find` only when favorites don't cover the task, the user asks to browse, or you need a candidate to propose for favoriting.

## Installing — .{add,install}

- Local by default. `global` only when the user wants a cross-project install; if a local install collides with a global one of the same repo, ask which stays the source of truth.
- Be non-interactive: pass `skills`. `add` with only `repo` may prompt, and `favorite.install` without `ids` opens a selector.
- Ref strength: `gh:owner/repo/path/to/skill` is exact; `owner/repo/skill` is shorthand when the logical folder ID is unambiguous; `owner/repo` is broad and may need a second selection. When a repo-level and a skill-level favorite for one repo are both picked, the repo is the install scope and the skills are the default selection within it.
- If the repo exposes several logical skills or variants, rerun with `skills: 'skill,variant/{skill,...}'`, or use a map.
- Verify with `skill list` when the user asked for concrete setup.

## Repo maps — .install

A map is one project-local synthetic skill for a broad catalog; it routes to upstream files with `ctx read github://owner/repo/<path>`. Use `install` with `map: true` when the user wants coverage from a multi-skill repo and no single target; don't install a pile of separate skills instead. `map` and `skills` are mutually exclusive, and a non-interactive install must choose one. The map's description is derived from the repo, so you never write it. Project-scope `update` regenerates recorded maps.

## Maintenance — .{update,remove,favorite}

Only when the user asks; don't churn installed skills or favorites unprompted.

- `favorite.refresh` and `favorite.add` need `gh` authenticated. If they fail on it, tell the user to run `gh auth login` and retry.
- `remove` takes canonical `gh:` IDs.
