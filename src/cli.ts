#!/usr/bin/env -S bun --no-env-file
import { cli } from "argc";
import packageJson from "../package.json" with { type: "json" };

import { runAdd } from "./commands/add";
import { runFavoriteAdd } from "./commands/favorite/add";
import { runFavoriteList } from "./commands/favorite/list";
import { runFavoritePick } from "./commands/favorite/pick";
import { runFavoriteRefresh } from "./commands/favorite/refresh";
import { runFavoriteRemove } from "./commands/favorite/remove";
import { runFind } from "./commands/find";
import { runInstall } from "./commands/install";
import { runList } from "./commands/list";
import { runRemove } from "./commands/remove";
import { runUpdate } from "./commands/update";
import { schema } from "./schema";

const app = cli(schema, {
  name: "skill",
  version: packageJson.version,
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
        refresh: runFavoriteRefresh,
        remove: runFavoriteRemove,
      },
      find: runFind,
      install: runInstall,
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
