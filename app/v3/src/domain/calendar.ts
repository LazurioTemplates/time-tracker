import type { Policy } from "./policy.ts";

/**
 * Calendar arithmetic in an IANA time zone, without a library: `Intl` gives the
 * wall clock of a moment, and a day `YYYY-MM-DD` is plain date arithmetic.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let found = formatters.get(timeZone);
  if (!found) {
    found = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, found);
  }
  return found;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(ms: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(ms))
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

const pad = (value: number, size = 2) => String(value).padStart(size, "0");

const msOf = (moment: string | number) =>
  typeof moment === "number" ? moment : Date.parse(moment);

/** The day of a moment in the time zone, `YYYY-MM-DD`. */
export function localDay(moment: string | number, timeZone: string): string {
  const clock = wallClock(msOf(moment), timeZone);
  return `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}`;
}

/** The wall-clock time of a moment in the time zone, `HH:MM`. */
export function localTime(moment: string | number, timeZone: string): string {
  const clock = wallClock(msOf(moment), timeZone);
  return `${pad(clock.hour)}:${pad(clock.minute)}`;
}

function offsetMs(ms: number, timeZone: string): number {
  const clock = wallClock(ms, timeZone);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

/**
 * The moment a wall-clock time of a day has in the time zone. Around a change
 * of daylight saving time the offset is taken twice, so the answer is the
 * moment whose own offset gives back that time where it exists.
 */
export function zonedMoment(dayText: string, time: string, timeZone: string): number {
  const [year = 1970, month = 1, date = 1] = dayText.split("-").map(Number);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, date, hour, minute);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

/** The first moment of a day in the time zone. */
export function dayStart(dayText: string, timeZone: string): number {
  return zonedMoment(dayText, "00:00", timeZone);
}

function utcDate(dayText: string): Date {
  const [year = 1970, month = 1, date = 1] = dayText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

const dayText = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return dayText(date);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekday(day: string): number {
  return ((utcDate(day).getUTCDay() + 6) % 7) + 1;
}

/** Monday of the day's week. */
export function weekStart(day: string): string {
  return addDays(day, 1 - weekday(day));
}

/** The ISO week number of a day. */
export function isoWeek(day: string): number {
  const thursday = addDays(day, 4 - weekday(day));
  const firstOfYear = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor((utcDate(thursday).getTime() - utcDate(firstOfYear).getTime()) / 864e5 / 7) + 1;
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: string): string {
  const date = utcDate(monthStart(day));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return dayText(date);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Easter Sunday of a year (the anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const date = ((h + l - 7 * m + 114) % 31) + 1;
  return `${pad(year, 4)}-${pad(month)}-${pad(date)}`;
}

const CZECH_FIXED_HOLIDAYS = [
  "01-01",
  "05-01",
  "05-08",
  "07-05",
  "07-06",
  "09-28",
  "10-28",
  "11-17",
  "12-24",
  "12-25",
  "12-26",
];

/** Public holidays of the Czech Republic in a year, as days. */
export function czechHolidays(year: number): string[] {
  const easter = easterSunday(year);
  return [
    ...CZECH_FIXED_HOLIDAYS.map((date) => `${pad(year, 4)}-${date}`),
    addDays(easter, -2),
    addDays(easter, 1),
  ].sort();
}

export function isHoliday(day: string, policy: Policy): boolean {
  return policy.holidays === "cz" && czechHolidays(Number(day.slice(0, 4))).includes(day);
}

export function isWorkday(day: string, policy: Policy): boolean {
  return policy.workdays.includes(weekday(day)) && !isHoliday(day, policy);
}
