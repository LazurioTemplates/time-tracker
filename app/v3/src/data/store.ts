import type { DraftPanelInput } from "@lazurio/repository-db";
import type { Client } from "../domain/client.ts";
import type { CollectionName } from "../domain/collections.ts";
import type { Entry } from "../domain/entry.ts";
import type { Project } from "../domain/project.ts";
import type { RuleIssue } from "../domain/rules.ts";

/**
 * The storage port of Time Tracker: everything the server needs from the
 * data, named by the domain and never by files or Git.
 *
 * Generation v3 implements it over repository-db (`repository-db-store.ts`),
 * and `memory-store.ts` implements it in memory for the demo and the tests.
 * Generation v4 implements the same port over Dolt; the server, the UI and the
 * shared test suite (`tests/store-contract.ts`) stay as they are. No YAML path
 * and no Git term crosses this boundary: a record is addressed by its id, and
 * a change is confirmed by an opaque revision.
 *
 * The port enforces the rules across records inside its write (an entry's
 * project exists, one running timer per person, no overlapping entries), so
 * two saves at once cannot both pass. Who may do what is the server's.
 */

/** An opaque version of one stored record; a save names the one it was edited from. */
export type Revision = string;

export interface Stored<T> {
  id: string;
  value: T;
  revision: Revision;
}

/** The Draft & Publish card: the shared view model of `@lazurio/repository-db`. */
export type DraftCard = DraftPanelInput;

export type DiscardScope = { kind: "draft" } | { kind: "record"; path: string };

/** A record the unpublished draft changes. */
export interface PendingRecord {
  collection: CollectionName;
  id: string;
}

export type StoreEvent =
  /** Records changed outside this process (a colleague's publish came in, a discard). */
  | { type: "records-changed" }
  /** The draft or the sync state changed. */
  | { type: "draft-changed" };

export interface TimeStore {
  /** False while the data cannot be read (not mounted yet, wrong repository). */
  available(): Promise<{ ok: true } | { ok: false; code: string; message: string }>;

  listClients(): Promise<Stored<Client>[]>;
  /**
   * Save a client as a draft. `baseRevision` is the revision the editor
   * opened, `null` for a new one. A stale revision is refused with
   * `record_changed`, a broken record with `invalid_record`.
   */
  saveClient(
    id: string,
    value: Client,
    baseRevision: Revision | null,
    actor?: string | null,
  ): Promise<Stored<Client>>;

  listProjects(): Promise<Stored<Project>[]>;
  saveProject(
    id: string,
    value: Project,
    baseRevision: Revision | null,
    actor?: string | null,
  ): Promise<Stored<Project>>;

  /** Every entry, newest start first. */
  listEntries(): Promise<Stored<Entry>[]>;
  getEntry(id: string): Promise<Stored<Entry> | null>;
  /**
   * Save an entry as a draft. Besides `record_changed` and `invalid_record`
   * it refuses `timer_running` (a second running timer of the person) and
   * `entry_overlap` (another entry of the person covers the same time).
   */
  saveEntry(
    id: string,
    value: Entry,
    baseRevision: Revision | null,
    actor?: string | null,
  ): Promise<Stored<Entry>>;
  /** Delete an entry as a draft; a stale revision is refused with `record_changed`. */
  deleteEntry(id: string, baseRevision: Revision, actor?: string | null): Promise<void>;

  /** Every problem of the data as it stands, draft included. Empty when valid. */
  check(): Promise<RuleIssue[]>;
  /** The records the unpublished draft changes. */
  pending(): Promise<PendingRecord[]>;

  /** The Draft & Publish card: state, the changed records and the draft revision. */
  draft(): Promise<DraftCard>;
  /** Publish the whole draft as shown; a changed draft is refused with `draft_changed`. */
  publish(input: { expectedRevision: string; actor?: string; summary?: string }): Promise<void>;
  /** Finish sending a publish that was saved but not sent. */
  finishSend(expectedHead: string): Promise<void>;
  discard(scope: DiscardScope, expectedRevision: string): Promise<void>;
  /** Take colleagues' published work. */
  pull(): Promise<void>;

  subscribe(listener: (event: StoreEvent) => void): () => void;
  close(): void;
}

/** A refusal the UI words for the person; `code` follows repository-db's error codes. */
export class StoreError extends Error {
  readonly code: string;
  readonly issues: readonly { path: string; message: string }[];

  constructor(code: string, message: string, issues: { path: string; message: string }[] = []) {
    super(message);
    this.name = "StoreError";
    this.code = code;
    this.issues = issues;
  }
}
