import chalk from "chalk";

export function formatCurrency(amount: string | number, currency = "USD"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return chalk.dim("-");
  return `${num.toFixed(2)} ${currency}`;
}

export function formatStatus(status: string): string {
  switch (status?.toLowerCase()) {
    case "active":
    case "success":
    case "confirmed":
      return chalk.green(status);
    case "pending":
    case "processing":
      return chalk.yellow(status);
    case "inactive":
    case "failed":
    case "cancelled":
      return chalk.red(status);
    default:
      return chalk.dim(status || "-");
  }
}

export function formatBoolean(val: unknown): string {
  if (val === true || val === 1 || val === "1") return chalk.green("Yes");
  return chalk.dim("No");
}

export function truncate(str: string, len: number): string {
  if (!str) return "";
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "\u2026";
}

export function parseFees(feesStr: string | object): Record<string, unknown> {
  try {
    const fees = typeof feesStr === "string" ? JSON.parse(feesStr) : feesStr;
    return fees || {};
  } catch {
    return {};
  }
}

export function feeValue(fees: Record<string, unknown>, key: string): string {
  const f = fees[key];
  if (f === null || f === undefined) return chalk.dim("-");
  if (typeof f === "object" && f !== null && "value" in f) {
    const obj = f as { value: number; unit?: string };
    return obj.value === 0 ? chalk.green("Free") : `${obj.value} ${obj.unit || ""}`;
  }
  if (f === 0) return chalk.green("Free");
  return String(f);
}
