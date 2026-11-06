import dataRepository from "../../config/data-repository.json";
import { readDataDirectory } from "../data/directory.ts";
import { createRepositoryDbStore } from "../data/repository-db-store.ts";
import { checkRules, type RuleIssue } from "../domain/rules.ts";
import { instance, policy } from "../instance/settings.ts";
import { LANGUAGES } from "../language/messages.ts";
import { DATA_MOUNT, MODULE_ROOT, SEEDS } from "./paths.ts";

/**
 * The rules across records: `--seed` checks the example records this
 * repository carries (part of `bun run validate:data`), without it the Module's
 * data checkout `db/`, draft included (part of `bun run validate:db`). The
 * shape of every record is `src/validate-data.ts`'s.
 */
function report(label: string, issues: readonly RuleIssue[]): boolean {
  if (issues.length === 0) {
    console.log(`${label}: the rules across records hold`);
    return true;
  }
  console.error(`${label}: ${issues.length} problem(s)`);
  for (const issue of issues) console.error(`  ${issue.record}: ${issue.message}`);
  return false;
}

let ok = true;
if (process.argv.includes("--seed")) {
  // The example has no running timer, so any moment after it gives the same answer.
  const later = Date.parse("2100-01-01");
  for (const language of LANGUAGES) {
    const seed = readDataDirectory(SEEDS[language]);
    ok =
      report(`app/v3/seed/${language}`, [
        ...seed.issues,
        ...checkRules(seed, later, policy, language),
      ]) && ok;
  }
} else {
  const store = createRepositoryDbStore({
    mountRoot: DATA_MOUNT,
    expect: { ...dataRepository, within: MODULE_ROOT },
    intervalMs: 0,
    policy,
    language: instance.language,
  });
  try {
    const available = await store.available();
    ok = available.ok
      ? report("db/", await store.check())
      : report("db/", [{ record: "db/", message: available.message }]);
  } finally {
    store.close();
  }
}
process.exit(ok ? 0 : 1);
