import type { z } from "zod";
import type { Client } from "../domain/client.ts";
import { type CollectionName, collections } from "../domain/collections.ts";
import { subject } from "../domain/common.ts";
import type { Entry } from "../domain/entry.ts";
import type { Project } from "../domain/project.ts";
import type { Refusal } from "../domain/rules.ts";
import { StoreError } from "./store.ts";

/** Parse one record with its schema, or refuse it with every issue named. */
export function parseRecord<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join(".") || "(record)",
    message: issue.message,
  }));
  throw new StoreError(
    "invalid_record",
    `${label}: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`,
    issues,
  );
}

/** The record type of each collection. */
export type Values = { clients: Client; projects: Project; entries: Entry };

/** The schema of a collection's records, typed by the collection. */
export function recordSchema<C extends CollectionName>(collection: C): z.ZodType<Values[C]> {
  return collections[collection].record as unknown as z.ZodType<Values[C]>;
}

/** Parse a record of a collection, its id included. */
export function parseOf<C extends CollectionName>(
  collection: C,
  id: string,
  value: unknown,
): Values[C] {
  parseRecord(collections[collection].id, id, `${collection}/${id}`);
  return parseRecord(recordSchema(collection), value, `${collection}/${id}`);
}

/**
 * The record inside a repository-db document (`schemaVersion`, `id`,
 * `record`), checked against its collection: the version, the id the file
 * name gives and the record's schema.
 */
export function parseDocument<C extends CollectionName>(
  collection: C,
  id: string,
  document: unknown,
): Values[C] {
  const spec = collections[collection];
  const label = `${collection}/${id}`;
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new StoreError("invalid_record", `${label}: the document is not a mapping`);
  const envelope = document as Record<string, unknown>;
  if (envelope.schemaVersion !== spec.schemaVersion)
    throw new StoreError(
      "invalid_record",
      `${label}: schemaVersion is ${JSON.stringify(envelope.schemaVersion)}, expected ${spec.schemaVersion}`,
    );
  if (envelope.id !== id)
    throw new StoreError(
      "invalid_record",
      `${label}: id is ${JSON.stringify(envelope.id)}, the file name says ${id}`,
    );
  return parseOf(collection, id, envelope.record);
}

/**
 * A record as the port stores it: the value with a new write revision in
 * `record.revision`, a random value no earlier write had (Lazurio Module
 * Standard, "One data port"). Every save of every collection goes through
 * it, so after A → B → A the stored record differs from the first A.
 */
export function stamped<T extends object>(value: T): T & { revision: string } {
  return { ...value, revision: crypto.randomUUID() };
}

/**
 * A client or project as the port stores it: the instant and the person of
 * the save in `updatedAt` and `updatedBy`. With the write revision they are
 * repository-db's audit bundle, so two concurrent edits of different fields
 * of one record merge and the later save's bundle is kept (repository-db
 * 3.4.0). An entry's `updatedAt` and `updatedBy` are its own fields, set by
 * the server, and stay as given.
 *
 * `updatedBy` is the actor's subject, `null` without one (from inside the
 * Environment). An actor that is not a Lazurio subject is left out rather
 * than refusing the save; an earlier `updatedBy` is never carried over.
 */
export function audited<C extends CollectionName>(
  collection: C,
  value: Values[C],
  at: number,
  actor: string | null | undefined,
): Values[C] {
  if (collection === "entries") return value;
  const { updatedBy: _previous, ...rest } = value as Client | Project;
  const by = actor == null ? null : subject.safeParse(actor).success ? actor : undefined;
  return {
    ...rest,
    updatedAt: new Date(at).toISOString(),
    ...(by === undefined ? {} : { updatedBy: by }),
  } as Values[C];
}

/**
 * The value the port hands out, without its write revision: the server, the
 * UI and the tools name a version only by the opaque `Stored.revision`, and a
 * value sent back never carries an old write revision into a save.
 */
export function unstamped<T extends object>(value: T): T {
  if (!Object.hasOwn(value, "revision")) return value;
  const { revision: _revision, ...rest } = value as T & { revision?: unknown };
  return rest as T;
}

/** A domain rule's refusal as the store's error. */
export function refuse(refusal: Refusal | null): void {
  if (refusal) throw new StoreError(refusal.code, refusal.message);
}

/** Newest start first, then by id: the order of every entry list. */
export function byStartDescending(
  left: { id: string; value: { startedAt: string } },
  right: { id: string; value: { startedAt: string } },
): number {
  return (
    right.value.startedAt.localeCompare(left.value.startedAt) || left.id.localeCompare(right.id)
  );
}

export function byName(
  left: { id: string; value: { name: string } },
  right: { id: string; value: { name: string } },
): number {
  return left.value.name.localeCompare(right.value.name, "cs") || left.id.localeCompare(right.id);
}
