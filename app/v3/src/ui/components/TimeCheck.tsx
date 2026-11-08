import { utcOffsetText } from "../../domain/calendar.ts";
import type { IntervalResult, Occurrence } from "../../domain/interval.ts";
import { useApp } from "../context.ts";
import { Notice } from "./common.tsx";

/**
 * What the entered times need before they can be saved, worked out in the
 * page with the same function the server uses: a time the clocks skip is an
 * error, a time they repeat asks which occurrence is meant.
 */
export function TimeCheck({
  id,
  result,
  occurrences,
  onChoose,
}: {
  id: string;
  result: IntervalResult;
  occurrences: { from?: Occurrence | undefined; to?: Occurrence | undefined };
  onChoose: (field: "from" | "to", occurrence: Occurrence) => void;
}) {
  const { session, fmt, t } = useApp();
  if (result.ok) return null;
  const day = fmt.date(result.day);
  if (result.problem === "order") return <Notice tone="error">{t.server.endAfterStart}</Notice>;
  if (result.problem === "missing")
    return <Notice tone="error">{t.server.nonexistentTime(day, result.time)}</Notice>;
  const [earlier = 0, later = 0] = result.moments;
  const tz = session.policy.timeZone;
  return (
    <div className="field">
      <label htmlFor={`${id}-${result.field}-occurrence`}>
        {t.field.occurrence} ({result.time})
      </label>
      <select
        id={`${id}-${result.field}-occurrence`}
        required
        value={occurrences[result.field] ?? ""}
        onChange={(e) => onChoose(result.field, e.target.value as Occurrence)}
      >
        <option value="" disabled>
          {t.server.ambiguousTime(day, result.time)}
        </option>
        <option value="earlier">
          {t.field.occurrenceOption(true, utcOffsetText(earlier, tz))}
        </option>
        <option value="later">{t.field.occurrenceOption(false, utcOffsetText(later, tz))}</option>
      </select>
    </div>
  );
}
