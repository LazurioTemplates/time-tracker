import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { contrastRatio, roleColor, tokens } from "../design-system/app/v1/src/tokens.ts";
import lock from "../design-system.lock.json";

// The design system is a merged release of LazurioTemplates/design-system,
// kept unchanged in app/v3/design-system so that a newer release arrives by
// merging its tag (docs/extending.md). These tests hold that promise.
const app = resolve(import.meta.dir, "..");
const git = (...args: string[]) => spawnSync("git", ["-C", app, ...args], { encoding: "utf8" });

describe("the design system", () => {
  test("is exactly the locked release, untouched", () => {
    expect(lock.prefix).toBe("app/v3/design-system");
    const tree = git("rev-parse", "HEAD:./design-system");
    expect(tree.status).toBe(0);
    expect(tree.stdout.trim()).toBe(lock.tree);
    // No change of it waits in the working tree either.
    expect(git("diff", "--quiet", "HEAD", "--", "design-system").status).toBe(0);
  });

  test("its tokens give every role a colour in both themes, readable as text", () => {
    for (const theme of ["light", "dark"] as const) {
      const text = roleColor(tokens, theme, "text");
      expect(contrastRatio(text, roleColor(tokens, theme, "surface"))).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(roleColor(tokens, theme, "on-accent"), roleColor(tokens, theme, "accent")),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("the App takes it from the subtree and copies none of it", () => {
    const main = readFileSync(join(app, "src/ui/main.tsx"), "utf8");
    expect(main).toContain('from "../../design-system/app/v1/src/tokens.ts"');
    expect(main).toContain('import "../../design-system/app/v1/src/styles/global.css"');
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
      );
    expect(files(join(app, "src")).filter((path) => path.endsWith("tokens.json"))).toEqual([]);
    expect(existsSync(join(app, "src/design-system"))).toBe(false);
  });

  test("the App's own styles name tokens, never a colour", () => {
    const css = readFileSync(join(app, "src/ui/styles.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(css.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/gi) ?? []).toEqual([]);
    // Every own class is the App's (`tt-`), so none overrides a component of the design system by accident.
    const own = [...css.matchAll(/^\.([a-z][a-z0-9-]*)/gm)].map((match) => match[1]);
    expect(own.filter((name) => !name?.startsWith("tt-"))).toEqual(["app-nav", "field", "notice"]);
  });
});
