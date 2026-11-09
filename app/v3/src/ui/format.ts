import type { Messages } from "../language/messages.ts";

/** Days, times and durations in the App's language and the Organization's time zone. */
export function formats(timeZone: string, t: Messages) {
  const at = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(t.locale, { timeZone: "UTC", ...options });
  const dayLong = at({ weekday: "long", day: "numeric", month: "long" });
  const dayShort = at({ weekday: "short", day: "numeric", month: "numeric" });
  const weekdayShort = at({ weekday: "short" });
  const date = at({ day: "numeric", month: "numeric", year: "numeric" });
  const month = at({ month: "long", year: "numeric" });
  const time = new Intl.DateTimeFormat(t.locale, { timeZone, hour: "2-digit", minute: "2-digit" });
  const number = new Intl.NumberFormat(t.locale, { maximumFractionDigits: 2 });
  const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const capital = (text: string) => text.charAt(0).toLocaleUpperCase(t.locale) + text.slice(1);
  return {
    /** The weekday, the day and the month in words: "Friday 6 November". */
    dayLong: (day: string) => capital(dayLong.format(utc(day))),
    /** The short weekday and the date: "Fri 06/11". */
    dayShort: (day: string) => dayShort.format(utc(day)),
    weekday: (day: string) => weekdayShort.format(utc(day)),
    /** The date: "06/11/2026". */
    date: (day: string) => date.format(utc(day)),
    /** The month and year: "November 2026". */
    month: (day: string) => capital(month.format(utc(day))),
    /** "08:30" */
    time: (moment: string | number) =>
      time.format(typeof moment === "number" ? moment : Date.parse(moment)),
    /** Hours with up to two decimals: "3.25 h". */
    hours: (ms: number) => `${number.format(Math.round(ms / 36_000) / 100)} ${t.hoursUnit}`,
    percent: (share: number) => Math.round(share * 100),
  };
}

/** "1:05:09", the running timer. */
export function stopwatch(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds / 60) % 60;
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
