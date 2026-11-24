import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gatewayRequest, TEST_ORIGIN } from "@lazurio/module-kit/tools/testing";
import { parseYaml, toStableYaml } from "@lazurio/repository-db";
import { createRepositoryDbStore } from "../src/data/repository-db-store.ts";
import { createApi } from "../src/server/api.ts";
import { copyWrites } from "../src/server/viewer.ts";
import { storeContract } from "./store-contract.ts";
import {
  colleagueClone,
  createFixtureRepo,
  type FixtureRepo,
  git,
} from "./support/fixture-repo.ts";
import { NEW_ID, NOW, newEntry, POLICY } from "./support/seed.ts";

// These tests run real Git and the data repository's validator for every
// publish. On a Windows runner one publish takes several seconds, more than
// bun's default of 5 s per test, so they get a minute.
setDefaultTimeout(60_000);

const open = (fixture: FixtureRepo, remote = fixture.origin, writes = true) =>
  createRepositoryDbStore({
    mountRoot: fixture.mountRoot,
    expect: { remote, branch: "v3", within: fixture.moduleRoot },
    intervalMs: 0,
    writes,
    policy: POLICY,
    now: () => NOW,
  });

storeContract("repository-db", async () => {
  const fixture = createFixtureRepo({ sample: true });
  return { store: open(fixture), cleanup: fixture.cleanup };
});

describe("repository-db store", () => {
  test("writes the collection layout and publishes one validated commit", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture);
    try {
      await store.saveEntry(NEW_ID, newEntry(), null);
      const path = `data/entries/${NEW_ID}.yaml`;
      expect(existsSync(join(fixture.mountRoot, path))).toBe(true);
      expect(readFileSync(join(fixture.mountRoot, path), "utf8")).toContain(
        "schemaVersion: time-tracker.entry.v1",
      );
      const card = await store.draft();
      expect(card.records?.[0]?.technicalPath).toBe(path);
      expect(card.records?.[0]?.resource.routeTarget?.href).toBe("#/entries");
      await store.publish({ expectedRevision: card.revision ?? "", summary: "Friday afternoon" });
      const log = git(fixture.originPath, ["log", "-1", "--format=%s%n%(trailers:only)", "v3"]);
      expect(log).toContain("Friday afternoon");
      expect(log).toContain("Repository-Db-Source: time-tracker-v3");
      expect(git(fixture.originPath, ["rev-list", "--count", "v3"])).toBe("2");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("every save stores a new write revision, and a direct change that kept it is a change", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture);
    try {
      const file = join(fixture.mountRoot, `data/entries/${NEW_ID}.yaml`);
      const written = () =>
        parseYaml(readFileSync(file, "utf8")) as { record: Record<string, unknown> };
      const first = await store.saveEntry(NEW_ID, newEntry(), null);
      const firstWrite = written().record.revision;
      expect(firstWrite).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      const second = await store.saveEntry(NEW_ID, newEntry(), first.revision);
      expect(written().record.revision).not.toBe(firstWrite);
      expect(second.revision).not.toBe(first.revision);
      // Someone edits the YAML by hand and keeps the write revision as it was.
      const document = written();
      writeFileSync(
        file,
        toStableYaml({ ...document, record: { ...document.record, note: "Ručně" } }),
      );
      expect(written().record.revision).toBe(document.record.revision);
      const read = await store.getEntry(NEW_ID);
      expect(read?.value.note).toBe("Ručně");
      expect(read?.revision).not.toBe(second.revision);
      await expect(
        store.saveEntry(NEW_ID, newEntry({ note: "Moje" }), second.revision),
      ).rejects.toMatchObject({ code: "record_changed" });
      expect(written().record.note).toBe("Ručně");
      // The data repository's validator takes the write revision.
      const card = await store.draft();
      expect(
        card.records?.[0]?.resource.changes[0]?.fields.map((field) => field.fieldPath),
      ).not.toContain("/revision");
      await store.publish({ expectedRevision: card.revision ?? "" });
      expect(git(fixture.originPath, ["rev-list", "--count", "v3"])).toBe("2");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a colleague's change of another field of the same client merges", async () => {
    const fixture = createFixtureRepo({ sample: true });
    // A clock that moves, as it does between two saves.
    let clock = NOW;
    const store = createRepositoryDbStore({
      mountRoot: fixture.mountRoot,
      expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
      intervalMs: 0,
      policy: POLICY,
      now: () => (clock += 60_000),
    });
    try {
      // Both start from a client the App wrote, with its audit bundle.
      const opened = (await store.listClients()).find((row) => row.id === "example-bistro");
      if (!opened) throw new Error("example-bistro missing");
      const base = await store.saveClient(
        opened.id,
        { ...opened.value, name: "Bistro B" },
        opened.revision,
      );
      let card = await store.draft();
      await store.publish({ expectedRevision: card.revision ?? "" });

      // A colleague's App archives the client and publishes first.
      const colleague = colleagueClone(fixture);
      const theirs = join(colleague, "data/clients/example-bistro.yaml");
      const document = parseYaml(readFileSync(theirs, "utf8")) as {
        record: Record<string, unknown>;
      };
      writeFileSync(
        theirs,
        toStableYaml({
          ...document,
          record: {
            ...document.record,
            archived: true,
            revision: crypto.randomUUID(),
            updatedAt: new Date(clock + 30_000).toISOString(),
            updatedBy: null,
          },
        }),
      );
      git(colleague, ["commit", "--quiet", "--all", "--message", "Archive the bistro"]);
      git(colleague, ["push", "--quiet"]);

      // Here the name changes; the publish takes the colleague's work along.
      const mine = await store.saveClient(
        opened.id,
        { ...base.value, name: "Bistro C" },
        base.revision,
      );
      card = await store.draft();
      await store.publish({ expectedRevision: card.revision ?? "" });
      const merged = (await store.listClients()).find((row) => row.id === "example-bistro");
      expect(merged?.value).toMatchObject({ name: "Bistro C", archived: true });
      expect(merged?.revision).not.toBe(mine.revision);
      const stored = parseYaml(
        readFileSync(join(fixture.mountRoot, "data/clients/example-bistro.yaml"), "utf8"),
      ) as { record: Record<string, unknown> };
      expect(stored.record.revision).toStartWith("merge-");
      expect(stored.record.updatedAt).toBe(mine.value.updatedAt);
      expect((await store.draft()).status?.state).toBe("published");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("refuses a publish the data repository's validator rejects", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture);
    try {
      // An agent wrote a broken record by hand, past the App.
      writeFileSync(
        join(fixture.mountRoot, "data/entries/f0000000-0000-4000-8000-0000000000aa.yaml"),
        toStableYaml({
          schemaVersion: "time-tracker.entry.v1",
          id: "f0000000-0000-4000-8000-0000000000aa",
          record: { project: "novy-web" },
        }),
      );
      expect((await store.check()).length).toBeGreaterThan(0);
      const card = await store.draft();
      let code: string | undefined;
      try {
        await store.publish({ expectedRevision: card.revision ?? "" });
      } catch (error) {
        code = (error as { code?: string }).code;
      }
      expect(code).toBe("validation_failed");
      expect(git(fixture.originPath, ["rev-list", "--count", "v3"])).toBe("1");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("serves only its own data repository", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture, "git@github.com:SomeoneElse/time-tracker-data.git");
    try {
      const available = await store.available();
      expect(available.ok).toBe(false);
      if (!available.ok) expect(available.code).toBe("boundary_violation");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("takes a colleague's published work and says that records changed", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture);
    try {
      const colleague = colleagueClone(fixture);
      const file = join(colleague, "data/projects/novy-web.yaml");
      writeFileSync(file, readFileSync(file, "utf8").replace("name: Nový web", "name: Web bistra"));
      git(colleague, ["commit", "--quiet", "--all", "--message", "Rename the project"]);
      git(colleague, ["push", "--quiet"]);
      const events: string[] = [];
      const stop = store.subscribe((event) => events.push(event.type));
      await store.pull();
      stop();
      expect((await store.listProjects()).find((row) => row.id === "novy-web")?.value.name).toBe(
        "Web bistra",
      );
      expect(events).toContain("records-changed");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("an empty data repository starts empty", async () => {
    const fixture = createFixtureRepo();
    const store = open(fixture);
    try {
      expect(await store.listEntries()).toEqual([]);
      expect(await store.listProjects()).toEqual([]);
      expect(await store.check()).toEqual([]);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a copy that may not write never fetches or pulls, also through read requests", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture, fixture.origin, false);
    try {
      const colleague = colleagueClone(fixture);
      const file = join(colleague, "data/projects/novy-web.yaml");
      writeFileSync(file, readFileSync(file, "utf8").replace("name: Nový web", "name: Web bistra"));
      git(colleague, ["commit", "--quiet", "--all", "--message", "Rename the project"]);
      git(colleague, ["push", "--quiet"]);
      const head = git(fixture.mountRoot, ["rev-parse", "HEAD"]);
      const tracked = git(fixture.mountRoot, ["rev-parse", "origin/v3"]);
      const handle = createApi(store, {
        allowedOrigins: new Set([TEST_ORIGIN]),
        viewer: () => ({ viewer: { role: "admin", person: null }, entry: "app" }),
        mayWrite: () => false,
        policy: POLICY,
        organization: "Example",
        language: "en",
        now: () => NOW,
      });
      for (const path of [
        "/api/session",
        "/api/draft",
        "/api/check",
        "/api/catalog",
        "/api/entries",
      ])
        expect((await handle(gatewayRequest(path, { caller: { role: "admin" } }))).status).toBe(
          200,
        );
      await store.pending();
      expect(git(fixture.mountRoot, ["rev-parse", "HEAD"])).toBe(head);
      expect(git(fixture.mountRoot, ["rev-parse", "origin/v3"])).toBe(tracked);
      expect((await store.listProjects()).find((row) => row.id === "novy-web")?.value.name).toBe(
        "Nový web",
      );
      await expect(store.pull()).rejects.toMatchObject({ code: "data_read_only" });
      const pull = await handle(
        gatewayRequest("/api/draft/pull", {
          caller: { role: "admin" },
          origin: TEST_ORIGIN,
          body: {},
        }),
      );
      expect(pull.status).toBe(409);
      expect(git(fixture.mountRoot, ["rev-parse", "origin/v3"])).toBe(tracked);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a read-only replica shows its draft and pending records without the network", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const writer = open(fixture);
    await writer.saveEntry(NEW_ID, newEntry(), null);
    writer.close();
    // The origin is gone: a fetch would fail, so a status needing one shows it.
    rmSync(fixture.originPath, { recursive: true, force: true });
    const store = open(fixture, fixture.origin, false);
    try {
      expect((await store.available()).ok).toBe(true);
      expect(await store.pending()).toEqual([{ collection: "entries", id: NEW_ID }]);
      const card = await store.draft();
      expect(card.unavailableReason).toBeUndefined();
      expect(card.status?.dirtyPaths).toEqual([`data/entries/${NEW_ID}.yaml`]);
      expect(card.status?.state).not.toBe("not_checked");
      expect(card.records).toHaveLength(1);
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("a copy that may not write changes no record, as main.ts opens it in production", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const writes = copyWrites({ LAZURIO_RUNTIME_DEPLOYMENT: "production" });
    expect(writes).toBe(false);
    const store = open(fixture, fixture.origin, writes);
    try {
      await expect(store.saveEntry(NEW_ID, newEntry(), null)).rejects.toMatchObject({
        code: "data_read_only",
      });
      await expect(store.deleteEntry("x", "r")).rejects.toMatchObject({ code: "data_read_only" });
      expect(existsSync(join(fixture.mountRoot, `data/entries/${NEW_ID}.yaml`))).toBe(false);
      expect(git(fixture.mountRoot, ["status", "--porcelain"])).toBe("");
    } finally {
      store.close();
      fixture.cleanup();
    }
  });

  test("an open read-only page hears when the host updates the replica", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = createRepositoryDbStore({
      mountRoot: fixture.mountRoot,
      expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
      intervalMs: 20,
      writes: false,
      policy: POLICY,
      now: () => NOW,
    });
    const events: string[] = [];
    const stop = store.subscribe((event) => events.push(event.type));
    try {
      await Bun.sleep(60);
      expect(events).toEqual([]);
      const colleague = colleagueClone(fixture);
      const file = join(colleague, "data/projects/novy-web.yaml");
      writeFileSync(file, readFileSync(file, "utf8").replace("name: Nový web", "name: Web bistra"));
      git(colleague, ["commit", "--quiet", "--all", "--message", "Rename the project"]);
      git(colleague, ["push", "--quiet"]);
      // The application host updates its replica; the App itself never pulls.
      git(fixture.mountRoot, ["pull", "--quiet", "--ff-only"]);
      for (let waited = 0; !events.includes("records-changed") && waited < 3000; waited += 20)
        await Bun.sleep(20);
      expect(events).toContain("records-changed");
      expect(events).toContain("draft-changed");
      expect((await store.listProjects()).find((row) => row.id === "novy-web")?.value.name).toBe(
        "Web bistra",
      );
    } finally {
      stop();
      store.close();
      fixture.cleanup();
    }
  });

  test("an open read-only page hears every change of a draft record, also the same one again", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = createRepositoryDbStore({
      mountRoot: fixture.mountRoot,
      expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
      intervalMs: 20,
      writes: false,
      policy: POLICY,
      now: () => NOW,
    });
    const events: string[] = [];
    const stop = store.subscribe((event) => events.push(event.type));
    const recordChanges = () => events.filter((type) => type === "records-changed").length;
    const path = git(fixture.mountRoot, ["ls-files", "data/projects"])
      .split("\n")
      .find((entry) => entry.endsWith(".yaml"));
    const file = join(fixture.mountRoot, path ?? "");
    const original = readFileSync(file, "utf8");
    // The host changes the replica's draft; the App itself never writes.
    const edit = async (value: string) => {
      const before = recordChanges();
      writeFileSync(file, original.replace(/^(\s*)name: .*$/m, `$1name: ${value}`));
      for (let waited = 0; recordChanges() === before && waited < 3000; waited += 20)
        await Bun.sleep(20);
      expect(recordChanges()).toBeGreaterThan(before);
      expect(events.at(-1)).toBe("draft-changed");
      expect((await store.listProjects()).some((row) => row.value.name === value)).toBe(true);
    };
    try {
      await Bun.sleep(60);
      expect(events).toEqual([]);
      await edit("First edit");
      await edit("Second edit");
    } finally {
      stop();
      store.close();
      fixture.cleanup();
    }
  });

  test("an open read-only page hears when its data become available", async () => {
    const fixture = createFixtureRepo({ sample: true });
    // The page opens before the host has mounted the data checkout.
    renameSync(fixture.mountRoot, `${fixture.mountRoot}.later`);
    const store = createRepositoryDbStore({
      mountRoot: fixture.mountRoot,
      expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
      intervalMs: 20,
      writes: false,
      policy: POLICY,
      now: () => NOW,
    });
    const events: string[] = [];
    const stop = store.subscribe((event) => events.push(event.type));
    try {
      await Bun.sleep(60);
      expect(events).toEqual([]);
      expect((await store.available()).ok).toBe(false);
      renameSync(`${fixture.mountRoot}.later`, fixture.mountRoot);
      for (let waited = 0; !events.includes("records-changed") && waited < 3000; waited += 20)
        await Bun.sleep(20);
      expect(events).toContain("records-changed");
      expect(events).toContain("draft-changed");
      expect((await store.available()).ok).toBe(true);
      expect((await store.listProjects()).length).toBeGreaterThan(0);
    } finally {
      stop();
      store.close();
      fixture.cleanup();
    }
  });

  test("an open read-only page hears a fetched newer state it does not pull", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = createRepositoryDbStore({
      mountRoot: fixture.mountRoot,
      expect: { remote: fixture.origin, branch: "v3", within: fixture.moduleRoot },
      intervalMs: 20,
      writes: false,
      policy: POLICY,
      now: () => NOW,
    });
    const events: string[] = [];
    const stop = store.subscribe((event) => events.push(event.type));
    try {
      await Bun.sleep(60);
      expect(events).toEqual([]);
      expect((await store.draft()).status?.state).toBe("published");
      const colleague = colleagueClone(fixture);
      writeFileSync(join(colleague, "colleague.txt"), "newer work\n");
      git(colleague, ["add", "colleague.txt"]);
      git(colleague, ["commit", "--quiet", "--message", "A colleague's newer work"]);
      git(colleague, ["push", "--quiet"]);
      const head = git(fixture.mountRoot, ["rev-parse", "HEAD"]);
      // The host fetches but does not pull yet; the App itself does neither.
      git(fixture.mountRoot, ["fetch", "--quiet"]);
      for (let waited = 0; !events.includes("draft-changed") && waited < 3000; waited += 20)
        await Bun.sleep(20);
      expect(events).toContain("draft-changed");
      expect((await store.draft()).status?.state).toBe("pull_needed");
      expect(git(fixture.mountRoot, ["rev-parse", "HEAD"])).toBe(head);
    } finally {
      stop();
      store.close();
      fixture.cleanup();
    }
  });
});
