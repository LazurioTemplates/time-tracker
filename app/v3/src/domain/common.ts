import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The stable id of a client or a project: lowercase letters, digits and dashes. */
export const slugId = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, "Use lowercase letters, digits and dashes.");

/**
 * A person's Lazurio subject, a lowercase UUID: the key a person is
 * remembered by (`appAccess` of `@lazurio/module-kit`, decision 0231).
 */
export const subject = z.string().regex(UUID, "A Lazurio subject is a lowercase UUID.");

/** The id of a time entry: a lowercase UUID the client generates. */
export const entryId = z.string().regex(UUID, "An entry id is a lowercase UUID.");

/** A moment, ISO 8601 in UTC (`2026-11-05T08:30:00.000Z`). */
export const instant = z.iso.datetime();

/** A calendar day in the Organization's time zone, `YYYY-MM-DD`. */
export const day = z.iso.date();

/** A time of day, `HH:MM`, 24-hour clock. */
export const clock = z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/, "Use HH:MM.");

/** The id a new client or project gets from its name, unique among `taken`. */
export function slugFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "record";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
