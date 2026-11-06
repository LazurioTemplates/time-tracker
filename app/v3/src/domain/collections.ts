import type { z } from "zod";
import { CLIENT_SCHEMA_VERSION, client } from "./client.ts";
import { entryId, slugId } from "./common.ts";
import { ENTRY_SCHEMA_VERSION, entry } from "./entry.ts";
import { PROJECT_SCHEMA_VERSION, project } from "./project.ts";

/** One collection of this Module's data: the `schemaVersion` of its documents,
 * the Zod schema of one record and the shape of its ids. */
export type CollectionSpec = Readonly<{ schemaVersion: string; record: z.ZodType; id?: z.ZodType }>;

/**
 * The collections of this Module's data, by the name of their directory
 * (`db/data/<name>/`, one document `<id>.yaml` each). Zod is the one source of
 * a record's shape (profile `app-data`): the types come from these schemas
 * (`z.infer`), the App hands the same schemas to repository-db as its parsers,
 * and `bun run validate:data` checks every record of `seed/` against them.
 *
 * A new collection is one entry here, written before its first record.
 */
export const collections = {
  clients: { schemaVersion: CLIENT_SCHEMA_VERSION, record: client, id: slugId },
  projects: { schemaVersion: PROJECT_SCHEMA_VERSION, record: project, id: slugId },
  entries: { schemaVersion: ENTRY_SCHEMA_VERSION, record: entry, id: entryId },
} as const satisfies Readonly<Record<string, CollectionSpec>>;

export type CollectionName = keyof typeof collections;
export const COLLECTION_NAMES = Object.keys(collections) as CollectionName[];
