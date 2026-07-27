import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c, group } from "argc";
import * as v from "valibot";

const s = toStandardJsonSchema;

export const schema = {
  add: c
    .meta({
      description: "Clone a GitHub repository, select skills, and install them",
      examples: [
        `skill add "{ repo: 'ethan-huo/agents' }"`,
        `skill add "{ repo: 'pbakaus/impeccable/audit' }"`,
        `skill add "{ repo: 'ethan-huo/agents', global: true }"`,
      ],
    })
    .positional("repo")
    .input(
      s(
        v.object({
          repo: v.string(),
          global: v.optional(v.boolean(), false),
          skills: v.optional(
            v.pipe(
              v.string(),
              v.description(
                "Select skills with skill, variant/skill, or variant/{skill,...} expressions.",
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
      examples: [`skill find "{ query: 'animation', limit: 5 }"`],
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
          examples: [`skill favorite.add "{ ids: ['ethan-huo/agents', 'ethan-huo/agents/cx'] }"`],
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
              json: v.optional(v.boolean(), false),
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
          examples: [`skill favorite.install "{ ids: ['ethan-huo/agents/cx'], global: true }"`],
        })
        .input(
          s(
            v.object({
              ids: v.optional(v.array(v.string()), []),
              global: v.optional(v.boolean(), false),
            }),
          ),
        ),
    },
  ),

  install: c
    .meta({
      description: "Install shared skills or restore links from the scope manifest",
      examples: [
        `skill install "{ repo: ['ethan-huo/agents/cx'], global: true }"`,
        `skill install "{ repo: ['ethan-huo/agents'], skills: 'cx,fp-thinking' }"`,
        `skill install "{ repo: ['Owl-Listener/designer-skills'], map: true }"`,
      ],
    })
    .input(
      s(
        v.object({
          repo: v.optional(v.array(v.string()), []),
          skills: v.optional(
            v.pipe(
              v.string(),
              v.description(
                "Select skills with skill, variant/skill, or variant/{skill,...} expressions.",
              ),
            ),
            "",
          ),
          map: v.optional(v.boolean(), false),
          global: v.optional(v.boolean(), false),
        }),
      ),
    ),

  remove: c
    .meta({
      description:
        "Remove installed repositories or skills; global repo removal also purges shared source cache and favorites",
      examples: [`skill remove "{ repo: ['ethan-huo/agents/cx'], global: true }"`],
    })
    .input(
      s(
        v.object({
          repo: v.optional(v.array(v.string()), []),
          global: v.optional(v.boolean(), false),
        }),
      ),
    ),

  list: c
    .meta({
      description: "List local and global installed skills",
    })
    .input(s(v.object({}))),

  update: c
    .meta({
      description: "Update shared source skill caches and reconcile visible links",
      examples: [`skill update "{ concurrency: 4, progress: false }"`],
    })
    .input(
      s(
        v.object({
          concurrency: v.optional(v.pipe(v.number(), v.minValue(1)), 8),
          progress: v.optional(v.boolean(), true),
        }),
      ),
    ),
};
