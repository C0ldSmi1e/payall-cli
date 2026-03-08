import Table from "cli-table3";
import chalk from "chalk";

interface Column {
  key: string;
  header: string;
  width?: number;
  align?: "left" | "center" | "right";
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

export function renderTable(
  rows: Record<string, unknown>[],
  columns: Column[]
): void {
  const table = new Table({
    head: columns.map((c) => chalk.bold(c.header)),
    colWidths: columns.map((c) => c.width),
    colAligns: columns.map((c) => c.align || "left"),
    style: { head: ["cyan"], border: ["dim"] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(
      columns.map((col) => {
        const val = row[col.key];
        if (col.format) return col.format(val, row);
        if (val === null || val === undefined) return chalk.dim("-");
        return String(val);
      })
    );
  }

  console.log(table.toString());
}

export function renderKeyValue(pairs: [string, string][]): void {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, value] of pairs) {
    console.log(`  ${chalk.dim(key.padEnd(maxKeyLen + 2))}${value}`);
  }
}
