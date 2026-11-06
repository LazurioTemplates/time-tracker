import type { Messages } from "../language/messages.ts";
import { ApiError, type api as browserApi, newId, type StoredEntry } from "./api.ts";

/**
 * The App's main actions as WebMCP tools (Module Standard, "Tools for
 * agents"): an agent in the Environment browser lists and calls them instead
 * of clicking. Every tool calls the same API as the interface, with the
 * page's own session, so the server checks it like a click. No tool publishes
 * or deletes: publishing is the Draft page's button and deleting is the edit
 * dialog's, both pressed by the person.
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

type Api = Pick<
  typeof browserApi,
  "entries" | "catalog" | "start" | "stop" | "addEntry" | "saveEntry" | "report"
>;

const day = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const clock = { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" };
const text = (max: number) => ({ type: "string", maxLength: max });
const object = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (value: unknown) => (typeof value === "string" ? value : undefined);

/** A refusal is an answer with its reason, never a thrown page error. */
async function answer(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return { ok: true, result: await run() };
  } catch (error) {
    return error instanceof ApiError
      ? { ok: false, code: error.code, message: error.message }
      : { ok: false, code: "unexpected", message: String(error) };
  }
}

export function timeTrackerTools(options: {
  t: Messages;
  api: Api;
  /** The current person's subject, when Lazurio named one. */
  self: string | null;
  /** Opens the edit dialog of an entry. */
  edit: (entry: StoredEntry) => void;
  changed: () => Promise<void>;
}): Tool[] {
  const { t, api, self, edit, changed } = options;
  const write = async <T>(run: () => Promise<T>) => {
    const result = await run();
    await changed();
    return result;
  };
  return [
    {
      name: "find_time_entries",
      description: t.tools.find_time_entries,
      inputSchema: object({
        from: day,
        to: day,
        person: { type: "string" },
        client: { type: "string" },
        project: { type: "string" },
      }),
      execute: (input) =>
        answer(
          async () =>
            (
              await api.entries({
                from: str(input.from) ?? null,
                to: str(input.to) ?? null,
                person: str(input.person) ?? null,
                client: str(input.client) ?? null,
                project: str(input.project) ?? null,
              })
            ).entries,
        ),
    },
    {
      name: "list_projects",
      description: t.tools.list_projects,
      inputSchema: object({}),
      execute: () => answer(() => api.catalog()),
    },
    {
      name: "start_timer",
      description: t.tools.start_timer,
      inputSchema: object({ project: { type: "string" }, note: text(500) }, ["project"]),
      execute: (input) =>
        answer(() =>
          write(() =>
            api.start({
              id: newId(),
              project: str(input.project) ?? "",
              note: str(input.note) ?? "",
            }),
          ),
        ),
    },
    {
      name: "stop_timer",
      description: t.tools.stop_timer,
      inputSchema: object({}),
      execute: () =>
        answer(async () => {
          const { entries } = await api.entries({ person: self });
          const running = entries.find(
            (row) => row.value.person === self && row.value.endedAt === null,
          );
          if (!running) throw new ApiError("no_timer", t.server.alreadyStopped, 409);
          return write(() => api.stop(running.id, running.revision));
        }),
    },
    {
      name: "add_time_entry",
      description: t.tools.add_time_entry,
      inputSchema: object(
        {
          day,
          from: clock,
          to: clock,
          project: { type: "string" },
          note: text(500),
          person: { type: "string" },
        },
        ["day", "from", "to", "project"],
      ),
      execute: (input) =>
        answer(() =>
          write(() =>
            api.addEntry({
              id: newId(),
              ...(str(input.person) ? { person: str(input.person) as string } : {}),
              day: str(input.day) ?? "",
              from: str(input.from) ?? "",
              to: str(input.to) ?? "",
              project: str(input.project) ?? "",
              note: str(input.note) ?? "",
            }),
          ),
        ),
    },
    {
      name: "update_time_entry",
      description: t.tools.update_time_entry,
      inputSchema: object(
        {
          id: { type: "string" },
          revision: { type: "string" },
          day,
          from: clock,
          to: { anyOf: [clock, { type: "null" }] },
          project: { type: "string" },
          note: text(500),
        },
        ["id", "revision", "day", "from", "to", "project"],
      ),
      execute: (input) =>
        answer(() =>
          write(() =>
            api.saveEntry(str(input.id) ?? "", {
              revision: str(input.revision) ?? "",
              day: str(input.day) ?? "",
              from: str(input.from) ?? "",
              to: str(input.to) ?? null,
              project: str(input.project) ?? "",
              note: str(input.note) ?? "",
            }),
          ),
        ),
    },
    {
      name: "get_time_report",
      description: t.tools.get_time_report,
      inputSchema: object(
        { period: { type: "string", enum: ["week", "month"] }, day, person: { type: "string" } },
        ["period"],
      ),
      execute: (input) =>
        answer(() =>
          api.report(
            input.period === "month" ? "month" : "week",
            str(input.day) ?? new Date().toISOString().slice(0, 10),
            str(input.person) ?? null,
          ),
        ),
    },
    {
      name: "prepare_entry_correction",
      description: t.tools.prepare_entry_correction,
      inputSchema: object({ id: { type: "string" } }, ["id"]),
      execute: (input) =>
        answer(async () => {
          const { entries } = await api.entries({});
          const entry = entries.find((row) => row.id === input.id);
          if (!entry) throw new ApiError("not_found", t.server.notFound, 404);
          edit(entry);
          return { opened: entry.id };
        }),
    },
  ];
}

type ModelContext = {
  registerTool(tool: Tool): void;
  unregisterTool(name: string): void;
};

/** Registers the tools where the browser offers WebMCP; returns the cleanup. */
export function installTools(tools: Tool[]): () => void {
  const context =
    (document as Document & { modelContext?: ModelContext }).modelContext ??
    (navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  if (!context) return () => {};
  for (const tool of tools) context.registerTool(tool);
  return () => {
    for (const tool of tools) context.unregisterTool(tool.name);
  };
}
