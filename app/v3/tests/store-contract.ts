import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { TimeStore } from "../src/data/store.ts";
import { ALEX, JAMIE, NEW_ID, newEntry, sampleData } from "./support/seed.ts";

/**
 * The shared test suite of the storage port. Every implementation runs it:
 * the repository-db store of generation v3 and the memory store today, the
 * Dolt store of generation v4 later. An implementation that passes it can
 * replace another without a change to the server or the UI.
 *
 * `setup` returns a store over the fictional example data whose rules run at
 * `NOW` of `support/seed.ts`.
 */
export function storeContract(
  name: string,
  setup: () => Promise<{ store: TimeStore; cleanup(): void }>,
) {
  describe(`storage port: ${name}`, () => {
    let store: TimeStore;
    let cleanup: () => void;
    const sample = sampleData();

    beforeEach(async () => {
      ({ store, cleanup } = await setup());
    });
    afterEach(() => {
      store.close();
      cleanup();
    });

    const refusal = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        return (error as { code?: string }).code;
      }
      throw new Error("expected a refusal");
    };

    test("reads clients and projects by name and entries newest first", async () => {
      expect(await store.available()).toEqual({ ok: true });
      const clients = await store.listClients();
      expect(clients.map((row) => row.value.name)).toEqual([
        "Example Bistro",
        "Example Logistics",
        "Example Studio",
      ]);
      const projects = await store.listProjects();
      expect(projects.map((row) => row.id)).toEqual([
        "aplikace-pro-rozvoz",
        "interni-provoz",
        "jarni-kampan",
        "novy-web",
        "podzimni-akce",
      ]);
      const entries = await store.listEntries();
      expect(entries).toHaveLength(sample.entries.length);
      expect(entries.every((row) => row.revision.length > 0)).toBe(true);
      const starts = entries.map((row) => row.value.startedAt);
      expect(starts).toEqual([...starts].sort().reverse());
      const first = sample.entries[0];
      if (!first) throw new Error("the example has no entry");
      expect((await store.getEntry(first.id))?.value).toEqual(first.value);
      expect(await store.getEntry(NEW_ID)).toBeNull();
      expect(await store.check()).toEqual([]);
    });

    test("a published state has no draft and nothing pending", async () => {
      const card = await store.draft();
      expect(card.status?.state).toBe("published");
      expect(card.records ?? []).toEqual([]);
      expect(await store.pending()).toEqual([]);
    });

    test("a new entry becomes a draft with one record a person recognises", async () => {
      const created = await store.saveEntry(NEW_ID, newEntry(), null, ALEX);
      expect((await store.getEntry(NEW_ID))?.revision).toBe(created.revision);
      const card = await store.draft();
      expect(card.status?.state).toBe("draft");
      expect(card.records?.map((record) => record.resource.label)).toEqual([
        "alexmorgan · Nový web · 6. 11. 2026",
      ]);
      expect(card.records?.[0]?.resource.metadata?.typeLabel).toBe("Záznam času");
      expect(card.revision).toBeString();
      expect(await store.pending()).toEqual([{ collection: "entries", id: NEW_ID }]);
    });

    test("a save names the version it was edited from", async () => {
      const opened = await store.saveEntry(NEW_ID, newEntry(), null);
      const saved = await store.saveEntry(
        NEW_ID,
        { ...opened.value, note: "Nabídka pro bistro" },
        opened.revision,
      );
      expect(saved.revision).not.toBe(opened.revision);
      // A second editor that opened the old version is refused, not overwritten.
      expect(
        await refusal(() =>
          store.saveEntry(NEW_ID, { ...opened.value, note: "Jiná verze" }, opened.revision),
        ),
      ).toBe("record_changed");
      expect((await store.getEntry(NEW_ID))?.value.note).toBe("Nabídka pro bistro");
      // A new record under an existing id is refused.
      expect(await refusal(() => store.saveEntry(NEW_ID, newEntry(), null))).toBe("record_changed");
    });

    test("refuses an entry that breaks its schema or a rule across records", async () => {
      const cases: [Parameters<typeof newEntry>[0], string][] = [
        [{ note: "x".repeat(501) }, "invalid_record"],
        [{ endedAt: "2026-11-06T13:00:00.000Z" }, "invalid_record"],
        [{ project: "neexistuje" }, "invalid_record"],
        [{ project: "podzimni-akce" }, "invalid_record"],
        [
          { startedAt: "2026-11-06T17:00:00.000Z", endedAt: null, source: "timer" },
          "invalid_record",
        ],
        // Alex worked on Friday 09:00–12:30 in Prague.
        [
          { startedAt: "2026-11-06T10:00:00.000Z", endedAt: "2026-11-06T10:30:00.000Z" },
          "entry_overlap",
        ],
      ];
      for (const [overrides, code] of cases)
        expect(await refusal(() => store.saveEntry(NEW_ID, newEntry(overrides), null))).toBe(code);
      expect(
        await refusal(() =>
          store.saveProject(
            "novy-projekt",
            { name: "Nový projekt", client: "neexistuje", billable: true, archived: false },
            null,
          ),
        ),
      ).toBe("invalid_record");
      expect(await store.pending()).toEqual([]);
    });

    test("allows one running timer per person", async () => {
      const running = newEntry({
        startedAt: "2026-11-06T14:00:00.000Z",
        endedAt: null,
        source: "timer",
      });
      await store.saveEntry(NEW_ID, running, null);
      expect(
        await refusal(() =>
          store.saveEntry(
            "f0000000-0000-4000-8000-000000000002",
            { ...running, startedAt: "2026-11-06T14:50:00.000Z" },
            null,
          ),
        ),
      ).toBe("timer_running");
      // Another person's timer is theirs.
      await store.saveEntry(
        "f0000000-0000-4000-8000-000000000003",
        { ...running, person: JAMIE, personName: "jamiechen" },
        null,
      );
    });

    test("keeps projects and clients", async () => {
      const client = await store.saveClient(
        "example-garden",
        { name: "Example Garden", archived: false },
        null,
      );
      const project = await store.saveProject(
        "zahrada-web",
        { name: "Web zahrady", client: "example-garden", billable: true, archived: false },
        null,
      );
      await store.saveClient(client.id, { ...client.value, archived: true }, client.revision);
      // A project may stay with its archived client, a new one may not join it.
      await store.saveProject(project.id, { ...project.value, billable: false }, project.revision);
      expect(
        await refusal(() =>
          store.saveProject(
            "zahrada-kampan",
            { name: "Kampaň zahrady", client: "example-garden", billable: true, archived: false },
            null,
          ),
        ),
      ).toBe("invalid_record");
      expect(
        (await store.listProjects()).find((row) => row.id === "zahrada-web")?.value.billable,
      ).toBe(false);
    });

    test("deletes an entry by its revision", async () => {
      const created = await store.saveEntry(NEW_ID, newEntry(), null);
      expect(await refusal(() => store.deleteEntry(NEW_ID, "sha256:stale"))).toBe("record_changed");
      await store.deleteEntry(NEW_ID, created.revision);
      expect(await store.getEntry(NEW_ID)).toBeNull();
      expect(await store.pending()).toEqual([]);
    });

    test("publishes exactly the draft that was shown", async () => {
      await store.saveEntry(NEW_ID, newEntry(), null);
      const shown = await store.draft();
      await store.saveClient("example-garden", { name: "Example Garden", archived: false }, null);
      expect(await refusal(() => store.publish({ expectedRevision: shown.revision ?? "" }))).toBe(
        "draft_changed",
      );
      const current = await store.draft();
      expect(current.records).toHaveLength(2);
      await store.publish({ expectedRevision: current.revision ?? "", summary: "Friday" });
      const after = await store.draft();
      expect(after.status?.state).toBe("published");
      expect(after.records ?? []).toEqual([]);
      expect(await store.getEntry(NEW_ID)).not.toBeNull();
    });

    test("returns one record or the whole draft to the published state", async () => {
      const first = sample.entries[0];
      if (!first) throw new Error("the example has no entry");
      const opened = await store.getEntry(first.id);
      if (!opened) throw new Error("the first entry is missing");
      await store.saveEntry(first.id, { ...opened.value, note: "Opraveno" }, opened.revision);
      await store.saveEntry(NEW_ID, newEntry(), null);
      const card = await store.draft();
      const changed = card.records?.find(
        (record) => record.resource.stableResourceId === `entries:${first.id}`,
      );
      if (!changed) throw new Error("the edited entry is not in the draft");
      await store.discard({ kind: "record", path: changed.technicalPath }, card.revision ?? "");
      expect((await store.getEntry(first.id))?.value.note).toBe(opened.value.note);
      expect((await store.draft()).records).toHaveLength(1);
      const rest = await store.draft();
      await store.discard({ kind: "draft" }, rest.revision ?? "");
      expect(await store.getEntry(NEW_ID)).toBeNull();
      expect((await store.draft()).records ?? []).toEqual([]);
    });

    test("tells subscribers that the draft moved", async () => {
      const events: string[] = [];
      const stop = store.subscribe((event) => events.push(event.type));
      await store.saveEntry(NEW_ID, newEntry(), null);
      stop();
      expect(events).toContain("draft-changed");
    });
  });
}
