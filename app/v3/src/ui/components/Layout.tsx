import { type ReactNode, useEffect, useState } from "react";
import { api } from "../api.ts";
import { useApp } from "../context.ts";
import { href, type Route } from "../routes.ts";

/**
 * The App frame of the design system: the navigation with the wordmark, the
 * sections and the Organization, and the main column. Below the tablet
 * breakpoint the sections fold behind "Menu".
 */
export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { session, version, t } = useApp();
  const admin = session.viewer.role === "admin";
  const [pending, setPending] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!admin || version < 0) return;
    api.draft().then(
      (card) => setPending(card.records?.length ?? card.status?.dirtyPaths.length ?? 0),
      () => setPending(null),
    );
  }, [admin, version]);

  const items: { label: string; route: Route; admin?: boolean }[] = [
    { label: t.nav.today, route: { page: "today" } },
    { label: t.nav.entries, route: { page: "entries" } },
    { label: t.nav.report, route: { page: "report", period: "week", day: null } },
    { label: t.nav.projects, route: { page: "projects" } },
    { label: t.nav.draft, route: { page: "draft" }, admin: true },
  ];
  const person = session.viewer.person;
  return (
    <>
      <a className="skip" href="#main-content">
        {t.nav.skip}
      </a>
      <div className="app tt-app">
        <nav className="app-nav" aria-label={t.nav.label}>
          <a className="wordmark" href="#/">
            {t.appName}
            <span className="signal-dot" aria-hidden="true" />
          </a>
          <button
            type="button"
            className="btn btn-ghost btn-compact menu-button"
            aria-expanded={open}
            aria-controls="app-sections"
            onClick={() => setOpen(!open)}
          >
            Menu
          </button>
          <ul id="app-sections" className={`collapsible${open ? " open" : ""}`}>
            {items
              .filter((item) => !item.admin || admin)
              .map((item) => {
                const active = item.route.page === route.page;
                return (
                  <li key={item.route.page}>
                    <a
                      className={active ? "active" : undefined}
                      href={href(item.route)}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                      {item.route.page === "draft" && pending ? (
                        <span className="badge badge-draft tt-nav-count" title={t.nav.pending}>
                          {pending}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
          </ul>
          <div className="app-org tt-account">
            <span className="tt-account-name">
              {person ? (person.username ?? t.account.noUsername) : t.account.inside}
            </span>
            <span>{session.viewer.role ? t.role[session.viewer.role] : ""}</span>
            <span>{session.organization}</span>
          </div>
        </nav>
        <main className="app-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </>
  );
}
