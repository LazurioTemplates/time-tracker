import { z } from "zod";
import { instant, slugId, subject } from "./common.ts";

export const ENTRY_SCHEMA_VERSION = "time-tracker.entry.v1";

/** How an entry came to be: a timer that ran, or a time written by hand. */
export const SOURCES = ["timer", "manual"] as const;

/**
 * One stretch of work of one person on one project. Times are UTC; the
 * Organization's time zone decides which day, week and month it belongs to
 * (by its start).
 */
export const entry = z
  .strictObject({
    /** The person's Lazurio subject. */
    person: subject,
    /** The person's Lazurio username when the entry was written, to show; null when none was stated. */
    personName: z.string().trim().min(1).max(100).nullable(),
    project: slugId,
    startedAt: instant,
    /** `null` while the timer runs. */
    endedAt: instant.nullable(),
    /** What was done, in the person's words. */
    note: z.string().trim().max(500),
    source: z.enum(SOURCES),
    /** When a forgotten timer ended by itself; kept after a correction. */
    autoStoppedAt: instant.nullable(),
    updatedAt: instant,
    /** Who saved it last: a subject, or `null` from inside the Environment (an agent, a script). */
    updatedBy: subject.nullable(),
  })
  .superRefine((value, context) => {
    if (value.endedAt !== null && Date.parse(value.endedAt) < Date.parse(value.startedAt))
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "The end precedes the start.",
      });
    if (value.source === "manual" && value.endedAt === null)
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "A manual entry has an end.",
      });
    if (value.autoStoppedAt !== null && value.endedAt === null)
      context.addIssue({
        code: "custom",
        path: ["autoStoppedAt"],
        message: "An automatic stop needs an end.",
      });
  });

export type Entry = z.infer<typeof entry>;
