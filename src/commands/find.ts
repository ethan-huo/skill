import { searchSkills } from "../lib/find-skills";
import type { FindInput } from "../types";

export async function runFind(args: { input: FindInput }) {
  const input = args.input;
  return searchSkills(input.query, { limit: input.limit });
}
