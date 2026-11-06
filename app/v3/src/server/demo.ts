import { parseArgs } from "node:util";
import { createMemoryStore } from "../data/memory-store.ts";
import { DEMO_PEOPLE, demoData } from "../demo/sample.ts";
import { instance, policy } from "../instance/settings.ts";
import { isLanguage } from "../language/messages.ts";
import { serve } from "./serve.ts";

/**
 * `bun run dev:demo`: the App over the fictional example records of
 * `seed/<language>/`, moved to the current weeks and held in memory. Nothing
 * is read from or written to a data repository, and every change is gone when
 * the process ends. For trying the template and for the Marketplace
 * screenshots; never the start of a real Module.
 *
 *   bun run dev:demo                    Czech, as a fictional application admin
 *   bun run dev:demo --lang en          the English example
 *   bun run dev:demo --as user          as a fictional application user
 *
 * The demo's visitor is a fictional person of the example. Only the demo does
 * this: the App reads the person from Lazurio.
 */
const { values } = parseArgs({
  options: { as: { type: "string", default: "admin" }, lang: { type: "string" } },
});
const language = values.lang ?? instance.language;
if (!isLanguage(language) || (values.as !== "admin" && values.as !== "user")) {
  console.error("usage: dev:demo [--lang cs|en] [--as admin|user]");
  process.exit(2);
}
const person = values.as === "user" ? DEMO_PEOPLE.user : DEMO_PEOPLE.admin;
const viewer =
  values.as === "user" ? ({ role: "user", person } as const) : ({ role: "admin", person } as const);

const data = demoData(Date.now(), policy, language);
await serve(() => createMemoryStore(data, { policy, language }), {
  label: `demo (${language}) as the fictional ${viewer.role} ${person.username}, example data in memory`,
  viewer: () => ({ viewer, entry: "app" }),
  language,
});
