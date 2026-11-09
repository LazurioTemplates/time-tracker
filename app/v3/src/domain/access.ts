import type { Entry } from "./entry.ts";

/** A person Lazurio stated: their subject (the key) and username (to show). */
export interface Person {
  subject: string;
  username: string | null;
}

/**
 * Who uses the App for one request and what that allows (decisions 0196 and
 * 0231). Lazurio states the application role through `appAccess` of
 * `@lazurio/module-kit`; the server maps it here for every request:
 *
 * - `admin` — the application admin: someone with the whole Environment, an
 *   application admin the Organization named, or a request from inside the
 *   Environment (an agent, a script; then without a person). Reads and
 *   corrects every entry, keeps projects and clients, publishes the draft.
 * - `user` — the application user: reads and changes only their own entries.
 * - `null` — Lazurio did not say who came: nothing but the session answer.
 *
 * This is the Organization's rule in code, a service of the Environment's
 * operator: it narrows what visitors with the App only can do, and is no
 * isolation against whoever runs the Environment.
 */
export type Viewer =
  | { role: "admin"; person: Person | null }
  | { role: "user"; person: Person }
  | { role: null; person: null };

export const NOBODY: Viewer = { role: null, person: null };

/** Whether the viewer may read, and therefore change, this entry. */
export function mayUseEntry(viewer: Viewer, value: Pick<Entry, "person">): boolean {
  if (viewer.role === "admin") return true;
  return viewer.role === "user" && viewer.person.subject === value.person;
}

/** Projects, clients, the whole draft and its publication are the admin's. */
export function isAdmin(viewer: Viewer): viewer is Extract<Viewer, { role: "admin" }> {
  return viewer.role === "admin";
}
