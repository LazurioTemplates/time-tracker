import { describe, expect, test } from "bun:test";
import { appAccess } from "@lazurio/module-kit";
import type { ToolAuditEvent } from "@lazurio/module-kit/tools";
import {
  hostedEnvironment,
  mcpCall,
  mcpTool,
  mcpToolNames,
  pageTool,
  TEST_ORIGIN,
} from "@lazurio/module-kit/tools/testing";
import { createMemoryStore } from "../src/data/memory-store.ts";
import { NOBODY, type Viewer } from "../src/domain/access.ts";
import { createAgentTools } from "../src/server/agent-tools.ts";
import { createApi } from "../src/server/api.ts";
import { LISTENER, mayWriteOf } from "../src/server/viewer.ts";
import { JAMIE, NOW, POLICY, sampleData } from "./support/seed.ts";

const READ_TOOLS = ["find_time_entries", "get_app_context", "get_time_report", "list_projects"];
const WRITE_TOOLS = ["add_time_entry", "start_timer", "stop_timer", "update_time_entry"];

/** The App's API and its tools over the example in memory, as the
 * Application host runs them: the gateway states who came. */
function setup(writer: boolean) {
  const audits: ToolAuditEvent[] = [];
  const env = hostedEnvironment({ writer, listener: LISTENER });
  const store = createMemoryStore(sampleData(), { policy: POLICY, now: () => NOW });
  const viewer = (request: Request): { viewer: Viewer; entry: "app" } => {
    const access = appAccess(request, LISTENER, env);
    const person = access.person
      ? { subject: access.person.subject, username: access.person.username }
      : null;
    if (access.appRole === "admin") return { viewer: { role: "admin", person }, entry: "app" };
    if (access.appRole === "user" && person)
      return { viewer: { role: "user", person }, entry: "app" };
    return { viewer: NOBODY, entry: "app" };
  };
  const api = createApi(store, {
    allowedOrigins: new Set([TEST_ORIGIN]),
    viewer,
    mayWrite: (request) => mayWriteOf(request, env),
    policy: POLICY,
    organization: "Example",
    language: "en",
    now: () => NOW,
  });
  const tools = createAgentTools({
    api,
    origin: TEST_ORIGIN,
    language: "en",
    env,
    audit: (event) => audits.push(event),
  });
  return { store, tools, audits };
}

const jamie = { role: "user", subject: JAMIE } as const;

describe("tools for agents", () => {
  test("an application user sees the reading and the writing tools while the App writes", async () => {
    const { tools } = setup(true);
    expect(await mcpToolNames(tools, jamie)).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
  });

  test("a copy that may not write offers only the reading tools and refuses a write", async () => {
    const { tools } = setup(false);
    expect(await mcpToolNames(tools, jamie)).toEqual(READ_TOOLS);
    const { isError } = await mcpTool(
      tools,
      "add_time_entry",
      { day: "2026-11-06", from: "09:00", to: "10:00", project: "alfa-web" },
      jamie,
    );
    expect(isError).toBe(true);
  });

  test("without a role /mcp and the page refuse with identity_unavailable", async () => {
    const { tools } = setup(true);
    const { status } = await mcpCall(tools, "tools/list", {}, { caller: { role: "none" } });
    expect(status).toBe(403);
    const page = await pageTool(tools, "list_projects", {}, { role: "none" });
    expect(page.status).toBe(403);
    expect(page.body.reason).toBe("identity_unavailable");
  });

  test("an application user finds only their own entries, like in the interface", async () => {
    const { tools } = setup(true);
    const { isError, structured } = await mcpTool(tools, "find_time_entries", {}, jamie);
    expect(isError).toBe(false);
    const entries = (structured as { entries: Array<{ value: { person: string } }> }).entries;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.value.person === JAMIE)).toBe(true);
  });

  test("a tool's change goes through the API, saves the person's entry and is audited by channel", async () => {
    const { tools, store, audits } = setup(true);
    const catalog = await mcpTool(tools, "list_projects", {}, jamie);
    const projects = (catalog.structured as { projects: Array<{ id: string }> }).projects;
    const project = projects[0]?.id;
    expect(project).toBeDefined();
    const { isError, structured } = await mcpTool(
      tools,
      "add_time_entry",
      { day: "2026-11-05", from: "07:00", to: "07:30", project, note: "From an agent" },
      jamie,
    );
    expect(isError).toBe(false);
    const saved = structured as { id: string; value: { person: string; note: string } };
    expect(saved.value).toMatchObject({ person: JAMIE, note: "From an agent" });
    const listed = await store.listEntries();
    expect(listed.some((row) => row.id === saved.id)).toBe(true);
    expect(audits.at(-1)).toMatchObject({ tool: "add_time_entry", channel: "mcp", outcome: "ok" });
  });

  test("the page calls the same tools with its own session", async () => {
    const { tools } = setup(true);
    const { status, body } = await pageTool(tools, "get_time_report", { period: "week" }, jamie);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
