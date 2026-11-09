import { Logo, Nav } from "design-system/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../api.ts";
import { useApp } from "../context.ts";
import { href, type Route } from "../routes.ts";

/**
 * The App's frame: the Organization's logo and the App's name, the design
 * system's Nav with the current page, who is signed in, and the main column.
 * On a phone the side becomes a bar above the page.
 */
export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { session, version, t } = useApp();
  const admin = session.viewer.role === "admin";
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!admin || version < 0) return;
    api.draft().then(
      (card) => setPending(card.records?.length ?? card.status?.dirtyPaths.length ?? 0),
      () => setPending(null),
    );
  }, [admin, version]);

  const items: {
    label: string;
    route: Route;
    icon: "clock" | "list" | "calendar" | "folder" | "upload";
    admin?: boolean;
  }[] = [
    { label: t.nav.today, route: { page: "today" }, icon: "clock" },
    { label: t.nav.entries, route: { page: "entries" }, icon: "list" },
    { label: t.nav.report, route: { page: "report", period: "week", day: null }, icon: "calendar" },
    { label: t.nav.projects, route: { page: "projects" }, icon: "folder" },
    { label: t.nav.draft, route: { page: "draft" }, icon: "upload", admin: true },
  ];
  const person = session.viewer.person;
  return (
    <>
      <a className="ds-skip-link" href="#main-content">
        {t.nav.skip}
      </a>
      <div className="tt-frame">
        <div className="tt-side">
          <a className="tt-brand" href="#/">
            <Logo size="sm" wordmark={false} />
            <span className="tt-brand__name">{t.appName}</span>
          </a>
          <Nav
            label={t.nav.label}
            items={items
              .filter((item) => !item.admin || admin)
              .map((item) => ({
                href: href(item.route),
                label: item.label,
                icon: item.icon,
                current: item.route.page === route.page,
                ...(item.route.page === "draft" && pending ? { badge: String(pending) } : {}),
              }))}
          />
          <div className="tt-account">
            <span className="tt-account__name">
              {person ? (person.username ?? t.account.noUsername) : t.account.inside}
            </span>
            <span className="ds-type-meta">
              {session.viewer.role ? t.role[session.viewer.role] : ""}
            </span>
            <span className="ds-type-meta">{session.organization}</span>
          </div>
        </div>
        <main className="tt-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </>
  );
}

/** A page's heading: an eyebrow, the title, a line under it and its actions. */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="tt-page-head">
      <div className="tt-page-head__text">
        {eyebrow ? <p className="ds-type-meta tt-eyebrow">{eyebrow}</p> : null}
        <h1 className="ds-type-display">{title}</h1>
        {description ? <p className="ds-type-lead">{description}</p> : null}
      </div>
      {actions != null ? <div className="tt-page-head__tools">{actions}</div> : null}
    </header>
  );
}
