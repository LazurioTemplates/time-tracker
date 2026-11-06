import { describe, expect, test } from "bun:test";
import { createMemoryStore } from "../src/data/memory-store.ts";
import type { Viewer } from "../src/domain/access.ts";
import { createApi } from "../src/server/api.ts";
import { ALEX, JAMIE, NEW_ID, NOW, POLICY, ROBIN, sampleData } from "./support/seed.ts";

const ORIGIN = "http://127.0.0.1:24905";
const admin: Viewer = { role: "admin", person: { subject: ALEX, username: "alexmorgan" } };
const user: Viewer = { role: "user", person: { subject: JAMIE, username: "jamiechen" } };
const local: Viewer = { role: "admin", person: null };
const nobody: Viewer = { role: null, person: null };

/** The API over the example in memory, with the viewer each request names. */
function setup() {
  const store = createMemoryStore(sampleData(), { policy: POLICY, now: () => NOW });
  const viewers = new Map<string, Viewer>([
    ["admin", admin],
    ["user", user],
    ["local", local],
    ["nobody", nobody],
  ]);
  const api = createApi(store, {
    allowedOrigins: new Set([ORIGIN]),
    viewer: (request) => ({
      viewer: viewers.get(request.headers.get("x-test-viewer") ?? "") ?? nobody,
      entry: "app",
    }),
    policy: POLICY,
    organization: "Example",
    language: "cs",
    now: () => NOW,
  });
  const call = async (as: string, method: string, path: string, body?: unknown) => {
    const response = await api(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: {
          "x-test-viewer": as,
          ...(body === undefined ? {} : { "content-type": "application/json", origin: ORIGIN }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    const text = await response.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {}
    return {
      status: response.status,
      data: data as Record<string, unknown> & {
        entries?: { id: string; revision: string; value: { person: string } }[];
      },
      text,
      headers: response.headers,
    };
  };
  return { store, call };
}

describe("who may do what", () => {
  test("without a role only the session answers", async () => {
    const { call } = setup();
    const session = await call("nobody", "GET", "/api/session");
    expect(session.status).toBe(200);
    expect((session.data.viewer as { role: unknown }).role).toBeNull();
    for (const path of ["/api/entries", "/api/catalog", "/api/report", "/api/export", "/api/draft"])
      expect((await call("nobody", "GET", path)).status).toBe(403);
  });

  test("an application user sees and exports only their own entries", async () => {
    const { call } = setup();
    const own = await call("user", "GET", "/api/entries");
    expect(own.data.entries?.length).toBeGreaterThan(0);
    expect(own.data.entries?.every((row) => row.value.person === JAMIE)).toBe(true);
    const asked = await call("user", "GET", `/api/entries?person=${ALEX}`);
    expect(asked.data.entries).toEqual([]);
    const csv = await call("user", "GET", "/api/export?from=2026-10-01&to=2026-11-30");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("jamiechen");
    expect(csv.text).not.toContain("alexmorgan");
    expect(csv.text).not.toContain("robinlee");
    const report = await call(
      "user",
      "GET",
      `/api/report?period=month&day=2026-11-02&person=${ROBIN}`,
    );
    const people = (report.data.summary as { people: { person: string }[] }).people;
    expect(people.map((row) => row.person)).toEqual([JAMIE]);
    expect((await call("user", "GET", "/api/people")).data.people).toEqual([
      { person: JAMIE, name: "jamiechen" },
    ]);
  });

  test("an application user changes only their own entries", async () => {
    const { call } = setup();
    const all = await call("admin", "GET", "/api/entries");
    const alexEntry = all.data.entries?.find((row) => row.value.person === ALEX);
    if (!alexEntry) throw new Error("no entry of Alex");
    const edit = {
      revision: alexEntry.revision,
      project: "novy-web",
      day: "2026-11-02",
      from: "09:30",
      to: "12:00",
      note: "Cizí úprava",
    };
    expect((await call("user", "PUT", `/api/entries/${alexEntry.id}`, edit)).status).toBe(404);
    expect(
      (
        await call("user", "DELETE", `/api/entries/${alexEntry.id}`, {
          revision: alexEntry.revision,
        })
      ).status,
    ).toBe(404);
    const forOthers = await call("user", "POST", "/api/entries", {
      id: NEW_ID,
      person: ALEX,
      project: "novy-web",
      day: "2026-11-06",
      from: "16:00",
      to: "16:30",
      note: "",
    });
    expect(forOthers.status).toBe(403);
    const own = await call("user", "POST", "/api/entries", {
      id: NEW_ID,
      project: "jarni-kampan",
      day: "2026-11-06",
      from: "14:30",
      to: "15:30",
      note: "Odpolední úpravy",
    });
    expect(own.status).toBe(201);
    expect((own.data.value as { person: string; personName: string }).person).toBe(JAMIE);
  });

  test("projects, clients and the draft are the application admin's", async () => {
    const { call } = setup();
    expect(
      (await call("user", "POST", "/api/projects", { name: "X", client: null, billable: false }))
        .status,
    ).toBe(403);
    expect((await call("user", "POST", "/api/clients", { name: "X" })).status).toBe(403);
    expect((await call("user", "GET", "/api/draft")).status).toBe(403);
    expect((await call("user", "GET", "/api/check")).status).toBe(403);
    expect(
      (await call("user", "POST", "/api/draft/publish", { expectedRevision: "x" })).status,
    ).toBe(403);
    const project = await call("admin", "POST", "/api/projects", {
      name: "Nový e-shop",
      client: "example-bistro",
      billable: true,
    });
    expect(project.status).toBe(201);
    expect(project.data.id).toBe("novy-e-shop");
    const draft = await call("admin", "GET", "/api/draft");
    expect((draft.data.records as unknown[]).length).toBe(1);
  });

  test("an application admin corrects anyone's entry and writes time for a known person", async () => {
    const { call } = setup();
    const all = await call(
      "admin",
      "GET",
      `/api/entries?person=${ROBIN}&from=2026-11-03&to=2026-11-03`,
    );
    const forgotten = all.data.entries?.find(
      (row) => (row.value as unknown as { autoStoppedAt: string | null }).autoStoppedAt,
    );
    if (!forgotten) throw new Error("no forgotten timer in the example");
    const fixed = await call("admin", "PUT", `/api/entries/${forgotten.id}`, {
      revision: forgotten.revision,
      project: "aplikace-pro-rozvoz",
      day: "2026-11-03",
      from: "12:30",
      to: "16:30",
      note: "Testy na telefonech",
    });
    expect(fixed.status).toBe(200);
    const value = fixed.data.value as {
      autoStoppedAt: string | null;
      endedAt: string;
      updatedBy: string;
      personName: string;
    };
    expect(value.endedAt).toBe("2026-11-03T15:30:00.000Z");
    // The automatic stop stays in the history after the correction.
    expect(value.autoStoppedAt).not.toBeNull();
    expect(value.updatedBy).toBe(ALEX);
    expect(value.personName).toBe("robinlee");
    const written = await call("admin", "POST", "/api/entries", {
      id: NEW_ID,
      person: ROBIN,
      project: "interni-provoz",
      day: "2026-11-06",
      from: "13:00",
      to: "14:00",
      note: "Porada",
    });
    expect(written.status).toBe(201);
    expect((written.data.value as { personName: string }).personName).toBe("robinlee");
    const unknownPerson = await call("admin", "POST", "/api/entries", {
      id: "f0000000-0000-4000-8000-000000000009",
      person: "44444444-4444-4444-8444-444444444444",
      project: "interni-provoz",
      day: "2026-11-06",
      from: "13:00",
      to: "14:00",
      note: "",
    });
    expect(unknownPerson.status).toBe(422);
  });

  test("from inside the Environment there is no own timer, only time for a named person", async () => {
    const { call } = setup();
    expect(
      (
        await call("local", "POST", "/api/timer/start", {
          id: NEW_ID,
          project: "novy-web",
          note: "",
        })
      ).status,
    ).toBe(400);
    const nobodyNamed = await call("local", "POST", "/api/entries", {
      id: NEW_ID,
      project: "novy-web",
      day: "2026-11-06",
      from: "13:00",
      to: "14:00",
      note: "",
    });
    expect(nobodyNamed.status).toBe(400);
    expect(nobodyNamed.data.code).toBe("person_required");
    const named = await call("local", "POST", "/api/entries", {
      id: NEW_ID,
      person: JAMIE,
      project: "jarni-kampan",
      day: "2026-11-06",
      from: "13:00",
      to: "14:00",
      note: "Zapsal agent podle popisu",
    });
    expect(named.status).toBe(201);
    expect((named.data.value as { updatedBy: string | null }).updatedBy).toBeNull();
  });
});

describe("the timer", () => {
  test("starts, refuses a second one and stops", async () => {
    const { call } = setup();
    const started = await call("user", "POST", "/api/timer/start", {
      id: NEW_ID,
      project: "jarni-kampan",
      note: "Texty",
    });
    expect(started.status).toBe(201);
    const second = await call("user", "POST", "/api/timer/start", {
      id: "f0000000-0000-4000-8000-000000000002",
      project: "novy-web",
      note: "",
    });
    expect(second.status).toBe(409);
    expect(second.data.code).toBe("timer_running");
    const stopped = await call("user", "POST", "/api/timer/stop", {
      id: NEW_ID,
      revision: started.data.revision,
    });
    expect(stopped.status).toBe(200);
    expect((stopped.data.value as { endedAt: string }).endedAt).toBe(new Date(NOW).toISOString());
  });
});

describe("requests", () => {
  test("a write comes only as JSON from the App's own origin", async () => {
    const { call } = setup();
    const response = await call("admin", "POST", "/api/clients", { name: "X" });
    expect(response.status).toBe(201);
    const { store } = setup();
    const api = createApi(store, {
      allowedOrigins: new Set([ORIGIN]),
      viewer: () => ({ viewer: admin, entry: "app" }),
      policy: POLICY,
      organization: "Example",
      language: "cs",
    });
    const foreign = await api(
      new Request(`${ORIGIN}/api/clients`, {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
    );
    expect(foreign.status).toBe(403);
    const form = await api(
      new Request(`${ORIGIN}/api/clients`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "text/plain" },
        body: JSON.stringify({ name: "X" }),
      }),
    );
    expect(form.status).toBe(415);
  });

  test("the summary export is a CSV attachment", async () => {
    const { call } = setup();
    const response = await call(
      "admin",
      "GET",
      "/api/export?kind=summary&from=2026-11-02&to=2026-11-08",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "souhrn-hodin-2026-11-02-2026-11-08.csv",
    );
    expect(response.text).toContain('"Example Bistro";"Nový web"');
  });
});
