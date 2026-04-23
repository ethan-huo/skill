import { dirname, join } from "node:path";

import { pruneEmptyParents, removeInstalledRepo, removeInstalledSkill } from "../lib/install";
import { getInstallRoot, getInstallScope, getSkillsBaseDir } from "../lib/paths";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import type { RemoveInput } from "../types";

export async function runRemove(args: { input: RemoveInput }): Promise<void> {
  const input = args.input;
  const target = parseRepoSkillTarget(input.repo);
  const repo = target.repo;
  const scope = getInstallScope(input.global);
  const skillsBaseDir = getSkillsBaseDir(scope, process.cwd());
  const installRoot = getInstallRoot(scope, process.cwd(), repo);
  const targetPath = target.skill ? join(installRoot, target.skill) : installRoot;
  const removed = target.skill
    ? await removeInstalledSkill(installRoot, target.skill)
    : await removeInstalledRepo(installRoot);

  if (!removed) {
    throw new Error(`Nothing installed at ${targetPath}`);
  }

  await pruneEmptyParents(dirname(targetPath), skillsBaseDir);
  if (target.skill) {
    console.log(`Removed ${repo.display}/${target.skill} from ${targetPath}`);
    return;
  }

  console.log(`Removed ${repo.display} from ${installRoot}`);
}
