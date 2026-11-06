import { join } from "node:path";
import { z } from "zod";
import { collections } from "../domain/collections.ts";
import { DATA_REPO_TEMPLATE } from "./paths.ts";

/**
 * The JSON Schemas of the data repository, generated from the Zod schemas of
 * `src/domain/`: one per collection, describing a whole document (the
 * engine's envelope `schemaVersion`, `id`, `record`). They are output, never
 * edited by hand: `--write` writes them into the data repository template,
 * `--check` fails when they are stale. Rules a JSON Schema cannot say (an end
 * after its start, references between records) stay in the App and in the
 * data repository's validator.
 */
const TITLES = {
  clients: "Time Tracker client",
  projects: "Time Tracker project",
  entries: "Time Tracker time entry",
} as const;

export function renderSchemas(): { file: string; text: string }[] {
  return Object.entries(collections).map(([name, spec]) => {
    const document = z.strictObject({
      schemaVersion: z.literal(spec.schemaVersion),
      id: spec.id,
      record: spec.record,
    });
    const generated = z.toJSONSchema(document, { target: "draft-2020-12", io: "input" });
    const { $schema, ...rest } = generated as Record<string, unknown>;
    const output = {
      $schema,
      $id: spec.schemaVersion,
      title: TITLES[name as keyof typeof TITLES],
      $comment:
        "Generated from the Zod schemas of Time Tracker (app/v3/src/domain) by `bun run schema:export`. Do not edit.",
      ...rest,
    };
    return { file: `${name}.schema.json`, text: `${JSON.stringify(output, null, 2)}\n` };
  });
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    console.error("usage: schema.ts --write | --check");
    process.exit(2);
  }
  const stale: string[] = [];
  for (const { file, text } of renderSchemas()) {
    const path = join(DATA_REPO_TEMPLATE, "schemas", file);
    const current = await Bun.file(path)
      .text()
      .catch(() => null);
    if (current === text) continue;
    if (mode === "--write") await Bun.write(path, text);
    else stale.push(path);
  }
  if (stale.length > 0) {
    console.error(
      `Stale generated JSON Schema, run \`bun run schema:export\`:\n${stale.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(mode === "--write" ? "JSON Schemas written." : "JSON Schemas are current.");
}
