import { describe, expect, test } from "bun:test";
import {
  czechHolidays,
  isoWeek,
  isWorkday,
  localDay,
  localTime,
  weekStart,
  zonedMoment,
} from "../src/domain/calendar.ts";
import { slugFor } from "../src/domain/common.ts";
import { entriesCsv, summaryCsv } from "../src/domain/csv.ts";
import { knownPeople, missingDays, rangeOf, shiftRange, summarize } from "../src/domain/report.ts";
import { checkRules } from "../src/domain/rules.ts";
import { durationMs, effective, hoursText } from "../src/domain/time.ts";
import { parseRoute } from "../src/ui/routes.ts";
import { ALEX, JAMIE, NOW, newEntry, POLICY, ROBIN, sampleData } from "./support/seed.ts";

const TZ = POLICY.timeZone;

describe("calendar", () => {
  test("turns Prague wall-clock times into moments across daylight saving time", () => {
    expect(new Date(zonedMoment("2026-07-01", "09:00", TZ)).toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    expect(new Date(zonedMoment("2026-11-06", "09:00", TZ)).toISOString()).toBe(
      "2026-11-06T08:00:00.000Z",
    );
    // The night daylight saving time ends (25 October 2026).
    expect(new Date(zonedMoment("2026-10-25", "12:00", TZ)).toISOString()).toBe(
      "2026-10-25T11:00:00.000Z",
    );
    expect(localDay("2026-11-05T23:30:00.000Z", TZ)).toBe("2026-11-06");
    expect(localTime("2026-11-05T23:30:00.000Z", TZ)).toBe("00:30");
  });

  test("knows weeks, Czech public holidays and working days", () => {
    expect(weekStart("2026-11-08")).toBe("2026-11-02");
    expect(isoWeek("2026-11-06")).toBe(45);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(czechHolidays(2026)).toContain("2026-04-03"); // Good Friday
    expect(czechHolidays(2026)).toContain("2026-04-06"); // Easter Monday
    expect(isWorkday("2026-10-28", POLICY)).toBe(false);
    expect(isWorkday("2026-10-27", POLICY)).toBe(true);
    expect(isWorkday("2026-10-31", POLICY)).toBe(false);
    expect(isWorkday("2026-10-28", { ...POLICY, holidays: null })).toBe(true);
  });

  test("weeks and months as ranges", () => {
    expect(rangeOf("week", "2026-11-06")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(rangeOf("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(shiftRange("month", rangeOf("month", "2026-01-15"), -1)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(shiftRange("week", rangeOf("week", "2026-11-06"), 1).from).toBe("2026-11-09");
  });

  test("a new id comes from the name without diacritics and stays unique", () => {
    expect(slugFor("Jarní kampaň", new Set())).toBe("jarni-kampan");
    expect(slugFor("Jarní kampaň", new Set(["jarni-kampan"]))).toBe("jarni-kampan-2");
    expect(slugFor("!!!", new Set())).toBe("record");
  });
});

describe("time", () => {
  test("a forgotten timer ends at its start plus the limit, even unsaved", () => {
    const running = newEntry({
      startedAt: "2026-11-05T07:00:00.000Z",
      endedAt: null,
      source: "timer",
    });
    const seen = effective(running, NOW, POLICY);
    expect(seen.endedAt).toBe("2026-11-05T17:00:00.000Z");
    expect(seen.autoStoppedAt).toBe(seen.endedAt);
    expect(durationMs(running, NOW, POLICY)).toBe(10 * 3_600_000);
    const fresh = newEntry({
      startedAt: "2026-11-06T14:00:00.000Z",
      endedAt: null,
      source: "timer",
    });
    expect(effective(fresh, NOW, POLICY)).toBe(fresh);
    expect(durationMs(fresh, NOW, POLICY)).toBe(3_600_000);
  });

  test("hours with a decimal comma", () => {
    expect(hoursText(5_400_000, "cs")).toBe("1,50");
    expect(hoursText(5_400_000, "en")).toBe("1.50");
    expect(hoursText(0, "cs")).toBe("0,00");
  });
});

describe("rules across records", () => {
  test("the example holds them", () => {
    expect(checkRules(sampleData("cs"), NOW, POLICY, "cs")).toEqual([]);
    expect(checkRules(sampleData("en"), NOW, POLICY, "en")).toEqual([]);
  });

  test("report missing references, overlaps and a second running timer", () => {
    const sample = sampleData();
    const issues = checkRules(
      {
        ...sample,
        projects: [
          ...sample.projects,
          {
            id: "sirotek",
            value: { name: "Sirotek", client: "nikdo", billable: false, archived: false },
          },
        ],
        entries: [
          ...sample.entries,
          { id: "a", value: newEntry({ project: "neni" }) },
          {
            id: "b",
            value: newEntry({
              startedAt: "2026-11-06T10:00:00.000Z",
              endedAt: "2026-11-06T10:30:00.000Z",
            }),
          },
          {
            id: "c",
            value: newEntry({
              startedAt: "2026-11-06T14:40:00.000Z",
              endedAt: null,
              source: "timer",
            }),
          },
          {
            id: "d",
            value: newEntry({
              startedAt: "2026-11-06T14:45:00.000Z",
              endedAt: null,
              source: "timer",
            }),
          },
        ],
      },
      NOW,
      POLICY,
      "en",
    );
    expect(issues.find((issue) => issue.record === "entries/a")?.message).toBe(
      "The project neni does not exist.",
    );
    const records = issues.map((issue) => issue.record);
    expect(records).toContain("projects/sirotek");
    expect(records).toContain("entries/a");
    expect(records).toContain("entries/b");
    expect(records).toContain("entries/d");
  });
});

describe("reports", () => {
  const sample = sampleData();
  const catalog = { clients: sample.clients, projects: sample.projects };

  test("a week's totals by day, project, client and person", () => {
    const week = summarize(
      sample.entries,
      catalog,
      rangeOf("week", "2026-11-04"),
      NOW,
      POLICY,
      "cs",
    );
    expect(week.days).toHaveLength(7);
    expect(week.days.filter((day) => day.workday)).toHaveLength(5);
    expect(week.totalMs).toBe(week.days.reduce((sum, day) => sum + day.ms, 0));
    expect(week.totalMs).toBe(week.projects.reduce((sum, row) => sum + row.ms, 0));
    expect(week.billableMs).toBeLessThan(week.totalMs);
    expect(week.clients.map((row) => row.name)).toContain("Vlastní práce");
    expect(week.people.map((row) => row.name).sort()).toEqual([
      "alexmorgan",
      "jamiechen",
      "robinlee",
    ]);
    expect(week.lines.reduce((sum, line) => sum + line.ms, 0)).toBe(week.totalMs);
  });

  test("working days without an entry, without weekends, holidays and today", () => {
    const october = rangeOf("month", "2026-10-20");
    expect(missingDays(sample.entries, ROBIN, october, "2026-11-06", POLICY)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-30",
    ]);
    const week = rangeOf("week", "2026-11-04");
    expect(missingDays(sample.entries, JAMIE, week, "2026-11-06", POLICY)).toEqual(["2026-11-04"]);
    expect(missingDays(sample.entries, ALEX, week, "2026-11-04", POLICY)).toEqual([]);
  });

  test("knows people by their entries", () => {
    expect(knownPeople(sample.entries).map((row) => row.name)).toEqual([
      "alexmorgan",
      "jamiechen",
      "robinlee",
    ]);
  });
});

describe("CSV for invoicing and payroll", () => {
  const sample = sampleData();
  const catalog = { clients: sample.clients, projects: sample.projects };

  test("opens in Czech spreadsheets: BOM, semicolons, decimal comma, CRLF", () => {
    const first = sample.entries.find((row) => row.id.endsWith("000000000001"));
    if (!first) throw new Error("no first entry");
    const text = entriesCsv([first], catalog, NOW, POLICY, "cs");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = text.slice(1).split("\r\n");
    expect(header?.split(";")[0]).toBe('"Datum"');
    expect(row).toBe(
      '"2026-10-19";"08:30";"09:15";"0,75";"alexmorgan";"Vlastní práce";"Interní provoz";"ne";"Týdenní porada";"Ukončeno";"časovač";"e0000000-0000-4000-8000-000000000001"',
    );
  });

  test("a cell a spreadsheet would run as a formula starts with an apostrophe", () => {
    const text = entriesCsv(
      [
        { id: "x", value: newEntry({ note: '=HYPERLINK("http://example.com")' }) },
        { id: "y", value: newEntry({ note: " \t+1" }) },
      ],
      catalog,
      NOW,
      POLICY,
      "cs",
    );
    expect(text).toContain('"\'=HYPERLINK(""http://example.com"")"');
    expect(text).toContain('"\' \t+1"');
  });

  test("the summary has hours by client, project and person", () => {
    const week = summarize(
      sample.entries,
      catalog,
      rangeOf("week", "2026-11-04"),
      NOW,
      POLICY,
      "cs",
    );
    const lines = summaryCsv(week, "cs").slice(1).trim().split("\r\n");
    expect(lines[0]).toBe(
      '"Období od";"Období do";"Klient";"Projekt";"Fakturovat";"Osoba";"Hodiny"',
    );
    expect(lines).toHaveLength(week.lines.length + 1);
  });
});

describe("routes", () => {
  test("address the pages by the hash", () => {
    expect(parseRoute("")).toEqual({ page: "today" });
    expect(parseRoute("#/report?period=month&day=2026-11-01")).toEqual({
      page: "report",
      period: "month",
      day: "2026-11-01",
    });
    expect(parseRoute("#/report?period=year")).toEqual({
      page: "report",
      period: "week",
      day: null,
    });
    expect(parseRoute("#/nic")).toEqual({ page: "not-found" });
  });
});

describe("the English example and export", () => {
  const sample = sampleData("en");
  const catalog = { clients: sample.clients, projects: sample.projects };

  test("the English CSV has commas, a decimal point and English words", () => {
    const first = sample.entries.find((row) => row.id.endsWith("000000000001"));
    if (!first) throw new Error("no first entry");
    const [header, row] = entriesCsv([first], catalog, NOW, POLICY, "en").slice(1).split("\r\n");
    expect(header?.split(",")[0]).toBe('"Date"');
    expect(row).toBe(
      '"2026-10-19","08:30","09:15","0.75","alexmorgan","Own work","Internal operations","no","Weekly meeting","Finished","timer","e0000000-0000-4000-8000-000000000001"',
    );
  });

  test("both examples tell the same story", () => {
    const czech = sampleData("cs");
    expect(sample.entries.map((row) => row.id)).toEqual(czech.entries.map((row) => row.id));
    expect(sample.entries.map((row) => row.value.startedAt)).toEqual(
      czech.entries.map((row) => row.value.startedAt),
    );
    const week = (data: typeof sample, language: "cs" | "en") =>
      summarize(
        data.entries,
        { clients: data.clients, projects: data.projects },
        rangeOf("week", "2026-11-04"),
        NOW,
        POLICY,
        language,
      );
    expect(week(sample, "en").totalMs).toBe(week(czech, "cs").totalMs);
    expect(week(sample, "en").clients.map((row) => row.name)).toContain("Own work");
  });
});
