import { fmt, printTable, type TableColumn, type TableRow } from "argc/terminal";

import { listInstalledSkills } from "../lib/installed-skills";
import { truncateText } from "../lib/truncate";

const DESCRIPTION_WIDTH = 72;

export async function runList(): Promise<void> {
  const skills = await listInstalledSkills(process.cwd());
  if (skills.length === 0) {
    console.log(fmt.info("No installed skills found in local or global roots."));
    return;
  }

  const columns: TableColumn[] = [
    { key: "id", label: "ID" },
    { key: "description", label: "Description", width: DESCRIPTION_WIDTH },
    { key: "scope", label: "Scope" },
  ];

  const rows: TableRow[] = skills.map((skill) => ({
    id: skill.id,
    description: truncateText(skill.description || "-", DESCRIPTION_WIDTH),
    scope: skill.scope,
  }));

  printTable(columns, rows);
}
