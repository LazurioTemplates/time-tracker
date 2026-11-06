import { useEffect, useState } from "react";
import { isoWeek } from "../../domain/calendar.ts";
import type { Period, Range } from "../../domain/report.ts";
import { api, type Report } from "../api.ts";
import { Notice } from "../components/common.tsx";
import { DayChart } from "../components/DayChart.tsx";
import { errorText, personLabel, useApp } from "../context.ts";
import { href } from "../routes.ts";

/**
 * The week or the month: totals, hours per day, by project, by client and by
 * person, and the working days nobody recorded. An application user sees
 * their own; an application admin the whole team or one person.
 */
export function ReportPage({ period, day }: { period: Period; day: string | null }) {
  const { session, people, today, version, fmt, t } = useApp();
  const admin = session.viewer.role === "admin";
  const [person, setPerson] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anchor = day ?? today;

  useEffect(() => {
    if (version < 0) return;
    api.report(period, anchor, person || null).then(
      (data) => {
        setReport(data);
        setError(null);
      },
      (caught: unknown) => setError(errorText(t, caught)),
    );
  }, [period, anchor, person, version, t]);

  const title = (range: Range) =>
    period === "week"
      ? t.report.weekTitle(isoWeek(range.from), fmt.date(range.from), fmt.date(range.to))
      : fmt.month(range.from);
  const summary = report?.summary;
  const filter = report
    ? { from: report.range.from, to: report.range.to, person: person || null }
    : null;
  const share = (ms: number) => (summary && summary.totalMs > 0 ? ms / summary.totalMs : 0);

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>{t.report.title}</h1>
          <p>{admin ? t.report.subtitleAdmin : t.report.subtitleUser}</p>
        </div>
      </header>
      <div className="toolbar">
        <nav className="tt-segmented" aria-label={t.report.period}>
          {(["week", "month"] as const).map((value) => (
            <a
              key={value}
              className={`tt-segment${value === period ? " active" : ""}`}
              href={href({ page: "report", period: value, day: anchor })}
              aria-current={value === period ? "true" : undefined}
            >
              {value === "week" ? t.report.week : t.report.month}
            </a>
          ))}
        </nav>
        {report ? (
          <div className="tt-stepper">
            <a
              className="btn btn-compact"
              href={href({ page: "report", period, day: report.previous.from })}
              aria-label={t.report.previous}
            >
              ←
            </a>
            <strong className="tt-period">{title(report.range)}</strong>
            <a
              className="btn btn-compact"
              href={href({ page: "report", period, day: report.next.from })}
              aria-label={t.report.next}
            >
              →
            </a>
          </div>
        ) : null}
        <span className="tt-grow" />
        {admin ? (
          <div className="field tt-inline-field">
            <label htmlFor="report-person">{t.report.person}</label>
            <select id="report-person" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">{t.report.team}</option>
              {people.map((row) => (
                <option key={row.person} value={row.person}>
                  {personLabel(t, row.person, row.name)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {report && summary && filter ? (
        <>
          <div className="tt-metrics tt-metrics-4">
            <div className="card tt-metric">
              <span className="eyebrow">{t.report.total}</span>
              <p className="metric">{fmt.hours(summary.totalMs)}</p>
              <span className="tt-muted">{t.entriesCount(summary.entries)}</span>
            </div>
            <div className="card tt-metric">
              <span className="eyebrow">{t.report.billable}</span>
              <p className="metric">{fmt.hours(summary.billableMs)}</p>
              <span className="tt-muted">
                {summary.totalMs > 0
                  ? t.report.shareOfTime(fmt.percent(summary.billableMs / summary.totalMs))
                  : "–"}
              </span>
            </div>
            <div className="card tt-metric">
              <span className="eyebrow">{t.ownWork}</span>
              <p className="metric">{fmt.hours(summary.totalMs - summary.billableMs)}</p>
              <span className="tt-muted">{t.report.unbilled}</span>
            </div>
            <div className="card tt-metric">
              <span className="eyebrow">{t.report.missing}</span>
              <p className="metric">
                {report.missing.reduce((sum, row) => sum + row.days.length, 0)}
              </p>
              <span className="tt-muted">{t.report.missingSub}</span>
            </div>
          </div>
          <div className="card">
            <DayChart summary={summary} />
          </div>
          <div className="tt-report-grid">
            <div className="table-wrap">
              <table className="table">
                <caption>{t.report.byProject}</caption>
                <thead>
                  <tr>
                    <th>{t.report.projectColumn}</th>
                    <th>{t.report.clientColumn}</th>
                    <th className="num">{t.report.hoursColumn}</th>
                    <th className="tt-share-head">{t.report.shareColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.projects.map((row) => (
                    <tr key={row.id}>
                      <td className="row-name" data-label={t.report.projectColumn}>
                        {row.name}
                        {row.billable ? null : <span className="sub">{t.report.unbilled}</span>}
                      </td>
                      <td data-label={t.report.clientColumn}>{row.clientName}</td>
                      <td className="num" data-label={t.report.hoursColumn}>
                        {fmt.hours(row.ms)}
                      </td>
                      <td className="tt-share" data-label={t.report.shareColumn}>
                        <span
                          className="tt-share-bar"
                          style={{ width: `${share(row.ms) * 100}%` }}
                        />
                        <span className="tt-share-value">{fmt.percent(share(row.ms))} %</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.projects.length === 0 ? (
                <p className="tt-empty tt-pad">{t.report.nothing}</p>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption>{t.report.byClient}</caption>
                <thead>
                  <tr>
                    <th>{t.report.clientColumn}</th>
                    <th className="num">{t.report.total}</th>
                    <th className="num">{t.report.billable}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.clients.map((row) => (
                    <tr key={row.id ?? "own"}>
                      <td className="row-name" data-label={t.report.clientColumn}>
                        {row.name}
                      </td>
                      <td className="num" data-label={t.report.total}>
                        {fmt.hours(row.ms)}
                      </td>
                      <td className="num" data-label={t.report.billable}>
                        {fmt.hours(row.billableMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {admin && !person ? (
              <div className="table-wrap">
                <table className="table">
                  <caption>{t.report.byPerson}</caption>
                  <thead>
                    <tr>
                      <th>{t.report.personColumn}</th>
                      <th className="num">{t.report.total}</th>
                      <th className="num">{t.report.billable}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.people.map((row) => (
                      <tr key={row.person}>
                        <td className="row-name" data-label={t.report.personColumn}>
                          {personLabel(t, row.person, row.name)}
                        </td>
                        <td className="num" data-label={t.report.total}>
                          {fmt.hours(row.ms)}
                        </td>
                        <td className="num" data-label={t.report.billable}>
                          {fmt.hours(row.billableMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="card">
              <h2 className="tt-card-title">{t.report.missingTitle}</h2>
              {report.missing.length === 0 ? (
                <p className="tt-ok">{t.report.missingNone}</p>
              ) : (
                <ul className="tt-missing">
                  {report.missing.map((row) => (
                    <li key={row.person}>
                      <strong>{personLabel(t, row.person, row.name)}</strong>
                      <span>{row.days.map((value) => fmt.dayShort(value)).join(", ")}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="tt-muted tt-small">{t.report.missingNote}</p>
            </div>
          </div>
          <div className="toolbar tt-exports">
            <span className="tt-grow" />
            <a className="btn btn-compact" href={api.exportUrl("entries", filter)} download>
              {t.report.exportEntries}
            </a>
            <a
              className="btn btn-primary btn-compact"
              href={api.exportUrl("summary", filter)}
              download
            >
              {t.report.exportSummary}
            </a>
          </div>
        </>
      ) : (
        !error && <p className="tt-muted">{t.loading}</p>
      )}
    </section>
  );
}
