import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LANGUAGES, messages } from "../src/language/messages.ts";

type Tree = Record<string, unknown>;

function shape(value: unknown, path = ""): string[] {
  if (typeof value === "function") return [`${path}()`];
  if (Array.isArray(value)) return [`${path}[${value.length}]`];
  if (value && typeof value === "object")
    return Object.entries(value as Tree).flatMap(([key, item]) => shape(item, `${path}.${key}`));
  return [path];
}

/** Every text of a message tree; a message that is a function is called with sample arguments. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const words = value as (...args: unknown[]) => string;
    try {
      return [words(2, 3, 4)];
    } catch {
      return [words("subject-of-a-person", "x", "y")];
    }
  }
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value as Tree).flatMap(strings);
  return [];
}

const UI = resolve(import.meta.dir, "..", "src", "ui");

describe("two languages, never mixed", () => {
  test("Czech and English have the same messages", () => {
    expect(shape(messages.en)).toEqual(shape(messages.cs));
    expect(LANGUAGES).toEqual(["cs", "en"]);
  });

  test("the English messages hold no Czech word", () => {
    const czech = /[áčďéěíňóřšťúůýž]/i;
    expect(strings(messages.en).filter((text) => czech.test(text))).toEqual([]);
  });

  test("the interface takes its words from the messages, not from its code", () => {
    const czech = /[áčďéěíňóřšťúůýž]/i;
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [join(directory, entry.name)]
            : [],
      );
    const server = resolve(import.meta.dir, "..", "src", "server");
    const domain = resolve(import.meta.dir, "..", "src", "domain");
    const data = resolve(import.meta.dir, "..", "src", "data");
    const offending = [...files(UI), ...files(server), ...files(domain), ...files(data)].filter(
      (path) => czech.test(readFileSync(path, "utf8")),
    );
    expect(offending).toEqual([]);
  });
});
