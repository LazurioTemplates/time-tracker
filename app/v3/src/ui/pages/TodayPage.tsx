import { type FormEvent, useEffect, useState } from "react";
import { weekStart } from "../../domain/calendar.ts";
import { durationMs, effective, entryDay, needsEndCheck } from "../../domain/time.ts";
import { api, newId, type StoredEntry } from "../api.ts";
import { Notice, ProjectOptions, useNames } from "../components/common.tsx";
import { EntryList } from "../components/EntryList.tsx";
import { ManualEntry } from "../components/ManualEntry.tsx";
import { errorText, useApp } from "../context.ts";
import { stopwatch } from "../format.ts";

/** Today: the person's timer, time written by hand and this week's entries. */
export function TodayPage() {
  const { session, catalog, now, today, version, changed, edit, fmt, t } = useApp();
  const policy = session.policy;
  const self = session.viewer.person;
  const names = useNames();
  const [entries, setEntries] = useState<StoredEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const from = weekStart(today);

  useEffect(() => {
    if (version < 0) return;
    api.entries({ from, to: today, person: self?.subject ?? null }).then(
      (data) => {
        setEntries(data.entries);
        setError(null);
      },
      (caught: unknown) => setError(errorText(t, caught)),
    );
  }, [from, today, self?.subject, version, t]);

  const own = (entries ?? []).filter((row) => !self || row.value.person === self.subject);
  const running = own.find((row) => effective(row.value, now, policy).endedAt === null) ?? null;
  const open = catalog.projects.filter((row) => !row.value.archived);
  const lastProject = own[0]?.value.project ?? "";
  const defaultProject = open.find((row) => row.id === lastProject)?.id ?? open[0]?.id ?? "";
  const chosen = project || defaultProject;
  const todayMs = own
    .filter((row) => entryDay(row.value, policy) === today)
    .reduce((sum, row) => sum + durationMs(row.value, now, policy), 0);
  const weekMs = own.reduce((sum, row) => sum + durationMs(row.value, now, policy), 0);
  const autoStopped = own.filter((row) => needsEndCheck(row.value, now, policy));

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await changed();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.start({ id: newId(), project: chosen, note });
      setNote("");
    });
  };

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="eyebrow">{fmt.dayLong(today)}</p>
          <h1>{t.today.title}</h1>
        </div>
      </header>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {autoStopped.length > 0 ? (
        <Notice tone="warning" title={t.today.forgottenTitle}>
          {t.today.forgottenText(autoStopped.length, policy.timerLimitHours)}
        </Notice>
      ) : null}
      <div className="tt-today">
        <div className="tt-today-main">
          <div className={`card tt-timer${running ? " tt-timer-running" : ""}`}>
            {!self ? (
              <>
                <h2 className="tt-card-title">{t.today.timer}</h2>
                <p className="tt-muted">{t.today.timerNoPerson}</p>
              </>
            ) : running ? (
              <>
                <p className="eyebrow">{t.today.measuring}</p>
                <h2 className="tt-card-title">
                  {names.project(running.value.project)}
                  <span className="tt-entry-client"> · {names.client(running.value.project)}</span>
                </h2>
                {running.value.note ? <p className="tt-muted">{running.value.note}</p> : null}
                <p className="tt-stopwatch" role="timer" aria-label={t.today.elapsed}>
                  {stopwatch(durationMs(running.value, now, policy))}
                </p>
                <p className="tt-muted">
                  {t.today.since(fmt.time(running.value.startedAt), policy.timerLimitHours)}
                </p>
                <button
                  type="button"
                  className="btn btn-primary tt-wide"
                  disabled={busy}
                  onClick={() => void run(() => api.stop(running.id, running.revision))}
                >
                  {busy ? t.saving : t.today.stop}
                </button>
              </>
            ) : (
              <form onSubmit={start}>
                <h2 className="tt-card-title">{t.today.question}</h2>
                <div className="field">
                  <label htmlFor="timer-project">{t.today.project}</label>
                  <select
                    id="timer-project"
                    required
                    value={chosen}
                    onChange={(e) => setProject(e.target.value)}
                  >
                    {chosen ? null : <option value="">{t.today.noProjects}</option>}
                    <ProjectOptions />
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="timer-note">
                    {t.today.doing} <span className="optional">{t.field.optional}</span>
                  </label>
                  <input
                    id="timer-note"
                    maxLength={500}
                    placeholder={t.today.placeholder}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary tt-wide"
                  disabled={busy || !chosen}
                >
                  {busy ? t.today.starting : t.today.start}
                </button>
              </form>
            )}
          </div>
          <div className="tt-metrics">
            <div className="card tt-metric">
              <span className="eyebrow">{t.today.todayMetric}</span>
              <p className="metric">{fmt.hours(todayMs)}</p>
            </div>
            <div className="card tt-metric">
              <span className="eyebrow">{t.today.weekMetric}</span>
              <p className="metric">{fmt.hours(weekMs)}</p>
            </div>
          </div>
        </div>
        <ManualEntry defaultProject={defaultProject} />
      </div>
      <h2 className="tt-section-title">{self ? t.today.yourWeek : t.today.teamWeek}</h2>
      {entries === null ? (
        <p className="tt-muted">{t.loading}</p>
      ) : (
        <EntryList
          entries={self ? own : entries}
          showPerson={!self}
          onEdit={edit}
          empty={t.today.emptyWeek}
        />
      )}
    </section>
  );
}
