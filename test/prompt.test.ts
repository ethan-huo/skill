import { describe, expect, test } from "bun:test";

import { resolveExclusiveSelection, shouldUsePlainMultiselect } from "../src/lib/prompt";

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

  test("disables regular options when the exclusive option is selected", () => {
    expect(
      resolveExclusiveSelection({
        exclusiveValue: "map",
        options: makeExclusiveOptions(),
        values: ["map"],
      }),
    ).toEqual({
      values: ["map"],
      options: [
        { label: "Map", value: "map", disabled: false },
        { label: "One", value: "one", disabled: true },
        { label: "Two", value: "two", disabled: true },
      ],
    });
  });

  test("disables the exclusive option when regular options are selected", () => {
    expect(
      resolveExclusiveSelection({
        exclusiveValue: "map",
        options: makeExclusiveOptions(),
        values: ["one", "two"],
      }),
    ).toEqual({
      values: ["one", "two"],
      options: [
        { label: "Map", value: "map", disabled: true },
        { label: "One", value: "one", disabled: false },
        { label: "Two", value: "two", disabled: false },
      ],
    });
  });

  test("resolves a mixed selection toward the option just selected", () => {
    expect(
      resolveExclusiveSelection({
        exclusiveValue: "map",
        options: makeExclusiveOptions(),
        values: ["one", "map"],
        preferExclusive: true,
      }).values,
    ).toEqual(["map"]);
    expect(
      resolveExclusiveSelection({
        exclusiveValue: "map",
        options: makeExclusiveOptions(),
        values: ["map", "one"],
      }).values,
    ).toEqual(["one"]);
  });
});

function makeOptions(count: number): Array<{ label: string; value: string }> {
  return Array.from({ length: count }, (_value, index) => ({
    label: `Option ${index + 1}`,
    value: `option-${index + 1}`,
  }));
}

function makeExclusiveOptions() {
  return [
    { label: "Map", value: "map" },
    { label: "One", value: "one" },
    { label: "Two", value: "two" },
  ];
}
