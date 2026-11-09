import { Alert, buttonClass, Icon } from "design-system/react";
import type { ChangeEvent, ReactNode } from "react";
import type { Project } from "../../domain/project.ts";
import type { Stored } from "../api.ts";
import { useApp } from "../context.ts";

/** A message of the page in the design system's Alert, announced when it appears. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "error" | "ok";
  title?: string;
  children: ReactNode;
}) {
  const { language } = useApp();
  const alertTone = tone === "error" ? "danger" : tone === "ok" ? "success" : tone;
  return (
    <Alert
      tone={alertTone}
      title={title}
      live={tone === "error" ? "assertive" : "polite"}
      locale={language}
    >
      {children}
    </Alert>
  );
}

/** The name of a project and of its client. */
export function useNames() {
  const { catalog, t } = useApp();
  const projects = new Map(catalog.projects.map((row) => [row.id, row.value]));
  const clients = new Map(catalog.clients.map((row) => [row.id, row.value]));
  return {
    project: (id: string) => projects.get(id)?.name ?? id,
    client: (projectId: string) => {
      const owner = projects.get(projectId)?.client ?? null;
      return owner === null ? t.ownWork : (clients.get(owner)?.name ?? owner);
    },
  };
}

/**
 * The project of an entry, grouped by client. The design system's Select
 * takes a flat list, so this field is its markup (`ds-field`, `ds-select`)
 * with groups; `keep` stays offered even when it is archived.
 */
export function ProjectSelect({
  id,
  value,
  onChange,
  keep,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  keep?: string | null;
  placeholder?: string;
}) {
  const { catalog, t } = useApp();
  const open = (row: Stored<Project>) => !row.value.archived || row.id === keep;
  const groups = [
    ...catalog.clients.map((client) => ({
      label: client.value.name,
      projects: catalog.projects.filter((row) => row.value.client === client.id && open(row)),
    })),
    {
      label: t.ownWork,
      projects: catalog.projects.filter((row) => row.value.client === null && open(row)),
    },
  ].filter((group) => group.projects.length > 0);
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={id}>
        {t.field.project}
      </label>
      <div className="ds-select-wrap">
        <select
          className="ds-select"
          id={id}
          required
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        >
          {placeholder !== undefined ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.projects.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.value.name}
                  {row.value.archived ? t.dialog.archived : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <Icon name="nav-arrow-down" className="ds-select__chevron" />
      </div>
    </div>
  );
}

/** A number with its label in a card, as the design system's App screen shows them. */
export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="ds-card tt-stat">
      <span className="ds-type-meta">{label}</span>
      <span className="tt-stat__value">{value}</span>
      {note != null ? <span className="ds-type-meta">{note}</span> : null}
    </div>
  );
}

/**
 * A file to download that looks like the design system's button. Its Button
 * renders a link with `href` but does not take `download`, so this is the same
 * markup from the package's own `buttonClass` and `Icon`.
 */
export function DownloadButton({
  href,
  variant = "secondary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <a className={buttonClass({ variant })} href={href} download>
      <Icon name="download" />
      <span className="ds-button__label">{children}</span>
    </a>
  );
}
