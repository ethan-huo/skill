import { dirname } from "node:path";

import { pruneEmptyParents, removeInstalledRepo } from "../lib/install";
import { getInstallRoot, getInstallScope, getSkillsBaseDir } from "../lib/paths";
import { parseRepoRef } from "../lib/repo-ref";
import type { RemoveInput } from "../types";

export async function runRemove(args: { input: RemoveInput }): Promise<void> {
  const input = args.input;
  const repo = parseRepoRef(input.repo);
  const scope = getInstallScope(input.global);
  const skillsBaseDir = getSkillsBaseDir(scope, process.cwd());
  const installRoot = getInstallRoot(scope, process.cwd(), repo);
  const removed = await removeInstalledRepo(installRoot);

  if (!removed) {
    throw new Error(`Nothing installed at ${installRoot}`);
  }

  await pruneEmptyParents(dirname(installRoot), skillsBaseDir);
  console.log(`Removed ${repo.display} from ${installRoot}`);
}
