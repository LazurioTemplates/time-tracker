import { type AppAccess, appAccess } from "@lazurio/module-kit";
import { dataWriter } from "@lazurio/module-kit/tools";
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
 * Whether this request may change the App's data now, by the one writer rule
 * of `@lazurio/module-kit/tools` (`dataWriter`, Module Standard, Applications
 * of an Organization): on an Application host only `LAZURIO_RUNTIME_DATA_WRITER=true`
 * writes. What a development version does without the variable is the
 * standard's open point; the App follows the module kit and builds nothing of
 * its own on either variant.
 */
export function mayWriteOf(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return dataWriter(appAccess(request, LISTENER, env), env);
}
