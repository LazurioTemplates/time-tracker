import { resolve } from "node:path";
import { type DirectoryData, readDataDirectory } from "../data/directory.ts";
import type { MemoryStoreSeed } from "../data/memory-store.ts";
import { addDays, localDay, localTime, weekStart, zonedMoment } from "../domain/calendar.ts";
import type { Entry } from "../domain/entry.ts";
import type { Policy } from "../domain/policy.ts";
import type { Language } from "../language/messages.ts";

/** The fictional example records, one set per language (`app/v3/seed/<language>/`): the "example data" start. */
export function seedDirectory(language: Language): string {
  return resolve(import.meta.dir, "..", "..", "seed", language);
}

/** Two fictional people of the example, as the demo shows them. */
export const DEMO_PEOPLE = {
  admin: { subject: "11111111-1111-4111-8111-111111111111", username: "alexmorgan" },
  user: { subject: "22222222-2222-4222-8222-222222222222", username: "jamiechen" },
} as const;

export function sampleData(language: Language = "cs"): DirectoryData {
  const data = readDataDirectory(seedDirectory(language));
  if (data.issues.length > 0)
    throw new Error(`app/v3/seed/${language} is not valid: ${JSON.stringify(data.issues)}`);
  return data;
}

/**
 * The example moved by whole weeks so that its last week is the current one,
 * with the same weekdays and wall-clock times; nothing after `now`. The
 * fictional admin's timer runs since 47 minutes ago. For the demo only.
 */
export function demoData(now: number, policy: Policy, language: Language): MemoryStoreSeed {
  const sample = sampleData(language);
  const tz = policy.timeZone;
  const lastDay =
    sample.entries
      .map((row) => localDay(row.value.startedAt, tz))
      .sort()
      .at(-1) ?? localDay(now, tz);
  const days = (Date.parse(weekStart(localDay(now, tz))) - Date.parse(weekStart(lastDay))) / 864e5;
  const move = (moment: string) =>
    new Date(
      zonedMoment(addDays(localDay(moment, tz), days), localTime(moment, tz), tz),
    ).toISOString();
  const entries = sample.entries.flatMap(({ id, value }) => {
    const moved: Entry = {
      ...value,
      startedAt: move(value.startedAt),
      endedAt: value.endedAt === null ? null : move(value.endedAt),
      autoStoppedAt: value.autoStoppedAt === null ? null : move(value.autoStoppedAt),
      updatedAt: move(value.updatedAt),
    };
    const end = moved.endedAt === null ? Date.parse(moved.startedAt) : Date.parse(moved.endedAt);
    return end <= now ? [{ id, value: moved }] : [];
  });
  const started = new Date(now - 47 * 60_000).toISOString();
  const overlapping = entries.some(
    (row) =>
      row.value.person === DEMO_PEOPLE.admin.subject &&
      row.value.endedAt !== null &&
      row.value.endedAt > started,
  );
  if (!overlapping)
    entries.push({
      id: "e0000000-0000-4000-8000-00000000d3e0",
      value: {
        person: DEMO_PEOPLE.admin.subject,
        personName: DEMO_PEOPLE.admin.username,
        project: language === "cs" ? "novy-web" : "new-website",
        startedAt: started,
        endedAt: null,
        note:
          language === "cs"
            ? "Úpravy košíku podle zpětné vazby"
            : "Basket changes from the feedback",
        source: "timer",
        autoStoppedAt: null,
        updatedAt: started,
        updatedBy: DEMO_PEOPLE.admin.subject,
      },
    });
  return { clients: sample.clients, projects: sample.projects, entries };
}
