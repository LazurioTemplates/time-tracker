import type { Summary } from "../../domain/report.ts";
import { useApp } from "../context.ts";

/**
 * Hours per day of the period: one series in the accent colour, bars anchored
 * at the baseline with a rounded top, a tooltip on hover, and the same numbers
 * as a table below for the keyboard and screen readers. Days that are no
 * working days have a muted label.
 */
export function DayChart({ summary }: { summary: Summary }) {
  const { fmt, t } = useApp();
  const max = Math.max(8 * 3_600_000, ...summary.days.map((row) => row.ms));
  const week = summary.days.length <= 7;
  return (
    <figure className="tt-chart">
      <figcaption className="tt-card-title">{t.report.byDay}</figcaption>
      <div className={`tt-bars${week ? " tt-bars-week" : ""}`}>
        {summary.days.map((row) => {
          const label = `${fmt.dayShort(row.day)}: ${fmt.hours(row.ms)}`;
          return (
            <div key={row.day} className="tt-bar-column" role="img" aria-label={label}>
              <span className="tt-bar-tooltip" aria-hidden="true">
                {label}
              </span>
              <div className="tt-bar-track">
                {row.ms > 0 ? (
                  <div className="tt-bar" style={{ height: `${(row.ms / max) * 100}%` }} />
                ) : null}
              </div>
              {week ? (
                <span className="tt-bar-value">{row.ms > 0 ? fmt.hours(row.ms) : "–"}</span>
              ) : null}
              <span className={`tt-bar-label${row.workday ? "" : " tt-bar-label-off"}`}>
                {week ? fmt.weekday(row.day) : Number(row.day.slice(8))}
              </span>
            </div>
          );
        })}
      </div>
      <details className="tt-chart-table">
        <summary>{t.report.asTable}</summary>
        <table className="table table-compact">
          <thead>
            <tr>
              <th>{t.report.dayColumn}</th>
              <th className="num">{t.report.hoursColumn}</th>
            </tr>
          </thead>
          <tbody>
            {summary.days.map((row) => (
              <tr key={row.day}>
                <td data-label={t.report.dayColumn}>
                  {fmt.dayShort(row.day)}
                  {row.workday ? "" : t.report.dayOff}
                </td>
                <td className="num" data-label={t.report.hoursColumn}>
                  {fmt.hours(row.ms)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
