import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { hostedEnvironment } from "@lazurio/module-kit/tools/testing";
import type { ModelContextLike, WebMcpTool } from "@lazurio/module-kit/webmcp";
import { messages } from "../src/language/messages.ts";
import { createAgentTools } from "../src/server/agent-tools.ts";
import type { StoredEntry } from "../src/ui/api.ts";
import { installTools, viewTools } from "../src/ui/webmcp.ts";

const ENTRY = {
  id: "f0000000-0000-4000-8000-000000000001",
  revision: "sha256:x",
  pending: true,
  value: { person: "me", endedAt: null },
} as unknown as StoredEntry;

describe("tools for agents: names and the page's view tool", () => {
  test("the server's tools are named verb first, take JSON Schema inputs, speak the App's language and publish nothing", () => {
    for (const language of ["cs", "en"] as const) {
      const registry = createAgentTools({
        api: async () => Response.json({}),
        origin: "http://127.0.0.1:24905",
        language,
        env: hostedEnvironment({ writer: true }),
        audit: () => {},
      });
      const tools = registry.list({
        entry: "app",
        appRole: "admin",
        person: { subject: "me", username: "me" },
        source: "gateway",
        reason: null,
      } as unknown as Parameters<typeof registry.list>[0]);
      const own = tools.filter((tool) => tool.name !== "get_app_context");
      expect(own.map((tool) => tool.name)).toEqual([
        "find_time_entries",
        "list_projects",
        "start_timer",
        "stop_timer",
        "add_time_entry",
        "update_time_entry",
        "get_time_report",
      ]);
      for (const tool of own) {
        expect(tool.name).toMatch(/^[a-z]+(?:_[a-z]+)+$/);
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.description).toBe(
          messages[language].tools[tool.name as keyof (typeof messages)["cs"]["tools"]],
        );
        expect(tool.effect).not.toBe("publish");
      }
    }
  });

  test("the page's view tool opens the edit dialog and changes nothing", async () => {
    let opened = "";
    const [tool] = viewTools({
      t: messages.en,
      entries: async () => ({ entries: [ENTRY] }),
      edit: (entry) => {
        opened = entry.id;
      },
    });
    expect(tool?.name).toBe("prepare_entry_correction");
    expect(await tool?.execute({ id: ENTRY.id })).toEqual({ ok: true, data: { opened: ENTRY.id } });
    expect(opened).toBe(ENTRY.id);
    expect(await tool?.execute({ id: "missing" })).toMatchObject({
      ok: false,
      reason: "not_found",
    });
  });
});

/** Chromium's WebMCP: `registerTool` answers a promise that rejects with
 * `AbortError` once the registration's signal aborts. */
function chromiumModelContext() {
  const active = new Set<string>();
  let registrations = 0;
  const context: ModelContextLike = {
    registerTool: (tool: WebMcpTool, options) => {
      registrations += 1;
      active.add(tool.name);
      return new Promise<void>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          active.delete(tool.name);
          reject(new DOMException("The registration was aborted.", "AbortError"));
        });
      });
    },
  };
  return {
    context,
    active,
    get registrations() {
      return registrations;
    },
  };
}

const SERVER_TOOLS = {
  tools: [
    {
      name: "list_projects",
      description: "Lists the projects.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
  ],
};

const serverFetch = (async () => Response.json(SERVER_TOOLS)) as unknown as typeof fetch;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the page's registration in a browser with WebMCP", () => {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  beforeEach(() => {
    rejections.length = 0;
    process.on("unhandledRejection", onRejection);
  });
  afterEach(() => {
    process.off("unhandledRejection", onRejection);
  });

  test("removing and refreshing the tools leaves no unhandled AbortError and registers them again", async () => {
    const browser = chromiumModelContext();
    const views = viewTools({
      t: messages.en,
      entries: async () => ({ entries: [] }),
      edit: () => {},
    });
    const installed = installTools(views, { modelContext: browser.context, fetch: serverFetch });
    await settle();
    expect([...browser.active].sort()).toEqual(["list_projects", "prepare_entry_correction"]);

    installed.refresh();
    await settle();
    expect([...browser.active].sort()).toEqual(["list_projects", "prepare_entry_correction"]);
    expect(browser.registrations).toBe(4);

    installed.remove();
    await settle();
    expect(browser.active.size).toBe(0);
    installed.refresh();
    await settle();
    expect(browser.active.size).toBe(0);
    expect(rejections).toEqual([]);
  });

  test("a registration that fails leaves the page without tools and without an unhandled rejection", async () => {
    const broken: ModelContextLike = {
      registerTool: () => {
        throw new Error("WebMCP is unavailable.");
      },
    };
    const installed = installTools([], { modelContext: broken, fetch: serverFetch });
    await settle();
    installed.refresh();
    installed.remove();
    await settle();
    expect(rejections).toEqual([]);
  });
});
