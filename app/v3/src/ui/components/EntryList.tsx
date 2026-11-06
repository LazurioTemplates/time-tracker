import { durationMs, effective, entryDay } from "../../domain/time.ts";
import type { StoredEntry } from "../api.ts";
import { personLabel, useApp } from "../context.ts";
import { useNames } from "./common.tsx";

/** Entries grouped by day, newest first; each opens the edit dialog. */
export function EntryList({
  entries,
  showPerson,
  onEdit,
  empty,
}: {
  entries: StoredEntry[];
  showPerson: boolean;
  onEdit: (entry: StoredEntry) => void;
  empty: string;
}) {
  const { session, now, fmt, t } = useApp();
  const names = useNames();
  const policy = session.policy;
  if (entries.length === 0) return <p className="tt-empty">{empty}</p>;
  const days = new Map<string, StoredEntry[]>();
  for (const row of entries) {
    const day = entryDay(row.value, policy);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  return (
    <div className="tt-days">
      {[...days].map(([day, rows]) => (
        <section key={day} className="tt-day" aria-label={fmt.dayLong(day)}>
          <header className="tt-day-head">
            <h3>{fmt.dayLong(day)}</h3>
            <span className="tt-day-total">
              {fmt.hours(rows.reduce((sum, row) => sum + durationMs(row.value, now, policy), 0))}
            </span>
          </header>
          <ul className="tt-entries">
            {rows.map((row) => {
              const value = effective(row.value, now, policy);
              const running = value.endedAt === null;
              return (
                <li key={row.id} className={`tt-entry${running ? " tt-entry-running" : ""}`}>
                  <span className="tt-entry-time">
                    {fmt.time(value.startedAt)}–
                    {running ? t.entry.now : fmt.time(value.endedAt ?? "")}
                  </span>
                  <span className="tt-entry-main">
                    <span className="tt-entry-project">
                      {names.project(value.project)}
                      <span className="tt-entry-client"> · {names.client(value.project)}</span>
                    </span>
                    {value.note ? <span className="tt-entry-note">{value.note}</span> : null}
                    <span className="tt-entry-badges">
                      {showPerson ? (
                        <span className="tt-entry-person">
                          {personLabel(t, value.person, value.personName)}
                        </span>
                      ) : null}
                      {running ? (
                        <span className="badge badge-running">{t.entry.running}</span>
                      ) : null}
                      {value.autoStoppedAt ? (
                        <span className="badge badge-hypothesis">{t.entry.autoStopped}</span>
                      ) : null}
                      {row.pending ? (
                        <span className="badge badge-draft" title={t.entry.pendingTitle}>
                          {t.entry.pending}
                        </span>
                      ) : null}
                      {value.source === "manual" ? (
                        <span className="badge badge-draft">{t.entry.manual}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tt-entry-duration">
                    {fmt.hours(durationMs(value, now, policy))}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => onEdit(row)}
                    aria-label={t.entry.editLabel(
                      names.project(value.project),
                      fmt.time(value.startedAt),
                    )}
                  >
                    {t.entry.edit}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
