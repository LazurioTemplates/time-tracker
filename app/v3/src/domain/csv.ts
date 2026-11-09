import { type Language, messages } from "../language/messages.ts";
import { localDay, localTime } from "./calendar.ts";
import type { Entry } from "./entry.ts";
import type { Policy } from "./policy.ts";
import type { Catalog, Summary } from "./report.ts";
import type { Keyed } from "./rules.ts";
import { durationMs, effective, entryDay, hoursText } from "./time.ts";

/**
 * CSV for invoicing and payroll, as spreadsheets of the App's language open
 * it: UTF-8 with a byte order mark and CRLF lines; in Czech `;` between cells
 * and a decimal comma, in English `,` and a decimal point. Every cell is
 * quoted, and a cell that a spreadsheet would run as a formula starts with an
 * apostrophe.
 */
function cell(value: string): string {
  let start = 0;
  // Leading blanks and control characters do not hide a formula.
  while (start < value.length && (value.charCodeAt(start) <= 32 || /\s/u.test(value[start] ?? "")))
    start += 1;
  const formula = /^[=+\-@]/.test(value.slice(start)) || /^[\t\r]/.test(value);
  const safe = formula ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** The byte order mark that tells a spreadsheet the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

function table(rows: readonly (readonly string[])[], delimiter: string): string {
  return `${BOM}${rows.map((row) => row.map(cell).join(delimiter)).join("\r\n")}\r\n`;
}

/** One row per entry, in the order given. */
export function entriesCsv(
  rows: readonly Keyed<Entry>[],
  catalog: Catalog,
  now: number,
  policy: Policy,
  language: Language,
): string {
  const { csv, ownWork, yes, no } = messages[language];
  const projects = new Map(catalog.projects.map((row) => [row.id, row.value]));
  const clients = new Map(catalog.clients.map((row) => [row.id, row.value]));
  const lines: string[][] = [[...csv.entryHeader]];
  for (const { id, value: stored } of rows) {
    const value = effective(stored, now, policy);
    const project = projects.get(value.project);
    const clientId = project?.client ?? null;
    lines.push([
      entryDay(value, policy),
      localTime(value.startedAt, policy.timeZone),
      value.endedAt === null
        ? ""
        : `${localDay(value.endedAt, policy.timeZone) === entryDay(value, policy) ? "" : `${localDay(value.endedAt, policy.timeZone)} `}${localTime(value.endedAt, policy.timeZone)}`,
      hoursText(durationMs(value, now, policy), language),
      value.personName ?? value.person,
      clientId === null ? ownWork : (clients.get(clientId)?.name ?? clientId),
      project?.name ?? value.project,
      project?.billable ? yes : no,
      value.note,
      value.endedAt === null ? csv.running : value.autoStoppedAt ? csv.autoStopped : csv.stopped,
      value.source === "timer" ? csv.timer : csv.manual,
      id,
    ]);
  }
  return table(lines, csv.delimiter);
}

/** Hours by client, project and person for the summary's range. */
export function summaryCsv(summary: Summary, language: Language): string {
  const { csv, yes, no } = messages[language];
  return table(
    [
      [...csv.summaryHeader],
      ...summary.lines.map((line) => [
        summary.from,
        summary.to,
        line.clientName,
        line.projectName,
        line.billable ? yes : no,
        line.personName ?? line.person,
        hoursText(line.ms, language),
      ]),
    ],
    csv.delimiter,
  );
}
