import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { check, validateRepository } from "../../../templates/data-repo/scripts/validate.ts";
import { DATA_REPO_TEMPLATE } from "../src/cli/paths.ts";
import { renderSchemas } from "../src/cli/schema.ts";
import { collections } from "../src/domain/collections.ts";
import { createFixtureRepo } from "./support/fixture-repo.ts";
import { newEntry, sampleData } from "./support/seed.ts";

const schema = (file: string) =>
  JSON.parse(readFileSync(join(DATA_REPO_TEMPLATE, "schemas", file), "utf8"));

describe("data repository template", () => {
  test("its JSON Schemas are the ones generated from the Zod schemas", () => {
    for (const { file, text } of renderSchemas())
      expect(readFileSync(join(DATA_REPO_TEMPLATE, "schemas", file), "utf8")).toBe(text);
  });

  test("its validator agrees with the Zod schemas on the shape of a document", () => {
    const sample = sampleData();
    const entries = schema("entries.schema.json");
    const entryDocument = z.strictObject({
      schemaVersion: z.literal(collections.entries.schemaVersion),
      id: collections.entries.id,
      record: collections.entries.record,
    });
    const id = "f0000000-0000-4000-8000-000000000001";
    const documents = [
      ...sample.entries
        .slice(0, 5)
        .map((row) => ({ schemaVersion: "time-tracker.entry.v1", id: row.id, record: row.value })),
      { schemaVersion: "time-tracker.entry.v1", id, record: newEntry() },
      { schemaVersion: "time-tracker.entry.v2", id, record: newEntry() },
      { schemaVersion: "time-tracker.entry.v1", id: "NOT-A-UUID", record: newEntry() },
      { schemaVersion: "time-tracker.entry.v1", id, record: { ...newEntry(), extra: 1 } },
      { schemaVersion: "time-tracker.entry.v1", id, record: { ...newEntry(), source: "guess" } },
      {
        schemaVersion: "time-tracker.entry.v1",
        id,
        record: { ...newEntry(), note: "x".repeat(501) },
      },
      {
        schemaVersion: "time-tracker.entry.v1",
        id,
        record: { ...newEntry(), startedAt: "yesterday" },
      },
      {
        schemaVersion: "time-tracker.entry.v1",
        id,
        record: { ...newEntry(), person: "alexmorgan" },
      },
    ];
    for (const value of documents)
      expect(check(entries, value).length === 0).toBe(entryDocument.safeParse(value).success);
    const projects = schema("projects.schema.json");
    const project = { name: "Web", client: null, billable: true, archived: false };
    for (const value of [
      { schemaVersion: "time-tracker.project.v1", id: "web", record: project },
      { schemaVersion: "time-tracker.project.v1", id: "Web!", record: project },
      { schemaVersion: "time-tracker.project.v1", id: "web", record: { ...project, name: "" } },
      {
        schemaVersion: "time-tracker.project.v1",
        id: "web",
        record: { ...project, billable: "yes" },
      },
    ])
      expect(check(projects, value).length === 0).toBe(
        z
          .strictObject({
            schemaVersion: z.literal("time-tracker.project.v1"),
            id: collections.projects.id,
            record: collections.projects.record,
          })
          .safeParse(value).success,
      );
  });

  test("the validator passes the empty and the example start and refuses broken references", () => {
    const empty = createFixtureRepo();
    const example = createFixtureRepo({ sample: true });
    try {
      expect(validateRepository(empty.mountRoot)).toEqual([]);
      expect(validateRepository(example.mountRoot)).toEqual([]);
    } finally {
      empty.cleanup();
      example.cleanup();
    }
  });
});
