import { describe, expect, test } from "bun:test";
import { hostedEnvironment } from "@lazurio/module-kit/tools/testing";
import { messages } from "../src/language/messages.ts";
import { createAgentTools } from "../src/server/agent-tools.ts";
import type { StoredEntry } from "../src/ui/api.ts";
import { viewTools } from "../src/ui/webmcp.ts";

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
