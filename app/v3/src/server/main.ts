import { resolve } from "node:path";
import dataRepository from "../../config/data-repository.json";
import { createRepositoryDbStore } from "../data/repository-db-store.ts";
import { instance, policy } from "../instance/settings.ts";
import { serve } from "./serve.ts";
import { copyWrites } from "./viewer.ts";

/** The Module root (`app/v3/src/server` → four levels up); its `db/` is the data checkout. */
const moduleRoot = resolve(import.meta.dir, "..", "..", "..", "..");

await serve(
  () =>
    createRepositoryDbStore({
      mountRoot: resolve(moduleRoot, "db"),
      expect: { ...dataRepository, within: moduleRoot },
      policy,
      language: instance.language,
      // A copy that may not write changes nothing and keeps no sync of its
      // own; the host keeps its read-only replica.
      writes: copyWrites(),
    }),
  { label: "v3" },
);
