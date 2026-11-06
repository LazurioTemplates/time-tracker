import type { Language } from "../language/messages.ts";
import { localDay } from "./calendar.ts";
import type { Entry } from "./entry.ts";
import { type Policy, timerLimitMs } from "./policy.ts";

/**
 * An entry as it stands at `now`: a timer that ran past the limit has ended
 * at its start plus the limit, even before anyone saved that end. Reads,
 * reports and exports all use this view, so a forgotten timer never shows
 * unbounded time.
 */
export function effective(value: Entry, now: number, policy: Policy): Entry {
  if (value.endedAt !== null) return value;
  const limit = Date.parse(value.startedAt) + timerLimitMs(policy);
  if (now < limit) return value;
  const end = new Date(limit).toISOString();
  return { ...value, endedAt: end, autoStoppedAt: end };
}

export function isRunning(value: Entry, now: number, policy: Policy): boolean {
  return effective(value, now, policy).endedAt === null;
}

/** Length of an entry in milliseconds; a running one counts up to `now`. */
export function durationMs(value: Entry, now: number, policy: Policy): number {
  const current = effective(value, now, policy);
  const end = current.endedAt === null ? now : Date.parse(current.endedAt);
  return Math.max(0, end - Date.parse(current.startedAt));
}

/** The day an entry belongs to: the day of its start in the Organization's time zone. */
export function entryDay(value: Entry, policy: Policy): string {
  return localDay(value.startedAt, policy.timeZone);
}

/** Whether two entries of the same person cover the same moment. */
export function overlaps(left: Entry, right: Entry, now: number, policy: Policy): boolean {
  const a = effective(left, now, policy);
  const b = effective(right, now, policy);
  const aEnd = a.endedAt === null ? Number.POSITIVE_INFINITY : Date.parse(a.endedAt);
  const bEnd = b.endedAt === null ? Number.POSITIVE_INFINITY : Date.parse(b.endedAt);
  return Date.parse(a.startedAt) < bEnd && Date.parse(b.startedAt) < aEnd;
}

/** Hours with two decimals as spreadsheets of the language read them: `1,75` or `1.75`. */
export function hoursText(ms: number, language: Language): string {
  const text = (Math.round(ms / 36_000) / 100).toFixed(2);
  return language === "cs" ? text.replace(".", ",") : text;
}
