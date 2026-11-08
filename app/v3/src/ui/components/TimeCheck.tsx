import { localDay, localTime, utcOffsetText } from "../../domain/calendar.ts";
import type { FieldResolution, IntervalResult, Occurrence } from "../../domain/interval.ts";
import { useApp } from "../context.ts";
import { stopwatch } from "../format.ts";
import { Notice } from "./common.tsx";

/**
 * What the entered times mean, worked out in the page with the function the
 * server uses. A time in the hour the clocks repeat keeps its choice of
 * occurrence in view for as long as it applies, preselected with the moment it
 * stands for, so the person sees and can change it before saving; a time they
 * skip, or an end not after the start, is an error. When the clocks change
 * within the entry, the moments it will store are shown with their offsets.
 */
export function TimeCheck({
  id,
  result,
  chosen,
  onChoose,
}: {
  id: string;
  result: IntervalResult;
  /** The occurrences the person named; empty until they choose. */
  chosen: { from?: Occurrence | undefined; to?: Occurrence | undefined };
  onChoose: (field: "from" | "to", occurrence: Occurrence) => void;
}) {
  const { session, fmt, t } = useApp();
  const tz = session.policy.timeZone;
  const fields: ["from" | "to", FieldResolution | null][] = [
    ["from", result.from],
    ["to", result.to],
  ];
  const repeated = fields.filter(
    (entry): entry is ["from" | "to", FieldResolution] => entry[1]?.moments.length === 2,
  );
  const problem = result.ok ? null : result;
  return (
    <>
      {repeated.map(([field, info]) => {
        const [earlier = 0, later = 0] = info.moments;
        const value = chosen[field] ?? info.occurrence ?? "";
        return (
          <div className="field" key={field}>
            <label htmlFor={`${id}-${field}-occurrence`}>
              {t.field.occurrence}: {fmt.date(info.day)} {info.time}
            </label>
            <select
              id={`${id}-${field}-occurrence`}
              required
              value={value}
              onChange={(e) => onChoose(field, e.target.value as Occurrence)}
            >
              <option value="" disabled>
                {t.server.ambiguousTime(fmt.date(info.day), info.time)}
              </option>
              <option value="earlier">
                {t.field.occurrenceOption(true, utcOffsetText(earlier, tz))}
              </option>
              <option value="later">
                {t.field.occurrenceOption(false, utcOffsetText(later, tz))}
              </option>
            </select>
          </div>
        );
      })}
      {problem?.problem === "missing" ? (
        <Notice tone="error">
          {t.server.nonexistentTime(fmt.date(problem.day), problem.time)}
        </Notice>
      ) : null}
      {problem?.problem === "order" ? <Notice tone="error">{t.server.endAfterStart}</Notice> : null}
      {result.ok && result.endedAt !== null && repeated.length > 0 ? (
        <p className="tt-muted tt-small">
          {t.field.willStore(
            `${fmt.date(localDay(result.startedAt, tz))} ${localTime(result.startedAt, tz)} (${utcOffsetText(Date.parse(result.startedAt), tz)})`,
            `${fmt.date(localDay(result.endedAt, tz))} ${localTime(result.endedAt, tz)} (${utcOffsetText(Date.parse(result.endedAt), tz)})`,
            stopwatch(Date.parse(result.endedAt) - Date.parse(result.startedAt)).replace(
              /:\d\d$/,
              "",
            ),
          )}
        </p>
      ) : null}
    </>
  );
}
