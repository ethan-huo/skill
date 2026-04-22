import { homedir } from "node:os";
import { join } from "node:path";

import type { InstallScope, RepoRef } from "../types";

export function getInstallScope(global: boolean): InstallScope {
  return global ? "global" : "local";
}

export function getSkillsBaseDir(scope: InstallScope, cwd: string): string {
  if (scope === "global") {
    return join(homedir(), ".agents", "skills");
  }

  return join(cwd, ".agents", "skills");
}

export function getInstallRoot(scope: InstallScope, cwd: string, repo: RepoRef): string {
  return join(getSkillsBaseDir(scope, cwd), repo.owner, repo.repo);
}
