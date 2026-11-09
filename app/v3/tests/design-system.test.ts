import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import packageJson from "../package.json";

// The design system is the package `design-system` at a released tag
// (LazurioTemplates/design-system, docs/adoption.md "Using the design system in
// another module"; Module Standard: a design system's assets come as a
// dependency on its package, never by a relative path).
const app = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );

describe("the design system", () => {
  test("is a dependency on a released tag, locked in bun.lock", () => {
    const pin = (packageJson.dependencies as Record<string, string>)["design-system"];
    expect(pin).toMatch(/^github:LazurioTemplates\/design-system#v\d+\.\d+\.\d+$/);
    const lock = read("bun.lock");
    expect(lock).toContain(`"design-system": "${pin}"`);
    // Bun records the tag's object and the tarball's sha512.
    expect(lock).toMatch(
      /"design-system@github:LazurioTemplates\/design-system#[0-9a-f]{7,40}",[^\n]*"sha512-[A-Za-z0-9+/=]+"/,
    );
  });

  test("is imported from the package only, never by a path or as a copy", () => {
    expect(existsSync(join(app, "design-system"))).toBe(false);
    expect(existsSync(join(app, "design-system.lock.json"))).toBe(false);
    for (const path of files(join(app, "src"))) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toMatch(/from "(\.\.?\/)+[^"]*design-system/);
      expect(text).not.toMatch(/import "(\.\.?\/)+[^"]*design-system/);
    }
    const main = read("src/ui/main.tsx");
    expect(main).toContain('import "design-system/styles.css";');
    expect(main.indexOf('import "design-system/styles.css";')).toBeLessThan(
      main.indexOf('import "./styles.css";'),
    );
  });

  test("the App's own styles use its tokens and never restyle its components", () => {
    const css = read("src/ui/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/gi) ?? []).toEqual([]);
    expect(css).not.toMatch(/var\(--(?!ds-)/);
    const selectors = css
      .split("}")
      .map((block) => block.split("{")[0]?.trim() ?? "")
      .filter((selector) => selector !== "" && !selector.startsWith("@"));
    const classes = selectors.flatMap((selector) =>
      [...selector.matchAll(/\.([a-z][a-z0-9_-]*)/g)].map((match) => match[1] ?? ""),
    );
    expect(classes.filter((name) => !name.startsWith("tt-"))).toEqual([]);
  });

  test("the interface uses the design system's classes and its own `tt-` ones only", () => {
    const names = files(join(app, "src/ui"))
      .filter((path) => path.endsWith(".tsx"))
      .flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].flatMap(
          (match) => (match[1] ?? match[2] ?? "").replace(/\$\{[^}]*\}/g, " ").split(/\s+/),
        ),
      )
      .filter((name) => name !== "");
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !/^(ds|tt)-/.test(name))).toEqual([]);
  });
});
