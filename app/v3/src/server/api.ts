import { z } from "zod";
import { type Stored, StoreError, type TimeStore } from "../data/store.ts";
import { isAdmin, mayUseEntry, type Viewer } from "../domain/access.ts";
import { localDay } from "../domain/calendar.ts";
import { type Client, client } from "../domain/client.ts";
import { clock, day, entryId, slugFor, slugId, subject } from "../domain/common.ts";
import { entriesCsv, summaryCsv } from "../domain/csv.ts";
import type { Entry } from "../domain/entry.ts";
import { keptMoments, OCCURRENCES, resolveInterval, type WallTimes } from "../domain/interval.ts";
import type { Policy } from "../domain/policy.ts";
import { type Project, project } from "../domain/project.ts";
import {
  inRange,
  knownPeople,
  missingDays,
  PERIODS,
  type Range,
  rangeOf,
  shiftRange,
  summarize,
} from "../domain/report.ts";
import { effective } from "../domain/time.ts";
import { type Language, messages } from "../language/messages.ts";
import type { Entry as AccessEntry } from "./viewer.ts";

/**
 * The HTTP API of Time Tracker. The browser and agents talk only to this API;
 * the API talks only to the storage port, never to files or Git.
 *
 * Who may do what is decided here, on the server, for every request, from the
 * application role Lazurio states (decisions 0196 and 0231): an application
 * user reads and changes only their own entries; an application admin reads
 * and corrects all of them, keeps projects and clients, and reviews and
 * publishes the draft. A request without a role gets nothing but its session.
 */
export interface ApiOptions {
  /** Origins a writing request may come from (the App's own, loopback and hosted). */
  allowedOrigins: ReadonlySet<string>;
  /** Who sends a request; `viewerOf` of `viewer.ts` in the App. */
  viewer: (request: Request) => { viewer: Viewer; entry: AccessEntry };
  policy: Policy;
  /** The Organization's name for the header. */
  organization: string;
  /** The App's one language: answers, exports and the review speak it. */
  language: Language;
  now?: () => number;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const note = z.string().trim().max(500).default("");
const revision = z.string().min(1);

const startInput = z.strictObject({ id: entryId, project: slugId, note });
const stopInput = z.strictObject({ id: entryId, revision });
/** Which of two moments a wall-clock time means when the clocks repeat it. */
const occurrence = z.enum(OCCURRENCES).optional();
const manualInput = z.strictObject({
  id: entryId,
  /** Whose time; an application admin may name another known person. */
  person: subject.optional(),
  project: slugId,
  day,
  from: clock,
  to: clock,
  fromOccurrence: occurrence,
  toOccurrence: occurrence,
  note,
});
const editInput = z.strictObject({
  revision,
  project: slugId,
  day,
  from: clock,
  /** `null` keeps a running timer running. */
  to: clock.nullable(),
  fromOccurrence: occurrence,
  toOccurrence: occurrence,
  note,
});
const deleteInput = z.strictObject({ revision });
const newClientInput = z.strictObject({ name: client.shape.name });
const newProjectInput = z.strictObject({
  name: project.shape.name,
  client: slugId.nullable(),
  billable: z.boolean(),
});
const saveClientInput = z.strictObject({ value: client, baseRevision: revision });
const saveProjectInput = z.strictObject({ value: project, baseRevision: revision });
const publishInput = z.strictObject({
  expectedRevision: z.string().min(1),
  summary: z.string().trim().min(1).optional(),
});
const discardInput = z.strictObject({
  scope: z.union([
    z.strictObject({ kind: z.literal("draft") }),
    z.strictObject({ kind: z.literal("record"), path: z.string().min(1) }),
  ]),
  expectedRevision: z.string().min(1),
});

const STATUS_BY_CODE: Record<string, number> = {
  bad_request: 400,
  person_required: 400,
  identity_unavailable: 403,
  forbidden: 403,
  origin_refused: 403,
  not_found: 404,
  invalid_record: 422,
  nonexistent_time: 422,
  ambiguous_time: 409,
  validation_failed: 422,
  materialize_failed: 422,
  record_changed: 409,
  timer_running: 409,
  entry_overlap: 409,
  no_timer: 409,
  draft_changed: 409,
  draft_write_blocked: 409,
  conflict_active: 409,
  publish_conflict: 409,
  pull_blocked_by_draft: 409,
  send_pending: 409,
  nothing_to_send: 409,
  publish_push_failed: 502,
  credentials: 401,
  identity_missing: 401,
  mount_unavailable: 503,
  boundary_violation: 503,
  config_changed: 503,
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function refusal(code: string, message: string, status: number, issues: unknown[] = []) {
  return json({ code, message, issues }, status);
}

function errorResponse(error: unknown, language: Language): Response {
  if (error instanceof StoreError)
    return refusal(error.code, error.message, STATUS_BY_CODE[error.code] ?? 409, [...error.issues]);
  console.error("Time Tracker request failed:", error instanceof Error ? error.message : error);
  return refusal("unexpected", messages[language].errors.unexpected ?? "", 500);
}

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new StoreError("bad_request", "The request body is not JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new StoreError(
      "bad_request",
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  return parsed.data;
}

/** A write is accepted only as JSON from one of the App's own origins (no cross-site writes). */
function writeRefusal(
  req: Request,
  allowedOrigins: ReadonlySet<string>,
  language: Language,
): Response | null {
  if (!WRITE_METHODS.has(req.method)) return null;
  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin))
    return refusal("origin_refused", messages[language].errors.origin_refused ?? "", 403);
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
    return refusal("bad_request", "A change is sent as application/json.", 415);
  return null;
}

/** A range of days from the query, both optional; `to` before `from` is refused. */
function rangeFromQuery(params: URLSearchParams, language: Language): Partial<Range> {
  const t = messages[language].server;
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  for (const value of [from, to])
    if (value !== undefined && !day.safeParse(value).success)
      throw new StoreError("bad_request", t.dayFormat);
  if (from && to && to < from) throw new StoreError("bad_request", t.rangeOrder);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export function createApi(store: TimeStore, options: ApiOptions) {
  const { policy, language } = options;
  const clock = options.now ?? Date.now;
  const t = messages[language];
  const forbidden = () => new StoreError("forbidden", t.server.forbidden);

  /** The entries a viewer may see, narrowed by the query's filters. */
  async function visibleEntries(viewer: Viewer, params: URLSearchParams, now: number) {
    const range = rangeFromQuery(params, language);
    const person = params.get("person") || null;
    const projectId = params.get("project") || null;
    const clientId = params.get("client") || null;
    const projects = clientId ? await store.listProjects() : [];
    const ofClient = new Set(
      projects
        .filter((row) =>
          clientId === "own" ? row.value.client === null : row.value.client === clientId,
        )
        .map((row) => row.id),
    );
    const all = { from: range.from ?? "0000-01-01", to: range.to ?? "9999-12-31" };
    return (
      (await store.listEntries())
        .filter(
          (row) =>
            mayUseEntry(viewer, row.value) &&
            (person === null || row.value.person === person) &&
            (projectId === null || row.value.project === projectId) &&
            (clientId === null || ofClient.has(row.value.project)) &&
            inRange(row.value, all, policy),
        )
        // The effective view: a forgotten timer shows its automatic end.
        .map((row) => ({ ...row, value: effective(row.value, now, policy) }))
    );
  }

  async function knownPerson(subjectId: string) {
    const people = knownPeople(await store.listEntries());
    return people.find((row) => row.person === subjectId) ?? null;
  }

  const dateText = new Intl.DateTimeFormat(t.locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  /**
   * The moments of the wall-clock times a person entered; `kept` are stored
   * moments whose times they left unchanged (`domain/interval.ts`). A time
   * the clocks skip is refused, one they repeat needs its occurrence named.
   */
  function interval(times: WallTimes, kept: { startedAt?: string; endedAt?: string } = {}) {
    const result = resolveInterval(times, policy.timeZone, kept);
    if (result.ok) return { startedAt: result.startedAt, endedAt: result.endedAt };
    const shownDay = dateText.format(Date.parse(`${result.day}T00:00:00Z`));
    if (result.problem === "order") throw new StoreError("invalid_record", t.server.endAfterStart);
    if (result.problem === "missing")
      throw new StoreError("nonexistent_time", t.server.nonexistentTime(shownDay, result.time), [
        { path: result.field, message: t.server.nonexistentTime(shownDay, result.time) },
      ]);
    throw new StoreError("ambiguous_time", t.server.ambiguousTime(shownDay, result.time), [
      { path: result.field, message: t.server.ambiguousTime(shownDay, result.time) },
    ]);
  }

  async function requireEntry(viewer: Viewer, id: string): Promise<Stored<Entry>> {
    const found = await store.getEntry(id);
    // Someone else's entry is "not found" to an application user, never "forbidden".
    if (!found || !mayUseEntry(viewer, found.value))
      throw new StoreError("not_found", t.server.notFound);
    return found;
  }

  function events(req: Request): Response {
    let stop = () => {};
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(": connected\n\n");
        // Only the kind of change goes out: no record, path or count.
        const unsubscribe = store.subscribe((event) => {
          try {
            controller.enqueue(`event: ${event.type}\ndata: {}\n\n`);
          } catch {
            stop();
          }
        });
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(": keep-alive\n\n");
          } catch {
            stop();
          }
        }, 25_000);
        stop = () => {
          clearInterval(keepAlive);
          unsubscribe();
        };
        req.signal.addEventListener("abort", () => {
          stop();
          try {
            controller.close();
          } catch {}
        });
      },
      cancel() {
        stop();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    });
  }

  async function route(req: Request, url: URL, viewer: Viewer, entry: AccessEntry) {
    const { pathname, searchParams } = url;
    const method = req.method;
    const now = clock();
    const actor = viewer.person?.subject ?? null;

    if (pathname === "/api/session" && method === "GET")
      return json({
        viewer: { role: viewer.role, person: viewer.person, entry },
        organization: options.organization,
        language,
        policy,
        available: await store.available(),
        now,
      });
    if (viewer.role === null)
      throw new StoreError("identity_unavailable", t.server.identityUnavailable);

    if (pathname === "/api/events" && method === "GET") return events(req);

    if (pathname === "/api/catalog" && method === "GET") {
      const [clients, projects] = await Promise.all([store.listClients(), store.listProjects()]);
      return json({ clients, projects });
    }

    if (pathname === "/api/people" && method === "GET") {
      if (viewer.role === "user")
        return json({ people: [{ person: viewer.person.subject, name: viewer.person.username }] });
      return json({ people: knownPeople(await store.listEntries()) });
    }

    if (pathname === "/api/entries" && method === "GET") {
      const pending = new Set(
        (await store.pending())
          .filter((record) => record.collection === "entries")
          .map((record) => record.id),
      );
      const entries = await visibleEntries(viewer, searchParams, now);
      return json({
        now,
        entries: entries.map((row) => ({ ...row, pending: pending.has(row.id) })),
      });
    }

    if (pathname === "/api/timer/start" && method === "POST") {
      const input = await body(req, startInput);
      if (!viewer.person) throw new StoreError("person_required", t.server.timerNeedsPerson);
      const value: Entry = {
        person: viewer.person.subject,
        personName: viewer.person.username,
        project: input.project,
        startedAt: new Date(now).toISOString(),
        endedAt: null,
        note: input.note,
        source: "timer",
        autoStoppedAt: null,
        updatedAt: new Date(now).toISOString(),
        updatedBy: actor,
      };
      return json(await store.saveEntry(input.id, value, null, actor), 201);
    }

    if (pathname === "/api/timer/stop" && method === "POST") {
      const input = await body(req, stopInput);
      const found = await requireEntry(viewer, input.id);
      if (found.revision !== input.revision)
        throw new StoreError("record_changed", t.server.changedMeanwhile);
      if (found.value.endedAt !== null) throw new StoreError("no_timer", t.server.alreadyStopped);
      const current = effective(found.value, now, policy);
      const value: Entry = {
        ...current,
        endedAt: current.endedAt ?? new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        updatedBy: actor,
      };
      return json(await store.saveEntry(input.id, value, found.revision, actor));
    }

    if (pathname === "/api/entries" && method === "POST") {
      const input = await body(req, manualInput);
      let person = viewer.person
        ? { person: viewer.person.subject, name: viewer.person.username }
        : null;
      if (input.person !== undefined && input.person !== viewer.person?.subject) {
        if (!isAdmin(viewer)) throw forbidden();
        person = await knownPerson(input.person);
        if (!person) throw new StoreError("invalid_record", t.server.unknownPerson);
      }
      if (!person) throw new StoreError("person_required", t.server.personRequired);
      const value: Entry = {
        person: person.person,
        personName: person.name,
        project: input.project,
        ...interval(input),
        note: input.note,
        source: "manual",
        autoStoppedAt: null,
        updatedAt: new Date(now).toISOString(),
        updatedBy: actor,
      };
      return json(await store.saveEntry(input.id, value, null, actor), 201);
    }

    const entryMatch = /^\/api\/entries\/([^/]+)$/.exec(pathname);
    if (entryMatch && (method === "PUT" || method === "DELETE")) {
      const id = decodeURIComponent(entryMatch[1] ?? "");
      const found = await requireEntry(viewer, id);
      if (method === "DELETE") {
        const input = await body(req, deleteInput);
        await store.deleteEntry(id, input.revision, actor);
        return json({ ok: true });
      }
      const input = await body(req, editInput);
      const current = effective(found.value, now, policy);
      if (input.to === null && current.endedAt !== null)
        throw new StoreError("bad_request", t.server.endNeeded);
      const own = viewer.person?.subject === found.value.person;
      // Times the person left as they were shown keep their stored moments exactly.
      const kept = keptMoments(current, input, policy.timeZone);
      const value: Entry = {
        ...current,
        ...(own && viewer.person
          ? { personName: viewer.person.username ?? current.personName }
          : {}),
        project: input.project,
        ...interval(input, kept),
        note: input.note,
        updatedAt: new Date(now).toISOString(),
        updatedBy: actor,
      };
      return json(await store.saveEntry(id, value, input.revision, actor));
    }

    if (pathname === "/api/report" && method === "GET") {
      const period = PERIODS.find((value) => value === searchParams.get("period")) ?? "week";
      const anchor = searchParams.get("day") || localDay(now, policy.timeZone);
      if (!day.safeParse(anchor).success) throw new StoreError("bad_request", t.server.dayFormat);
      const range = rangeOf(period, anchor);
      const scope = new URLSearchParams();
      const person = viewer.role === "user" ? viewer.person.subject : searchParams.get("person");
      if (person) scope.set("person", person);
      const [rows, clients, projects] = await Promise.all([
        visibleEntries(viewer, scope, now),
        store.listClients(),
        store.listProjects(),
      ]);
      const today = localDay(now, policy.timeZone);
      const people = person
        ? knownPeople(rows).filter((row) => row.person === person)
        : knownPeople(rows);
      if (person && people.length === 0 && viewer.person?.subject === person)
        people.push({ person, name: viewer.person.username });
      return json({
        now,
        period,
        range,
        previous: shiftRange(period, range, -1),
        next: shiftRange(period, range, 1),
        summary: summarize(rows, { clients, projects }, range, now, policy, language),
        missing: people
          .map((row) => ({ ...row, days: missingDays(rows, row.person, range, today, policy) }))
          .filter((row) => row.days.length > 0),
      });
    }

    if (pathname === "/api/export" && method === "GET") {
      const kind = searchParams.get("kind") === "summary" ? "summary" : "entries";
      const scope = new URLSearchParams(searchParams);
      if (viewer.role === "user") scope.set("person", viewer.person.subject);
      const range = rangeFromQuery(scope, language);
      const [rows, clients, projects] = await Promise.all([
        visibleEntries(viewer, scope, now),
        store.listClients(),
        store.listProjects(),
      ]);
      const ordered = [...rows].sort(
        (a, b) => a.value.startedAt.localeCompare(b.value.startedAt) || a.id.localeCompare(b.id),
      );
      const from =
        range.from ??
        (ordered[0]
          ? localDay(ordered[0].value.startedAt, policy.timeZone)
          : localDay(now, policy.timeZone));
      const to = range.to ?? localDay(now, policy.timeZone);
      const text =
        kind === "summary"
          ? summaryCsv(
              summarize(ordered, { clients, projects }, { from, to }, now, policy, language),
              language,
            )
          : entriesCsv(ordered, { clients, projects }, now, policy, language);
      return new Response(text, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${kind === "summary" ? t.csv.summaryFile : t.csv.entriesFile}-${from}-${to}.csv"`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    // Everything below is the application admin's: projects, clients, the
    // data check and the whole draft (decision 0196: only someone who sees the
    // whole draft may publish it).
    if (!isAdmin(viewer)) throw forbidden();

    if (pathname === "/api/clients" && method === "POST") {
      const input = await body(req, newClientInput);
      const taken = new Set((await store.listClients()).map((row) => row.id));
      const value: Client = { name: input.name, archived: false };
      return json(await store.saveClient(slugFor(input.name, taken), value, null, actor), 201);
    }
    const clientMatch = /^\/api\/clients\/([^/]+)$/.exec(pathname);
    if (clientMatch && method === "PUT") {
      const input = await body(req, saveClientInput);
      return json(
        await store.saveClient(
          decodeURIComponent(clientMatch[1] ?? ""),
          input.value,
          input.baseRevision,
          actor,
        ),
      );
    }
    if (pathname === "/api/projects" && method === "POST") {
      const input = await body(req, newProjectInput);
      const taken = new Set((await store.listProjects()).map((row) => row.id));
      const value: Project = { ...input, archived: false };
      return json(await store.saveProject(slugFor(input.name, taken), value, null, actor), 201);
    }
    const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(pathname);
    if (projectMatch && method === "PUT") {
      const input = await body(req, saveProjectInput);
      return json(
        await store.saveProject(
          decodeURIComponent(projectMatch[1] ?? ""),
          input.value,
          input.baseRevision,
          actor,
        ),
      );
    }

    if (pathname === "/api/check" && method === "GET") return json(await store.check());
    if (pathname === "/api/draft" && method === "GET") return json(await store.draft());
    if (pathname === "/api/draft/publish" && method === "POST") {
      const input = await body(req, publishInput);
      await store.publish({
        expectedRevision: input.expectedRevision,
        ...(actor ? { actor } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
      });
      return json({ ok: true });
    }
    if (pathname === "/api/draft/finish-send" && method === "POST") {
      const input = await body(req, z.strictObject({ expectedHead: z.string().min(1) }));
      await store.finishSend(input.expectedHead);
      return json({ ok: true });
    }
    if (pathname === "/api/draft/discard" && method === "POST") {
      const input = await body(req, discardInput);
      await store.discard(input.scope, input.expectedRevision);
      return json({ ok: true });
    }
    if (pathname === "/api/draft/pull" && method === "POST") {
      await store.pull();
      return json({ ok: true });
    }
    return refusal("not_found", `${method} ${pathname} is not part of the API.`, 404);
  }

  /** Answers an `/api/…` request; every other path is not the API's. */
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const refused = writeRefusal(req, options.allowedOrigins, language);
    if (refused) return refused;
    try {
      // Read for every request and never cached: after another account signs
      // in, the next request names the new person.
      const { viewer, entry } = options.viewer(req);
      return await route(req, url, viewer, entry);
    } catch (error) {
      return errorResponse(error, language);
    }
  };
}
