import { describe, expect, test } from "bun:test";

import { pMapLimit } from "../src/lib/concurrency";

describe("pMapLimit", () => {
  test("preserves input order in the result array", async () => {
    const items = [10, 30, 20, 5];
    const settled = await pMapLimit(items, 2, async (value) => {
      await Bun.sleep(value);
      return value * 2;
    });

    expect(settled.map((slot) => (slot.status === "fulfilled" ? slot.value : null))).toEqual([
      20, 60, 40, 10,
    ]);
  });

  test("never runs more than `limit` workers concurrently", async () => {
    let inflight = 0;
    let peak = 0;

    await pMapLimit(
      Array.from({ length: 12 }, (_, index) => index),
      3,
      async () => {
        inflight++;
        peak = Math.max(peak, inflight);
        await Bun.sleep(5);
        inflight--;
      },
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  test("captures rejections per slot without aborting siblings", async () => {
    const settled = await pMapLimit([1, 2, 3], 2, async (value) => {
      if (value === 2) {
        throw new Error(`boom-${value}`);
      }
      return value;
    });

    expect(settled[0]).toMatchObject({ status: "fulfilled", value: 1 });
    expect(settled[1]).toMatchObject({ status: "rejected" });
    expect(settled[2]).toMatchObject({ status: "fulfilled", value: 3 });

    if (settled[1]?.status === "rejected") {
      expect((settled[1].reason as Error).message).toBe("boom-2");
    }
  });

  test("rejects on invalid limit", async () => {
    await expect(pMapLimit([1], 0, async (value) => value)).rejects.toThrow(/limit must be >= 1/);
  });

  test("returns immediately on empty input", async () => {
    const settled = await pMapLimit<number, number>([], 4, async () => {
      throw new Error("should not be called");
    });
    expect(settled).toEqual([]);
  });
});
