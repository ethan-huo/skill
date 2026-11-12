import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c, group } from "@celados/argc";
import * as v from "valibot";

const s = toStandardJsonSchema;

const globalFlag = v.optional(
  v.pipe(v.boolean(), v.description("Use the user's global skill root instead of the project")),
  false,
);

export const schema = {
  add: c
    .meta({
      description: "Install skills from a GitHub repository",
      examples: [
        `skill add "{ repo: 'pbakaus/impeccable/audit' }"`,
        `skill add "{ repo: 'ethan-huo/agents', skills: 'core/{cx,fp-thinking},codex/pacer' }"`,
      ],
    })
    .positional("repo")
    .input(
      s(
        v.object({
          repo: v.pipe(
            v.string(),
            v.description(
              "GitHub repository ref (owner/repo, owner/repo/skill) or canonical gh:<owner>/<repo>/<source-path> skill ID",
            ),
          ),
          global: globalFlag,
          skills: v.optional(
            v.pipe(
              v.string(),
              v.description(
                "Select skills with skill, variant/skill, or variant/{skill,...} expressions",
              ),
            ),
            "",
          ),
        }),
      ),
    ),

  find: c
    .meta({
      description: "Search published skills",
    })
    .positional("query")
    .input(
      s(
        v.object({
          query: v.string(),
          limit: v.optional(v.pipe(v.number(), v.minValue(1))),
        }),
      ),
    ),

  favorite: group(
    {
      description: "Manage favorite repository and skill refs",
    },
    {
      add: c
        .meta({
          description: "Save favorite repository or skill refs",
        })
        .input(
          s(
            v.object({
              ids: v.array(v.string()),
            }),
          ),
        ),

      remove: c
        .meta({
          description: "Remove favorite repository or skill refs",
        })
        .input(
          s(
            v.object({
              ids: v.array(v.string()),
            }),
          ),
        ),

      list: c
        .meta({
          description: "List saved favorite repository and skill refs",
        })
        .input(
          s(
            v.object({
              json: v.optional(
                v.pipe(v.boolean(), v.description("Print JSON instead of YAML")),
                false,
              ),
            }),
          ),
        ),

      refresh: c
        .meta({
          description: "Refresh favorite metadata and remove refs that no longer exist upstream",
        })
        .input(s(v.object({}))),

      install: c
        .meta({
          description: "Install favorites, or open an interactive selector when ids are omitted",
        })
        .input(
          s(
            v.object({
              ids: v.optional(v.array(v.string()), []),
              global: globalFlag,
            }),
          ),
        ),
    },
  ),

  install: c
    .meta({
      description: "Install GitHub skills, or restore links from the scope manifest",
      examples: [
        `skill install "{ repo: ['ethan-huo/agents'], skills: 'cx,fp-thinking' }"`,
        `skill install "{ repo: ['Owl-Listener/designer-skills'], map: true }"`,
      ],
    })
    .input(
      s(
        v.object({
          repo: v.optional(
            v.array(
              v.pipe(
                v.string(),
                v.description(
                  "GitHub repository ref or canonical gh: skill ID; at most one source is accepted",
                ),
              ),
            ),
            [],
          ),
          skills: v.optional(
            v.pipe(
              v.string(),
              v.description(
                "Select skills with skill, variant/skill, or variant/{skill,...} expressions",
              ),
            ),
            "",
          ),
          map: v.optional(
            v.pipe(
              v.boolean(),
              v.description("Install a repo map: one routing skill for the whole repo"),
            ),
            false,
          ),
          global: globalFlag,
        }),
      ),
    ),

  remove: c
    .meta({
      description:
        "Remove installed GitHub repositories and skills; global repo removal also purges cache and favorites",
    })
    .input(
      s(
        v.object({
          repo: v.optional(v.array(v.string()), []),
          global: globalFlag,
        }),
      ),
    ),

  list: c
    .meta({
      description: "List local and global installed skills with absolute SKILL.md file paths",
    })
    .input(s(v.object({ scope: v.optional(v.picklist(["global", "local"])) }))),

  update: c
    .meta({
      description: "Update shared source skill caches and reconcile visible links",
    })
    .input(
      s(
        v.object({
          concurrency: v.optional(v.pipe(v.number(), v.minValue(1)), 8),
          progress: v.optional(v.pipe(v.boolean(), v.description("Show progress on stderr")), true),
        }),
      ),
    ),
};
