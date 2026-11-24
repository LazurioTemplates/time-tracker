import {
  type AgentTools,
  type ModelContextLike,
  type PageViewTool,
  registerAgentTools,
} from "@lazurio/module-kit/webmcp";
import type { Messages } from "../language/messages.ts";
import type { StoredEntry } from "./api.ts";

/**
 * The page's side of the tools for agents (Module Standard, "Agents in the
 * App"). The tools are defined once on the server (`server/agent-tools.ts`)
 * and the page registers exactly those its server lists for the person now,
 * already filtered by role and writer mode; each call goes to the same
 * handler as `/mcp`. The page adds one view tool of its own: it opens an
 * entry's edit dialog and changes nothing.
 */

type Entries = (filter: Record<string, never>) => Promise<{ entries: StoredEntry[] }>;

/** The page's view tool: opens the edit dialog of an entry. */
export function viewTools(options: {
  t: Messages;
  entries: Entries;
  edit: (entry: StoredEntry) => void;
}): PageViewTool[] {
  const { t, entries, edit } = options;
  return [
    {
      name: "prepare_entry_correction",
      description: t.tools.prepare_entry_correction,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const id = (input as { id?: unknown } | null)?.id;
        const { entries: rows } = await entries({});
        const entry = rows.find((row) => row.id === id);
        if (!entry) return { ok: false, reason: "not_found", message: t.server.notFound };
        edit(entry);
        return { ok: true, data: { opened: entry.id } };
      },
    },
  ];
}

/** The page's registration: removes the tools, or asks the server again
 * (after a sign-in or a change of the writer mode). */
export interface InstalledTools {
  readonly remove: () => void;
  readonly refresh: () => void;
}

/**
 * The browser's WebMCP API, or null without it. Chromium's `registerTool`
 * returns a promise that rejects with `AbortError` once the registration's
 * signal aborts, which is how a tool is removed; module-kit 0.6.0 leaves that
 * promise unhandled (Lazurio/module-kit#14), so every removal and refresh
 * would raise an unhandled rejection. The wrapper handles it and keeps the
 * returned handle for a browser that unregisters by a method.
 */
export function pageModelContext(context?: ModelContextLike | null): ModelContextLike | null {
  const scope = globalThis as {
    document?: { modelContext?: ModelContextLike };
    navigator?: { modelContext?: ModelContextLike };
  };
  const real =
    context === undefined
      ? (scope.document?.modelContext ?? scope.navigator?.modelContext ?? null)
      : context;
  if (real === null) return null;
  return {
    registerTool: (tool, options) => {
      const handle = real.registerTool(tool, options);
      const thenable = handle as { then?: unknown; catch?: unknown } | null | undefined;
      if (typeof thenable?.then === "function")
        Promise.resolve(handle as PromiseLike<unknown>).catch(() => {});
      return handle;
    },
  };
}

/** Registers the server's tools and the view tool where the browser offers
 * WebMCP. */
export function installTools(
  views: PageViewTool[],
  options: { modelContext?: ModelContextLike | null; fetch?: typeof fetch } = {},
): InstalledTools {
  let tools: AgentTools | null = null;
  let stopped = false;
  // A failed registration leaves the page without tools for agents; the page
  // works the same.
  const ready = registerAgentTools({
    viewTools: views,
    modelContext: pageModelContext(options.modelContext),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
    .then((registered) => {
      if (stopped) registered.unregister();
      else tools = registered;
    })
    .catch(() => {});
  return {
    remove: () => {
      stopped = true;
      tools?.unregister();
    },
    refresh: () => {
      void ready.then(() => (stopped ? undefined : tools?.refresh())).catch(() => {});
    },
  };
}
