import { z } from "zod";

export const CLIENT_SCHEMA_VERSION = "time-tracker.client.v1";

/** A client the Organization works for; projects name it. */
export const client = z.strictObject({
  name: z.string().trim().min(1).max(120),
  /** An archived client stays in the history and offers no new work. */
  archived: z.boolean(),
});

export type Client = z.infer<typeof client>;
