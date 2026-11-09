/** How an Organization counts working time; `src/instance/settings.ts` sets it. */
export interface Policy {
  /** IANA time zone of the Organization's days, weeks and months. */
  timeZone: string;
  /** A running timer ends by itself after this many hours. */
  timerLimitHours: number;
  /** Working days, ISO numbering: 1 = Monday … 7 = Sunday. */
  workdays: readonly number[];
  /** Public holidays that are no working days. */
  holidays: "cz" | null;
}

export const HOUR_MS = 3_600_000;

export function timerLimitMs(policy: Policy): number {
  return policy.timerLimitHours * HOUR_MS;
}
