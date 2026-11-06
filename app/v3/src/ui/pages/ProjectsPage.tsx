import { type FormEvent, useState } from "react";
import type { Client } from "../../domain/client.ts";
import type { Project } from "../../domain/project.ts";
import { api, type Stored } from "../api.ts";
import { Notice } from "../components/common.tsx";
import { errorText, useApp } from "../context.ts";

/** Projects and clients: everyone reads them, the application admin keeps them. */
export function ProjectsPage() {
  const { session, catalog, changed, t } = useApp();
  const admin = session.viewer.role === "admin";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState({ name: "", client: "", billable: true });
  const [clientName, setClientName] = useState("");
  const clientNames = new Map(catalog.clients.map((row) => [row.id, row.value.name]));

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
      await changed();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  };
  const addProject = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () =>
        api.addProject({
          name: project.name,
          client: project.client || null,
          billable: project.billable,
        }),
      () => setProject({ ...project, name: "" }),
    );
  };
  const addClient = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () => api.addClient(clientName),
      () => setClientName(""),
    );
  };
  const rename = <T extends { name: string }>(
    row: Stored<T>,
    save: (value: T) => Promise<unknown>,
  ) => {
    const name = window.prompt(t.projects.newName, row.value.name)?.trim();
    if (name && name !== row.value.name) void run(() => save({ ...row.value, name }));
  };
  const state = (archived: boolean) =>
    archived ? (
      <span className="badge badge-draft">{t.projects.archived}</span>
    ) : (
      <span className="badge badge-verified">{t.projects.active}</span>
    );
  const actions = (archived: boolean, onRename: () => void, onToggle: () => void) => (
    <td className="num" data-label={t.projects.actions}>
      <button
        type="button"
        className="btn btn-ghost btn-compact"
        disabled={busy}
        onClick={onRename}
      >
        {t.projects.rename}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-compact"
        disabled={busy}
        onClick={onToggle}
      >
        {archived ? t.projects.restore : t.projects.archive}
      </button>
    </td>
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>{t.projects.title}</h1>
          <p>{admin ? t.projects.subtitleAdmin : t.projects.subtitleUser}</p>
        </div>
      </header>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="table-wrap tt-block">
        <table className="table">
          <caption>{t.projects.projects}</caption>
          <thead>
            <tr>
              <th>{t.projects.project}</th>
              <th>{t.projects.client}</th>
              <th>{t.projects.billable}</th>
              <th>{t.projects.state}</th>
              {admin ? <th className="num">{t.projects.actions}</th> : null}
            </tr>
          </thead>
          <tbody>
            {catalog.projects.map((row: Stored<Project>) => (
              <tr key={row.id}>
                <td className="row-name" data-label={t.projects.project}>
                  {row.value.name}
                </td>
                <td data-label={t.projects.client}>
                  {row.value.client === null
                    ? t.ownWork
                    : (clientNames.get(row.value.client) ?? row.value.client)}
                </td>
                <td data-label={t.projects.billable}>{row.value.billable ? t.yes : t.no}</td>
                <td data-label={t.projects.state}>{state(row.value.archived)}</td>
                {admin
                  ? actions(
                      row.value.archived,
                      () => rename(row, (value) => api.saveProject(row.id, value, row.revision)),
                      () =>
                        void run(() =>
                          api.saveProject(
                            row.id,
                            { ...row.value, archived: !row.value.archived },
                            row.revision,
                          ),
                        ),
                    )
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
        {catalog.projects.length === 0 ? (
          <p className="tt-empty tt-pad">{admin ? t.projects.emptyAdmin : t.projects.emptyUser}</p>
        ) : null}
      </div>
      {admin ? (
        <form className="card tt-block" onSubmit={addProject}>
          <h2 className="tt-card-title">{t.projects.newProject}</h2>
          <div className="tt-field-row">
            <div className="field tt-span-2">
              <label htmlFor="project-name">{t.projects.name}</label>
              <input
                id="project-name"
                required
                maxLength={120}
                value={project.name}
                onChange={(e) => setProject({ ...project, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="project-client">{t.projects.client}</label>
              <select
                id="project-client"
                value={project.client}
                onChange={(e) => setProject({ ...project, client: e.target.value })}
              >
                <option value="">{t.ownWork}</option>
                {catalog.clients
                  .filter((row) => !row.value.archived)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.value.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <label className="tt-check">
            <input
              type="checkbox"
              checked={project.billable}
              onChange={(e) => setProject({ ...project, billable: e.target.checked })}
            />
            {t.projects.billableCheck}
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t.projects.createProject}
          </button>
        </form>
      ) : null}
      <div className="table-wrap tt-block">
        <table className="table">
          <caption>{t.projects.clients}</caption>
          <thead>
            <tr>
              <th>{t.projects.client}</th>
              <th className="num">{t.projects.count}</th>
              <th>{t.projects.state}</th>
              {admin ? <th className="num">{t.projects.actions}</th> : null}
            </tr>
          </thead>
          <tbody>
            {catalog.clients.map((row: Stored<Client>) => (
              <tr key={row.id}>
                <td className="row-name" data-label={t.projects.client}>
                  {row.value.name}
                </td>
                <td className="num" data-label={t.projects.count}>
                  {catalog.projects.filter((item) => item.value.client === row.id).length}
                </td>
                <td data-label={t.projects.state}>{state(row.value.archived)}</td>
                {admin
                  ? actions(
                      row.value.archived,
                      () => rename(row, (value) => api.saveClient(row.id, value, row.revision)),
                      () =>
                        void run(() =>
                          api.saveClient(
                            row.id,
                            { ...row.value, archived: !row.value.archived },
                            row.revision,
                          ),
                        ),
                    )
                  : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin ? (
        <form className="card tt-block" onSubmit={addClient}>
          <h2 className="tt-card-title">{t.projects.newClient}</h2>
          <div className="field">
            <label htmlFor="client-name">{t.projects.name}</label>
            <input
              id="client-name"
              required
              maxLength={120}
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={busy}>
            {t.projects.addClient}
          </button>
        </form>
      ) : null}
    </section>
  );
}
