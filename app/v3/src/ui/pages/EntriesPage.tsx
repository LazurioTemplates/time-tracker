import { useEffect, useState } from "react";
import { monthStart } from "../../domain/calendar.ts";
import { durationMs } from "../../domain/time.ts";
import { api, type EntryFilter, type StoredEntry } from "../api.ts";
import { Notice } from "../components/common.tsx";
import { EntryList } from "../components/EntryList.tsx";
import { errorText, personLabel, useApp } from "../context.ts";

/**
 * Every entry the person may see, filtered by period, person, client and
 * project, with the CSV exports of the same filter.
 */
export function EntriesPage() {
  const { session, catalog, people, now, today, version, edit, fmt, t } = useApp();
  const admin = session.viewer.role === "admin";
  const [filter, setFilter] = useState<Required<EntryFilter>>({
    from: monthStart(today),
    to: today,
    person: null,
    client: null,
    project: null,
  });
  const [entries, setEntries] = useState<StoredEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (version < 0) return;
    api.entries(filter).then(
      (data) => {
        setEntries(data.entries);
        setError(null);
      },
      (caught: unknown) => setError(errorText(t, caught)),
    );
  }, [filter, version, t]);

  const set = (key: keyof EntryFilter, value: string) =>
    setFilter((current) => ({ ...current, [key]: value || null }));
  const total = (entries ?? []).reduce(
    (sum, row) => sum + durationMs(row.value, now, session.policy),
    0,
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>{t.entries.title}</h1>
          <p>{admin ? t.entries.subtitleAdmin : t.entries.subtitleUser}</p>
        </div>
      </header>
      <div className="card tt-filters">
        <div className="field">
          <label htmlFor="filter-from">{t.field.from}</label>
          <input
            id="filter-from"
            type="date"
            value={filter.from ?? ""}
            onChange={(e) => set("from", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-to">{t.field.to}</label>
          <input
            id="filter-to"
            type="date"
            min={filter.from ?? undefined}
            value={filter.to ?? ""}
            onChange={(e) => set("to", e.target.value)}
          />
        </div>
        {admin ? (
          <div className="field">
            <label htmlFor="filter-person">{t.entries.person}</label>
            <select
              id="filter-person"
              value={filter.person ?? ""}
              onChange={(e) => set("person", e.target.value)}
            >
              <option value="">{t.entries.everyone}</option>
              {people.map((row) => (
                <option key={row.person} value={row.person}>
                  {personLabel(t, row.person, row.name)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="filter-client">{t.entries.client}</label>
          <select
            id="filter-client"
            value={filter.client ?? ""}
            onChange={(e) => set("client", e.target.value)}
          >
            <option value="">{t.entries.allClients}</option>
            {catalog.clients.map((row) => (
              <option key={row.id} value={row.id}>
                {row.value.name}
              </option>
            ))}
            <option value="own">{t.ownWork}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-project">{t.entries.project}</label>
          <select
            id="filter-project"
            value={filter.project ?? ""}
            onChange={(e) => set("project", e.target.value)}
          >
            <option value="">{t.entries.allProjects}</option>
            {catalog.projects.map((row) => (
              <option key={row.id} value={row.id}>
                {row.value.name}
                {row.value.archived ? t.dialog.archived : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="toolbar">
        <p className="tt-total">
          {entries ? (
            <>
              <strong>{fmt.hours(total)}</strong> · {t.entriesCount(entries.length)}
            </>
          ) : (
            t.loading
          )}
        </p>
        <span className="tt-grow" />
        <a className="btn btn-compact" href={api.exportUrl("entries", filter)} download>
          {t.entries.exportEntries}
        </a>
        <a className="btn btn-compact" href={api.exportUrl("summary", filter)} download>
          {t.entries.exportSummary}
        </a>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {entries ? (
        <EntryList entries={entries} showPerson={admin} onEdit={edit} empty={t.entries.empty} />
      ) : null}
    </section>
  );
}
