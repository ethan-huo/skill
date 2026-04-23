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
        "skill add ethan-huo/agents --skill cx --skill fp-thinking",
      ],
    })
    .args("repo")
    .input(
      s(
        v.object({
          repo: v.string(),
          global: v.optional(v.boolean(), false),
          skill: v.optional(v.union([v.string(), v.array(v.string())]), []),
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
          limit: v.optional(
            v.pipe(
              v.string(),
              v.transform((value) => Number(value)),
              v.number(),
              v.minValue(1),
            ),
          ),
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
          ],
        })
        .args("id")
        .input(
          s(
            v.object({
              id: v.string(),
            }),
          ),
        ),

      remove: c
        .meta({
          description: "Remove a favorite repository or skill ref.",
          examples: [
            "skill favorite remove ethan-huo/agents",
            "skill favorite remove ethan-huo/agents/cx",
          ],
        })
        .args("id")
        .input(
          s(
            v.object({
              id: v.string(),
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

      pick: c
        .meta({
          description: "Interactively pick favorite skills and optionally install them.",
          examples: [
            "skill favorite pick",
            "skill favorite pick --add",
            "skill favorite pick --add --global",
          ],
        })
        .input(
          s(
            v.object({
              add: v.optional(v.boolean(), false),
              global: v.optional(v.boolean(), false),
            }),
          ),
        ),
    },
  ),

  remove: c
    .meta({
      description: "Remove an installed repository or a single installed skill.",
      examples: [
        "skill remove ethan-huo/agents",
        "skill remove ethan-huo/agents/cx",
        "skill remove ethan-huo/agents --global",
      ],
    })
    .args("repo")
    .input(
      s(
        v.object({
          repo: v.string(),
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
      description: "Update installed skills for the selected scope.",
      examples: ["skill update", "skill update --global", "skill update -g"],
    })
    .input(
      s(
        v.object({
          global: v.optional(v.boolean(), false),
        }),
      ),
    ),
};
