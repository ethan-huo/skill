import { describe, expect, test } from "bun:test";

import {
  formatGitHubSkillId,
  formatManifestSkillId,
  parseCanonicalGitHubSkillRef,
} from "../src/lib/skill-ref";
import { parseRepoRef } from "../src/lib/repo-ref";

describe("canonical skill refs", () => {
  test("preserves the repository-relative GitHub source path", () => {
    const repo = parseRepoRef("celados/agents");
    const id = formatGitHubSkillId(repo, "skills/fullstack");

    expect(id).toBe("gh:celados/agents/skills/fullstack");
    expect(parseCanonicalGitHubSkillRef(id)).toMatchObject({
      kind: "github",
      repo: { owner: "celados", repo: "agents" },
      sourcePath: "skills/fullstack",
    });
  });

  test("formats manifest skills as canonical GitHub source refs", () => {
    expect(
      formatManifestSkillId("celados/agents", {
        id: "fullstack",
        source: "skills/fullstack",
      }),
    ).toBe("gh:celados/agents/skills/fullstack");
  });
});
