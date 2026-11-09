import { Button, Nav, Select, Table } from "design-system/react";
import { useEffect, useState } from "react";
import { isoWeek } from "../../domain/calendar.ts";
import type { Period, Range } from "../../domain/report.ts";
import { api, type Report } from "../api.ts";
import { DownloadButton, Notice, Stat } from "../components/common.tsx";
import { DayChart } from "../components/DayChart.tsx";
import { PageHeader } from "../components/Layout.tsx";
import { errorText, personLabel, useApp } from "../context.ts";
import { href } from "../routes.ts";

/**
 * The week or the month: totals, hours per day, by project, by client and by
 * person, and the working days nobody recorded. An application user sees
 * their own; an application admin the whole team or one person.
 */
export function ReportPage({ period, day }: { period: Period; day: string | null }) {
  const { session, people, today, version, fmt, t, language } = useApp();
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
    <section className="tt-page">
      <PageHeader
        title={t.report.title}
        description={admin ? t.report.subtitleAdmin : t.report.subtitleUser}
        actions={
          filter ? (
            <>
              <DownloadButton href={api.exportUrl("entries", filter)}>
                {t.report.exportEntries}
              </DownloadButton>
              <DownloadButton variant="primary" href={api.exportUrl("summary", filter)}>
                {t.report.exportSummary}
              </DownloadButton>
            </>
          ) : null
        }
      />
      <div className="tt-toolbar">
        <Nav
          orientation="horizontal"
          label={t.report.period}
          items={(["week", "month"] as const).map((value) => ({
            href: href({ page: "report", period: value, day: anchor }),
            label: value === "week" ? t.report.week : t.report.month,
            current: value === period,
          }))}
        />
        {report ? (
          <div className="tt-stepper">
            <Button
              iconOnly
              icon="nav-arrow-left"
              label={t.report.previous}
              size="sm"
              href={href({ page: "report", period, day: report.previous.from })}
            />
            <strong className="ds-numeric tt-stepper__title">{title(report.range)}</strong>
            <Button
              iconOnly
              icon="nav-arrow-right"
              label={t.report.next}
              size="sm"
              href={href({ page: "report", period, day: report.next.from })}
            />
          </div>
        ) : null}
        {admin ? (
          <div className="tt-toolbar__end">
            <Select
              id="report-person"
              label={t.report.person}
              locale={language}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              options={[
                { value: "", label: t.report.team },
                ...people.map((row) => ({
                  value: row.person,
                  label: personLabel(t, row.person, row.name),
                })),
              ]}
            />
          </div>
        ) : null}
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {report && summary ? (
        <>
          <div className="tt-stats tt-stats--4">
            <Stat
              label={t.report.total}
              value={fmt.hours(summary.totalMs)}
              note={t.entriesCount(summary.entries)}
            />
            <Stat
              label={t.report.billable}
              value={fmt.hours(summary.billableMs)}
              note={
                summary.totalMs > 0
                  ? t.report.shareOfTime(fmt.percent(summary.billableMs / summary.totalMs))
                  : "–"
              }
            />
            <Stat label={t.ownWork} value={fmt.hours(summary.ownMs)} note={t.report.ownWorkSub} />
            <Stat
              label={t.report.missing}
              value={report.missing.reduce((sum, row) => sum + row.days.length, 0)}
              note={t.report.missingSub}
            />
          </div>
          <div className="ds-card">
            <DayChart summary={summary} />
          </div>
          <div className="tt-report-grid">
            <Table id="by-project" caption={t.report.byProject}>
              <thead>
                <tr>
                  <th scope="col">{t.report.projectColumn}</th>
                  <th scope="col">{t.report.clientColumn}</th>
                  <th scope="col" className="ds-table__num">
                    {t.report.hoursColumn}
                  </th>
                  <th scope="col" className="tt-share-head">
                    {t.report.shareColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.projects.length === 0 ? (
                  <tr>
                    <td colSpan={4}>{t.report.nothing}</td>
                  </tr>
                ) : null}
                {summary.projects.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.billable ? null : (
                        <span className="ds-type-meta tt-sub">{t.report.unbilled}</span>
                      )}
                    </td>
                    <td>{row.clientName}</td>
                    <td className="ds-table__num">{fmt.hours(row.ms)}</td>
                    <td>
                      <span className="tt-share">
                        <span
                          className="tt-share__bar"
                          style={{ width: `${share(row.ms) * 100}%` }}
                        />
                        <span className="ds-numeric ds-type-meta">
                          {fmt.percent(share(row.ms))} %
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Table id="by-client" caption={t.report.byClient}>
              <thead>
                <tr>
                  <th scope="col">{t.report.clientColumn}</th>
                  <th scope="col" className="ds-table__num">
                    {t.report.total}
                  </th>
                  <th scope="col" className="ds-table__num">
                    {t.report.billable}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.clients.map((row) => (
                  <tr key={row.id ?? "own"}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td className="ds-table__num">{fmt.hours(row.ms)}</td>
                    <td className="ds-table__num">{fmt.hours(row.billableMs)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {admin && !person ? (
              <Table id="by-person" caption={t.report.byPerson}>
                <thead>
                  <tr>
                    <th scope="col">{t.report.personColumn}</th>
                    <th scope="col" className="ds-table__num">
                      {t.report.total}
                    </th>
                    <th scope="col" className="ds-table__num">
                      {t.report.billable}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.people.map((row) => (
                    <tr key={row.person}>
                      <td>
                        <strong>{personLabel(t, row.person, row.name)}</strong>
                      </td>
                      <td className="ds-table__num">{fmt.hours(row.ms)}</td>
                      <td className="ds-table__num">{fmt.hours(row.billableMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
            <div className="ds-card tt-form">
              <h2 className="ds-type-title">{t.report.missingTitle}</h2>
              {report.missing.length === 0 ? (
                <p className="ds-type-body-sm tt-ok">{t.report.missingNone}</p>
              ) : (
                <ul className="tt-missing">
                  {report.missing.map((row) => (
                    <li key={row.person}>
                      <strong>{personLabel(t, row.person, row.name)}</strong>
                      <span className="ds-type-body-sm">
                        {row.days.map((value) => fmt.dayShort(value)).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ds-type-meta">{t.report.missingNote}</p>
            </div>
          </div>
        </>
      ) : (
        !error && <p className="ds-type-meta">{t.loading}</p>
      )}
    </section>
  );
}
