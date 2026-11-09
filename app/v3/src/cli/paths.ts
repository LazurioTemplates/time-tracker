import { resolve } from "node:path";

/** The Module root: `app/v3/src/cli` → four levels up. */
export const MODULE_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
/** The data repository skeleton an adopting Organization starts from. */
export const DATA_REPO_TEMPLATE = resolve(MODULE_ROOT, "templates", "data-repo");
/** The fictional example records, one set per language: the "example data" start. */
export const SEEDS = {
  cs: resolve(MODULE_ROOT, "app", "v3", "seed", "cs"),
  en: resolve(MODULE_ROOT, "app", "v3", "seed", "en"),
} as const;
/** The Module's data checkout. */
export const DATA_MOUNT = resolve(MODULE_ROOT, "db");
