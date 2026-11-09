import { Badge, Button, Checkbox, EmptyState, Select, Table, TextField } from "design-system/react";
import { type FormEvent, useState } from "react";
import type { Client } from "../../domain/client.ts";
import type { Project } from "../../domain/project.ts";
import { api, type Stored } from "../api.ts";
import { Notice } from "../components/common.tsx";
import { PageHeader } from "../components/Layout.tsx";
import { errorText, useApp } from "../context.ts";

/** Projects and clients: everyone reads them, the application admin keeps them. */
export function ProjectsPage() {
  const { session, catalog, changed, t, language } = useApp();
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
      <Badge icon={false}>{t.projects.archived}</Badge>
    ) : (
      <Badge tone="success">{t.projects.active}</Badge>
    );
  const actions = (archived: boolean, onRename: () => void, onToggle: () => void) => (
    <td className="ds-table__num ds-table__nowrap">
      <Button variant="quiet" size="sm" icon="edit-pencil" disabled={busy} onClick={onRename}>
        {t.projects.rename}
      </Button>
      <Button variant="quiet" size="sm" disabled={busy} onClick={onToggle}>
        {archived ? t.projects.restore : t.projects.archive}
      </Button>
    </td>
  );

  return (
    <section className="tt-page">
      <PageHeader
        title={t.projects.title}
        description={admin ? t.projects.subtitleAdmin : t.projects.subtitleUser}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {catalog.projects.length === 0 ? (
        <EmptyState
          title={admin ? t.projects.emptyAdmin : t.projects.emptyUser}
          icon="folder"
          headingLevel={2}
        />
      ) : (
        <Table id="projects" caption={t.projects.projects}>
          <thead>
            <tr>
              <th scope="col">{t.projects.project}</th>
              <th scope="col">{t.projects.client}</th>
              <th scope="col">{t.projects.billable}</th>
              <th scope="col">{t.projects.state}</th>
              {admin ? (
                <th scope="col" className="ds-table__num">
                  {t.projects.actions}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {catalog.projects.map((row: Stored<Project>) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.value.name}</strong>
                </td>
                <td>
                  {row.value.client === null
                    ? t.ownWork
                    : (clientNames.get(row.value.client) ?? row.value.client)}
                </td>
                <td>{row.value.billable ? t.yes : t.no}</td>
                <td>{state(row.value.archived)}</td>
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
        </Table>
      )}
      {admin ? (
        <form className="ds-card tt-form" onSubmit={addProject}>
          <h2 className="ds-type-title">{t.projects.newProject}</h2>
          <div className="tt-row tt-row--wide">
            <TextField
              id="project-name"
              label={t.projects.name}
              locale={language}
              required
              maxLength={120}
              value={project.name}
              onChange={(e) => setProject({ ...project, name: e.target.value })}
            />
            <Select
              id="project-client"
              label={t.projects.client}
              locale={language}
              value={project.client}
              onChange={(e) => setProject({ ...project, client: e.target.value })}
              options={[
                { value: "", label: t.ownWork },
                ...catalog.clients
                  .filter((row) => !row.value.archived)
                  .map((row) => ({ value: row.id, label: row.value.name })),
              ]}
            />
          </div>
          <Checkbox
            id="project-billable"
            label={t.projects.billableCheck}
            checked={project.billable}
            onChange={(e) => setProject({ ...project, billable: e.target.checked })}
          />
          <div className="tt-actions">
            <Button type="submit" variant="primary" icon="plus" busy={busy} locale={language}>
              {t.projects.createProject}
            </Button>
          </div>
        </form>
      ) : null}
      <Table id="clients" caption={t.projects.clients}>
        <thead>
          <tr>
            <th scope="col">{t.projects.client}</th>
            <th scope="col" className="ds-table__num">
              {t.projects.count}
            </th>
            <th scope="col">{t.projects.state}</th>
            {admin ? (
              <th scope="col" className="ds-table__num">
                {t.projects.actions}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {catalog.clients.map((row: Stored<Client>) => (
            <tr key={row.id}>
              <td>
                <strong>{row.value.name}</strong>
              </td>
              <td className="ds-table__num">
                {catalog.projects.filter((item) => item.value.client === row.id).length}
              </td>
              <td>{state(row.value.archived)}</td>
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
      </Table>
      {admin ? (
        <form className="ds-card tt-form" onSubmit={addClient}>
          <h2 className="ds-type-title">{t.projects.newClient}</h2>
          <TextField
            id="client-name"
            label={t.projects.name}
            locale={language}
            required
            maxLength={120}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
          <div className="tt-actions">
            <Button type="submit" icon="plus" busy={busy} locale={language}>
              {t.projects.addClient}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
