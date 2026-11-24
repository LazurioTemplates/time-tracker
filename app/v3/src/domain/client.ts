import { z } from "zod";
import { writeRevision } from "./common.ts";

export const CLIENT_SCHEMA_VERSION = "time-tracker.client.v1";

/** A client the Organization works for; projects name it. */
export const client = z.strictObject({
  name: z.string().trim().min(1).max(120),
  /** An archived client stays in the history and offers no new work. */
  archived: z.boolean(),
  /** The write revision the storage port stores with every save. */
  revision: writeRevision,
});

export type Client = z.infer<typeof client>;
