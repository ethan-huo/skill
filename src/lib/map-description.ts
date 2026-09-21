import { fetchRepoDescription, normalizeDescription } from "./github";
import type { RepoRef } from "../types";

export class MapDescriptionRequiredError extends Error {
  constructor(repo: RepoRef, cause: string) {
    super(
      [
        `Repo map for ${repo.display} has no description (${cause}).`,
        "A skill without a description never triggers, so the map was not installed.",
        "Re-run with an explicit description:",
        `  skill install "{ repo: ['${repo.display}'], map: true, description: '<when to use these skills>' }"`,
      ].join("\n"),
    );
  }
}

type MapDescriptionDependencies = {
  fetchDescription?: (repo: RepoRef) => Promise<string>;
};

export async function resolveMapDescription(
  options: {
    repo: RepoRef;
    explicit?: string;
    stored?: string;
  },
  dependencies: MapDescriptionDependencies = {},
): Promise<string> {
  const explicit = normalizeDescription(options.explicit ?? "");
  if (explicit) {
    return explicit;
  }

  // Descriptions are pinned at install time: an agent-written one must survive
  // upstream edits, so the manifest wins over whatever GitHub reports now.
  const stored = normalizeDescription(options.stored ?? "");
  if (stored) {
    return stored;
  }

  let failure = "";
  const fetchDescription = dependencies.fetchDescription ?? fetchRepoDescription;
  const fetched = await fetchDescription(options.repo).catch((error: unknown) => {
    failure = error instanceof Error ? error.message : String(error);
    return "";
  });
  if (fetched) {
    return fetched;
  }

  throw new MapDescriptionRequiredError(
    options.repo,
    failure
      ? `could not read GitHub repo description: ${failure}`
      : "GitHub repo description is empty",
  );
}
