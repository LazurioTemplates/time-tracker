import { type AppAccess, appAccess } from "@lazurio/module-kit";
import { dataWriter, deployment } from "@lazurio/module-kit/tools";
import { NOBODY, type Viewer } from "../domain/access.ts";

/** The App's one listener (`lazurio.runtime.listeners[0].id`). */
export const LISTENER = "app";

/** What the session answer tells the browser about the entry, besides the role. */
export type Entry = AppAccess["entry"];

/**
 * Who uses the App for this request, read from Lazurio for every request and
 * never cached (decision 0231): `appAccess` of `@lazurio/module-kit` is the
 * only source. A name or a role from the browser, the operating system or the
 * Environment's assignee is never used. `unknown` grants no role.
 */
export function viewerOf(request: Request): { viewer: Viewer; entry: Entry } {
  const access = appAccess(request, LISTENER);
  const person = access.person
    ? { subject: access.person.subject, username: access.person.username }
    : null;
  if (access.appRole === "admin") return { viewer: { role: "admin", person }, entry: access.entry };
  if (access.appRole === "user" && person)
    return { viewer: { role: "user", person }, entry: access.entry };
  return { viewer: NOBODY, entry: access.entry };
}

/**
 * Whether this copy of the App may write at all (Module Standard,
 * Applications of an Organization): with `LAZURIO_RUNTIME_DATA_WRITER` only
 * `true` writes; without it, a runtime that states
 * `LAZURIO_RUNTIME_DEPLOYMENT=production` never writes. A copy that may not
 * write changes nothing and never fetches, pulls or publishes.
 */
export function copyWrites(env: Record<string, string | undefined> = process.env): boolean {
  const writer = env.LAZURIO_RUNTIME_DATA_WRITER;
  return writer === undefined ? deployment(env) !== "production" : writer === "true";
}

/**
 * Whether this request may change the App's data now: the copy writes, and
 * the module kit's `dataWriter` lets this entry write. What a development
 * version does without the variable is the standard's open point; the App
 * follows the module kit there. Since module-kit 0.4.1 `dataWriter` itself
 * never writes in a runtime stating production without the variable;
 * `copyWrites` states the same rule in the App and comes first.
 */
export function mayWriteOf(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return copyWrites(env) && dataWriter(appAccess(request, LISTENER, env), env);
}
