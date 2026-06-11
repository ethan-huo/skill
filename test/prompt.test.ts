import { describe, expect, test } from "bun:test";

import { shouldUsePlainMultiselect } from "../src/lib/prompt";

describe("prompt selection", () => {
  test("uses plain multiselect when the option count is known and at most ten", () => {
    expect(shouldUsePlainMultiselect(makeOptions(10))).toBe(true);
  });

  test("keeps searchable multiselect for larger known option sets", () => {
    expect(shouldUsePlainMultiselect(makeOptions(11))).toBe(false);
  });

  test("keeps searchable multiselect when options are resolved dynamically", () => {
    expect(shouldUsePlainMultiselect(() => makeOptions(2))).toBe(false);
  });
});

function makeOptions(count: number): Array<{ label: string; value: string }> {
  return Array.from({ length: count }, (_value, index) => ({
    label: `Option ${index + 1}`,
    value: `option-${index + 1}`,
  }));
}
