import { Button, TextField } from "design-system/react";
import { type FormEvent, useEffect, useState } from "react";
import { weekStart } from "../../domain/calendar.ts";
import { durationMs, effective, entryDay, needsEndCheck } from "../../domain/time.ts";
import { api, newId, type StoredEntry } from "../api.ts";
import { Notice, ProjectSelect, Stat, useNames } from "../components/common.tsx";
import { EntryList } from "../components/EntryList.tsx";
import { PageHeader } from "../components/Layout.tsx";
import { ManualEntry } from "../components/ManualEntry.tsx";
import { errorText, useApp } from "../context.ts";
import { stopwatch } from "../format.ts";

/** Today: the person's timer, time written by hand and this week's entries. */
export function TodayPage() {
  const { session, catalog, now, today, version, changed, edit, fmt, t, language } = useApp();
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
    <section className="tt-page">
      <PageHeader eyebrow={fmt.dayLong(today)} title={t.today.title} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {autoStopped.length > 0 ? (
        <Notice tone="warning" title={t.today.forgottenTitle}>
          {t.today.forgottenText(autoStopped.length, policy.timerLimitHours)}
        </Notice>
      ) : null}
      <div className="tt-today">
        <div className="tt-today__main">
          <div className={`ds-card tt-form tt-timer${running ? " tt-timer--running" : ""}`}>
            {!self ? (
              <>
                <h2 className="ds-type-title">{t.today.timer}</h2>
                <p className="ds-type-body-sm">{t.today.timerNoPerson}</p>
              </>
            ) : running ? (
              <>
                <p className="ds-type-meta tt-eyebrow">{t.today.measuring}</p>
                <h2 className="ds-type-title">
                  {names.project(running.value.project)}
                  <span className="tt-entry__client"> · {names.client(running.value.project)}</span>
                </h2>
                {running.value.note ? (
                  <p className="ds-type-body-sm">{running.value.note}</p>
                ) : null}
                <p className="ds-numeric tt-stopwatch" role="timer" aria-label={t.today.elapsed}>
                  {stopwatch(durationMs(running.value, now, policy))}
                </p>
                <p className="ds-type-meta">
                  {t.today.since(fmt.time(running.value.startedAt), policy.timerLimitHours)}
                </p>
                <Button
                  variant="primary"
                  block
                  icon="check"
                  busy={busy}
                  locale={language}
                  onClick={() => void run(() => api.stop(running.id, running.revision))}
                >
                  {t.today.stop}
                </Button>
              </>
            ) : (
              <form className="tt-form" onSubmit={start}>
                <h2 className="ds-type-title">{t.today.question}</h2>
                <ProjectSelect
                  id="timer-project"
                  value={chosen}
                  onChange={setProject}
                  {...(chosen ? {} : { placeholder: t.today.noProjects })}
                />
                <TextField
                  id="timer-note"
                  label={t.today.doing}
                  locale={language}
                  optional
                  maxLength={500}
                  placeholder={t.today.placeholder}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  block
                  icon="clock"
                  busy={busy}
                  locale={language}
                  disabled={!chosen}
                >
                  {t.today.start}
                </Button>
              </form>
            )}
          </div>
          <div className="tt-stats tt-stats--2">
            <Stat label={t.today.todayMetric} value={fmt.hours(todayMs)} />
            <Stat label={t.today.weekMetric} value={fmt.hours(weekMs)} />
          </div>
        </div>
        <ManualEntry defaultProject={defaultProject} />
      </div>
      <h2 className="ds-type-title tt-section">{self ? t.today.yourWeek : t.today.teamWeek}</h2>
      {entries === null ? (
        <p className="ds-type-meta">{t.loading}</p>
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
