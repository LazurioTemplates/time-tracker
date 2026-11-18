import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { TEST_ORIGIN } from "@lazurio/module-kit/tools/testing";
import { createRepositoryDbStore } from "../src/data/repository-db-store.ts";
import { CHANNEL_HEADER, createApi } from "../src/server/api.ts";
import { createFixtureRepo, git } from "./support/fixture-repo.ts";
import { NOW, POLICY } from "./support/seed.ts";

// Real Git and the data repository's validator run here; see repository-db-store.test.ts.
setDefaultTimeout(60_000);

/**
 * Author and channel (Module Standard, One data port): every change records
 * the person's subject and the channel it came by, in the draft and when it
 * is published.
 */
function setup(subject: string) {
  const fixture = createFixtureRepo({ sample: true });
  const store = createRepositoryDbStore({
    mountRoot: fixture.mountRoot,
    expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
    intervalMs: 0,
    policy: POLICY,
    now: () => NOW,
  });
  const handle = createApi(store, {
    allowedOrigins: new Set([TEST_ORIGIN]),
    viewer: () => ({
      viewer: { role: "admin", person: { subject, username: "alexmorgan" } },
      entry: "app",
    }),
    mayWrite: () => true,
    policy: POLICY,
    organization: "Example",
    language: "en",
    now: () => NOW,
  });
  const call = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    handle(
      new Request(`${TEST_ORIGIN}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_ORIGIN, ...headers },
        body: JSON.stringify(body),
      }),
    );
  const origins = async () =>
    ((await store.draft()).records ?? []).map((record) => record.resource.changes[0]?.origin);
  return { fixture, store, call, origins };
}

describe("author and channel", () => {
  test("a change from the interface records the person and the channel ui", async () => {
    const { fixture, store, call, origins } = setup("subject-1");
    try {
      expect((await call("/api/clients", { name: "Alfa" })).status).toBe(201);
      expect(await origins()).toEqual([
        expect.objectContaining({ kind: "app", actor: "subject-1", source: "time-tracker-v3/ui" }),
      ]);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a page tool's change is recorded as an agent's, channel webmcp", async () => {
    const { fixture, store, call, origins } = setup("subject-1");
    try {
      const response = await call("/api/clients", { name: "Beta" }, { [CHANNEL_HEADER]: "webmcp" });
      expect(response.status).toBe(201);
      expect(await origins()).toEqual([
        expect.objectContaining({
          kind: "agent",
          actor: "subject-1",
          source: "time-tracker-v3/webmcp",
        }),
      ]);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a publication records who published and by which channel", async () => {
    const { fixture, store, call } = setup("subject-2");
    try {
      expect((await call("/api/clients", { name: "Gama" })).status).toBe(201);
      const card = await store.draft();
      expect((await call("/api/draft/publish", { expectedRevision: card.revision })).status).toBe(
        200,
      );
      const trailers = git(fixture.originPath, ["log", "-1", "--format=%(trailers:only)", "v3"]);
      expect(trailers).toContain("Repository-Db-Actor: subject-2");
      expect(trailers).toContain("Repository-Db-Source: time-tracker-v3/ui");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a failure to record the origin never fails the saved write", async () => {
    const { fixture, store, call } = setup("subject-3");
    try {
      // The origin hint cannot be written: a directory stands where its file goes.
      mkdirSync(join(fixture.mountRoot, ".repository-db", "draft-origin.json"), {
        recursive: true,
      });
      expect((await call("/api/clients", { name: "Delta" })).status).toBe(201);
      expect((await store.listClients()).some((row) => row.value.name === "Delta")).toBe(true);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });
});
