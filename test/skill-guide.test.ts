import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { schema } from "../src/schema";

const srcDir = join(import.meta.dir, "..", "src");

describe("agent guide (src/index.md)", () => {
  test("every section names an @schema selector built from real commands", async () => {
    const guide = await readFile(join(srcDir, "index.md"), "utf8");
    const roots = new Set(Object.keys(schema));
    const selectors = [...guide.matchAll(/^## .+ — \.(.+)$/gm)].map((m) => m[1]!);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      for (const name of selector.replace(/^\{|\}$/g, "").split(",")) {
        expect(roots.has(name)).toBe(true);
      }
    }
  });
});
