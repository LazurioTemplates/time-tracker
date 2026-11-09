import { createHash } from "node:crypto";
import type { Client } from "../domain/client.ts";
import type { CollectionName } from "../domain/collections.ts";
import type { Entry } from "../domain/entry.ts";
import type { Policy } from "../domain/policy.ts";
import type { Project } from "../domain/project.ts";
import {
  checkRules,
  entryRefusal,
  type Keyed,
  projectRefusal,
  type Refusal,
} from "../domain/rules.ts";
import type { Language } from "../language/messages.ts";
import { byName, byStartDescending, parseOf, refuse, type Values } from "./records.ts";
import { reviewResource } from "./review-adapter.ts";
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

/**
 * Time Tracker's storage in memory: the same port and the same Draft &
 * Publish behaviour as the repository-db store, without Git. The demo
 * (`bun run dev:demo`) and the tests of the server use it; it also proves that
 * `tests/store-contract.ts` describes the port and not one engine.
 */
export interface MemoryStoreSeed {
  clients?: readonly Keyed<Client>[];
  projects?: readonly Keyed<Project>[];
  entries?: readonly Keyed<Entry>[];
}

type Key = `${CollectionName}/${string}`;

function revisionOf(value: unknown): Revision {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function createMemoryStore(
  seed: MemoryStoreSeed,
  options: { policy: Policy; language?: Language; now?: () => number },
): TimeStore {
  const { policy } = options;
  const language = options.language ?? "cs";
  const now = options.now ?? Date.now;
  const published = new Map<Key, unknown>();
  for (const collection of ["clients", "projects", "entries"] as const)
    for (const { id, value } of seed[collection] ?? [])
      published.set(`${collection}/${id}`, parseOf(collection, id, value));
  const draft = new Map<Key, unknown>(published);
  const listeners = new Set<(event: StoreEvent) => void>();
  const emit = (event: StoreEvent) => {
    for (const listener of listeners) listener(event);
  };

  const changedKeys = () =>
    [...new Set<Key>([...published.keys(), ...draft.keys()])]
      .filter((key) => published.get(key) !== draft.get(key))
      .sort();
  const draftRevision = () =>
    `memory:${createHash("sha256")
      .update(JSON.stringify(changedKeys().map((key) => [key, draft.get(key) ?? null])))
      .digest("hex")}`;

  function list<C extends CollectionName>(collection: C): Stored<Values[C]>[] {
    return [...draft.entries()]
      .filter(([key]) => key.startsWith(`${collection}/`))
      .map(([key, value]) => ({
        id: key.slice(collection.length + 1),
        value: value as Values[C],
        revision: revisionOf(value),
      }));
  }
  const snapshot = (): {
    clients: Stored<Client>[];
    projects: Stored<Project>[];
    entries: Stored<Entry>[];
  } => ({
    clients: list("clients").sort(byName),
    projects: list("projects").sort(byName),
    entries: list("entries").sort(byStartDescending),
  });

  function assertBase(key: Key, base: Revision | null) {
    const current = draft.get(key);
    if (base === null && current !== undefined)
      throw new StoreError("record_changed", `${key} already exists.`);
    if (base !== null && current === undefined)
      throw new StoreError("record_changed", `${key} no longer exists.`);
    if (current !== undefined && base !== revisionOf(current))
      throw new StoreError("record_changed", `${key} was saved by someone else since it was read.`);
  }

  async function save<C extends CollectionName>(
    collection: C,
    id: string,
    input: Values[C],
    base: Revision | null,
    refusal: (value: Values[C], previous: Values[C] | null) => Refusal | null,
  ): Promise<Stored<Values[C]>> {
    const value = parseOf(collection, id, input);
    const key: Key = `${collection}/${id}`;
    assertBase(key, base);
    refuse(refusal(value, (draft.get(key) as Values[C] | undefined) ?? null));
    draft.set(key, value);
    emit({ type: "draft-changed" });
    return { id, value, revision: revisionOf(value) };
  }

  function assertRevision(expected: string) {
    if (expected !== draftRevision())
      throw new StoreError("draft_changed", "The draft changed since it was shown.");
  }

  return {
    available: async () => ({ ok: true }),
    listClients: async () => snapshot().clients,
    saveClient: (id, value, base) => save("clients", id, value, base, () => null),
    listProjects: async () => snapshot().projects,
    saveProject: (id, value, base) =>
      save("projects", id, value, base, (next, previous) =>
        projectRefusal(next, previous, snapshot(), language),
      ),
    listEntries: async () => snapshot().entries,
    getEntry: async (id) => snapshot().entries.find((row) => row.id === id) ?? null,
    saveEntry: (id, value, base) =>
      save("entries", id, value, base, (next, previous) =>
        entryRefusal(id, next, previous, snapshot(), now(), policy, language),
      ),
    async deleteEntry(id, base) {
      const key: Key = `entries/${id}`;
      if (base === null) throw new StoreError("record_changed", `${key} needs its revision.`);
      assertBase(key, base);
      draft.delete(key);
      emit({ type: "draft-changed" });
    },
    check: async () => checkRules(snapshot(), now(), policy, language),
    pending: async () =>
      changedKeys().map((key): PendingRecord => {
        const [collection, ...rest] = key.split("/");
        return { collection: collection as CollectionName, id: rest.join("/") };
      }),
    async draft(): Promise<DraftCard> {
      const keys = changedKeys();
      const data = snapshot();
      const names = {
        clients: new Map(data.clients.map((row) => [row.id, row.value.name])),
        projects: new Map(data.projects.map((row) => [row.id, row.value.name])),
      };
      return {
        status: {
          state: keys.length > 0 ? "draft" : "published",
          branch: "memory",
          ahead: 0,
          behind: 0,
          dirtyPaths: keys,
          head: null,
          conflict: false,
          fetched: false,
        },
        revision: draftRevision(),
        records: keys.map((key) => {
          const [collection, ...rest] = key.split("/") as [CollectionName, ...string[]];
          const before = published.get(key) as Record<string, unknown> | undefined;
          const after = draft.get(key) as Record<string, unknown> | undefined;
          return {
            technicalPath: key,
            revert: { supported: true },
            resource: reviewResource({
              collection,
              id: rest.join("/"),
              before,
              after,
              changeId: key,
              kind: before === undefined ? "created" : after === undefined ? "deleted" : "modified",
              technicalRefs: [{ path: key, kind: "canonical_data_path" }],
              names,
              policy,
              language,
            }),
          };
        }),
      };
    },
    async publish({ expectedRevision }) {
      assertRevision(expectedRevision);
      published.clear();
      for (const [key, value] of draft) published.set(key, value);
      emit({ type: "draft-changed" });
    },
    async finishSend() {
      throw new StoreError("nothing_to_send", "Nothing waits to be sent.");
    },
    async discard(scope: DiscardScope, expectedRevision) {
      assertRevision(expectedRevision);
      const keys = scope.kind === "draft" ? changedKeys() : [scope.path as Key];
      for (const key of keys) {
        const value = published.get(key);
        if (value === undefined) draft.delete(key);
        else draft.set(key, value);
      }
      emit({ type: "records-changed" });
      emit({ type: "draft-changed" });
    },
    async pull() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
    },
  };
}
