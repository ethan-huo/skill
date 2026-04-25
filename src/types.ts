export type InstallScope = "local" | "global";

export type RepoRef = {
  owner: string;
  repo: string;
  cloneUrl: string;
  display: string;
};

export type RepoSkillTarget = {
  repo: RepoRef;
  skill?: string;
};

export type SkillCandidate = {
  relativeDir: string;
  sourceDir: string;
  displayLabel: string;
};

export type AddInput = {
  repo: string;
  global: boolean;
  skill: string | string[];
};

export type InstallInput = {
  repo: string[];
  skill: string | string[];
};

export type FindInput = {
  query: string;
  limit?: number;
};

export type FavoriteAddInput = {
  ids: string[];
};

export type FavoriteRemoveInput = {
  ids: string[];
};

export type FavoriteListInput = {
  json: boolean;
};

export type FavoriteRefreshInput = {};

export type FavoritePickInput = {
  add: boolean;
  global: boolean;
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

export type SearchSkill = {
  id: string;
  name: string;
  source: string;
  installs: number;
};

export type FavoriteRef = {
  id: string;
  owner: string;
  repo: string;
  skill?: string;
  description: string;
  updatedAt?: string;
};

export type UpdateDiff = {
  updated: string[];
  removed: string[];
  added: string[];
};
