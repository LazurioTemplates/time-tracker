import type { DraftPanelInput } from "@lazurio/repository-db";
import type { Client } from "../domain/client.ts";
import type { Entry } from "../domain/entry.ts";
import type { Policy } from "../domain/policy.ts";
import type { Project } from "../domain/project.ts";
import type { Period, Range, Summary } from "../domain/report.ts";
import type { RuleIssue } from "../domain/rules.ts";
import type { Language } from "../language/messages.ts";

/** What the server stores, as the browser receives it. */
export interface Stored<T> {
  id: string;
  value: T;
  revision: string;
}

export interface StoredEntry extends Stored<Entry> {
  /** The change waits in the unpublished draft. */
  pending: boolean;
}

export interface Session {
  viewer: {
    role: "admin" | "user" | null;
    person: { subject: string; username: string | null } | null;
    entry: "environment" | "app" | "local" | "unknown";
  };
  organization: string;
  language: Language;
  policy: Policy;
  available: { ok: true } | { ok: false; code: string; message: string };
  now: number;
}

export interface Catalog {
  clients: Stored<Client>[];
  projects: Stored<Project>[];
}

export interface KnownPerson {
  person: string;
  name: string | null;
}

export interface Report {
  now: number;
  period: Period;
  range: Range;
  previous: Range;
  next: Range;
  summary: Summary;
  missing: (KnownPerson & { days: string[] })[];
}

/** A refusal of the API, with the code the server documents. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const response = await fetch(
    path,
    init
      ? {
          method: init.method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(init.body),
          cache: "no-store",
        }
      : { headers: { accept: "application/json" }, cache: "no-store" },
  );
  if (response.status === 401 || response.redirected)
    throw new ApiError("session_expired", "The Lazurio sign-in expired.", 401);
  const data = (await response.json().catch(() => null)) as
    | (T & { code?: string; message?: string })
    | null;
  if (!response.ok) {
    const code = data?.code ?? "unexpected";
    // The server words its refusals in the App's language; the browser
    // words the codes it knows itself (`errorText`).
    throw new ApiError(code, data?.message ?? response.statusText, response.status);
  }
  return data as T;
}

const query = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export interface EntryFilter {
  from?: string | null;
  to?: string | null;
  person?: string | null;
  project?: string | null;
  client?: string | null;
}

export const api = {
  session: () => request<Session>("/api/session"),
  catalog: () => request<Catalog>("/api/catalog"),
  people: () => request<{ people: KnownPerson[] }>("/api/people"),
  entries: (filter: EntryFilter) =>
    request<{ now: number; entries: StoredEntry[] }>(`/api/entries${query({ ...filter })}`),
  report: (period: Period, day: string, person: string | null) =>
    request<Report>(`/api/report${query({ period, day, person })}`),
  exportUrl: (kind: "entries" | "summary", filter: EntryFilter) =>
    `/api/export${query({ kind, ...filter })}`,
  start: (input: { id: string; project: string; note: string }) =>
    request<Stored<Entry>>("/api/timer/start", { method: "POST", body: input }),
  stop: (id: string, revision: string) =>
    request<Stored<Entry>>("/api/timer/stop", { method: "POST", body: { id, revision } }),
  addEntry: (input: {
    id: string;
    person?: string;
    project: string;
    day: string;
    from: string;
    to: string;
    note: string;
  }) => request<Stored<Entry>>("/api/entries", { method: "POST", body: input }),
  saveEntry: (
    id: string,
    input: {
      revision: string;
      project: string;
      day: string;
      from: string;
      to: string | null;
      note: string;
    },
  ) =>
    request<Stored<Entry>>(`/api/entries/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: input,
    }),
  deleteEntry: (id: string, revision: string) =>
    request<{ ok: true }>(`/api/entries/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: { revision },
    }),
  addClient: (name: string) =>
    request<Stored<Client>>("/api/clients", { method: "POST", body: { name } }),
  saveClient: (id: string, value: Client, baseRevision: string) =>
    request<Stored<Client>>(`/api/clients/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { value, baseRevision },
    }),
  addProject: (input: { name: string; client: string | null; billable: boolean }) =>
    request<Stored<Project>>("/api/projects", { method: "POST", body: input }),
  saveProject: (id: string, value: Project, baseRevision: string) =>
    request<Stored<Project>>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { value, baseRevision },
    }),
  check: () => request<RuleIssue[]>("/api/check"),
  draft: () => request<DraftPanelInput>("/api/draft"),
  publish: (expectedRevision: string) =>
    request<{ ok: true }>("/api/draft/publish", { method: "POST", body: { expectedRevision } }),
  finishSend: (expectedHead: string) =>
    request<{ ok: true }>("/api/draft/finish-send", { method: "POST", body: { expectedHead } }),
  discard: (
    scope: { kind: "draft" } | { kind: "record"; path: string },
    expectedRevision: string,
  ) =>
    request<{ ok: true }>("/api/draft/discard", {
      method: "POST",
      body: { scope, expectedRevision },
    }),
  pull: () => request<{ ok: true }>("/api/draft/pull", { method: "POST", body: {} }),
};

/** Server events: records came in or the draft moved. Returns the unsubscribe function. */
export function subscribe(onChange: () => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource("/api/events");
  source.addEventListener("records-changed", onChange);
  source.addEventListener("draft-changed", onChange);
  return () => source.close();
}

/** A new entry's id. */
export function newId(): string {
  return crypto.randomUUID();
}
