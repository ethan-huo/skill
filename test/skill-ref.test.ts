import { describe, expect, test } from "bun:test";

import {
  formatFilesystemSkillId,
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

  test("uses the absolute filesystem skill path instead of its internal cache key", () => {
    expect(
      formatManifestSkillId("fs/agents-4bf1235d61", {
        id: "fullstack",
        source: "/Users/dio/workspace/projects/agents/skills/fullstack",
      }),
    ).toBe("fs:/Users/dio/workspace/projects/agents/skills/fullstack");
    expect(formatFilesystemSkillId("/tmp/skills/../skills/cx")).toBe("fs:/tmp/skills/cx");
  });
});
