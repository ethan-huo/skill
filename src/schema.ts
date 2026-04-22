import { toStandardJsonSchema } from "@valibot/to-json-schema";
import { c } from "argc";
import * as v from "valibot";

const s = toStandardJsonSchema;

export const schema = {
  add: c
    .meta({
      description: "Clone a GitHub repository, select skills, and install them.",
      examples: [
        "skill add ethan-huo/agents",
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

  remove: c
    .meta({
      description: "Remove all skills previously installed from a repository.",
      examples: ["skill remove ethan-huo/agents", "skill remove ethan-huo/agents --global"],
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
