/**
 * One CSV cell, safe to open in Excel / Google Sheets / LibreOffice.
 *
 * - A leading `=`, `+`, `-`, `@`, tab or carriage return makes spreadsheet
 *   apps evaluate the cell as a formula (CSV/formula injection), so those
 *   values are prefixed with a single quote, which renders as plain text.
 * - Values containing a double quote, comma, CR or LF are wrapped in quotes
 *   with embedded quotes doubled (RFC 4180).
 *
 * Contact handles, emails, tags and notes are attacker-controlled (anyone can
 * DM the account), so every exported string goes through here.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  const cell = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
