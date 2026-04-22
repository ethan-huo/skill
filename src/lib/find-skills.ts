import type { SearchSkill } from "../types";

const DEFAULT_SEARCH_API_BASE = "https://skills.sh";
const DEFAULT_SEARCH_LIMIT = 10;

type SearchFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SearchSkillsOptions = {
  limit?: number;
  apiBaseUrl?: string;
  fetchImpl?: SearchFetch;
};

type SearchApiSkill = {
  id?: unknown;
  name?: unknown;
  source?: unknown;
  installs?: unknown;
};

type SearchApiResponse = {
  skills?: unknown;
};

export async function searchSkills(
  query: string,
  options: SearchSkillsOptions = {},
): Promise<SearchSkill[]> {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.SKILLS_API_URL ?? DEFAULT_SEARCH_API_BASE;
  const fetchImpl = options.fetchImpl ?? (fetch as SearchFetch);
  const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
  const url = new URL("/api/search", apiBaseUrl);

  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SearchApiResponse;
  const rawSkills = Array.isArray(data.skills) ? data.skills : [];

  return rawSkills
    .map(normalizeSearchSkill)
    .filter((skill): skill is SearchSkill => skill !== null)
    .sort((left, right) => right.installs - left.installs || left.id.localeCompare(right.id));
}

function normalizeSearchSkill(input: unknown): SearchSkill | null {
  if (!isRecord(input)) {
    return null;
  }

  const skill = input as SearchApiSkill;
  if (typeof skill.id !== "string" || typeof skill.name !== "string") {
    return null;
  }

  return {
    id: skill.id,
    name: skill.name,
    source: typeof skill.source === "string" ? skill.source : "",
    installs: normalizeInstalls(skill.installs),
  };
}

function normalizeInstalls(input: unknown): number {
  return typeof input === "number" && Number.isFinite(input) ? input : 0;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
