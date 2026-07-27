import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c, group } from "argc";
import * as v from "valibot";

const s = toStandardJsonSchema;

export const schema = {
  add: c
    .meta({
      description: "Clone a GitHub repository, select skills, and install them.",
      examples: [
        "skill add ethan-huo/agents",
        "skill add pbakaus/impeccable/audit",
        "skill add https://github.com/ethan-huo/agents --global",
        "skill add ethan-huo/agents --skills 'cx,fp-thinking'",
        "skill add backnotprop/plannotator --skills 'core/{plannotator-annotate,plannotator-review},claude/plannotator-last'",
      ],
    })
    .args("repo")
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
      description: "Search published skills and print the results as a TOON list.",
      examples: ["skill find seo", "skill find animation --limit 5"],
    })
    .args("query")
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
      description: "Manage favorite repository and skill refs.",
    },
    {
      add: c
        .meta({
          description: "Save a favorite repository or skill ref.",
          examples: [
            "skill favorite add ethan-huo/agents",
            "skill favorite add ethan-huo/agents/cx",
            "skill favorite add ethan-huo/agents ethan-huo/agents/cx",
          ],
        })
        .args("ids...")
        .input(
          s(
            v.object({
              ids: v.array(v.string()),
            }),
          ),
        ),

      remove: c
        .meta({
          description: "Remove a favorite repository or skill ref.",
          examples: [
            "skill favorite remove",
            "skill favorite remove ethan-huo/agents",
            "skill favorite remove ethan-huo/agents/cx",
            "skill favorite remove ethan-huo/agents ethan-huo/agents/cx",
          ],
        })
        .args("ids...")
        .input(
          s(
            v.object({
              ids: v.array(v.string()),
            }),
          ),
        ),

      list: c
        .meta({
          description: "List saved favorite repository and skill refs.",
          examples: ["skill favorite list", "skill favorite list --json"],
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
          description: "Refresh favorite metadata and remove refs that no longer exist upstream.",
          examples: ["skill favorite refresh"],
        })
        .input(s(v.object({}))),

      install: c
        .meta({
          description: "Install favorites. Without ids, opens an interactive selector (TTY only).",
          examples: [
            "skill favorite install",
            "skill favorite install ethan-huo/agents/cx",
            "skill favorite install ethan-huo/agents --global",
          ],
        })
        .args("ids...")
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
      description: "Install shared skills or restore links from the scope manifest.",
      examples: [
        "skill install",
        "skill install --global",
        "skill install ethan-huo/agents/cx",
        "skill install ethan-huo/agents/cx --global",
        "skill install ethan-huo/agents --skills 'cx,fp-thinking'",
        "skill install backnotprop/plannotator --skills 'core/{plannotator-annotate,plannotator-review},claude/plannotator-last'",
        "skill install Owl-Listener/designer-skills --map",
      ],
    })
    .args("repo...")
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
        "Remove an installed repository or a single installed skill. Global repo removal also purges shared source cache and favorites.",
      examples: [
        "skill remove --global",
        "skill remove ethan-huo/agents",
        "skill remove ethan-huo/agents/cx",
        "skill remove ethan-huo/agents --global",
      ],
    })
    .args("repo...")
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
      description: "List local and global installed skills.",
      examples: ["skill list"],
    })
    .input(s(v.object({}))),

  update: c
    .meta({
      description: "Update shared source skill caches and reconcile visible links.",
      examples: ["skill update", "skill update --concurrency 4", "skill update --no-progress"],
    })
    .input(
      s(
        v.object({
          concurrency: v.optional(v.pipe(v.number(), v.minValue(1)), 8),
          // `--no-progress` is parsed by argc as `progress=false`; keep the field
          // positive so the negation flag works without a custom alias.
          progress: v.optional(v.boolean(), true),
        }),
      ),
    ),
};
