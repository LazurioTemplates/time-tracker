import { posix } from "node:path";
import {
  createSyncHost,
  type DraftPanelRecordInput,
  documentFileName,
  parseYaml,
  type RepositoryDb,
  RepositoryDbError,
  readDataFile,
  recordRevisionFromBytes,
  type SyncHost,
} from "@lazurio/repository-db";
import type { Client } from "../domain/client.ts";
import { type CollectionName, collections } from "../domain/collections.ts";
import type { Entry } from "../domain/entry.ts";
import type { Policy } from "../domain/policy.ts";
import type { Project } from "../domain/project.ts";
import {
  checkRules,
  type DataSnapshot,
  entryRefusal,
  projectRefusal,
  type Refusal,
  type RuleIssue,
} from "../domain/rules.ts";
import { type Language, messages } from "../language/messages.ts";
import {
  byName,
  byStartDescending,
  parseDocument,
  parseOf,
  recordSchema,
  refuse,
  type Values,
} from "./records.ts";
import { createReviewAdapter, recordOfPath } from "./review-adapter.ts";
import type {
  DiscardScope,
  DraftCard,
  PendingRecord,
  Revision,
  Stored,
  StoreEvent,
  TimeStore,
} from "./store.ts";
import { StoreError } from "./store.ts";

/** `Repository-Db-Source` of every publish from this App. */
const SOURCE = "time-tracker-v3";

export interface RepositoryDbStoreOptions {
  /** The data checkout, the Module's `db/`. It may not exist yet. */
  mountRoot: string;
  /** The data repository this App serves; another one is refused. */
  expect?: { remote: string; branch: string; within?: string };
  /** Background fetch cadence; `0` runs no timer (tests). */
  intervalMs?: number;
  policy: Policy;
  /** The language of refusals, data checks and the review; `cs` by default. */
  language?: Language;
  /** The clock of the rules; injectable for tests. */
  now?: () => number;
}

interface Snapshot {
  clients: Stored<Client>[];
  projects: Stored<Project>[];
  entries: Stored<Entry>[];
  problems: RuleIssue[];
}

/**
 * Time Tracker's storage over repository-db v3: the collection layout of the
 * profile (`data/<collection>/<id>.yaml` with the engine's envelope). Every
 * read goes through the sync host's `read`, every write through its queue
 * (`run`) and the engine's collections with the base revision, so the App
 * never runs Git on its data and two writes never interleave.
 */
export function createRepositoryDbStore(options: RepositoryDbStoreOptions): TimeStore {
  const { mountRoot, policy } = options;
  const language = options.language ?? "cs";
  const now = options.now ?? Date.now;
  const host: SyncHost = createSyncHost({
    mountRoot,
    intervalMs: options.intervalMs ?? 30_000,
    ...(options.expect ? { expect: options.expect } : {}),
  });
  if ((options.intervalMs ?? 30_000) > 0) host.start();

  // Parsed records by path and revision: a record is parsed again only after
  // its bytes changed, so listing many entries stays cheap.
  const parsed = new Map<string, { revision: Revision; value: unknown }>();

  const pathOf = (db: RepositoryDb, collection: CollectionName, id: string) =>
    posix.join(db.config.layout.data, collection, documentFileName(id));

  function readCollection<C extends CollectionName>(
    db: RepositoryDb,
    collection: C,
    problems: RuleIssue[],
  ): Stored<Values[C]>[] {
    const records: Stored<Values[C]>[] = [];
    const ids = db
      .collection(collection, { schemaVersion: collections[collection].schemaVersion })
      .listIds();
    for (const id of ids) {
      const path = pathOf(db, collection, id);
      const text = readDataFile(mountRoot, path);
      if (text === null) continue;
      // Payload and revision come from one read.
      const revision = recordRevisionFromBytes(Buffer.from(text, "utf8"));
      const cached = parsed.get(path);
      try {
        const value =
          cached?.revision === revision
            ? cached.value
            : parseDocument(collection, id, parseYaml(text));
        parsed.set(path, { revision, value });
        records.push({ id, value: value as Values[C], revision });
      } catch (error) {
        parsed.delete(path);
        problems.push({
          record: `${collection}/${id}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return records;
  }

  function snapshot(db: RepositoryDb): Snapshot {
    const problems: RuleIssue[] = [];
    const clients = readCollection(db, "clients", problems).sort(byName);
    const projects = readCollection(db, "projects", problems).sort(byName);
    const entries = readCollection(db, "entries", problems).sort(byStartDescending);
    return { clients, projects, entries, problems };
  }

  const rulesInput = (data: Snapshot): DataSnapshot => data;

  function save<C extends CollectionName>(
    collection: C,
    id: string,
    input: Values[C],
    baseRevision: Revision | null,
    actor: string | null | undefined,
    refusal: (value: Values[C], previous: Values[C] | null, data: Snapshot) => Refusal | null,
  ): Promise<Stored<Values[C]>> {
    const value = parseOf(collection, id, input);
    return engine(() =>
      host.run(`save-${collection}`, (db) => {
        const data = snapshot(db);
        const existing = (data[collection] as Stored<Values[C]>[]).find((row) => row.id === id);
        if (baseRevision === null && existing)
          throw new StoreError("record_changed", `${collection}/${id} already exists.`);
        if (baseRevision !== null && !existing)
          throw new StoreError("record_changed", `${collection}/${id} no longer exists.`);
        refuse(refusal(value, existing?.value ?? null, data));
        const revision = db
          .collection<Values[C]>(collection, {
            schemaVersion: collections[collection].schemaVersion,
            parser: recordSchema(collection),
          })
          .put(id, value, {}, { baseRevision });
        db.recordOrigin([pathOf(db, collection, id)], {
          kind: "app",
          source: SOURCE,
          ...(actor ? { actor } : {}),
        });
        return { id, value, revision };
      }),
    );
  }

  return {
    async available() {
      try {
        await host.read(() => true);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          code: error instanceof RepositoryDbError ? error.code : "mount_unavailable",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    listClients: () => engine(() => host.read((db) => snapshot(db).clients)),
    saveClient: (id, value, base, actor) => save("clients", id, value, base, actor, () => null),
    listProjects: () => engine(() => host.read((db) => snapshot(db).projects)),
    saveProject: (id, value, base, actor) =>
      save("projects", id, value, base, actor, (next, previous, data) =>
        projectRefusal(next, previous, rulesInput(data), language),
      ),
    listEntries: () => engine(() => host.read((db) => snapshot(db).entries)),
    getEntry: (id) =>
      engine(() => host.read((db) => snapshot(db).entries.find((row) => row.id === id) ?? null)),
    saveEntry: (id, value, base, actor) =>
      save("entries", id, value, base, actor, (next, previous, data) =>
        entryRefusal(id, next, previous, rulesInput(data), now(), policy, language),
      ),
    deleteEntry: (id, baseRevision, actor) =>
      engine(() =>
        host.run("delete-entry", (db) => {
          const removed = db
            .collection("entries", { schemaVersion: collections.entries.schemaVersion })
            .remove(id, { baseRevision });
          if (!removed) throw new StoreError("record_changed", `entries/${id} no longer exists.`);
          db.recordOrigin([pathOf(db, "entries", id)], {
            kind: "app",
            source: SOURCE,
            ...(actor ? { actor } : {}),
          });
        }),
      ),
    check: () =>
      engine(() =>
        host.read((db) => {
          const data = snapshot(db);
          return [...data.problems, ...checkRules(rulesInput(data), now(), policy, language)];
        }),
      ),
    async pending(): Promise<PendingRecord[]> {
      let status = host.status();
      if (!status.sync) status = await host.refresh().catch(() => host.status());
      return (status.sync?.dirtyPaths ?? []).flatMap((path) => recordOfPath(path) ?? []);
    },
    async draft(): Promise<DraftCard> {
      // The host computes its status in the background; before the first
      // check (or without a timer) it is computed now.
      let status = host.status();
      if (!status.sync) status = await host.refresh().catch(() => host.status());
      if (!status.available)
        return {
          status: null,
          unavailableReason: status.error?.message ?? messages[language].review.unavailable,
        };
      return engine(() =>
        host.read(async (db) => {
          const data = snapshot(db);
          const adapter = createReviewAdapter(
            {
              clients: new Map(data.clients.map((row) => [row.id, row.value.name])),
              projects: new Map(data.projects.map((row) => [row.id, row.value.name])),
            },
            policy,
            language,
          );
          const review = await db.review({ adapters: [adapter] });
          const paths = review.resources.flatMap(
            (resource) => resource.changes[0]?.technicalRefs[0]?.path ?? [],
          );
          const reverts = db.canRevertRecords(paths);
          const records: DraftPanelRecordInput[] = review.resources.map((resource) => {
            const technicalPath = resource.changes[0]?.technicalRefs[0]?.path ?? "";
            return {
              resource,
              technicalPath,
              revert: reverts.get(technicalPath) ?? { supported: false },
            };
          });
          const card: DraftCard = {
            status: status.sync,
            conflict: status.conflict,
            pullBlocked: status.pullBlocked,
            publishReadiness: review.publishReadiness,
            records,
          };
          if (review.draftRevision !== undefined) card.revision = review.draftRevision;
          if (status.draftOwner) card.draftOwner = { actor: status.draftOwner.actor };
          return card;
        }),
      );
    },
    async publish({ expectedRevision, actor, summary }) {
      await engine(() =>
        host.run("publish", (db) =>
          db.publish({
            expectedRevision,
            source: SOURCE,
            ...(actor ? { actor } : {}),
            ...(summary ? { summary } : {}),
          }),
        ),
      );
    },
    async finishSend(expectedHead) {
      await engine(() => host.run("finish-send", (db) => db.finishSend({ expectedHead })));
    },
    async discard(scope: DiscardScope, expectedRevision) {
      await engine(() => host.run("discard", (db) => db.discard({ scope, expectedRevision })));
    },
    async pull() {
      await engine(() => host.run("pull", (db) => db.pull()));
    },
    subscribe(listener: (event: StoreEvent) => void) {
      return host.subscribe((event) => {
        if (event.type === "remote-pulled") listener({ type: "records-changed" });
        listener({ type: "draft-changed" });
      });
    },
    close() {
      host.stop();
    },
  };
}

/** Engine errors keep their code, so the UI words them as the engine documents. */
async function engine<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof StoreError) throw error;
    if (error instanceof RepositoryDbError) throw new StoreError(error.code, error.message);
    throw error;
  }
}
