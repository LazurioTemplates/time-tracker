import { z } from "zod";
import { instant, slugId, subject, writeRevision } from "./common.ts";

export const PROJECT_SCHEMA_VERSION = "time-tracker.project.v1";

/** A project people record time on. */
export const project = z.strictObject({
  name: z.string().trim().min(1).max(120),
  /** The client the work is for; `null` for the Organization's own work. */
  client: slugId.nullable(),
  /** Whether its time is invoiced to the client. */
  billable: z.boolean(),
  /** An archived project stays in the history and takes no new time. */
  archived: z.boolean(),
  /** When it was saved last; the storage port stores it with every save. */
  updatedAt: instant.optional(),
  /** Who saved it last: a subject, or `null` from inside the Environment. */
  updatedBy: subject.nullable().optional(),
  /** The write revision the storage port stores with every save. */
  revision: writeRevision,
});

export type Project = z.infer<typeof project>;
