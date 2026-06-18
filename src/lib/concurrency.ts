/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 *
 * - Preserves input order in the returned array.
 * - Never short-circuits on error: each rejection is captured into a per-slot
 *   `error` so callers can decide policy. The wrapper itself never rejects.
 *
 * Kept dependency-free — `pMapLimit` is the only piece of plumbing the
 * `update` command needs and we don't want to take a `p-limit` dep just for
 * this. Tested via `test/concurrency.test.ts`.
 */
export type SettledResult<R> =
  | { status: "fulfilled"; value: R; index: number }
  | { status: "rejected"; reason: unknown; index: number };

export async function pMapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<SettledResult<R>[]> {
  if (limit < 1 || !Number.isFinite(limit)) {
    throw new RangeError(`pMapLimit: limit must be >= 1 (got ${limit})`);
  }

  const results = new Array<SettledResult<R>>(items.length);
  if (items.length === 0) {
    return results;
  }

  const workerCount = Math.min(limit, items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) {
        return;
      }

      try {
        const value = await fn(items[index]!, index);
        results[index] = { status: "fulfilled", value, index };
      } catch (reason) {
        results[index] = { status: "rejected", reason, index };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
