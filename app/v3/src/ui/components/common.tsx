import type { ReactNode } from "react";
import type { Project } from "../../domain/project.ts";
import type { Stored } from "../api.ts";
import { useApp } from "../context.ts";

/** A notice of the design system; `ok` and `info` are the App's own tones. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "error" | "ok";
  title?: string;
  children: ReactNode;
}) {
  const className =
    tone === "warning" || tone === "error" ? `notice notice-${tone}` : `notice tt-notice-${tone}`;
  return (
    <div className={className} role={tone === "error" ? "alert" : "status"}>
      <p>
        {title ? <strong>{title} </strong> : null}
        {children}
      </p>
    </div>
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

/** Projects people may record time on, by client; `keep` stays offered even if archived. */
export function ProjectOptions({ keep }: { keep?: string | null }) {
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
    <>
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
    </>
  );
}
