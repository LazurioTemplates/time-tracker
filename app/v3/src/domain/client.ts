import { z } from "zod";
import { instant, subject, writeRevision } from "./common.ts";

export const CLIENT_SCHEMA_VERSION = "time-tracker.client.v1";

/** A client the Organization works for; projects name it. */
export const client = z.strictObject({
  name: z.string().trim().min(1).max(120),
  /** An archived client stays in the history and offers no new work. */
  archived: z.boolean(),
  /** When it was saved last; the storage port stores it with every save. */
  updatedAt: instant.optional(),
  /** Who saved it last: a subject, or `null` from inside the Environment. */
  updatedBy: subject.nullable().optional(),
  /** The write revision the storage port stores with every save. */
  revision: writeRevision,
});

export type Client = z.infer<typeof client>;
