import { describe, expect, test } from "bun:test";
import { messages } from "../src/language/messages.ts";
import type { api } from "../src/ui/api.ts";
import { timeTrackerTools } from "../src/ui/webmcp.ts";

type Api = Parameters<typeof timeTrackerTools>[0]["api"];

/** An API that records which call each tool makes, like the interface's buttons do. */
function recording() {
  const calls: string[] = [];
  const entry = {
    id: "f0000000-0000-4000-8000-000000000001",
    revision: "sha256:x",
    pending: true,
    value: { person: "me", endedAt: null },
  };
  const fake = {
    entries: async () => {
      calls.push("entries");
      return { now: 0, entries: [entry] };
    },
    catalog: async () => {
      calls.push("catalog");
      return { clients: [], projects: [] };
    },
    start: async () => {
      calls.push("start");
      return entry;
    },
    stop: async (id: string, revision: string) => {
      calls.push(`stop ${id} ${revision}`);
      return entry;
    },
    addEntry: async () => {
      calls.push("addEntry");
      return entry;
    },
    saveEntry: async () => {
      calls.push("saveEntry");
      return entry;
    },
    report: async () => {
      calls.push("report");
      return {};
    },
  } as unknown as Api;
  return { calls, fake };
}

describe("WebMCP tools", () => {
  test("name the App's main actions, verb first, with JSON Schema inputs, and publish nothing", () => {
    const { fake } = recording();
    const tools = timeTrackerTools({
      t: messages.cs,
      api: fake,
      self: "me",
      edit: () => {},
      changed: async () => {},
    });
    expect(tools.map((tool) => tool.name)).toEqual([
      "find_time_entries",
      "list_projects",
      "start_timer",
      "stop_timer",
      "add_time_entry",
      "update_time_entry",
      "get_time_report",
      "prepare_entry_correction",
    ]);
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z]+(?:_[a-z]+)+$/);
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.description).toBe(messages.cs.tools[tool.name as keyof typeof messages.cs.tools]);
    }
    expect(tools.some((tool) => /publish|delete|remove/.test(tool.name))).toBe(false);
    const english = timeTrackerTools({
      t: messages.en,
      api: fake,
      self: "me",
      edit: () => {},
      changed: async () => {},
    });
    expect(english[0]?.description).toBe(messages.en.tools.find_time_entries);
  });

  test("go through the same API calls as the buttons", async () => {
    const { calls, fake } = recording();
    let opened = "";
    let refreshed = 0;
    const tools = timeTrackerTools({
      t: messages.en,
      api: fake,
      self: "me",
      edit: (entry) => {
        opened = entry.id;
      },
      changed: async () => {
        refreshed += 1;
      },
    });
    const run = (name: string, input: Record<string, unknown> = {}) =>
      tools.find((tool) => tool.name === name)?.execute(input);
    await run("start_timer", { project: "new-website" });
    await run("stop_timer");
    await run("add_time_entry", {
      day: "2026-11-06",
      from: "09:00",
      to: "10:00",
      project: "new-website",
    });
    await run("prepare_entry_correction", { id: "f0000000-0000-4000-8000-000000000001" });
    expect(calls).toEqual([
      "start",
      "entries",
      "stop f0000000-0000-4000-8000-000000000001 sha256:x",
      "addEntry",
      "entries",
    ]);
    expect(opened).toBe("f0000000-0000-4000-8000-000000000001");
    expect(refreshed).toBe(3);
    const missing = (await run("prepare_entry_correction", { id: "nothing" })) as {
      ok: boolean;
      code: string;
    };
    expect(missing).toMatchObject({ ok: false, code: "not_found" });
  });
});

void (null as unknown as typeof api);
