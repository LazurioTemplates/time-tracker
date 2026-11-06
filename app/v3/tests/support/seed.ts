import { sampleData } from "../../src/demo/sample.ts";
import type { Entry } from "../../src/domain/entry.ts";
import type { Policy } from "../../src/domain/policy.ts";

export { sampleData };

/** The policy of the tests: the template's defaults, spelled out. */
export const POLICY: Policy = {
  timeZone: "Europe/Prague",
  timerLimitHours: 10,
  workdays: [1, 2, 3, 4, 5],
  holidays: "cz",
};

/** "Now" of the tests: Friday 2026-11-06, 16:00 in Prague, after the example's last entry. */
export const NOW = Date.parse("2026-11-06T15:00:00.000Z");

export const ALEX = "11111111-1111-4111-8111-111111111111";
export const JAMIE = "22222222-2222-4222-8222-222222222222";
export const ROBIN = "33333333-3333-4333-8333-333333333333";

/** A finished entry of Alex on Friday afternoon that breaks no rule of the example. */
export function newEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    person: ALEX,
    personName: "alexmorgan",
    project: "novy-web",
    startedAt: "2026-11-06T13:30:00.000Z",
    endedAt: "2026-11-06T14:30:00.000Z",
    note: "Příprava nabídky",
    source: "manual",
    autoStoppedAt: null,
    updatedAt: "2026-11-06T14:45:00.000Z",
    updatedBy: ALEX,
    ...overrides,
  };
}

export const NEW_ID = "f0000000-0000-4000-8000-000000000001";
