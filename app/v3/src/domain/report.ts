import { type Language, messages } from "../language/messages.ts";
import { addDays, daysBetween, isWorkday, monthEnd, monthStart, weekStart } from "./calendar.ts";
import type { Client } from "./client.ts";
import type { Entry } from "./entry.ts";
import type { Policy } from "./policy.ts";
import type { Project } from "./project.ts";
import type { Keyed } from "./rules.ts";
import { durationMs, entryDay } from "./time.ts";

/** Days from `from` to `to`, both included, in the Organization's time zone. */
export interface Range {
  from: string;
  to: string;
}

export const PERIODS = ["week", "month"] as const;
export type Period = (typeof PERIODS)[number];

/** The week (Monday to Sunday) or the month a day falls in. */
export function rangeOf(period: Period, day: string): Range {
  if (period === "week") {
    const from = weekStart(day);
    return { from, to: addDays(from, 6) };
  }
  return { from: monthStart(day), to: monthEnd(day) };
}

/** The same kind of period just before or after. */
export function shiftRange(period: Period, range: Range, step: -1 | 1): Range {
  return period === "week"
    ? rangeOf("week", addDays(range.from, 7 * step))
    : rangeOf("month", step < 0 ? addDays(range.from, -1) : addDays(range.to, 1));
}

export interface Catalog {
  clients: readonly Keyed<Client>[];
  projects: readonly Keyed<Project>[];
}

export interface SummaryLine {
  client: string | null;
  clientName: string;
  project: string;
  projectName: string;
  billable: boolean;
  person: string;
  personName: string | null;
  ms: number;
}

export interface Summary extends Range {
  entries: number;
  totalMs: number;
  billableMs: number;
  days: { day: string; ms: number; workday: boolean }[];
  projects: { id: string; name: string; clientName: string; billable: boolean; ms: number }[];
  clients: { id: string | null; name: string; ms: number; billableMs: number }[];
  people: { person: string; name: string | null; ms: number; billableMs: number }[];
  /** Hours by client, project and person: the rows of the summary export. */
  lines: SummaryLine[];
}

export function inRange(value: Entry, range: Range, policy: Policy): boolean {
  const day = entryDay(value, policy);
  return day >= range.from && day <= range.to;
}

/** Totals of the entries that start within the range. */
export function summarize(
  rows: readonly Keyed<Entry>[],
  catalog: Catalog,
  range: Range,
  now: number,
  policy: Policy,
  language: Language,
): Summary {
  const { ownWork, locale } = messages[language];
  const projects = new Map(catalog.projects.map((row) => [row.id, row.value]));
  const clients = new Map(catalog.clients.map((row) => [row.id, row.value]));
  const days = new Map(daysBetween(range.from, range.to).map((day) => [day, 0]));
  const lines = new Map<string, SummaryLine>();
  let totalMs = 0;
  let billableMs = 0;
  let count = 0;
  for (const { value } of rows) {
    if (!inRange(value, range, policy)) continue;
    const ms = durationMs(value, now, policy);
    const project = projects.get(value.project);
    const clientId = project?.client ?? null;
    const billable = project?.billable ?? false;
    count += 1;
    totalMs += ms;
    if (billable) billableMs += ms;
    const day = entryDay(value, policy);
    days.set(day, (days.get(day) ?? 0) + ms);
    const key = `${value.project}\u0000${value.person}`;
    const line = lines.get(key) ?? {
      client: clientId,
      clientName: clientId === null ? ownWork : (clients.get(clientId)?.name ?? clientId),
      project: value.project,
      projectName: project?.name ?? value.project,
      billable,
      person: value.person,
      personName: value.personName,
      ms: 0,
    };
    line.ms += ms;
    if (value.personName) line.personName = value.personName;
    lines.set(key, line);
  }
  const sortedLines = [...lines.values()].sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName, locale) ||
      a.projectName.localeCompare(b.projectName, locale) ||
      (a.personName ?? a.person).localeCompare(b.personName ?? b.person, locale),
  );
  const group = <K, T extends { ms: number }>(
    keyOf: (line: SummaryLine) => K,
    start: (line: SummaryLine) => T,
    add: (item: T, line: SummaryLine) => void = () => {},
  ) => {
    const groups = new Map<K, T>();
    for (const line of sortedLines) {
      const key = keyOf(line);
      const item = groups.get(key) ?? start(line);
      item.ms += line.ms;
      add(item, line);
      groups.set(key, item);
    }
    return [...groups.values()].sort((a, b) => b.ms - a.ms);
  };
  return {
    ...range,
    entries: count,
    totalMs,
    billableMs,
    days: [...days].map(([day, ms]) => ({ day, ms, workday: isWorkday(day, policy) })),
    projects: group(
      (line) => line.project,
      (line) => ({
        id: line.project,
        name: line.projectName,
        clientName: line.clientName,
        billable: line.billable,
        ms: 0,
      }),
    ),
    clients: group(
      (line) => line.client,
      (line) => ({ id: line.client, name: line.clientName, ms: 0, billableMs: 0 }),
      (item, line) => {
        if (line.billable) item.billableMs += line.ms;
      },
    ),
    people: group(
      (line) => line.person,
      (line) => ({ person: line.person, name: line.personName, ms: 0, billableMs: 0 }),
      (item, line) => {
        if (line.billable) item.billableMs += line.ms;
        if (line.personName) item.name = line.personName;
      },
    ),
    lines: sortedLines,
  };
}

/** The people the data knows, by their entries: subject and the last name they showed. */
export function knownPeople(
  rows: readonly Keyed<Entry>[],
): { person: string; name: string | null }[] {
  const people = new Map<string, { name: string | null; at: string }>();
  for (const { value } of rows) {
    const known = people.get(value.person);
    if (!known || (value.personName && value.updatedAt >= known.at) || !known.name)
      people.set(value.person, {
        name: value.personName ?? known?.name ?? null,
        at: value.updatedAt,
      });
  }
  return [...people]
    .map(([person, { name }]) => ({ person, name }))
    .sort((a, b) => (a.name ?? a.person).localeCompare(b.name ?? b.person, "en"));
}

/**
 * Working days of the range before `today` on which the person recorded no
 * time: the days to ask them about. Weekends and the Organization's public
 * holidays are no working days; today is not missing yet.
 */
export function missingDays(
  rows: readonly Keyed<Entry>[],
  person: string,
  range: Range,
  today: string,
  policy: Policy,
): string[] {
  const recorded = new Set(
    rows.filter((row) => row.value.person === person).map((row) => entryDay(row.value, policy)),
  );
  return daysBetween(range.from, range.to).filter(
    (day) => day < today && isWorkday(day, policy) && !recorded.has(day),
  );
}
