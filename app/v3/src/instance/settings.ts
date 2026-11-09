import type { Policy } from "../domain/policy.ts";
import type { Language } from "../language/messages.ts";

/**
 * The Organization's own settings of Time Tracker. An adopting Organization
 * replaces the placeholder name; the rest are defaults it may change in a pull
 * request of its own (`docs/extending.md`).
 */
export const instance: { organization: string; language: Language } = {
  /** The Organization's display name in the header. */
  organization: "Organization",
  /**
   * The language of the App for everyone: `cs` (the default) or `en`. Lazurio
   * does not pass a language to a Module's App yet, so the agent that adopts
   * the template sets it from the language of the Organization's Lazurio,
   * the `locale` of the Folder profile (Settings → General), and the person
   * confirms it (`docs/adoption.md`).
   */
  language: "cs",
};

export const policy: Policy = {
  /** Days, weeks and months are counted in this time zone, on every device. */
  timeZone: "Europe/Prague",
  /** A timer nobody stopped ends by itself this long after its start. */
  timerLimitHours: 10,
  /** Working days, ISO numbering (1 = Monday … 7 = Sunday). */
  workdays: [1, 2, 3, 4, 5],
  /** Public holidays that are not working days: `cz` or none. */
  holidays: "cz",
};
