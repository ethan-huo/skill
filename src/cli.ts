#!/usr/bin/env -S bun --no-env-file
import { cli } from "argc";

import { runAdd } from "./commands/add";
import { runFavoriteAdd } from "./commands/favorite/add";
import { runFavoriteList } from "./commands/favorite/list";
import { runFavoritePick } from "./commands/favorite/pick";
import { runFavoriteRemove } from "./commands/favorite/remove";
import { runFind } from "./commands/find";
import { runList } from "./commands/list";
import { runRemove } from "./commands/remove";
import { runUpdate } from "./commands/update";
import { schema } from "./schema";

const app = cli(schema, {
  name: "skill",
  version: "0.1.0",
  description: "Install and remove agent skills from GitHub repositories.",
});

const argv = normalizeArgv(process.argv.slice(2));

app.run(
  {
    handlers: {
      add: runAdd,
      favorite: {
        add: runFavoriteAdd,
        list: runFavoriteList,
        pick: runFavoritePick,
        remove: runFavoriteRemove,
      },
      find: runFind,
      list: runList,
      remove: runRemove,
      update: runUpdate,
    },
  },
  argv,
);

function normalizeArgv(argv: string[]): string[] {
  return argv.map((arg) => {
    if (arg === "-g") {
      return "--global";
    }

    return arg;
  });
}
