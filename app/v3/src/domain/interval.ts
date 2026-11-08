import { addDays, localDay, localMoments, localTime } from "./calendar.ts";

/**
 * Wall-clock times people enter, turned into the moments an entry stores.
 *
 * - A time that does not exist that day (the gap when the clocks move
 *   forward) is refused. A time that exists twice (the hour they move back)
 *   is one of two moments, `earlier` or `later`: the person names it, unless
 *   only one of them can be meant.
 * - The end is the first moment after the start at which the clock shows the
 *   end's time: on the same day when that time comes later the same day (also
 *   when the clocks repeat an hour: the first 02:50 to the second 02:10 is 20
 *   minutes), otherwise on the next day (22:00 to 02:00 runs overnight). An
 *   end equal to the start is refused, never read as a whole day.
 * - An edit keeps the stored moment of every time the person left as it was
 *   shown, seconds and occurrence included, unless they name another
 *   occurrence for it.
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
  /** Which of two moments `from` means, when the person named it. */
  fromOccurrence?: Occurrence | undefined;
  /** Which of two moments `to` means, when the person named it. */
  toOccurrence?: Occurrence | undefined;
}

/** How one entered time was resolved: what a form shows about it. */
export interface FieldResolution {
  /** The day the time falls on, and the time as entered. */
  day: string;
  time: string;
  /** Every moment that time has that day: none, one, or two in the repeated hour. */
  moments: number[];
  /** The moment the time stands for; `null` while it is not resolved. */
  moment: number | null;
  /** Which of two moments `moment` is; `null` on an ordinary time. */
  occurrence: Occurrence | null;
  /** The stored moment stays as it was. */
  kept: boolean;
}

export type IntervalResult =
  | {
      ok: true;
      startedAt: string;
      endedAt: string | null;
      from: FieldResolution;
      to: FieldResolution | null;
    }
  | {
      ok: false;
      field: "from" | "to";
      problem: "missing" | "ambiguous" | "order";
      /** The day and time of the field, as entered. */
      day: string;
      time: string;
      /** For an ambiguous time: both moments, earliest first. */
      moments: number[];
      from: FieldResolution | null;
      to: FieldResolution | null;
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

const MINUTE = 60_000;

/** Which of a time's two moments a stored moment is (its minute), or `null`. */
function occurrenceOf(moment: number, moments: readonly number[]): Occurrence | null {
  if (moments.length !== 2) return null;
  const minute = Math.floor(moment / MINUTE) * MINUTE;
  if (minute === moments[0]) return "earlier";
  if (minute === moments[1]) return "later";
  return null;
}

/** The occurrence a stored moment has on its own day in the time zone. */
function storedOccurrence(moment: string, timeZone: string): Occurrence | null {
  const ms = Date.parse(moment);
  return occurrenceOf(ms, localMoments(localDay(ms, timeZone), localTime(ms, timeZone), timeZone));
}

/**
 * A change of one entered value, with the occurrences that no longer apply
 * cleared: a new day or start clears both, a new end clears the end's. A
 * choice of occurrence belongs to the day and time it was made for.
 */
export function changeWallTime<T extends WallTimes>(
  times: T,
  key: "day" | "from" | "to",
  value: string,
): T {
  return key === "to"
    ? { ...times, to: value, toOccurrence: undefined }
    : { ...times, [key]: value, fromOccurrence: undefined, toOccurrence: undefined };
}

/**
 * The moments of entered times. `stored` is the entry an edit starts from;
 * its moments stay where the person left their times as shown.
 */
export function resolveInterval(
  times: WallTimes,
  timeZone: string,
  stored?: { startedAt: string; endedAt: string | null },
): IntervalResult {
  const shown = stored ? wallTimesOf(stored, timeZone) : null;
  const fromMoments = localMoments(times.day, times.from, timeZone);
  const from: FieldResolution = {
    day: times.day,
    time: times.from,
    moments: fromMoments,
    moment: null,
    occurrence: null,
    kept: false,
  };
  const fail = (
    field: "from" | "to",
    problem: "missing" | "ambiguous" | "order",
    info: FieldResolution,
    to: FieldResolution | null,
  ): IntervalResult => ({
    ok: false,
    field,
    problem,
    day: info.day,
    time: info.time,
    moments: problem === "ambiguous" ? info.moments : [],
    from,
    to,
  });

  // The start: kept, named, the only moment, or a refusal.
  const keepStart =
    stored !== undefined &&
    shown !== null &&
    times.day === shown.day &&
    times.from === shown.from &&
    (times.fromOccurrence === undefined ||
      times.fromOccurrence === storedOccurrence(stored.startedAt, timeZone));
  let start: number;
  if (keepStart && stored) {
    start = Date.parse(stored.startedAt);
    from.kept = true;
  } else {
    const [first, second] = fromMoments;
    if (first === undefined) return fail("from", "missing", from, null);
    if (second === undefined) start = first;
    else if (times.fromOccurrence === undefined) return fail("from", "ambiguous", from, null);
    else start = times.fromOccurrence === "earlier" ? first : second;
  }
  from.moment = start;
  from.occurrence = occurrenceOf(start, fromMoments);
  const startedAt = new Date(start).toISOString();
  if (times.to === null) return { ok: true, startedAt, endedAt: null, from, to: null };

  // Nothing about the end changed either: the stored interval stays whole,
  // also when it is shorter than a minute.
  const storedEnd = stored?.endedAt ?? null;
  const endUnchanged =
    shown !== null &&
    storedEnd !== null &&
    times.day === shown.day &&
    times.to === shown.to &&
    (times.toOccurrence === undefined ||
      times.toOccurrence === storedOccurrence(storedEnd, timeZone));
  if (keepStart && endUnchanged && storedEnd !== null) {
    const endDay = localDay(storedEnd, timeZone);
    const moments = localMoments(endDay, times.to, timeZone);
    const end = Date.parse(storedEnd);
    return {
      ok: true,
      startedAt,
      endedAt: storedEnd,
      from,
      to: {
        day: endDay,
        time: times.to,
        moments,
        moment: end,
        occurrence: occurrenceOf(end, moments),
        kept: true,
      },
    };
  }

  // The end's day: the start's, when the clock shows the end's time after the
  // start that day; otherwise the next.
  const later = times.to > times.from;
  const againToday = localMoments(times.day, times.to, timeZone).some((moment) => moment > start);
  const sameTimes = times.to === times.from && !againToday;
  const endDay = later || againToday ? times.day : addDays(times.day, 1);
  const toMoments = localMoments(endDay, times.to, timeZone);
  const to: FieldResolution = {
    day: endDay,
    time: times.to,
    moments: toMoments,
    moment: null,
    occurrence: null,
    kept: false,
  };
  if (sameTimes) return fail("to", "order", to, to);

  let end: number;
  if (endUnchanged && storedEnd !== null && localDay(storedEnd, timeZone) === endDay) {
    end = Date.parse(storedEnd);
    to.kept = true;
  } else {
    const [first, second] = toMoments;
    if (first === undefined) return fail("to", "missing", to, to);
    if (second !== undefined && times.toOccurrence !== undefined)
      end = times.toOccurrence === "earlier" ? first : second;
    else {
      const after = toMoments.filter((moment) => moment > start);
      const [only, other] = after;
      if (only === undefined) return fail("to", "order", to, to);
      if (other !== undefined) return fail("to", "ambiguous", to, to);
      end = only;
    }
  }
  to.moment = end;
  to.occurrence = occurrenceOf(end, toMoments);
  if (end <= start) return fail("to", "order", to, to);
  return { ok: true, startedAt, endedAt: new Date(end).toISOString(), from, to };
}
