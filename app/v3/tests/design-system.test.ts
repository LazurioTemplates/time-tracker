import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { designSystemProblems, parsePin } from "./support/design-system-pin.ts";

// The design system is the package `design-system` at a released tag: the
// template's public one, or after adoption the Organization's own over SSH
// (design system docs/adoption.md "Using the design system in another
// module"; Module Standard: a design system's assets come as a dependency on
// its package, never by a relative path).
const app = resolve(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(app, path), "utf8");
const files = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );

describe("the design system", () => {
  test("is a dependency on a released tag, locked in bun.lock", () => {
    expect(designSystemProblems(read("package.json"), read("bun.lock"))).toEqual([]);
  });

  test("an Organization's own design system over SSH at a released tag passes too", () => {
    // The adoption case: docs/adoption.md and docs/extending.md change the
    // dependency to the Organization's private repository; Bun locks its commit.
    const fixture = join(import.meta.dir, "fixtures", "organization-design-system");
    const manifest = readFileSync(join(fixture, "package.json"), "utf8");
    const lock = readFileSync(join(fixture, "bun.lock"), "utf8");
    expect(parsePin(JSON.parse(manifest).dependencies["design-system"])).toEqual({
      form: "git+ssh",
      owner: "ExampleOrganization",
      tag: "v2.1.0",
    });
    expect(designSystemProblems(manifest, lock)).toEqual([]);
    // The same lock with the template's dependency swapped back in is a mismatch.
    const template = manifest.replace(
      "git+ssh://git@github.com/ExampleOrganization/design-system.git#v2.1.0",
      "github:LazurioTemplates/design-system#v2.0.0",
    );
    expect(designSystemProblems(template, lock)[0]).toContain("bun.lock records");
  });

  test("only the two forms at a released tag, and a lock that resolved exactly that", () => {
    for (const pin of [
      "github:LazurioTemplates/design-system#v2.0.0",
      "git+ssh://git@github.com/Some-Org/design-system.git#v10.0.12",
    ])
      expect(typeof parsePin(pin)).toBe("object");
    for (const pin of [
      "github:LazurioTemplates/design-system#main",
      "github:LazurioTemplates/design-system#05bc729581bd1aa1060b73fe8e03b3c38a56dcd3",
      "github:LazurioTemplates/design-system",
      "github:LazurioTemplates/design-system#v2.0",
      "github:LazurioTemplates/design-system#v2.0.0-rc.1",
      "github:LazurioTemplates/other#v2.0.0",
      "git+https://github.com/LazurioTemplates/design-system.git#v2.0.0",
      "git+ssh://git@github.com/Some-Org/design-system.git#release",
      "git+ssh://git@gitlab.com/Some-Org/design-system.git#v2.0.0",
      "file:../design-system",
      "../design-system",
      "2.0.0",
    ])
      expect(typeof parsePin(pin)).toBe("string");

    const manifest = (pin: string) => JSON.stringify({ dependencies: { "design-system": pin } });
    const lock = (pin: string, entry: string) =>
      `{\n  "workspaces": { "": { "dependencies": { "design-system": "${pin}", }, }, },\n  "packages": { "design-system": [${entry}], }\n}`;
    const ssh = "git+ssh://git@github.com/Some-Org/design-system.git#v2.1.0";
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const sshEntry = (resolved: string, last: string) =>
      `"design-system@git+ssh://git@github.com/${resolved}", {}, "${last}"`;
    expect(
      designSystemProblems(
        manifest(ssh),
        lock(ssh, sshEntry(`Some-Org/design-system.git#${commit}`, commit)),
      ),
    ).toEqual([]);
    // A short commit, another commit in the last field or another owner is refused.
    expect(
      designSystemProblems(
        manifest(ssh),
        lock(ssh, sshEntry("Some-Org/design-system.git#0123456", "0123456")),
      ),
    ).toHaveLength(1);
    expect(
      designSystemProblems(
        manifest(ssh),
        lock(ssh, sshEntry(`Some-Org/design-system.git#${commit}`, "f".repeat(40))),
      ),
    ).toHaveLength(1);
    expect(
      designSystemProblems(
        manifest(ssh),
        lock(ssh, sshEntry(`Other-Org/design-system.git#${commit}`, commit)),
      ),
    ).toHaveLength(1);

    const github = "github:LazurioTemplates/design-system#v2.0.0";
    const githubEntry = (sha512: string) =>
      `"design-system@github:LazurioTemplates/design-system#23af5a3", {}, "LazurioTemplates-design-system-23af5a3", "${sha512}"`;
    expect(
      designSystemProblems(manifest(github), lock(github, githubEntry("sha512-abc+/="))),
    ).toEqual([]);
    // A github: lock without the tarball's sha512 is refused.
    expect(
      designSystemProblems(manifest(github), lock(github, githubEntry("23af5a3"))),
    ).toHaveLength(1);
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
