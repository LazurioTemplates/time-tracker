import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseYaml } from "@lazurio/repository-db";
import type { Client } from "../domain/client.ts";
import { COLLECTION_NAMES, type CollectionName } from "../domain/collections.ts";
import type { Entry } from "../domain/entry.ts";
import type { Project } from "../domain/project.ts";
import type { Keyed, RuleIssue } from "../domain/rules.ts";
import { parseDocument } from "./records.ts";

/**
 * Reads Time Tracker records from a plain directory laid out like the data
 * repository's `data/` (one directory per collection, one `<id>.yaml` each),
 * outside any data checkout: the example records this repository ships
 * (`app/v3/seed/`). The running App never uses it; its data goes through the
 * storage port.
 */
export interface DirectoryData {
  clients: Keyed<Client>[];
  projects: Keyed<Project>[];
  entries: Keyed<Entry>[];
  issues: RuleIssue[];
}

export function readDataDirectory(root: string): DirectoryData {
  const issues: RuleIssue[] = [];
  const read = <C extends CollectionName>(collection: C) => {
    const directory = join(root, collection);
    let names: string[];
    try {
      names = readdirSync(directory).sort();
    } catch {
      return [];
    }
    return names.flatMap((name) => {
      if (name === ".gitkeep") return [];
      const path = join(directory, name);
      const id = decodeURIComponent(name.replace(/\.yaml$/, ""));
      try {
        if (!lstatSync(path).isFile() || !name.endsWith(".yaml"))
          throw new Error("not a document <id>.yaml");
        return [
          { id, value: parseDocument(collection, id, parseYaml(readFileSync(path, "utf8"))) },
        ];
      } catch (error) {
        issues.push({
          record: `${collection}/${id}`,
          message: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    });
  };
  const [clients, projects, entries] = COLLECTION_NAMES.map((name) => read(name)) as [
    Keyed<Client>[],
    Keyed<Project>[],
    Keyed<Entry>[],
  ];
  return { clients, projects, entries, issues };
}
