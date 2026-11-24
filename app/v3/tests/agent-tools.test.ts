import { describe, expect, test } from "bun:test";
import { appAccess } from "@lazurio/module-kit";
import type { ToolAuditEvent } from "@lazurio/module-kit/tools";
import {
  type GatewayCaller,
  hostedEnvironment,
  localEnvironment,
  mcpCall,
  mcpTool,
  mcpToolNames,
  pageTool,
  TEST_ORIGIN,
} from "@lazurio/module-kit/tools/testing";
import { createMemoryStore } from "../src/data/memory-store.ts";
import type { TimeStore } from "../src/data/store.ts";
import { DEMO_PEOPLE } from "../src/demo/sample.ts";
import { NOBODY, type Viewer } from "../src/domain/access.ts";
import { createAgentTools } from "../src/server/agent-tools.ts";
import { createApi } from "../src/server/api.ts";
import { type ServeOptions, toolSelf } from "../src/server/serve.ts";
import { LISTENER, mayWriteOf } from "../src/server/viewer.ts";
import { ALEX, JAMIE, NOW, POLICY, sampleData } from "./support/seed.ts";

const READ_TOOLS = ["find_time_entries", "get_app_context", "get_time_report", "list_projects"];
const WRITE_TOOLS = ["add_time_entry", "start_timer", "stop_timer", "update_time_entry"];

/** The App's API and its tools over the example in memory, as the
 * Application host runs them: the gateway states who came. `demo` wires them
 * as `bun run dev:demo` does: no gateway, a fictional person for the API.
 * `wrapStore` and `wrapApi` let a test step between the tool and the data. */
function setup(
  writer: boolean,
  options: {
    now?: number;
    demo?: ServeOptions["viewer"];
    wrapStore?: (store: TimeStore) => TimeStore;
    wrapApi?: (
      api: (request: Request) => Promise<Response>,
    ) => (request: Request) => Promise<Response>;
  } = {},
) {
  const audits: ToolAuditEvent[] = [];
  const now = options.now ?? NOW;
  const env = options.demo
    ? localEnvironment(LISTENER)
    : hostedEnvironment({ writer, listener: LISTENER });
  const store = createMemoryStore(sampleData(), { policy: POLICY, now: () => now });
  const gatewayViewer = (request: Request): { viewer: Viewer; entry: "app" } => {
    const access = appAccess(request, LISTENER, env);
    const person = access.person
      ? { subject: access.person.subject, username: access.person.username }
      : null;
    if (access.appRole === "admin") return { viewer: { role: "admin", person }, entry: "app" };
    if (access.appRole === "user" && person)
      return { viewer: { role: "user", person }, entry: "app" };
    return { viewer: NOBODY, entry: "app" };
  };
  const api = createApi(options.wrapStore ? options.wrapStore(store) : store, {
    allowedOrigins: new Set([TEST_ORIGIN]),
    viewer: options.demo ?? gatewayViewer,
    mayWrite: options.demo ? () => true : (request) => mayWriteOf(request, env),
    policy: POLICY,
    organization: "Example",
    language: "en",
    now: () => now,
  });
  const tools = createAgentTools({
    api: options.wrapApi ? options.wrapApi(api) : api,
    origin: TEST_ORIGIN,
    language: "en",
    env,
    audit: (event) => audits.push(event),
    ...toolSelf(options.demo),
  });
  return { store, tools, audits };
}

/** One tool call on either transport, answered as `{ ok, data }` or the refusal. */
type Transport = (
  tools: ReturnType<typeof setup>["tools"],
  name: string,
  input: unknown,
  caller?: GatewayCaller,
) => Promise<Record<string, unknown>>;

const TRANSPORTS: Array<[string, Transport]> = [
  [
    "mcp",
    async (tools, name, input, caller) => {
      const { isError, structured } = await mcpTool(tools, name, input, caller);
      return isError ? structured : { ok: true, data: structured };
    },
  ],
  ["page", async (tools, name, input, caller) => (await pageTool(tools, name, input, caller)).body],
];

/** Jamie's own entry, saved through the tools, to change in a test. */
async function jamiesEntry(call: Transport, tools: ReturnType<typeof setup>["tools"]) {
  const catalog = await call(tools, "list_projects", {}, jamie);
  const project = (catalog.data as { projects: Array<{ id: string }> }).projects[0]?.id ?? "";
  const added = await call(
    tools,
    "add_time_entry",
    { day: "2026-11-05", from: "07:00", to: "07:30", project, note: "Before the stand-up" },
    jamie,
  );
  expect(added.ok).toBe(true);
  const { id, revision } = added.data as { id: string; revision: string };
  return { id, revision, project };
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

  test("in the demo the fictional person's timer starts and stops through the tools", async () => {
    const demo: ServeOptions["viewer"] = () => ({
      viewer: { role: "user", person: DEMO_PEOPLE.user },
      entry: "app",
    });
    const { tools, store } = setup(true, { demo });
    const catalog = await mcpTool(tools, "list_projects", {});
    const project = (catalog.structured as { projects: Array<{ id: string }> }).projects[0]?.id;
    const started = await mcpTool(tools, "start_timer", { project, note: "Demo timer" });
    expect(started.isError).toBe(false);
    const timer = started.structured as { id: string; value: { person: string } };
    expect(timer.value.person).toBe(DEMO_PEOPLE.user.subject);
    const stopped = await mcpTool(tools, "stop_timer", {});
    expect(stopped.isError).toBe(false);
    expect(stopped.structured).toMatchObject({ id: timer.id });
    const saved = (await store.listEntries()).find((row) => row.id === timer.id);
    expect(saved?.value.endedAt).not.toBeNull();
    expect((await mcpTool(tools, "stop_timer", {})).structured).toMatchObject({
      reason: "no_timer",
    });
  });

  for (const [transport, call] of TRANSPORTS) {
    test(`${transport}: a stale revision is refused with the entry's current revision`, async () => {
      const { tools } = setup(true);
      const entry = await jamiesEntry(call, tools);
      const edit = { day: "2026-11-05", from: "07:00", project: entry.project };
      const changed = await call(
        tools,
        "update_time_entry",
        { ...edit, id: entry.id, revision: entry.revision, to: "07:40", note: "Longer" },
        jamie,
      );
      expect(changed.ok).toBe(true);
      const current = (changed.data as { revision: string }).revision;
      const stale = await call(
        tools,
        "update_time_entry",
        { ...edit, id: entry.id, revision: entry.revision, to: "07:45", note: "Stale" },
        jamie,
      );
      expect(stale).toMatchObject({
        ok: false,
        reason: "record_changed",
        current_revision: current,
      });
      const retried = await call(
        tools,
        "update_time_entry",
        { ...edit, id: entry.id, revision: current, to: "07:45", note: "Read again" },
        jamie,
      );
      expect(retried.ok).toBe(true);
    });

    test(`${transport}: after A → B → A the revision of the first A is stale`, async () => {
      const { tools } = setup(true);
      const entry = await jamiesEntry(call, tools);
      const a = {
        id: entry.id,
        day: "2026-11-05",
        from: "07:00",
        to: "07:30",
        project: entry.project,
        note: "Before the stand-up",
      };
      const b = await call(
        tools,
        "update_time_entry",
        { ...a, revision: entry.revision, note: "Changed" },
        jamie,
      );
      expect(b.ok).toBe(true);
      const back = await call(
        tools,
        "update_time_entry",
        { ...a, revision: (b.data as { revision: string }).revision },
        jamie,
      );
      expect(back.ok).toBe(true);
      const current = (back.data as { revision: string }).revision;
      // The clock stands still in the test, so A again is the same content as the first A.
      expect(current).not.toBe(entry.revision);
      const stale = await call(
        tools,
        "update_time_entry",
        { ...a, revision: entry.revision, note: "From the first A" },
        jamie,
      );
      expect(stale).toMatchObject({
        ok: false,
        reason: "record_changed",
        current_revision: current,
      });
    });

    test(`${transport}: a change between the API's read and its save gives the newer revision`, async () => {
      let race = false;
      let meanwhile = "";
      const { tools } = setup(true, {
        // Another person's save lands after the API read the entry and before
        // the API's own save reaches the store.
        wrapStore: (store) => ({
          ...store,
          saveEntry: async (id, value, base, actor) => {
            if (race) {
              race = false;
              const current = (await store.listEntries()).find((row) => row.id === id);
              if (current)
                meanwhile = (
                  await store.saveEntry(
                    id,
                    { ...current.value, note: "Changed meanwhile", updatedBy: ALEX },
                    current.revision,
                    ALEX,
                  )
                ).revision;
            }
            return store.saveEntry(id, value, base, actor);
          },
        }),
      });
      const entry = await jamiesEntry(call, tools);
      race = true;
      const refused = await call(
        tools,
        "update_time_entry",
        {
          id: entry.id,
          revision: entry.revision,
          day: "2026-11-05",
          from: "07:00",
          to: "07:45",
          project: entry.project,
          note: "Mine",
        },
        jamie,
      );
      expect(meanwhile).not.toBe("");
      expect(meanwhile).not.toBe(entry.revision);
      expect(refused).toMatchObject({
        ok: false,
        reason: "record_changed",
        current_revision: meanwhile,
      });
    });
  }

  test("the report without a day counts the App's own day, not the server's UTC date", async () => {
    const urls: URL[] = [];
    // 23:30 UTC on 30 November is already 1 December in Prague.
    const { tools } = setup(true, {
      now: Date.parse("2026-11-30T23:30:00.000Z"),
      wrapApi: (api) => (request) => {
        urls.push(new URL(request.url));
        return api(request);
      },
    });
    for (const [, call] of TRANSPORTS) {
      urls.length = 0;
      const report = await call(tools, "get_time_report", { period: "month" }, jamie);
      expect(report.ok).toBe(true);
      expect(urls.at(-1)?.pathname).toBe("/api/report");
      expect(urls.at(-1)?.searchParams.has("day")).toBe(false);
      expect((report.data as { range: { from: string } }).range.from).toBe("2026-12-01");
    }
  });
});
