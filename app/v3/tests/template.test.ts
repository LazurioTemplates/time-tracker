import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import packageJson from "../package.json";

// What the Lazurio Marketplace registry and the template contract ask of every
// release (Lazurio/marketplace, CONTRIBUTING.md and src/sources.ts).
const root = resolve(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function webpSize(path: string): { width: number; height: number } | null {
  const bytes = readFileSync(path);
  const ascii = (from: number, to: number) => bytes.subarray(from, to).toString("latin1");
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  const at = (i: number) => bytes[i] ?? 0;
  switch (ascii(12, 16)) {
    case "VP8X":
      return {
        width: 1 + (at(24) | (at(25) << 8) | (at(26) << 16)),
        height: 1 + (at(27) | (at(28) << 8) | (at(29) << 16)),
      };
    case "VP8 ":
      return {
        width: (at(26) | (at(27) << 8)) & 0x3fff,
        height: (at(28) | (at(29) << 8)) & 0x3fff,
      };
    case "VP8L":
      return {
        width: 1 + (at(21) | ((at(22) & 0x3f) << 8)),
        height: 1 + (((at(22) >> 6) | (at(23) << 2) | ((at(24) & 0x0f) << 10)) & 0x3fff),
      };
    default:
      return null;
  }
}

describe("the template contract", () => {
  test("MIT by Lazurio contributors, with the documents a release needs", () => {
    expect(read("LICENSE")).toContain("MIT License");
    expect(read("LICENSE")).toContain("Copyright (c) 2026 Lazurio contributors");
    for (const path of [
      "README.md",
      "AGENTS.md",
      "CHANGELOG.md",
      "NOTICE.md",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "docs/adoption.md",
      "docs/extending.md",
      "docs/data.md",
      "docs/access.md",
    ])
      expect(existsSync(join(root, path))).toBe(true);
    for (const path of ["README.md", "docs/extending.md"])
      expect(read(path)).toContain("app-data@2026.11");
    expect(read("CHANGELOG.md")).toContain("## 0.1.0");
  });

  test("the Module and its App, with the Organization as placeholders", () => {
    const manifest = JSON.parse(read("lazurio.module.json"));
    expect(manifest).toMatchObject({
      schema_version: "lazurio.module.v1",
      id: "time-tracker",
      company: "REPLACE-WITH-ORG-NAME",
      apps: ["app/v3/package.json"],
      default_app: "app/v3/package.json",
    });
    const runtime = packageJson.lazurio.runtime;
    expect(runtime.id).toBe("replace-with-org-slug-time-tracker-v3");
    expect(runtime.company).toBe("REPLACE-WITH-ORG-NAME");
    // The built version from main: a client build and the App's own server.
    expect(runtime.build_script).toBe("build");
    expect(runtime.build_output).toBe("dist");
    expect(runtime.start_script).toBe("start");
    expect(runtime.listeners[0]?.health.path).toBe("/healthz");
    expect(read("app/v3/config/data-repository.json")).toContain(
      "git@github.com:REPLACE-WITH-ORG-NAME/time-tracker-data.git",
    );
  });

  test("exact versions and the pinned Bun, also in CI", () => {
    expect(packageJson.packageManager).toBe("bun@1.4.4");
    for (const version of [
      ...Object.values(packageJson.dependencies),
      ...Object.values(packageJson.devDependencies),
    ])
      expect(version).not.toMatch(/^[\^~]|^latest$|\*/);
    for (const workflow of ["checks.yml", "windows-portability.yml"]) {
      const text = read(`.github/workflows/${workflow}`);
      expect(text).toContain("bun-version: 1.4.4");
      expect(text).toContain("bun run check");
    }
  });

  test("the same Marketplace screens in Czech and English, 1600 px wide", () => {
    const shots = (language: string) =>
      readdirSync(join(root, "docs/screenshots", language))
        .filter((name) => name.endsWith(".webp"))
        .sort();
    expect(shots("cs").length).toBeGreaterThanOrEqual(3);
    expect(shots("en")).toEqual(shots("cs"));
    for (const language of ["cs", "en"])
      for (const name of shots(language)) {
        const path = join(root, "docs/screenshots", language, name);
        expect(webpSize(path)).toEqual({ width: 1600, height: 1000 });
        expect(readFileSync(path).length).toBeLessThan(2 * 1024 * 1024);
      }
  });

  test("the skills for agents, the same for both harnesses", () => {
    const skills = readdirSync(join(root, ".agents/skills")).sort();
    expect(skills).toEqual(["find-missing-days", "record-time", "timesheet-for-invoicing"]);
    for (const skill of skills) {
      const text = read(`.agents/skills/${skill}/SKILL.md`);
      expect(text).toStartWith(`---\nname: ${skill}\ndescription: "`);
      expect(read(`.claude/skills/${skill}/SKILL.md`)).toBe(text);
    }
  });
});
