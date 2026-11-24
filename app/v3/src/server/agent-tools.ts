import {
  createToolRegistry,
  defineTool,
  type ToolAuditEvent,
  type ToolContext,
  type ToolRegistry,
  type ToolResult,
} from "@lazurio/module-kit/tools";
import { z } from "zod";
import packageJson from "../../package.json";
import { clock, day } from "../domain/common.ts";
import { OCCURRENCES } from "../domain/interval.ts";
import { type Language, messages } from "../language/messages.ts";
import { CHANNEL_HEADER } from "./api.ts";
import { LISTENER } from "./viewer.ts";

/**
 * The App's tools for agents (Module Standard, "Agents in the App"), defined
 * once on the server and offered on `/mcp` and to the page
 * (`/api/agent-tools`, registered by `@lazurio/module-kit/webmcp`).
 *
 * Every tool calls the App's own HTTP API in the same process, with the
 * caller's request headers, so the API decides who may do what exactly as it
 * does for a click: the role, the writer rule, the person's own entries and
 * the record's revision. The channel (`mcp` or `webmcp`) goes with every
 * change, so the data record it as an agent's. No tool publishes or deletes:
 * publishing is the Draft page's button and deleting is the edit dialog's.
 */

type Api = (request: Request) => Promise<Response>;

const note = z.string().trim().max(500).optional();
const occurrence = z.enum(OCCURRENCES).optional();
const id = z.string().min(1).max(200);

const findInput = z.strictObject({
  from: day.optional(),
  to: day.optional(),
  person: z.string().max(200).optional(),
  client: z.string().max(200).optional(),
  project: z.string().max(200).optional(),
});
const emptyInput = z.strictObject({});
const startInput = z.strictObject({ project: id, note });
const addInput = z.strictObject({
  day,
  from: clock,
  to: clock,
  project: id,
  note,
  person: z.string().max(200).optional(),
  fromOccurrence: occurrence,
  toOccurrence: occurrence,
});
const updateInput = z.strictObject({
  id,
  revision: id,
  day,
  from: clock,
  to: clock.nullable(),
  project: id,
  note,
  fromOccurrence: occurrence,
  toOccurrence: occurrence,
});
const reportInput = z.strictObject({
  period: z.enum(["week", "month"]),
  day: day.optional(),
  person: z.string().max(200).optional(),
});

const schemaOf = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;

/** The headers the API reads who came by, copied from the caller's request;
 * the body headers are the tool's own. */
function forwardedHeaders(context: ToolContext, origin: string): Headers {
  const headers = new Headers(context.request.headers);
  for (const name of ["content-length", "content-type", "accept", "origin", CHANNEL_HEADER])
    headers.delete(name);
  headers.set(CHANNEL_HEADER, context.channel);
  headers.set("accept", "application/json");
  // The registry has already admitted the call (the gateway's token on
  // `/mcp`, the App's own origin on the page); the API's cross-site check
  // sees the App's own origin.
  headers.set("origin", origin);
  return headers;
}

const query = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** The API's answer as a tool result: data, or the API's refusal with its code. */
async function resultOf(response: Response): Promise<ToolResult<object>> {
  const body = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { code?: unknown; message?: unknown })
    | null;
  if (!response.ok) {
    const reason = typeof body?.code === "string" ? body.code : "unavailable";
    const message =
      typeof body?.message === "string" && body.message
        ? body.message
        : `The App answered HTTP ${response.status}.`;
    return { ok: false, reason, message };
  }
  if (Array.isArray(body)) return { ok: true, data: { items: body } };
  return { ok: true, data: body ?? {} };
}

export interface AgentToolsOptions {
  /** The App's HTTP API (`createApi`). */
  api: Api;
  /** One of the App's own origins, which the API accepts for a change. */
  origin: string;
  /** The App's one language: the tools' descriptions speak it. */
  language: Language;
  env?: Record<string, string | undefined>;
  /** Receives every call's audit line (default: one JSON line to stdout). */
  audit?: (event: ToolAuditEvent) => void;
  /**
   * Whose timer `stop_timer` stops: the subject of the person the API sees for
   * this request. Only the fictional demo, whose API reads a fictional person
   * instead of Lazurio's statement, passes it (`serve.ts`); the App itself
   * uses the person the registry read from `appAccess`.
   */
  self?: (request: Request) => string | null;
}

export function createAgentTools(options: AgentToolsOptions): ToolRegistry {
  const { api, origin } = options;
  const t = messages[options.language].tools;

  const call = async (
    context: ToolContext,
    path: string,
    init?: { method: string; body: unknown },
  ): Promise<ToolResult<object>> => {
    const headers = forwardedHeaders(context, origin);
    if (init) headers.set("content-type", "application/json");
    const request = new Request(new URL(path, origin), {
      method: init?.method ?? "GET",
      headers,
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    });
    return resultOf(await api(request));
  };

  const self = (context: ToolContext) =>
    options.self ? options.self(context.request) : (context.access.person?.subject ?? null);

  /** A stale revision's refusal, with the record's current revision while it
   * still exists (the kit's `current_revision`), read through the API as
   * `find_time_entries` reads it: the agent reads the entry again and decides. */
  const withCurrentRevision = async (
    context: ToolContext,
    entry: string,
    result: ToolResult<object>,
  ): Promise<ToolResult<object>> => {
    if (result.ok || result.reason !== "record_changed") return result;
    const found = await call(context, "/api/entries");
    if (!found.ok) return result;
    const entries = (found.data as { entries?: unknown }).entries;
    const current = Array.isArray(entries)
      ? (entries as Array<{ id: string; revision: string }>).find((row) => row.id === entry)
      : undefined;
    return current ? { ...result, current_revision: current.revision } : result;
  };

  return createToolRegistry({
    app: {
      module: "time-tracker",
      version: packageJson.version,
      dataGeneration: "v3",
      title: "Time Tracker",
    },
    listener: LISTENER,
    ...(options.env ? { env: options.env } : {}),
    ...(options.audit ? { audit: options.audit } : {}),
    tools: [
      defineTool({
        name: "find_time_entries",
        description: t.find_time_entries,
        input: findInput,
        inputSchema: schemaOf(findInput),
        minRole: "user",
        effect: "read",
        untrustedContent: true,
        run: (input, context) => call(context, `/api/entries${query({ ...input })}`),
      }),
      defineTool({
        name: "list_projects",
        description: t.list_projects,
        input: emptyInput,
        inputSchema: schemaOf(emptyInput),
        minRole: "user",
        effect: "read",
        untrustedContent: true,
        run: (_input, context) => call(context, "/api/catalog"),
      }),
      defineTool({
        name: "start_timer",
        description: t.start_timer,
        input: startInput,
        inputSchema: schemaOf(startInput),
        minRole: "user",
        effect: "write",
        run: (input, context) =>
          call(context, "/api/timer/start", {
            method: "POST",
            body: { id: crypto.randomUUID(), project: input.project, note: input.note ?? "" },
          }),
      }),
      defineTool({
        name: "stop_timer",
        description: t.stop_timer,
        input: emptyInput,
        inputSchema: schemaOf(emptyInput),
        minRole: "user",
        effect: "write",
        run: async (_input, context) => {
          const person = self(context);
          const found = await call(context, `/api/entries${query({ person })}`);
          if (!found.ok) return found;
          const entries = (found.data as { entries?: unknown }).entries;
          const running = Array.isArray(entries)
            ? (
                entries as Array<{
                  id: string;
                  revision: string;
                  value: { person: string; endedAt: unknown };
                }>
              ).find((row) => row.value.person === person && row.value.endedAt === null)
            : undefined;
          if (!running)
            return {
              ok: false,
              reason: "no_timer",
              message: messages[options.language].server.alreadyStopped,
            };
          return call(context, "/api/timer/stop", {
            method: "POST",
            body: { id: running.id, revision: running.revision },
          });
        },
      }),
      defineTool({
        name: "add_time_entry",
        description: t.add_time_entry,
        input: addInput,
        inputSchema: schemaOf(addInput),
        minRole: "user",
        effect: "write",
        run: (input, context) =>
          call(context, "/api/entries", {
            method: "POST",
            body: { id: crypto.randomUUID(), ...input, note: input.note ?? "" },
          }),
      }),
      defineTool({
        name: "update_time_entry",
        description: t.update_time_entry,
        input: updateInput,
        inputSchema: schemaOf(updateInput),
        minRole: "user",
        effect: "write",
        run: async ({ id: entry, ...input }, context) =>
          withCurrentRevision(
            context,
            entry,
            await call(context, `/api/entries/${encodeURIComponent(entry)}`, {
              method: "PUT",
              body: { ...input, note: input.note ?? "" },
            }),
          ),
      }),
      defineTool({
        name: "get_time_report",
        description: t.get_time_report,
        input: reportInput,
        inputSchema: schemaOf(reportInput),
        minRole: "user",
        effect: "read",
        untrustedContent: true,
        // Without a day the API takes today in the App's time zone; the
        // server's UTC date would be yesterday around midnight there.
        run: (input, context) =>
          call(
            context,
            `/api/report${query({ period: input.period, day: input.day, person: input.person })}`,
          ),
      }),
    ],
  });
}
