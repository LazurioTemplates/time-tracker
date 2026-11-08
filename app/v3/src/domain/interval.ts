import { addDays, localDay, localMoments, localTime } from "./calendar.ts";

/**
 * Wall-clock times people enter, turned into the moments an entry stores.
 *
 * - An unchanged time keeps its stored moment exactly (seconds included), so
 *   correcting a note never moves a start or an end, and a time the clocks
 *   repeat keeps the occurrence it had.
 * - A time that does not exist that day (the gap when the clocks move
 *   forward) is refused; a time that exists twice (the hour they move back)
 *   needs the person to say which occurrence they mean.
 * - An end that is earlier than the start on the clock is on the next day; an
 *   end that is not after the start is refused, never read as a whole day.
 */
export const OCCURRENCES = ["earlier", "later"] as const;
export type Occurrence = (typeof OCCURRENCES)[number];

export interface WallTimes {
  /** The day of the start, `YYYY-MM-DD`. */
  day: string;
  /** `HH:MM` */
  from: string;
  /** `HH:MM`, or `null` for a running timer. */
  to: string | null;
  /** Which of two repeated moments `from` means. */
  fromOccurrence?: Occurrence | undefined;
  toOccurrence?: Occurrence | undefined;
}

/** Stored moments that stay as they are because their wall-clock time did not change. */
export interface KeptMoments {
  startedAt?: string;
  endedAt?: string;
}

export type IntervalResult =
  | { ok: true; startedAt: string; endedAt: string | null }
  | {
      ok: false;
      field: "from" | "to";
      problem: "missing" | "ambiguous" | "order";
      /** The day and time of the field, as entered. */
      day: string;
      time: string;
      /** For an ambiguous time: both moments, earliest first. */
      moments: number[];
    };

/** The day, start and end a person sees for stored moments. */
export function wallTimesOf(
  value: { startedAt: string; endedAt: string | null },
  timeZone: string,
): { day: string; from: string; to: string | null } {
  return {
    day: localDay(value.startedAt, timeZone),
    from: localTime(value.startedAt, timeZone),
    to: value.endedAt === null ? null : localTime(value.endedAt, timeZone),
  };
}

/**
 * Which stored moments an edit keeps: those whose day and time the person
 * left as they were shown.
 */
export function keptMoments(
  stored: { startedAt: string; endedAt: string | null },
  times: WallTimes,
  timeZone: string,
): KeptMoments {
  const shown = wallTimesOf(stored, timeZone);
  const sameDay = times.day === shown.day;
  return {
    ...(sameDay && times.from === shown.from ? { startedAt: stored.startedAt } : {}),
    ...(sameDay && stored.endedAt !== null && times.to !== null && times.to === shown.to
      ? { endedAt: stored.endedAt }
      : {}),
  };
}

export function resolveInterval(
  times: WallTimes,
  timeZone: string,
  kept: KeptMoments = {},
): IntervalResult {
  const pick = (
    field: "from" | "to",
    day: string,
    time: string,
    occurrence: Occurrence | undefined,
  ): IntervalResult | number => {
    const moments = localMoments(day, time, timeZone);
    const [first, second] = moments;
    if (first === undefined) return { ok: false, field, problem: "missing", day, time, moments };
    if (second === undefined) return first;
    if (occurrence === undefined)
      return { ok: false, field, problem: "ambiguous", day, time, moments };
    return occurrence === "earlier" ? first : second;
  };

  let start: number;
  if (kept.startedAt !== undefined) start = Date.parse(kept.startedAt);
  else {
    const picked = pick("from", times.day, times.from, times.fromOccurrence);
    if (typeof picked !== "number") return picked;
    start = picked;
  }
  const startedAt = new Date(start).toISOString();
  if (times.to === null) return { ok: true, startedAt, endedAt: null };

  if (kept.startedAt !== undefined && kept.endedAt !== undefined)
    return { ok: true, startedAt, endedAt: kept.endedAt };
  let end: number;
  if (kept.endedAt !== undefined) end = Date.parse(kept.endedAt);
  else {
    const endDay = times.to < times.from ? addDays(times.day, 1) : times.day;
    const picked = pick("to", endDay, times.to, times.toOccurrence);
    if (typeof picked !== "number") return picked;
    end = picked;
  }
  if (end <= start)
    return {
      ok: false,
      field: "to",
      problem: "order",
      day: times.day,
      time: times.to,
      moments: [],
    };
  return { ok: true, startedAt, endedAt: new Date(end).toISOString() };
}
