import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toStableYaml } from "@lazurio/repository-db";
import { createRepositoryDbStore } from "../src/data/repository-db-store.ts";
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

const open = (fixture: FixtureRepo, remote = fixture.origin) =>
  createRepositoryDbStore({
    mountRoot: fixture.mountRoot,
    expect: { remote, branch: "v3", within: fixture.moduleRoot },
    intervalMs: 0,
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
        "schemaVersion: time-entry.v1",
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

  test("refuses a publish the data repository's validator rejects", async () => {
    const fixture = createFixtureRepo({ sample: true });
    const store = open(fixture);
    try {
      // An agent wrote a broken record by hand, past the App.
      writeFileSync(
        join(fixture.mountRoot, "data/entries/f0000000-0000-4000-8000-0000000000aa.yaml"),
        toStableYaml({
          schemaVersion: "time-entry.v1",
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
});
