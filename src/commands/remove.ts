import { dirname, join } from "node:path";

import * as p from "@clack/prompts";
import { fmt } from "argc/terminal";

import { pruneEmptyParents, removeInstalledRepo, removeInstalledSkill } from "../lib/install";
import { listInstalledSkills } from "../lib/installed-skills";
import { getInstallRoot, getInstallScope, getSkillsBaseDir } from "../lib/paths";
import { parseRepoSkillTarget } from "../lib/repo-ref";
import type { RemoveInput } from "../types";

export async function runRemove(args: { input: RemoveInput }): Promise<void> {
  const input = args.input;
  const refs = input.repo.length > 0 ? input.repo : await selectInstalledSkillRefs(input.global);
  for (const ref of refs) {
    await removeRef(ref, input.global);
  }
}

async function removeRef(ref: string, global: boolean): Promise<void> {
  const target = parseRepoSkillTarget(ref);
  const repo = target.repo;
  const scope = getInstallScope(global);
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

async function selectInstalledSkillRefs(global: boolean): Promise<string[]> {
  const scope = getInstallScope(global);
  const installedSkills = (await listInstalledSkills(process.cwd())).filter(
    (skill) => skill.scope === scope,
  );

  if (installedSkills.length === 0) {
    console.log(fmt.info(`No ${scope} skills are installed.`));
    return [];
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive remove requires a TTY or explicit refs.");
  }

  const response = await p.multiselect({
    message: `Select ${scope} skills to remove`,
    options: installedSkills.map((skill) => ({
      label: skill.description ? `${skill.id} (${skill.description})` : skill.id,
      value: skill.id,
    })),
    required: true,
  });

  if (p.isCancel(response)) {
    throw new Error("Selection cancelled.");
  }

  return [...response];
}
