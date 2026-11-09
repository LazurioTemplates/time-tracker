import { Select, TextField } from "design-system/react";
import { useEffect, useState } from "react";
import { monthStart } from "../../domain/calendar.ts";
import { durationMs } from "../../domain/time.ts";
import { api, type EntryFilter, type StoredEntry } from "../api.ts";
import { DownloadButton, Notice } from "../components/common.tsx";
import { EntryList } from "../components/EntryList.tsx";
import { PageHeader } from "../components/Layout.tsx";
import { errorText, personLabel, useApp } from "../context.ts";

/**
 * Every entry the person may see, filtered by period, person, client and
 * project, with the CSV exports of the same filter.
 */
export function EntriesPage() {
  const { session, catalog, people, now, today, version, edit, fmt, t, language } = useApp();
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
    <section className="tt-page">
      <PageHeader
        title={t.entries.title}
        description={admin ? t.entries.subtitleAdmin : t.entries.subtitleUser}
        actions={
          <>
            <DownloadButton href={api.exportUrl("entries", filter)}>
              {t.entries.exportEntries}
            </DownloadButton>
            <DownloadButton href={api.exportUrl("summary", filter)}>
              {t.entries.exportSummary}
            </DownloadButton>
          </>
        }
      />
      <div className="ds-card tt-filters">
        <TextField
          id="filter-from"
          type="date"
          label={t.field.from}
          locale={language}
          value={filter.from ?? ""}
          onChange={(e) => set("from", e.target.value)}
        />
        <TextField
          id="filter-to"
          type="date"
          label={t.field.to}
          locale={language}
          min={filter.from ?? undefined}
          value={filter.to ?? ""}
          onChange={(e) => set("to", e.target.value)}
        />
        {admin ? (
          <Select
            id="filter-person"
            label={t.entries.person}
            locale={language}
            value={filter.person ?? ""}
            onChange={(e) => set("person", e.target.value)}
            options={[
              { value: "", label: t.entries.everyone },
              ...people.map((row) => ({
                value: row.person,
                label: personLabel(t, row.person, row.name),
              })),
            ]}
          />
        ) : null}
        <Select
          id="filter-client"
          label={t.entries.client}
          locale={language}
          value={filter.client ?? ""}
          onChange={(e) => set("client", e.target.value)}
          options={[
            { value: "", label: t.entries.allClients },
            ...catalog.clients.map((row) => ({ value: row.id, label: row.value.name })),
            { value: "own", label: t.ownWork },
          ]}
        />
        <Select
          id="filter-project"
          label={t.entries.project}
          locale={language}
          value={filter.project ?? ""}
          onChange={(e) => set("project", e.target.value)}
          options={[
            { value: "", label: t.entries.allProjects },
            ...catalog.projects.map((row) => ({
              value: row.id,
              label: `${row.value.name}${row.value.archived ? t.dialog.archived : ""}`,
            })),
          ]}
        />
      </div>
      <p className="ds-type-body tt-total">
        {entries ? (
          <>
            <strong className="ds-numeric">{fmt.hours(total)}</strong> ·{" "}
            {t.entriesCount(entries.length)}
          </>
        ) : (
          t.loading
        )}
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {entries ? (
        <EntryList entries={entries} showPerson={admin} onEdit={edit} empty={t.entries.empty} />
      ) : null}
    </section>
  );
}
