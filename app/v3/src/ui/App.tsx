import { Button, EmptyState } from "design-system/react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { localDay } from "../domain/calendar.ts";
import { type Language, messages } from "../language/messages.ts";
import {
  api,
  type Catalog,
  type KnownPerson,
  type Session,
  type StoredEntry,
  subscribe,
} from "./api.ts";
import { EntryDialog } from "./components/EntryDialog.tsx";
import { Layout } from "./components/Layout.tsx";
import { AppContext, type AppState, errorText, useApp } from "./context.ts";
import { formats } from "./format.ts";
import { DraftPage } from "./pages/DraftPage.tsx";
import { EntriesPage } from "./pages/EntriesPage.tsx";
import { ProjectsPage } from "./pages/ProjectsPage.tsx";
import { ReportPage } from "./pages/ReportPage.tsx";
import { TodayPage } from "./pages/TodayPage.tsx";
import { parseRoute, type Route } from "./routes.ts";
import { installTools, timeTrackerTools } from "./webmcp.ts";

function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}

export function App() {
  const route = useHashRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [people, setPeople] = useState<KnownPerson[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<StoredEntry | null>(null);
  // Until the server names the App's language, the page speaks the default.
  const language: Language = session?.language ?? "cs";
  const t = messages[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.appName;
  }, [language, t]);

  const load = useCallback(async () => {
    try {
      const next = await api.session();
      setOffset(next.now - Date.now());
      setSession((previous) => {
        // Another account signed in: forget what the previous one saw.
        if (previous && previous.viewer.person?.subject !== next.viewer.person?.subject)
          window.location.hash = "#/";
        return next;
      });
      if (next.viewer.role === null || !next.available.ok) {
        setCatalog(null);
        setError(null);
        return;
      }
      const [nextCatalog, nextPeople] = await Promise.all([api.catalog(), api.people()]);
      setCatalog(nextCatalog);
      setPeople(nextPeople.people);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, []);

  const changed = useCallback(async () => {
    await load();
    setVersion((value) => value + 1);
  }, [load]);

  useEffect(() => {
    void load();
    const stop = subscribe(() => void changed());
    const focus = () => void changed();
    window.addEventListener("focus", focus);
    return () => {
      stop();
      window.removeEventListener("focus", focus);
    };
  }, [load, changed]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);

  const state = useMemo<AppState | null>(() => {
    if (!session || !catalog) return null;
    const t = messages[session.language];
    return {
      session,
      catalog,
      people,
      now,
      today: localDay(now, session.policy.timeZone),
      version,
      changed,
      edit: setEditing,
      language: session.language,
      t,
      fmt: formats(session.policy.timeZone, t),
    };
  }, [session, catalog, people, now, version, changed]);

  // The main actions as WebMCP tools, in the App's language, once it is known.
  const toolLanguage = state ? state.language : null;
  const self = session?.viewer.person?.subject ?? null;
  useEffect(() => {
    if (!toolLanguage) return;
    return installTools(
      timeTrackerTools({ t: messages[toolLanguage], api, self, edit: setEditing, changed }),
    );
  }, [toolLanguage, self, changed]);

  if (error)
    return (
      <Blocked
        title={t.blocked.loadFailed}
        icon="warning-circle"
        actions={
          <Button variant="primary" onClick={() => void load()}>
            {t.blocked.retry}
          </Button>
        }
      >
        <p>{errorText(t, error)}</p>
      </Blocked>
    );
  if (!session) return <Blocked title={t.blocked.loading} icon="clock" />;
  if (session.viewer.role === null)
    return (
      <Blocked title={t.blocked.noRoleTitle} icon="lock">
        <p>{t.blocked.noRoleText}</p>
      </Blocked>
    );
  if (!session.available.ok)
    return (
      <Blocked title={t.blocked.noDataTitle} icon="folder">
        <p>{t.blocked.noDataText}</p>
        <p className="ds-type-meta">{session.available.message}</p>
      </Blocked>
    );
  if (!state) return <Blocked title={t.blocked.loading} icon="clock" />;
  return (
    <AppContext.Provider value={state}>
      <Layout route={route}>
        <Page route={route} />
      </Layout>
      {editing ? <EntryDialog entry={editing} onClose={() => setEditing(null)} /> : null}
    </AppContext.Provider>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "today":
      return <TodayPage />;
    case "entries":
      return <EntriesPage />;
    case "report":
      return <ReportPage period={route.period} day={route.day} />;
    case "projects":
      return <ProjectsPage />;
    case "draft":
      return <DraftPage />;
    case "not-found":
      return <NotFound />;
  }
}

function NotFound() {
  const { t } = useApp();
  return (
    <EmptyState
      title={t.blocked.notFound}
      icon="search"
      headingLevel={2}
      actions={<Button href="#/">{t.blocked.back}</Button>}
    />
  );
}

function Blocked({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon: "clock" | "lock" | "folder" | "warning-circle";
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="tt-blocked">
      <EmptyState title={title} icon={icon} headingLevel={2} actions={actions}>
        {children}
      </EmptyState>
    </main>
  );
}
