export type InstallScope = "local" | "global";

export type RepoRef = {
  owner: string;
  repo: string;
  cloneUrl: string;
  display: string;
};

export type SkillCandidate = {
  relativeDir: string;
  displayLabel: string;
};

export type AddInput = {
  repo: string;
  global: boolean;
  skill: string | string[];
};

export type RemoveInput = {
  repo: string;
  global: boolean;
};

export type UpdateInput = {
  global: boolean;
};

export type SkillScopeLabel = InstallScope;

export type InstalledSkill = {
  id: string;
  owner: string;
  repo: string;
  relativeDir: string;
  description: string;
  scope: SkillScopeLabel;
  installRoot: string;
};

export type InstalledRepo = {
  owner: string;
  repo: string;
  scope: SkillScopeLabel;
  installRoot: string;
};

export type UpdateDiff = {
  updated: string[];
  removed: string[];
  added: string[];
};
