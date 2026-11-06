import type { z } from "zod";
import type { Client } from "../domain/client.ts";
import { type CollectionName, collections } from "../domain/collections.ts";
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
