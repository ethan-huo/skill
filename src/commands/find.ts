import { fmt, printTable, type TableColumn, type TableRow } from "argc/terminal";

import { searchSkills } from "../lib/find-skills";
import { truncateText } from "../lib/truncate";
import type { FindInput } from "../types";

const NAME_WIDTH = 28;
const SOURCE_WIDTH = 36;

export async function runFind(args: { input: FindInput }): Promise<void> {
  const input = args.input;
  const skills = await searchSkills(input.query, { limit: input.limit });
  if (skills.length === 0) {
    console.log(fmt.info(`No published skills found for "${input.query}".`));
    return;
  }

  const columns: TableColumn[] = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name", width: NAME_WIDTH },
    { key: "source", label: "Source", width: SOURCE_WIDTH },
    { key: "installs", label: "Installs" },
  ];

  const rows: TableRow[] = skills.map((skill) => ({
    id: skill.id,
    name: truncateText(skill.name, NAME_WIDTH),
    source: truncateText(skill.source || "-", SOURCE_WIDTH),
    installs: String(skill.installs),
  }));

  printTable(columns, rows);
}
