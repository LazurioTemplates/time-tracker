import { type Language, messages } from "../language/messages.ts";
import type { Client } from "./client.ts";
import type { Entry } from "./entry.ts";
import type { Policy } from "./policy.ts";
import type { Project } from "./project.ts";
import { effective, overlaps } from "./time.ts";

/** A record and its id, as the rules see them. */
export interface Keyed<T> {
  id: string;
  value: T;
}

export interface DataSnapshot {
  clients: readonly Keyed<Client>[];
  projects: readonly Keyed<Project>[];
  entries: readonly Keyed<Entry>[];
}

/** A problem of the data: the record (`<collection>/<id>`) and what is wrong, in the App's language. */
export interface RuleIssue {
  record: string;
  message: string;
}

/** Why a save is refused; the code is the API's. */
export interface Refusal {
  code: "invalid_record" | "entry_overlap" | "timer_running";
  message: string;
}

/** A moment counts as now within this skew between the browser and the server. */
const SKEW_MS = 60_000;

/**
 * Every problem across records of the data as it stands: references to
 * missing clients and projects, more than one running timer of a person and
 * entries of one person that overlap. A record's own shape is its schema's.
 */
export function checkRules(
  data: DataSnapshot,
  now: number,
  policy: Policy,
  language: Language,
): RuleIssue[] {
  const t = messages[language].rules;
  const issues: RuleIssue[] = [];
  const clients = new Set(data.clients.map((entry) => entry.id));
  const projects = new Set(data.projects.map((entry) => entry.id));
  for (const { id, value } of data.projects)
    if (value.client !== null && !clients.has(value.client))
      issues.push({ record: `projects/${id}`, message: t.clientMissing(value.client) });
  const byPerson = new Map<string, Keyed<Entry>[]>();
  for (const row of data.entries) {
    if (!projects.has(row.value.project))
      issues.push({
        record: `entries/${row.id}`,
        message: t.projectMissing(row.value.project),
      });
    byPerson.set(row.value.person, [...(byPerson.get(row.value.person) ?? []), row]);
  }
  for (const rows of byPerson.values()) {
    const sorted = [...rows].sort((a, b) => a.value.startedAt.localeCompare(b.value.startedAt));
    const running = sorted.filter((row) => effective(row.value, now, policy).endedAt === null);
    for (const extra of running.slice(1))
      issues.push({
        record: `entries/${extra.id}`,
        message: t.secondTimer,
      });
    for (let i = 0; i < sorted.length; i += 1)
      for (let j = i + 1; j < sorted.length; j += 1) {
        const left = sorted[i];
        const right = sorted[j];
        if (!left || !right) continue;
        if (Date.parse(right.value.startedAt) >= endOf(left.value, now, policy)) break;
        if (overlaps(left.value, right.value, now, policy))
          issues.push({
            record: `entries/${right.id}`,
            message: t.overlapWith(left.id),
          });
      }
  }
  return issues;
}

function endOf(value: Entry, now: number, policy: Policy): number {
  const end = effective(value, now, policy).endedAt;
  return end === null ? Number.POSITIVE_INFINITY : Date.parse(end);
}

/**
 * Why saving this entry would break the data, or null. `previous` is the
 * stored version when the entry is edited: an entry already on an archived
 * project may stay there, a new one may not.
 */
export function entryRefusal(
  id: string,
  value: Entry,
  previous: Entry | null,
  data: DataSnapshot,
  now: number,
  policy: Policy,
  language: Language,
): Refusal | null {
  const t = messages[language].rules;
  const project = data.projects.find((row) => row.id === value.project);
  if (!project) return { code: "invalid_record", message: t.chooseProject };
  if (project.value.archived && previous?.project !== value.project)
    return { code: "invalid_record", message: t.projectArchived(project.value.name) };
  if (Date.parse(value.startedAt) > now + SKEW_MS)
    return { code: "invalid_record", message: t.startInFuture };
  if (value.endedAt !== null && Date.parse(value.endedAt) > now + SKEW_MS)
    return { code: "invalid_record", message: t.endInFuture };
  const current = effective(value, now, policy);
  for (const other of data.entries) {
    if (other.id === id || other.value.person !== value.person) continue;
    const running = effective(other.value, now, policy).endedAt === null;
    if (current.endedAt === null && running)
      return {
        code: "timer_running",
        message: t.timerRunning,
      };
    if (overlaps(current, other.value, now, policy))
      return {
        code: "entry_overlap",
        message: running ? t.overlapRunning : t.overlap,
      };
  }
  return null;
}

/** Why saving this project would break the data, or null. */
export function projectRefusal(
  value: Project,
  previous: Project | null,
  data: DataSnapshot,
  language: Language,
): Refusal | null {
  const t = messages[language].rules;
  if (value.client === null) return null;
  const owner = data.clients.find((row) => row.id === value.client);
  if (!owner) return { code: "invalid_record", message: t.chooseClient };
  if (owner.value.archived && previous?.client !== value.client)
    return { code: "invalid_record", message: t.clientArchived(owner.value.name) };
  return null;
}
