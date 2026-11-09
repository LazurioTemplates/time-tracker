import { Select } from "design-system/react";
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
  const { session, fmt, t, language } = useApp();
  const tz = session.policy.timeZone;
  const fields: ["from" | "to", FieldResolution | null][] = [
    ["from", result.from],
    ["to", result.to],
  ];
  const repeated = fields.filter(
    (entry): entry is ["from" | "to", FieldResolution] => entry[1]?.moments.length === 2,
  );
  const problem = result.ok ? null : result;
  const moment = (iso: string) =>
    `${fmt.date(localDay(iso, tz))} ${localTime(iso, tz)} (${utcOffsetText(Date.parse(iso), tz)})`;
  return (
    <>
      {repeated.map(([field, info]) => {
        const [earlier = 0, later = 0] = info.moments;
        return (
          <Select
            key={field}
            id={`${id}-${field}-occurrence`}
            label={`${t.field.occurrence}: ${fmt.date(info.day)} ${info.time}`}
            hint={t.server.ambiguousTime(fmt.date(info.day), info.time)}
            locale={language}
            required
            placeholder={t.field.chooseOccurrence}
            value={chosen[field] ?? info.occurrence ?? ""}
            onChange={(event) => onChoose(field, event.target.value as Occurrence)}
            options={[
              {
                value: "earlier",
                label: t.field.occurrenceOption(true, utcOffsetText(earlier, tz)),
              },
              { value: "later", label: t.field.occurrenceOption(false, utcOffsetText(later, tz)) },
            ]}
          />
        );
      })}
      {problem?.problem === "missing" ? (
        <Notice tone="error">
          {t.server.nonexistentTime(fmt.date(problem.day), problem.time)}
        </Notice>
      ) : null}
      {problem?.problem === "order" ? <Notice tone="error">{t.server.endAfterStart}</Notice> : null}
      {result.ok && result.endedAt !== null && repeated.length > 0 ? (
        <p className="ds-type-meta">
          {t.field.willStore(
            moment(result.startedAt),
            moment(result.endedAt),
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
