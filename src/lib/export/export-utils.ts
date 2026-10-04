import { createHash } from "node:crypto";

function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Spreadsheet applications may execute formula-looking CSV cells. Preserve
  // the visible value while forcing text interpretation, including whitespace.
  const text = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csv(rows: unknown[][]) {
  return `${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`;
}

export function sha256(contents: Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}
