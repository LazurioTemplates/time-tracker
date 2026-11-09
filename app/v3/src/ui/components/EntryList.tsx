import { Badge, Button, EmptyState } from "design-system/react";
import { durationMs, effective, entryDay, needsEndCheck } from "../../domain/time.ts";
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
  if (entries.length === 0) return <EmptyState title={empty} icon="clock" headingLevel={3} />;
  const days = new Map<string, StoredEntry[]>();
  for (const row of entries) {
    const day = entryDay(row.value, policy);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  return (
    <div className="tt-days">
      {[...days].map(([day, rows]) => (
        <section key={day} className="tt-day" aria-label={fmt.dayLong(day)}>
          <header className="tt-day__head">
            <h3 className="tt-day__title">{fmt.dayLong(day)}</h3>
            <span className="ds-numeric tt-day__total">
              {fmt.hours(rows.reduce((sum, row) => sum + durationMs(row.value, now, policy), 0))}
            </span>
          </header>
          <ul className="tt-entries">
            {rows.map((row) => {
              const value = effective(row.value, now, policy);
              const running = value.endedAt === null;
              return (
                <li key={row.id} className={`tt-entry${running ? " tt-entry--running" : ""}`}>
                  <span className="ds-numeric tt-entry__time">
                    {fmt.time(value.startedAt)}–
                    {running ? t.entry.now : fmt.time(value.endedAt ?? "")}
                  </span>
                  <span className="tt-entry__main">
                    <span className="tt-entry__project">
                      {names.project(value.project)}
                      <span className="tt-entry__client"> · {names.client(value.project)}</span>
                    </span>
                    {value.note ? (
                      <span className="ds-type-body-sm tt-entry__note">{value.note}</span>
                    ) : null}
                    <span className="tt-entry__badges">
                      {showPerson ? (
                        <span className="tt-entry__person">
                          {personLabel(t, value.person, value.personName)}
                        </span>
                      ) : null}
                      {running ? (
                        <Badge tone="accent" icon="clock">
                          {t.entry.running}
                        </Badge>
                      ) : null}
                      {needsEndCheck(row.value, now, policy) ? (
                        <Badge tone="warning">{t.entry.autoStopped}</Badge>
                      ) : null}
                      {row.pending ? (
                        <Badge icon={false}>
                          <span title={t.entry.pendingTitle}>{t.entry.pending}</span>
                        </Badge>
                      ) : null}
                      {value.source === "manual" ? (
                        <Badge icon={false}>{t.entry.manual}</Badge>
                      ) : null}
                    </span>
                  </span>
                  <span className="ds-numeric tt-entry__duration">
                    {fmt.hours(durationMs(value, now, policy))}
                  </span>
                  <Button
                    variant="quiet"
                    size="sm"
                    icon="edit-pencil"
                    onClick={() => onEdit(row)}
                    aria-label={t.entry.editLabel(
                      names.project(value.project),
                      fmt.time(value.startedAt),
                    )}
                  >
                    {t.entry.edit}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
