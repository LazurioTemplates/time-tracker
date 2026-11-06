// Validator of the Time Tracker data repository, run by repository-db before
// every publish (`validate` in repository-db.yaml) and by CI.
//
// It checks every document against the JSON Schemas in schemas/, which Time
// Tracker generates from its Zod schemas, and the rules a schema cannot say:
// the file name is the id, an end follows its start, a manual entry has an
// end, an entry names an existing project and a project an existing client.
// It has no dependencies (Bun parses the YAML) and never leaves this checkout
// or follows a symbolic link. Overlapping entries of one person are the App's
// check (`bun run validate:db` in app/v3), not a reason to refuse a publish.
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Schema = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
};

export const COLLECTIONS = ["clients", "projects", "entries"] as const;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

/** The subset of JSON Schema 2020-12 that the generated schemas use. */
export function check(schema: Schema, value: unknown, at = ""): string[] {
  const here = at || "(document)";
  if (schema.anyOf || schema.oneOf) {
    const options = schema.anyOf ?? schema.oneOf ?? [];
    const passing = options.filter((option) => check(option, value, at).length === 0).length;
    if (schema.oneOf ? passing !== 1 : passing === 0)
      return [`${here}: matches none of the allowed shapes`];
    return [];
  }
  const errors: string[] = [];
  for (const part of schema.allOf ?? []) errors.push(...check(part, value, at));
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = types.includes(actual) || (actual === "integer" && types.includes("number"));
    if (!ok) return [...errors, `${here}: expected ${types.join(" or ")}, got ${actual}`];
  }
  if ("const" in schema && value !== schema.const)
    errors.push(`${here}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    errors.push(`${here}: must be one of ${schema.enum.join(", ")}`);
  if (typeof value === "string") {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength)
      errors.push(`${here}: needs at least ${schema.minLength} character(s)`);
    if (schema.maxLength !== undefined && length > schema.maxLength)
      errors.push(`${here}: allows at most ${schema.maxLength} character(s)`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value))
      errors.push(`${here}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push(`${here}: must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push(`${here}: must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems)
      errors.push(`${here}: needs at least ${schema.minItems} item(s)`);
    if (schema.items)
      value.forEach((item, index) => {
        errors.push(...check(schema.items as Schema, item, `${at}/${index}`));
      });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? [])
      if (!(key in record)) errors.push(`${at}/${key}: is required`);
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties?.[key];
      if (property) errors.push(...check(property, item, `${at}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}/${key}: is not allowed`);
    }
  }
  return errors;
}

type Documents = Map<string, Record<string, unknown>>;

function readCollection(root: string, name: string, errors: string[]): Documents {
  const documents: Documents = new Map();
  const directory = join("data", name);
  let entries: string[];
  try {
    entries = readdirSync(join(root, directory)).sort();
  } catch {
    return documents;
  }
  for (const file of entries) {
    if (file === ".gitkeep") continue;
    const path = join(directory, file);
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) {
      errors.push(`${path}: a symbolic link; links are refused`);
      continue;
    }
    if (!stat.isFile() || !file.endsWith(".yaml")) {
      errors.push(`${path}: not a document <id>.yaml`);
      continue;
    }
    try {
      const value = Bun.YAML.parse(readFileSync(join(root, path), "utf8"));
      documents.set(path, (value ?? {}) as Record<string, unknown>);
    } catch (error) {
      errors.push(`${path}: not valid YAML (${error instanceof Error ? error.message : error})`);
    }
  }
  return documents;
}

export function validateRepository(root: string): string[] {
  const errors: string[] = [];
  const ids: Record<string, Set<string>> = {};
  const read: Record<string, Documents> = {};
  for (const name of COLLECTIONS) {
    const schema = JSON.parse(
      readFileSync(join(root, "schemas", `${name}.schema.json`), "utf8"),
    ) as Schema;
    const documents = readCollection(root, name, errors);
    read[name] = documents;
    ids[name] = new Set();
    for (const [path, document] of documents) {
      errors.push(...check(schema, document).map((error) => `${path} ${error}`));
      const id = document.id;
      const expected = decodeURIComponent(path.slice(`data/${name}/`.length, -".yaml".length));
      if (id !== expected) errors.push(`${path}: the id must be ${JSON.stringify(expected)}`);
      if (typeof id === "string") ids[name]?.add(id);
    }
  }
  const record = (document: Record<string, unknown>) =>
    (document.record ?? {}) as Record<string, unknown>;
  for (const [path, document] of read.projects ?? []) {
    const client = record(document).client;
    if (typeof client === "string" && !ids.clients?.has(client))
      errors.push(`${path}: the client ${client} does not exist`);
  }
  for (const [path, document] of read.entries ?? []) {
    const value = record(document);
    if (typeof value.project === "string" && !ids.projects?.has(value.project))
      errors.push(`${path}: the project ${value.project} does not exist`);
    const start = typeof value.startedAt === "string" ? Date.parse(value.startedAt) : Number.NaN;
    const end = typeof value.endedAt === "string" ? Date.parse(value.endedAt) : null;
    if (end !== null && end < start) errors.push(`${path}: the end precedes the start`);
    if (value.source === "manual" && value.endedAt === null)
      errors.push(`${path}: a manual entry has an end`);
    if (value.autoStoppedAt !== null && value.autoStoppedAt !== undefined && value.endedAt === null)
      errors.push(`${path}: an automatic stop needs an end`);
  }
  return errors;
}

if (import.meta.main) {
  const errors = validateRepository(process.cwd());
  if (errors.length > 0) {
    console.error(`Time Tracker data: ${errors.length} problem(s)`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log("Time Tracker data: OK");
}
